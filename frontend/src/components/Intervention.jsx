import { useEffect, useMemo, useRef, useState } from "react";
import {
  TYPE_LABEL,
  TYPE_LABEL_PLURAL,
  arrivalDate,
  fmtCurrency,
  fmtUnits,
  planSources,
  planTitle,
  planTypes,
  respondWithin,
  riskBand,
} from "../lib/format";
import { simulate } from "../services/api";
const SOURCE_FILTERS = ["all", "supplier", "hospital", "warehouse"];

const SORTS = {
  recommended: { label: "Recommended (default)" },
  cost: { label: "Lowest cost" },
  fastest: { label: "Fastest delivery" },
  risk: { label: "Lowest network risk" },
};

function sortPlans(plans, sort) {
  const num = (v, fallback = Infinity) => (v == null ? fallback : v);
  const by = {
    recommended: (a, b) =>
      Number(b.selected) - Number(a.selected) || num(a.score) - num(b.score),
    cost: (a, b) => num(a.cost) - num(b.cost),
    fastest: (a, b) => num(a.leadTime) - num(b.leadTime) || num(a.cost) - num(b.cost),
    risk: (a, b) => num(a.networkRisk) - num(b.networkRisk),
  }[sort];
  return [...plans].sort(by);
}

/** One-line reading of a plan's own deadline. */
function orderBy(plan) {
  const days = plan.deadline?.latestActionInDays;
  if (days == null) return { text: "—", late: false };
  const w = respondWithin(days);
  if (w.late) return { text: "Too late — arrives after stockout", late: true };
  return { text: `Order within ${w.text}`, late: false };
}

function impactText(plan) {
  const r = plan.ripple;
  if (!r || r.affectedDrugs === 0) return { main: "No new shortage", sub: "" };
  const main = r.newlyAtRisk > 0 ? `${r.newlyAtRisk} drugs newly at risk` : "No new shortage";
  return { main, sub: `Risk +${(r.riskDelta * 100).toFixed(2)}% on ${r.affectedDrugs} other drugs` };
}

function RiskPill({ value }) {
  const b = riskBand(value);
  return b.tone ? <span className={`risk-pill ${b.tone}`}>{b.label}</span> : null;
}

function InfoTipLike({ text, children }) {
  return (
    <span className="info-tip" tabIndex="0" aria-label={text}>
      {children}
      <span className="info-tip-bubble" role="tooltip">{text}</span>
    </span>
  );
}

/* ------------------------------ card view ------------------------------ */
function PlanCard({ plan, rank, isSelected, onSelect }) {
  const types = planTypes(plan);
  const ob = orderBy(plan);
  const multi = plan.allocations.length > 1;

  return (
    <article
      id={`plan-${plan.id}`}
      className={`plan-card ${isSelected ? "selected" : ""} ${plan.selected ? "recommended" : ""}`}
    >
      <div className="pc-top">
        <span className="rank">{rank}</span>
        {plan.selected && <span className="rec-tag">★ Recommended</span>}
        <span className="pc-types">
          {types.map((t) => (
            <span key={t} className={`type-tag ${t}`}>
              {TYPE_LABEL[t]}
            </span>
          ))}
        </span>
      </div>

      <h4 className="pc-title">{planTitle(plan)}</h4>
      <p className="pc-sub">{multi ? `${plan.allocations.length} sources` : planSources(plan)}</p>

      {multi && (
        <details className="pc-alloc">
          <summary>See where the stock comes from</summary>
          <ul>
            {plan.allocations.map((a) => (
              <li key={a.id}>
                <span>{a.name}</span>
                <span className="mono">
                  {fmtUnits(a.units)} units
                  {a.leadDays != null ? ` · ${a.leadDays}d` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <dl className="pc-metrics">
        <div>
          <dt>Quantity</dt>
          <dd>
            {fmtUnits(plan.units)} <span className="dim">of {fmtUnits(plan.needed)} units</span>
          </dd>
        </div>
        <div>
          <dt>Estimated cost</dt>
          <dd className="strong">{fmtCurrency(plan.cost)}</dd>
        </div>
        <div>
          <dt>Lead time</dt>
          <dd>{plan.leadTime == null ? "—" : `${plan.leadTime} ${plan.leadTime === 1 ? "day" : "days"}`}</dd>
        </div>
        <div>
          <dt><InfoTipLike text="Simulated risk introduced across the supply network after this intervention.">Future network risk ⓘ</InfoTipLike></dt>
          <dd>
            {plan.networkRisk == null ? "—" : plan.networkRisk.toFixed(4)} <RiskPill value={plan.networkRisk} />
          </dd>
        </div>
        <div>
          <dt>Fill ratio</dt>
          <dd>{Math.round(plan.fillRatio * 100)}%</dd>
        </div>
        <div>
          <dt><InfoTipLike text="Estimated fraction of stock wasted due to expiry in the simulation.">Expiry waste</InfoTipLike></dt>
          <dd>{plan.expiryWaste == null ? "—" : `${(plan.expiryWaste * 100).toFixed(1)}%`}</dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd className={ob.late ? "late" : ""}>{ob.text}</dd>
        </div>
      </dl>

      <div className="simulation-result safe">
        <span className="status-dot" /> SAFE — simulation does not create a new shortage
      </div>

      <button
        type="button"
        className={`select-btn ${isSelected ? "on" : ""}`}
        onClick={() => onSelect(plan.id)}
        aria-pressed={isSelected}
      >
        <span className="radio" aria-hidden="true" />
        {isSelected ? "Selected" : "Select this option"}
      </button>
    </article>
  );
}

/* ------------------------------ list view ------------------------------ */
function PlanList({ plans, selectedId, onDetails }) {
  return (
    <div className="plan-table-wrap">
      <table className="plan-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Option</th>
            <th>Supplier / source</th>
            <th>Quantity</th>
            <th>Estimated arrival</th>
            <th>Expected impact</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {plans.map((p, i) => {
            const imp = impactText(p);
            const late = orderBy(p).late;
            return (
              <tr key={p.id} className={selectedId === p.id ? "selected" : ""}>
                <td className="mono">{i + 1}</td>
                <td>
                  <div className="pt-types">
                    {planTypes(p).map((t) => (
                      <span key={t} className={`type-tag ${t}`}>
                        {TYPE_LABEL[t]}
                      </span>
                    ))}
                  </div>
                  <div className="pt-title">{planTitle(p)}</div>
                  {p.selected && <div className="pt-rec">★ Recommended</div>}
                </td>
                <td>
                  {p.allocations.length === 1 ? (
                    <>
                      <div>{p.allocations[0].name}</div>
                      <div className="dim small">{TYPE_LABEL[p.allocations[0].type] || ""}</div>
                    </>
                  ) : (
                    <div>{p.allocations.length} sources</div>
                  )}
                </td>
                <td className="mono">{fmtUnits(p.units)} units</td>
                <td>
                  <div>{p.leadTime == null ? "—" : `${p.leadTime} ${p.leadTime === 1 ? "day" : "days"}`}</div>
                  <div className="dim small">{arrivalDate(p.leadTime)}</div>
                </td>
                <td>
                  <div>{imp.main}</div>
                  {imp.sub && <div className="dim small">{imp.sub}</div>}
                  <div className="dim small">Expiry waste: {p.expiryWaste == null ? "—" : `${(p.expiryWaste * 100).toFixed(1)}%`}</div>
                </td>
                <td>
                  <span className={`safe-pill ${late ? "late" : ""}`}>{late ? "Safe, but late" : "Safe"}</span>
                </td>
                <td>
                  <button type="button" className="btn-outline" onClick={() => onDetails(p.id)}>
                    View details →
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


function TearComparison({ acceptedPlan, rejectedPlan, onSelect }) {
  if (!acceptedPlan && !rejectedPlan) return null;
  return (
    <section className="tear-compare" aria-label="Accepted versus rejected intervention comparison">
      <div className="tear-half rejected">
        <div className="tear-label bad"><span>✕</span> Rejected by simulation</div>
        {rejectedPlan ? (
          <>
            <div className="tear-title">{planTitle(rejectedPlan)}</div>
            <div className="tear-source">{planSources(rejectedPlan)} · {rejectedPlan.urgency || "—"}</div>
            <div className="tear-metrics">
              <div><span>Quantity</span><strong>{fmtUnits(rejectedPlan.units)} units</strong></div>
              <div><span>Lead time</span><strong>{rejectedPlan.leadTime ?? "—"}d</strong></div>
              <div><span>Cost</span><strong>{fmtCurrency(rejectedPlan.cost)}</strong></div>
              <div><span>Source after</span><strong>{rejectedPlan.sourceAfter == null ? "—" : fmtUnits(rejectedPlan.sourceAfter)}</strong></div>
              <div><span>Simulation</span><strong className="bad-text">REJECTED</strong></div>
            </div>
            <div className="tear-reason">{rejectedPlan.reasons?.join(" ") || "The simulation found a secondary shortage risk."}</div>
          </>
        ) : <div className="dim">No rejected candidate in this scenario.</div>}
      </div>
      <div className="tear-seam" aria-hidden="true"><span>↕</span></div>
      <div className="tear-half accepted">
        <div className="tear-label good"><span>✓</span> Safe option</div>
        {acceptedPlan ? (
          <>
            <div className="tear-title">{planTitle(acceptedPlan)}</div>
            <div className="tear-source">{planSources(acceptedPlan)} · {acceptedPlan.urgency || "—"}</div>
            <div className="tear-metrics">
              <div><span>Quantity</span><strong>{fmtUnits(acceptedPlan.units)} units</strong></div>
              <div><span>Lead time</span><strong>{acceptedPlan.leadTime ?? "—"}d</strong></div>
              <div><span>Cost</span><strong>{fmtCurrency(acceptedPlan.cost)}</strong></div>
              <div><span>Future network risk</span><strong>{acceptedPlan.networkRisk == null ? "—" : acceptedPlan.networkRisk.toFixed(4)}</strong></div>
              <div><span>Expiry waste</span><strong>{acceptedPlan.expiryWaste == null ? "—" : `${(acceptedPlan.expiryWaste * 100).toFixed(1)}%`}</strong></div>
              <div><span>Simulation</span><strong className="good-text">ACCEPTED</strong></div>
            </div>
            <div className="tear-action"><button type="button" onClick={() => onSelect(acceptedPlan.id)}>Use this option →</button></div>
          </>
        ) : <div className="dim">No safe plan available.</div>}
      </div>
    </section>
  );
}

/* ------------------------------- main ------------------------------- */
export default function Intervention({ d, view, onViewChange }) {
  const accepted = useMemo(() => d.candidates.filter((c) => c.verdict === "accepted"), [d.candidates]);
  const notSafe = useMemo(() => d.candidates.filter((c) => c.verdict !== "accepted"), [d.candidates]);
  const recommended = accepted.find((c) => c.selected) || accepted[0] || null;

  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("recommended");
  const [selectedId, setSelectedId] = useState(recommended?.id ?? null);
  const [confirmed, setConfirmed] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const scrollTo = useRef(null);

  // "View details →" in the list view flips to cards and scrolls to the plan
  useEffect(() => {
    if (view === "compare" && scrollTo.current) {
      const el = document.getElementById(`plan-${scrollTo.current}`);
      scrollTo.current = null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [view]);

  const counts = Object.fromEntries(
    SOURCE_FILTERS.map((t) => [
      t,
      t === "all" ? accepted.length : accepted.filter((p) => p.allocations.some((a) => a.type === t)).length,
    ])
  );
  const filtered = sortPlans(
    accepted.filter((p) => source === "all" || p.allocations.some((a) => a.type === source)),
    sort
  );
  const chosen = accepted.find((p) => p.id === selectedId) || null;

  const select = async (id) => {
  setSelectedId(id);
  setConfirmed(false);
  setSimulationResult(null);

  const plan = accepted.find((p) => p.id === id);
  if (!plan) return;

  setSimulating(true);

  try {
    const allocations = plan.allocations.map((a) => ({
      source_id: a.id,
      units: a.units,
    }));

    const result = await simulate(d.name, allocations);
    setSimulationResult(result);
  } catch (err) {
    setSimulationResult({ error: err.message });
  } finally {
    setSimulating(false);
  }
};

  if (accepted.length === 0) {
    return (
      <div className="empty-block">
        <p>
          The simulation found no safe way to cover this shortage yet, so there is nothing to compare.
        </p>
      </div>
    );
  }

  const chosenLate = chosen ? orderBy(chosen).late : false;
  const rp = chosen?.ripple;

  return (
    <>
      <div className="iv-head">
        <div>
          <h3 className="section-title big">Intervention</h3>
          <p className="hint">Select a response plan to resolve the predicted shortage.</p>
        </div>
        <div className="iv-facts">
          <div className="stat">
            <div className="k">Drug</div>
            <div className="v txt">{d.name}</div>
          </div>
          <div className="stat">
            <div className="k">Demand to fulfil</div>
            <div className="v">{fmtUnits(d.needUnits)} units</div>
          </div>
          <div className="stat">
            <div className="k">Priority</div>
            <div className={`v txt prio ${d.priority}`}>{d.priority}</div>
          </div>
        </div>
      </div>

      <TearComparison
        acceptedPlan={chosen || recommended}
        rejectedPlan={notSafe[0] || null}
        onSelect={select}
      />

      <div className="iv-controls">
        <div className="ctl">
          <span className="ctl-label">Response source</span>
          <div className="seg" role="group" aria-label="Response source">
            {SOURCE_FILTERS.map((t) => (
              <button
                key={t}
                type="button"
                className={source === t ? "on" : ""}
                onClick={() => setSource(t)}
                aria-pressed={source === t}
              >
                {t === "all" ? "All" : TYPE_LABEL_PLURAL[t]} <span className="chip-n">{counts[t]}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="ctl">
          <span className="ctl-label">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <div className="ctl push">
          <span className="ctl-label">View</span>
          <div className="seg" role="group" aria-label="View">
            <button type="button" className={view === "compare" ? "on" : ""} onClick={() => onViewChange("compare")} aria-pressed={view === "compare"}>
              Compare
            </button>
            <button type="button" className={view === "list" ? "on" : ""} onClick={() => onViewChange("list")} aria-pressed={view === "list"}>
              Ranked list
            </button>
          </div>
        </div>
      </div>

      {source !== "all" && (
        <div className="info-banner">
          <span>
            Showing plans that draw on <strong>{TYPE_LABEL_PLURAL[source].toLowerCase()}</strong>. A plan can
            combine several source types, so it may also appear under another filter.
          </span>
          <button type="button" className="link-btn" onClick={() => setSource("all")}>
            Clear filter ×
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-block">
          <p>No safe plan uses {TYPE_LABEL_PLURAL[source].toLowerCase()} for this shortage.</p>
          <button type="button" className="btn-ghost" onClick={() => setSource("all")}>
            Show all {accepted.length} plans
          </button>
        </div>
      ) : view === "list" ? (
        <>
          <div className="list-count">
            <strong>{filtered.length}</strong> safe response {filtered.length === 1 ? "option" : "options"}, ranked by{" "}
            {SORTS[sort].label.toLowerCase().replace(" (default)", "")}
          </div>
          <PlanList
            plans={filtered}
            selectedId={selectedId}
            onDetails={(id) => {
              select(id);
              scrollTo.current = id;
              onViewChange("compare");
            }}
          />
        </>
      ) : (
        <div className="plan-grid">
          {filtered.map((p, i) => (
            <PlanCard key={p.id} plan={p} rank={i + 1} isSelected={selectedId === p.id} onSelect={select} />
          ))}
        </div>
      )}

      <details className="how-ranked">
        <summary>How are these options ranked?</summary>
        <p>
          Only plans that passed the simulation are shown — none of them creates a new shortage at a source.
          Ranking scores cost, network risk, lead time and expiry waste (lower is better), weighting lead time
          most when the deadline is close.
        </p>
      </details>

      {notSafe.length > 0 && (
        <details className="rejected-panel">
          <summary>
            Plans the simulation ruled out <span className="chip-n">{notSafe.length}</span>
          </summary>
          <p className="hint">Each of these looked cheaper or faster on paper but failed a safety check. These are simulation results, not clinical recommendations.</p>
          <ul>
            {notSafe.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{planTitle(p)}</strong>
                  <div className="dim small">
                    {p.reasons.length ? p.reasons.join("; ") : "Did not pass the simulation."}
                  </div>
                </div>
                <span className="mono dim">{fmtCurrency(p.cost)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {chosen && (
        <section className="impact" aria-label="Network impact of the selected option">
          <div className="impact-head">
            <h4>Network impact of the selected option</h4>
            <p className="hint">
              Moving stock through {rp?.via && rp.via !== "N/A" ? rp.via : "these sources"} can shift risk for
              other drugs made by the same manufacturer.
            </p>
          </div>
          <div className="impact-stats">
            <div className="stat">
              <div className="v">{rp?.affectedDrugs ?? 0}</div>
              <div className="k">Drugs affected</div>
            </div>
            <div className="stat">
              <div className="v">+{((rp?.riskDelta ?? 0) * 100).toFixed(2)}%</div>
              <div className="k">Average risk increase</div>
            </div>
            <div className="stat">
              <div className="v">{rp?.newlyAtRisk ?? 0}</div>
              <div className="k">Newly at-risk drugs</div>
            </div>
          </div>
          {rp && rp.details.length > 0 && (
            <details className="ripple-details">
              <summary>Show affected drugs</summary>
              <div className="ripple-list">
                {rp.details.map((r) => (
                  <div className="ripple-row" key={r.drug}>
                    <span>{r.drug}</span>
                    <span className="delta">
                      {(r.before * 100).toFixed(1)}% → {(r.after * 100).toFixed(1)}% (+{(r.delta * 100).toFixed(2)}%)
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
      {simulating && (
  <div className="info-banner">
    Running live simulation for the selected plan...
  </div>
)}

{simulationResult && !simulationResult.error && (
  <div className="info-banner">
    Simulation result: <strong>{simulationResult.verdict}</strong>
  </div>
)}

{simulationResult?.error && (
  <div className="info-banner">
    Simulation failed: {simulationResult.error}
  </div>
)}
      {chosen && (
        <div className={`confirm-bar ${confirmed ? "done" : ""}`}>
          {confirmed ? (
            <>
              <div className="cb-text">
                <strong>Plan confirmed: {planTitle(chosen)}</strong>
                <span>
                  Recorded for pharmacist sign-off. Nothing is ordered automatically — the procurement
                  decision stays with your team.
                </span>
              </div>
              <button type="button" className="btn-ghost" onClick={() => setConfirmed(false)}>
                Change selection
              </button>
            </>
          ) : (
            <>
              <div className="cb-text">
                <strong>Selected: {planTitle(chosen)}</strong>
                <span>
                  {planSources(chosen)} · {fmtCurrency(chosen.cost)} · {chosen.leadTime ?? "—"}d lead time
                </span>
                {chosenLate && (
                  <span className="warn-line">
                    Heads up: this plan arrives after the predicted stockout. Compare it with faster options first.
                  </span>
                )}
              </div>
              <button type="button" className="btn-primary" onClick={() => setConfirmed(true)}>
                Confirm selected plan →
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
