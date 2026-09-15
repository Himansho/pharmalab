// src/pages/Ask.jsx — home: grounded Q&A over labels + FAERS + PubMed
import { useState } from 'react'
import { api } from '../api.js'
import { useStatus } from '../App.jsx'
import { Citations, DisclaimerBar, ErrorBox, Md, Spinner } from '../ui.jsx'

const EXAMPLES = [
  ['What is the mechanism of ibuprofen and why does it hurt the stomach?', 'ibuprofen'],
  ['Top reported adverse reactions for metformin', 'metformin'],
  ['Which statin interacts with clarithromycin and why?', 'simvastatin'],
  ['Serious warnings for warfarin', 'warfarin'],
]

export default function Ask() {
  const [q, setQ] = useState('')
  const [drug, setDrug] = useState('')
  const [out, setOut] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const status = useStatus()

  function ask(question = q, hint = drug) {
    if (!question.trim()) return
    setBusy(true); setErr(null); setOut(null)
    api.ask(question, hint.trim() || undefined).then(setOut).catch(setErr).finally(() => setBusy(false))
  }

  return (
    <section aria-label="Ask PharmaLab">
      <h1>Ask PharmaLab</h1>
      <p className="muted">Ask about a drug’s mechanism, interactions, safety signals or literature. The agent retrieves FDA labels, FAERS reports and PubMed abstracts <em>first</em>, then answers grounded strictly in them with clickable citations — and says “no data” instead of guessing.</p>

      <form className="card" onSubmit={(e) => { e.preventDefault(); ask() }}>
        <label className="small muted" htmlFor="ask-q">Your question</label>
        <textarea id="ask-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Why can I get muscle pain on simvastatin plus an antibiotic?" style={{ minHeight: 72 }} />
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 220px' }}>
            <label className="small muted" htmlFor="ask-drug">drug hint (optional)</label>
            <input id="ask-drug" className="input" value={drug} onChange={(e) => setDrug(e.target.value)} placeholder="e.g. simvastatin" />
          </div>
          <button className="btn" type="submit" disabled={busy || !q.trim()} style={{ alignSelf: 'flex-end' }}>{busy ? 'Retrieving & synthesizing…' : '💬 Ask'}</button>
        </div>
        <div className="chips" style={{ marginTop: 12 }} aria-label="Example questions">
          {EXAMPLES.map(([text, hint]) => <button type="button" key={text} className="chip" style={{ cursor: 'pointer', border: 'none' }} onClick={() => { setQ(text); setDrug(hint); ask(text, hint) }}>{text}</button>)}
        </div>
      </form>

      {busy && <p><Spinner label="Fetching label + FAERS + PubMed, then prompting Qwen…" /></p>}
      {err && <ErrorBox error={err} />}
      {(err?.code === 'AGENT_UNCONFIGURED' || err?.code === 'SERVER_OFFLINE') && (
        <div className="card small">
          <h2 style={{ margin: '0 0 8px' }}>🤖 The AI agent lives in the desktop version</h2>
          <p>On your PC run <code>npm run dev</code> and set <code>CAVOTI_API_KEY</code> in <code>server/.env</code>.
            Everything else — <a href="#/search">drug search &amp; labels</a>, <a href="#/interactions">interaction checks</a>,
            <a href="#/literature">PubMed</a>, <a href="#/charts">chart tools</a>, <a href="#/cases">clinical cases</a> —
            works directly against FDA / NLM / NCBI, including in the phone app.</p>
        </div>
      )}
      {out && (
        <div className="card" aria-live="polite">
          <h2>Answer <span className="muted small">· {out.retrievedChunks} sources retrieved · {(out.latencyMs / 1000).toFixed(1)}s</span></h2>
          <Md text={out.answer} />
          <Citations items={out.sources} />
        </div>
      )}
      <DisclaimerBar />
    </section>
  )
}
