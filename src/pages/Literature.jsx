// src/pages/Literature.jsx — PubMed engine with abstracts + AI summary (RAG)
import { useState } from 'react'
import { api } from '../api.js'
import { useStatus } from '../App.jsx'
import { DisclaimerBar, ErrorBox, Md, Spinner } from '../ui.jsx'

const TOPICS = ['metformin longevity', 'statins cognitive decline', 'NSAID cardiovascular risk', 'semaglutide appetite mechanism']

export default function Literature({ preset }) {
  const [q, setQ] = useState(preset || '')
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [openAbs, setOpenAbs] = useState({})
  const [ai, setAi] = useState({ loading: false, out: null, err: null })
  const [level, setLevel] = useState('student')
  const status = useStatus()

  function search(term) {
    const query = (term || '').trim()
    if (!query) return
    setQ(query); setLoading(true); setError(null); setResults(null); setAi({ loading: false, out: null, err: null })
    api.pubmed(query).then(setResults).catch(setError).finally(() => setLoading(false))
  }

  async function toggleAbstract(pmid) {
    if (openAbs[pmid]) return setOpenAbs((s) => ({ ...s, [pmid]: null }))
    const a = await api.abstract(pmid).catch((e) => ({ text: `Failed: ${e.message}` }))
    setOpenAbs((s) => ({ ...s, [pmid]: a.text }))
  }

  function summarize() {
    setAi({ loading: true, out: null, err: null })
    api.summarize(q, level).then((out) => setAi({ loading: false, out, err: null }))
      .catch((e) => setAi({ loading: false, out: null, err: e }))
  }

  return (
    <section aria-label="Literature search">
      <h1>PubMed Literature Engine</h1>
      <p className="muted">Live NCBI E-utilities search. Abstracts are retrieved on demand; the AI summary (when configured) is true RAG: the backend fetches top abstracts first, then asks Qwen to synthesize <em>only</em> from them with [PMID] citations.</p>
      <form onSubmit={(e) => { e.preventDefault(); search(q) }}>
        <label className="small muted" htmlFor="lit-q">Search PubMed</label>
        <input id="lit-q" className="input" style={{ marginTop: 4 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. metformin longevity" />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" type="submit" disabled={loading}>{loading ? 'Searching…' : '📚 Search'}</button>
          {TOPICS.map((t) => <button type="button" key={t} className="chip" style={{ cursor: 'pointer', border: 'none' }} onClick={() => search(t)}>{t}</button>)}
        </div>
      </form>
      <ErrorBox error={error} />

      {results && (
        <div className="card">
          <h2>{results.count.toLocaleString()} articles · showing {results.results.length}</h2>
          <ol style={{ paddingLeft: 20 }}>
            {results.results.map((r) => (
              <li key={r.pmid} style={{ margin: '10px 0' }}>
                <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>
                <div className="small muted">{r.authors.slice(0, 4).join(', ')}{r.authors.length > 4 ? ' et al.' : ''} · <em>{r.journal}</em> {r.year} · PMID <a href={r.url} target="_blank" rel="noopener noreferrer">{r.pmid}</a></div>
                <button className="btn small secondary" style={{ marginTop: 4 }} onClick={() => toggleAbstract(r.pmid)} aria-expanded={!!openAbs[r.pmid]}>
                  {openAbs[r.pmid] === null ? 'Abstract…' : openAbs[r.pmid] ? 'Hide abstract' : 'Show abstract'}
                </button>
                {openAbs[r.pmid] && <p className="small" style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 10, whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', fontSize: '.8rem', marginTop: 6 }}>{openAbs[r.pmid]}</p>}
              </li>
            ))}
          </ol>
          {status.agent?.configured
            ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                <label className="small muted" htmlFor="lvl">explain at level:</label>
                <select id="lvl" className="input" style={{ width: 'auto' }} value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option value="layman">layman</option><option value="student">student</option><option value="expert">expert</option>
                </select>
                <button className="btn" onClick={summarize} disabled={ai.loading}>{ai.loading ? 'Synthesizing…' : '🤖 AI evidence summary'}</button>
              </div>
            )
            : <p className="small muted">🤖 AI summary needs a model key (see server/.env.example). Titles, abstracts and PMIDs remain fully usable.</p>}
          {ai.out && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
              <Md text={ai.out.answer} />
              {ai.out.sources?.length > 0 && <p className="small">{ai.out.sources.map((s) => <a key={s.id} className="chip" href={s.url} target="_blank" rel="noopener noreferrer" style={{ marginRight: 6 }}>PMID {s.id}</a>)}</p>}
            </div>
          )}
          {ai.err && <ErrorBox error={ai.err} />}
        </div>
      )}
      <DisclaimerBar />
    </section>
  )
}
