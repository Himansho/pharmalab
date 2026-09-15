// src/pages/Interactions.jsx — combination safety checks with label evidence
import { useState } from 'react'
import { api } from '../api.js'
import { navigate } from '../App.jsx'
import { Citations, DisclaimerBar, ErrorBox, Md, SeverityChip, Spinner } from '../ui.jsx'

const PRESETS = [['Warfarin', 'Ibuprofen'], ['Simvastatin', 'Clarithromycin'], ['Lisinopril', 'Spironolactone'], ['Metformin', 'Alcohol (ethanol)'], ['Aspirin', 'Warfarin', 'Ibuprofen']]

export default function Interactions({ preset }) {
  const [drugs, setDrugs] = useState(preset?.length ? preset : ['warfarin', 'ibuprofen'])
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  function run(list) {
    const clean = list.map((d) => d.trim()).filter(Boolean)
    if (clean.length < 2) { setError(new Error('Enter at least 2 drugs')); return }
    setLoading(true); setError(null); setResult(null)
    api.interactions(clean).then(setResult).catch(setError).finally(() => setLoading(false))
  }

  return (
    <section aria-label="Interaction simulator">
      <h1>Drug–Drug Interaction Simulator</h1>
      <p className="muted">Names are RxNorm-normalized, then every pair is cross-referenced inside the <em>other</em> drug’s FDA label (Drug Interactions / Contraindications / Warnings). Severity is a transparent keyword heuristic over the matched sentences — always open the evidence.</p>

      <div className="card">
        {drugs.map((d, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <label className="small muted" style={{ width: 64 }} htmlFor={`d${i}`}>drug {i + 1}</label>
            <input id={`d${i}`} className="input" value={d} placeholder="e.g. warfarin"
              onChange={(e) => setDrugs(drugs.map((x, j) => (j === i ? e.target.value : x)))} />
            {drugs.length > 2 && <button className="icon-btn" aria-label={`Remove drug ${i + 1}`} onClick={() => setDrugs(drugs.filter((_, j) => j !== i))}>✕</button>}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {drugs.length < 6 && <button className="btn small secondary" onClick={() => setDrugs([...drugs, ''])}>+ add drug</button>}
          <button className="btn" onClick={() => run(drugs)} disabled={loading}>{loading ? 'Checking labels…' : '⚗️ Analyze combinations'}</button>
        </div>
        <div className="small muted" style={{ marginTop: 10 }}>presets:</div>
        <div className="chips">
          {PRESETS.map((p) => <button key={p.join('+')} className="chip" style={{ cursor: 'pointer', border: 'none' }} onClick={() => { setDrugs(p); run(p) }}>{p.join(' + ')}</button>)}
        </div>
      </div>

      {loading && <p><Spinner label="Fetching + normalizing labels for every drug…" /></p>}
      <ErrorBox error={error} />

      {result && (
        <>
          <div className="card">
            <h2>Inputs</h2>
            <div className="chips">{result.drugs.map((d) => <span key={d.name} className={`chip ${d.resolved ? 'minor' : 'moderate'}`} title={d.resolved ? 'label found' : 'no FDA label resolved'}>{d.name}{d.rxcui ? ` · RxCUI ${d.rxcui}` : ''}</span>)}</div>
          </div>
          {result.pairs.map((p, i) => (
            <div className="card" key={i}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>
                  <a href={`#/search?q=${encodeURIComponent(p.drugA.name)}`}>{p.drugA.generic}</a>
                  {' + '}
                  <a href={`#/search?q=${encodeURIComponent(p.drugB.name)}`}>{p.drugB.generic}</a>
                </h3>
                <SeverityChip severity={p.severity} />
              </div>
              {(p.drugA.brands.length || p.drugB.brands.length) && <p className="small muted">brands: {[[...p.drugA.brands, ...p.drugB.brands].join(', ') || '—']}</p>}
              {p.findings.length === 0 ? (
                <p className="muted">{p.evidenceNote}</p>
              ) : (
                p.findings.map((f, j) => (
                  <details className="section" key={j} open={j === 0}>
                    <summary><SeverityChip severity={f.severity} /> <span style={{ marginLeft: 8 }} className="small">“{f.snippet.slice(0, 110)}{f.snippet.length > 110 ? '…' : ''}” — {f.foundIn}, {f.section}</span></summary>
                    <div className="body">
                      <p>{f.snippet}</p>
                      {f.labelUrl && <a href={f.labelUrl} target="_blank" rel="noopener noreferrer">view source SPL query ↗</a>}
                    </div>
                  </details>
                ))
              )}
              {p.findings.some((f) => f.splId) && <Citations items={[...new Map(p.findings.filter((f) => f.splId).map((f) => [f.splId, { label: `${f.foundIn} (SPL ${f.splId.slice(0, 8)}…)`, url: f.labelUrl }])).values()]} />}
            </div>
          ))}
          {result.aiSummary && (
            <div className="card">
              <h2>🤖 AI explanation <span className="chip moderate">verify against evidence</span></h2>
              <Md text={result.aiSummary} />
            </div>
          )}
        </>
      )}
      <DisclaimerBar />
    </section>
  )
}
