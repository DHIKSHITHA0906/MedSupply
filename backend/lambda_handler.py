"""
AWS Lambda entry point. One function serves:
  1) API Gateway HTTP API (payload v2) -> the same endpoints as app.py
  2) Step Functions tasks              -> event = {"action": "predict_all" | "run_pipeline"}
If DATA_BUCKET is set, inputs are pulled from S3 on cold start and results are written back to S3.
"""
import json
from urllib.parse import unquote

from medsupply_member_c.storage import sync_inputs

sync_inputs()                                  # no-op locally (DATA_BUCKET unset)

from medsupply_member_c import api_core as core   # imported after sync so env paths are set

HDR = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
       "Access-Control-Allow-Headers": "Content-Type"}

def _resp(code, body):
    return {"statusCode": code, "headers": HDR, "body": json.dumps(body)}

def _route(method, path, body):
    p = path.rstrip("/")
    if p.startswith("/api"):
        p = p[4:]
    if p in ("", "/health"):
        return core.health()
    if p == "/scenarios" and method == "GET":
        return core.list_scenarios()
    if p.startswith("/scenarios/") and method == "GET":
        return core.get_scenario(unquote(p.split("/scenarios/", 1)[1]))
    if p == "/simulate" and method == "POST":
        return core.simulate(body)
    if p == "/predict" and method == "GET":
        return core.predict_all()
    if p.startswith("/predict/") and method == "GET":
        return core.predict_one(unquote(p.split("/predict/", 1)[1]))
    if p == "/predict" and method == "POST":
        return core.predict_what_if(body)
    raise LookupError("route not found")

def lambda_handler(event, context=None):
    # ---- Step Functions
    if "action" in event:
        actions = {"predict_all": core.sfn_predict_all, "run_pipeline": core.sfn_run_pipeline}
        if event["action"] not in actions:
            raise ValueError(f"unknown action {event['action']}")
        return actions[event["action"]](event)

    # ---- API Gateway
    http = event.get("requestContext", {}).get("http", {})
    method = http.get("method", "GET")
    if method == "OPTIONS":
        return _resp(200, {})
    path = event.get("rawPath", "/")
    try:
        body = json.loads(event.get("body") or "{}") if method == "POST" else {}
        return _resp(200, _route(method, path, body))
    except LookupError as e:
        return _resp(404, {"error": str(e)})
    except KeyError as e:
        return _resp(404, {"error": f"unknown drug or missing field: {e}"})
    except (ValueError, RuntimeError) as e:
        return _resp(400, {"error": str(e)})
