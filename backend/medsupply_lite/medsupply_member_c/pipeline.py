"""Orchestrates Features 4-7 for every at-risk drug and builds the dashboard JSON."""
import json, os
from datetime import datetime, timezone
from . import config as C
from .data_layer import load_inputs
from .inventory_builder import build_scenario
from .sourcing import classify_sources, generate_candidates
from .simulator import simulate
from .optimizer import score_and_select
from .deadline import compute_deadline, stockout_days

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(HERE), "data")

_INP = None
def get_inputs():
    global _INP
    if _INP is None:
        _INP = load_inputs(os.environ.get("MEDSUPPLY_DATA_DIR", DATA_DIR))
    return _INP

def run_scenario(drug, inp=None):
    inp = inp or get_inputs()
    scn = build_scenario(drug, inp)
    safe, excluded = classify_sources(scn)
    plans = generate_candidates(scn)
    results = [simulate(scn, p, inp) for p in plans]
    best, opt_meta = score_and_select(results)
    for r in results:
        r["selected"] = bool(best and r["plan_id"] == best["plan_id"])
    so = stockout_days(scn)
    return {
        "drug": drug,
        "member_a": scn["member_a"], "triage": scn["triage"],
        "requester": scn["requester"], "need_units": scn["need_units"],
        "sources_considered": [{k: s[k] for k in ("id", "name", "type", "stock", "safety_stock",
                                "safe_transferable", "lead_days", "unit_cost", "expiry_days")} for s in scn["sources"]],
        "safe_sources": [s["id"] for s in safe],
        "excluded_sources": excluded,
        "candidates": results,
        "accepted_count": sum(r["verdict"] == "ACCEPTED" for r in results),
        "rejected_count": sum(r["verdict"] == "REJECTED" for r in results),
        "selected_plan_id": best["plan_id"] if best else None,
        "optimization": opt_meta,
        "decision_deadline": best["deadline"] if best else compute_deadline(so, 0),
        "recommendation_status": ("READY_FOR_PHARMACIST_REVIEW" if best and best["verdict"] == "ACCEPTED"
                                  else "PARTIAL_ONLY_ESCALATE" if best else "NO_SAFE_PLAN_ESCALATE"),
        "provenance": scn["provenance"],
    }

def run_all(min_risk=C.MIN_RISK_FOR_SCENARIO):
    inp = get_inputs()
    drugs = [d for d, a in inp["drugs"].items() if a["risk_score"] >= min_risk]
    drugs.sort(key=lambda d: inp["triage"].get(d, {}).get("triage_rank", 999))
    scenarios = [run_scenario(d, inp) for d in drugs]
    return {
        "metadata": {
            "module": "MedSupply Member C - Safe Sourcing, Simulation, Optimization, Deadline",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "features": {"4": "network-aware safe sourcing", "5": "counterfactual simulation",
                         "6": "ripple-aware weighted scoring", "7": "decision deadline"},
            "horizon_days": C.HORIZON_DAYS,
            "hardcoded_weights": {"default": C.WEIGHTS_DEFAULT, "urgent": C.WEIGHTS_URGENT},
            "safeguards": {
                "inventory": "Per-node stock, lead time, price, expiry are SIMULATED (seeded, reproducible).",
                "real_data": "Drug identity, Member A risk score/window, demand level and manufacturer names are real-derived.",
                "clinical": "Decision support only - every plan requires human/pharmacist review. No clinical substitution advice.",
            },
        },
        "summary": {
            "scenarios": len(scenarios),
            "total_candidates_evaluated": sum(len(s["candidates"]) for s in scenarios),
            "total_rejected_by_simulation": sum(s["rejected_count"] for s in scenarios),
            "scenarios_with_safe_plan": sum(s["recommendation_status"] == "READY_FOR_PHARMACIST_REVIEW" for s in scenarios),
            "scenarios_partial_only": sum(s["recommendation_status"] == "PARTIAL_ONLY_ESCALATE" for s in scenarios),
            "scenarios_no_safe_plan": sum(s["recommendation_status"] == "NO_SAFE_PLAN_ESCALATE" for s in scenarios),
            "overdue": sum(s["decision_deadline"]["status"] == "OVERDUE" for s in scenarios),
        },
        "scenarios": scenarios,
    }

if __name__ == "__main__":
    out = run_all()
    path = os.path.join(os.path.dirname(DATA_DIR), "member_c_output.json")
    json.dump(out, open(path, "w"), indent=2)
    print(json.dumps(out["summary"], indent=2))
    print("saved ->", path)


def simulate_custom(drug, allocations):
    """What-if: dashboard user proposes {source_id: units}; we simulate it live (Feature #5)."""
    inp = get_inputs()
    scn = build_scenario(drug, inp)
    ids = {s["id"] for s in scn["sources"]}
    bad = [a["source_id"] for a in allocations if a["source_id"] not in ids]
    if bad:
        raise ValueError(f"Unknown source ids: {bad}")
    alloc = {a["source_id"]: int(a["units"]) for a in allocations if int(a["units"]) > 0}
    plan = {"plan_id": "CUSTOM", "strategy": "custom", "label": "User-proposed intervention",
            "mode": "custom", "alloc": alloc}
    return simulate(scn, plan, inp)
