#include "probability.h"
#include <cmath>

static constexpr double HOME_COURT_ADVANTAGE = 3.5;
static constexpr double SIGMA = 11.0;
static constexpr double TOTAL_SECONDS = 2880.0;

WinProbability calcWinProbability(const GameData& game) {
    // Completed game
    if (game.status == "post") {
        if (game.homeTeam.isWinner) return {1.0, 0.0};
        if (game.awayTeam.isWinner) return {0.0, 1.0};
        return {0.5, 0.5};
    }

    double hca = game.neutralSite ? 0.0 : HOME_COURT_ADVANTAGE;

    // Pre-game: use only home court advantage
    if (game.status == "pre" || game.secondsRemaining >= static_cast<int>(TOTAL_SECONDS)) {
        double z = (hca / SIGMA) * 4.0;
        double homeProb = 1.0 / (1.0 + std::exp(-z));
        return {homeProb, 1.0 - homeProb};
    }

    // Clock expired mid-game guard
    if (game.secondsRemaining <= 0) {
        if (game.homeTeam.score > game.awayTeam.score) return {1.0, 0.0};
        if (game.awayTeam.score > game.homeTeam.score) return {0.0, 1.0};
        return {0.5, 0.5};
    }

    double timeFraction = static_cast<double>(game.secondsRemaining) / TOTAL_SECONDS;
    double effectiveSigma = SIGMA * std::sqrt(timeFraction);
    if (effectiveSigma < 0.01) effectiveSigma = 0.01;

    double scoreDiff = static_cast<double>(game.homeTeam.score - game.awayTeam.score);
    double adjustedDiff = scoreDiff + hca;
    double z = adjustedDiff / effectiveSigma;
    double homeProb = 1.0 / (1.0 + std::exp(-z));

    return {homeProb, 1.0 - homeProb};
}
