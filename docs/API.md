# MedSupply API Reference

Every endpoint implemented in the backend (`backend/app.py` for Flask, `backend/lambda_handler.py` for AWS Lambda, both delegating to `backend/medsupply_member_c/api_core.py`). Examples were produced by running the current code, and long responses are abbreviated with `...`.

Related: [Root README](../README.md) · [Architecture](ARCHITECTURE.md) · [Backend README](../backend/README.md) · [Deployment](DEPLOYMENT.md)

> **Decision support only.** Responses describe simulated sourcing options and risk estimates. They are not clinical advice and require pharmacist review.

---

## Base URL and conventions

| | |
|---|---|
| Deployed base URL | `https://ir06s4arb0.execute-api.ap-southeast-2.amazonaws.com` |
| Local base URL | `http://localhost:5000` (`python app.py`) |
| Path prefix | Every route starts with `/api` |
| Format | JSON request and response bodies (`Content-Type: application/json` for POST) |
| CORS | `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Content-Type` |
| Authentication | **None** |
| Drug names | Path segments must be URL-encoded (`%20` for spaces, `%2F` for `/`, `%2C` for commas). Names are upper-case, for example `BUPIVACAINE HYDROCHLORIDE INJECTION`. |
| Timestamps | ISO-8601 UTC; `latest_action_at` and `predicted_stockout_at` are computed relative to the request time. |

```bash
BASE=https://ir06s4arb0.execute-api.ap-southeast-2.amazonaws.com
```

### Endpoint summary

| Method | Path | Purpose |
|---|---|---|
| GET | [`/api/health`](#get-apihealth) | Status and model availability |
| GET | [`/api/scenarios`](#get-apiscenarios) | Summary plus one row per at-risk medicine |
| GET | [`/api/scenarios/<drug>`](#get-apiscenariosdrug) | Full scenario for one medicine |
| POST | [`/api/simulate`](#post-apisimulate) | **Intervention simulation** of a user-proposed allocation |
| GET | [`/api/predict`](#get-apipredict) | Risk for all 40 medicines |
| GET | [`/api/predict/<drug>`](#get-apipredictdrug) | Risk for one medicine |
| POST | [`/api/predict`](#post-apipredict-experimental-sensitivity-probe) | **Experimental** prediction sensitivity probe |
| n/a | [Step Functions events](#step-functions-events-non-http) | `{"action": "predict_all" \| "run_pipeline"}` |

### Two different "what-if" features. Do not confuse them.

| | `POST /api/simulate` | `POST /api/predict` with `overrides` |
|---|---|---|
| What it is | **Counterfactual intervention simulation**: applies a sourcing plan to a copy of the supply network and projects every affected node | **Experimental sensitivity probe**: re-scores the risk model after changing one or more input features |
| Mechanism | Deterministic day-by-day projection (not ML) | RandomForest re-prediction |
| Answers | "If we move these units from these sources, does anything get worse, and does it arrive in time?" | "How does the model score change if this feature changes?" |
| Causal? | Models the consequences of a plan (on simulated inventory) | **No.** The response itself carries a warning that it is not a causal what-if. |
| Needs live model | No | **Yes** |

Use `/api/simulate` for intervention consequences. Do not present the prediction probe as a simulation.

---

## GET /api/health

**Purpose:** liveness check and prediction-model status.

**Parameters:** none.

**Example**

```bash
curl "$BASE/api/health"
```

Response with the live model loaded:

```json
{
  "status": "ok",
  "module": "member_c",
  "model": {
    "live_model_available": true,
    "error": null,
    "model_name": "RandomForest",
    "threshold": 0.37,
    "n_features": 47
  }
}
```

Response in the lite deployment (no model file or scikit-learn); the error text will vary:

```json
{
  "status": "ok",
  "module": "member_c",
  "model": {
    "live_model_available": false,
    "error": "FileNotFoundError: [Errno 2] No such file or directory: '...integrated_risk_model.pkl'",
    "model_name": null,
    "threshold": null,
    "n_features": null
  }
}
```

**Important fields:** `model.live_model_available` tells you whether prediction endpoints will report `live_model` or `precomputed_member_a_output`. `model.error` is the raw load error and may include server file paths.

**Status:** 200. On Lambda this handler also answers at `/`, `/api`, `/health` and with a trailing slash. Flask serves only `GET /api/health`.

---

## GET /api/scenarios

**Purpose:** summary of the whole pipeline run plus one compact row per at-risk medicine (risk ≥ 0.50), in triage order.

**Parameters:** none. The result is cached in memory per running process/container.

**Example**

```bash
curl "$BASE/api/scenarios"
```

```json
{
  "summary": {
    "scenarios": 33,
    "total_candidates_evaluated": 165,
    "total_rejected_by_simulation": 43,
    "scenarios_with_safe_plan": 33,
    "scenarios_partial_only": 0,
    "scenarios_no_safe_plan": 0,
    "overdue": 0
  },
  "scenarios": [
    {
      "drug": "BUPIVACAINE HYDROCHLORIDE INJECTION",
      "risk_score": 0.8876,
      "triage": { "rank": 1, "score": 0.955, "priority": "CRITICAL" },
      "requester": "St. Jude Regional Medical Center",
      "need_units": 856,
      "recommendation_status": "READY_FOR_PHARMACIST_REVIEW",
      "deadline_status": "ACT_NOW",
      "latest_action_in_days": 0.83,
      "accepted": 4,
      "rejected": 1
    }
  ]
}
```

**Important fields**

| Field | Meaning |
|---|---|
| `summary.total_rejected_by_simulation` | Count of `REJECTED` candidates (a `PARTIAL_SAFE` candidate is counted in neither accepted nor rejected) |
| `scenarios[].triage` | Member B triage `rank`, `score`, `priority` |
| `scenarios[].recommendation_status` | `READY_FOR_PHARMACIST_REVIEW`, `PARTIAL_ONLY_ESCALATE` or `NO_SAFE_PLAN_ESCALATE` |
| `scenarios[].deadline_status` | `OK`, `URGENT`, `ACT_NOW` or `OVERDUE` |
| `scenarios[].latest_action_in_days` | Days of slack before the latest action time |
| `scenarios[].accepted` / `rejected` | Counts of candidate plans by verdict |

**Errors:** none specific. 405 (Flask) or 404 (Lambda) for non-GET methods.

---

## GET /api/scenarios/&lt;drug&gt;

**Purpose:** the full scenario for one medicine: simulated sources, every candidate plan with its simulation result, the selected plan and the decision deadline. Computed on request.

**Path parameter:** `drug`, the URL-encoded medicine name. Any of the 40 medicines in Member A's output is accepted, including the 7 with risk below 0.50 (which are not in `/api/scenarios`).

**Example**

```bash
curl "$BASE/api/scenarios/BUPIVACAINE%20HYDROCHLORIDE%20INJECTION"
```

Abbreviated response:

```json
{
  "drug": "BUPIVACAINE HYDROCHLORIDE INJECTION",
  "member_a": { "risk_score": 0.8876, "risk_window_days": 7, "current_shortage": true },
  "triage": { "rank": 1, "score": 0.955, "priority": "CRITICAL" },
  "requester": {
    "id": "HOSP_ST_JUDE",
    "name": "St. Jude Regional Medical Center",
    "stock": 257, "daily_forecast": 67.13, "safety_stock": 173, "cover_days": 4.4
  },
  "need_units": 856,
  "sources_considered": [
    { "id": "WH_CENCORA_REG", "name": "Cencora (AmerisourceBergen) Regional Hub", "type": "Warehouse",
      "stock": 3292, "safety_stock": 408, "safe_transferable": 1228, "lead_days": 2,
      "unit_cost": 52.38, "expiry_days": 171 }
  ],
  "safe_sources": ["HOSP_METRO_GEN", "HOSP_APEX_HEALTH", "HOSP_VALLEY_CHILD", "WH_CENCORA_REG",
                   "WH_CARDINAL_EAST", "MFG_Pfizer", "MFG_Fresenius_Kabi"],
  "excluded_sources": [
    { "id": "WH_MCKESSON_NAT", "name": "McKesson National Distribution Center", "type": "Warehouse",
      "reason": "stock 1584 - safety 408 - forecast demand 1655 = -479 (nothing safe to give)" }
  ],
  "candidates": [ "... see candidate object below ..." ],
  "accepted_count": 4,
  "rejected_count": 1,
  "selected_plan_id": "P2",
  "optimization": {
    "weights": { "cost": 0.2, "network_risk": 0.3, "lead_time": 0.35, "expiry_waste": 0.15 },
    "urgency_mode": true,
    "pool": "ACCEPTED",
    "note": "Lower score = better. Only plans that passed simulation are scored."
  },
  "decision_deadline": {
    "predicted_stockout_days": 3.83, "required_lead_days": 2, "intervention_days": 1,
    "latest_action_in_days": 0.83, "status": "ACT_NOW",
    "latest_action_at": "2026-09-21T12:30:07+00:00",
    "predicted_stockout_at": "2026-09-24T12:30:07+00:00",
    "formula": "latest_action = stockout - (lead + transport) - intervention"
  },
  "recommendation_status": "READY_FOR_PHARMACIST_REVIEW",
  "provenance": {
    "drug_identity": "REAL",
    "risk": "REAL (Member A model)",
    "demand_level": "REAL-derived (Member A training data)",
    "inventory_lead_time_price_expiry": "SIMULATED",
    "network_topology": "SYNTHETIC (Member B) with real manufacturer names"
  }
}
```

The `provenance` strings are the code's own labels. See the [root README](../README.md#real-vs-simulated-data) for the qualified reading (source-derived vs synthetic vs simulated).

**Candidate object** (each entry of `candidates`):

```json
{
  "plan_id": "P2",
  "strategy": "safe_largest",
  "label": "Largest-stock-first (all within safe limits)",
  "mode": "safe",
  "allocations": [
    { "source_id": "WH_CENCORA_REG", "name": "Cencora (AmerisourceBergen) Regional Hub",
      "type": "Warehouse", "units": 856, "lead_days": 2 }
  ],
  "delivered_units": 856, "needed_units": 856, "fill_ratio": 1.0,
  "verdict": "ACCEPTED",
  "reject_reasons": [],
  "requester_before": { "stockout_day": 4, "end_stock": -682 },
  "requester_after":  { "stockout_day": null, "end_stock": 173, "resolved": true },
  "node_impacts": [
    { "node_id": "WH_CENCORA_REG", "name": "Cencora (AmerisourceBergen) Regional Hub", "type": "Warehouse",
      "units_taken": 856, "before_status": "OK", "after_status": "OK", "worse": false,
      "min_stock_before": 1636, "min_stock_after": 780, "safety_stock": 408 }
  ],
  "ripple_effects": [],
  "metrics": { "total_cost_inr": 45922.08, "network_risk": 0.4182,
               "max_lead_days": 2, "expiry_waste_fraction": 0.0 },
  "deadline": { "status": "ACT_NOW", "latest_action_in_days": 0.83, "...": "..." },
  "score": 0.1938,
  "score_breakdown": { "cost": 0.1063, "network_risk": 0.0, "lead_time": 0.0875, "expiry_waste": 0.0 },
  "selected": true
}
```

| Candidate field | Meaning |
|---|---|
| `mode` | `baseline` (unfiltered, ignores safety), `safe` (within safe limits), `custom` (user-proposed; only from `/api/simulate`) |
| `verdict` | `ACCEPTED`, `REJECTED` (creates a new shortage/stress, ripples a sibling medicine over the risk line, or is too slow), `PARTIAL_SAFE` (no stockout but covers less than the need) |
| `reject_reasons` | Human-readable reasons, e.g. `Creates NEW shortage at Valley Children's Hospital (Hospital)` |
| `node_impacts[]` | Per source: status before/after (`OK`, `STRESSED`, `SHORTAGE`), `worse`. Hospitals/warehouses report minimum projected stock; suppliers report `utilisation_before` / `utilisation_after`. |
| `ripple_effects[]` | Sibling medicines of a squeezed manufacturer: `risk_before`, `risk_after`, `delta`, `newly_at_risk` |
| `metrics` | Cost (INR, simulated), `network_risk` (0 to 1), `max_lead_days`, `expiry_waste_fraction` |
| `score`, `score_breakdown` | Present only on plans that were scored (accepted, or partial-safe when none accepted). Lower is better. |
| `selected` | True for the plan chosen by scoring |
| `deadline` | Decision deadline computed with this plan's lead time |

**Errors:** 404 `{"error": "unknown drug or missing field: '<name>'"}` for an unknown medicine.

---

## POST /api/simulate

**Purpose:** the **intervention simulation** for a user-proposed allocation ("what if we take these units from these sources?"). It runs the same counterfactual simulation used for the generated candidates against the medicine's simulated scenario. The scenario is deterministic, so results are stable.

**Request body**

| Field | Type | Description |
|---|---|---|
| `drug` | string | One of the 40 medicine names |
| `allocations` | array | Each item `{ "source_id": string, "units": integer }`. `source_id` must be one of the scenario's `sources_considered[].id` (for example `HOSP_APEX_HEALTH`, `WH_CENCORA_REG`, `MFG_Pfizer`). Items with `units ≤ 0` are ignored. |

**Example request**

```bash
curl -X POST "$BASE/api/simulate" -H "Content-Type: application/json" \
  -d '{"drug":"BUPIVACAINE HYDROCHLORIDE INJECTION",
       "allocations":[{"source_id":"HOSP_APEX_HEALTH","units":800}]}'
```

**Example response** (abbreviated)

```json
{
  "plan_id": "CUSTOM",
  "strategy": "custom",
  "label": "User-proposed intervention",
  "mode": "custom",
  "allocations": [
    { "source_id": "HOSP_APEX_HEALTH", "name": "Apex Health System", "type": "Hospital",
      "units": 800, "lead_days": 1 }
  ],
  "delivered_units": 800, "needed_units": 856, "fill_ratio": 0.935,
  "verdict": "REJECTED",
  "reject_reasons": [
    "Creates NEW shortage at Apex Health System (Hospital)",
    "Only covers 94% of the 856 units needed"
  ],
  "requester_after": { "stockout_day": null, "end_stock": 117, "resolved": false },
  "node_impacts": [
    { "node_id": "HOSP_APEX_HEALTH", "before_status": "OK", "after_status": "SHORTAGE",
      "min_stock_before": 204, "min_stock_after": -595, "safety_stock": 136, "worse": true }
  ],
  "ripple_effects": [],
  "metrics": { "total_cost_inr": 41370.0, "network_risk": 0.6, "max_lead_days": 1,
               "expiry_waste_fraction": 0.0 },
  "deadline": { "status": "URGENT", "latest_action_in_days": 1.83, "...": "..." }
}
```

The response has the same shape as a candidate object, but with `plan_id: "CUSTOM"`, `mode: "custom"` and **no** `score`, `score_breakdown` or `selected` (custom plans are not scored).

**Errors**

| Status | Body | Cause |
|---|---|---|
| 400 | `{"error": "Unknown source ids: ['NOPE']"}` | A `source_id` is not in this medicine's scenario |
| 400 | `{"error": "invalid literal for int() ..."}` | Non-numeric `units` |
| 400 | `{"error": "Expecting property name ..."}` | Body is not valid JSON |
| 404 | `{"error": "unknown drug or missing field: 'NOPE'"}` | Unknown `drug`; also returned when `drug`, `allocations`, `source_id` or `units` is **missing** (a `KeyError` is mapped to 404) |

An empty `allocations` array is accepted and returns a `REJECTED` result (nothing is delivered).

> **Not used by the UI today.** The frontend has a `simulate()` helper for this endpoint, but no component calls it. Use this endpoint directly (curl or an API client) to demonstrate a custom what-if.

---

## GET /api/predict

**Purpose:** shortage-risk prediction for all 40 medicines.

**Parameters:** none.

**Example**

```bash
curl "$BASE/api/predict"
```

Response with the live model (abbreviated; 40 entries):

```json
{
  "model": { "live_model_available": true, "error": null, "model_name": "RandomForest",
             "threshold": 0.37, "n_features": 47 },
  "predictions": [
    {
      "drug": "ARSENIC TRIOXIDE INJECTION",
      "risk_score": 0.5795,
      "risk_window_days": 30,
      "current_shortage": true,
      "threshold": 0.37,
      "source": "live_model",
      "is_what_if": false,
      "baseline_risk_score": 0.5795,
      "delta_vs_baseline": 0.0,
      "overrides": {},
      "member_a_precomputed_score": 0.5795,
      "note": "Risk window mapping inferred from Member A output; decision support only."
    }
  ]
}
```

Response with the precomputed fallback (lite deployment; abbreviated):

```json
{
  "model": { "live_model_available": false, "error": "FileNotFoundError: ...", "model_name": null,
             "threshold": null, "n_features": null },
  "predictions": [
    {
      "drug": "ARSENIC TRIOXIDE INJECTION",
      "risk_score": 0.5795,
      "risk_window_days": 30,
      "current_shortage": false,
      "source": "precomputed_member_a_output",
      "is_what_if": false,
      "note": "Live model unavailable (FileNotFoundError: ...); serving Member A's saved score."
    }
  ]
}
```

**Important fields**

| Field | Meaning |
|---|---|
| `source` | `live_model` or `precomputed_member_a_output` |
| `risk_score` | Probability (live) or Member A's stored score (fallback). Verified to agree within 0.001 for all 40 medicines. |
| `risk_window_days` | Live: mapped from the score (`≥0.80→7`, `≥0.65→14`, `≥0.50→30`, `≥0.37→60`, else `90`; cut-offs inferred from Member A's output). Fallback: stored value. |
| `current_shortage` | **Differs by source. See below.** |
| `threshold`, `baseline_risk_score`, `delta_vs_baseline`, `member_a_precomputed_score` | Live mode only |

### Note on `current_shortage`

| Source | Definition | Count `true` (of 40) |
|---|---|---|
| `precomputed_member_a_output` | Member A's stored flag (`member_a_output.json`) | 10 |
| `live_model` | `risk_score ≥ threshold (0.37)`, computed by the API | 36 |

The two are **not the same quantity**: 26 medicines are `false` in Member A's stored data but `true` under the model threshold. The frontend labels this flag "FDA status" and uses it for the *Active shortages* KPI, so a live-model deployment would show far more "current shortages" (all 33 scenario medicines) than the precomputed fallback (8 of the 33). The scenario endpoints (`/api/scenarios*`) always use Member A's stored flag.

**Status:** 200. Never returns 404 for the list.

---

## GET /api/predict/&lt;drug&gt;

**Purpose:** prediction for one medicine.

**Path parameter:** `drug`, URL-encoded medicine name.

**Example**

```bash
curl "$BASE/api/predict/BUPIVACAINE%20HYDROCHLORIDE%20INJECTION"
```

Fallback-mode response:

```json
{
  "drug": "BUPIVACAINE HYDROCHLORIDE INJECTION",
  "risk_score": 0.8876,
  "risk_window_days": 7,
  "current_shortage": true,
  "source": "precomputed_member_a_output",
  "is_what_if": false,
  "note": "Live model unavailable (...); serving Member A's saved score."
}
```

Live-mode response has the same fields as an entry of `GET /api/predict`.

**Errors:** 404 `{"error": "unknown drug or missing field: 'NOPE'"}`.

---

## POST /api/predict (experimental sensitivity probe)

**Purpose:** re-score one medicine after overriding model input features, to see how sensitive the model output is. **This is not an intervention simulation and not a causal what-if.**

**Request body**

| Field | Type | Description |
|---|---|---|
| `drug` | string | Medicine name |
| `overrides` | object, optional | Feature name → number. Keys must be model feature columns (the column names in `backend/data/latest_features.csv` other than `drug` and `date`; e.g. `inventory_units`, `demand_units`). If `inventory_units` or `demand_units` is overridden without `inventory_demand_ratio`, the ratio is recomputed. Without `overrides` the request behaves like a normal prediction. |

**Example request**

```bash
curl -X POST "$BASE/api/predict" -H "Content-Type: application/json" \
  -d '{"drug":"CARBOPLATIN INJECTION","overrides":{"inventory_units":500}}'
```

**Example response** (live model)

```json
{
  "drug": "CARBOPLATIN INJECTION",
  "risk_score": 0.317,
  "risk_window_days": 90,
  "current_shortage": false,
  "threshold": 0.37,
  "source": "live_model",
  "is_what_if": true,
  "baseline_risk_score": 0.8065,
  "delta_vs_baseline": -0.4894,
  "overrides": { "inventory_units": 500 },
  "warning": "EXPERIMENTAL sensitivity probe, NOT a causal what-if. The model is a random forest trained partly on synthetic inventory/demand, and each drug's current row sits on a learned pre-shortage pattern, so ANY change tends to lower the score (even doubling demand). Do not present as a simulation of consequences; use /simulate (Feature #5) for that.",
  "member_a_precomputed_score": 0.8065,
  "note": "Risk window mapping inferred from Member A output; decision support only."
}
```

The response carries a `warning` whenever `overrides` is non-empty. Read it: the score tends to fall for almost any change, so the direction of `delta_vs_baseline` should not be interpreted as the effect of a real-world action.

**Errors**

| Status | Body | Cause |
|---|---|---|
| 400 | `{"error": "Unknown feature(s): ['nope']"}` | An override key is not a model feature |
| 400 | `{"error": "What-if needs the live model (scikit-learn not available in this deployment). Load error: ..."}` | `overrides` given while running in fallback mode (for example the lite deployment) |
| 404 | `{"error": "unknown drug or missing field: ..."}` | Unknown drug, or `drug` missing |

---

## Step Functions events (non-HTTP)

The same Lambda accepts events with an `action` key. These are not HTTP routes. AWS Step Functions invokes them (see `backend/deploy/state_machine.asl.json`).

| Event | Behavior | Return value |
|---|---|---|
| `{"action": "predict_all"}` | Runs `predict_all()`; writes `results/predictions.json` to S3 if `DATA_BUCKET` is set | `{"action": "predict_all", "n": 40, "source": "...", "predictions_uri": "s3://.../results/predictions.json" \| null}` |
| `{"action": "run_pipeline"}` | Reads `results/predictions.json` (or recomputes), runs the full pipeline, writes `results/member_c_output.json` | `{"action": "run_pipeline", "summary": {...}, "output_uri": "...", "risk_consistency_max_abs_diff": <number>}` |
| any other `action` | Raises `ValueError("unknown action ...")` | Lambda error (fails the task) |

---

## Error behavior

Errors are JSON `{"error": "<message>"}` with these statuses. Flask and Lambda differ slightly.

| Condition | Flask (`app.py`) | Lambda (`lambda_handler.py`) |
|---|---|---|
| Unknown route | 404 (Flask's default HTML page) | 404 `{"error": "route not found"}` |
| Wrong method on a known path | 405 | 404 (`route not found`) |
| Unknown drug | 404 | 404 |
| Missing required body field (`drug`, `allocations`, `source_id`, `units`) | 404 (`unknown drug or missing field: '<field>'`) | 404 (same message) |
| Unknown `source_id` | 400 | 400 |
| Non-numeric `units`; invalid JSON body | 400 | 400 |
| Unknown override feature; overrides without live model | 400 | 400 |
| Wrong body shape (for example `allocations` is a string) | 400 | **Unhandled exception** (surfaces as a Lambda error / 5xx from API Gateway) |
| `OPTIONS` (CORS preflight) | 200 | 200 |

Note that a *missing field* is reported as 404 rather than 400 because `KeyError` is mapped to "not found" in both implementations.

### Route matching differences

- **Lambda** strips a leading `/api` and a trailing `/`, so `/health`, `/scenarios` and `/api/scenarios` all work, and `/`, `/api`, `/health` return the health payload. API Gateway itself routes `/api/{proxy+}` (per the repository templates), so use the `/api/...` form.
- **Flask** serves only the `/api/...` routes.

## Security and operational notes

- No authentication or rate limiting; CORS allows any origin. Do not put real data behind this API.
- `GET /api/health` exposes the raw model-load error, which may contain server paths.
- Each `GET /api/scenarios/<drug>` recomputes the scenario; `GET /api/scenarios` computes all 33 scenarios once per warm container and caches the result.
