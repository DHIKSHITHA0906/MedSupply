import { isActiveShortage, needsActionToday, isUnderWatch } from "../lib/format";

/**
 * The four numbers at the top of the Shortages page. Every number is
 * computed from the drug list, so the three shortage figures always add up:
 *   Active shortages = Need action today + Under watch
 *
 * The first three double as filters for the card grid below.
 */
export default function KPIBar({ drugs, filter, onFilter }) {
  const active = drugs.filter(isActiveShortage).length;
  const action = drugs.filter(needsActionToday).length;
  const watch = drugs.filter(isUnderWatch).length;
  const safePlans = drugs.reduce(
    (n, d) => n + d.candidates.filter((c) => c.verdict === "accepted").length,
    0
  );

  const items = [
    { key: "active", num: active, label: "Active shortages", cls: "" },
    { key: "action", num: action, label: "Need action today", cls: "crit" },
    { key: "watch", num: watch, label: "Under watch", cls: "warn" },
  ];

  return (
    <div className="kpi-strip">
      {items.map((k) => (
        <button
          key={k.key}
          type="button"
          className={`kpi ${k.cls} ${filter === k.key ? "on" : ""}`}
          onClick={() => onFilter(filter === k.key ? "all" : k.key)}
          aria-pressed={filter === k.key}
          title="Click to filter the list below"
        >
          <span className="num">{k.num}</span>
          <span className="lbl">{k.label}</span>
        </button>
      ))}
      <div className="kpi safe static">
        <span className="num">{safePlans}</span>
        <span className="lbl">Safe response plans</span>
      </div>
    </div>
  );
}
