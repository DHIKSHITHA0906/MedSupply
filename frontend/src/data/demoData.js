/**
 * demoData.js
 * ---------------------------------------------------------------------
 * Stands in for the three upstream files:
 *    output.json            -> Member A (risk engine)
 *    member_b_output.json   -> Member B (graph + triage)
 *    member_c_output.json   -> Member C (simulation + optimization)
 *
 * Every component reads data through services/api.js, never from this
 * file directly, so swapping this out for real fetch calls later
 * requires zero changes anywhere else in the app.
 *
 * Bupivacaine's numbers are the real worked example from the project
 * brief (risk 88.76%, accepted Cencora plan at ₹45,922, rejected
 * Valley Children's transfer, ripple effects via Fresenius Kabi).
 * The remaining drugs are placeholders in the same shape until real
 * A/B/C output is available for them.
 * ---------------------------------------------------------------------
 */

export const demoData = [
  {
    id: "bupivacaine",
    name: "Bupivacaine Hydrochloride Injection",
    className: "Local anesthetic",
    risk: 0.8876,
    riskWindowDays: 7,
    triageScore: 0.955,
    priority: "CRITICAL",
    fdaStatus: "CURRENT",
    currentShortage: true,
    deadline: {
      predictedStockoutDays: 3.83,
      requiredLeadDays: 2,
      latestActionInDays: 0.83,
      status: "ACT NOW",
    },
    provenance: {
      real: ["FDA shortage status", "Drug identity", "Risk score", "Manufacturer (Fresenius Kabi)"],
      simulated: ["Inventory levels", "Demand signal", "Lead time", "Unit price", "Expiry dates"],
      synthetic: ["Network topology"],
    },
    network: {
      nodes: [
        { id: "src", type: "drug", label: "Bupivacaine", x: 300, y: 40 },
        { id: "h1", type: "hospital", label: "Requesting Hospital", x: 150, y: 150, stock: 229, safe: 0, lead: 0, expiry: 64 },
        { id: "w1", type: "warehouse", label: "Cencora Regional Hub", x: 300, y: 150, stock: 3292, safe: 1228, lead: 2, expiry: 171 },
        { id: "s1", type: "supplier", label: "Valley Children's Hospital", x: 450, y: 150, stock: 856, safe: 353, lead: 1, expiry: 98 },
      ],
      edges: [["src", "h1"], ["src", "w1"], ["src", "s1"]],
    },
    candidates: [
      {
        strategy: "Cheapest-first",
        verdict: "rejected",
        source: "Valley Children's Hospital",
        units: 856,
        cost: 24603,
        leadTime: 1,
        reason: "Transfer would create a secondary shortage at the source.",
        before: 353,
        after: -502,
        safetyStock: 124,
      },
      {
        strategy: "Largest-stock-first",
        verdict: "accepted",
        source: "Cencora Regional Hub",
        units: 856,
        cost: 45922,
        leadTime: 2,
        networkRisk: 0.418,
        fillRatio: 1.0,
      },
    ],
    ripple: {
      affectedDrugs: 18,
      riskDelta: 0.0266,
      newlyAtRisk: 0,
      via: "Fresenius Kabi",
      details: [
        { drug: "Cefepime", before: 0.884, after: 0.9106, delta: 0.0266 },
        { drug: "Imipenem-Cilastatin", before: 0.61, after: 0.6366, delta: 0.0266 },
        { drug: "Ketorolac Tromethamine", before: 0.805, after: 0.8316, delta: 0.0266 },
      ],
    },
  },
  {
    id: "cefepime",
    name: "Cefepime Hydrochloride Injection",
    className: "Broad-spectrum antibiotic",
    risk: 0.884,
    riskWindowDays: 9,
    triageScore: 0.931,
    priority: "CRITICAL",
    fdaStatus: "CURRENT",
    currentShortage: true,
    deadline: { predictedStockoutDays: 5.1, requiredLeadDays: 3, latestActionInDays: 2.1, status: "ACT NOW" },
    provenance: {
      real: ["FDA shortage status", "Drug identity", "Risk score", "Manufacturer (Hikma)"],
      simulated: ["Inventory levels", "Demand signal", "Lead time", "Unit price", "Expiry dates"],
      synthetic: ["Network topology"],
    },
    network: {
      nodes: [
        { id: "src", type: "drug", label: "Cefepime", x: 300, y: 40 },
        { id: "h1", type: "hospital", label: "Requesting Hospital", x: 150, y: 150, stock: 140, safe: 0, lead: 0, expiry: 52 },
        { id: "w1", type: "warehouse", label: "AmerisourceBergen Hub", x: 300, y: 150, stock: 2100, safe: 900, lead: 3, expiry: 140 },
        { id: "s1", type: "supplier", label: "St. Luke's Medical", x: 450, y: 150, stock: 410, safe: 120, lead: 1, expiry: 80 },
      ],
      edges: [["src", "h1"], ["src", "w1"], ["src", "s1"]],
    },
    candidates: [
      { strategy: "Cheapest-first", verdict: "rejected", source: "St. Luke's Medical", units: 410, cost: 12980, leadTime: 1, reason: "Transfer would push source below its 120-unit safety stock.", before: 120, after: -42, safetyStock: 120 },
      { strategy: "Largest-stock-first", verdict: "accepted", source: "AmerisourceBergen Hub", units: 410, cost: 19850, leadTime: 3, networkRisk: 0.352, fillRatio: 1.0 },
    ],
    ripple: {
      affectedDrugs: 6, riskDelta: 0.014, newlyAtRisk: 0, via: "Hikma",
      details: [
        { drug: "Cefotaxime", before: 0.41, after: 0.424, delta: 0.014 },
        { drug: "Piperacillin-Tazobactam", before: 0.52, after: 0.534, delta: 0.014 },
      ],
    },
  },
  {
    id: "carboplatin",
    name: "Carboplatin Injection",
    className: "Chemotherapy agent",
    risk: 0.807,
    riskWindowDays: 12,
    triageScore: 0.902,
    priority: "CRITICAL",
    fdaStatus: "CURRENT",
    currentShortage: true,
    deadline: { predictedStockoutDays: 8.4, requiredLeadDays: 4, latestActionInDays: 4.4, status: "URGENT" },
    provenance: {
      real: ["FDA shortage status", "Drug identity", "Risk score", "Manufacturer (Teva)"],
      simulated: ["Inventory levels", "Demand signal", "Lead time", "Unit price", "Expiry dates"],
      synthetic: ["Network topology"],
    },
    network: {
      nodes: [
        { id: "src", type: "drug", label: "Carboplatin", x: 300, y: 40 },
        { id: "h1", type: "hospital", label: "Requesting Oncology Ctr", x: 150, y: 150, stock: 60, safe: 0, lead: 0, expiry: 30 },
        { id: "w1", type: "warehouse", label: "McKesson Distribution", x: 300, y: 150, stock: 980, safe: 400, lead: 4, expiry: 210 },
        { id: "s1", type: "supplier", label: "Regional Cancer Institute", x: 450, y: 150, stock: 210, safe: 90, lead: 2, expiry: 60 },
      ],
      edges: [["src", "h1"], ["src", "w1"], ["src", "s1"]],
    },
    candidates: [
      { strategy: "Cheapest-first", verdict: "rejected", source: "Regional Cancer Institute", units: 180, cost: 31200, leadTime: 2, reason: "Transfer leaves the source below safe minimum during its own treatment cycle.", before: 90, after: -12, safetyStock: 90 },
      { strategy: "Safe-cheapest", verdict: "accepted", source: "McKesson Distribution", units: 180, cost: 38650, leadTime: 4, networkRisk: 0.29, fillRatio: 1.0 },
    ],
    ripple: {
      affectedDrugs: 3, riskDelta: 0.008, newlyAtRisk: 0, via: "Teva",
      details: [{ drug: "Cisplatin", before: 0.33, after: 0.338, delta: 0.008 }],
    },
  },
  {
    id: "ketorolac",
    name: "Ketorolac Tromethamine Injection",
    className: "NSAID / analgesic",
    risk: 0.805,
    riskWindowDays: 10,
    triageScore: 0.869,
    priority: "HIGH",
    fdaStatus: "CURRENT",
    currentShortage: true,
    deadline: { predictedStockoutDays: 9.2, requiredLeadDays: 3, latestActionInDays: 6.2, status: "MONITOR" },
    provenance: {
      real: ["FDA shortage status", "Drug identity", "Risk score", "Manufacturer (Fresenius Kabi)"],
      simulated: ["Inventory levels", "Demand signal", "Lead time", "Unit price", "Expiry dates"],
      synthetic: ["Network topology"],
    },
    network: {
      nodes: [
        { id: "src", type: "drug", label: "Ketorolac", x: 300, y: 40 },
        { id: "h1", type: "hospital", label: "Requesting Hospital", x: 150, y: 150, stock: 95, safe: 0, lead: 0, expiry: 70 },
        { id: "w1", type: "warehouse", label: "Cardinal Health Depot", x: 300, y: 150, stock: 1440, safe: 600, lead: 3, expiry: 150 },
        { id: "s1", type: "supplier", label: "Metro General", x: 450, y: 150, stock: 305, safe: 110, lead: 1, expiry: 85 },
      ],
      edges: [["src", "h1"], ["src", "w1"], ["src", "s1"]],
    },
    candidates: [
      { strategy: "Cheapest-first", verdict: "rejected", source: "Metro General", units: 200, cost: 8100, leadTime: 1, reason: "Transfer would drop source 15 units under its safety stock threshold.", before: 110, after: -5, safetyStock: 110 },
      { strategy: "Safe-fastest", verdict: "accepted", source: "Cardinal Health Depot", units: 200, cost: 11400, leadTime: 3, networkRisk: 0.221, fillRatio: 1.0 },
    ],
    ripple: {
      affectedDrugs: 18, riskDelta: 0.0266, newlyAtRisk: 0, via: "Fresenius Kabi (shared with Bupivacaine)",
      details: [{ drug: "Bupivacaine", before: 0.861, after: 0.8876, delta: 0.0266 }],
    },
  },
];
