# MedSupply — Member D frontend (React + Vite, plain CSS)

## Current UI architecture

The frontend is now a two-column decision console:

```text
MEDSUPPLY
  ↓
KPI STRIP
  ↓
┌─────────────────────────┬────────────────────────────────┐
│ TRIAGE QUEUE             │ SELECTED MEDICINE              │
│ scrolls naturally        │ sticky + internally scrollable │
│                          │                                │
│ Bupivacaine              │ risk spotlight + countdown     │
│ Cefepime                 │ provenance                     │
│ Carboplatin              │ network                        │
│ ...                      │ intervention                   │
└─────────────────────────┴────────────────────────────────┘
```

### Components

- `Dashboard.jsx` — split-screen composition and selected-drug state
- `ShortagesPage.jsx` — dense triage queue, filters, search and animated row entrance
- `DetailPanel.jsx` — selected drug, risk spotlight, decision timeline and sliding tabs
- `StatusMark.jsx` — consistent severity/status language
- `CountUp.jsx` — animated selected-drug risk score
- `NetworkGraph.jsx` — supply graph plus facility detail drawer
- `Intervention.jsx` — safe-plan comparison, rejected-vs-accepted comparison and network impact
- `KPIBar.jsx` — shortage and response KPIs
- `Header.jsx` — system status, horizon, clock and demo user
- `LoginPage.jsx` — demo/operator login

## UX changes implemented

1. Sticky selected-drug panel so the right side remains visible while the triage queue scrolls.
2. Visual risk hierarchy: ≥80% critical, 60–79% high, 40–59% watch, 25–39% monitor, <25% low. This is a frontend visual treatment only; Member B's official priority remains displayed separately.
3. Reusable StatusMark component with red reserved for genuinely high-risk information.
4. Dense interactive triage rows with hover state, selected state and subtle entrance animation.
5. Selected-drug risk score animates with CountUp; other KPIs remain static.
6. Data provenance remains intentionally static and transparent.
7. Overview tabs use a sliding active indicator.
8. Decision timeline shows NOW → ACTION DEADLINE → PREDICTED STOCKOUT and includes a live countdown.
9. Network facility details open as a side drawer over the graph on desktop.
10. Intervention includes an accepted-vs-rejected comparison to make the consequence of a sourcing decision visually obvious.
11. The separate Human Review tab is intentionally removed; the human decision boundary is part of Intervention.

## Data/API boundary

All components continue to read through `services/api.js`. The live API remains enabled by default.

- `GET /api/scenarios`
- `GET /api/scenarios/{drug}`
- `GET /api/predict`
- `POST /api/simulate`

The API transformer keeps backend-specific fields out of the UI. Deadline timestamps are passed through when available so the decision countdown can use the server-provided action deadline.

## Data provenance

The UI distinguishes real/real-derived, simulated and synthetic information. Candidate substitution relationships are presented as decision-support relationships, not clinical interchangeability.

## Demo login

Default demo credentials are defined in `services/auth.js`. This frontend login is a demo gate, not a production security boundary.

## Run locally

```bash
npm install
npm run dev
```

No additional UI library is required. The React Bits-style interactions used here are intentionally implemented as small copy-paste components so the product keeps a coherent visual language instead of looking like a component catalogue.
