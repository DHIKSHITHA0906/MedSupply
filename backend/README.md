# MedSupply - Member C (Features 4, 5, 6, 7)

Safe sourcing -> counterfactual simulation -> weighted optimization -> decision deadline.

## Run
    python main.py            # writes member_c_output.json (33 scenarios)
    python test_member_c.py   # 5 tests
    python app.py             # API on :5000 for Member D

## Inputs (in data/)
- member_b_output.json   (Member B: graph, triage, supplier bottlenecks; Member A risk is inside it, untouched)
- demand_baseline.json   (daily demand + trend per drug, derived from Member A's integrated_risk_training.csv)

## Pipeline per at-risk drug (risk >= 0.5)
1. build_scenario   - synthetic stock/lead/price/expiry for 3 other hospitals, 3 warehouses, real manufacturers
2. classify_sources - safe = stock - safety stock - forecast demand over 14d  (#4)
3. generate_candidates - unfiltered baselines + safe plans
4. simulate         - copy network, apply plan, project each node day by day, BEFORE vs AFTER,
                      ripple to sibling drugs of a squeezed manufacturer, requester resolved in time?  (#5)
5. score_and_select - only ACCEPTED plans: cost + network risk + lead time + expiry, hardcoded weights (#6)
6. compute_deadline - stockout - lead - intervention (#7)

## API (for Member D)
GET  /api/scenarios                 -> summary + one row per drug (triage order)
GET  /api/scenarios/<drug>          -> full scenario (candidates side by side, deadline)
POST /api/simulate                  -> {"drug": "...", "allocations":[{"source_id":"HOSP_APEX_HEALTH","units":300}]}
                                       live what-if for the intervention panel (Feature #5)
GET  /api/predict                   -> live ML risk for all 40 drugs (Member A's .pkl model)
GET  /api/predict/<drug>            -> {risk_score, risk_window_days, current_shortage, source}
POST /api/predict                   -> {"drug":"...","overrides":{"inventory_units":123}}  EXPERIMENTAL sensitivity probe,
                                       NOT a causal what-if (see "warning" in the response). Do not demo as a simulation.
GET  /api/health                    -> status + whether the live model loaded

source = "live_model" | "precomputed_member_a_output" (fallback when scikit-learn is not in the deployment)
AWS: see deploy/DEPLOY.md (Lambda + API + S3 + Step Functions).

## JSON contract - key fields per scenario
drug, member_a{risk_score,risk_window_days}, triage{rank,priority}, requester{name,stock,cover_days},
need_units, sources_considered[], excluded_sources[{reason}], candidates[],
selected_plan_id, decision_deadline{status,latest_action_in_days,latest_action_at,predicted_stockout_at},
recommendation_status, provenance

candidate: plan_id, mode(baseline|safe|custom), label, verdict(ACCEPTED|REJECTED|PARTIAL_SAFE), reject_reasons[],
allocations[], fill_ratio, node_impacts[before/after], ripple_effects[], metrics, score, score_breakdown, selected

deadline.status: OK | URGENT | ACT_NOW | OVERDUE

## Honesty labels (show in UI)
REAL: drug identity, Member A risk, demand level, manufacturer names.
SIMULATED: per-node stock, lead time, price, expiry, hospital/warehouse topology.
Decision support only - human/pharmacist review required. No clinical substitution advice.
