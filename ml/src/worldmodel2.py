"""
Second, INDEPENDENT synthetic world for Sentinel — a robustness check on the eval.

The primary world (`worldmodel.py`) is *reason-dominated*: the best recovery action is
almost entirely a function of the failure reason (a `reason x action` fit matrix), so a
plain reason->action lookup is near-optimal and ML has little to add. That is honest but it
also means the eval's ground-truth and the "rules-only" baseline share the same structure.

This world is authored independently and with a DIFFERENT causal mechanism: the best action
is driven by a **latent customer archetype** (how a person actually responds to recovery),
modulated by amount and timing — NOT by the failure reason. The archetype leaks into
*observable* customer features (segment, historical conversion rate, prior failures), so a
model that reads those features can infer it, while a reason-only rule cannot. It is the same
row schema as world A (drop-in for train.py / eval.py), so we can ask a clean question:

  does the ML's edge over a rules baseline EMERGE when the optimal action depends on context
  beyond the failure reason? (Real merchant data is context-driven, not a clean lookup.)

Nothing here imports world A — it is a genuinely separate generator, which is the point.
"""
from __future__ import annotations

import argparse
import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

REASONS = [
    "insufficient_funds", "card_declined", "upi_collect_timeout", "bank_downtime",
    "authentication_failed", "expired_card", "abandoned", "unknown",
]
ACTIONS = ["smart_retry", "send_payment_link", "send_reminder", "offer_incentive", "escalate_to_human", "no_action"]
OUTREACH = {"send_payment_link", "send_reminder", "offer_incentive"}

# Reason sets only the RECOVERABILITY CEILING (is this failure salvageable at all) — flatter
# than world A, and deliberately NOT informative about which action wins.
BASE_RECOVERABILITY = {
    "bank_downtime": 0.62, "upi_collect_timeout": 0.60, "insufficient_funds": 0.52,
    "authentication_failed": 0.50, "abandoned": 0.48, "expired_card": 0.46,
    "card_declined": 0.44, "unknown": 0.40,
}

# The learnable structure: which action recovers a customer depends on their ARCHETYPE.
ARCHETYPES = ["retry_first", "link_click", "reminder_nudge", "discount_driven", "hard_to_reach"]
ARCHETYPE_FIT = {
    "retry_first":     {"smart_retry": 1.55, "send_payment_link": 0.80, "send_reminder": 0.60, "offer_incentive": 0.70, "escalate_to_human": 0.50, "no_action": 0.35},
    "link_click":      {"smart_retry": 0.60, "send_payment_link": 1.55, "send_reminder": 0.95, "offer_incentive": 0.95, "escalate_to_human": 0.50, "no_action": 0.20},
    "reminder_nudge":  {"smart_retry": 0.55, "send_payment_link": 0.95, "send_reminder": 1.55, "offer_incentive": 1.05, "escalate_to_human": 0.50, "no_action": 0.25},
    "discount_driven": {"smart_retry": 0.55, "send_payment_link": 0.95, "send_reminder": 0.95, "offer_incentive": 1.55, "escalate_to_human": 0.50, "no_action": 0.20},
    "hard_to_reach":   {"smart_retry": 0.50, "send_payment_link": 0.55, "send_reminder": 0.55, "offer_incentive": 0.65, "escalate_to_human": 1.00, "no_action": 0.60},
}
# Per-archetype observable priors (this is the leak that makes the archetype learnable).
ARCHETYPE_PROFILE = {
    "retry_first":     {"conv": (0.62, 0.88), "failed": (0, 1), "optout": 0.02, "loyalty": 0.85},
    "link_click":      {"conv": (0.48, 0.68), "failed": (0, 2), "optout": 0.03, "loyalty": 0.60},
    "reminder_nudge":  {"conv": (0.30, 0.48), "failed": (0, 3), "optout": 0.06, "loyalty": 0.38},
    "discount_driven": {"conv": (0.15, 0.36), "failed": (1, 5), "optout": 0.08, "loyalty": 0.25},
    "hard_to_reach":   {"conv": (0.02, 0.16), "failed": (2, 6), "optout": 0.38, "loyalty": 0.15},
}
ARCHETYPE_WEIGHTS = [0.22, 0.24, 0.20, 0.20, 0.14]

METHOD_BY_REASON = {
    "insufficient_funds": [("card", 0.5), ("upi", 0.5)], "card_declined": [("card", 1.0)],
    "upi_collect_timeout": [("upi", 1.0)], "bank_downtime": [("upi", 0.6), ("netbanking", 0.3), ("card", 0.1)],
    "authentication_failed": [("card", 0.8), ("netbanking", 0.2)], "expired_card": [("card", 1.0)],
    "abandoned": [("upi", 0.6), ("card", 0.3), ("wallet", 0.1)], "unknown": [("card", 0.4), ("upi", 0.4), ("wallet", 0.2)],
}
MERCHANTS = [("UrbanKart", "retail"), ("Chai Point", "food_delivery"), ("FitClub", "fitness"), ("BookNook", "books"), ("MedPlus Express", "pharmacy")]
MERCHANT_PAST_RECOVERY = {"retail": 0.34, "food_delivery": 0.42, "fitness": 0.28, "books": 0.31, "pharmacy": 0.38}
REASON_WEIGHTS = [0.13, 0.15, 0.20, 0.12, 0.11, 0.06, 0.18, 0.05]
HOUR_WEIGHTS = np.array([1, 1, 0.5, 0.4, 0.4, 0.6, 1, 2, 3, 4, 5, 6, 6, 5, 4, 4, 5, 6, 8, 9, 9, 7, 4, 2], dtype=float)
HOUR_WEIGHTS /= HOUR_WEIGHTS.sum()
INCIDENTS = [
    (10, 4, "bank_downtime", 14.0), (18, 2, "upi_collect_timeout", 15.0), (26, 5, "card_declined", 12.0),
    (34, 3, "bank_downtime", 13.0), (42, 4, "upi_collect_timeout", 15.0), (50, 1, "authentication_failed", 12.0),
    (54, 4, "card_declined", 13.0), (58, 3, "bank_downtime", 14.0),
]
COST = {"smart_retry": 3.0, "send_payment_link": 6.0, "send_reminder": 4.0, "offer_incentive": 6.0, "escalate_to_human": 50.0, "no_action": 0.0}


@dataclass
class Customer:
    idx: int
    archetype: str
    prior_payments: int
    conv_rate: float
    prior_failed: int
    opted_out: bool

    @property
    def segment(self) -> str:
        if self.prior_payments == 0:
            return "new"
        if self.prior_payments < 6:
            return "occasional"
        return "loyal"


def success_prob(row: dict, action: str, rng: np.random.Generator | None = None) -> float:
    """p(recover | case, action) — driven by the customer ARCHETYPE, not the failure reason."""
    p = BASE_RECOVERABILITY[row["failure_reason"]] * ARCHETYPE_FIT[row["_archetype"]][action]

    # Amount: large orders realistically need a human hand-off regardless of archetype;
    # mid-size orders are where an incentive pays off.
    amt = row["order_value"]
    if amt >= 25000:
        p *= 1.35 if action == "escalate_to_human" else 0.80
    elif 1000 <= amt <= 20000 and action == "offer_incentive":
        p *= 1.15
    p *= 1.0 - 0.12 * min(amt / 50000.0, 1.0)

    # Timing: retry-first customers convert far better in evening / salary hours; reminder-driven
    # customers respond on weekends.
    if row["_archetype"] == "retry_first" and action == "smart_retry" and 18 <= row["hour_of_day"] <= 23:
        p *= 1.30
    if row["_archetype"] == "reminder_nudge" and action in ("send_reminder", "offer_incentive") and row["day_of_week"] >= 5:
        p *= 1.15

    # Opted-out customers ignore outreach (retries are unaffected — no message).
    if row["opt_out_flag"] and action in OUTREACH:
        p *= 0.25
    # Retry fatigue and staleness.
    p *= 0.82 ** row["retry_count"]
    p *= 1.0 - min(row["time_since_failure_min"] / (96 * 60), 0.5)
    p *= 0.92 + 0.28 * row["past_recovery_rate"]

    if rng is not None:
        p *= float(np.exp(rng.normal(0.0, 0.08)))
    return float(np.clip(p, 0.01, 0.97))


def _amount_rupees(rng: np.random.Generator) -> float:
    r = rng.random()
    if r < 0.06:
        return float(rng.integers(15, 96))
    if r < 0.72:
        return float(rng.integers(200, 5001))
    if r < 0.93:
        return float(rng.integers(5000, 25001))
    return float(rng.integers(25000, 75001))


def _weighted_choice(rng, pairs):
    keys = [k for k, _ in pairs]
    w = np.array([v for _, v in pairs], dtype=float)
    return keys[rng.choice(len(keys), p=w / w.sum())]


def _make_customers(rng, n=4000):
    customers = []
    for i in range(n):
        arch = ARCHETYPES[int(rng.choice(len(ARCHETYPES), p=ARCHETYPE_WEIGHTS))]
        prof = ARCHETYPE_PROFILE[arch]
        # loyalty drives prior_payments (hence segment); conv/failed leak the archetype.
        prior_payments = int(rng.integers(0, 26) * prof["loyalty"] + rng.integers(0, 3))
        conv = float(np.clip(rng.uniform(*prof["conv"]) + rng.normal(0, 0.05), 0.0, 0.98))
        failed = int(rng.integers(prof["failed"][0], prof["failed"][1] + 1))
        opted = bool(rng.random() < prof["optout"])
        customers.append(Customer(i, arch, prior_payments, round(conv, 3), failed, opted))
    return customers


def generate(n_rows: int = 30000, seed: int = 11, days: int = 60) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    customers = _make_customers(rng)
    reason_w = np.array(REASON_WEIGHTS, dtype=float)
    rows = []
    for _ in range(n_rows):
        day = int(rng.integers(0, days))
        hour = int(rng.choice(24, p=HOUR_WEIGHTS))
        dow = day % 7
        wod = hour // 4

        in_incident = "none"
        w = reason_w.copy()
        for (iday, iwod, ireason, mult) in INCIDENTS:
            if day == iday and wod == iwod:
                w[REASONS.index(ireason)] *= mult
                in_incident = ireason
        reason = REASONS[int(rng.choice(len(REASONS), p=w / w.sum()))]

        cust = customers[int(rng.integers(0, len(customers)))]
        merchant, mtype = MERCHANTS[int(rng.integers(0, len(MERCHANTS)))]
        method = _weighted_choice(rng, METHOD_BY_REASON[reason])
        amount = _amount_rupees(rng)
        retry_count = int(rng.choice([0, 1, 2, 3], p=[0.62, 0.22, 0.11, 0.05]))
        tsf_min = float(rng.integers(5, 48 * 60))
        prev_contact = int(rng.choice([0, 1, 2], p=[0.7, 0.22, 0.08]))
        last_action = "none" if prev_contact == 0 else str(rng.choice(["send_reminder", "send_payment_link", "smart_retry"]))
        last_outcome = "none" if prev_contact == 0 else str(rng.choice(["no_response", "failed"], p=[0.7, 0.3]))

        row = {
            "amount": math.log10(amount + 1), "order_value": amount, "currency": "INR",
            "payment_method": method, "failure_reason": reason, "retry_count": retry_count,
            "time_since_failure_min": tsf_min, "case_age_min": tsf_min, "hour_of_day": hour, "day_of_week": dow,
            "customer_segment": cust.segment, "merchant_type": mtype, "past_recovery_rate": MERCHANT_PAST_RECOVERY[mtype],
            "historical_conversion_rate": round(cust.conv_rate, 3), "prior_failed_attempts": cust.prior_failed,
            "opt_out_flag": int(cust.opted_out), "channel": "checkout" if reason != "abandoned" else "cart",
            "previous_contact_attempts": prev_contact, "last_action_type": last_action, "last_action_outcome": last_outcome,
            "urgency_score": round(100 * max(0.0, min(1.0, 0.6 * BASE_RECOVERABILITY[reason] + 0.4 * (1 - tsf_min / (48 * 60)) - retry_count * 0.1)), 1),
            "incident_reason": in_incident, "day_index": day,
            "_archetype": cust.archetype,  # latent ground-truth driver — NOT a model feature (underscore-prefixed)
        }

        p_by_action = {a: success_prob(row, a) for a in ACTIONS}
        p_noisy = {a: float(np.clip(p_by_action[a] * np.exp(rng.normal(0.0, 0.22)), 0.01, 0.98)) for a in ACTIONS}

        def ev(a: str, probs: dict) -> float:
            collectable = amount * (0.95 if a == "offer_incentive" else 1.0)
            return probs[a] * collectable - COST[a]

        best_action = max(ACTIONS, key=lambda a: ev(a, p_noisy))

        if rng.random() < 0.70:
            logits = np.array([p_by_action[a] for a in ACTIONS]) * 8.0
            probs = np.exp(logits - logits.max()); probs /= probs.sum()
            taken = ACTIONS[int(rng.choice(len(ACTIONS), p=probs))]
        else:
            taken = ACTIONS[int(rng.integers(0, len(ACTIONS)))]

        recovered = int(rng.random() < success_prob(row, taken, rng))
        automated = [a for a in ACTIONS if a not in ("escalate_to_human", "no_action")]
        automated_recoverable = int(max(p_noisy[a] for a in automated) >= 0.35)

        # `_archetype` stays as a column: it is the world's latent ground-truth driver that eval.py's
        # scorer reads, but it is NOT in features.CASE_FEATURES, so no model ever trains on it.
        row.update({"action_taken": taken, "recovered": recovered, "best_action": best_action,
                    "automated_recoverable": automated_recoverable, "true_p_taken": round(p_by_action[taken], 4)})
        rows.append(row)

    return pd.DataFrame(rows)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=30000)
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--out", default="ml/data/train_v2.csv")
    args = ap.parse_args()
    df = generate(args.rows, args.seed)
    df.to_csv(args.out, index=False)
    print(f"world-v2: wrote {len(df)} rows -> {args.out}  (recovered rate {df.recovered.mean():.3f})")
