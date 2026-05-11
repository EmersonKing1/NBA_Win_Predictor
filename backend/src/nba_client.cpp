#include <nlohmann/json.hpp>
#include <cpr/cpr.h>
#include "nba_client.h"
#include <iostream>
#include <chrono>
#include <ctime>
#include <sstream>
#include <iomanip>

using json = nlohmann::json;

// Returns "YYYYMMDD" for today - offsetDays
static std::string dateOffset(int offsetDays) {
    auto now = std::chrono::system_clock::now();
    std::time_t t = std::chrono::system_clock::to_time_t(now);
    t -= static_cast<std::time_t>(offsetDays) * 86400;
    std::tm tm{};
#ifdef _WIN32
    gmtime_s(&tm, &t);
#else
    gmtime_r(&t, &tm);
#endif
    std::ostringstream oss;
    oss << std::put_time(&tm, "%Y%m%d");
    return oss.str();
}

// Returns "YYYY-MM-DD" from "YYYYMMDD"
static std::string formatDate(const std::string& yyyymmdd) {
    if (yyyymmdd.size() != 8) return yyyymmdd;
    return yyyymmdd.substr(0,4) + "-" + yyyymmdd.substr(4,2) + "-" + yyyymmdd.substr(6,2);
}

std::vector<GameData> NbaClient::fetchFromUrl(const std::string& url) {
    auto response = cpr::Get(cpr::Url{url}, cpr::Timeout{8000});
    if (response.status_code != 200) {
        std::cerr << "ESPN API error " << response.status_code << " for " << url << "\n";
        return {};
    }
    std::vector<GameData> games;
    try {
        auto root = json::parse(response.text);
        if (!root.contains("events")) return games;
        // Extract date from URL query string if present
        std::string date;
        auto dpos = url.find("dates=");
        if (dpos != std::string::npos) {
            date = formatDate(url.substr(dpos + 6, 8));
        }
        for (const auto& event : root.at("events")) {
            games.push_back(parseEvent(event, date));
        }
    } catch (const std::exception& e) {
        std::cerr << "Parse error: " << e.what() << "\n";
    }
    return games;
}

std::vector<GameData> NbaClient::fetchAllGames() {
    return fetchFromUrl(ESPN_BASE);
}

std::vector<GameData> NbaClient::fetchGamesByDate(const std::string& yyyymmdd) {
    return fetchFromUrl(std::string(ESPN_BASE) + "?dates=" + yyyymmdd);
}

std::vector<GameData> NbaClient::fetchRecentGames(int numDays) {
    std::vector<GameData> all;
    // Start from yesterday and go back numDays
    for (int i = 1; i <= numDays + 3; i++) {  // +3 buffer for off-days
        if (static_cast<int>(all.size()) >= numDays * 2) break; // enough games
        std::string date = dateOffset(i);
        auto games = fetchGamesByDate(date);
        // Only include completed games
        for (auto& g : games) {
            if (g.status == "post") all.push_back(g);
        }
    }
    // Return at most numDays * 2 recent games (roughly 5 game-days worth)
    if (static_cast<int>(all.size()) > numDays * 2) {
        all.resize(numDays * 2);
    }
    return all;
}

std::optional<GameData> NbaClient::fetchGame(const std::string& id) {
    auto all = fetchAllGames();
    for (const auto& g : all) {
        if (g.id == id) return g;
    }
    return std::nullopt;
}

GameData NbaClient::parseEvent(const json& event, const std::string& date) {
    GameData g;
    g.id = event.value("id", "");
    g.gameDate = date;
    if (g.gameDate.empty() && event.contains("date")) {
        // Extract date portion from ISO timestamp "2026-05-10T19:30Z"
        std::string iso = event["date"].get<std::string>();
        g.gameDate = iso.substr(0, 10);
    }

    const auto& comp = event.at("competitions").at(0);
    const auto& status = comp.at("status");
    const auto& statusType = status.at("type");

    g.status = statusType.value("state", "pre");
    g.period = status.value("period", 0);
    g.displayClock = status.value("displayClock", "");
    g.neutralSite = comp.value("neutralSite", false);

    double clockSeconds = 0.0;
    if (status.contains("clock") && status["clock"].is_number()) {
        clockSeconds = status["clock"].get<double>();
    }
    g.secondsRemaining = calcSecondsRemaining(g.period, clockSeconds);

    if (g.status == "post") {
        g.statusText = "Final";
    } else if (g.status == "in") {
        std::string periodStr;
        if (g.period <= 4) periodStr = "Q" + std::to_string(g.period);
        else periodStr = "OT" + (g.period > 5 ? std::to_string(g.period - 4) : "");
        g.statusText = periodStr + " " + g.displayClock;
    } else {
        g.statusText = statusType.value("shortDetail", "Scheduled");
    }

    for (const auto& comp_team : comp.at("competitors")) {
        TeamInfo t = parseCompetitor(comp_team);
        if (t.isHome) g.homeTeam = t;
        else g.awayTeam = t;
    }

    return g;
}

TeamInfo NbaClient::parseCompetitor(const json& comp) {
    TeamInfo t;
    t.isHome = (comp.value("homeAway", "away") == "home");
    t.isWinner = comp.value("winner", false);

    // score can be a string or a number depending on game state
    if (comp.contains("score")) {
        const auto& s = comp["score"];
        if (s.is_string()) {
            try { t.score = std::stoi(s.get<std::string>()); } catch (...) { t.score = 0; }
        } else if (s.is_number()) {
            t.score = s.get<int>();
        }
    }

    const auto& team = comp.at("team");
    t.id = team.value("id", "");
    t.name = team.value("displayName", "");
    t.abbreviation = team.value("abbreviation", "");
    t.logo = team.value("logo", "");

    if (comp.contains("linescores")) {
        for (const auto& ls : comp["linescores"]) {
            // value is a float (34.0), displayValue is a string "34"
            if (ls.contains("displayValue") && ls["displayValue"].is_string()) {
                try { t.linescores.push_back(std::stoi(ls["displayValue"].get<std::string>())); }
                catch (...) { t.linescores.push_back(0); }
            } else if (ls.contains("value") && ls["value"].is_number()) {
                t.linescores.push_back(static_cast<int>(ls["value"].get<double>()));
            }
        }
    }

    return t;
}

int NbaClient::calcSecondsRemaining(int period, double clockSeconds) {
    if (period <= 0) return 2880;
    if (period <= 4) {
        int quartersLeft = 4 - period;
        return static_cast<int>(clockSeconds) + quartersLeft * 720;
    }
    return static_cast<int>(clockSeconds);
}
