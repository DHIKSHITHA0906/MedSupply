import { useEffect, useState } from "react";
import { getScenarios, getScenario } from "./services/api";
import Header from "./components/Header";
import KPIBar from "./components/KPIBar";
import TriageQueue from "./components/TriageQueue";
import DetailPanel from "./components/DetailPanel";
import "./styles/console.css";

export default function App() {
  const [drugs, setDrugs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeDrug, setActiveDrug] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getScenarios().then((data) => {
      if (cancelled) return;
      setDrugs(data);
      setActiveId(data[0]?.id ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch full detail whenever the selected drug changes
  useEffect(() => {
    if (!activeId) {
      setActiveDrug(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    getScenario(activeId)
      .then((detail) => {
        if (cancelled) return;
        setActiveDrug(detail);
        setDetailLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Fall back to the thin list object if the detail fetch fails
        setActiveDrug(drugs.find((d) => d.id === activeId) ?? null);
        setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      <Header />
      {!loading && <KPIBar drugs={drugs} />}
      <main className="grid">
        {loading ? (
          <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
            Loading scenarios…
          </div>
        ) : (
          <>
            <TriageQueue drugs={drugs} activeId={activeId} onSelect={setActiveId} />
            {detailLoading ? (
              <section className="detail">
                <div className="empty-state">Loading detail…</div>
              </section>
            ) : (
              <DetailPanel drug={activeDrug} />
            )}
          </>
        )}
      </main>
      <footer className="foot">
        <span>
          Data provenance: FDA status &amp; risk model are real-derived (Member A). Inventory and
          pricing are simulated (Member C). Network topology is synthetic.
        </span>
      </footer>
    </div>
  );
}
