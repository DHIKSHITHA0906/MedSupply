"""Shared logic used by BOTH the Flask app (local) and the Lambda handler (AWS)."""
from . import pipeline, predict as P
from .storage import put_json, get_json

_ALL = None

def _all():
    global _ALL
    if _ALL is None:
        _ALL = pipeline.run_all()
    return _ALL

def health():
    return {"status": "ok", "module": "member_c", "model": P.model_status()}

def list_scenarios():
    a = _all()
    rows = [{"drug": s["drug"], "risk_score": s["member_a"]["risk_score"], "triage": s["triage"],
             "requester": s["requester"]["name"], "need_units": s["need_units"],
             "recommendation_status": s["recommendation_status"],
             "deadline_status": s["decision_deadline"]["status"],
             "latest_action_in_days": s["decision_deadline"]["latest_action_in_days"],
             "accepted": s["accepted_count"], "rejected": s["rejected_count"]} for s in a["scenarios"]]
    return {"summary": a["summary"], "scenarios": rows}

def get_scenario(drug):
    if drug not in pipeline.get_inputs()["drugs"]:
        raise KeyError(drug)
    return pipeline.run_scenario(drug)

def simulate(body):
    return pipeline.simulate_custom(body["drug"], body["allocations"])

def predict_one(drug):
    return P.predict(drug)

def predict_all():
    return {"model": P.model_status(), "predictions": P.predict_all()}

def predict_what_if(body):
    return P.predict(body["drug"], body.get("overrides"))

# ---- Step Functions actions (payloads stay tiny; big data goes to S3) ----
def sfn_predict_all(_event):
    preds = P.predict_all()
    uri = put_json("results/predictions.json", preds)
    return {"action": "predict_all", "n": len(preds), "source": preds[0]["source"],
            "predictions_uri": uri}

def sfn_run_pipeline(event):
    global _ALL
    preds = get_json("results/predictions.json") or P.predict_all()
    pre = {d: a["risk_score"] for d, a in pipeline.get_inputs()["drugs"].items()}
    diffs = [abs(p["risk_score"] - pre[p["drug"]]) for p in preds if p["drug"] in pre and p["risk_score"] is not None]
    _ALL = pipeline.run_all()
    uri = put_json("results/member_c_output.json", _ALL)
    return {"action": "run_pipeline", "summary": _ALL["summary"], "output_uri": uri,
            "risk_consistency_max_abs_diff": round(max(diffs), 6) if diffs else None}
