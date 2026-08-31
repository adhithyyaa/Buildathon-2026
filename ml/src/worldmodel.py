"""
Synthetic world model for Overwatch's ML training data.

Generates a labeled dataset of at-risk payments with REAL causal structure so
tabular models can genuinely learn (and be honestly evaluated on a held-out set):

  - per-reason base recoverability,
  - a reason x action "fit" matrix (the key learnable interaction),
  - customer history, retry decay, opt-out, amount, staleness and time-of-day effects,
  - an off-policy behavior log (the historical "action taken" is only sometimes optimal),
  - injected incident windows (failure spikes) for anomaly detection.

Ground-truth labels per row:
  recovered            - Bernoulli draw from p(recover | case, action_taken)
  best_action          - argmax over per-action EXPECTED NET VALUE:
                         EV(a) = p(a) * collectable(a) - cost(a)
                         (incentives cost 5% of the order + a send fee; escalation
                         costs human time; doing nothing is free) — so "reminder"
                         beats "incentive" unless the incentive moves probability
                         enough to pay for itself, and tiny orders label no_action
  automated_recoverable- 1 if some automated action clears a success threshold
                         (escalation_probability = P(not automated_recoverable))

The generative process is documented here precisely BECAUSE the honest claim is:
"the pipeline is real; the history is synthetic — swap the CSV for merchant
exports and retrain."
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

REASONS = [
    "insufficient_funds",
    "card_declined",
    "upi_collect_timeout",
    "bank_downtime",
    "authentication_failed",
    "expired_card",
    "abandoned",
    "unknown",
]

ACTIONS = [
    "smart_retry",
    "send_payment_link",
    "send_reminder",
    "offer_incentive",
    "escalate_to_human",
    "no_action",
]

OUTREACH = {"send_payment_link", "send_reminder", "offer_incentive"}

METHOD_BY_REASON = {
    "insufficient_funds": [("card", 0.5), ("upi", 0.5)],
    "card_declined": [("card", 1.0)],
    "upi_collect_timeout": [("upi", 1.0)],
    "bank_downtime": [("upi", 0.6), ("netbanking", 0.3), ("card", 0.1)],
    "authentication_failed": [("card", 0.8), ("netbanking", 0.2)],
    "expired_card": [("card", 1.0)],
    "abandoned": [("upi", 0.6), ("card", 0.3), ("wallet", 0.1)],
    "unknown": [("card", 0.4), ("upi", 0.4), ("wallet", 0.2)],
}

# Base probability that this failure is recoverable AT ALL (before action fit).
BASE_RECOVERABILITY = {
    "bank_downtime": 0.70,
    "upi_collect_timeout": 0.62,
    "insufficient_funds": 0.45,
    "authentication_failed": 0.50,
    "abandoned": 0.42,
    "expired_card": 0.38,
    "card_declined": 0.35,
    "unknown": 0.30,
}

# Reason x action fit multipliers — the interaction the models must discover.
ACTION_FIT = {
    "bank_downtime":        {"smart_retry": 1.35, "send_payment_link": 0.80, "send_reminder": 0.60, "offer_incentive": 0.85, "escalate_to_human": 0.55, "no_action": 0.25},
    "upi_collect_timeout":  {"smart_retry": 1.30, "send_payment_link": 0.90, "send_reminder": 0.70, "offer_incentive": 0.90, "escalate_to_human": 0.55, "no_action": 0.20},
    "insufficient_funds":   {"smart_retry": 1.15, "send_payment_link": 0.90, "send_reminder": 0.75, "offer_incentive": 1.00, "escalate_to_human": 0.55, "no_action": 0.20},
    "card_declined":        {"smart_retry": 0.55, "send_payment_link": 1.30, "send_reminder": 0.80, "offer_incentive": 1.15, "escalate_to_human": 0.60, "no_action": 0.15},
    "expired_card":         {"smart_retry": 0.30, "send_payment_link": 1.35, "send_reminder": 0.70, "offer_incentive": 1.00, "escalate_to_human": 0.65, "no_action": 0.15},
    "authentication_failed":{"smart_retry": 0.70, "send_payment_link": 1.25, "send_reminder": 0.80, "offer_incentive": 0.90, "escalate_to_human": 0.55, "no_action": 0.20},
    "abandoned":            {"smart_retry": 0.40, "send_payment_link": 1.00, "send_reminder": 1.25, "offer_incentive": 1.30, "escalate_to_human": 0.45, "no_action": 0.25},
    "unknown":              {"smart_retry": 0.60, "send_payment_link": 0.90, "send_reminder": 0.70, "offer_incentive": 0.80, "escalate_to_human": 1.00, "no_action": 0.20},
}

MERCHANTS = [
    ("UrbanKart", "retail"),
    ("Chai Point", "food_delivery"),
    ("FitClub", "fitness"),
    ("BookNook", "books"),
    ("MedPlus Express", "pharmacy"),
]

# Merchant-level "recovery culture" (past recovery rate feature; mild real effect).
MERCHANT_PAST_RECOVERY = {"retail": 0.34, "food_delivery": 0.42, "fitness": 0.28, "books": 0.31, "pharmacy": 0.38}

REASON_WEIGHTS = [0.13, 0.15, 0.20, 0.12, 0.11, 0.06, 0.18, 0.05]  # aligned with REASONS

# Hour-of-day intensity for failures (shopping evening peak).
HOUR_WEIGHTS = np.array([1, 1, 0.5, 0.4, 0.4, 0.6, 1, 2, 3, 4, 5, 6, 6, 5, 4, 4, 5, 6, 8, 9, 9, 7, 4, 2], dtype=float)
HOUR_WEIGHTS /= HOUR_WEIGHTS.sum()

# Injected incidents, each a concentrated 4-hour window (day, window-of-day 0..5,
# reason, multiplier). These are the failure spikes IsolationForest must find.
INCIDENTS = [
    (12, 4, "bank_downtime", 14.0),
    (20, 2, "upi_collect_timeout", 16.0),
    (28, 5, "card_declined", 12.0),
    (33, 3, "bank_downtime", 12.0),
    (41, 4, "upi_collect_timeout", 15.0),
    (47, 1, "authentication_failed", 12.0),
    (52, 4, "card_declined", 13.0),
    (57, 3, "bank_downtime", 14.0),
]


@dataclass
class Customer:
    idx: int
    prior_payments: int
    prior_conversions: int
    prior_failed: int
    opted_out: bool

    @property
    def conv_rate(self) -> float:
        return self.prior_conversions / self.prior_payments if self.prior_payments else 0.5

    @property
    def segment(self) -> str:
        if self.prior_payments == 0:
            return "new"
        if self.prior_payments < 6:
            return "occasional"
        return "loyal"


def _weighted_choice(rng: np.random.Generator, pairs):
    keys = [k for k, _ in pairs]
    w = np.array([v for _, v in pairs], dtype=float)
    return keys[rng.choice(len(keys), p=w / w.sum())]


def _amount_rupees(rng: np.random.Generator) -> float:
    r = rng.random()
    if r < 0.06:
        return float(rng.integers(15, 96))            # sub pursuit floor
    if r < 0.72:
        return float(rng.integers(200, 5001))
    if r < 0.93:
        return float(rng.integers(5000, 25001))
    return float(rng.integers(25000, 75001))


def success_prob(row: dict, action: str, rng: np.random.Generator | None = None) -> float:
    """p(recover | case features, action) — the world's ground-truth mechanism."""
    p = BASE_RECOVERABILITY[row["failure_reason"]] * ACTION_FIT[row["failure_reason"]][action]

    # Customer history: loyal converters respond better.
    p *= 0.60 + 0.80 * row["historical_conversion_rate"]

    # Retry fatigue.
    p *= 0.80 ** row["retry_count"]

    # Opt-out customers ignore outreach (retries unaffected — no message involved).
    if row["opt_out_flag"] and action in OUTREACH:
        p *= 0.25

    # Staleness: cases decay over ~4 days.
    p *= 1.0 - min(row["time_since_failure_min"] / (96 * 60), 0.5)

    # Bank downtime needs time to clear: an *immediate* retry underperforms.
    if row["failure_reason"] == "bank_downtime" and action == "smart_retry" and row["time_since_failure_min"] < 120:
        p *= 0.70

    # NSF retries do better in the evening (salary / wallet top-up hours).
    if row["failure_reason"] == "insufficient_funds" and action == "smart_retry" and 18 <= row["hour_of_day"] <= 23:
        p *= 1.20

    # Weekend nudges convert slightly better for abandoned carts.
    if row["failure_reason"] == "abandoned" and action in ("send_reminder", "offer_incentive") and row["day_of_week"] >= 5:
        p *= 1.10

    # Large amounts convert a bit less; incentives help mid-range most.
    amt = row["order_value"]
    p *= 1.0 - 0.15 * min(amt / 50000.0, 1.0)
    if action == "offer_incentive" and 1000 <= amt <= 20000:
        p *= 1.10

    # Merchant recovery culture (mild).
    p *= 0.90 + 0.30 * row["past_recovery_rate"]

    if rng is not None:  # idiosyncratic noise on the realized world, not on the label fn
        p *= float(np.exp(rng.normal(0.0, 0.08)))

    return float(np.clip(p, 0.01, 0.97))


def generate(n_rows: int = 30000, seed: int = 7, days: int = 60) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    customers = [
        Customer(
            idx=i,
            prior_payments=int(rng.integers(0, 21)),
            prior_conversions=0,
            prior_failed=0,
            opted_out=bool(rng.random() < 0.08),
        )
        for i in range(4000)
    ]
    for c in customers:
        c.prior_conversions = int(rng.integers(0, c.prior_payments + 1))
        # prior_failed uses the SAME definition the serving code computes (features.ts:
        # max(0, priorPayments - priorConversions)) — payments that didn't convert — so the
        # `prior_failed_attempts` feature has the same meaning at train and serve time (no skew).
        c.prior_failed = max(0, c.prior_payments - c.prior_conversions)

    # Build an event timeline (for incident realism), then sample rows from it.
    reason_w = np.array(REASON_WEIGHTS, dtype=float)
    rows = []
    for _ in range(n_rows):
        day = int(rng.integers(0, days))
        hour = int(rng.choice(24, p=HOUR_WEIGHTS))
        dow = day % 7

        # Incident windows skew the reason mix (and are what IsolationForest must find).
        w = reason_w.copy()
        in_incident = "none"
        wod = hour // 4  # 4-hour window of day, 0..5
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
            "amount": math.log10(amount + 1),
            "order_value": amount,
            "currency": "INR",
            "payment_method": method,
            "failure_reason": reason,
            "retry_count": retry_count,
            "time_since_failure_min": tsf_min,
            "case_age_min": tsf_min,
            "hour_of_day": hour,
            "day_of_week": dow,
            "customer_segment": cust.segment,
            "merchant_type": mtype,
            "past_recovery_rate": MERCHANT_PAST_RECOVERY[mtype],
            "historical_conversion_rate": round(cust.conv_rate, 3),
            "prior_failed_attempts": cust.prior_failed,
            "opt_out_flag": int(cust.opted_out),
            "channel": "checkout" if reason != "abandoned" else "cart",
            "previous_contact_attempts": prev_contact,
            "last_action_type": last_action,
            "last_action_outcome": last_outcome,
            # deterministic urgency proxy (matches server scoring's spirit)
            "urgency_score": round(
                100 * max(0.0, min(1.0, 0.6 * BASE_RECOVERABILITY[reason] + 0.4 * (1 - tsf_min / (48 * 60)) - retry_count * 0.1)), 1
            ),
            "incident_reason": in_incident,  # kept for anomaly evaluation, NOT a model feature
            "day_index": day,
        }

        # Ground-truth per-action success probabilities.
        p_by_action = {a: success_prob(row, a) for a in ACTIONS}

        # NOISY per-action outcome probabilities used to LABEL the best action.
        # Crucially, best_action is derived from these noisy draws — not from the
        # clean deterministic p_by_action — so the label carries irreducible
        # uncertainty. The model (which can only see the features, i.e. the clean
        # expectation) therefore CANNOT hit 100%: it learns the expected-best action
        # and is genuinely wrong when noise flips which action won. This is what
        # makes the action/escalation heads a real learning problem, not a lookup.
        p_noisy = {a: float(np.clip(p_by_action[a] * np.exp(rng.normal(0.0, 0.22)), 0.01, 0.98)) for a in ACTIONS}

        # Best action by expected NET value: EV(a) = p * collectable - cost.
        # Incentive collects 95% (5% discount) and costs a send fee; escalation
        # costs human time; no_action is free. This is what makes "reminder"
        # sometimes beat "incentive", and "no_action" correct on tiny orders.
        COST = {"smart_retry": 3.0, "send_payment_link": 6.0, "send_reminder": 4.0,
                "offer_incentive": 6.0, "escalate_to_human": 50.0, "no_action": 0.0}

        def ev(a: str, probs: dict) -> float:
            collectable = amount * (0.95 if a == "offer_incentive" else 1.0)
            return probs[a] * collectable - COST[a]

        best_action = max(ACTIONS, key=lambda a: ev(a, p_noisy))

        # Behavior policy for the historical log: 70% near-optimal, 30% exploratory.
        if rng.random() < 0.70:
            logits = np.array([p_by_action[a] for a in ACTIONS]) * 8.0
            probs = np.exp(logits - logits.max())
            probs /= probs.sum()
            taken = ACTIONS[int(rng.choice(len(ACTIONS), p=probs))]
        else:
            taken = ACTIONS[int(rng.integers(0, len(ACTIONS)))]

        realized = success_prob(row, taken, rng)
        recovered = int(rng.random() < realized)

        # Escalation label also from the noisy draws (near the 0.35 threshold this
        # flips stochastically) so the escalation head is not a clean threshold either.
        automated = [a for a in ACTIONS if a not in ("escalate_to_human", "no_action")]
        automated_recoverable = int(max(p_noisy[a] for a in automated) >= 0.35)

        row.update(
            {
                "action_taken": taken,
                "recovered": recovered,
                "best_action": best_action,
                "automated_recoverable": automated_recoverable,
                "true_p_taken": round(p_by_action[taken], 4),
            }
        )
        rows.append(row)

    return pd.DataFrame(rows)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=30000)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="ml/data/train.csv")
    args = ap.parse_args()

    df = generate(args.rows, args.seed)
    import os

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    df.to_csv(args.out, index=False)
    print(f"wrote {len(df)} rows -> {args.out}")
    print("recovered rate:", round(df.recovered.mean(), 3))
    print("best_action distribution:\n", df.best_action.value_counts(normalize=True).round(3).to_string())
