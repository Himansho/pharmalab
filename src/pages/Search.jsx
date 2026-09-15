// src/pages/Search.jsx — drug lookup with RxNorm/openFDA suggestions
import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { navigate } from '../App.jsx'
import { DisclaimerBar, ErrorBox, Spinner } from '../ui.jsx'

const SUGGESTIONS = ['warfarin', 'ibuprofen', 'metformin', 'atorvastatin', 'simvastatin', 'omeprazole']

export default function Search({ q: initial }) {
  const [q, setQ] = useState(initial || '')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sugg, setSugg] = useState([])
  const [hi, setHi] = useState(-1)
  const debounce = useRef()

  useEffect(() => { if (initial) run(initial) }, []) // eslint-disable-line

  function run(term) {
    const query = (term || '').trim()
    if (!query) return
    setQ(query); setSugg([]); setLoading(true); setError(null)
    api.search(query).then(setData).catch((e) => setError(e)).finally(() => setLoading(false))
  }

  function onType(v) {
    setQ(v); clearTimeout(debounce.current)
    if (v.trim().length >= 3) {
      debounce.current = setTimeout(() => {
        api.search(v.trim()).then((d) => setSugg(d.drugs.slice(0, 6))).catch(() => setSugg([]))
      }, 400)
    } else setSugg([])
  }

  return (
    <section aria-label="Drug search">
      <h1>Drug Search</h1>
      <p className="muted">Look up any medicine by generic or brand name — normalized with RxNorm, details from FDA labels (openFDA).</p>
      <form onSubmit={(e) => { e.preventDefault(); run(q) }} role="search">
        <div style={{ position: 'relative' }}>
          <label htmlFor="drug-q" className="small muted">Drug name (generic or brand)</label>
          <input id="drug-q" className="input" style={{ marginTop: 4 }} placeholder="e.g. atorva → Atorvastatin (Lipitor)"
            value={q} onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, sugg.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)) }
              else if (e.key === 'Enter' && hi >= 0 && sugg[hi]) { e.preventDefault(); navigate(`/drug/${sugg[hi].splId}`) }
            }}
            autoComplete="off" />
          {sugg.length > 0 && (
            <ul className="suggest" role="listbox" aria-label="Suggestions">
              {sugg.map((s, i) => (
                <li key={s.splId} role="option" aria-selected={i === hi} onClick={() => navigate(`/drug/${s.splId}`)}>
                  <strong>{s.genericName || s.brandNames[0] || s.splId}</strong>
                  {s.brandNames[0] ? <span className="muted"> · {s.brandNames[0]}</span> : null}
                  <span className="muted small"> · {s.route || 'route n/a'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
          <span className="small muted">try:&nbsp;</span>
          {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" style={{ cursor: 'pointer', border: 'none' }} onClick={() => run(s)}>{s}</button>)}
        </div>
      </form>

      {loading && <p><Spinner label="Querying openFDA + RxNorm…" /></p>}
      <ErrorBox error={error} />

      {data && (
        <div className="card" aria-live="polite">
          {data.normalization?.resolved && (
            <p className="small">
              🧭 RxNorm: <strong>{data.normalization.rxnormName}</strong>
              {' '}<a className="chip" href={data.normalization.rxcuiUrl} target="_blank" rel="noopener noreferrer">RxCUI {data.normalization.rxcui}</a>
              {data.normalization.brandNames?.length ? <span className="muted"> · brands: {data.normalization.brandNames.slice(0, 4).join(', ')}</span> : null}
            </p>
          )}
          <h2>Label results <span className="muted small">({data.drugs.length})</span></h2>
          {data.drugs.length === 0 && <p className="muted">No FDA labels matched. Check spelling or try the generic name. (This also happens for devices/supplements that lack an SPL.)</p>}
          {data.drugs.map((d) => (
            <div className="drug-hit" key={d.splId}>
              <div className="result-row">
                <h3><a href={`#/drug/${d.splId}`}>{d.genericName || 'Unknown substance'}</a></h3>
                {d.brandNames?.slice(0, 3).map((b) => <span key={b} className="chip">{b}</span>)}
                {d.isOtc ? <span className="chip minor">OTC</span> : null}
              </div>
              <div className="small muted">{[d.manufacturer, d.route, d.dosageForm, d.productType].filter(Boolean).join(' · ')}</div>
              <div className="small" style={{ marginTop: 4 }}>{d.indicationsExcerpt ? <>{d.indicationsExcerpt}…</> : <span className="muted">no indications section in this SPL</span>}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                <a className="btn small secondary" href={`#/drug/${d.splId}`}>Open profile</a>
                <button className="btn small ghost" onClick={() => navigate(`/interactions?drugs=${encodeURIComponent((d.genericName || d.brandNames[0] || '').toLowerCase())}`)}>⚗️ check interactions</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <DisclaimerBar />
    </section>
  )
}
