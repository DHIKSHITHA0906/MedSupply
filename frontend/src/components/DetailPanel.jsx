import { useEffect, useRef, useState } from "react";
import NetworkGraph from "./NetworkGraph";
import Intervention from "./Intervention";
import { deadlineTone, respondWithin, titleCase } from "../lib/format";
import CountUp from "./CountUp";
import StatusMark from "./StatusMark";

const TABS = [
  ["overview", "Overview"],
  ["network", "Network"],
  ["intervention", "Intervention"],
];

/* ------------------------- Overview: action banner ------------------------- */
const BANNER_COPY = {
  critical: { eyebrow: "Action required", side: "Act now to avoid service disruption." },
  urgent: { eyebrow: "Act soon", side: "Order soon to stay ahead of the stockout." },
  ok: { eyebrow: "Time to plan", side: "There is time — compare your options before the window closes." },
};

function ActionBanner({ d, onViewOptions }) {
  const tone = deadlineTone(d.deadline.status);
  const copy = BANNER_COPY[tone];
  const stockout = d.deadline.predictedStockoutDays;
  const w = respondWithin(d.deadline.latestActionInDays);
  const safeCount = d.candidates.filter((c) => c.verdict === "accepted").length;

  return (
    <div className={`action-banner ${tone}`} role="region" aria-label="Deadline">
      <div className="ab-main">
        <div className="ab-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
            <path d="M12 3 L22 20 H2 Z" />
            <path d="M12 10 v5" />
            <path d="M12 17.5 v.01" />
          </svg>
        </div>
        <div>
          <div className="ab-eyebrow">{copy.eyebrow}</div>
          <div className="ab-line">Predicted to run out in</div>
          <div className="ab-days">
            {stockout == null ? "—" : stockout.toFixed(2)} <span>days</span>
          </div>
          {w && (
            <div className="ab-window">
              {w.late ? (
                <strong>{w.text}.</strong>
              ) : (
                <>
                  You need to respond within <strong>{w.text}</strong>.
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="ab-mid">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
          <path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" />
        </svg>
        <span>{copy.side}</span>
      </div>

      <div className="ab-cta">
        <button type="button" className="btn-cta" onClick={onViewOptions}>
          View response options →
        </button>
        <span className="ab-count">
          {safeCount === 0
            ? "No safe response options found yet"
            : `${safeCount} safe response ${safeCount === 1 ? "option" : "options"} available`}
        </span>
      </div>
    </div>
  );
}


function riskVisualLevel(risk) {
  const value = Number(risk ?? 0);
  if (value >= 0.8) return "critical";
  if (value >= 0.6) return "high";
  if (value >= 0.4) return "watch";
  if (value >= 0.25) return "monitor";
  return "low";
}

function InfoTip({ children, text }) {
  return (
    <span className="info-tip" tabIndex="0" aria-label={text}>
      {children}
      <span className="info-tip-bubble" role="tooltip">{text}</span>
    </span>
  );
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DecisionTimeline({ deadline }) {
  const [remaining, setRemaining] = useState(null);
  const targetRef = useRef(null);

  useEffect(() => {
    const days = Number(deadline?.latestActionInDays);
    if (deadline?.latestActionAt) {
      targetRef.current = new Date(deadline.latestActionAt).getTime();
    } else if (Number.isFinite(days)) {
      targetRef.current = Date.now() + days * 86400000;
    } else {
      targetRef.current = null;
    }

    const tick = () => {
      if (!targetRef.current) return setRemaining(null);
      setRemaining(Math.max(0, targetRef.current - Date.now()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline?.latestActionAt, deadline?.latestActionInDays]);

  const formatCountdown = (ms) => {
    if (ms == null) return "—";
    const total = Math.floor(ms / 1000);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m`;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <section className="decision-timeline" aria-label="Decision timeline">
      <div className="timeline-label">Decision timeline</div>
      <div className="timeline-track">
        <div className="timeline-point now"><span>NOW</span></div>
        <div className="timeline-line"><span className="timeline-fill" /></div>
        <div className="timeline-point deadline"><span>ACTION DEADLINE</span><strong className="mono">{formatCountdown(remaining)}</strong></div>
        <div className="timeline-line muted" />
        <div className="timeline-point stockout"><span>PREDICTED STOCKOUT</span><strong className="mono">{deadline?.predictedStockoutDays == null ? "—" : `${deadline.predictedStockoutDays.toFixed(2)}d`}</strong></div>
      </div>
      <div className="timeline-foot">
        <StatusMark level={deadlineTone(deadline?.status) === "critical" ? "critical" : deadlineTone(deadline?.status) === "urgent" ? "high" : "monitor"}>
          {deadline?.status || "OK"}
        </StatusMark>
        <span>{respondWithin(deadline?.latestActionInDays)?.text ? `Latest action: ${respondWithin(deadline.latestActionInDays).text}` : "Decision window not available"}{deadline?.latestActionAt ? ` · ${formatDateTime(deadline.latestActionAt)}` : ""}</span>
      </div>
    </section>
  );
}

/* ---------------------------------- Overview --------------------------------- */
function Overview({ d, onViewOptions }) {
  return (
    <>
      <ActionBanner d={d} onViewOptions={onViewOptions} />
      <div className={`risk-spotlight ${riskVisualLevel(d.risk)}`}>
        <div className="risk-spotlight-copy">
          <span className="eyebrow">Selected medicine risk</span>
          <div className="risk-hero"><CountUp value={d.risk * 100} /></div>
          <div className="risk-status-row">
            <StatusMark level={riskVisualLevel(d.risk)}>{titleCase(riskVisualLevel(d.risk))}</StatusMark>
            <span className="official-priority">Model / triage priority: <strong>{titleCase(d.priority)}</strong></span>
          </div>
        </div>
        <div className="risk-spotlight-side">
          <div><span>Warning window</span><strong>{d.riskWindowDays} days</strong></div>
          <div><span>FDA status</span><strong>{d.fdaStatus}</strong></div>
        </div>
      </div>
      <DecisionTimeline deadline={d.deadline} />

      <div className="overview-two-col">
        <section className="evidence-panel no-action-panel" aria-labelledby="no-action-title">
          <div className="panel-kicker">2 · What happens if no action?</div>
          <h3 id="no-action-title" className="section-title">If nothing changes</h3>
          <p className="hint">The scenario continues toward the projected stockout without an intervention.</p>
          <div className="evidence-grid">
            <div className="evidence-item">
              <span>Stockout</span>
              <strong>{d.noAction?.stockoutDays == null ? "—" : `${d.noAction.stockoutDays.toFixed(2)} days`}</strong>
              <small>{formatDateTime(d.noAction?.stockoutAt)}</small>
            </div>
            <div className="evidence-item">
              <span>Unmet units</span>
              <strong>{d.noAction?.unmetUnits == null ? "—" : d.noAction.unmetUnits.toLocaleString("en-IN")}</strong>
              <small>response requirement</small>
            </div>
            <div className="evidence-item">
              <span>Affected facility</span>
              <strong>{d.noAction?.affectedFacilities ?? "—"}</strong>
              <small>{d.requester?.name || "Requesting facility"}</small>
            </div>
          </div>
          <div className="consequence-line">
            <StatusMark level={riskVisualLevel(d.risk)}>{d.deadline?.status || "MONITOR"}</StatusMark>
            <span>{d.noAction?.consequence || "Supply continuity risk if no response is taken before stockout."}</span>
          </div>
        </section>

        <section className="evidence-panel flagged-panel" aria-labelledby="flagged-title">
          <div className="panel-kicker">3 · Why is this flagged?</div>
          <h3 id="flagged-title" className="section-title">Alert evidence</h3>
          <ul className="flag-list">
            {(d.flaggedReasons || []).map((reason) => (
              <li key={reason}><span className="flag-dot" />{reason}</li>
            ))}
          </ul>
          <div className="flag-meta">
            <span>
              <InfoTip text="FDA status comes from the shortage-status data used by Member A; risk and warning window come from the risk pipeline.">
                Provenance ⓘ
              </InfoTip>
            </span>
            <strong>{d.currentShortage ? "FDA CURRENT" : "MODEL / WATCH"}</strong>
          </div>
        </section>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="v">{(d.risk * 100).toFixed(2)}%</div>
          <div className="k"><InfoTip text="Member A model risk score; not the same as the official triage priority.">Risk score ⓘ</InfoTip></div>
        </div>
        <div className="stat">
          <div className="v">{d.riskWindowDays}d</div>
          <div className="k">Warning window</div>
        </div>
        <div className="stat">
          <div className="v">{d.triageScore.toFixed(3)}</div>
          <div className="k"><InfoTip text="Member B triage score used to prioritize the scenario.">Triage score ⓘ</InfoTip></div>
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

function SummaryOnly() {
  return (
    <div className="empty-block">
      <p>This tab needs the full detail, which isn't loaded.</p>
    </div>
  );
}


function SlidingTabs({ tab, onTab }) {
  const navRef = useRef(null);
  const refs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = refs.current[tab];
    const nav = navRef.current;
    if (!el || !nav) return;
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);

  return (
    <div className="subnav" role="tablist" ref={navRef}>
      <span className="tab-indicator" style={{ left: indicator.left, width: indicator.width }} aria-hidden="true" />
      {TABS.map(([key, label]) => (
        <button
          key={key}
          ref={(el) => { refs.current[key] = el; }}
          role="tab"
          aria-selected={tab === key}
          className={tab === key ? "active" : ""}
          onClick={() => onTab(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------- Main panel -------------------------------- */
export default function DetailPanel({ drug, tab, onTab, onBack, partial, embedded = false }) {
  // "list" when the user arrives via "View response options", otherwise cards
  const [ivView, setIvView] = useState("compare");

  const openOptions = () => {
    setIvView("list");
    onTab("intervention");
  };

  return (
    <section className={`detail ${embedded ? "detail-embedded" : ""}`}>
      {!embedded && <button type="button" className="back-link" onClick={onBack}>← Back to Shortages</button>}

      <div className="detail-head">
        <div className="drug-name">{drug.name}</div>
        {drug.className && <div className="drug-sub">{drug.className}</div>}
        <div className="badge-row">
          <span className={`badge ${drug.currentShortage ? "shortage" : ""}`}>
            <StatusMark level={drug.currentShortage ? "critical" : "monitor"}>
              {drug.currentShortage ? "FDA CURRENT" : "PROJECTED"}
            </StatusMark>
          </span>
          <span className="badge">Priority: {titleCase(drug.priority)}</span>
          <span className="badge">FDA: {drug.fdaStatus}</span>
        </div>
      </div>

      {partial && (
        <div className="info-banner warn">
          <span>
            The full detail for this medicine couldn't be loaded, so only the summary is shown. Go back and
            open it again to retry.
          </span>
        </div>
      )}

      <SlidingTabs tab={tab} onTab={onTab} />

      {/* All tabs stay mounted so a selection or filter survives switching tabs */}
      <div hidden={tab !== "overview"}>
        <Overview d={drug} onViewOptions={openOptions} />
      </div>
      <div hidden={tab !== "network"}>
        {partial ? <SummaryOnly /> : <NetworkGraph d={drug} />}
      </div>
      <div hidden={tab !== "intervention"}>
        {partial ? <SummaryOnly /> : <Intervention d={drug} view={ivView} onViewChange={setIvView} />}
      </div>
    </section>
  );
}
