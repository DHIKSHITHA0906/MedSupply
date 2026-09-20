import { useEffect, useState } from "react";

export default function Header() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="topbar">
      <div className="wordmark">
        <div className="mark">
          MED<span>SUPPLY</span>
        </div>
        <div className="tagline">Shortage early-warning &amp; response console</div>
      </div>
      <div className="status-cluster">
        <div className="status-item">
          <span className="pulse-dot" /> Pipeline online
        </div>
        <div className="status-item">
          Decision horizon: <strong style={{ color: "var(--text)" }}>14 days</strong>
        </div>
        <div className="status-item clock">
          {time.toLocaleTimeString("en-IN", { hour12: false })}
        </div>
      </div>
    </header>
  );
}
