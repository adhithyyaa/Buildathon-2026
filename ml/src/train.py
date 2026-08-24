"""
Recoup ML training pipeline.

Trains, on the SAME train/test split:
  Recovery head (binary: recovered | case + action)
    - LogisticRegression  (baseline)
    - XGBoostClassifier   (benchmark)
    - CatBoostClassifier  (primary) wrapped in CalibratedClassifierCV(isotonic)
  Action head (multiclass: best_action | case)
    - LogisticRegression / XGBoost / CatBoost (primary)
  Escalation head (binary: NOT automated-recoverable | case)
    - CatBoost wrapped in CalibratedClassifierCV(sigmoid)
  Anomaly
    - IsolationForest on per-case features (per-case anomaly score)
    - IsolationForest on windowed failure-count vectors (spike detection),
      evaluated against the generator's injected incidents.

Outputs joblib artifacts to ml/artifacts/ and a metrics report to
ml/artifacts/metrics.json (+ a git-tracked copy at ml/metrics.json).

Run:  python ml/src/train.py --data ml/data/train.csv
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
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest
from sklearn.frozen import FrozenEstimator
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

from features import (
    ACTIONS,
    CASE_FEATURES,
    CATEGORICAL,
    NUMERIC,
    RECOVERY_CATEGORICAL,
    recovery_frame,
    with_action,
)

RS = 42


def pre(cats, nums, scale: bool) -> ColumnTransformer:
    num_t = StandardScaler() if scale else "passthrough"
    return ColumnTransformer(
        [
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cats),
            ("num", num_t, nums),
        ]
    )


def bin_metrics(y_true, p) -> dict:
    yhat = (p >= 0.5).astype(int)
    return {
        "roc_auc": round(float(roc_auc_score(y_true, p)), 4),
        "pr_auc": round(float(average_precision_score(y_true, p)), 4),
        "precision": round(float(precision_score(y_true, yhat, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, yhat, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, yhat, zero_division=0)), 4),
        "brier": round(float(brier_score_loss(y_true, p)), 4),
    }


def reliability(y_true, p, bins=10) -> list[dict]:
    """Reliability-curve table for the dashboard's calibration plot."""
    df = pd.DataFrame({"y": y_true, "p": p})
    df["bin"] = np.clip((df["p"] * bins).astype(int), 0, bins - 1)
    out = []
    for b, g in df.groupby("bin"):
        out.append(
            {
                "bin_mid": round((b + 0.5) / bins, 2),
                "predicted": round(float(g["p"].mean()), 4),
                "observed": round(float(g["y"].mean()), 4),
                "count": int(len(g)),
            }
        )
    return out


def main(data_path: str, out_dir: str) -> None:
    t0 = time.time()
    os.makedirs(out_dir, exist_ok=True)
    df = pd.read_csv(data_path)
    version = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")

    idx_train, idx_test = train_test_split(
        df.index, test_size=0.2, random_state=RS, stratify=df["recovered"]
    )
    tr, te = df.loc[idx_train], df.loc[idx_test]
    print(f"dataset {len(df)} rows -> train {len(tr)} / test {len(te)}  (recovered rate {df.recovered.mean():.3f})")

    metrics: dict = {
        "version": version,
        "dataset": {"rows": len(df), "train": len(tr), "test": len(te), "recovered_rate": round(float(df.recovered.mean()), 4)},
        "recovery": {},
        "action": {},
        "escalation": {},
        "anomaly": {},
    }

    # ---------------- Recovery head: P(recover | case + action) ----------------
    Xtr, Xte = recovery_frame(tr), recovery_frame(te)
    ytr, yte = tr["recovered"].values, te["recovered"].values
    rec_nums = [c for c in Xtr.columns if c in NUMERIC]

    print("recovery: logistic regression (baseline)...")
    logreg = Pipeline([("pre", pre(RECOVERY_CATEGORICAL, rec_nums, True)), ("clf", LogisticRegression(max_iter=2000, random_state=RS))])
    logreg.fit(Xtr, ytr)
    metrics["recovery"]["logistic_regression"] = bin_metrics(yte, logreg.predict_proba(Xte)[:, 1])

    print("recovery: xgboost (benchmark)...")
    xgb = Pipeline(
        [
            ("pre", pre(RECOVERY_CATEGORICAL, rec_nums, False)),
            ("clf", XGBClassifier(n_estimators=400, max_depth=6, learning_rate=0.08, subsample=0.9, colsample_bytree=0.8, eval_metric="logloss", tree_method="hist", random_state=RS)),
        ]
    )
    xgb.fit(Xtr, ytr)
    metrics["recovery"]["xgboost"] = bin_metrics(yte, xgb.predict_proba(Xte)[:, 1])

    # CatBoost + sklearn-1.9 clone() don't mix (cat_features breaks the clone
    # contract), so we calibrate the PREFIT model on a dedicated calibration
    # split via FrozenEstimator — the modern replacement for cv='prefit', and
    # the cleaner story anyway: fit on 80% of train, calibrate on the held-out 20%.
    fit_idx, cal_idx = train_test_split(Xtr.index, test_size=0.2, random_state=RS, stratify=ytr)
    X_fit, y_fit = Xtr.loc[fit_idx], tr.loc[fit_idx, "recovered"].values
    X_cal, y_cal = Xtr.loc[cal_idx], tr.loc[cal_idx, "recovered"].values

    print("recovery: catboost (primary, uncalibrated)...")
    cb_raw = CatBoostClassifier(iterations=500, depth=6, learning_rate=0.08, cat_features=RECOVERY_CATEGORICAL, verbose=0, random_seed=RS, allow_writing_files=False)
    cb_raw.fit(X_fit, y_fit)
    p_raw = cb_raw.predict_proba(Xte)[:, 1]
    metrics["recovery"]["catboost_uncalibrated"] = bin_metrics(yte, p_raw)

    print("recovery: CalibratedClassifierCV(FrozenEstimator, isotonic) on calibration split...")
    cb_cal = CalibratedClassifierCV(FrozenEstimator(cb_raw), method="isotonic")
    cb_cal.fit(X_cal, y_cal)
    p_cal = cb_cal.predict_proba(Xte)[:, 1]
    metrics["recovery"]["catboost_calibrated"] = bin_metrics(yte, p_cal)
    metrics["recovery"]["calibration_curve"] = reliability(yte, p_cal)
    metrics["recovery"]["primary"] = "catboost_calibrated"

    joblib.dump({"model": cb_cal, "type": "recovery", "version": version}, f"{out_dir}/recovery_primary.joblib")
    joblib.dump({"model": xgb, "type": "recovery_benchmark", "version": version}, f"{out_dir}/recovery_xgboost.joblib")
    joblib.dump({"model": logreg, "type": "recovery_baseline", "version": version}, f"{out_dir}/recovery_logreg.joblib")

    # ---------------- Action head: best_action | case ----------------
    Xa_tr, Xa_te = tr[CASE_FEATURES].copy(), te[CASE_FEATURES].copy()
    le = LabelEncoder().fit(ACTIONS)
    ya_tr, ya_te = le.transform(tr["best_action"]), le.transform(te["best_action"])

    def multi_metrics(clf, name):
        pred = clf.predict(Xa_te)
        pred = pred.ravel() if hasattr(pred, "ravel") else pred
        pred = pred.astype(int)
        m = {
            "accuracy": round(float(accuracy_score(ya_te, pred)), 4),
            "f1_macro": round(float(f1_score(ya_te, pred, average="macro")), 4),
            "f1_weighted": round(float(f1_score(ya_te, pred, average="weighted")), 4),
        }
        metrics["action"][name] = m
        return m

    print("action: logistic regression (baseline)...")
    a_logreg = Pipeline([("pre", pre(CATEGORICAL, NUMERIC, True)), ("clf", LogisticRegression(max_iter=2000, random_state=RS))])
    a_logreg.fit(Xa_tr, ya_tr)
    multi_metrics(a_logreg, "logistic_regression")

    print("action: xgboost (benchmark)...")
    a_xgb = Pipeline(
        [
            ("pre", pre(CATEGORICAL, NUMERIC, False)),
            ("clf", XGBClassifier(n_estimators=400, max_depth=6, learning_rate=0.1, subsample=0.9, colsample_bytree=0.8, objective="multi:softprob", num_class=len(ACTIONS), eval_metric="mlogloss", tree_method="hist", random_state=RS)),
        ]
    )
    a_xgb.fit(Xa_tr, ya_tr)
    multi_metrics(a_xgb, "xgboost")

    print("action: catboost (primary)...")
    a_cb = CatBoostClassifier(iterations=600, depth=6, learning_rate=0.08, loss_function="MultiClass", cat_features=CATEGORICAL, verbose=0, random_seed=RS, allow_writing_files=False)
    a_cb.fit(Xa_tr, ya_tr)
    multi_metrics(a_cb, "catboost")
    metrics["action"]["primary"] = "catboost"
    metrics["action"]["classes"] = list(le.classes_)

    # Feature importance for the glass-box story.
    imp = sorted(zip(Xa_tr.columns, a_cb.get_feature_importance()), key=lambda kv: -kv[1])[:12]
    metrics["action"]["top_features"] = [{"feature": f, "importance": round(float(v), 2)} for f, v in imp]

    # Agreement: action head's pick vs argmax over per-action calibrated recovery probs.
    print("action: computing agreement with recovery-EV argmax...")
    per_action = np.column_stack([cb_cal.predict_proba(with_action(Xa_te, a))[:, 1] for a in ACTIONS])
    ev_pick = per_action.argmax(axis=1)
    head_pick = a_cb.predict(Xa_te).ravel().astype(int)
    ev_actions = np.array([le.transform([a])[0] for a in ACTIONS])[ev_pick]
    metrics["action"]["agreement_with_ev_argmax"] = round(float((head_pick == ev_actions).mean()), 4)

    joblib.dump({"model": a_cb, "type": "action", "classes": list(le.classes_), "version": version}, f"{out_dir}/action_primary.joblib")
    joblib.dump({"model": a_xgb, "type": "action_benchmark", "classes": list(le.classes_), "version": version}, f"{out_dir}/action_xgboost.joblib")
    joblib.dump({"model": a_logreg, "type": "action_baseline", "classes": list(le.classes_), "version": version}, f"{out_dir}/action_logreg.joblib")

    # ---------------- Escalation head ----------------
    print("escalation: catboost + CalibratedClassifierCV(FrozenEstimator, sigmoid)...")
    yesc_tr, yesc_te = 1 - tr["automated_recoverable"].values, 1 - te["automated_recoverable"].values
    e_fit, e_cal = train_test_split(Xa_tr.index, test_size=0.2, random_state=RS, stratify=yesc_tr)
    esc_raw = CatBoostClassifier(iterations=300, depth=5, learning_rate=0.1, cat_features=CATEGORICAL, verbose=0, random_seed=RS, allow_writing_files=False)
    esc_raw.fit(Xa_tr.loc[e_fit], (1 - tr.loc[e_fit, "automated_recoverable"]).values)
    esc = CalibratedClassifierCV(FrozenEstimator(esc_raw), method="sigmoid")
    esc.fit(Xa_tr.loc[e_cal], (1 - tr.loc[e_cal, "automated_recoverable"]).values)
    metrics["escalation"]["catboost_calibrated"] = bin_metrics(yesc_te, esc.predict_proba(Xa_te)[:, 1])
    joblib.dump({"model": esc, "type": "escalation", "version": version}, f"{out_dir}/escalation_primary.joblib")

    # ---------------- IsolationForest: per-case ----------------
    print("anomaly: IsolationForest per-case...")
    if_pre = pre(CATEGORICAL, NUMERIC, False)
    Z_tr = if_pre.fit_transform(Xa_tr)
    iforest = IsolationForest(n_estimators=200, contamination=0.02, random_state=RS).fit(Z_tr)
    dec_te = iforest.decision_function(if_pre.transform(Xa_te))
    metrics["anomaly"]["case"] = {
        "flagged_rate_test": round(float((dec_te < 0).mean()), 4),
        "score_note": "anomaly_score = sigmoid(-4*decision_function); >0.5 ~ anomalous",
    }
    joblib.dump({"pre": if_pre, "model": iforest, "type": "iforest_case", "version": version}, f"{out_dir}/iforest_case.joblib")

    # ---------------- IsolationForest: failure-spike windows ----------------
    print("anomaly: IsolationForest on windowed failure counts...")
    dfw = df.copy()
    dfw["window"] = dfw["day_index"] * 6 + (dfw["hour_of_day"] // 4)  # 4-hour windows
    counts = dfw.pivot_table(index="window", columns="failure_reason", values="recovered", aggfunc="count").fillna(0)
    counts = counts.reindex(columns=sorted(set(df["failure_reason"])), fill_value=0)
    # Standardize each reason column so a spike in ONE reason stands out regardless
    # of the window's total volume (which varies naturally by hour/day).
    win_mean = counts.mean()
    win_std = counts.std().replace(0, 1e-9)
    Zc = (counts - win_mean) / win_std
    ifw = IsolationForest(n_estimators=200, contamination=0.04, random_state=RS).fit(Zc.values)
    flags = ifw.predict(Zc.values) == -1

    incident_windows = set(dfw.loc[dfw["incident_reason"].fillna("none") != "none", "window"])
    flagged = set(counts.index[flags])
    hit = len(incident_windows & flagged) / max(len(incident_windows), 1)
    metrics["anomaly"]["window"] = {
        "windows": int(len(counts)),
        "flagged": int(flags.sum()),
        "injected_incident_windows": len(incident_windows),
        "incident_detection_rate": round(float(hit), 4),
        "baseline_mean": {k: round(float(v), 2) for k, v in counts.mean().items()},
        "baseline_std": {k: round(float(v), 2) for k, v in counts.std().items()},
    }
    joblib.dump(
        {"model": ifw, "type": "iforest_window", "reasons": list(counts.columns), "baseline_mean": counts.mean().to_dict(), "baseline_std": counts.std().to_dict(), "version": version},
        f"{out_dir}/iforest_window.joblib",
    )

    metrics["train_seconds"] = round(time.time() - t0, 1)
    with open(f"{out_dir}/metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)
    with open("ml/metrics.json", "w") as f:  # git-tracked copy
        json.dump(metrics, f, indent=2)

    print(json.dumps({k: metrics[k] for k in ("recovery", "action", "escalation")}, indent=2))
    print(f"DONE in {metrics['train_seconds']}s -> {out_dir}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="ml/data/train.csv")
    ap.add_argument("--out", default="ml/artifacts")
    args = ap.parse_args()
    main(args.data, args.out)
