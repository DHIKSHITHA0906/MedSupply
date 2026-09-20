# MedSupply Frontend

React + Vite decision console for MedSupply. It reads shortage scenarios from the live backend API and lets a pharmacist triage at-risk medicines, inspect the affected supply network, compare accepted and rejected response plans, and confirm a plan for review.

- **Live app:** <https://main.d31fsbjqraajjf.amplifyapp.com> (AWS Amplify)
- **API it talks to:** <https://ir06s4arb0.execute-api.ap-southeast-2.amazonaws.com>
- Backend details: [backend/README.md](../backend/README.md) · Endpoints: [docs/API.md](../docs/API.md) · Demo script: [docs/DEMO.md](../docs/DEMO.md)

> **Decision support only.** The console never orders anything and gives no clinical advice. A pharmacist makes the final procurement decision.

---

## Stack

| | |
|---|---|
| Framework | React 18 (`react`, `react-dom`) |
| Build tool | Vite 5 with `@vitejs/plugin-react` |
| Styling | One plain stylesheet, `src/styles/console.css` |
| Routing | Hash-based (`window.location.hash`), no router library |
| State | React hooks only (no state library) |
| Dependencies | `react`, `react-dom`; dev: `vite`, `@vitejs/plugin-react` |

There is no test runner, linter or UI component library configured.

## Structure

```text
frontend/
├── index.html
├── package.json               # scripts: dev, build, preview
├── vite.config.js
├── .env.example
└── src/
    ├── main.jsx
    ├── App.jsx                # session, routing, data loading, prefetch
    ├── components/
    │   ├── LoginPage.jsx      # demo sign-in
    │   ├── Header.jsx         # brand, status, clock, user, sign out
    │   ├── Dashboard.jsx      # KPI strip + triage queue + detail panel
    │   ├── KPIBar.jsx         # four summary numbers (three double as filters)
    │   ├── ShortagesPage.jsx  # triage queue: search, filter chips, rows
    │   ├── DetailPanel.jsx    # selected medicine + Overview/Network/Intervention tabs
    │   ├── NetworkGraph.jsx   # SVG supply network + facility drawer
    │   ├── Intervention.jsx   # plan comparison, rejected list, network impact, confirm
    │   ├── StatusMark.jsx     # severity dot + label
    │   └── CountUp.jsx        # animated risk number
    ├── services/
    │   ├── api.js             # all API calls and backend → UI transformers
    │   └── auth.js            # front-end-only demo sign-in
    ├── lib/format.js          # display helpers, deadline tones, plan titles
    ├── data/demoData.js       # offline fixtures (used only if live API is switched off)
    └── styles/console.css
```

## Pages and navigation

After sign-in there is **one dashboard page ("Shortages")**. The selected medicine's detail panel has three tabs.

| Route (hash) | View |
|---|---|
| `#/` | Shortages dashboard; the first medicine in the list is selected |
| `#/drug/<encoded drug name>/overview` | Same dashboard, medicine selected, **Overview** tab (default) |
| `#/drug/<encoded drug name>/network` | **Network** tab |
| `#/drug/<encoded drug name>/intervention` | **Intervention** tab |

Because routing is hash-based, deep links work on static hosting without rewrite rules. Clicking the MEDSUPPLY wordmark returns to `#/`.

How the demo story maps onto the UI:

| Story step | Where it lives |
|---|---|
| Login | `LoginPage` |
| Overview | KPI strip (top of dashboard) and the **Overview** tab of the selected medicine |
| Shortages | Triage queue (left column) with search and filters |
| Medicine details | Detail header, action banner, risk spotlight, decision timeline, "If nothing changes", alert evidence, data provenance |
| Network | **Network** tab |
| Intervention / Decision | **Intervention** tab, including the confirm bar |

There is no separate "Overview" page and no separate "Human Review" tab; the human decision boundary is the confirm bar inside Intervention.

### Login (demo gate)

`services/auth.js` implements a **front-end-only** sign-in. There is no auth endpoint on the backend, so it only decides whether the console UI is shown; the API stays open. The session is stored in `localStorage` under `medsupply.session`, and *Sign out* clears it.

The default demo account is defined in `services/auth.js` and is displayed on the login page with a **"Fill in for me"** button. It can be overridden at build time with `VITE_DEMO_USER` and `VITE_DEMO_PASS`. Because Vite inlines `VITE_*` variables into the browser bundle, these values are **not secret**. Replace `login()` with a real identity provider before any real use.

### Overview tab

- **Action banner:** predicted days to stockout, "respond within N hours", tone (`Action required` / `Act soon` / `Time to plan`) from the backend deadline status, and the count of safe options.
- **Risk spotlight:** risk score (animated), warning window, "FDA status" (from Member A's `current_shortage` flag), triage priority.
- **Decision timeline:** NOW → ACTION DEADLINE (live countdown to `latest_action_at`) → PREDICTED STOCKOUT.
- **If nothing changes:** stockout time, unmet units, affected facility.
- **Alert evidence:** risk, shortage flag, warning window, demand/stock evidence for the requesting hospital.
- **Data provenance:** three columns (Real / real-derived, Simulated, Synthetic) built from the scenario's `provenance` block.

### Network tab

An SVG view with the medicine at the top and its **suppliers, warehouses and hospitals** grouped below. Filter by type, search by name, zoom, and click a facility for a drawer with current stock, safety stock, safely transferable units, lead time, days to expiry, supply status and, for excluded sources, the reason.

This is a **star layout of the scenario's sources** (requesting hospital plus every source the backend considered), built in `api.js`. It is not a rendering of Member B's full graph edges.

### Intervention tab

- **Rejected vs safe comparison:** the first non-accepted plan side by side with the chosen safe plan.
- **Safe plans:** only `ACCEPTED` plans are offered, as cards (**Compare** view) or a table (**Ranked list** view), with filters by source type and sorting by recommended / lowest cost / fastest / lowest network risk. Each shows quantity, estimated cost (₹), lead time, future network risk, fill ratio, expiry waste and its own deadline.
- **Plans the simulation ruled out:** collapsible list with the backend's rejection reasons.
- **Network impact of the selected option:** sibling medicines affected, average risk increase, newly at-risk medicines.
- **Live intervention simulation:** selecting a plan calls `POST /api/simulate` with that plan's allocations and displays the returned `ACCEPTED`, `REJECTED`, or `PARTIAL_SAFE` verdict.
- **Confirm bar:** *Confirm selected plan* switches to a confirmed state. **This is local screen state only.** Nothing is sent to the backend, saved, or ordered, even though the on-screen text says the plan is "recorded for pharmacist sign-off".

### Frontend-only presentation choices

- Risk bands in the queue (`≥80%` Critical, `60–79%` High, `40–59%` Watch, `25–39%` Monitor, `<25%` Low) are a visual treatment only. Member B's triage priority is shown separately.
- KPI strip: *Active shortages* = medicines whose `current_shortage` is true; *Need action today* = active shortages with deadline status `ACT NOW`, `URGENT` or `OVERDUE`; *Under watch* = the remaining active shortages; *Safe response plans* = total accepted plans. The first three are also filters.
- "Pipeline online" and "Decision horizon: 14 days" in the header are static text, not a live health check.

## API integration

All components read data through `src/services/api.js`, which owns every request and converts backend JSON into the UI's data model.

| Call | When | Used for |
|---|---|---|
| `GET /api/scenarios` | After sign-in | Triage queue and KPIs |
| `GET /api/predict` | After sign-in, in parallel | `current_shortage` and `risk_window_days` per medicine |
| `GET /api/scenarios/{drug}` | On selection, plus background prefetch of all medicines (4 at a time, highest risk first) | Detail panel, network, intervention, and the "days to stockout" column |
| `POST /api/simulate` | When a user selects an intervention plan | Re-simulates the selected allocation and returns the simulation verdict |

Behavior worth knowing:

- If `GET /api/scenarios` fails, the page shows an error with a retry button.
- If `GET /api/predict` fails, the console still loads but treats every medicine as **not** a current shortage with a 0-day window (the call is deliberately allowed to fail soft).
- If a detail request fails, the selected medicine shows a summary-only banner.

### API base configuration

```text
src/services/api.js:  const API_BASE = import.meta.env.VITE_API_BASE_URL || "<live API URL>"
```

Set `VITE_API_BASE_URL` to the API root **without** a trailing slash and **without** `/api` (request paths already start with `/api`). If unset, the code falls back to the live API URL, so the app works out of the box. Vite reads it at build time.

`.env.example`:

```dotenv
VITE_API_BASE_URL=https://ir06s4arb0.execute-api.ap-southeast-2.amazonaws.com

# Optional: override the demo sign-in
# VITE_DEMO_USER=...
# VITE_DEMO_PASS=...
```

Copy it to `.env` (git-ignored) to change values. To use a local backend: `VITE_API_BASE_URL=http://localhost:5000`.

### Demo data (offline mode)

`src/data/demoData.js` holds four fixture medicines (Bupivacaine, Cefepime, Carboplatin, Ketorolac). It is used **only** if a developer changes `const USE_LIVE_API = true` to `false` in `api.js`. It is **not** an automatic fallback: when the API is down with the default setting, the console shows an error instead. Only the Bupivacaine fixture is modelled on the worked example, and its figures differ slightly from live backend values, so do not quote numbers from it.

## Local development

Requires Node.js 18 or newer (the production build was verified for this documentation on Node 22).

```bash
cd frontend
npm install          # or: npm ci (uses package-lock.json)
cp .env.example .env # optional; defaults already point at the live API
npm run dev          # Vite dev server (default http://localhost:5173)
```

```bash
npm run build        # production build to dist/ (git-ignored)
npm run preview      # serve the built dist/ locally
```

## Deployment (AWS Amplify)

The frontend is deployed on **AWS Amplify** at <https://main.d31fsbjqraajjf.amplifyapp.com> and talks to the API over HTTPS.

- The repository contains **no `amplify.yml`**; build settings are configured in the Amplify console.
- Consistent with the repository layout: the app lives in `frontend/`, builds with `npm run build`, and publishes the `dist/` directory. Set `VITE_API_BASE_URL` in Amplify's environment variables if you want to point at a different API. Confirm the exact settings in the Amplify console.
- The API allows any origin (`*`), so no CORS configuration is needed on the frontend side.

See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for the full deployment picture.

## Limitations

- The login is a demo gate with client-side credentials, not security.
- The confirm step is not persisted; it only records the selected plan in the current UI session.
- Inventory, lead times, prices, expiry and topology shown are simulated or synthetic (labelled in the Data provenance panel and in the page footer).
- The list view triggers one `GET /api/scenarios/{drug}` per medicine in the background (33 requests at 4 concurrent), each computed on demand by the backend.
- With a live-model backend, `/api/predict` returns a different `current_shortage` (`risk ≥ 0.37`), which would make the KPI strip and "FDA status" labels count far more shortages than with the precomputed fallback. See [docs/API.md](../docs/API.md#note-on-current_shortage).
