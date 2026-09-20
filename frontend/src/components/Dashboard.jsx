import { useMemo } from "react";
import KPIBar from "./KPIBar";
import ShortagesPage from "./ShortagesPage";
import DetailPanel from "./DetailPanel";

export default function Dashboard({
  drugs,
  detail,
  selectedId,
  daysPending,
  filter,
  onFilter,
  onOpen,
  onTab,
  tab,
}) {
  const selectedThin = useMemo(() => drugs.find((d) => d.id === selectedId) || null, [drugs, selectedId]);
  const selectedDrug = detail || selectedThin;

  return (
    <div className="page dashboard-page">
      <div className="page-head dashboard-head">
        <div>
          <h1 className="page-title">Shortages</h1>
          <p className="page-sub">
            Triage the medicines at risk, then inspect the selected medicine's network and response options.
          </p>
        </div>
        <div className="console-note">Decision-support console · 14-day horizon</div>
      </div>

      <KPIBar drugs={drugs} filter={filter} onFilter={onFilter} />

      <div className="dashboard-grid">
        <ShortagesPage
          drugs={drugs}
          daysPending={daysPending}
          filter={filter}
          onFilter={onFilter}
          onOpen={onOpen}
          selectedId={selectedId}
        />

        <aside className="detail-panel" aria-label="Selected medicine details">
          {selectedDrug ? (
            <DetailPanel
              key={selectedDrug.id}
              drug={selectedDrug}
              tab={tab}
              onTab={onTab}
              onBack={() => onOpen(selectedDrug.id)}
              partial={!detail}
              embedded
            />
          ) : (
            <div className="empty-block">
              <p>Select a medicine from the triage queue.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
