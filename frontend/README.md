# MedSupply — Member D frontend (React + Vite, plain CSS)

## How this maps to the shared architecture

```
src/
├── App.jsx                    -> wires everything together, holds selection state
├── main.jsx                   -> standard Vite entry point (skip if your repo already has one)
├── data/
│   └── demoData.js            -> stand-in for output.json / member_b_output.json / member_c_output.json
├── services/
│   └── api.js                 -> the ONLY file that knows whether data is demo or live.
│                                  flip USE_LIVE_API to true once C's Lambda Function URL exists.
├── components/
│   ├── Header.jsx              -> wordmark, pipeline status, live clock
│   ├── KPIBar.jsx               -> critical / shortages / safe plans / overdue — all computed live
│   ├── TriageQueue.jsx          -> left rail, sorted by risk, click to select
│   └── DetailPanel.jsx          -> everything on the right: Overview, Network, Intervention, Human review
│                                  (kept as one file with internal subcomponents — 14 tiny files for
│                                  what's really 4 screens was adding indirection without benefit;
│                                  split further if a teammate wants to own one screen independently)
└── styles/
    └── console.css             -> all design tokens + component styles, plain CSS as agreed
```

## To drop into your existing repo

1. Copy `src/data`, `src/services`, `src/components`, `src/styles` into your existing `src/`.
2. Copy the contents of `App.jsx` into your existing `App.jsx` (or replace it — it has no
   other dependencies besides the four imports at the top).
3. Skip `main.jsx` if you already have an entry point.
4. Install nothing extra — this uses only `react` and `react-dom`, which your Vite setup
   already has.

## Going from demo data to the live pipeline

Everything reads through `services/api.js`. When C's Lambda Function URL is deployed:

```js
// src/services/api.js
const USE_LIVE_API = true;
const API_BASE = "https://your-function-url.lambda-url.ap-south-1.on.aws";
```

Nothing in `App.jsx` or any component needs to change — they only ever call
`getScenarios()`, `getScenario(id)`, and `simulate(id, candidateId)`.

## Design system, unchanged from the approved direction

Charcoal-blue background, red/amber/green reserved strictly for risk severity, blue reserved
for the network graph, Barlow Condensed for headers, IBM Plex Sans for body copy, IBM Plex
Mono for anything numeric, no rounded-card kit, one real-time element (the deadline
countdown), everything else static until the user acts.

## What's real vs. placeholder right now

Bupivacaine's numbers in `demoData.js` are the actual worked example from the brief (88.76%
risk, the ₹45,922 accepted Cencora plan, the rejected Valley Children's transfer, the ripple
effects through Fresenius Kabi). Cefepime, Carboplatin, and Ketorolac are placeholders in the
same schema — replace them with real A/B/C output as it becomes available.
