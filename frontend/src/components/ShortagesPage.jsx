import { useMemo, useState } from "react";
import {
  fmtDays1,
  splitName,
  titleCase,
  isActiveShortage,
  needsActionToday,
  isUnderWatch,
} from "../lib/format";
import StatusMark from "./StatusMark";

const FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "active", label: "Active shortages", test: isActiveShortage },
  { key: "action", label: "Need action today", test: needsActionToday },
  { key: "watch", label: "Under watch", test: isUnderWatch },
];

function visualRisk(risk) {
  if (risk >= 0.8) return { level: "critical", label: "Critical" };
  if (risk >= 0.6) return { level: "high", label: "High" };
  if (risk >= 0.4) return { level: "watch", label: "Watch" };
  if (risk >= 0.25) return { level: "monitor", label: "Monitor" };
  return { level: "low", label: "Low" };
}

function RiskBar({ risk }) {
  const band = visualRisk(risk);
  return (
    <div className={`risk-meter ${band.level}`} aria-label={`${(risk * 100).toFixed(2)} percent risk`}>
      <span style={{ width: `${Math.max(2, Math.min(100, risk * 100))}%` }} />
    </div>
  );
}

function TriageRow({ d, index, daysPending, selected, onOpen }) {
  const { main, rest } = splitName(d.name);
  const days = d.deadline?.predictedStockoutDays;
  const band = visualRisk(d.risk);
  const deadlineHot = d.deadline?.status === "ACT NOW" || d.deadline?.status === "OVERDUE";

  return (
    <button
      type="button"
      className={`triage-row ${selected ? "selected" : ""}`}
      style={{ "--i": Math.min(index, 30) }}
      onClick={() => onOpen(d.id)}
      title={`Open ${d.name}`}
    >
      <span className="row-index mono">{String(index + 1).padStart(2, "0")}</span>
      <span className="row-drug">
        <strong>{main}</strong>
        <small>{rest || "Medicine"}</small>
      </span>
      <span className="row-risk">
        <strong className="mono">{(d.risk * 100).toFixed(2)}%</strong>
        <RiskBar risk={d.risk} />
      </span>
      <span className="row-status">
        <StatusMark level={band.level}>{band.label}</StatusMark>
        <small className={deadlineHot ? "deadline-hot" : ""}>{titleCase(d.deadline?.status || "monitor")}</small>
      </span>
      <span className="row-days mono">
        {days == null ? (daysPending ? "…" : "—") : `${fmtDays1(days)}d`}
      </span>
    </button>
  );
}

export default function ShortagesPage({ drugs, daysPending, filter, onFilter, onOpen, selectedId }) {
  const [query, setQuery] = useState("");
  const sorted = useMemo(() => [...drugs].sort((a, b) => b.risk - a.risk), [drugs]);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, drugs.filter(f.test).length])),
    [drugs]
  );
  const active = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const q = query.trim().toLowerCase();
  const visible = sorted.filter((d) => active.test(d) && (!q || d.name.toLowerCase().includes(q)));

  return (
    <section className="triage-column" aria-label="Triage queue">
      <div className="triage-toolbar">
        <div>
          <div className="eyebrow">Live triage queue</div>
          <h2>Triage</h2>
        </div>
        <label className="search-box small">
          <span className="sr-only">Search medicines</span>
          <input
            type="search"
            placeholder="Search medicine…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <div className="triage-filters" role="group" aria-label="Filter medicines">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`chip ${filter === f.key ? "on" : ""}`}
            onClick={() => onFilter(f.key)}
            aria-pressed={filter === f.key}
          >
            {f.label} <span className="chip-n">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="queue-meta">
        <span>{visible.length} medicines</span>
        <span className="queue-legend">
          <StatusMark level="critical">≥80%</StatusMark>
          <StatusMark level="high">60–79%</StatusMark>
          <StatusMark level="watch">40–59%</StatusMark>
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="empty-block">
          <p>No medicines match{q ? ` “${query.trim()}”` : " this filter"}.</p>
          <button type="button" className="btn-ghost" onClick={() => { setQuery(""); onFilter("all"); }}>
            Show all medicines
          </button>
        </div>
      ) : (
        <div className="triage-list">
          {visible.map((d, i) => (
            <TriageRow
              key={d.id}
              d={d}
              index={i}
              daysPending={daysPending}
              selected={d.id === selectedId}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}
