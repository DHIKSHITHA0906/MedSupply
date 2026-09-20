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
      // Not part of GET /api/scenarios. App.jsx fills this in from the
      // detail endpoint (null = "not loaded yet").
      predictedStockoutDays: null,
      requiredLeadDays: 0,
      latestActionInDays: row.latest_action_in_days ?? 0,
      status: normaliseDeadlineStatus(row.deadline_status),
    },

    // stubs for fields only available in the detail endpoint
    needUnits: row.need_units ?? 0,
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

  // --- Selected (recommended) plan -------------------------------------
  const rawCandidates = data.candidates || [];
  const selectedPlan =
    rawCandidates.find((c) => c.selected) ||
    rawCandidates.find((c) => c.verdict === "ACCEPTED");
  const selectedSourceIds = new Set((selectedPlan?.allocations || []).map((a) => a.source_id));

  // --- Network graph --------------------------------------------------
  // One node per facility the drug touches: the requesting hospital plus
  // every source the backend considered. Layout (x/y) is decided by the
  // NetworkGraph component, so no coordinates are produced here.
  const sources = data.sources_considered || [];
  const excludedReason = new Map((data.excluded_sources || []).map((e) => [e.id, e.reason]));
  const networkNodes = [];
  const networkEdges = [];

  const drugLabel = drug.split(" ")[0]; // e.g. "BUPIVACAINE"
  networkNodes.push({
    id: "src",
    type: "drug",
    label: drugLabel.charAt(0) + drugLabel.slice(1).toLowerCase(),
    fullName: drug,
  });

  // Requester = the hospital that needs stock
  networkNodes.push({
    id: "req",
    type: "hospital",
    label: requester.name || "Requesting hospital",
    isRequester: true,
    stock: requester.stock ?? 0,
    safe: 0, // requester has nothing to give away
    lead: null,
    expiry: null,
    safetyStock: requester.safety_stock ?? null,
    coverDays: requester.cover_days ?? null,
    connectedMedicines: requester.connected_medicines || requester.connectedMedicines || [drug],
  });
  networkEdges.push(["src", "req"]);

  sources.forEach((s) => {
    const t = (s.type || "").toLowerCase();
    const nodeType = t === "hospital" ? "hospital" : t === "warehouse" ? "warehouse" : "supplier";
    networkNodes.push({
      id: s.id,
      type: nodeType,
      label: s.name,
      stock: s.stock ?? 0,
      safe: s.safe_transferable ?? 0,
      lead: s.lead_days ?? null,
      expiry: s.expiry_days ?? null,
      safetyStock: s.safety_stock ?? null,
      unitCost: s.unit_cost ?? null,
      excludedReason: excludedReason.get(s.id) || null,
      inSelectedPlan: selectedSourceIds.has(s.id),
      connectedMedicines: s.connected_medicines || s.connectedMedicines || [drug],
    });
    networkEdges.push(["src", s.id]);
  });

  // --- Candidates (response plans) ------------------------------------
  // Every plan the backend simulated, in the backend's own order.
  // verdict is lower-cased so KPIBar's `verdict === "accepted"` keeps working.
  const needUnits = data.need_units ?? 0;
  const candidates = rawCandidates.map((c) => {
    const effects = c.ripple_effects || [];
    const via = new Set(effects.map((r) => r.via_supplier).filter(Boolean));
    const avgDelta =
      effects.length > 0 ? effects.reduce((sum, r) => sum + (r.delta || 0), 0) / effects.length : 0;
    const cdl = c.deadline || {};
    const firstImpact = (c.node_impacts || [])[0] || {};
    return {
      id: c.plan_id,
      strategy: c.strategy,
      label: c.label || c.strategy,
      mode: c.mode,
      verdict:
        c.verdict === "ACCEPTED" ? "accepted" : c.verdict === "REJECTED" ? "rejected" : "partial",
      selected: !!c.selected,
      allocations: (c.allocations || []).map((a) => ({
        id: a.source_id,
        name: a.name,
        type: (a.type || "").toLowerCase(),
        units: a.units ?? 0,
        leadDays: a.lead_days ?? null,
      })),
      units: c.delivered_units || 0,
      needed: c.needed_units ?? needUnits,
      fillRatio: c.fill_ratio ?? 0,
      cost: c.metrics?.total_cost_inr ?? null,
      leadTime: c.metrics?.max_lead_days ?? null,
      networkRisk: c.metrics?.network_risk ?? null,
      expiryWaste: c.metrics?.expiry_waste_fraction ?? 0,
      score: c.score ?? null,
      scoreBreakdown: c.score_breakdown || {},
      reasons: c.reject_reasons || [],
      sourceAfter: firstImpact.min_stock_after ?? null,
      urgency: normaliseDeadlineStatus(cdl.status),
      deadline: {
        predictedStockoutDays: cdl.predicted_stockout_days ?? null,
        latestActionInDays: cdl.latest_action_in_days ?? null,
        latestActionAt: cdl.latest_action_at ?? null,
        predictedStockoutAt: cdl.predicted_stockout_at ?? null,
        status: normaliseDeadlineStatus(cdl.status),
      },
      ripple: {
        affectedDrugs: effects.length,
        riskDelta: avgDelta,
        newlyAtRisk: effects.filter((r) => r.newly_at_risk).length,
        via: [...via].join(", ") || "N/A",
        details: effects.map((r) => ({
          drug: r.drug,
          before: r.risk_before ?? 0,
          after: r.risk_after ?? 0,
          delta: r.delta ?? 0,
        })),
      },
    };
  });

  // Ripple of the recommended plan (kept for any consumer that wants one summary)
  const ripple = candidates.find((c) => c.selected)?.ripple || {
    affectedDrugs: 0,
    riskDelta: 0,
    newlyAtRisk: 0,
    via: "N/A",
    details: [],
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

  // --- Scenario-level deadline ---------------------------------------
  // The overview must use the scenario decision_deadline. Individual
  // candidate deadlines belong to the Intervention view only.
  const dl = deadline;

  const affectedFacilities = requester.name ? 1 : 0;
  const noActionConsequence =
    deadline.status === "ACT_NOW" || deadline.status === "URGENT" || deadline.status === "OVERDUE"
      ? "Service disruption risk if no response is taken before stockout."
      : "Supply continuity risk if no response is taken before stockout.";

  const flaggedReasons = [
    `Risk score: ${((ma.risk_score ?? 0) * 100).toFixed(2)}%`,
    ma.current_shortage ? "FDA shortage status is CURRENT" : "FDA shortage status is not currently listed as CURRENT",
    ma.risk_window_days != null ? `Warning window: ${ma.risk_window_days} days` : null,
    requester.daily_forecast != null && deadline.predicted_stockout_days != null
      ? `Demand/stock evidence: ${Number(requester.daily_forecast).toFixed(2)} units/day with ${Number(requester.stock ?? 0)} units on hand; projected stockout in ${Number(deadline.predicted_stockout_days).toFixed(2)} days`
      : null,
  ].filter(Boolean);

  return {
    id: drug,
    name: drug,
    needUnits,
    requester: {
      id: requester.id ?? null,
      name: requester.name ?? null,
      stock: requester.stock ?? null,
      dailyForecast: requester.daily_forecast ?? null,
      safetyStock: requester.safety_stock ?? null,
      coverDays: requester.cover_days ?? null,
    },
    noAction: {
      stockoutDays: dl.predicted_stockout_days ?? null,
      stockoutAt: dl.predicted_stockout_at ?? null,
      unmetUnits: needUnits || null,
      affectedFacilities,
      consequence: noActionConsequence,
    },
    flaggedReasons,
    className: "", // backend does not provide drug class
    risk: ma.risk_score ?? 0,
    riskWindowDays: ma.risk_window_days ?? 0,
    triageScore: triage.score ?? 0,
    priority: triage.priority ?? "HIGH",
    fdaStatus: ma.current_shortage ? "CURRENT" : "NONE",
    currentShortage: ma.current_shortage ?? false,
    deadline: {
      predictedStockoutDays: dl.predicted_stockout_days ?? null,
      requiredLeadDays: dl.required_lead_days ?? 0,
      latestActionInDays: dl.latest_action_in_days ?? 0,
      latestActionAt: dl.latest_action_at ?? null,
      predictedStockoutAt: dl.predicted_stockout_at ?? null,
      status: normaliseDeadlineStatus(dl.status),
    },
    provenance,
    network: { nodes: networkNodes, edges: networkEdges },
    candidates,
    ripple,
  };
}

/* ------------------------------------------------------------------ */
/*  Offline demo fixtures -> current data model                        */
/* ------------------------------------------------------------------ */

/**
 * demoData.js still uses the original, simpler shape (one accepted + one
 * rejected plan). This maps it onto the model the components read now, so
 * flipping USE_LIVE_API to false keeps working.
 */
function adaptDemoDrug(d) {
  const nodes = (d.network?.nodes || []).map((n) => ({
    ...n,
    isRequester: n.id === "h1" || undefined,
    lead: n.type === "drug" || n.id === "h1" ? null : n.lead,
    expiry: n.type === "drug" || n.id === "h1" ? null : n.expiry,
  }));
  const typeOf = (name) => nodes.find((n) => n.label === name)?.type || "warehouse";
  const emptyRipple = { affectedDrugs: 0, riskDelta: 0, newlyAtRisk: 0, via: "N/A", details: [] };
  const candidates = (d.candidates || []).map((c, i) => ({
    id: `D${i + 1}`,
    strategy: "",
    label: c.strategy,
    mode: c.verdict === "accepted" ? "safe" : "baseline",
    verdict: c.verdict,
    selected: c.verdict === "accepted",
    allocations: [{ id: `demo-${i}`, name: c.source, type: typeOf(c.source), units: c.units, leadDays: c.leadTime }],
    units: c.units,
    needed: c.units,
    fillRatio: c.fillRatio ?? 1,
    cost: c.cost,
    leadTime: c.leadTime,
    networkRisk: c.networkRisk ?? null,
    expiryWaste: c.expiryWaste ?? 0,
    score: c.verdict === "accepted" ? 0.2 : null,
    scoreBreakdown: {},
    reasons: c.reason ? [c.reason] : [],
    deadline: {
      predictedStockoutDays: d.deadline?.predictedStockoutDays ?? null,
      latestActionInDays: d.deadline?.latestActionInDays ?? null,
      status: d.deadline?.status,
    },
    ripple: c.verdict === "accepted" ? d.ripple || emptyRipple : emptyRipple,
  }));
  return {
    ...d,
    needUnits: candidates.find((c) => c.verdict === "accepted")?.units ?? 0,
    requester: d.requester || null,
    noAction: d.noAction || {
      stockoutDays: d.deadline?.predictedStockoutDays ?? null,
      stockoutAt: null,
      unmetUnits: candidates.find((c) => c.verdict === "accepted")?.units ?? null,
      affectedFacilities: 1,
      consequence: "Service disruption risk if no response is taken before stockout.",
    },
    flaggedReasons: d.flaggedReasons || [
      `Risk score: ${(d.risk * 100).toFixed(2)}%`,
      d.currentShortage ? "FDA shortage status is CURRENT" : "FDA shortage status is not currently listed as CURRENT",
      `Warning window: ${d.riskWindowDays} days`,
    ],
    network: { nodes, edges: d.network?.edges || [] },
    candidates,
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
    return Promise.resolve(demoData.map(adaptDemoDrug));
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
    return Promise.resolve(found ? adaptDemoDrug(found) : null);
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
