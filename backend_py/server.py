#!/usr/bin/env python3
"""
Tipoff Live — Python backend (replaces C++ nbapred_server.exe).
Runs on http://localhost:8080 — same port, same API contract.

Win probability model:
  Pre-game  — logistic regression on ortg/drtg, Four Factors (eFG%, TOV%, OREB%),
              prior-season win rate, rest days, and back-to-back flags
  Live      — pre-game log-odds adjusted by score differential × elapsed fraction
  Fallback  — simple home-court baseline (~55%) when model.pkl is absent

ESPN API is used for live scoreboard data only.
NBA API (nba_api) is used once at startup (and refreshed every 24h) to pull
current-season team advanced stats for the model features.

Usage:
    pip install -r requirements.txt
    python server.py              # starts on :8080
    # train the model first for best results:
    #   python collect_data.py && python train.py
"""

import time
import json
import threading
import joblib
import numpy as np
import requests
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# ── Paths ──────────────────────────────────────────────────────────────
BASE        = Path(__file__).parent
MODEL_PATH  = BASE / "data" / "model.pkl"
STATS_PATH  = BASE / "data" / "stats_snapshot.json"

# ── Model ──────────────────────────────────────────────────────────────
_bundle = None   # {"scaler": StandardScaler, "model": LR, "features": [...]}

def load_model():
    global _bundle
    if MODEL_PATH.exists():
        _bundle = joblib.load(MODEL_PATH)
        print(f"[model] loaded — features: {_bundle['features']}")
    else:
        print("[model] model.pkl not found — using home-court baseline")
        print("        Run: python collect_data.py && python train.py")


# ── Team stats cache ───────────────────────────────────────────────────
# Current-season advanced stats fetched from NBA API at startup, refreshed daily.
_stats: dict = {}     # NBA abbr → {ortg, drtg, efg_pct, tov_pct, oreb_pct, w_pct, home_wpct, road_wpct, l10_wpct}
_stats_ts: float = 0  # unix timestamp of last successful refresh

# ── Rest-days cache (background-refreshed every 5 min) ─────────────────
_rest: dict = {}      # ESPN abbr → days since last game
_rest_ts: float = 0.0

# ── Per-game probability cache (stale fallback on ESPN errors) ──────────
_prob_cache: dict = {}  # game_id → {homeWinProbability, awayWinProbability}

# ── Per-game WP history (own model snapshots, survives frontend reloads) ──
_wp_history: dict = {}  # game_id → [{homeWP, elapsed}, ...]


def _game_elapsed(period: int, clock: str) -> float:
    """Convert period + remaining clock ('M:SS') to elapsed minutes."""
    if not period or period < 1:
        return 0.0
    rem_sec = 0.0
    if clock:
        parts = clock.split(":")
        if len(parts) == 2:
            try:
                rem_sec = int(parts[0]) * 60 + int(parts[1])
            except ValueError:
                pass
    q_len    = 720 if period <= 4 else 300
    base_min = (period - 1) * 12 if period <= 4 else 48 + (period - 5) * 5
    return base_min + (q_len - rem_sec) / 60

# ESPN uses slightly different abbreviations for some franchises
_ESPN_TO_NBA: dict = {
    "GS":   "GSW",
    "SA":   "SAS",
    "NY":   "NYK",
    "NO":   "NOP",
    "WSH":  "WAS",
    "UTAH": "UTA",
}

def _norm(abbr: str) -> str:
    """Normalize ESPN abbreviation → NBA API abbreviation."""
    return _ESPN_TO_NBA.get(abbr, abbr)


def _clean(s: str) -> str:
    """Fix ESPN's double-encoded UTF-8 (e.g. 'Â·' → '·')."""
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        return s


def _load_stats_snapshot():
    """Load stats from disk immediately — guarantees the model has data even if
    the NBA API is unreachable (rate-limited, cold-start delay, etc.)."""
    global _stats
    if STATS_PATH.exists():
        try:
            _stats = json.loads(STATS_PATH.read_text())
            print(f"[stats] snapshot loaded — {len(_stats)} teams")
        except Exception as exc:
            print(f"[stats] snapshot load failed: {exc}")


def refresh_team_stats(season: str = "2024-25"):
    """Pull fresh advanced stats + home/road splits + L10 from NBA API."""
    global _stats, _stats_ts
    try:
        from nba_api.stats.endpoints import LeagueDashTeamStats
        from nba_api.stats.static import teams as nba_teams

        id_to_abbr = {t["id"]: t["abbreviation"] for t in nba_teams.get_teams()}

        # 1. Full-season advanced stats
        df_adv = LeagueDashTeamStats(
            season=season,
            measure_type_detailed_defense="Advanced",
            per_mode_detailed="PerGame",
            timeout=60,
        ).get_data_frames()[0]
        time.sleep(0.7)

        # 2. Home-court W% (how each team performs at home)
        df_home = LeagueDashTeamStats(
            season=season,
            location_nullable="Home",
            per_mode_detailed="PerGame",
            timeout=60,
        ).get_data_frames()[0]
        time.sleep(0.7)

        # 3. Road W% (how each team performs on the road)
        df_road = LeagueDashTeamStats(
            season=season,
            location_nullable="Road",
            per_mode_detailed="PerGame",
            timeout=60,
        ).get_data_frames()[0]
        time.sleep(0.7)

        # 4. Last-10-games W% (recent form)
        df_l10 = LeagueDashTeamStats(
            season=season,
            last_n_games_nullable=10,
            per_mode_detailed="PerGame",
            timeout=60,
        ).get_data_frames()[0]

        home_wpct = {int(r["TEAM_ID"]): float(r["W_PCT"]) for _, r in df_home.iterrows()}
        road_wpct = {int(r["TEAM_ID"]): float(r["W_PCT"]) for _, r in df_road.iterrows()}
        l10_wpct  = {int(r["TEAM_ID"]): float(r["W_PCT"]) for _, r in df_l10.iterrows()}

        cache: dict = {}
        for _, row in df_adv.iterrows():
            tid  = int(row["TEAM_ID"])
            abbr = id_to_abbr.get(tid, "")
            if abbr:
                cache[abbr] = {
                    "ortg":      float(row["OFF_RATING"]),
                    "drtg":      float(row["DEF_RATING"]),
                    "efg_pct":   float(row["EFG_PCT"]),
                    "tov_pct":   float(row["TM_TOV_PCT"]),
                    "oreb_pct":  float(row["OREB_PCT"]),
                    "w_pct":     float(row["W_PCT"]),
                    "home_wpct": home_wpct.get(tid, 0.5),
                    "road_wpct": road_wpct.get(tid, 0.5),
                    "l10_wpct":  l10_wpct.get(tid, 0.5),
                }
        _stats = cache
        _stats_ts = time.time()
        STATS_PATH.write_text(json.dumps(cache))
        print(f"[stats] refreshed and saved — {len(cache)} teams  ({season})")
    except Exception as exc:
        print(f"[stats] refresh failed: {exc}")


def _maybe_refresh_stats():
    if time.time() - _stats_ts > 86_400:   # 24 h
        threading.Thread(target=refresh_team_stats, daemon=True).start()


# ── Probability logic ──────────────────────────────────────────────────
def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + np.exp(-np.clip(float(x), -20.0, 20.0)))


def _pregame_logit(home: str, away: str, h_rest: int, a_rest: int) -> float:
    """
    Return log-odds of home win from the trained model.
    Feature vector is built dynamically from _bundle["features"] so old and new
    model.pkl files both work without code changes.
    Falls back to a fixed baseline (~55% home court) when stats are missing.
    """
    h = _stats.get(_norm(home), {})
    a = _stats.get(_norm(away), {})

    if not _bundle or not h or not a:
        return 0.20   # sigmoid(0.20) ≈ 0.55 — bare home court advantage

    h_rest_c = min(h_rest, 7)
    a_rest_c = min(a_rest, 7)

    # All recognised features — model uses whichever subset it was trained on
    all_feats: dict = {
        "ortg_diff":      h["ortg"]    - a["ortg"],
        "drtg_diff":      a["drtg"]    - h["drtg"],
        "efg_diff":       h["efg_pct"] - a["efg_pct"],
        "tov_diff":       a["tov_pct"] - h["tov_pct"],
        "oreb_diff":      h["oreb_pct"]- a["oreb_pct"],
        "w_pct_diff":     h["w_pct"]   - a["w_pct"],
        "home_rest":      float(h_rest_c),
        "away_rest":      float(a_rest_c),
        "home_b2b":       float(h_rest_c == 1),
        "away_b2b":       float(a_rest_c == 1),
        "home_site_diff": h.get("home_wpct", 0.5) - a.get("road_wpct", 0.5),
        "l10_diff":       h.get("l10_wpct",  0.5) - a.get("l10_wpct",  0.5),
    }

    feat_vals = [all_feats[f] for f in _bundle["features"]]
    feats  = np.array([feat_vals])
    scaled = _bundle["scaler"].transform(feats)
    return float(_bundle["model"].decision_function(scaled)[0])


def _live_prob(logit: float, score_diff: int, period: int, clock: str) -> float:
    """
    Adjust pre-game log-odds with current score differential weighted by
    how much of the game has elapsed.

    Formula:
        live_logit = pre_game_logit + score_diff × elapsed × 0.18
        prob       = sigmoid(live_logit)

    The constant 0.18 is calibrated so that a 10-point lead with 10 minutes
    remaining (elapsed ≈ 0.79) gives ~83% probability for an evenly matched
    pre-game matchup.
    """
    try:
        m, s = clock.split(":")
        secs_left = int(m) * 60 + int(s)
    except Exception:
        secs_left = 0

    p = max(period, 1)
    if p <= 4:
        elapsed = ((p - 1) * 720 + (720 - secs_left)) / 2880.0
    else:
        # Overtime: treat as near-end-of-regulation
        ot_num = p - 4
        ot_elapsed = max(0, (5 * 60 - secs_left)) / (5 * 60)
        elapsed = 1.0 - (1.0 - ot_elapsed) / (ot_num * 2)

    elapsed = min(max(elapsed, 0.0), 0.995)
    return _sigmoid(logit + score_diff * elapsed * 0.18)


# ── ESPN API helpers ───────────────────────────────────────────────────
ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"

# Short-lived cache for today's scoreboard (avoids hitting ESPN on every
# /probability/:id call — frontend polls each game every 7 seconds)
_sb_cache:   dict = {"data": None, "exp": 0.0}

def _get_scoreboard(dates: str = "") -> dict:
    url = f"{ESPN_BASE}?dates={dates}" if dates else ESPN_BASE
    now = time.time()
    if not dates and _sb_cache["exp"] > now and _sb_cache["data"]:
        return _sb_cache["data"]
    data = requests.get(url, timeout=8).json()
    if not dates:
        _sb_cache["data"] = data
        _sb_cache["exp"]  = now + 6.0   # 6-second TTL (< 7s poll interval)
    return data


def refresh_rest_map():
    """Build rest-days map from the last 7 days of ESPN scoreboards.
    Runs in a background thread so routes never block on 7 sequential ESPN calls.
    """
    global _rest, _rest_ts
    rest: dict = {}
    today = datetime.utcnow()
    for delta in range(1, 8):
        d = today - timedelta(days=delta)
        try:
            events = _get_scoreboard(d.strftime("%Y%m%d")).get("events", [])
            for ev in events:
                comp = ev["competitions"][0]
                if comp["status"]["type"]["state"] != "post":
                    continue
                for c in comp["competitors"]:
                    abbr = c["team"]["abbreviation"]
                    if abbr not in rest:
                        rest[abbr] = delta
        except Exception:
            pass
    _rest = rest
    _rest_ts = time.time()
    print(f"[rest] refreshed — {len(rest)} teams mapped")


def _get_rest_map() -> dict:
    """Return the current rest cache immediately (never blocks)."""
    return _rest


def _maybe_refresh_rest():
    if time.time() - _rest_ts > 300:   # 5-min TTL
        threading.Thread(target=refresh_rest_map, daemon=True).start()


def _parse_team(competitor: dict) -> dict:
    t = competitor["team"]
    raw = str(competitor.get("score", "0"))
    score = int(raw) if raw.isdigit() else 0
    linescores = []
    for ls in competitor.get("linescores", []):
        dv = str(ls.get("displayValue", ""))
        linescores.append(int(dv) if dv.isdigit() else 0)
    record = next(
        (r["summary"] for r in competitor.get("records", []) if r.get("type") == "total"),
        None,
    )
    return {
        "id":           t.get("id", ""),
        "abbreviation": t.get("abbreviation", ""),
        "name":         t.get("displayName", ""),
        "logo":         t.get("logo", ""),
        "color":        "#" + t.get("color", "888888"),
        "score":        score,
        "isWinner":     bool(competitor.get("winner", False)),
        "linescores":   linescores,
        "record":       record,
    }


def _parse_event(ev: dict, rest: dict) -> dict | None:
    """Parse one ESPN scoreboard event into our API response shape."""
    try:
        comp   = ev["competitions"][0]
        st     = comp["status"]
        stype  = st["type"]
        state  = stype.get("state", "pre")
        period = st.get("period", 0)
        clock  = st.get("displayClock", "")

        home = away = None
        for c in comp["competitors"]:
            t = _parse_team(c)
            if c.get("homeAway") == "home":
                home = t
            else:
                away = t
        if not home or not away:
            return None

        if state == "post":
            status_text = "Final"
        elif state == "in":
            q = f"Q{period}" if period <= 4 else "OT" + (str(period - 4) if period > 5 else "")
            status_text = f"{q} {clock}"
        else:
            status_text = stype.get("shortDetail", "Scheduled").replace("EDT", "EST").replace("PDT", "PST")

        venues    = ev.get("venues", [])
        venue_str = venues[0].get("fullName", "") if venues else ""

        # Game date — convert UTC to Eastern Time (EDT = UTC-4 during playoffs)
        raw_date = ev.get("date", "")
        if raw_date:
            try:
                dt_utc = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
                dt_et  = dt_utc.astimezone(timezone(timedelta(hours=-4)))
                game_date = dt_et.strftime("%Y-%m-%d")
            except Exception:
                game_date = raw_date[:10]
        else:
            game_date = ""

        # Playoff series note — "Game 5 · BOS leads 3-2"
        series_note = ""
        notes = comp.get("notes", [])
        for note in notes:
            headline = _clean(note.get("headline", ""))
            # Strip round prefix: "East Semifinals - Game 4" → "Game 4"
            if " - " in headline:
                headline = headline.split(" - ", 1)[1]
            if headline:
                series_note = headline
                break
        series_summary = _clean(comp.get("series", {}).get("summary", ""))
        if series_summary:
            series_note = f"{series_note} · {series_summary}" if series_note else series_summary

        return {
            "id":          ev.get("id", ""),
            "status":      state,
            "statusText":  status_text,
            "period":      period,
            "clock":       clock,
            "venue":       venue_str,
            "gameDate":    game_date,
            "seriesNote":  series_note,
            "homeTeam":    home,
            "awayTeam":    away,
            # internal fields stripped before response
            "_h_rest": rest.get(home["abbreviation"], 2),
            "_a_rest": rest.get(away["abbreviation"], 2),
        }
    except Exception as exc:
        print(f"[parse] event error: {exc}")
        return None


def _compute_prob(g: dict) -> tuple[float, float]:
    """Return (home_prob, away_prob) for a parsed game dict."""
    h, a = g["homeTeam"], g["awayTeam"]
    logit = _pregame_logit(
        h["abbreviation"], a["abbreviation"],
        g["_h_rest"], g["_a_rest"],
    )
    if g["status"] == "post":
        prob = 1.0 if h["isWinner"] else 0.0
    elif g["status"] == "in":
        prob = _live_prob(logit, h["score"] - a["score"], g["period"], g["clock"])
    else:
        prob = _sigmoid(logit)

    return round(prob, 4), round(1.0 - prob, 4)


def _public(g: dict) -> dict:
    """Strip internal keys and add probability fields."""
    home_prob, away_prob = _compute_prob(g)
    out = {k: v for k, v in g.items() if not k.startswith("_")}
    out["homeWinProbability"] = home_prob
    out["awayWinProbability"] = away_prob
    return out


# ── App lifecycle ──────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_model()
    _load_stats_snapshot()
    threading.Thread(target=refresh_team_stats, daemon=True).start()
    threading.Thread(target=refresh_rest_map,   daemon=True).start()
    yield


app = FastAPI(title="Tipoff Live", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


# ── Routes ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    now = time.time()
    return {
        "ok":          True,
        "model":       _bundle is not None,
        "teams":       len(_stats),
        "statsAgeMin": round((now - _stats_ts) / 60, 1) if _stats_ts else None,
        "restTeams":   len(_rest),
        "restAgeMin":  round((now - _rest_ts)  / 60, 1) if _rest_ts  else None,
    }


@app.get("/games")
def get_games():
    _maybe_refresh_stats()
    _maybe_refresh_rest()
    try:
        data  = _get_scoreboard()
        rest  = _get_rest_map()
        games = [_parse_event(ev, rest) for ev in data.get("events", [])]
        games = [g for g in games if g]
        return {"games": [_public(g) for g in games]}
    except Exception as exc:
        return {"games": [], "error": str(exc)}


@app.get("/probability/{game_id}")
def get_probability(game_id: str):
    _maybe_refresh_stats()
    _maybe_refresh_rest()
    try:
        data = _get_scoreboard()
        rest = _get_rest_map()
        for ev in data.get("events", []):
            if ev.get("id") == game_id:
                g = _parse_event(ev, rest)
                if g:
                    hp, ap = _compute_prob(g)
                    result = {"homeWinProbability": hp, "awayWinProbability": ap}
                    _prob_cache[game_id] = result

                    # Record snapshot for history (only for live games, dedupe by elapsed)
                    if g.get("status") == "in":
                        elapsed  = _game_elapsed(g.get("period", 0), g.get("clock", ""))
                        snapshot = {"homeWP": hp, "elapsed": elapsed}
                        hist     = _wp_history.setdefault(game_id, [])
                        if not hist or abs(hist[-1]["elapsed"] - elapsed) >= 0.05:
                            hist.append(snapshot)
                            if len(hist) > 2000:
                                _wp_history[game_id] = hist[-2000:]

                    return result
    except Exception as exc:
        print(f"[prob] {game_id}: {exc}")
    if game_id in _prob_cache:
        return {**_prob_cache[game_id], "stale": True}
    return {"homeWinProbability": 0.5, "awayWinProbability": 0.5}


@app.get("/wp-history/{game_id}")
def get_wp_history(game_id: str):
    """Return all model WP snapshots accumulated for a live game."""
    return {"history": _wp_history.get(game_id, [])}


@app.get("/recent-games")
def get_recent_games():
    _maybe_refresh_rest()
    try:
        today = datetime.utcnow()
        rest  = _get_rest_map()
        games: list = []
        for delta in range(1, 8):
            d     = today - timedelta(days=delta)
            data  = _get_scoreboard(d.strftime("%Y%m%d"))
            for ev in data.get("events", []):
                g = _parse_event(ev, rest)
                if g and g["status"] == "post":
                    games.append(_public(g))
            if len(games) >= 20:
                break
        return {"games": games[:20]}
    except Exception as exc:
        return {"games": [], "error": str(exc)}


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8080, reload=False)
