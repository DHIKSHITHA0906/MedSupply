function priorityDotColor(p) {
  return p === "CRITICAL" ? "var(--red)" : p === "HIGH" ? "var(--amber)" : "var(--green)";
}

export default function TriageQueue({ drugs, activeId, onSelect }) {
  const sorted = [...drugs].sort((a, b) => b.risk - a.risk);

  return (
    <nav className="queue-rail">
      <div className="rail-head">Triage queue</div>
      {sorted.map((d) => (
        <button
          key={d.id}
          className={
            "queue-item" + (d.id === activeId ? ` active priority-${d.priority}` : "")
          }
          onClick={() => onSelect(d.id)}
        >
          <div className="qi-top">
            <span className="qi-name">{d.name.split(" ")[0]}</span>
            <span className={`qi-risk ${d.priority}`}>{Math.round(d.risk * 100)}%</span>
          </div>
          <div className="qi-meta">
            <span className="tag">
              <span className="dot" style={{ background: priorityDotColor(d.priority) }} />
              {d.priority}
            </span>
            <span className="tag">{d.deadline.status}</span>
          </div>
        </button>
      ))}
    </nav>
  );
}
