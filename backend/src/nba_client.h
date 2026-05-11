#pragma once
#include <string>
#include <vector>
#include <optional>
#include <nlohmann/json.hpp>

struct TeamInfo {
    std::string id;
    std::string name;
    std::string abbreviation;
    std::string logo;
    int score = 0;
    bool isHome = false;
    bool isWinner = false;
    std::vector<int> linescores;
};

struct GameData {
    std::string id;
    std::string status;       // "pre", "in", "post"
    std::string statusText;   // "Q4 9.8", "Final", "7:30 PM ET"
    std::string gameDate;     // "2026-05-09"
    int period = 0;
    std::string displayClock;
    int secondsRemaining = 2880;
    bool neutralSite = false;
    TeamInfo homeTeam;
    TeamInfo awayTeam;
};

class NbaClient {
public:
    std::vector<GameData> fetchAllGames();
    std::vector<GameData> fetchGamesByDate(const std::string& yyyymmdd);
    std::vector<GameData> fetchRecentGames(int numDays = 5);
    std::optional<GameData> fetchGame(const std::string& id);

private:
    static constexpr const char* ESPN_BASE =
        "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

    std::vector<GameData> fetchFromUrl(const std::string& url);
    GameData parseEvent(const nlohmann::json& event, const std::string& date = "");
    TeamInfo parseCompetitor(const nlohmann::json& comp);
    int calcSecondsRemaining(int period, double clockSeconds);
};
