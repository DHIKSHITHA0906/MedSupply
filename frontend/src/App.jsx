import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getScenarios, getScenario } from "./services/api";
import { getSession, logout } from "./services/auth";
import Header from "./components/Header";
import LoginPage from "./components/LoginPage";
import Dashboard from "./components/Dashboard";
import "./styles/console.css";

const TABS = ["overview", "network", "intervention"];
const PREFETCH_CONCURRENCY = 4;

function parseHash() {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "drug" && parts[1]) {
    let id = parts[1];
    try { id = decodeURIComponent(parts[1]); } catch { /* keep raw */ }
    return { view: "drug", id, tab: TABS.includes(parts[2]) ? parts[2] : "overview" };
  }
  return { view: "shortages" };
}

function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = useCallback((hash) => { window.location.hash = hash; }, []);
  return [route, go];
}

export default function App() {
  const [user, setUser] = useState(getSession);
  const [route, go] = useRoute();
  const [drugs, setDrugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("all");
  const [details, setDetails] = useState({});
  const [failed, setFailed] = useState({});
  const [prefetching, setPrefetching] = useState(true);
  const detailsRef = useRef(details);
  detailsRef.current = details;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    getScenarios()
      .then((data) => { if (!cancelled) { setDrugs(data); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setLoadError(err.message || "Couldn't reach the API."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!drugs.length) return;
    let cancelled = false;
    setPrefetching(true);
    const queue = [...drugs].sort((a, b) => b.risk - a.risk).map((d) => d.id);
    async function worker() {
      while (!cancelled && queue.length) {
        const id = queue.shift();
        if (detailsRef.current[id]) continue;
        try {
          const det = await getScenario(id);
          if (cancelled) return;
          if (det) setDetails((prev) => (prev[id] ? prev : { ...prev, [id]: det }));
        } catch {
          if (!cancelled) setFailed((prev) => ({ ...prev, [id]: true }));
        }
      }
    }
    Promise.all(Array.from({ length: PREFETCH_CONCURRENCY }, worker)).then(() => {
      if (!cancelled) setPrefetching(false);
    });
    return () => { cancelled = true; };
  }, [drugs]);

  const selectedId = route.view === "drug" ? route.id : drugs[0]?.id;

  useEffect(() => {
    if (!user || !selectedId || detailsRef.current[selectedId]) return;
    let cancelled = false;
    setFailed((prev) => (prev[selectedId] ? { ...prev, [selectedId]: false } : prev));
    getScenario(selectedId)
      .then((det) => {
        if (cancelled) return;
        if (!det) { setFailed((prev) => ({ ...prev, [selectedId]: true })); return; }
        setDetails((prev) => ({ ...prev, [selectedId]: det }));
      })
      .catch(() => { if (!cancelled) setFailed((prev) => ({ ...prev, [selectedId]: true })); });
    return () => { cancelled = true; };
  }, [user, selectedId]);

  const merged = useMemo(() => drugs.map((d) => {
    const det = details[d.id];
    if (!det) return d;
    return {
      ...d,
      deadline: {
        ...d.deadline,
        predictedStockoutDays: det.deadline?.predictedStockoutDays,
      },
    };
  }), [drugs, details]);

  const signOut = () => {
    logout(); setUser(null); setDrugs([]); setDetails({}); setFailed({}); setFilter("all"); go("#/");
  };

  if (!user) return <LoginPage onLogin={setUser} />;

  let body;
  if (loading) {
    body = <div className="empty-state">Loading scenarios…</div>;
  } else if (loadError) {
    body = (
      <div className="empty-block">
        <p>Couldn't load the shortage list. {loadError}</p>
        <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  } else if (!drugs.length) {
    body = <div className="empty-state">No shortage scenarios are available.</div>;
  } else {
    const detail = details[selectedId];
    body = (
      <Dashboard
        drugs={merged}
        detail={detail}
        selectedId={selectedId}
        daysPending={prefetching}
        filter={filter}
        onFilter={setFilter}
        onOpen={(id) => go(`#/drug/${encodeURIComponent(id)}/${route.view === "drug" ? route.tab : "overview"}`)}
        onTab={(tab) => go(`#/drug/${encodeURIComponent(selectedId)}/${tab}`)}
        tab={route.view === "drug" ? route.tab : "overview"}
      />
    );
  }

  return (
    <div className="app">
      <Header user={user} onSignOut={signOut} onHome={() => go("#/")} />
      <main className="main">{body}</main>
      <footer className="foot">
        <span>
          Data provenance: FDA status &amp; risk model are real-derived (Member A). Inventory and pricing are simulated (Member C). Network topology is synthetic. Decision support only — a pharmacist confirms every plan.
        </span>
      </footer>
    </div>
  );
}
