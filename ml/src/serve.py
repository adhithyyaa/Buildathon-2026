"""
Overwatch ML inference service (FastAPI).

Endpoints:
  GET  /health              - liveness + which models are loaded
  POST /predict             - the six required ML outputs for one case
  POST /anomaly/window      - failure-spike detection for a window of recent counts
  GET  /metrics             - the training/validation report (for the dashboard)

Design: this service ONLY predicts. It never decides policy or moves money — that
stays in the Node deterministic policy engine and executor. Run from project root:

  ml/.venv/Scripts/python -m uvicorn serve:app --app-dir ml/src --port 8899
"""

from __future__ import annotations

import json
import math
import os
from typing import Optional

import joblib
import numpy as np
from catboost import Pool
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from features import ACTIONS, RECOVERY_CATEGORICAL, case_frame, with_action

ART = os.environ.get("OVERWATCH_MODELS", "ml/artifacts")
AUTOMATED = [a for a in ACTIONS if a not in ("escalate_to_human", "no_action")]

# Human-readable label + category for each model feature, for the per-case reason codes (F5).
FEATURE_META = {
    "action": ("Recommended action", "action"),
    "failure_reason": ("Failure reason", "payment"),
    "payment_method": ("Payment method", "payment"),
    "order_value": ("Order value", "payment"),
    "amount": ("Order value (log)", "payment"),
    "currency": ("Currency", "payment"),
    "channel": ("Channel", "payment"),
    "retry_count": ("Retry count", "timing"),
    "time_since_failure_min": ("Time since failure", "timing"),
    "case_age_min": ("Case age", "timing"),
    "hour_of_day": ("Hour of day", "timing"),
    "day_of_week": ("Day of week", "timing"),
    "urgency_score": ("Urgency score", "timing"),
    "customer_segment": ("Customer segment", "customer"),
    "historical_conversion_rate": ("Customer conversion history", "customer"),
    "past_recovery_rate": ("Merchant recovery rate", "merchant"),
    "merchant_type": ("Merchant type", "merchant"),
    "prior_failed_attempts": ("Prior failed attempts", "customer"),
    "opt_out_flag": ("Opt-out status", "customer"),
    "previous_contact_attempts": ("Previous contact attempts", "customer"),
    "last_action_type": ("Last action", "customer"),
    "last_action_outcome": ("Last action outcome", "customer"),
}

# ---- action economics (mirror worldmodel EV so the service's pick is decision-aware) ----
ACTION_COST = {"smart_retry": 3.0, "send_payment_link": 6.0, "send_reminder": 4.0, "offer_incentive": 6.0, "escalate_to_human": 50.0, "no_action": 0.0}
INCENTIVE_COLLECT = 0.95


def _load(name):
    return joblib.load(os.path.join(ART, name))


class Models:
    def __init__(self):
        self.recovery = _load("recovery_primary.joblib")["model"]
        act = _load("action_primary.joblib")
        self.action = act["model"]
        self.action_classes = act["classes"]
        self.escalation = _load("escalation_primary.joblib")["model"]
        ic = _load("iforest_case.joblib")
        self.if_case_pre, self.if_case = ic["pre"], ic["model"]
        iw = _load("iforest_window.joblib")
        self.if_win, self.win_reasons = iw["model"], iw["reasons"]
        self.win_mean = iw["baseline_mean"]
        self.win_std = iw["baseline_std"]
        with open(os.path.join(ART, "metrics.json")) as f:
            self.metrics = json.load(f)
        self.version = self.metrics.get("version", "unknown")
        # Unwrap the raw (uncalibrated) CatBoost from the calibrated recovery model so we can
        # compute native per-case SHAP values for the reason-code explanations. Degrade gracefully
        # if the sklearn wrapper layout changes — SHAP is explanatory, never on the money path.
        self.recovery_raw = None
        self.recovery_feature_names = None
        try:
            cc = self.recovery.calibrated_classifiers_[0]
            raw = getattr(getattr(cc, "estimator", None), "estimator", None)
            if raw is not None and hasattr(raw, "get_feature_importance"):
                self.recovery_raw = raw
                self.recovery_feature_names = list(raw.feature_names_)
        except Exception as exc:  # noqa: BLE001 — explanations are best-effort
            print(f"[ml] SHAP unwrap unavailable: {exc}")


M: Optional[Models] = None
app = FastAPI(title="Overwatch ML Service")


@app.on_event("startup")
def _startup():
    global M
    M = Models()
    print(f"[ml] models loaded (version {M.version}) from {ART}")


class CaseInput(BaseModel):
    order_value: float = Field(..., description="Order value in rupees")
    failure_reason: str = "unknown"
    payment_method: str = "unknown"
    currency: str = "INR"
    channel: str = "checkout"
    customer_segment: str = "new"
    merchant_type: str = "retail"
    retry_count: int = 0
    time_since_failure_min: float = 60.0
    case_age_min: float = 60.0
    hour_of_day: int = 12
    day_of_week: int = 2
    past_recovery_rate: float = 0.33
    historical_conversion_rate: float = 0.5
    prior_failed_attempts: int = 0
    opt_out_flag: int = 0
    urgency_score: float = 50.0
    previous_contact_attempts: int = 0
    last_action_type: str = "none"
    last_action_outcome: str = "none"
    allowed_actions: Optional[list[str]] = None  # policy may restrict the action set


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


@app.get("/health")
def health():
    return {"ok": M is not None, "version": M.version if M else None, "actions": ACTIONS}


@app.post("/predict")
def predict(inp: CaseInput):
    if M is None:
        raise HTTPException(503, "models not loaded")
    payload = inp.model_dump()
    order_value = float(payload["order_value"])
    case = case_frame(payload)

    # Calibrated recovery probability per candidate action.
    per_action = {a: float(M.recovery.predict_proba(with_action(case, a))[:, 1][0]) for a in ACTIONS}

    # Expected net value per action = p * collectable - cost (decision-aware).
    def ev(a: str) -> float:
        collectable = order_value * (INCENTIVE_COLLECT if a == "offer_incentive" else 1.0)
        return per_action[a] * collectable - ACTION_COST[a]

    # Action head (CatBoost multiclass) recommendation + its (UNCALIBRATED) softmax
    # confidence. Note: this softmax is NOT calibrated — the calibrated, trustworthy
    # number for a case is `recovery_probability` (isotonic-calibrated recovery head).
    proba = M.action.predict_proba(case)[0]
    head_idx = int(np.argmax(proba))
    head_action = M.action_classes[head_idx]

    # Restrict to policy-allowed actions if provided, then choose by EV.
    allowed = inp.allowed_actions or ACTIONS
    allowed = [a for a in allowed if a in ACTIONS] or ACTIONS
    ev_action = max(allowed, key=ev)

    # Primary recommendation: the CatBoost action head when it is in the allowed set,
    # otherwise fall back to the EV-optimal allowed action.
    action_class = head_action if head_action in allowed else ev_action

    # Confidence tracks the CHOSEN action (softmax prob of action_class), so it never
    # describes a rejected head action when the policy set excludes the argmax.
    action_confidence = float(proba[list(M.action_classes).index(action_class)])

    escalation_probability = float(M.escalation.predict_proba(case)[:, 1][0])

    # Per-case anomaly score in [0,1] (higher = more unusual).
    dec = float(M.if_case.decision_function(M.if_case_pre.transform(case))[0])
    anomaly_score = round(_sigmoid(-4.0 * dec), 4)

    return {
        "recovery_probability": round(per_action[action_class], 4),  # isotonic-CALIBRATED
        "action_class": action_class,
        "action_confidence": round(action_confidence, 4),  # uncalibrated action-head softmax
        "escalation_probability": round(escalation_probability, 4),  # sigmoid-CALIBRATED
        "anomaly_score": anomaly_score,
        "reason_tag": payload["failure_reason"],
        "per_action_recovery": {a: round(v, 4) for a, v in per_action.items()},
        "expected_value": {a: round(ev(a), 2) for a in ACTIONS},
        "ev_action": ev_action,
        "head_action": head_action,
        "model": {"recovery": "catboost_isotonic", "action": "catboost_multiclass", "escalation": "catboost_sigmoid", "version": M.version},
    }


class ExplainInput(CaseInput):
    action: Optional[str] = None  # explain this action; default = the recommended (EV-optimal allowed) action


def _fmt_value(name: str, raw, action: str):
    """A human-readable display value for a feature in a reason code."""
    if name == "action":
        return action.replace("_", " ")
    if raw is None:
        return None
    if name == "order_value":
        return f"₹{float(raw):,.0f}"
    if name == "opt_out_flag":
        return "opted out" if raw else "not opted out"
    if isinstance(raw, float):
        return round(raw, 2)
    if isinstance(raw, str):
        return raw.replace("_", " ")
    return raw


@app.post("/explain")
def explain(inp: ExplainInput):
    """Per-case reason codes (F5): native CatBoost SHAP on the recovery head for the chosen action,
    returned as the top signed factors (which features pushed this case's recovery probability up or
    down, and by how much). Explanatory only — off the money path."""
    if M is None:
        raise HTTPException(503, "models not loaded")
    if M.recovery_raw is None or M.recovery_feature_names is None:
        return {"available": False, "factors": []}
    payload = inp.model_dump()
    case = case_frame(payload)

    action = inp.action if inp.action in ACTIONS else None
    if action is None:
        order_value = float(payload["order_value"])
        per_action = {a: float(M.recovery.predict_proba(with_action(case, a))[:, 1][0]) for a in ACTIONS}
        allowed = [a for a in (inp.allowed_actions or ACTIONS) if a in ACTIONS] or ACTIONS
        action = max(allowed, key=lambda a: per_action[a] * (order_value * (INCENTIVE_COLLECT if a == "offer_incentive" else 1.0)) - ACTION_COST[a])

    X = with_action(case, action)[M.recovery_feature_names]
    cats = [c for c in RECOVERY_CATEGORICAL if c in M.recovery_feature_names]
    sv = M.recovery_raw.get_feature_importance(Pool(X, cat_features=cats), type="ShapValues")[0]
    base, contribs = float(sv[-1]), sv[:-1]
    prob = float(M.recovery.predict_proba(X)[:, 1][0])

    ranked = sorted(zip(M.recovery_feature_names, contribs), key=lambda kv: -abs(kv[1]))[:6]
    factors = []
    for name, impact in ranked:
        label, category = FEATURE_META.get(name, (name.replace("_", " "), "other"))
        factors.append({
            "feature": name,
            "label": label,
            "category": category,
            "value": _fmt_value(name, payload.get(name), action),
            "impact": round(float(impact), 4),
            "direction": "increases" if impact >= 0 else "decreases",
        })
    total = sum(abs(f["impact"]) for f in factors) or 1.0
    for f in factors:
        f["weight"] = round(abs(f["impact"]) / total, 3)

    return {"available": True, "action": action, "recovery_probability": round(prob, 4), "base_rate": round(_sigmoid(base), 4), "factors": factors}


class WindowInput(BaseModel):
    counts: dict[str, int]  # {failure_reason: count in the window}


@app.post("/anomaly/window")
def anomaly_window(inp: WindowInput):
    if M is None:
        raise HTTPException(503, "models not loaded")
    vec = np.array([[inp.counts.get(r, 0) for r in M.win_reasons]], dtype=float)
    mean = np.array([M.win_mean[r] for r in M.win_reasons])
    std = np.array([max(M.win_std[r], 1e-9) for r in M.win_reasons])
    z = (vec - mean) / std
    flagged = bool(M.if_win.predict(z)[0] == -1)
    score = float(-M.if_win.score_samples(z)[0])  # higher = more anomalous
    # Which reasons are spiking (z > 2 above baseline).
    contributors = [
        {"reason": r, "count": int(inp.counts.get(r, 0)), "baseline": round(float(M.win_mean[r]), 1), "z": round(float(zz), 2)}
        for r, zz in zip(M.win_reasons, z[0])
        if zz > 2.0
    ]
    return {"anomaly": flagged, "score": round(score, 4), "contributors": sorted(contributors, key=lambda c: -c["z"])}


@app.get("/metrics")
def metrics():
    if M is None:
        raise HTTPException(503, "models not loaded")
    return M.metrics
