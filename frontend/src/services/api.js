/**
 * api.js
 * ---------------------------------------------------------------------
 * The only file that should know whether data is coming from the demo
 * fixtures or the live pipeline.  Every component calls these functions
 * and never imports demoData.js directly.
 *
 * When USE_LIVE_API is true, data is fetched from the AWS API Gateway
 * and transformed into the frontend's data model right here — no
 * API-specific logic leaks into components.
 *
 * When USE_LIVE_API is false, the original demoData is returned as a
 * fallback so the app works offline / without the backend.
 * ---------------------------------------------------------------------
 */

import { demoData } from "../data/demoData";

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const USE_LIVE_API = true; // flip to false to use demoData as fallback

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  "https://ir06s4arb0.execute-api.ap-southeast-2.amazonaws.com";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function apiFetch(path, options) {
  const url = `${API_BASE}${path}`;
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    throw new Error(`Network error fetching ${url}: ${err.message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} from ${path}: ${body}`);
  }
  return res.json();
}

/**
 * Normalise deadline_status strings from the backend
 * (e.g. "ACT_NOW" → "ACT NOW") so components can match them.
 */
function normaliseDeadlineStatus(s) {
  if (!s) return "OK";
  return s.replace(/_/g, " ");
}

/* ------------------------------------------------------------------ */
/*  Backend → Frontend transformers                                    */
/* ------------------------------------------------------------------ */

/**
 * Transform a scenario list row (from GET /api/scenarios → .scenarios[])
 * into a "thin" object with enough fields for TriageQueue + KPIBar.
 *
 * KPIBar reads:  priority, currentShortage, candidates[].verdict, deadline.latestActionInDays
 * TriageQueue reads:  id, name, risk, priority, deadline.status
 * App.jsx reads: id, (first item for default selection)
 *
 * @param {Object} row        — one element from /api/scenarios → .scenarios[]
 * @param {Map}    predictMap — Map<drugName, predictionObject> from GET /api/predict
 */
function transformScenarioRow(row, predictMap) {
  // Build minimal candidates array so KPIBar's
  // .candidates.filter(c => c.verdict === "accepted").length works.
  // The `accepted` and `rejected` counts come from the real backend data
  // (each scenario row includes how many candidate plans passed / failed
  // the simulation), so these stubs carry the correct real totals.
  const candidates = [];
  for (let i = 0; i < (row.accepted || 0); i++) {
    candidates.push({ verdict: "accepted" });
  }
  for (let i = 0; i < (row.rejected || 0); i++) {
    candidates.push({ verdict: "rejected" });
  }

  // Look up real current_shortage from the /api/predict data (Member A).
  // Do NOT infer from risk_score or presence in the scenarios list.
  const prediction = predictMap.get(row.drug);
  const currentShortage = prediction?.current_shortage ?? false;

  return {
    // identity
    id: row.drug,
    name: row.drug,
    className: "",

    // risk
    risk: row.risk_score ?? 0,
    riskWindowDays: prediction?.risk_window_days ?? 0,
    triageScore: row.triage?.score ?? 0,
    priority: row.triage?.priority ?? "HIGH",

    // shortage — derived from real Member A prediction data
    fdaStatus: currentShortage ? "CURRENT" : "NONE",
    currentShortage,

    // deadline
    deadline: {
      predictedStockoutDays: 0,
      requiredLeadDays: 0,
      latestActionInDays: row.latest_action_in_days ?? 0,
      status: normaliseDeadlineStatus(row.deadline_status),
    },

    // stubs for fields only available in the detail endpoint
    provenance: { real: [], simulated: [], synthetic: [] },
    network: { nodes: [], edges: [] },
    candidates,
    ripple: { affectedDrugs: 0, riskDelta: 0, newlyAtRisk: 0, via: "", details: [] },
  };
}

/**
 * Transform the full scenario detail (from GET /api/scenarios/{drug})
 * into the shape the DetailPanel and its sub-components expect.
 */
function transformScenarioDetail(data) {
  const drug = data.drug;
  const ma = data.member_a || {};
  const triage = data.triage || {};
  const requester = data.requester || {};
  const deadline = data.decision_deadline || {};
  const prov = data.provenance || {};

  // --- Network graph --------------------------------------------------
  // Build nodes + edges from requester + sources_considered
  const sources = data.sources_considered || [];
  const networkNodes = [];
  const networkEdges = [];

  // Drug node (root, at top center)
  const drugLabel = drug.split(" ")[0]; // e.g. "BUPIVACAINE"
  networkNodes.push({
    id: "src",
    type: "drug",
    label: drugLabel.charAt(0) + drugLabel.slice(1).toLowerCase(),
    x: 300,
    y: 40,
  });

  // Requester node (the hospital that needs stock)
  networkNodes.push({
    id: "req",
    type: "hospital",
    label: requester.name || "Requesting Hospital",
    x: 80,
    y: 150,
    stock: requester.stock ?? 0,
    safe: 0, // requester has no safe-transferable
    lead: 0,
    expiry: 0,
  });
  networkEdges.push(["src", "req"]);

  // Source nodes (spread horizontally)
  const maxSourcesForGraph = 6; // limit to avoid overcrowding the SVG
  const visibleSources = sources.slice(0, maxSourcesForGraph);
  const spacing = 520 / Math.max(visibleSources.length, 1);
  visibleSources.forEach((s, i) => {
    const nodeType =
      s.type === "Hospital"
        ? "hospital"
        : s.type === "Warehouse"
        ? "warehouse"
        : "supplier";
    const nodeId = `s${i}`;
    networkNodes.push({
      id: nodeId,
      type: nodeType,
      label: s.name,
      x: 80 + spacing * (i + 1),
      y: 150,
      stock: s.stock ?? 0,
      safe: s.safe_transferable ?? 0,
      lead: s.lead_days ?? 0,
      expiry: s.expiry_days ?? 0,
    });
    networkEdges.push(["src", nodeId]);
  });

  // --- Candidates (transfer plans) -----------------------------------
  // Find the selected (best accepted) plan and the first rejected plan
  const rawCandidates = data.candidates || [];
  const selectedPlan = rawCandidates.find((c) => c.selected) ||
    rawCandidates.find((c) => c.verdict === "ACCEPTED");
  const rejectedPlan = rawCandidates.find((c) => c.verdict === "REJECTED");

  const candidates = [];

  if (rejectedPlan) {
    const impact = (rejectedPlan.node_impacts || [])[0] || {};
    candidates.push({
      strategy: rejectedPlan.label || rejectedPlan.strategy,
      verdict: "rejected",
      source: (rejectedPlan.allocations || [])[0]?.name || "Unknown",
      units: rejectedPlan.delivered_units || 0,
      cost: rejectedPlan.metrics?.total_cost_inr ?? 0,
      leadTime: rejectedPlan.metrics?.max_lead_days ?? 0,
      reason:
        (rejectedPlan.reject_reasons || []).join("; ") ||
        "Plan rejected by simulation.",
      before: impact.min_stock_before ?? 0,
      after: impact.min_stock_after ?? 0,
      safetyStock: impact.safety_stock ?? 0,
    });
  }

  if (selectedPlan) {
    candidates.push({
      strategy: selectedPlan.label || selectedPlan.strategy,
      verdict: "accepted",
      source:
        selectedPlan.allocations?.length === 1
          ? selectedPlan.allocations[0].name
          : `${selectedPlan.allocations?.length ?? 0} sources`,
      units: selectedPlan.delivered_units || 0,
      cost: selectedPlan.metrics?.total_cost_inr ?? 0,
      leadTime: selectedPlan.metrics?.max_lead_days ?? 0,
      networkRisk: selectedPlan.metrics?.network_risk ?? 0,
      fillRatio: selectedPlan.fill_ratio ?? 0,
    });
  }

  // --- Ripple effects -------------------------------------------------
  const selectedRipple = selectedPlan?.ripple_effects || [];
  const rippleViaSet = new Set(selectedRipple.map((r) => r.via_supplier).filter(Boolean));
  const avgDelta =
    selectedRipple.length > 0
      ? selectedRipple.reduce((sum, r) => sum + (r.delta || 0), 0) / selectedRipple.length
      : 0;
  const ripple = {
    affectedDrugs: selectedRipple.length,
    riskDelta: avgDelta,
    newlyAtRisk: selectedRipple.filter((r) => r.newly_at_risk).length,
    via: [...rippleViaSet].join(", ") || "N/A",
    details: selectedRipple.map((r) => ({
      drug: r.drug,
      before: r.risk_before ?? 0,
      after: r.risk_after ?? 0,
      delta: r.delta ?? 0,
    })),
  };

  // --- Provenance -----------------------------------------------------
  const provenance = {
    real: [],
    simulated: [],
    synthetic: [],
  };
  if (prov.drug_identity) provenance.real.push(`Drug identity: ${prov.drug_identity}`);
  if (prov.risk) provenance.real.push(`Risk score: ${prov.risk}`);
  if (prov.demand_level) provenance.real.push(`Demand level: ${prov.demand_level}`);
  if (prov.inventory_lead_time_price_expiry)
    provenance.simulated.push(`Inventory / lead time / price / expiry: ${prov.inventory_lead_time_price_expiry}`);
  if (prov.network_topology)
    provenance.synthetic.push(`Network topology: ${prov.network_topology}`);
  // Ensure at least one item per column so the UI doesn't render empty
  if (provenance.real.length === 0) provenance.real.push("FDA shortage status");
  if (provenance.simulated.length === 0) provenance.simulated.push("Inventory levels");
  if (provenance.synthetic.length === 0) provenance.synthetic.push("Network topology");

  // --- Deadline -------------------------------------------------------
  const dl = selectedPlan?.deadline || deadline;

  return {
    id: drug,
    name: drug,
    className: "", // backend does not provide drug class
    risk: ma.risk_score ?? 0,
    riskWindowDays: ma.risk_window_days ?? 0,
    triageScore: triage.score ?? 0,
    priority: triage.priority ?? "HIGH",
    fdaStatus: ma.current_shortage ? "CURRENT" : "NONE",
    currentShortage: ma.current_shortage ?? false,
    deadline: {
      predictedStockoutDays: dl.predicted_stockout_days ?? 0,
      requiredLeadDays: dl.required_lead_days ?? 0,
      latestActionInDays: dl.latest_action_in_days ?? 0,
      status: normaliseDeadlineStatus(dl.status),
    },
    provenance,
    network: { nodes: networkNodes, edges: networkEdges },
    candidates,
    ripple,
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch the scenario list for the triage queue and KPI bar.
 * Returns an array of objects in the frontend's data shape.
 *
 * Fetches GET /api/scenarios AND GET /api/predict in parallel so that
 * each scenario row can be enriched with the real `current_shortage`
 * value from Member A's prediction data.
 */
export async function getScenarios() {
  if (!USE_LIVE_API) {
    return Promise.resolve(demoData);
  }

  // Fetch both endpoints in parallel
  const [scenariosJson, predictJson] = await Promise.all([
    apiFetch("/api/scenarios"),
    apiFetch("/api/predict").catch(() => ({ predictions: [] })), // graceful fallback
  ]);

  // Build a lookup map: drug name → prediction object
  const predictMap = new Map();
  for (const p of predictJson.predictions || []) {
    predictMap.set(p.drug, p);
  }

  // Backend wraps the list in { summary: {...}, scenarios: [...] }
  const rows = scenariosJson.scenarios || [];
  return rows.map((row) => transformScenarioRow(row, predictMap));
}

/**
 * Fetch the full detail for a single drug scenario.
 * Uses GET /api/scenarios/{drug} (URL-encoded drug name).
 */
export async function getScenario(drugId) {
  if (!USE_LIVE_API) {
    const found = demoData.find((d) => d.id === drugId);
    return Promise.resolve(found ?? null);
  }
  const json = await apiFetch(`/api/scenarios/${encodeURIComponent(drugId)}`);
  return transformScenarioDetail(json);
}

/**
 * Run a simulation.
 * POST /api/simulate with { drug, allocations }.
 *
 * `allocations` should be an array of { source_id, units } objects,
 * matching the backend's expected shape.  If called with the legacy
 * (drugId, candidateId) signature, we attempt a best-effort payload.
 */
export async function simulate(drugId, allocations) {
  if (!USE_LIVE_API) {
    const found = demoData.find((d) => d.id === drugId);
    return Promise.resolve(found?.candidates ?? []);
  }

  // Support both new shape (array of allocations) and legacy (candidateId string)
  let payload;
  if (Array.isArray(allocations)) {
    payload = { drug: drugId, allocations };
  } else {
    // Legacy fallback: candidateId was passed as second arg
    payload = { drug: drugId, allocations: [{ source_id: allocations }] };
  }

  const json = await apiFetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return json;
}
