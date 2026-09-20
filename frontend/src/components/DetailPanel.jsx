import { useEffect, useState } from "react";

function fmtCurrency(n) {
  return "₹" + n.toLocaleString("en-IN");
}

function deadlineTone(status) {
  if (status === "ACT NOW") return "";
  if (status === "URGENT") return "calm";
  return "ok";
}

function nodeColor(type) {
  return type === "drug"
    ? "var(--red)"
    : type === "hospital"
    ? "var(--blue)"
    : type === "warehouse"
    ? "var(--amber)"
    : "var(--green)";
}

/* ---------------------------- Countdown ---------------------------- */
function Countdown({ days }) {
  const [seconds, setSeconds] = useState(Math.max(days, 0) * 86400);

  useEffect(() => {
    setSeconds(Math.max(days, 0) * 86400);
  }, [days]);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds((s) => Math.max(s - 1, 0)), 1000);
    return () => clearInterval(id);
  }, [seconds > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  return <div className="countdown">{`${h}:${m}:${s}`}</div>;
}

/* ---------------------------- Overview ---------------------------- */
function Overview({ d }) {
  return (
    <>
      <div className="stat-row">
        <div className="stat">
          <div className="v">{Math.round(d.risk * 100)}%</div>
          <div className="k">Risk score</div>
        </div>
        <div className="stat">
          <div className="v">{d.riskWindowDays}d</div>
          <div className="k">Warning window</div>
        </div>
        <div className="stat">
          <div className="v">{d.triageScore.toFixed(3)}</div>
          <div className="k">Triage score</div>
        </div>
        <div className="stat">
          <div className="v">{d.fdaStatus}</div>
          <div className="k">FDA status</div>
        </div>
      </div>
      <h3 className="section-title">Data provenance</h3>
      <p className="hint">What's measured, what's simulated, and what's synthetic for this build.</p>
      <div className="prov">
        <div className="prov-col real">
          <h4>Real / real-derived</h4>
          <ul>
            {d.provenance.real.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="prov-col sim">
          <h4>Simulated</h4>
          <ul>
            {d.provenance.simulated.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="prov-col synth">
          <h4>Synthetic</h4>
          <ul>
            {d.provenance.synthetic.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

/* ---------------------------- Network ---------------------------- */
function NetworkGraph({ d }) {
  const [selected, setSelected] = useState(null);
  const { nodes, edges } = d.network;

  return (
    <>
      <h3 className="section-title">Dependency graph</h3>
      <p className="hint">
        The drug node links to every hospital, warehouse and supplier it currently touches.
        Click a facility for its simulated stock.
      </p>
      <div className="graph-wrap">
        <svg viewBox="0 0 600 200" width="100%" height="220" xmlns="http://www.w3.org/2000/svg">
          {edges.map(([a, b], i) => {
            const na = nodes.find((n) => n.id === a);
            const nb = nodes.find((n) => n.id === b);
            return (
              <line
                key={i}
                x1={na.x}
                y1={na.y + 14}
                x2={nb.x}
                y2={nb.y - 14}
                stroke="var(--line)"
                strokeWidth="1.5"
              />
            );
          })}
          {nodes.map((n) => (
            <g
              key={n.id}
              style={{ cursor: n.type === "drug" ? "default" : "pointer" }}
              onClick={() => n.type !== "drug" && setSelected(n)}
            >
              <circle cx={n.x} cy={n.y} r="14" fill={nodeColor(n.type)} fillOpacity={n.type === "drug" ? 1 : 0.85} />
              <text
                x={n.x}
                y={n.y + 30}
                textAnchor="middle"
                fontFamily="IBM Plex Sans"
                fontSize="11"
                fill="var(--text-dim)"
              >
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {selected && (
        <div className="node-detail show">
          <div className="nd-name">{selected.label}</div>
          <div className="stat">
            <div className="v">{selected.stock}</div>
            <div className="k">Total stock (units)</div>
          </div>
          <div className="stat">
            <div className="v">{selected.safe}</div>
            <div className="k">Safely transferable</div>
          </div>
          <div className="stat">
            <div className="v">{selected.lead}d</div>
            <div className="k">Lead time</div>
          </div>
          <div className="stat">
            <div className="v">{selected.expiry}d</div>
            <div className="k">Days to expiry</div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------------------- Intervention ---------------------------- */
function Intervention({ d }) {
  const rejected = d.candidates.find((c) => c.verdict === "rejected");
  const accepted = d.candidates.find((c) => c.verdict === "accepted");
  const rp = d.ripple;

  return (
    <>
      <h3 className="section-title">Candidate transfer plans</h3>
      <p className="hint">
        Every rejected plan failed because it would create a new shortage elsewhere — not because it was expensive.
      </p>
      <div className="ledger">
        {rejected && (
          <div className="lcol rejected">
            <div className="verdict">✕ Rejected</div>
            <div className="strategy-name">{rejected.strategy}</div>
            <div className="allocation">
              {rejected.source} → <span className="units">{rejected.units} units</span>
            </div>
            <div className="metric-line">
              <span>Cost</span>
              <span>{fmtCurrency(rejected.cost)}</span>
            </div>
            <div className="metric-line">
              <span>Lead time</span>
              <span>{rejected.leadTime}d</span>
            </div>
            <div className="reason-box">{rejected.reason}</div>
            <div className="stock-shift">
              <div>Before: {rejected.before}</div>
              <div className="neg">After: {rejected.after}</div>
              <div>Safety stock: {rejected.safetyStock}</div>
            </div>
          </div>
        )}
        {accepted && (
          <div className="lcol accepted">
            <div className="verdict">✓ Accepted</div>
            <div className="strategy-name">{accepted.strategy}</div>
            <div className="allocation">
              {accepted.source} → <span className="units">{accepted.units} units</span>
            </div>
            <div className="metric-line">
              <span>Cost</span>
              <span>{fmtCurrency(accepted.cost)}</span>
            </div>
            <div className="metric-line">
              <span>Lead time</span>
              <span>{accepted.leadTime}d</span>
            </div>
            <div className="metric-line">
              <span>Network risk</span>
              <span>{accepted.networkRisk}</span>
            </div>
            <div className="metric-line">
              <span>Fill ratio</span>
              <span>{Math.round(accepted.fillRatio * 100)}%</span>
            </div>
            <div className="reason-box">
              Requester shortage resolved. Source stays above its safety stock threshold.
            </div>
          </div>
        )}
      </div>

      <h3 className="section-title">Ripple impact of the accepted plan</h3>
      <p className="hint">Transferring stock through {rp.via} shifts risk for every drug sharing that manufacturer.</p>
      <div className="ripple-summary">
        <div className="stat">
          <div className="v">{rp.affectedDrugs}</div>
          <div className="k">Drugs affected</div>
        </div>
        <div className="stat">
          <div className="v">+{(rp.riskDelta * 100).toFixed(2)}%</div>
          <div className="k">Avg. risk increase</div>
        </div>
        <div className="stat">
          <div className="v">{rp.newlyAtRisk}</div>
          <div className="k">Newly at-risk drugs</div>
        </div>
      </div>
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
    </>
  );
}

/* ---------------------------- Human review ---------------------------- */
function HumanReview({ d }) {
  const accepted = d.candidates.find((c) => c.verdict === "accepted");
  const [status, setStatus] = useState(null); // null | "accepted" | "rejected"

  if (!accepted) {
    return (
      <div className="review-box">
        <div className="rb-title">Human review required</div>
        <div className="rb-sub">No accepted transfer plan available for this scenario.</div>
      </div>
    );
  }

  return (
    <div className="review-box">
      <div className="rb-title">Human review required</div>
      <div className="rb-sub">
        The system proposes an intervention. It does not execute a clinical substitution on its own.
      </div>
      <div className="review-line">
        <span>Proposed transfer</span>
        <span>
          {accepted.source} → {accepted.units} units
        </span>
      </div>
      <div className="review-line">
        <span>Simulation result</span>
        <span style={{ color: "var(--green)" }}>Safe</span>
      </div>
      <div className="review-line">
        <span>Requester shortage</span>
        <span style={{ color: "var(--green)" }}>Resolved</span>
      </div>
      <div className="review-line">
        <span>Source shortage</span>
        <span style={{ color: "var(--green)" }}>Not created</span>
      </div>
      <div className="review-line">
        <span>Network risk</span>
        <span>{accepted.networkRisk}</span>
      </div>
      <div className="review-actions">
        <button className="btn reject" onClick={() => setStatus("rejected")}>
          Reject plan
        </button>
        <button className="btn primary" onClick={() => setStatus("accepted")}>
          Accept for pharmacist review
        </button>
      </div>
      {status && (
        <div className={`review-status ${status}`}>
          {status === "accepted"
            ? "Decision recorded — waiting for pharmacist confirmation."
            : "Plan rejected — returned to the candidate pool for re-evaluation."}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Main panel ---------------------------- */
export default function DetailPanel({ drug }) {
  const [section, setSection] = useState("overview");

  useEffect(() => {
    setSection("overview");
  }, [drug?.id]);

  if (!drug) {
    return <section className="detail"><div className="empty-state">Select a drug from the triage queue</div></section>;
  }

  const tone = deadlineTone(drug.deadline.status);

  return (
    <section className="detail">
      <div className="detail-head">
        <div className="drug-name">{drug.name}</div>
        <div className="drug-sub">{drug.className}</div>
        <div className="badge-row">
          <span className="badge shortage">
            <span className="dot" style={{ background: "var(--red)" }} />
            {drug.currentShortage ? "Current shortage" : "Projected shortage"}
          </span>
          <span className="badge">Priority: {drug.priority}</span>
          <span className="badge">FDA: {drug.fdaStatus}</span>
        </div>
      </div>

      <div className={`deadline ${tone}`}>
        <Countdown days={drug.deadline.latestActionInDays} />
        <div className="dl-info">
          <div className="dl-status">{drug.deadline.status}</div>
          <div className="dl-detail">
            Predicted stockout in {drug.deadline.predictedStockoutDays}d · required lead time{" "}
            {drug.deadline.requiredLeadDays}d
          </div>
        </div>
      </div>

      <div className="subnav">
        {[
          ["overview", "Overview"],
          ["network", "Network"],
          ["intervention", "Intervention"],
          ["review", "Human review"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={section === key ? "active" : ""}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "overview" && <Overview d={drug} />}
      {section === "network" && <NetworkGraph d={drug} />}
      {section === "intervention" && <Intervention d={drug} />}
      {section === "review" && <HumanReview d={drug} />}
    </section>
  );
}
