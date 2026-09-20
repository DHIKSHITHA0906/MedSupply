export default function KPIBar({ drugs }) {
  const critical = drugs.filter((d) => d.priority === "CRITICAL").length;
  const shortages = drugs.filter((d) => d.currentShortage).length;
  const safePlans = drugs.reduce(
    (n, d) => n + d.candidates.filter((c) => c.verdict === "accepted").length,
    0
  );
  const overdue = drugs.filter((d) => d.deadline.latestActionInDays < 0).length;

  return (
    <div className="kpi-strip">
      <div className="kpi crit">
        <div className="num">{critical}</div>
        <div className="lbl">Critical priority</div>
      </div>
      <div className="kpi warn">
        <div className="num">{shortages}</div>
        <div className="lbl">Current shortages</div>
      </div>
      <div className="kpi safe">
        <div className="num">{safePlans}</div>
        <div className="lbl">Safe plans identified</div>
      </div>
      <div className="kpi">
        <div className="num">{overdue}</div>
        <div className="lbl">Overdue deadlines</div>
      </div>
    </div>
  );
}
