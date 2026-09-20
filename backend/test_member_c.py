"""Run: python test_member_c.py"""
from medsupply_member_c.pipeline import run_all, run_scenario, simulate_custom, get_inputs
from medsupply_member_c.deadline import compute_deadline

def test_deadline_matches_slide():
    # slide example: 5 days of stock, supplier needs 4 days -> act within ~1 day (0 intervention here)
    from medsupply_member_c import config as C
    C.INTERVENTION_DAYS = 0
    assert compute_deadline(5, 4)["latest_action_in_days"] == 1
    C.INTERVENTION_DAYS = 1

def test_member_a_untouched():
    inp = get_inputs()
    assert inp["drugs"]["BUPIVACAINE HYDROCHLORIDE INJECTION"]["risk_score"] == 0.8876

def test_naive_plan_rejected_and_safe_kept():
    s = run_scenario("BUPIVACAINE HYDROCHLORIDE INJECTION")
    assert any(r["mode"] == "baseline" and r["verdict"] == "REJECTED" for r in s["candidates"])
    assert s["selected_plan_id"] is not None
    sel = next(r for r in s["candidates"] if r["selected"])
    assert sel["verdict"] == "ACCEPTED" and not sel["reject_reasons"]

def test_custom_takes_from_decoy_is_rejected():
    s = run_scenario("BUPIVACAINE HYDROCHLORIDE INJECTION")
    decoy = next(x for x in s["sources_considered"] if x["type"] == "Hospital" and x["safe_transferable"] < 0.2 * s["need_units"])
    r = simulate_custom(s["drug"], [{"source_id": decoy["id"], "units": min(decoy["stock"], s["need_units"])}])
    assert r["verdict"] == "REJECTED"

def test_no_source_goes_negative_in_selected_plans():
    for sc in run_all()["scenarios"]:
        if sc["selected_plan_id"]:
            sel = next(r for r in sc["candidates"] if r["selected"])
            assert all(n["after_status"] != "SHORTAGE" or n["before_status"] == "SHORTAGE" for n in sel["node_impacts"])

if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"):
            f(); print("PASS", n)
