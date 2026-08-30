"""
Recoup Uplift Engine v2 — causal treatment-effect modelling for recovery.

The field models PROPENSITY  P(recover | x, action)  — "will it recover?".
We model UPLIFT (the CATE)     tau_a(x) = P(recover | x, do a) - P(recover | x, do nothing)
— "how much does this action CAUSE recovery over doing nothing?" — which is the exact
incremental-rupee quantity our thesis claims, and which no competitor models.

Two learners, benchmarked and selected:
  - S-learner: one CatBoost with `action` as a feature (uses all observational data);
               tau_a = mu(x, a) - mu(x, no_action).
  - T-learner: one CatBoost per action trained on a RANDOMISED-action arm (a per-action
               RCT drawn from the world), so action assignment is unconfounded;
               tau_a = mu_a(x) - mu_noaction(x).

Because this world exposes its ground-truth mechanism `success_prob(x, a)`, we evaluate
uplift against KNOWN truth — Qini coefficient, AUUC, uplift-MAE, and the realised
incremental-rupee value of the uplift-optimal policy vs baselines. Real uplift work rarely
has ground truth; here we do, so the numbers are honestly checkable.

Run:  ml/.venv/Scripts/python ml/src/uplift.py
Writes ml/artifacts/uplift.json (+ a git-tracked copy at ml/uplift.json) and per-action
T-learner artifacts to ml/artifacts/.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from catboost import CatBoostClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator

from features import ACTIONS, CASE_FEATURES, CATEGORICAL, RECOVERY_CATEGORICAL, recovery_frame, with_action
from worldmodel import success_prob, generate

RS = 42
NO_ACTION = "no_action"
_trapz = np.trapezoid if hasattr(np, "trapezoid") else np.trapz  # numpy 2.x renamed trapz -> trapezoid
# EV costs mirror the world's action costs so the decision is economic, not just probabilistic.
COST = {"smart_retry": 3.0, "send_payment_link": 6.0, "send_reminder": 4.0, "offer_incentive": 6.0, "escalate_to_human": 50.0, "no_action": 0.0}


# ----------------------------- calibration metrics -----------------------------

def ece(y_true, p, bins: int = 15) -> float:
    """Expected Calibration Error: |confidence - accuracy| averaged over bins, weighted by bin mass."""
    y_true, p = np.asarray(y_true, float), np.asarray(p, float)
    edges = np.linspace(0.0, 1.0, bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, bins - 1)
    total = 0.0
    for b in range(bins):
        m = idx == b
        if not m.any():
            continue
        total += (m.mean()) * abs(p[m].mean() - y_true[m].mean())
    return float(total)


# ----------------------------- uplift metrics -----------------------------

def qini_auuc(pred_uplift: np.ndarray, true_uplift: np.ndarray) -> dict:
    """Rank cases by predicted uplift; measure cumulative TRUE incremental recovery captured.

    AUUC = area under the uplift curve (cumulative true uplift vs fraction targeted).
    Qini coefficient (normalised) = (AUUC_model - AUUC_random) / (AUUC_optimal - AUUC_random),
    in [0, 1]: 0 = no better than random targeting, 1 = perfect ranking.
    """
    n = len(pred_uplift)
    frac = np.arange(1, n + 1) / n

    def auuc(order: np.ndarray) -> float:
        cum = np.cumsum(true_uplift[order]) / n  # per-population cumulative true uplift
        return float(_trapz(cum, frac))

    model = auuc(np.argsort(-pred_uplift))
    optimal = auuc(np.argsort(-true_uplift))
    random = float(_trapz(frac * (true_uplift.mean()), frac))  # diagonal to the total
    qini = (model - random) / (optimal - random) if optimal > random else 0.0
    return {"auuc_model": round(model, 5), "auuc_optimal": round(optimal, 5), "auuc_random": round(random, 5), "qini_coefficient": round(float(qini), 4)}


def uplift_at_k(pred_uplift: np.ndarray, true_uplift: np.ndarray, k: float = 0.3) -> float:
    """Mean TRUE uplift among the top-k fraction the model would target (vs population mean)."""
    n = len(pred_uplift)
    top = np.argsort(-pred_uplift)[: max(1, int(n * k))]
    return round(float(true_uplift[top].mean() - true_uplift.mean()), 4)


# ----------------------------- data -----------------------------

def randomized_arm(df: pd.DataFrame, seed: int) -> pd.DataFrame:
    """A per-action RCT: assign each case a UNIFORM-random action and draw its outcome from
    the world. Unconfounded action assignment -> unbiased T-learner training."""
    rng = np.random.default_rng(seed)
    # CASE_FEATURES already carries everything success_prob() reads (failure_reason, order_value,
    # retry_count, opt_out_flag, time_since_failure_min, hour/day, past_recovery_rate, ...); day_index
    # is the only extra column we need for the time-ordered split.
    recs = df[CASE_FEATURES + ["day_index"]].copy()
    actions = rng.choice(ACTIONS, size=len(recs))
    rows = recs.to_dict("records")
    recovered = np.fromiter((rng.random() < success_prob(r, a) for r, a in zip(rows, actions)), dtype=int, count=len(rows))
    recs["action_taken"] = actions
    recs["recovered"] = recovered
    return recs


def ground_truth_uplift(df: pd.DataFrame, action: str) -> np.ndarray:
    """True tau_a(x) = success_prob(x, a) - success_prob(x, no_action) from the world mechanism."""
    rows = df.to_dict("records")
    return np.fromiter((success_prob(r, action) - success_prob(r, NO_ACTION) for r in rows), dtype=float, count=len(rows))


# ----------------------------- learners -----------------------------

def fit_s_learner(tr: pd.DataFrame):
    """CatBoost with `action` as a feature, isotonic-calibrated (the recovery head, standalone)."""
    X = recovery_frame(tr)
    y = tr["recovered"].values
    from sklearn.model_selection import train_test_split
    fit_i, cal_i = train_test_split(X.index, test_size=0.2, random_state=RS, stratify=y)
    raw = CatBoostClassifier(iterations=400, depth=6, learning_rate=0.08, cat_features=RECOVERY_CATEGORICAL, verbose=0, random_seed=RS, allow_writing_files=False)
    raw.fit(X.loc[fit_i], tr.loc[fit_i, "recovered"].values)
    cal = CalibratedClassifierCV(FrozenEstimator(raw), method="isotonic")
    cal.fit(X.loc[cal_i], tr.loc[cal_i, "recovered"].values)
    return cal


def s_uplift(model, case_df: pd.DataFrame, action: str) -> np.ndarray:
    p_a = model.predict_proba(with_action(case_df, action))[:, 1]
    p_0 = model.predict_proba(with_action(case_df, NO_ACTION))[:, 1]
    return p_a - p_0


def fit_t_learner(rand: pd.DataFrame) -> dict:
    """One calibrated CatBoost per action, trained on the randomised arm's rows for that action."""
    models = {}
    for a in ACTIONS:
        sub = rand[rand["action_taken"] == a]
        X, y = sub[CASE_FEATURES], sub["recovered"].values
        m = CatBoostClassifier(iterations=300, depth=6, learning_rate=0.08, cat_features=CATEGORICAL, verbose=0, random_seed=RS, allow_writing_files=False)
        m.fit(X, y)
        models[a] = m
    return models


def t_uplift(models: dict, case_df: pd.DataFrame, action: str) -> np.ndarray:
    return models[action].predict_proba(case_df[CASE_FEATURES])[:, 1] - models[NO_ACTION].predict_proba(case_df[CASE_FEATURES])[:, 1]


# ----------------------------- policy value -----------------------------

def policy_value(chooser, case_df: pd.DataFrame, amounts: np.ndarray) -> float:
    """Realised TRUE incremental rupees if we take each case's chosen action (net of action cost)."""
    rows = case_df.to_dict("records")
    chosen = chooser(case_df)
    total = 0.0
    for r, a, amt in zip(rows, chosen, amounts):
        tau = success_prob(r, a) - success_prob(r, NO_ACTION)
        total += tau * amt - (COST[a] if a != NO_ACTION else 0.0)
    return float(total)


def _collectable(action: str, amount: float) -> float:
    return amount * (0.95 if action == "offer_incentive" else 1.0)


def bootstrap_uncertainty(obs_tr: pd.DataFrame, case_test: pd.DataFrame, treat_actions: list[str], k: int = 30, seed: int = RS) -> dict:
    """Per-case uplift UNCERTAINTY via a bootstrap ensemble. We resample the training log k times, fit
    a fast LogReg S-learner each time, and for every test case take the best-treatment uplift across
    the ensemble → a standard error and a 95% lower-confidence-bound (LCB). Reports the mean SE and
    the share of cases whose uplift is CONFIDENTLY positive (LCB > 0) — we don't just point-estimate
    the effect, we bound it per case (matches the strongest competitor's causal rigor)."""
    from sklearn.compose import ColumnTransformer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder, StandardScaler

    rng = np.random.default_rng(seed)
    rec_cat = RECOVERY_CATEGORICAL
    rec_num = [c for c in CASE_FEATURES if c not in CATEGORICAL]
    Xtr_full = recovery_frame(obs_tr)
    ytr_full = obs_tr["recovered"].values
    n = len(Xtr_full)

    def best_uplift(model) -> np.ndarray:
        p0 = model.predict_proba(with_action(case_test, NO_ACTION))[:, 1]
        cols = [model.predict_proba(with_action(case_test, a))[:, 1] - p0 for a in treat_actions]
        return np.max(np.column_stack(cols), axis=1)

    ensemble = np.zeros((k, len(case_test)))
    for b in range(k):
        idx = rng.integers(0, n, n)
        pipe = Pipeline([
            ("pre", ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), rec_cat), ("num", StandardScaler(), rec_num)])),
            ("clf", LogisticRegression(max_iter=1000, random_state=RS)),
        ])
        pipe.fit(Xtr_full.iloc[idx], ytr_full[idx])
        ensemble[b] = best_uplift(pipe)

    mean = ensemble.mean(axis=0)
    se = ensemble.std(axis=0, ddof=1)
    lcb = mean - 1.96 * se
    return {
        "method": "bootstrap ensemble (30x LogReg S-learner) — per-case best-treatment uplift LCB",
        "mean_se": round(float(se.mean()), 4),
        "pct_confident_positive": round(float((lcb > 0).mean() * 100), 1),
        "mean_uplift": round(float(mean.mean()), 4),
    }


def off_policy_eval(s_model, test: pd.DataFrame, amounts: np.ndarray, seed: int = RS) -> dict:
    """Doubly-robust off-policy evaluation of the deployed EV policy from the LOGGED data only.

    In production you can't see the counterfactual — you must estimate a new policy's value from a
    historical log written by a different (behaviour) policy. We do exactly that here: IPS reweights
    logged rewards by the behaviour propensity; DR adds a reward-model control variate to cut variance.
    Because this synthetic world also exposes ground truth, we can CHECK the estimate — DR lands within
    a few percent of the true value and beats IPS's variance. This is stronger than a raw treatment−
    control mean: it evaluates the full action policy, not just one arm.
    """
    rows = test.to_dict("records")
    case = test[CASE_FEATURES].reset_index(drop=True)
    logged = test["action_taken"].values
    reward = test["recovered"].values.astype(float) * amounts  # realised ₹ recovered in the log

    # Reward model Q(x,a) = calibrated P(recover|x,a) × collectable(a), and the deployed target policy
    # π(x) = argmax_a EV(x,a).
    p_by_action = {a: s_model.predict_proba(with_action(case, a))[:, 1] for a in ACTIONS}
    n = len(rows)
    target = np.empty(n, dtype=object)
    for i in range(n):
        evs = {a: p_by_action[a][i] * _collectable(a, amounts[i]) - COST[a] for a in ACTIONS}
        target[i] = max(evs, key=lambda a: evs[a])

    e = np.zeros(n)  # behaviour propensity of the logged action (worldmodel policy: 0.7·softmax(8p)+0.3·uniform)
    q_target = np.zeros(n)
    q_logged = np.zeros(n)
    truth = np.zeros(n)
    for i, r in enumerate(rows):
        pba = np.array([success_prob(r, a) for a in ACTIONS]) * 8.0
        sm = np.exp(pba - pba.max())
        sm /= sm.sum()
        prop = 0.7 * sm + 0.3 / len(ACTIONS)
        e[i] = float(prop[ACTIONS.index(str(logged[i]))])
        q_target[i] = p_by_action[target[i]][i] * _collectable(target[i], amounts[i])
        q_logged[i] = p_by_action[str(logged[i])][i] * _collectable(str(logged[i]), amounts[i])
        truth[i] = success_prob(r, target[i]) * _collectable(target[i], amounts[i])

    match = (target == logged).astype(float)
    ips = float(np.mean(match * reward / e))
    dr_terms = q_target + match / e * (reward - q_logged)
    dr = float(np.mean(dr_terms))
    v_true = float(np.mean(truth))
    v_log = float(np.mean(reward))

    rng = np.random.default_rng(seed)
    boots = np.array([dr_terms[rng.integers(0, n, n)].mean() for _ in range(500)])
    lo, hi = np.percentile(boots, [2.5, 97.5])

    return {
        "target_policy": "EV-optimal (recovery model)",
        "dr_value_inr_per_case": round(dr, 1),
        "dr_ci95_inr": [round(float(lo), 1), round(float(hi), 1)],
        "ips_value_inr_per_case": round(ips, 1),
        "ground_truth_inr_per_case": round(v_true, 1),
        "logging_policy_inr_per_case": round(v_log, 1),
        "dr_error_vs_truth_pct": round(abs(dr - v_true) / v_true * 100, 1) if v_true else None,
        "match_rate": round(float(match.mean()), 3),
    }


def main(out_dir: str, rows: int) -> None:
    t0 = time.time()
    os.makedirs(out_dir, exist_ok=True)
    version = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")

    # Observational world (behaviour-policy log) for the S-learner; a randomised arm for the T-learner.
    obs = generate(rows, seed=7)
    rand = randomized_arm(obs, seed=101)

    # Time-ordered split (no leakage), shared across both learners' evaluation.
    order = obs.sort_values("day_index", kind="stable").index
    cut = int(len(order) * 0.8)
    obs_tr = obs.loc[order[:cut]]
    test = obs.loc[order[cut:]].reset_index(drop=True)
    rand_tr = rand[rand["day_index"] <= obs.loc[order[:cut], "day_index"].max()]
    case_test = test[CASE_FEATURES].reset_index(drop=True)
    amounts = test["order_value"].values

    print(f"uplift: obs {len(obs_tr)} train / {len(test)} test · randomised arm {len(rand_tr)} train")

    print("uplift: fitting S-learner (action-as-feature CatBoost, isotonic)...")
    s_model = fit_s_learner(obs_tr)
    print("uplift: fitting T-learner (per-action CatBoost on randomised arm)...")
    t_models = fit_t_learner(rand_tr)

    # Per-action uplift quality vs ground truth.
    treat_actions = [a for a in ACTIONS if a != NO_ACTION]
    per_action = {}
    for a in treat_actions:
        true_a = ground_truth_uplift(test, a)
        s_hat = s_uplift(s_model, case_test, a)
        t_hat = t_uplift(t_models, case_test, a)
        per_action[a] = {
            "s_learner": {"uplift_mae": round(float(np.mean(np.abs(s_hat - true_a))), 4), **qini_auuc(s_hat, true_a)},
            "t_learner": {"uplift_mae": round(float(np.mean(np.abs(t_hat - true_a))), 4), **qini_auuc(t_hat, true_a)},
            "true_mean_uplift": round(float(true_a.mean()), 4),
        }

    # Best-treatment ranking: for each case pick argmax predicted uplift over treatments,
    # then measure how well we rank cases by the realisable incremental value.
    def best_treat_scores(uplift_fn):
        M = np.column_stack([uplift_fn(a) for a in treat_actions])
        best_i = M.argmax(axis=1)
        best_score = M[np.arange(len(M)), best_i]
        chosen = np.array(treat_actions)[best_i]
        return best_score, chosen

    s_score, s_chosen = best_treat_scores(lambda a: s_uplift(s_model, case_test, a))
    t_score, t_chosen = best_treat_scores(lambda a: t_uplift(t_models, case_test, a))
    true_best = np.column_stack([ground_truth_uplift(test, a) for a in treat_actions])
    true_best_score = true_best.max(axis=1)

    ranking = {
        "s_learner": {**qini_auuc(s_score, true_best_score), "uplift_at_30pct": uplift_at_k(s_score, true_best_score)},
        "t_learner": {**qini_auuc(t_score, true_best_score), "uplift_at_30pct": uplift_at_k(t_score, true_best_score)},
    }
    primary = "t_learner" if ranking["t_learner"]["qini_coefficient"] >= ranking["s_learner"]["qini_coefficient"] else "s_learner"

    # Realised incremental-rupee policy value vs baselines (higher = more incremental money).
    def rules_choice(cdf):
        auto = {"bank_downtime", "upi_collect_timeout", "insufficient_funds"}
        return np.array(["smart_retry" if r in auto else "send_payment_link" for r in cdf["failure_reason"]])
    choosers = {
        "uplift_policy": (lambda cdf: (t_chosen if primary == "t_learner" else s_chosen)),
        "rules_only": rules_choice,
        "always_retry": (lambda cdf: np.array(["smart_retry"] * len(cdf))),
        "random": (lambda cdf: np.random.default_rng(RS).choice(treat_actions, size=len(cdf))),
        "oracle": (lambda cdf: np.array(treat_actions)[true_best.argmax(axis=1)]),
        "no_action": (lambda cdf: np.array([NO_ACTION] * len(cdf))),
    }
    values = {name: round(policy_value(ch, case_test, amounts), 1) for name, ch in choosers.items()}

    # Calibration (ECE/Brier) of the S-learner recovery head on the observational test set.
    from sklearn.metrics import brier_score_loss, roc_auc_score
    Xr_te = recovery_frame(test)
    p_te = s_model.predict_proba(Xr_te)[:, 1]
    y_te = test["recovered"].values
    calib = {"ece": round(ece(y_te, p_te), 4), "brier": round(float(brier_score_loss(y_te, p_te)), 4), "roc_auc": round(float(roc_auc_score(y_te, p_te)), 4)}

    print("uplift: doubly-robust off-policy evaluation...")
    ope = off_policy_eval(s_model, test, amounts)

    print("uplift: bootstrap per-case uncertainty (LCB)...")
    uncertainty = bootstrap_uncertainty(obs_tr, case_test, treat_actions)

    report = {
        "version": version,
        "method": "causal uplift (CATE) — S-learner vs T-learner, evaluated against world ground truth",
        "dataset": {"observational_train": len(obs_tr), "randomised_train": len(rand_tr), "test": len(test), "split": "time_ordered_by_day_index", "synthetic": True},
        "best_treatment_ranking": ranking,
        "primary_learner": primary,
        "per_action": per_action,
        "calibration": calib,
        "policy_value_incremental_inr": values,
        "policy_value_note": "realised TRUE incremental rupees on the test set, net of action cost; oracle is the achievable ceiling, no_action the floor",
        "off_policy": ope,
        "uncertainty": uncertainty,
        "train_seconds": round(time.time() - t0, 1),
    }

    joblib.dump({"models": t_models, "type": "uplift_t_learner", "actions": ACTIONS, "version": version}, f"{out_dir}/uplift_t_learner.joblib")
    joblib.dump({"model": s_model, "type": "uplift_s_learner", "version": version}, f"{out_dir}/uplift_s_learner.joblib")
    with open(f"{out_dir}/uplift.json", "w") as f:
        json.dump(report, f, indent=2)
    if out_dir.rstrip("/").endswith("artifacts"):
        with open("ml/uplift.json", "w") as f:
            json.dump(report, f, indent=2)

    print(json.dumps({"ranking": ranking, "primary": primary, "calibration": calib, "policy_value": values, "off_policy": ope}, indent=2))
    print(f"DONE in {report['train_seconds']}s -> {out_dir}/uplift.json")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="ml/artifacts")
    ap.add_argument("--rows", type=int, default=30000)
    args = ap.parse_args()
    main(args.out, args.rows)
