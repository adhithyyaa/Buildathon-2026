"""
Single source of truth for the model feature schema, shared by train.py and
serve.py so there is no train/serve skew.

Three model heads share the CASE feature set:
  - recovery head:   CASE features + `action` (the action being evaluated) -> P(recover)
  - action head:     CASE features -> best action class
  - escalation head: CASE features -> P(not automated-recoverable)
IsolationForest fits on the numeric projection of CASE features.
"""

from __future__ import annotations

import math

import pandas as pd

CATEGORICAL = [
    "currency",
    "payment_method",
    "failure_reason",
    "customer_segment",
    "merchant_type",
    "channel",
    "last_action_type",
    "last_action_outcome",
]

NUMERIC = [
    "amount",                      # log10(rupees + 1)
    "order_value",                 # raw rupees
    "retry_count",
    "time_since_failure_min",
    "case_age_min",
    "hour_of_day",
    "day_of_week",
    "past_recovery_rate",
    "historical_conversion_rate",
    "prior_failed_attempts",
    "opt_out_flag",
    "urgency_score",
    "previous_contact_attempts",
]

CASE_FEATURES = CATEGORICAL + NUMERIC

ACTIONS = [
    "smart_retry",
    "send_payment_link",
    "send_reminder",
    "offer_incentive",
    "escalate_to_human",
    "no_action",
]

DEFAULTS = {
    "currency": "INR",
    "payment_method": "unknown",
    "failure_reason": "unknown",
    "customer_segment": "new",
    "merchant_type": "retail",
    "channel": "checkout",
    "last_action_type": "none",
    "last_action_outcome": "none",
    "amount": 3.0,
    "order_value": 1000.0,
    "retry_count": 0,
    "time_since_failure_min": 60.0,
    "case_age_min": 60.0,
    "hour_of_day": 12,
    "day_of_week": 2,
    "past_recovery_rate": 0.33,
    "historical_conversion_rate": 0.5,
    "prior_failed_attempts": 0,
    "opt_out_flag": 0,
    "urgency_score": 50.0,
    "previous_contact_attempts": 0,
}


def case_frame(payload: dict) -> pd.DataFrame:
    """Build a one-row CASE-feature frame from a request payload, applying defaults
    and deriving `amount` (log) from order_value when absent."""
    row = {}
    for col in CASE_FEATURES:
        row[col] = payload.get(col, DEFAULTS[col])
    if "amount" not in payload and "order_value" in payload:
        row["amount"] = math.log10(float(payload["order_value"]) + 1.0)
    df = pd.DataFrame([row])
    for c in CATEGORICAL:
        df[c] = df[c].astype(str)
    for c in NUMERIC:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(DEFAULTS[c])
    return df


def with_action(case_df: pd.DataFrame, action: str) -> pd.DataFrame:
    """CASE frame + the candidate action column (recovery head input)."""
    df = case_df.copy()
    df["action"] = str(action)
    return df


def recovery_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Training helper: select recovery-head columns from the raw dataset,
    renaming the logged `action_taken` to the model's `action` column."""
    out = df[CASE_FEATURES].copy()
    out["action"] = df["action_taken"].astype(str)
    return out


RECOVERY_CATEGORICAL = CATEGORICAL + ["action"]
