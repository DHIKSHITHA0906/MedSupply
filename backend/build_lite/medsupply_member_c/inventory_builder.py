"""
Builds a SYNTHETIC inventory snapshot for one shortage scenario.
Real: drug identity, Member A risk score/window, demand level (from Member A training data), manufacturers.
Synthetic: per-node stock, lead times, prices, expiry (no public per-hospital inventory exists).
Deterministic per (drug, seed) so the demo is reproducible.
"""
import random, math
from . import config as C

def _src(id_, type_, name, stock, safety, daily_fc, expiry, lead, unit_cost, extra=None):
    s = {"id": id_, "type": type_, "name": name, "stock": int(stock), "safety_stock": int(safety),
         "daily_forecast": round(daily_fc, 2), "expiry_days": int(expiry), "lead_days": int(lead),
         "unit_cost": round(unit_cost, 2), "transport_cost_per_unit": C.TRANSPORT_PER_UNIT[type_],
         "fixed_cost": C.FIXED_COST[type_], "is_synthetic": True}
    if extra: s.update(extra)
    return s

def safe_transferable(s):
    """available stock - safety stock - predicted demand over the horizon (Feature #4)."""
    if s["type"] == "Supplier":
        # suppliers: what they can still ship without exceeding the 'stressed' utilisation line
        room = (C.SUPPLIER_STRESS_UTIL - s["base_util"]) * s["capacity_total"]
        return max(0, int(min(s["available_units"], room)))
    need_hold = s["safety_stock"] + s["daily_forecast"] * C.HORIZON_DAYS
    return max(0, int(s["stock"] - need_hold))

def build_scenario(drug, inp, seed=C.SEED):
    rng = random.Random(f"{drug}|{seed}")
    a = inp["drugs"][drug]
    dem = inp["demand"].get(drug, {"daily_demand": 100.0, "trend_factor": 1.0})
    trend = max(1.0, dem["trend_factor"])
    net_daily = dem["daily_demand"]

    hosp = inp["hospitals"]
    beds_total = sum(h["bed_capacity"] for h in hosp)
    share = {h["hospital_id"]: h["bed_capacity"] / beds_total for h in hosp}

    # Requesting hospital: deterministic pick
    req_h = hosp[rng.randrange(len(hosp))]
    req_daily = net_daily * share[req_h["hospital_id"]]
    cover = max(1.5, min(a["risk_window_days"] * rng.uniform(0.55, 0.85), 9.0))
    req_stock = int(req_daily * cover)
    req_fc = round(req_daily * trend, 2)
    req_safety = int(C.HOSP_SAFETY_DAYS * req_daily)
    need = max(math.ceil(req_safety + C.HORIZON_DAYS * req_fc - req_stock), 20)

    sources = []
    # --- other hospitals
    others = [h for h in hosp if h["hospital_id"] != req_h["hospital_id"]]
    decoy = max(others, key=lambda h: h["bed_capacity"])     # biggest hospital = tempting but unsafe
    for h in others:
        d_daily = net_daily * share[h["hospital_id"]]
        if h is decoy:
            # Seeded trap (mirrors the slide example): lots of stock, but forecast demand eats it.
            stock = need * 1.10
            safety_d = C.HOSP_SAFETY_DAYS
            d_daily = (stock - 0.08 * need) / (safety_d + C.HORIZON_DAYS * trend)
        else:
            stock = d_daily * rng.uniform(16, 30)
        sources.append(_src(h["hospital_id"], "Hospital", h["hospital_name"], stock,
                            C.HOSP_SAFETY_DAYS * d_daily, d_daily * trend,
                            rng.randint(90, 420), rng.choice([1, 1, 2]), base_price(drug, rng) * 1.10,
                            {"is_decoy_seed": h is decoy}))
    # --- warehouses (serve all 4 hospitals equally in Member B's graph)
    base = base_price(drug, rng)
    for w in inp["warehouses"]:
        w_daily = net_daily / len(inp["warehouses"])
        stock = w_daily * rng.uniform(14, 34)
        sources.append(_src(w["warehouse_id"], "Warehouse", w["warehouse_name"], stock,
                            C.WH_SAFETY_DAYS * w_daily, w_daily * trend,
                            rng.randint(30, 300), rng.choice([1, 2, 2]), base * 1.05))
    # --- suppliers = real manufacturer names from Member B's graph
    for m in inp["mfg_by_drug"].get(drug, []):
        bn = inp["bottleneck"].get(m, {})
        bscore = bn.get("bottleneck_risk_score", 0.5)
        base_util = round(0.55 + 0.35 * bscore, 3)
        avail = need * rng.uniform(0.7, 1.4)
        cap_total = avail / (1 - base_util)
        sources.append(_src(m, "Supplier", bn.get("manufacturer_name", m), avail, 0, 0,
                            rng.randint(200, 700), rng.randint(2, 6), base * rng.uniform(1.0, 1.2),
                            {"available_units": int(avail), "capacity_total": int(cap_total),
                             "base_util": base_util, "bottleneck_score": bscore,
                             "sibling_drugs": [x for x in inp["mfg_drugs"].get(m, []) if x != drug]}))
    for s in sources:
        s["safe_transferable"] = safe_transferable(s)

    tri = inp["triage"].get(drug, {})
    return {
        "drug": drug,
        "member_a": {"risk_score": a["risk_score"], "risk_window_days": a["risk_window_days"],
                     "current_shortage": a["current_shortage"]},
        "triage": {"rank": tri.get("triage_rank"), "score": tri.get("triage_score"),
                   "priority": tri.get("triage_priority")},
        "requester": {"id": req_h["hospital_id"], "name": req_h["hospital_name"],
                      "stock": req_stock, "daily_forecast": req_fc,
                      "safety_stock": req_safety, "cover_days": round(cover, 1)},
        "need_units": int(need),
        "sources": sources,
        "provenance": {"drug_identity": "REAL", "risk": "REAL (Member A model)",
                       "demand_level": "REAL-derived (Member A training data)",
                       "inventory_lead_time_price_expiry": "SIMULATED",
                       "network_topology": "SYNTHETIC (Member B) with real manufacturer names"},
    }

def base_price(drug, rng):
    return round(rng.uniform(6, 70), 2)
