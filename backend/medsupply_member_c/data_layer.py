"""Loads Member A (risk) + Member B (network/triage) outputs into one lookup structure."""
import json, os

def load_inputs(data_dir):
    b = json.load(open(os.path.join(data_dir, "member_b_output.json")))
    demand = json.load(open(os.path.join(data_dir, "demand_baseline.json")))

    drugs = {d["drug"]: d for d in b["preserved_member_a_data"]}          # Member A, untouched
    triage = {t["drug"]: t for t in b["triage_rankings"]}                 # Member B triage
    net = b["supply_chain_network_summary"]
    rp = b["risk_propagation_summary"]

    mfg_by_drug, mfg_drugs = {}, {}
    for e in net["edges"]:
        if e["edge_type"] == "SUPPLIED_BY":
            mfg_by_drug.setdefault(e["source"], []).append(e["target"])
            mfg_drugs.setdefault(e["target"], []).append(e["source"])

    return {
        "drugs": drugs,
        "triage": triage,
        "demand": demand,
        "mfg_by_drug": mfg_by_drug,
        "mfg_drugs": mfg_drugs,
        "bottleneck": {m["manufacturer_id"]: m for m in rp["supplier_bottlenecks"]},
        "hospitals": rp["hospital_exposures"],
        "warehouses": rp["warehouse_strains"],
        "cause_analysis": b.get("cause_analysis", {}),
    }
