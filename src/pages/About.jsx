// src/pages/About.jsx — purpose, data sources, freshness, architecture
import { useStatus } from '../App.jsx'
import { DisclaimerBar } from '../ui.jsx'

export default function About() {
  const status = useStatus()
  return (
    <section aria-label="About">
      <h1>About PharmaLab</h1>
      <div className="card">
        <h2>Purpose &amp; scope</h2>
        <p>PharmaLab is an <strong>educational / research</strong> explorer for drug mechanisms, interactions and safety evidence, built to the attached PRD. It demonstrates a retrieval-augmented workflow: authoritative data is fetched first, the AI model only ever synthesizes <em>what was retrieved</em>, and every answer carries clickable citations (FDA SPL ids, PMIDs, RxCUIs).</p>
        <p>It is <strong>not</strong> a clinical decision tool. It stores no patient data (all cases are fictional). Prompt/answer logs live locally in <code>logs/prompts.jsonl</code> for audit, per the PRD’s evidence-trail requirement.</p>
      </div>
      <div className="card">
        <h2>Data sources &amp; freshness</h2>
        <table className="labs-table">
          <thead><tr><th>Source</th><th>Used for</th><th>Cadence</th></tr></thead>
          <tbody>
            <tr><td><a href="https://open.fda.gov/apis/drug/label/" target="_blank" rel="noopener noreferrer">openFDA Drug Label (SPL)</a></td><td>search, label sections, interaction evidence</td><td>weekly</td></tr>
            <tr><td><a href="https://open.fda.gov/apis/drug/event/" target="_blank" rel="noopener noreferrer">openFDA Drug Event API</a></td><td>adverse-event signal bars (no causality!)</td><td>quarterly (~3 mo lag)</td></tr>
            <tr><td><a href="https://rxnav.nlm.nih.gov/" target="_blank" rel="noopener noreferrer">RxNorm API (NLM)</a></td><td>name normalization, brand↔generic, RxCUI</td><td>monthly</td></tr>
            <tr><td><a href="https://pubmed.ncbi.nlm.nih.gov/about/tools/" target="_blank" rel="noopener noreferrer">PubMed E-utilities</a></td><td>literature engine + RAG abstracts</td><td>live</td></tr>
            <tr><td>Curated MOA graphs &amp; cases</td><td>mechanism visualizer, case simulator (offline)</td><td>{'2026-09'}</td></tr>
            <tr><td>Qwen3.8-Flash (Cavoti API)</td><td>Ask agent, AI summaries, vision, case tutor</td><td>{status.agent?.configured ? `active — ${status.agent.model}` : 'not configured'}</td></tr>
          </tbody>
        </table>
        <p className="small muted">The PRD also envisioned DrugBank, Elasticsearch, Redis and Postgres. For a local educational deployment we query the upstream APIs directly behind an in-memory TTL cache in the server — same latency benefit without operational weight.</p>
      </div>
      <div className="grid two">
        <div className="card">
          <h2>Architecture</h2>
          <pre className="small" style={{ overflow: 'auto' }}>{`Browser (React SPA)
   │ REST/JSON
   ▼
Node http server  ──► openFDA / RxNorm / PubMed  (TTL cache)
   │                 ─► curated JSON (MOA graphs, cases)
   └──► Cavoti OpenAI-compatible API (Qwen3.8-Flash, vision)
         logs/prompts.jsonl (audit)`}</pre>
        </div>
        <div className="card">
          <h2>Model eval hooks</h2>
          <p className="small">The PRD’s evaluation harness maps to: Ask prompts → citation presence, “no data” refusals; Interactions → known-pair regression (warfarin+ibuprofen = major, simvastatin+clarithromycin = major); Cases → graded step answers; latency logged per request.</p>
        </div>
      </div>
      <DisclaimerBar />
    </section>
  )
}
