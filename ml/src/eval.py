"""
Counterfactual recovery evaluation — the honest "recovered vs. WHAT?" answer.

The buildathon bar for Track 03 is "measured money recovered across a batch", and the
weakest way to claim it is a single number from a simulator that grades itself. So this
script does the opposite:

  * It evaluates on the TIME-ORDERED held-out split (the latest ~20% of days), the same
    split train.py trains against — never on rows the models saw.
  * It scores every arm with the WORLD's ground-truth mechanism `success_prob(row, action)`
    from worldmodel.py — NOT the model's own prediction. The ML model only gets to CHOOSE
    the action; whether that action recovers the money is decided by the independent world.
    That breaks the circularity ("the model grading itself").
  * It reports four arms and, crucially, the INCREMENTAL LIFT of the ML+policy arm over a
    rules-only baseline (and over do-nothing), with 95% bootstrap confidence intervals —
    "recovered versus what", net of action cost, plus a wasted-incentive (false-positive)
    figure.

Arms:
  no_action    every case gets no treatment          (the leak floor)
  rules_only   deterministic error-reason triage       (Razorpay-default-style baseline)
  ml_policy    CatBoost action head + the hard-decline policy guard   (the product)
  oracle       the best action per case by ground truth (the achievable ceiling)

Run:  ml/.venv/Scripts/python ml/src/eval.py     (after train.py has written artifacts)
Writes ml/eval.json and prints a table.
"""
from __future__ import annotations

import argparse
import json

import joblib
import numpy as np
import pandas as pd

from features import CASE_FEATURES
from worldmodel import success_prob, ACTIONS

# Pursuit actions an autonomous agent may take (escalate_to_human is a hand-off, not a
# money-recovery action, so it is excluded from the automated arms' action space).
PURSUIT = ["smart_retry", "send_payment_link", "send_reminder", "offer_incentive", "no_action"]

HARD_DECLINE = {"card_declined", "expired_card", "authentication_failed"}
AUTO_RETRIABLE = {"bank_downtime", "upi_collect_timeout", "insufficient_funds"}

# Small fixed per-action operating cost in rupees (gateway hit / message send / human time).
ACTION_COST = {
    "smart_retry": 2.0,
    "send_payment_link": 1.0,
    "send_reminder": 0.5,
    "offer_incentive": 1.0,
    "escalate_to_human": 50.0,
    "no_action": 0.0,
}
INCENTIVE_PCT = 0.10  # offer_incentive gives 10% off, so we collect 90% on success


def rules_only_action(row: dict) -> str:
    """Deterministic error-reason triage — the rules-only baseline (no model)."""
    r = row["failure_reason"]
    if r == "abandoned":
        return "send_reminder"
    if r in AUTO_RETRIABLE:
        return "smart_retry"
    # hard declines and everything else: a retry won't clear it — send a fresh link.
    return "send_payment_link"


def apply_policy_guard(action: str, row: dict) -> str:
    """The deterministic hard-decline guard the real policy engine enforces:
    a smart_retry on a non-auto-retriable failure is overridden to a fresh link."""
    if action == "smart_retry" and row["failure_reason"] not in AUTO_RETRIABLE:
        return "send_payment_link"
    return action


def collected(row: dict, action: str) -> float:
    """Ground-truth expected rupees collected if this action is taken on this case."""
    if action == "escalate_to_human":
        action = "send_payment_link"  # a human would send a link; approximate
    p = success_prob(row, action)  # rng=None -> the deterministic world mechanism
    gross = p * row["order_value"]
    if action == "offer_incentive":
        gross *= (1.0 - INCENTIVE_PCT)  # we collect less when we discount
    return gross


def arm_net(rows: list[dict], actions: list[str]) -> np.ndarray:
    """Per-case NET rupees (collected minus action cost) for an arm's action choices."""
    return np.array([collected(r, a) - ACTION_COST[a] for r, a in zip(rows, actions)], dtype=float)


def wasted_incentive(rows: list[dict], actions: list[str]) -> float:
    """False-positive cost: incentive discount spent on cases that would very likely have
    recovered anyway (ground-truth no-action recovery >= 0.5)."""
    total = 0.0
    for r, a in zip(rows, actions):
        if a == "offer_incentive" and success_prob(r, "no_action") >= 0.5:
            total += INCENTIVE_PCT * r["order_value"] * success_prob(r, a)
    return total


def boot_ci(diff: np.ndarray, n: int = 1000, seed: int = 123) -> tuple[float, float, float]:
    """95% bootstrap CI for the mean of a per-case difference vector (resample cases)."""
    rng = np.random.default_rng(seed)
    idx = np.arange(len(diff))
    means = np.array([diff[rng.choice(idx, size=len(idx), replace=True)].sum() for _ in range(n)])
    return float(diff.sum()), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def main(data_path: str, art: str, out_path: str) -> None:
    df = pd.read_csv(data_path)

    # Same time-ordered held-out split as train.py.
    order = df.sort_values("day_index", kind="stable").index
    test = df.loc[order[int(len(order) * 0.8):]].reset_index(drop=True)
    rows = test.to_dict("records")
    n = len(rows)

    # Arm 1 (as-deployed action head): the CatBoost multiclass argmax over allowed actions.
    abundle = joblib.load(f"{art}/action_primary.joblib")
    amodel, classes = abundle["model"], abundle["classes"]
    aproba = amodel.predict_proba(test[CASE_FEATURES])
    allowed_idx = [i for i, c in enumerate(classes) if c in PURSUIT]
    ml_head = [apply_policy_guard(classes[max(allowed_idx, key=lambda i: aproba[k][i])], rows[k]) for k in range(n)]

    # Arm 2 (calibrated-EV, the project's centerpiece): pick the action maximizing the MODEL's
    # own calibrated per-action recovery probability × value − cost. Mirrors serve.py's ev().
    recovery = joblib.load(f"{art}/recovery_primary.joblib")["model"]
    model_p: dict[str, np.ndarray] = {}
    for a in PURSUIT:
        Xr = test[CASE_FEATURES].copy()
        Xr["action"] = a
        model_p[a] = recovery.predict_proba(Xr)[:, 1]

    def ev_by_model(k: int, a: str) -> float:
        ov = rows[k]["order_value"]
        collectable = ov * ((1.0 - INCENTIVE_PCT) if a == "offer_incentive" else 1.0)
        return model_p[a][k] * collectable - ACTION_COST[a]

    ml_ev = [apply_policy_guard(max(PURSUIT, key=lambda a: ev_by_model(k, a)), rows[k]) for k in range(n)]

    arms = {
        "no_action": ["no_action"] * n,
        "rules_only": [rules_only_action(r) for r in rows],
        "ml_head": ml_head,
        "ml_ev": ml_ev,
        "oracle": [max(PURSUIT, key=lambda a: collected(r, a) - ACTION_COST[a]) for r in rows],
    }
    PRIMARY = "ml_head"  # serve.py's action_class is the CatBoost action head (ev is a fallback)

    at_risk = float(test["order_value"].sum())
    per_case = {name: arm_net(rows, acts) for name, acts in arms.items()}
    report: dict = {
        "split": "time_ordered_by_day_index (latest ~20% of days)",
        "test_cases": n,
        "at_risk_rupees": round(at_risk, 2),
        "ground_truth": "worldmodel.success_prob (independent of the ML model — no self-grading)",
        "arms": {},
    }
    for name, net in per_case.items():
        acts = arms[name]
        gross = sum(collected(r, a) for r, a in zip(rows, acts))
        report["arms"][name] = {
            "net_recovered_rupees": round(float(net.sum()), 2),
            "gross_recovered_rupees": round(float(gross), 2),
            "recovery_rate": round(float(gross / at_risk), 4),
            "action_mix": {a: acts.count(a) for a in sorted(set(acts))},
            "wasted_incentive_rupees": round(wasted_incentive(rows, acts), 2),
        }

    # Incremental lift of the deployed decision (calibrated EV) — "recovered versus what", with CIs.
    def lift(vs: str) -> dict:
        d = per_case[PRIMARY] - per_case[vs]
        total, lo, hi = boot_ci(d)
        return {"net_rupees": round(total, 2), "ci95": [round(lo, 2), round(hi, 2)], "significant": bool(lo > 0 or hi < 0)}

    report["primary_arm"] = PRIMARY
    report["incremental_lift_primary"] = {"vs_rules_only": lift("rules_only"), "vs_no_action": lift("no_action")}
    span = per_case["oracle"].sum() - per_case["no_action"].sum()
    got = per_case[PRIMARY].sum() - per_case["no_action"].sum()
    report["capture_of_oracle_headroom"] = round(float(got / span), 4) if span > 0 else None

    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)

    # ---- console table (ASCII only — Windows consoles choke on the rupee glyph) ----
    print(f"\nCounterfactual recovery eval - {n} held-out cases, Rs {at_risk:,.0f} at risk (time-ordered split)")
    print(f"{'arm':<12} {'net Rs':>16} {'gross Rs':>16} {'recov.rate':>11}")
    for name in ["no_action", "rules_only", "ml_head", "ml_ev", "oracle"]:
        a = report["arms"][name]
        star = "  <- deployed" if name == PRIMARY else ""
        print(f"{name:<12} {a['net_recovered_rupees']:>16,.0f} {a['gross_recovered_rupees']:>16,.0f} {a['recovery_rate']:>10.1%}{star}")
    L = report["incremental_lift_primary"]
    print(f"\nDeployed ({PRIMARY}) incremental lift (net Rs, 95% CI):")
    print(f"  vs rules-only : Rs {L['vs_rules_only']['net_rupees']:>12,.0f}  CI {L['vs_rules_only']['ci95']}  significant={L['vs_rules_only']['significant']}")
    print(f"  vs do-nothing : Rs {L['vs_no_action']['net_rupees']:>12,.0f}  CI {L['vs_no_action']['ci95']}  significant={L['vs_no_action']['significant']}")
    print(f"  captures {report['capture_of_oracle_headroom']:.0%} of the oracle headroom")
    print(f"\nwrote {out_path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="ml/data/train.csv")
    ap.add_argument("--art", default="ml/artifacts")
    ap.add_argument("--out", default="ml/eval.json")
    args = ap.parse_args()
    main(args.data, args.art, args.out)
