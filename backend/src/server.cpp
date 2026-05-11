#include <nlohmann/json.hpp>
#include "server.h"
#include "nba_client.h"
#include "probability.h"
#include <chrono>
#include <iomanip>
#include <sstream>

using json = nlohmann::json;

static std::string currentIsoTimestamp() {
    auto now = std::chrono::system_clock::now();
    auto t = std::chrono::system_clock::to_time_t(now);
    std::ostringstream oss;
    oss << std::put_time(std::gmtime(&t), "%Y-%m-%dT%H:%M:%SZ");
    return oss.str();
}

static json teamToJson(const TeamInfo& t) {
    json j;
    j["id"] = t.id;
    j["name"] = t.name;
    j["abbreviation"] = t.abbreviation;
    j["score"] = t.score;
    j["logo"] = t.logo;
    j["isWinner"] = t.isWinner;
    return j;
}

static json teamToJsonFull(const TeamInfo& t) {
    json j = teamToJson(t);
    j["linescores"] = t.linescores;
    return j;
}

static json gameToJson(const GameData& g) {
    json j;
    j["id"] = g.id;
    j["status"] = g.status;
    j["statusText"] = g.statusText;
    j["gameDate"] = g.gameDate;
    j["period"] = g.period;
    j["clock"] = g.displayClock;
    j["neutralSite"] = g.neutralSite;
    j["homeTeam"] = teamToJson(g.homeTeam);
    j["awayTeam"] = teamToJson(g.awayTeam);
    return j;
}

static json gameToJsonFull(const GameData& g) {
    json j = gameToJson(g);
    j["secondsRemaining"] = g.secondsRemaining;
    j["homeTeam"] = teamToJsonFull(g.homeTeam);
    j["awayTeam"] = teamToJsonFull(g.awayTeam);
    return j;
}

static json probToJson(const GameData& g, const WinProbability& prob) {
    json j;
    j["id"] = g.id;
    j["status"] = g.status;
    j["homeWinProbability"] = std::round(prob.home * 1000.0) / 1000.0;
    j["awayWinProbability"] = std::round(prob.away * 1000.0) / 1000.0;
    j["homeTeam"] = g.homeTeam.name;
    j["awayTeam"] = g.awayTeam.name;
    j["homeAbbreviation"] = g.homeTeam.abbreviation;
    j["awayAbbreviation"] = g.awayTeam.abbreviation;
    j["homeScore"] = g.homeTeam.score;
    j["awayScore"] = g.awayTeam.score;
    j["scoreDiff"] = g.homeTeam.score - g.awayTeam.score;
    j["secondsRemaining"] = g.secondsRemaining;
    return j;
}

void registerRoutes(httplib::Server& svr) {
    NbaClient client;

    svr.Get("/games", [&client](const httplib::Request&, httplib::Response& res) {
        auto games = client.fetchAllGames();
        json j;
        j["games"] = json::array();
        for (const auto& g : games) {
            j["games"].push_back(gameToJson(g));
        }
        j["fetchedAt"] = currentIsoTimestamp();
        j["count"] = games.size();
        res.set_content(j.dump(), "application/json");
    });

    svr.Get("/game/:id", [&client](const httplib::Request& req, httplib::Response& res) {
        auto id = req.path_params.at("id");
        auto game = client.fetchGame(id);
        if (!game) {
            res.status = 404;
            res.set_content("{\"error\":\"Game not found\"}", "application/json");
            return;
        }
        res.set_content(gameToJsonFull(*game).dump(), "application/json");
    });

    svr.Get("/probability/:id", [&client](const httplib::Request& req, httplib::Response& res) {
        auto id = req.path_params.at("id");
        auto game = client.fetchGame(id);
        if (!game) {
            res.status = 404;
            res.set_content("{\"error\":\"Game not found\"}", "application/json");
            return;
        }
        auto prob = calcWinProbability(*game);
        res.set_content(probToJson(*game, prob).dump(), "application/json");
    });

    svr.Get("/recent-games", [&client](const httplib::Request& req, httplib::Response& res) {
        int days = 5;
        if (req.has_param("days")) {
            try { days = std::stoi(req.get_param_value("days")); } catch (...) {}
            if (days < 1) days = 1;
            if (days > 14) days = 14;
        }
        auto games = client.fetchRecentGames(days);
        json j;
        j["games"] = json::array();
        for (const auto& g : games) {
            auto gj = gameToJsonFull(g);
            auto prob = calcWinProbability(g);
            gj["homeWinProbability"] = std::round(prob.home * 1000.0) / 1000.0;
            gj["awayWinProbability"] = std::round(prob.away * 1000.0) / 1000.0;
            j["games"].push_back(gj);
        }
        j["fetchedAt"] = currentIsoTimestamp();
        j["count"] = games.size();
        res.set_content(j.dump(), "application/json");
    });

    svr.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"status\":\"ok\"}", "application/json");
    });
}
