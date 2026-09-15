// src/ui.jsx — shared primitives: async hook, markdown-lite, citations, chips
import { useEffect, useRef, useState } from 'react'

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: false, error: null })
  const run = useRef(0)
  const execute = (...args) => {
    const id = ++run.current
    setState((s) => ({ ...s, loading: true, error: null }))
    return fn(...args).then(
      (data) => { if (run.current === id) setState({ data, loading: false, error: null }); return data },
      (error) => { if (run.current === id) setState({ data: null, loading: false, error }); throw error },
    ).catch(() => {})
  }
  useEffect(() => { if (deps.length) execute(...deps).catch(() => {}) }, deps) // eslint-disable-line
  return [state, execute]
}

export function Spinner({ label = 'Loading…' }) {
  return <span role="status" className="small muted" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><span className="spinner" aria-hidden="true" /> {label}</span>
}

export function ErrorBox({ error }) {
  if (!error) return null
  return <div className="error-box" role="alert">⚠️ {String(error.message || error)}{error.code === 'AGENT_UNCONFIGURED' ? ' — see server/.env.example' : ''}</div>
}

export function DisclaimerBar() {
  return (
    <div className="disclaimer" role="note">
      <strong>Educational use only.</strong> Data aggregated from openFDA, RxNorm and PubMed may be outdated or incomplete;
      per FDA guidance, do not rely on openFDA for medical decisions. This app stores no patient data and is not medical advice.
    </div>
  )
}

export const SEVERITY_LABEL = { major: 'Major', moderate: 'Moderate', minor: 'Minor', unknown: 'Unclear', 'none-found': 'No label co-mention' }
export function SeverityChip({ severity }) {
  return <span className={`chip ${severity}`} title={`Severity heuristic from label language: ${severity}`}>{SEVERITY_LABEL[severity] || severity}</span>
}

// [PMID:123] [SPL:uuid] [RxNorm:456] tokens → superscript links (evidence system).
function CiteToken({ token }) {
  const m = token.match(/^\[(PMID|SPL|RxNorm|FAERS):([^\]]+)\]$/)
  if (!m) return null
  const [, kind, id] = m
  const href = kind === 'PMID' ? `https://pubmed.ncbi.nlm.nih.gov/${id}/`
    : kind === 'SPL' ? `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(`set_id:"${id}"`)}&limit=1`
    : kind === 'RxNorm' ? `https://rxnav.nlm.nih.gov/REST/rxcui/${id}/properties.json`
    : 'https://openfda.fda.gov'
  return <a className="cite-inline" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${kind} citation ${id}`}>[{kind}:{id.slice(0, 10)}]</a>
}

// Tiny markdown: headings, lists, bold, code, links, citation tokens. Safe (no raw HTML).
export function Md({ text }) {
  if (!text) return null
  const blocks = []
  let key = 0
  const inline = (s) => {
    const out = []
    const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[(?:PMID|SPL|RxNorm|FAERS):[^\]]+\]|https?:\/\/[^\s)]+)/g
    let last = 0, m
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index))
      if (m[2]) out.push(<strong key={out.length}>{m[2]}</strong>)
      else if (m[3]) out.push(<code key={out.length}>{m[3]}</code>)
      else if (m[0].startsWith('[')) out.push(<CiteToken key={out.length} token={m[0]} />)
      else out.push(<a key={out.length} href={m[0]} target="_blank" rel="noopener noreferrer">{m[0]}</a>)
      last = m.index + m[0].length
    }
    if (last < s.length) out.push(s.slice(last))
    return out
  }
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (/^### /.test(line)) blocks.push(<h3 key={key++}>{inline(line.slice(4))}</h3>)
    else if (/^## /.test(line)) blocks.push(<h2 key={key++}>{inline(line.slice(3))}</h2>)
    else if (/^# /.test(line)) blocks.push(<h2 key={key++}>{inline(line.slice(2))}</h2>)
    else if (/^[-•] /.test(line)) blocks.push(<div key={key++} style={{ display: 'flex', gap: 8 }}><span aria-hidden="true">•</span><span>{inline(line.slice(2))}</span></div>)
    else if (/^\d+\. /.test(line)) blocks.push(<div key={key++} style={{ display: 'flex', gap: 8 }}><strong>{line.match(/^\d+/)[0]}.</strong><span>{inline(line.replace(/^\d+\. /, ''))}</span></div>)
    else if (line === '') blocks.push(<div key={key++} style={{ height: 6 }} />)
    else blocks.push(<p key={key++} style={{ margin: '4px 0' }}>{inline(line)}</p>)
  }
  return <div className="md">{blocks}</div>
}

export function Citations({ items }) {
  if (!items?.length) return null
  return (
    <div className="chips" style={{ marginTop: 10 }} aria-label="Sources">
      {items.map((c, i) => (
        <a key={i} className="chip" href={c.url} target="_blank" rel="noopener noreferrer" title={c.url} style={{ textDecoration: 'none' }}>
          🔗 {c.label}
        </a>
      ))}
    </div>
  )
}

export function ExternalLink({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>
}
