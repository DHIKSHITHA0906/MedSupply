"""
Live shortage-risk prediction using Member A's saved model (integrated_risk_model.pkl).
- Loads with joblib (plain pickle.load fails on this file).
- Scores each drug's latest feature row -> reproduces Member A's output.json exactly.
- Supports what-if overrides (e.g. lower inventory_units) for the dashboard.
- Falls back to Member A's precomputed scores if scikit-learn / the model file is unavailable
  (so a lightweight Lambda zip still works). Every response says which source it used.
"""
import csv, json, os, warnings
warnings.filterwarnings("ignore")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

def _data_dir():
    return os.environ.get("MEDSUPPLY_DATA_DIR", os.path.join(ROOT, "data"))

def _model_path():
    return os.environ.get("MEDSUPPLY_MODEL_PATH", os.path.join(ROOT, "model", "integrated_risk_model.pkl"))

_BUNDLE, _FEATURES, _LOAD_ERR = None, None, None

WHATIF_WARNING = ("EXPERIMENTAL sensitivity probe, NOT a causal what-if. The model is a random forest trained "
                  "partly on synthetic inventory/demand, and each drug's current row sits on a learned pre-shortage "
                  "pattern, so ANY change tends to lower the score (even doubling demand). Do not present as a "
                  "simulation of consequences; use /simulate (Feature #5) for that.")

def window_for(score):
    """Risk window (days). Cutoffs INFERRED from Member A's output.json (verified on all 40 drugs) - confirm with A."""
    if score >= 0.80: return 7
    if score >= 0.65: return 14
    if score >= 0.50: return 30
    if score >= 0.37: return 60
    return 90

def _load_model():
    global _BUNDLE, _LOAD_ERR
    if _BUNDLE is not None or _LOAD_ERR is not None:
        return _BUNDLE
    try:
        import joblib
        _BUNDLE = joblib.load(_model_path())
    except Exception as e:                      # missing sklearn, missing file, version mismatch...
        _LOAD_ERR = f"{type(e).__name__}: {e}"
    return _BUNDLE

def _features():
    global _FEATURES
    if _FEATURES is None:
        with open(os.path.join(_data_dir(), "latest_features.csv"), newline="") as f:
            rows = list(csv.DictReader(f))
        _FEATURES = {r["drug"]: r for r in rows}
    return _FEATURES

def _precomputed():
    with open(os.path.join(_data_dir(), "member_a_output.json")) as f:
        return {x["drug"]: x for x in json.load(f)}

def model_status():
    b = _load_model()
    return {"live_model_available": b is not None, "error": _LOAD_ERR,
            "model_name": b["model_name"] if b else None,
            "threshold": float(b["threshold"]) if b else None,
            "n_features": len(b["feature_columns"]) if b else None}

def _score_live(drug, overrides=None):
    import numpy as np
    b = _load_model()
    cols = b["feature_columns"]
    row = _features()[drug]
    vals = {c: (float(row[c]) if row[c] not in ("", None) else float("nan")) for c in cols}
    base = dict(vals)
    if overrides:
        unknown = [k for k in overrides if k not in vals]
        if unknown:
            raise ValueError(f"Unknown feature(s): {unknown}")
        vals.update({k: float(v) for k, v in overrides.items()})
        touched = {"inventory_units", "demand_units"} & set(overrides)
        if touched and "inventory_demand_ratio" not in overrides:   # keep the derived feature consistent
            vals["inventory_demand_ratio"] = vals["inventory_units"] / max(vals["demand_units"], 1.0)
    def prob(v):
        X = b["imputer"].transform(np.array([[v[c] for c in cols]]))
        return float(b["model"].predict_proba(X)[0, 1])
    return prob(vals), prob(base), float(b["threshold"])

def predict(drug, overrides=None):
    feats = _features()
    if drug not in feats:
        raise KeyError(drug)
    pre = _precomputed().get(drug, {})
    if _load_model() is not None:
        p, p0, thr = _score_live(drug, overrides)
        return {"drug": drug, "risk_score": round(p, 4), "risk_window_days": window_for(p),
                "current_shortage": p >= thr, "threshold": round(thr, 4),
                "source": "live_model", "is_what_if": bool(overrides),
                "baseline_risk_score": round(p0, 4), "delta_vs_baseline": round(p - p0, 4),
                "overrides": overrides or {},
                **({"warning": WHATIF_WARNING} if overrides else {}),
                "member_a_precomputed_score": pre.get("risk_score"),
                "note": "Risk window mapping inferred from Member A output; decision support only."}
    if overrides:
        raise RuntimeError("What-if needs the live model (scikit-learn not available in this deployment). "
                           f"Load error: {_LOAD_ERR}")
    return {"drug": drug, "risk_score": pre.get("risk_score"), "risk_window_days": pre.get("risk_window_days"),
            "current_shortage": pre.get("current_shortage"), "source": "precomputed_member_a_output",
            "is_what_if": False, "note": f"Live model unavailable ({_LOAD_ERR}); serving Member A's saved score."}

def predict_all():
    return [predict(d) for d in sorted(_features())]
