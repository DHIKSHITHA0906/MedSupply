import { useMemo, useState } from "react";
import { TYPE_LABEL, TYPE_LABEL_PLURAL, fmtUnits } from "../lib/format";

/* Layout constants (SVG user units) */
const GROUPS = ["supplier", "warehouse", "hospital"];
const LEAF_GAP = 112; // horizontal room per facility
const SLOT_PAD = 24;
const MIN_W = 860;
const ROOT = { y: 78, r: 20 };
const HEAD = { y: 150, h: 26, w: 136 };
const LEAF = { y: 262, r: 17 };
const H = 348;
const CAP = 5; // more than this per group -> "+N more"

const COLOR = {
  drug: "var(--red)",
  supplier: "var(--orange)",
  warehouse: "var(--violet)",
  hospital: "var(--blue)",
};
const COLOR_DIM = {
  supplier: "var(--orange-dim)",
  warehouse: "var(--violet-dim)",
  hospital: "var(--blue-dim)",
};

/** Up to three short lines that fit under a node (full name is in the tooltip). */
function wrapLabel(name = "", max = 17) {
  const words = name.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= max) cur = (cur + " " + w).trim();
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) {
    const last = lines.slice(2).join(" ");
    return [lines[0], lines[1], last.length > max ? last.slice(0, max - 1) + "…" : last];
  }
  return lines.map((l) => (l.length > max + 2 ? l.slice(0, max) + "…" : l));
}

/** Small glyph centred on (0,0), about 14 units wide. */
function Glyph({ type, color }) {
  if (type === "hospital")
    return <path d="M-2.2,-7 h4.4 v4.8 h4.8 v4.4 h-4.8 v4.8 h-4.4 v-4.8 h-4.8 v-4.4 h4.8z" fill={color} />;
  if (type === "warehouse")
    return <path d="M-7.5,-1 L0,-7.5 L7.5,-1 V7 H-7.5 Z M-2.5,7 V2 H2.5 V7" fill={color} fillRule="evenodd" />;
  return <path d="M-7,7 V-2 L-2.5,-5.5 V-2 L2,-5.5 V-2 L7,-6 V7 Z" fill={color} />;
}

function curve(x1, y1, x2, y2) {
  const my = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
}

function supplyStatus(n) {
  if (n.isRequester) {
    return {
      tone: "risk",
      label: "At risk",
      note:
        n.coverDays != null
          ? `Only ${n.coverDays} days of cover left at current demand — this hospital is the one asking for stock.`
          : "This hospital is the one asking for stock.",
    };
  }
  if ((n.safe ?? 0) > 0) {
    return { tone: "ok", label: "Can supply", note: `${fmtUnits(n.safe)} units are safely transferable.` };
  }
  return {
    tone: "risk",
    label: "At risk",
    note: "Low transferable stock at this facility.",
    reason: n.excludedReason,
  };
}

function NodeDetail({ node, drugLabel, onClose }) {
  const st = supplyStatus(node);
  const na = (v, unit) => (v == null ? <span className="na">—</span> : `${fmtUnits(v)}${unit}`);
  const connectedMedicines = Array.from(new Set(node.connectedMedicines || [drugLabel]));
  return (
    <div className="node-detail show" role="region" aria-label={`${node.label} details`}>
      <button type="button" className="nd-close" onClick={onClose} aria-label="Close facility details">
        ×
      </button>
      <div className="nd-head">
        <svg className={`nd-icon ${node.type}`} viewBox="-14 -14 28 28" width="34" height="34" aria-hidden="true">
          <circle r="13" fill={COLOR_DIM[node.type]} stroke={COLOR[node.type]} strokeWidth="1.5" />
          <Glyph type={node.type} color={COLOR[node.type]} />
        </svg>
        <div>
          <div className="nd-name">{node.label}</div>
          <div className="nd-tags">
            <span className={`type-tag ${node.type}`}>{TYPE_LABEL[node.type]}</span>
            {node.isRequester && <span className="type-tag req">Requesting hospital</span>}
            <span className="nd-conn">Connected to {drugLabel}</span>
          </div>
        </div>
      </div>

      <div className="nd-stats">
        <div className="stat">
          <div className="k">Current stock</div>
          <div className="v">{na(node.stock, " units")}</div>
        </div>
        <div className="stat">
          <div className="k">Safety stock</div>
          <div className="v">{na(node.safetyStock, " units")}</div>
        </div>
        <div className="stat">
          <div className="k">Safely transferable</div>
          <div className="v">{na(node.safe, " units")}</div>
        </div>
        <div className="stat">
          <div className="k">Lead time</div>
          <div className="v">{na(node.lead, node.lead === 1 ? " day" : " days")}</div>
          {node.lead == null && <div className="sub">Not available</div>}
        </div>
        <div className="stat">
          <div className="k">Days to expiry</div>
          <div className="v">{na(node.expiry, " days")}</div>
          {node.expiry == null && <div className="sub">Not available</div>}
        </div>
      </div>

      <div className="nd-foot">
        <div>
          <div className="k">Supply status</div>
          <div className={`nd-status ${st.tone}`}>
            <span className="dot" /> {st.label}
          </div>
          <div className="nd-note">{st.note}</div>
          {st.reason && <div className="nd-reason">{st.reason}</div>}
        </div>
        <div>
          <div className="k">Connected medicines</div>
          <div className="nd-chips">
            {connectedMedicines.map((medicine) => (
              <span className="chip-tag drug" key={medicine}>{medicine}</span>
            ))}
            {node.inSelectedPlan && <span className="chip-tag good">In the recommended plan</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NetworkGraph({ d }) {
  const { nodes } = d.network;
  const drugNode = nodes.find((n) => n.type === "drug");
  const facilities = useMemo(() => nodes.filter((n) => n.type !== "drug"), [nodes]);

  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState({});

  if (!drugNode || facilities.length === 0) {
    return (
      <div className="empty-block">
        <p>The supply network for this medicine isn't available right now.</p>
      </div>
    );
  }

  const counts = {
    all: facilities.length,
    ...Object.fromEntries(GROUPS.map((t) => [t, facilities.filter((n) => n.type === t).length])),
  };
  const q = query.trim().toLowerCase();

  /* ---- build the visible groups ---- */
  const groups = GROUPS.filter((t) => typeFilter === "all" || typeFilter === t)
    .map((t) => {
      const all = facilities
        .filter((n) => n.type === t && (!q || n.label.toLowerCase().includes(q)))
        .sort((a, b) => Number(!!b.isRequester) - Number(!!a.isRequester)); // requester first
      const showAll = expanded[t] || all.length <= CAP;
      const items = showAll ? all : all.slice(0, CAP - 1);
      return { type: t, all, items, hidden: all.length - items.length };
    })
    .filter((g) => g.all.length > 0);

  /* ---- layout ---- */
  const slots = groups.map((g) => (g.items.length + (g.hidden > 0 ? 1 : 0)) * LEAF_GAP + SLOT_PAD);
  const total = slots.reduce((a, b) => a + b, 0);
  const W = Math.max(MIN_W, total);
  let cursor = (W - total) / 2;
  const laid = groups.map((g, gi) => {
    const start = cursor;
    cursor += slots[gi];
    const cx = start + slots[gi] / 2;
    const leaves = g.items.map((n, i) => ({ n, x: start + SLOT_PAD / 2 + LEAF_GAP * (i + 0.5) }));
    if (g.hidden > 0) {
      leaves.push({ more: true, hidden: g.hidden, x: start + SLOT_PAD / 2 + LEAF_GAP * (g.items.length + 0.5) });
    }
    return { ...g, cx, leaves };
  });

  const rootX = W / 2;
  const selected = facilities.find((n) => n.id === selectedId) || null;
  const pick = (id) => setSelectedId((cur) => (cur === id ? null : id));
  const drugLabel = drugNode.label;

  const chips = [
    { key: "all", label: "All", color: null },
    ...GROUPS.map((t) => ({ key: t, label: TYPE_LABEL_PLURAL[t], color: COLOR[t] })),
  ];

  return (
    <>
      <div className="net-head">
        <div>
          <h3 className="section-title">Supply network</h3>
          <p className="hint">
            The drug node links to every hospital, warehouse and supplier it currently touches. Select a
            facility to see its stock.
          </p>
        </div>
      </div>

      <div className="net-toolbar">
        <div className="chips" role="group" aria-label="Filter facilities by type">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`chip ${typeFilter === c.key ? "on" : ""}`}
              onClick={() => setTypeFilter(c.key)}
              aria-pressed={typeFilter === c.key}
            >
              {c.color && <span className="chip-dot" style={{ background: c.color }} />}
              {c.label} <span className="chip-n">{counts[c.key]}</span>
            </button>
          ))}
        </div>
        <div className="net-tools">
          <label className="search-box small">
            <span className="sr-only">Search facility</span>
            <input
              type="search"
              placeholder="Search facility…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="zoom-group" role="group" aria-label="Zoom">
            <button type="button" onClick={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(2)))} aria-label="Zoom in">
              +
            </button>
            <button type="button" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))} aria-label="Zoom out">
              −
            </button>
            <button type="button" onClick={() => setZoom(1)} aria-label="Fit to view" title="Fit to view">
              ⤢
            </button>
          </div>
        </div>
      </div>

      <div className="network-stage">
      <div className="graph-wrap">
        <div className="legend" aria-label="Node types">
          <div className="legend-title">Node type</div>
          <div><span className="ld" style={{ background: COLOR.drug }} />Drug (selected)</div>
          <div><span className="ld" style={{ background: COLOR.supplier }} />Supplier</div>
          <div><span className="ld" style={{ background: COLOR.warehouse }} />Warehouse / distribution</div>
          <div><span className="ld" style={{ background: COLOR.hospital }} />Hospital</div>
          <div><span className="ld ring" />Requesting hospital</div>
        </div>

        <div className="graph-scroll">
          {laid.length === 0 ? (
            <div className="empty-block">
              <p>No facility matches “{query.trim()}”.</p>
              <button type="button" className="btn-ghost" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              style={{ width: `${zoom * 100}%`, height: "auto", display: "block" }}
              xmlns="http://www.w3.org/2000/svg"
              role="group"
              aria-label={`Supply network for ${d.name}`}
            >
              <defs>
                <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="6" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* edges */}
              {laid.map((g) => (
                <g key={`e-${g.type}`} fill="none" strokeWidth="1.4" stroke={COLOR[g.type]} opacity="0.55">
                  <path d={curve(rootX, ROOT.y + ROOT.r, g.cx, HEAD.y)} />
                  {g.leaves.map((l, i) => (
                    <path key={i} d={curve(g.cx, HEAD.y + HEAD.h, l.x, LEAF.y - LEAF.r)} />
                  ))}
                </g>
              ))}

              {/* root */}
              <g>
                <rect x={rootX - 62} y="14" width="124" height="24" rx="4" fill="var(--panel)" stroke="var(--red)" />
                <text x={rootX} y="30.5" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="600" fontSize="14" fill="var(--text)">
                  {drugLabel}
                </text>
                <circle cx={rootX} cy={ROOT.y} r={ROOT.r} fill="var(--red)" filter="url(#glow)" />
                <g transform={`translate(${rootX},${ROOT.y}) rotate(-45)`}>
                  <rect x="-9" y="-4.5" width="18" height="9" rx="4.5" fill="none" stroke="#fff" strokeWidth="1.8" />
                  <line x1="0" y1="-4.5" x2="0" y2="4.5" stroke="#fff" strokeWidth="1.8" />
                </g>
              </g>

              {/* group headers + leaves */}
              {laid.map((g) => (
                <g key={g.type}>
                  <rect
                    x={g.cx - HEAD.w / 2}
                    y={HEAD.y}
                    width={HEAD.w}
                    height={HEAD.h}
                    rx="4"
                    fill="var(--panel)"
                    stroke={COLOR[g.type]}
                  />
                  <text x={g.cx} y={HEAD.y + 17.5} textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif" fontSize="12" fill="var(--text)">
                    {TYPE_LABEL_PLURAL[g.type]} ({counts[g.type]})
                  </text>

                  {g.leaves.map((l, i) =>
                    l.more ? (
                      <g
                        key="more"
                        className="net-node"
                        role="button"
                        tabIndex={0}
                        aria-label={`Show ${l.hidden} more ${TYPE_LABEL_PLURAL[g.type].toLowerCase()}`}
                        onClick={() => setExpanded((e) => ({ ...e, [g.type]: true }))}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setExpanded((x) => ({ ...x, [g.type]: true }))}
                      >
                        <circle cx={l.x} cy={LEAF.y} r={LEAF.r} fill="var(--panel-raised)" stroke="var(--text-faint)" strokeDasharray="3 3" />
                        <text x={l.x} y={LEAF.y + 4} textAnchor="middle" fontSize="13" fill="var(--text-dim)">
                          …
                        </text>
                        <text x={l.x} y={LEAF.y + 34} textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="var(--text-dim)">
                          +{l.hidden} more
                        </text>
                      </g>
                    ) : (
                      <g
                        key={l.n.id}
                        className={`net-node ${selectedId === l.n.id ? "sel" : ""}`}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selectedId === l.n.id}
                        aria-label={`${l.n.label}, ${TYPE_LABEL[l.n.type]}`}
                        onClick={() => pick(l.n.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            pick(l.n.id);
                          }
                        }}
                      >
                        <title>{l.n.label}</title>
                        {selectedId === l.n.id && (
                          <circle cx={l.x} cy={LEAF.y} r={LEAF.r + 6} fill="none" stroke={COLOR[g.type]} strokeOpacity="0.45" strokeWidth="2" />
                        )}
                        <circle
                          cx={l.x}
                          cy={LEAF.y}
                          r={LEAF.r}
                          fill={COLOR_DIM[g.type]}
                          stroke={l.n.isRequester ? "var(--red)" : COLOR[g.type]}
                          strokeWidth={selectedId === l.n.id ? 2.4 : 1.6}
                          strokeDasharray={l.n.isRequester ? "3 2" : undefined}
                        />
                        <g transform={`translate(${l.x},${LEAF.y})`}>
                          <Glyph type={g.type} color={COLOR[g.type]} />
                        </g>
                        <text textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif" fontSize="11" fill="var(--text-dim)">
                          {wrapLabel(l.n.label).map((line, li) => (
                            <tspan key={li} x={l.x} y={LEAF.y + 34 + li * 12.5}>
                              {line}
                            </tspan>
                          ))}
                        </text>
                      </g>
                    )
                  )}
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>

      {selected && <NodeDetail node={selected} drugLabel={drugLabel} onClose={() => setSelectedId(null)} />}
      </div>
    </>
  );
}
