"""
Online exploration via contextual Thompson sampling — the roadmap's answer to the bandit crowd.

The offline uplift engine is our production decisioner; this shows the *online* story: a contextual
Thompson sampler (context = failure reason, a Beta posterior per reason×action) that learns which
action recovers best purely from its own experience — no pre-trained model, so no cold-start. It
explores early, exploits as the posteriors sharpen, and its per-case value converges toward the
oracle. This subsumes smit27ai's / seagull's LinUCB with a simpler, well-founded Bayesian method,
and is honest about what it is: a simulation against the same world, reported with real numbers.

Run:  ml/.venv/Scripts/python ml/src/explore.py   →   ml/explore.json
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone

import numpy as np

from worldmodel import success_prob, generate, ACTIONS, REASONS

COST = {"smart_retry": 3.0, "send_payment_link": 6.0, "send_reminder": 4.0, "offer_incentive": 6.0, "escalate_to_human": 50.0, "no_action": 0.0}
AUTO_RETRIABLE = {"bank_downtime", "upi_collect_timeout", "insufficient_funds"}


def collectable(action: str, amount: float) -> float:
    return amount * (0.95 if action == "offer_incentive" else 1.0)


def rules_action(reason: str) -> str:
    if reason == "abandoned":
        return "send_reminder"
    if reason in AUTO_RETRIABLE:
        return "smart_retry"
    return "send_payment_link"


def main(out_dir: str, n: int) -> None:
    t0 = time.time()
    version = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    rows = generate(n, seed=11).to_dict("records")
    rng = np.random.default_rng(3)

    # Beta(1,1) posterior per (reason, action) — a uniform prior we update from realised outcomes.
    alpha = {(r, a): 1.0 for r in REASONS for a in ACTIONS}
    beta = {(r, a): 1.0 for r in REASONS for a in ACTIONS}

    ts_val = 0.0
    oracle_val = 0.0
    random_val = 0.0
    rules_val = 0.0
    curve = []

    for i, row in enumerate(rows):
        r = row["failure_reason"]
        amt = row["order_value"]

        # Thompson: sample a success rate per action, choose the max expected-value action.
        ev = {a: rng.beta(alpha[(r, a)], beta[(r, a)]) * collectable(a, amt) - COST[a] for a in ACTIONS}
        a_ts = max(ev, key=lambda a: ev[a])
        recovered = rng.random() < success_prob(row, a_ts)
        ts_val += (collectable(a_ts, amt) if recovered else 0.0) - COST[a_ts]
        if recovered:
            alpha[(r, a_ts)] += 1
        else:
            beta[(r, a_ts)] += 1

        # Baselines on the same case (expected value; no posterior update).
        oracle_val += max(success_prob(row, a) * collectable(a, amt) - COST[a] for a in ACTIONS)
        a_rand = ACTIONS[int(rng.integers(0, len(ACTIONS)))]
        random_val += success_prob(row, a_rand) * collectable(a_rand, amt) - COST[a_rand]
        a_rules = rules_action(r)
        rules_val += success_prob(row, a_rules) * collectable(a_rules, amt) - COST[a_rules]

        if (i + 1) % max(1, n // 20) == 0:
            curve.append({"n": i + 1, "ts_pct_of_oracle": round(ts_val / oracle_val * 100, 1) if oracle_val > 0 else 0.0})

    # Did online exploration recover the world's true best action per reason?
    def true_best(reason: str) -> str:
        sub = [row for row in rows if row["failure_reason"] == reason][:400]
        rates = {a: float(np.mean([success_prob(row, a) for row in sub])) for a in ACTIONS}
        return max(rates, key=lambda a: rates[a])

    learned = {r: max(ACTIONS, key=lambda a: alpha[(r, a)] / (alpha[(r, a)] + beta[(r, a)])) for r in REASONS}
    truth = {r: true_best(r) for r in REASONS}
    correct = sum(1 for r in REASONS if learned[r] == truth[r])

    report = {
        "version": version,
        "method": "contextual Thompson sampling (Beta posterior per reason×action), online — no pre-training",
        "cases": n,
        "value_per_case_inr": {
            "thompson_online": round(ts_val / n, 1),
            "rules_only": round(rules_val / n, 1),
            "random": round(random_val / n, 1),
            "oracle": round(oracle_val / n, 1),
        },
        "ts_pct_of_oracle_final": round(ts_val / oracle_val * 100, 1) if oracle_val > 0 else 0.0,
        "convergence": curve,
        "learned_best_action_accuracy": {"correct": correct, "total": len(REASONS)},
        "note": "value is expected net ₹ per case on a held-out synthetic stream; TS starts from a uniform prior and learns online",
        "train_seconds": round(time.time() - t0, 1),
    }

    os.makedirs(out_dir, exist_ok=True)
    with open(f"{out_dir}/explore.json", "w") as f:
        json.dump(report, f, indent=2)
    if out_dir.rstrip("/").endswith("artifacts"):
        with open("ml/explore.json", "w") as f:
            json.dump(report, f, indent=2)
    print(json.dumps({k: report[k] for k in ("value_per_case_inr", "ts_pct_of_oracle_final", "learned_best_action_accuracy")}, indent=2))
    print(f"DONE in {report['train_seconds']}s -> {out_dir}/explore.json")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="ml/artifacts")
    ap.add_argument("--n", type=int, default=8000)
    main(ap.parse_args().out, ap.parse_args().n)
