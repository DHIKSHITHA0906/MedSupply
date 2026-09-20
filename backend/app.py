"""Local API for Member D.  Run: python app.py  (http://localhost:5000)"""
from flask import Flask, jsonify, request
from medsupply_member_c import api_core as core

app = Flask(__name__)

@app.after_request
def cors(r):
    r.headers["Access-Control-Allow-Origin"] = "*"
    r.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return r

def _err(e):
    if isinstance(e, KeyError):
        return jsonify(error=f"unknown drug or missing field: {e}"), 404
    return jsonify(error=str(e)), 400

@app.get("/api/health")
def health():
    return jsonify(core.health())

@app.get("/api/scenarios")
def scenarios():
    return jsonify(core.list_scenarios())

@app.get("/api/scenarios/<path:drug>")
def scenario(drug):
    try: return jsonify(core.get_scenario(drug))
    except Exception as e: return _err(e)

@app.post("/api/simulate")
def simulate():
    try: return jsonify(core.simulate(request.get_json(force=True)))
    except Exception as e: return _err(e)

@app.get("/api/predict")
def predict_all():
    return jsonify(core.predict_all())

@app.get("/api/predict/<path:drug>")
def predict_one(drug):
    try: return jsonify(core.predict_one(drug))
    except Exception as e: return _err(e)

@app.post("/api/predict")
def predict_what_if():
    try: return jsonify(core.predict_what_if(request.get_json(force=True)))
    except Exception as e: return _err(e)

if __name__ == "__main__":
    app.run(port=5000, debug=False)
