"""
Conformal per-case certainty — a coverage GUARANTEE no competitor ships.

A calibrated probability tells you the model's best guess; it does not tell you, for THIS case, a set
that is guaranteed to contain the truth. Split conformal prediction does: from a held-out calibration
set we derive a threshold q such that, for any new case, the prediction set {will-recover / will-not}
covers the real outcome with probability ≥ 90% (distribution-free, finite-sample). Each case then
resolves to one of three actionable states:
  • {recoverable}      — confidently worth pursuing
  • {not recoverable}  — confidently not worth spending on
  • {both} = uncertain — route to a human instead of guessing
We report the TARGET coverage and the EMPIRICAL coverage on a fresh test split — the guarantee, checked.

Run:  ml/.venv/Scripts/python ml/src/conformal.py   →   ml/conformal.json
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone

import numpy as np
from catboost import CatBoostClassifier

from features import RECOVERY_CATEGORICAL, recovery_frame
from worldmodel import generate

RS = 42


def main(out_dir: str, alpha: float) -> None:
    t0 = time.time()
    version = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    df = generate(24000, seed=13)
    # Time-ordered train / calibration / test — calibration and test are strictly "the future".
    order = df.sort_values("day_index", kind="stable").index
    n = len(order)
    tr = df.loc[order[: int(n * 0.6)]]
    cal = df.loc[order[int(n * 0.6) : int(n * 0.8)]]
    te = df.loc[order[int(n * 0.8) :]]

    model = CatBoostClassifier(iterations=400, depth=6, learning_rate=0.08, cat_features=RECOVERY_CATEGORICAL, verbose=0, random_seed=RS, allow_writing_files=False)
    model.fit(recovery_frame(tr), tr["recovered"].values)

    # Split-conformal: nonconformity = 1 − P(true label). q̂ is the (1−α) quantile with the finite-sample correction.
    p_cal = model.predict_proba(recovery_frame(cal))[:, 1]
    y_cal = cal["recovered"].values.astype(int)
    scores = np.where(y_cal == 1, 1.0 - p_cal, p_cal)
    m = len(scores)
    level = min(1.0, np.ceil((m + 1) * (1 - alpha)) / m)
    qhat = float(np.quantile(scores, level, method="higher"))

    # Test-set prediction sets + empirical coverage against the real outcomes.
    p_te = model.predict_proba(recovery_frame(te))[:, 1]
    y_te = te["recovered"].values.astype(int)
    include_1 = p_te >= (1.0 - qhat)
    include_0 = (1.0 - p_te) >= (1.0 - qhat)
    covered = np.where(y_te == 1, include_1, include_0)
    set_size = include_1.astype(int) + include_0.astype(int)

    report = {
        "version": version,
        "method": "split conformal prediction on the recovery head (distribution-free, finite-sample)",
        "target_coverage_pct": round((1 - alpha) * 100, 1),
        "empirical_coverage_pct": round(float(covered.mean()) * 100, 1),
        "qhat": round(qhat, 4),
        "calibration_rows": m,
        "test_rows": len(te),
        "avg_set_size": round(float(set_size.mean()), 3),
        "buckets_pct": {
            "confident_recoverable": round(float((include_1 & ~include_0).mean()) * 100, 1),
            "confident_not_recoverable": round(float((include_0 & ~include_1).mean()) * 100, 1),
            "uncertain_route_to_human": round(float((include_1 & include_0).mean()) * 100, 1),
        },
        "note": "empirical coverage should land at or above target — the guarantee, checked on a fresh split. Uncertain cases are the honest hand-off, not a forced guess.",
        "train_seconds": round(time.time() - t0, 1),
    }

    os.makedirs(out_dir, exist_ok=True)
    with open(f"{out_dir}/conformal.json", "w") as f:
        json.dump(report, f, indent=2)
    if out_dir.rstrip("/").endswith("artifacts"):
        with open("ml/conformal.json", "w") as f:
            json.dump(report, f, indent=2)
    print(json.dumps({k: report[k] for k in ("target_coverage_pct", "empirical_coverage_pct", "avg_set_size", "buckets_pct")}, indent=2))
    print(f"DONE in {report['train_seconds']}s -> {out_dir}/conformal.json")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="ml/artifacts")
    ap.add_argument("--alpha", type=float, default=0.1)
    main(ap.parse_args().out, ap.parse_args().alpha)
