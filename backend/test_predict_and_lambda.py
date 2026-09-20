"""Run: python test_predict_and_lambda.py   (tests /api/predict + the Lambda handler locally)"""
import json, os
from medsupply_member_c import predict as P
from medsupply_member_c.pipeline import get_inputs
from lambda_handler import lambda_handler

def ev(method, path, body=None):
    e = {"rawPath": path, "requestContext": {"http": {"method": method}}}
    if body is not None: e["body"] = json.dumps(body)
    r = lambda_handler(e); return r["statusCode"], json.loads(r["body"])

def test_live_model_reproduces_member_a():
    A = get_inputs()["drugs"]
    preds = P.predict_all()
    assert all(p["source"] == "live_model" for p in preds)
    for p in preds:
        assert abs(p["risk_score"] - A[p["drug"]]["risk_score"]) < 1e-3, p["drug"]
        assert p["risk_window_days"] == A[p["drug"]]["risk_window_days"], p["drug"]
        assert p["current_shortage"] == A[p["drug"]]["current_shortage"], p["drug"]

def test_what_if_lower_inventory_raises_or_keeps_risk():
    base = P.predict("PINDOLOL TABLET")
    wi = P.predict("PINDOLOL TABLET", {"inventory_units": 1000, "demand_units": 500})
    assert wi["is_what_if"] and wi["baseline_risk_score"] == base["risk_score"] and "warning" in wi

def test_bad_feature_rejected():
    try: P.predict("PINDOLOL TABLET", {"nope": 1}); assert False
    except ValueError: pass

def test_lambda_routes():
    assert ev("GET", "/api/health")[0] == 200
    c, b = ev("GET", "/api/scenarios"); assert c == 200 and b["summary"]["scenarios"] == 33
    c, b = ev("GET", "/api/scenarios/CARBOPLATIN%20INJECTION"); assert c == 200 and b["candidates"]
    c, b = ev("GET", "/api/predict/CARBOPLATIN%20INJECTION"); assert c == 200 and b["risk_score"] == 0.8065
    c, b = ev("POST", "/api/predict", {"drug": "CARBOPLATIN INJECTION", "overrides": {"inventory_units": 500}})
    assert c == 200 and b["is_what_if"]
    c, b = ev("POST", "/api/simulate", {"drug": "BUPIVACAINE HYDROCHLORIDE INJECTION",
        "allocations": [{"source_id": "HOSP_APEX_HEALTH", "units": 800}]}); assert c == 200 and b["verdict"] == "REJECTED"
    assert ev("GET", "/api/nope")[0] == 404
    assert ev("GET", "/api/predict/NOT%20A%20DRUG")[0] == 404

def test_step_function_actions():
    a = lambda_handler({"action": "predict_all"}); assert a["n"] == 40
    b = lambda_handler({"action": "run_pipeline"})
    assert b["summary"]["scenarios"] == 33 and b["risk_consistency_max_abs_diff"] < 1e-3

def test_fallback_without_model():
    os.environ["MEDSUPPLY_MODEL_PATH"] = "/nonexistent.pkl"
    P._BUNDLE, P._LOAD_ERR = None, None
    p = P.predict("CARBOPLATIN INJECTION"); assert p["source"] == "precomputed_member_a_output" and p["risk_score"] == 0.8065
    try: P.predict("CARBOPLATIN INJECTION", {"inventory_units": 1}); assert False
    except RuntimeError: pass
    del os.environ["MEDSUPPLY_MODEL_PATH"]; P._BUNDLE, P._LOAD_ERR = None, None

if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"):
            f(); print("PASS", n)
