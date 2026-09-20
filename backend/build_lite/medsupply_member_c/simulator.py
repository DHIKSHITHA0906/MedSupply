"""
Feature #5 - Counterfactual intervention simulation (the headline differentiator).
Copy the network state -> apply the candidate -> re-project every affected node day by day
-> compare BEFORE vs AFTER -> reject if it creates a new shortage/stress anywhere.
Not ML: deterministic projection driven by the ML forecast (Member A demand + risk).
"""
import copy
from . import config as C
from .deadline import compute_deadline, stockout_days

def _project(stock, daily, days=C.HORIZON_DAYS, inbound=None):
    s, series = stock, []
    for d in range(1, days + 1):
        s -= daily
        if inbound:
            s += inbound.get(d, 0)
        series.append(s)
    return series

def _status(series, safety):
    m = min(series)
    if m < 0:
        return "SHORTAGE"
    if m < safety:
        return "STRESSED"
    return "OK"

_RANK = {"OK": 0, "STRESSED": 1, "SHORTAGE": 2}

def simulate(scn, plan, inp):
    """plan = {"alloc": {source_id: units}, ...}. Returns full before/after report."""
    state = copy.deepcopy(scn)                       # never mutate the live network
    src = {s["id"]: s for s in state["sources"]}
    req = state["requester"]
    need = state["need_units"]
    take = plan["alloc"]
    reasons, node_rows, ripple = [], [], []

    # ---- 1. sources that give stock: BEFORE vs AFTER
    new_bad = False
    for sid, units in take.items():
        s = src[sid]
        if s["type"] == "Supplier":
            before_u = s["base_util"]
            after_u = s["base_util"] + units / s["capacity_total"]
            st_b = "STRESSED" if before_u > C.SUPPLIER_STRESS_UTIL else "OK"
            st_a = ("SHORTAGE" if after_u >= 1.0 else "STRESSED" if after_u > C.SUPPLIER_STRESS_UTIL else "OK")
            if units > s["available_units"]:
                st_a = "SHORTAGE"
            row = {"node_id": sid, "name": s["name"], "type": "Supplier", "units_taken": units,
                   "before_status": st_b, "after_status": st_a,
                   "utilisation_before": round(before_u, 3), "utilisation_after": round(after_u, 3)}
            # ripple to sibling drugs made by the same (now squeezed) manufacturer
            frac = min(1.0, units / max(1, s["available_units"]))
            bump = C.RIPPLE_STRENGTH * frac * s["bottleneck_score"]
            for sib in s["sibling_drugs"]:
                r0 = inp["drugs"].get(sib, {}).get("risk_score", 0.0)
                if r0 <= 0:
                    continue
                r1 = round(min(1.0, r0 + bump), 4)
                crossed = r0 < C.RISK_THRESHOLD <= r1
                ripple.append({"drug": sib, "via_supplier": s["name"], "risk_before": r0,
                               "risk_after": r1, "delta": round(r1 - r0, 4), "newly_at_risk": crossed})
        else:
            before = _project(s["stock"], s["daily_forecast"])
            after = _project(s["stock"] - units, s["daily_forecast"])
            st_b, st_a = _status(before, s["safety_stock"]), _status(after, s["safety_stock"])
            row = {"node_id": sid, "name": s["name"], "type": s["type"], "units_taken": units,
                   "before_status": st_b, "after_status": st_a,
                   "min_stock_before": int(min(before)), "min_stock_after": int(min(after)),
                   "safety_stock": s["safety_stock"]}
        row["worse"] = _RANK[row["after_status"]] > _RANK[row["before_status"]]
        node_rows.append(row)
        if row["worse"]:
            new_bad = True
            reasons.append(f"Creates NEW {row['after_status'].lower()} at {row['name']} ({row['type']})")

    # ---- 2. sibling-drug ripples
    for r in ripple:
        if r["newly_at_risk"]:
            new_bad = True
            reasons.append(f"Pushes {r['drug']} over the {C.RISK_THRESHOLD:.0%} risk line via {r['via_supplier']}")

    # ---- 3. requester: does it actually get resolved in time?
    inbound = {}
    for sid, units in take.items():
        d = src[sid]["lead_days"]
        inbound[d] = inbound.get(d, 0) + units
    r_before = _project(req["stock"], req["daily_forecast"])
    r_after = _project(req["stock"], req["daily_forecast"], inbound=inbound)
    delivered = sum(take.values())
    fill = round(delivered / need, 3)
    stockout_before = next((i + 1 for i, v in enumerate(r_before) if v < 0), None)
    stockout_after = next((i + 1 for i, v in enumerate(r_after) if v < 0), None)
    resolved = stockout_after is None and r_after[-1] >= req["safety_stock"] - 1e-6
    if not resolved:
        if stockout_after is not None:
            reasons.append(f"Too slow: {req['name']} stocks out on day {stockout_after} before delivery lands "
                           f"(arrivals: day {sorted(inbound)})")
        elif fill < 1:
            reasons.append(f"Only covers {fill:.0%} of the {need} units needed")
        else:
            reasons.append("Requester still below safety stock at end of horizon")

    # ---- 4. metrics used by the optimizer (#6)
    max_lead = max((src[s]["lead_days"] for s in take), default=0)
    cost = sum(u * (src[s]["unit_cost"] + src[s]["transport_cost_per_unit"]) + src[s]["fixed_cost"]
               for s, u in take.items())
    headroom_use = max((u / max(1, src[s]["safe_transferable"]) for s, u in take.items()), default=0)
    ripple_idx = min(1.0, sum(r["delta"] for r in ripple) / 0.5)
    network_risk = round(0.6 * min(1.0, headroom_use) + 0.4 * ripple_idx, 4)
    waste_units = sum(u for s, u in take.items() if src[s]["expiry_days"] < C.LOW_EXPIRY_DAYS)
    waste = round(waste_units / max(1, delivered), 4)

    if new_bad:
        verdict = "REJECTED"
    elif resolved:
        verdict = "ACCEPTED"
    elif stockout_after is None and fill < 1:
        verdict = "PARTIAL_SAFE"
    else:
        verdict = "REJECTED"

    dl = compute_deadline(stockout_days(scn), max_lead)
    return {
        "plan_id": plan.get("plan_id"), "strategy": plan.get("strategy"), "label": plan.get("label"),
        "mode": plan.get("mode"),
        "allocations": [{"source_id": s, "name": src[s]["name"], "type": src[s]["type"], "units": u,
                         "lead_days": src[s]["lead_days"]} for s, u in take.items()],
        "delivered_units": delivered, "needed_units": need, "fill_ratio": fill,
        "verdict": verdict, "reject_reasons": reasons,
        "requester_before": {"stockout_day": stockout_before, "end_stock": int(r_before[-1])},
        "requester_after": {"stockout_day": stockout_after, "end_stock": int(r_after[-1]), "resolved": resolved},
        "node_impacts": node_rows, "ripple_effects": ripple,
        "metrics": {"total_cost_inr": round(cost, 2), "network_risk": network_risk,
                    "max_lead_days": max_lead, "expiry_waste_fraction": waste},
        "deadline": dl,
    }
