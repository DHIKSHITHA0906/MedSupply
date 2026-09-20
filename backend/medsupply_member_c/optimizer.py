"""Feature #6 (simplified) - ripple-aware weighted scoring over the *accepted* candidates only."""
from . import config as C

def _norm(vals):
    lo, hi = min(vals), max(vals)
    return [0.0 if hi - lo < 1e-9 else (v - lo) / (hi - lo) for v in vals]

def score_and_select(results):
    accepted = [r for r in results if r["verdict"] == "ACCEPTED"]
    pool, mode = accepted, "ACCEPTED"
    if not accepted:
        pool, mode = [r for r in results if r["verdict"] == "PARTIAL_SAFE"], "PARTIAL_SAFE"
    if not pool:
        return None, {"weights": C.WEIGHTS_DEFAULT, "note": "No safe plan found - escalate to pharmacist / emergency supply"}

    slack = min(r["deadline"]["latest_action_in_days"] for r in pool)
    weights = C.WEIGHTS_URGENT if slack <= C.URGENT_SLACK_DAYS else C.WEIGHTS_DEFAULT
    cols = {
        "cost": _norm([r["metrics"]["total_cost_inr"] for r in pool]),
        "network_risk": _norm([r["metrics"]["network_risk"] for r in pool]),
        "lead_time": _norm([r["metrics"]["max_lead_days"] for r in pool]),
        "expiry_waste": _norm([r["metrics"]["expiry_waste_fraction"] for r in pool]),
    }
    for i, r in enumerate(pool):
        parts = {k: round(weights[k] * cols[k][i], 4) for k in weights}
        r["score"] = round(sum(parts.values()), 4)
        r["score_breakdown"] = parts
        if mode == "PARTIAL_SAFE":          # prefer the plan that covers the most demand
            r["score"] = round(r["score"] + (1 - r["fill_ratio"]), 4)
    best = min(pool, key=lambda r: r["score"])
    return best, {"weights": weights, "urgency_mode": weights is C.WEIGHTS_URGENT,
                  "pool": mode, "note": "Lower score = better. Only plans that passed simulation are scored."}
