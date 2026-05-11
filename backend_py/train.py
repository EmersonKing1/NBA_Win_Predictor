#!/usr/bin/env python3
"""
Train a logistic regression model to predict NBA home-team wins.

Feature design rationale:
  ortg_diff     — home offensive rating minus away offensive rating
  drtg_diff     — away defensive rating minus home defensive rating
                  (net_rtg_diff dropped: it equals ortg_diff + drtg_diff exactly,
                   so including it creates perfect multicollinearity)
  efg_diff      — effective FG% edge (Dean Oliver Four Factor #1: shooting quality)
  tov_diff      — away_tov% - home_tov% (Four Factor #2: ball security;
                   flipped so positive = home advantage)
  oreb_diff     — home offensive reb% minus away (Four Factor #3: second chances)
  w_pct_diff    — prior-season win rate difference (captures clutch performance
                   and game-closing ability that ratings alone miss)
  home_rest     — days since home team's last game (0–7)
  away_rest     — days since away team's last game (0–7)
  home_b2b      — 1 if home team played last night (rest == 1); explicit threshold
  away_b2b      — 1 if away team played last night; B2B is NBA's single largest
                   schedule fatigue factor, non-linear w.r.t. rest days

Target: home_win (1 = home team won, 0 = away team won)
Expected accuracy: ~63-66%  (Vegas lines ~68-70% with injury info)

Usage:
    python train.py
Output:
    data/model.pkl          — {scaler, model, features} bundle
    data/plots/*.png        — diagnostic charts (seaborn)
"""

import pandas as pd
import numpy as np
import joblib
import seaborn as sns
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path

from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import cross_val_score, StratifiedKFold, GridSearchCV
from sklearn.metrics import (
    accuracy_score, roc_auc_score, classification_report,
    confusion_matrix, roc_curve, brier_score_loss,
)

DATA_DIR  = Path(__file__).parent / "data"
PLOTS_DIR = DATA_DIR / "plots"
PLOTS_DIR.mkdir(parents=True, exist_ok=True)

FEATURES = [
    # Rating edges
    "ortg_diff",      # offensive quality edge
    "drtg_diff",      # defensive quality edge (away_drtg - home_drtg → positive = home better)
    # Dean Oliver Four Factors
    "efg_diff",       # effective FG% edge — shooting efficiency
    "tov_diff",       # turnover edge — away_tov% - home_tov% (positive = home advantage)
    "oreb_diff",      # offensive rebound % edge
    # Prior season performance
    "w_pct_diff",     # win rate edge — captures clutch / game-closing ability
    # Schedule / fatigue
    "home_rest",      # days since home team's last game (0–7, capped)
    "away_rest",      # days since away team's last game
    "home_b2b",       # 1 if home team played last night (explicit B2B threshold)
    "away_b2b",       # 1 if away team played last night
]


def engineer(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["ortg_diff"]  = df["home_ortg"]     - df["away_ortg"]
    df["drtg_diff"]  = df["away_drtg"]     - df["home_drtg"]
    df["efg_diff"]   = df["home_efg_pct"]  - df["away_efg_pct"]
    df["tov_diff"]   = df["away_tov_pct"]  - df["home_tov_pct"]   # flipped: positive = home advantage
    df["oreb_diff"]  = df["home_oreb_pct"] - df["away_oreb_pct"]
    df["w_pct_diff"] = df["home_w_pct"]    - df["away_w_pct"]
    df["home_b2b"]   = (df["home_rest"] == 1).astype(int)
    df["away_b2b"]   = (df["away_rest"] == 1).astype(int)
    return df


def main():
    csv = DATA_DIR / "training_data.csv"
    if not csv.exists():
        print(f"ERROR: {csv} not found.\nRun collect_data.py first.")
        return

    df = pd.read_csv(csv)
    print(f"Loaded {len(df):,} games  |  seasons: {df['season'].nunique()}")
    print(f"Home win rate: {df['home_win'].mean():.3f}\n")

    df = engineer(df).dropna(subset=FEATURES + ["home_win"])
    X = df[FEATURES].to_numpy()
    y = df["home_win"].to_numpy()

    scaler = StandardScaler()
    X_sc   = scaler.fit_transform(X)

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    # ── Hyperparameter search: regularization strength C ──────────────
    print("Tuning regularization (C) via 5-fold CV AUC ...")
    grid = GridSearchCV(
        LogisticRegression(max_iter=500, random_state=42),
        {"C": [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0]},
        cv=cv,
        scoring="roc_auc",
        n_jobs=-1,
        refit=True,
    )
    grid.fit(X_sc, y)
    best_C = grid.best_params_["C"]
    print(f"  Best C = {best_C}  (CV AUC = {grid.best_score_:.4f})\n")
    model = grid.best_estimator_

    # ── Cross-validation at best C ─────────────────────────────────────
    acc = cross_val_score(model, X_sc, y, cv=cv, scoring="accuracy")
    auc = cross_val_score(model, X_sc, y, cv=cv, scoring="roc_auc")
    print("5-fold cross-validation (best C):")
    print(f"  Accuracy  {acc.mean():.4f} +/- {acc.std():.4f}")
    print(f"  ROC-AUC   {auc.mean():.4f} +/- {auc.std():.4f}\n")

    # ── Full-data fit ──────────────────────────────────────────────────
    model.fit(X_sc, y)
    y_pred = model.predict(X_sc)
    y_prob = model.predict_proba(X_sc)[:, 1]

    print(f"Training accuracy : {accuracy_score(y, y_pred):.4f}")
    print(f"Training ROC-AUC  : {roc_auc_score(y, y_prob):.4f}")
    print(f"Brier score       : {brier_score_loss(y, y_prob):.4f}  (lower = better calibrated)\n")
    print(classification_report(y, y_pred, target_names=["Away Win", "Home Win"]))

    # ── Coefficients ───────────────────────────────────────────────────
    print("Coefficients (sorted by |magnitude|):")
    pairs = sorted(zip(FEATURES, model.coef_[0]), key=lambda x: abs(x[1]), reverse=True)
    for feat, coef in pairs:
        bar = "#" * int(abs(coef) * 20)
        sign = "+" if coef > 0 else "-"
        print(f"  {feat:<18s}  {sign}{abs(coef):.4f}  {bar}")
    print(f"  intercept: {model.intercept_[0]:+.4f}  (~home court advantage)")

    # ── Plots ──────────────────────────────────────────────────────────
    sns.set_theme(style="dark", palette="deep", font_scale=1.1)

    # 1 — Feature coefficients
    fig, ax = plt.subplots(figsize=(9, 5))
    coef_s = pd.Series(model.coef_[0], index=FEATURES).sort_values()
    colors = ["#e8000a" if c > 0 else "#4a9eff" for c in coef_s]
    coef_s.plot(kind="barh", color=colors, ax=ax)
    ax.axvline(0, color="white", lw=0.8)
    ax.set_title("Logistic Regression Coefficients\n(red = favors home win)", pad=12)
    ax.set_xlabel("Scaled coefficient")
    plt.tight_layout()
    plt.savefig(PLOTS_DIR / "feature_importance.png", dpi=150, bbox_inches="tight")
    plt.close()

    # 2 — ROC curve
    fpr, tpr, _ = roc_curve(y, y_prob)
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.plot(fpr, tpr, color="#e8000a", lw=2.5,
            label=f"AUC = {roc_auc_score(y, y_prob):.3f}")
    ax.plot([0, 1], [0, 1], "--", color="grey", lw=1)
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title("ROC Curve — NBA Home Win Prediction")
    ax.legend(loc="lower right")
    plt.tight_layout()
    plt.savefig(PLOTS_DIR / "roc_curve.png", dpi=150, bbox_inches="tight")
    plt.close()

    # 3 — Confusion matrix
    fig, ax = plt.subplots(figsize=(5, 4))
    cm = confusion_matrix(y, y_pred)
    sns.heatmap(cm, annot=True, fmt="d", cmap="Reds",
                xticklabels=["Away Win", "Home Win"],
                yticklabels=["Away Win", "Home Win"], ax=ax)
    ax.set_title("Confusion Matrix")
    ax.set_ylabel("Actual")
    ax.set_xlabel("Predicted")
    plt.tight_layout()
    plt.savefig(PLOTS_DIR / "confusion_matrix.png", dpi=150, bbox_inches="tight")
    plt.close()

    # 4 — Predicted probability distribution
    fig, ax = plt.subplots(figsize=(8, 4))
    sns.histplot(y_prob[y == 1], bins=40, color="#e8000a", alpha=0.6,
                 label="Home Win", ax=ax)
    sns.histplot(y_prob[y == 0], bins=40, color="#4a9eff", alpha=0.6,
                 label="Away Win", ax=ax)
    ax.axvline(0.5, color="white", lw=1, linestyle="--")
    ax.set_xlabel("Predicted home-win probability")
    ax.set_title("Predicted Probability Distribution by Outcome")
    ax.legend()
    plt.tight_layout()
    plt.savefig(PLOTS_DIR / "prob_distribution.png", dpi=150, bbox_inches="tight")
    plt.close()

    print(f"\nPlots saved → {PLOTS_DIR}")

    # ── Save bundle ────────────────────────────────────────────────────
    bundle = {"scaler": scaler, "model": model, "features": FEATURES, "best_C": best_C}
    out = DATA_DIR / "model.pkl"
    joblib.dump(bundle, out)
    print(f"Model saved  → {out}  (C={best_C})")


if __name__ == "__main__":
    main()
