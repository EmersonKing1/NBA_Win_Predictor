#pragma once
#include "nba_client.h"

struct WinProbability {
    double home;
    double away;
};

WinProbability calcWinProbability(const GameData& game);
