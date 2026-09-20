/**
 * auth.js
 * ---------------------------------------------------------------------
 * Front-end-only sign-in for the demo console.
 *
 * There is no auth endpoint on the backend, so this gate only decides
 * whether the console UI is shown. It is NOT a security boundary — the
 * API itself is unchanged and stays as open as it was. Replace `login()`
 * with a real call (e.g. Cognito) when the backend gets one; nothing
 * else in the app needs to change.
 *
 * Demo credentials can be overridden at build time:
 *   VITE_DEMO_USER=...  VITE_DEMO_PASS=...
 * ---------------------------------------------------------------------
 */

const SESSION_KEY = "medsupply.session";

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const DEMO_ACCOUNT = {
  username: env.VITE_DEMO_USER || "pharmacist@medsupply.in",
  password: env.VITE_DEMO_PASS || "medsupply123",
  displayName: "Pharmacist on duty",
};

export function getSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function login(username, password) {
  const u = (username || "").trim().toLowerCase();
  if (!u || !password) {
    return { ok: false, error: "Enter your username and password." };
  }
  if (u !== DEMO_ACCOUNT.username.toLowerCase() || password !== DEMO_ACCOUNT.password) {
    return { ok: false, error: "That username and password don't match. Check them and try again." };
  }
  const user = { username: DEMO_ACCOUNT.username, displayName: DEMO_ACCOUNT.displayName };
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable — the session just won't survive a refresh */
  }
  return { ok: true, user };
}

export function logout() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
