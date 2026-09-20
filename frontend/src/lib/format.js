/**
 * format.js — small display helpers shared by the components.
 * Pure functions only; nothing here talks to the API.
 */

export function fmtCurrency(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return (
    "₹" +
    Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function fmtUnits(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-IN");
}

/** "3.8" — one decimal, or "—" when we don't have the number yet. */
export function fmtDays1(n) {
  return n == null || Number.isNaN(n) ? "—" : Number(n).toFixed(1);
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "BUPIVACAINE HYDROCHLORIDE INJECTION" -> { main: "BUPIVACAINE", rest: "Hydrochloride injection" } */
export function splitName(name = "") {
  const [first, ...others] = name.trim().split(/\s+/);
  const rest = others.join(" ").toLowerCase();
  return {
    main: first || "",
    rest: rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "",
  };
}

export function titleCase(s = "") {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/* ----------------------------- deadlines ----------------------------- */

/** Deadline statuses that mean "someone has to act now / very soon". */
const ACTION_STATUSES = ["ACT NOW", "URGENT", "OVERDUE"];

export function isActiveShortage(d) {
  return !!d.currentShortage;
}

/** Active shortage whose backend deadline status says act now / urgent / overdue. */
export function needsActionToday(d) {
  return isActiveShortage(d) && ACTION_STATUSES.includes(d.deadline?.status);
}

/** Active shortage that still has some breathing room. */
export function isUnderWatch(d) {
  return isActiveShortage(d) && !needsActionToday(d);
}

/** Visual tone for a deadline status: "critical" | "urgent" | "ok". */
export function deadlineTone(status) {
  if (status === "ACT NOW" || status === "OVERDUE") return "critical";
  if (status === "URGENT") return "urgent";
  return "ok";
}

/** "You need to respond within 20 hours." style sentence parts. */
export function respondWithin(days) {
  if (days == null || Number.isNaN(days)) return null;
  if (days <= 0) return { late: true, text: "The response window has already passed" };
  const hours = days * 24;
  if (hours < 48) {
    const h = Math.max(1, Math.round(hours));
    return { late: false, text: `${h} ${h === 1 ? "hour" : "hours"}` };
  }
  return { late: false, text: `${days.toFixed(1)} days` };
}

/* ------------------------------ network ------------------------------ */

export function riskBand(v) {
  if (v == null) return { label: "—", tone: "" };
  if (v < 0.5) return { label: "Low", tone: "low" };
  if (v < 0.7) return { label: "Medium", tone: "med" };
  return { label: "High", tone: "high" };
}

export const TYPE_LABEL = {
  supplier: "Supplier",
  warehouse: "Warehouse",
  hospital: "Hospital",
};
export const TYPE_LABEL_PLURAL = {
  supplier: "Suppliers",
  warehouse: "Warehouses",
  hospital: "Hospitals",
};

/* ------------------------------- plans ------------------------------- */

const PLAN_TITLES = {
  safe_largest: "Largest stock first",
  safe_cheapest: "Lowest cost",
  safe_fastest: "Fastest delivery",
  safe_balanced: "Balanced across sources",
  safe_headroom: "Most spare stock first",
  safe_internal: "Hospitals and warehouses only",
  naive_cheapest: "Cheapest first",
  naive_fastest: "Fastest first",
  naive_largest: "Largest stock first",
};

export function planTitle(plan) {
  return PLAN_TITLES[plan.strategy] || plan.label || plan.strategy || "Response plan";
}

/** Short line describing where the stock comes from. */
export function planSources(plan) {
  const a = plan.allocations || [];
  if (a.length === 0) return "No sources";
  if (a.length === 1) return a[0].name;
  return `${a.length} sources`;
}

export function planTypes(plan) {
  const seen = [];
  for (const a of plan.allocations || []) {
    if (a.type && !seen.includes(a.type)) seen.push(a.type);
  }
  return seen;
}

export function arrivalDate(leadDays) {
  if (leadDays == null) return "";
  const d = new Date(Date.now() + leadDays * 86400000);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
