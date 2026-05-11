#!/usr/bin/env python3
"""
Pull 11 seasons of NBA game data and team advanced stats from the NBA API.

Uses the *previous* season's stats as features for each game to avoid data
leakage (e.g. 2022-23 team stats predict 2023-24 game outcomes).

Features collected per team (Advanced measure type):
  ortg, drtg           -- offensive/defensive rating (Four Factors proxy)
  efg_pct              -- effective field goal % (Four Factor #1: shooting)
  tov_pct              -- team turnover rate   (Four Factor #2: ball security)
  oreb_pct             -- offensive reb %      (Four Factor #3: second chances)
  w_pct                -- prior-season win %   (captures clutch/closing ability)

Runtime: ~4-10 minutes (NBA API rate limiting ~0.7s between calls).
Output: data/training_data.csv  (~11k rows, one per regular-season game)

Usage:
    pip install -r requirements.txt
    python collect_data.py
"""

import time
import pandas as pd
from pathlib import Path
from nba_api.stats.endpoints import LeagueDashTeamStats, LeagueGameFinder
from nba_api.stats.static import teams as nba_teams

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# stat_season features are used to predict games in game_season
SEASON_PAIRS = [
    ("2014-15", "2015-16"),
    ("2015-16", "2016-17"),
    ("2016-17", "2017-18"),
    ("2017-18", "2018-19"),
    ("2018-19", "2019-20"),
    ("2019-20", "2020-21"),
    ("2020-21", "2021-22"),
    ("2021-22", "2022-23"),
    ("2022-23", "2023-24"),
    ("2023-24", "2024-25"),
]

TEAM_ID_TO_ABBR = {t["id"]: t["abbreviation"] for t in nba_teams.get_teams()}


def fetch_team_stats(season: str) -> dict:
    """Return {team_id: {ortg, drtg, efg_pct, tov_pct, oreb_pct, w_pct}} for one season."""
    print(f"  [stats] {season} ...", end="", flush=True)
    df = LeagueDashTeamStats(
        season=season,
        measure_type_detailed_defense="Advanced",
        per_mode_detailed="PerGame",
        timeout=30,
    ).get_data_frames()[0]
    time.sleep(0.7)
    stats = {}
    for _, row in df.iterrows():
        stats[int(row["TEAM_ID"])] = {
            "ortg":     float(row["OFF_RATING"]),
            "drtg":     float(row["DEF_RATING"]),
            "efg_pct":  float(row["EFG_PCT"]),
            "tov_pct":  float(row["TM_TOV_PCT"]),
            "oreb_pct": float(row["OREB_PCT"]),
            "w_pct":    float(row["W_PCT"]),
        }
    print(f" {len(stats)} teams")
    return stats


def fetch_season_games(season: str) -> pd.DataFrame:
    """Return all regular-season game rows for one season."""
    print(f"  [games] {season} ...", end="", flush=True)
    df = LeagueGameFinder(
        season_nullable=season,
        league_id_nullable="00",
        season_type_nullable="Regular Season",
        timeout=30,
    ).get_data_frames()[0]
    time.sleep(0.7)
    print(f" {len(df)} rows ({len(df) // 2} games)")
    return df


def add_rest_days(df: pd.DataFrame) -> pd.DataFrame:
    """Compute days since each team's previous game (capped 0–7)."""
    df = df.copy()
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    df = df.sort_values(["TEAM_ID", "GAME_DATE"])
    df["rest_days"] = (
        df.groupby("TEAM_ID")["GAME_DATE"]
        .diff()
        .dt.days
        .fillna(3)        # first game of season → assume 3 days
        .clip(0, 7)
        .astype(int)
    )
    return df


def build_dataset() -> pd.DataFrame:
    all_rows = []

    for stat_season, game_season in SEASON_PAIRS:
        print(f"\n-- {game_season} (using {stat_season} stats) --")
        try:
            team_stats = fetch_team_stats(stat_season)
            games_df   = fetch_season_games(game_season)
        except Exception as exc:
            print(f"  ERROR: {exc}")
            continue

        games_df = add_rest_days(games_df)

        # Each GAME_ID appears twice — once per team.  Identify home row by "vs."
        skipped = 0
        for game_id, group in games_df.groupby("GAME_ID"):
            home_rows = group[group["MATCHUP"].str.contains(r"vs\.", na=False)]
            away_rows = group[group["MATCHUP"].str.contains(r"@",    na=False)]

            if home_rows.empty or away_rows.empty:
                skipped += 1
                continue

            h = home_rows.iloc[0]
            a = away_rows.iloc[0]

            h_stats = team_stats.get(int(h["TEAM_ID"]))
            a_stats = team_stats.get(int(a["TEAM_ID"]))

            if not h_stats or not a_stats:
                skipped += 1
                continue

            all_rows.append({
                "season":        game_season,
                "game_id":       game_id,
                "game_date":     str(h["GAME_DATE"].date()),
                "home_team_id":  int(h["TEAM_ID"]),
                "away_team_id":  int(a["TEAM_ID"]),
                "home_ortg":     h_stats["ortg"],
                "home_drtg":     h_stats["drtg"],
                "home_efg_pct":  h_stats["efg_pct"],
                "home_tov_pct":  h_stats["tov_pct"],
                "home_oreb_pct": h_stats["oreb_pct"],
                "home_w_pct":    h_stats["w_pct"],
                "away_ortg":     a_stats["ortg"],
                "away_drtg":     a_stats["drtg"],
                "away_efg_pct":  a_stats["efg_pct"],
                "away_tov_pct":  a_stats["tov_pct"],
                "away_oreb_pct": a_stats["oreb_pct"],
                "away_w_pct":    a_stats["w_pct"],
                "home_rest":     int(h["rest_days"]),
                "away_rest":     int(a["rest_days"]),
                "home_win":      1 if h["WL"] == "W" else 0,
            })

        if skipped:
            print(f"  Skipped {skipped} games (missing stats)")

    df = pd.DataFrame(all_rows)
    out = DATA_DIR / "training_data.csv"
    df.to_csv(out, index=False)
    print(f"\nSaved {len(df):,} games -> {out}")
    print(f"  Home win rate: {df['home_win'].mean():.3f}")
    return df


if __name__ == "__main__":
    build_dataset()
