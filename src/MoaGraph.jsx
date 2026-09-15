// src/MoaGraph.jsx — interactive mechanism-of-action diagram (SVG, zero-dep).
// Layered DAG layout, pan/zoom, click/focus a node to highlight neighbors + show note.
import { useEffect, useMemo, useRef, useState } from 'react'

const NODE_W = 150, NODE_H = 44, GAP_X = 90, GAP_Y = 26
const TYPE_COLOR = { drug: '#0d9488', enzyme: '#7c3aed', receptor: '#2563eb', molecule: '#0891b2', pathway: '#64748b', effect: '#d97706', transporter: '#db2777', ion_channel: '#4f46e5' }

function layout(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const incoming = new Map(nodes.map((n) => [n.id, 0]))
  for (const e of edges) if (byId.has(e.from) && byId.has(e.to)) incoming.set(e.to, incoming.get(e.to) + 1)
  // Longest-path layering (robust enough for small graphs; ignores cycles gracefully).
  const depth = new Map(nodes.map((n) => [n.id, 0]))
  let changed = true, guard = 0
  while (changed && guard++ < 40) {
    changed = false
    for (const e of edges) {
      if (!byId.has(e.from) || !byId.has(e.to)) continue
      const want = Math.min(depth.get(e.from) + 1, nodes.length - 1)
      if (want > depth.get(e.to)) { depth.set(e.to, want); changed = true }
    }
  }
  const layers = new Map()
  for (const n of nodes) {
    const d = depth.get(n.id)
    if (!layers.has(d)) layers.set(d, [])
    layers.get(d).push(n)
  }
  const pos = new Map()
  const maxLayer = Math.max(...[...layers.values()].map((l) => l.length))
  for (const [d, list] of layers) {
    list.sort((a, b) => a.label.localeCompare(b.label))
    const totalH = list.length * NODE_H + (list.length - 1) * GAP_Y
    let y = (maxLayer * (NODE_H + GAP_Y) - totalH) / 2 + NODE_H / 2
    for (const n of list) {
      pos.set(n.id, { x: d * (NODE_W + GAP_X) + NODE_W / 2 + 30, y: y + NODE_H / 2 })
      y += NODE_H + GAP_Y
    }
  }
  const width = (Math.max(...[...layers.keys()]) + 1) * (NODE_W + GAP_X) + 60
  const height = maxLayer * (NODE_H + GAP_Y) + 80
  return { pos, width: Math.max(width, 500), height: Math.max(height, 260) }
}

export default function MoaGraph({ graph, onSelect }) {
  const nodes = graph?.nodes || []
  const edges = graph?.edges || []
  const { pos, width, height } = useMemo(() => layout(nodes, edges), [graph])
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef(null)
  const shellRef = useRef(null)
  const [tip, setTip] = useState(null)

  useEffect(() => { setSelected(null); setView({ x: 0, y: 0, k: Math.min(1, 900 / width) }) }, [graph, width])

  const neighbors = useMemo(() => {
    const m = new Map()
    for (const e of edges) {
      if (!m.has(e.from)) m.set(e.from, new Set())
      if (!m.has(e.to)) m.set(e.to, new Set())
      m.get(e.from).add(e.to)
      m.get(e.to).add(e.from)
    }
    return m
  }, [edges])

  const selSet = selected ? new Set([selected, ...(neighbors.get(selected) || [])]) : null

  const edgePath = (e) => {
    const a = pos.get(e.from), b = pos.get(e.to)
    if (!a || !b) return null
    const x1 = a.x + NODE_W / 2, x2 = b.x - NODE_W / 2 - (e.kind === 'inhibits' || e.kind === 'blocks' ? 6 : 12)
    const mx = (x1 + x2) / 2
    const dim = selSet && !(selSet.has(e.from) && selSet.has(e.to)) ? .15 : 1
    return { d: `M ${x1} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${Math.max(x2, x1 + 10)} ${b.y}`, kind: e.kind, label: e.label, dim, lx: mx, ly: (a.y + b.y) / 2 - 5 }
  }

  const onWheel = (ev) => {
    ev.preventDefault()
    const k = Math.min(2.5, Math.max(0.4, view.k * (ev.deltaY < 0 ? 1.12 : 0.9)))
    setView((v) => ({ ...v, k }))
  }

  const zoom = (f) => setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.4, v.k * f)) }))

  return (
    <div className="graph-shell" ref={shellRef}>
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 6, display: 'flex', gap: 6 }} role="group" aria-label="Zoom controls">
        <button className="icon-btn" onClick={() => zoom(1.2)} aria-label="Zoom in">＋</button>
        <button className="icon-btn" onClick={() => zoom(0.83)} aria-label="Zoom out">－</button>
        <button className="icon-btn" onClick={() => setView({ x: 0, y: 0, k: 1 })} aria-label="Reset view">⟲</button>
      </div>
      <svg
        className="graph-svg" role="img" aria-label="Mechanism of action diagram"
        viewBox={`0 0 ${width} ${height}`}
        onWheel={onWheel}
        onPointerDown={(ev) => { drag.current = { x: ev.clientX - view.x, y: ev.clientY - view.y }; ev.currentTarget.setPointerCapture(ev.pointerId) }}
        onPointerMove={(ev) => { if (drag.current) setView((v) => ({ ...v, x: ev.clientX - drag.current.x, y: ev.clientY - drag.current.y })) }}
        onPointerUp={() => { drag.current = null }}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted)" />
          </marker>
          <marker id="arrow-red" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 0 10" stroke="#dc2626" strokeWidth="2.5" />
          </marker>
        </defs>
        <g transform={`translate(${view.x + (width * (1 - view.k)) / 2} ${view.y + (height * (1 - view.k)) / 2}) scale(${view.k})`}>
          {edges.map((e, i) => {
            const p = edgePath(e)
            if (!p) return null
            return (
              <g key={i} opacity={p.dim}>
                <path d={p.d} className={`edge-line ${p.kind}`} markerEnd={p.kind === 'inhibits' || p.kind === 'blocks' ? 'url(#arrow-red)' : 'url(#arrow)'} />
                {(p.label || p.kind) && <text x={p.lx} y={p.ly} className="edge-label" textAnchor="middle">{p.label || p.kind}</text>}
              </g>
            )
          })}
          {nodes.map((n) => {
            const p = pos.get(n.id)
            if (!p) return null
            const dim = selSet && !selSet.has(n.id) ? .25 : 1
            const isSel = selected === n.id
            return (
              <g
                key={n.id} className={`node-g ${dim < 1 ? 'dim' : ''}`} tabIndex={0} role="button"
                aria-label={`${n.label}: ${n.note || ''}`}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(n) } }}
                onClick={() => pick(n)}
                onMouseEnter={(ev) => n.note && setTip({ x: ev.clientX - shellRef.current.getBoundingClientRect().left, y: ev.clientY - shellRef.current.getBoundingClientRect().top, note: n.note, label: n.label })}
                onMouseLeave={() => setTip(null)}
                onFocus={() => setTip(null)}
              >
                <rect x={p.x - NODE_W / 2} y={p.y - NODE_H / 2} width={NODE_W} height={NODE_H} rx={10}
                  className={`node-rect node-type-${n.type}`} stroke={isSel ? 'var(--accent)' : 'rgba(0,0,0,.25)'} strokeWidth={isSel ? 3 : 1.5} />
                <text x={p.x} y={p.y - 2} textAnchor="middle" className="node-label">
                  {n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label}
                </text>
                <text x={p.x} y={p.y + 13} textAnchor="middle" className="node-label" style={{ fontSize: 9.5, opacity: .85, fontWeight: 400 }}>{n.type?.replace('_', '-')}</text>
              </g>
            )
            function pick(node) { setSelected((s) => (s === node.id ? null : node.id)); onSelect?.(node) }
          })}
        </g>
      </svg>
      {tip && <div className="tooltip" style={{ left: Math.min(tip.x + 12, (shellRef.current?.clientWidth || 600) - 320), top: tip.y + 12 }}><strong>{tip.label}</strong><div className="small">{tip.note}</div></div>}
      <div className="legend" aria-label="Legend">
        {['drug', 'enzyme', 'receptor', 'molecule', 'pathway', 'effect'].map((t) => (
          <span key={t}><span className="sw" style={{ background: TYPE_COLOR[t] }} />{t.replace('_', '-')}</span>
        ))}
        <span>→ activates/leads to · ⊣ inhibits · click a node to focus its neighborhood</span>
      </div>
    </div>
  )
}
