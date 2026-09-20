import { useEffect, useState } from "react";

export default function Header({ user, onSignOut, onHome }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="topbar">
      <button className="wordmark wordmark-btn" onClick={onHome} aria-label="MedSupply — back to Shortages">
        <span className="mark">
          MED<span>SUPPLY</span>
        </span>
        <span className="tagline">Shortage early-warning &amp; response console</span>
      </button>
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
        {user && (
          <div className="status-item user-chip">
            <span className="user-avatar" aria-hidden="true">
              {user.displayName.charAt(0)}
            </span>
            <span className="user-name">{user.displayName}</span>
            <button className="link-btn" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
