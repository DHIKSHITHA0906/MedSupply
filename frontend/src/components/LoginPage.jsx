import { useState } from "react";
import { DEMO_ACCOUNT, login } from "../services/auth";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const res = login(username, password);
    if (res.ok) {
      setError("");
      onLogin(res.user);
    } else {
      setError(res.error);
    }
  };

  const fillDemo = () => {
    setUsername(DEMO_ACCOUNT.username);
    setPassword(DEMO_ACCOUNT.password);
    setError("");
  };

  return (
    <div className="login">
      <section className="login-brand">
        <div className="login-mark">
          MED<span>SUPPLY</span>
        </div>
        <p className="login-tagline">Shortage early-warning &amp; response console</p>
        <p className="login-note">
          The system finds which medicines are heading for a stockout and which response plans are
          safe. A pharmacist makes the final procurement decision.
        </p>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={submit} noValidate>
          <h1>Sign in</h1>
          <p className="login-sub">Use the credentials issued to your pharmacy team.</p>

          <label className="field">
            <span>Username</span>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={!!error}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <div className="pw-wrap">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!error}
              />
              <button
                type="button"
                className="link-btn"
                onClick={() => setShowPw((v) => !v)}
                aria-pressed={showPw}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary">
            Sign in
          </button>

          <div className="demo-hint">
            <span>
              Demo build — username <code>{DEMO_ACCOUNT.username}</code>, password{" "}
              <code>{DEMO_ACCOUNT.password}</code>
            </span>
            <button type="button" className="link-btn" onClick={fillDemo}>
              Fill in for me
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
