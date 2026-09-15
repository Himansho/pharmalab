// src/api.js — hybrid client.
// DATA features (search, labels, RxNorm, PubMed, interactions, mechanism,
// cases, FAERS) run 100% client-side against public APIs → the APK works
// standalone. AI features call the optional desktop server (/api/agent/*).
import * as direct from './lib/direct.js'

let serverProbe = null // null=unknown, false=offline, object=server status

async function probeServer() {
  if (serverProbe) return serverProbe
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3000)
    const res = await fetch('/api/status', { signal: ctrl.signal })
    clearTimeout(t)
    serverProbe = res.ok ? await res.json() : false
  } catch { serverProbe = false }
  return serverProbe
}

async function callServer(path, opts) {
  let s
  try { s = await probeServer() } catch { s = false }
  if (!s) {
    const err = new Error('AI features run through the desktop server (npm run dev) — the standalone app keeps everything else fully working.')
    err.code = 'SERVER_OFFLINE'; err.status = 503; throw err
  }
  const res = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  let body = null
  try { body = await res.json() } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`)
    err.status = res.status; err.code = body?.code
    throw err
  }
  return body
}

export const api = {
  // ---- status: merge standalone capabilities + optional server ----
  status: async () => {
    const s = await probeServer().catch(() => false)
    return {
      app: 'PharmaLab',
      standalone: true,
      serverOnline: !!s,
      agent: s?.agent || { configured: false },
      features: {
        curatedMechanisms: direct.curatedDrugList().length,
        curatedCases: direct.localCases.list().length,
        dataSources: ['openFDA label (direct)', 'openFDA FAERS (direct)', 'RxNorm API (direct)', 'PubMed E-utilities (direct)'],
      },
    }
  },
  refreshStatus: () => { serverProbe = null },

  // ---- data endpoints: direct (no server) ----
  search: async (q) => {
    const [drugs, rx] = await Promise.all([
      direct.searchLabels(q, 10),
      direct.normalize(q).catch(() => ({ resolved: false })),
    ])
    return { query: q, normalization: rx, drugs }
  },
  label: (spl) => direct.getLabel(spl),
  rxnorm: (q) => direct.normalize(q),
  mechanism: async (drug) => {
    const out = await direct.resolveMechanismLocal(drug)
    const s = await probeServer().catch(() => false)
    return { ...out, aiAvailable: !!s?.agent?.configured }
  },
  faers: async (drug) => {
    const out = await direct.topAdverseEvents(drug, 8)
    return { ...out, note: 'FAERS reports are voluntary and do NOT establish causality. Updated quarterly; may lag ~3 months.' }
  },
  interactions: (drugs) => direct.analyzeDrugPairs(drugs),
  pubmed: (q, max = 12) => direct.pubmedSearch(q, max),
  abstract: (pmid) => direct.pubmedAbstract(pmid),
  cases: async () => ({ cases: direct.localCases.list() }),
  caseDetail: async (id) => {
    const c = direct.localCases.detail(id)
    if (!c) { const e = new Error('case not found'); e.status = 404; throw e }
    return c
  },

  // ---- AI endpoints: optional desktop server ----
  ask: (question, drug) => callServer('/agent/ask', { method: 'POST', body: JSON.stringify({ question, drug }) }),
  summarize: (query, level) => callServer('/agent/summarize', { method: 'POST', body: JSON.stringify({ query, level }) }),
  vision: (imageDataUrl, question) => callServer('/agent/vision', { method: 'POST', body: JSON.stringify({ imageDataUrl, question }) }),
  regenerateMechanism: (drug) => callServer('/agent/mechanism', { method: 'POST', body: JSON.stringify({ drug }) }),
  coach: (payload) => callServer('/cases/coach', { method: 'POST', body: JSON.stringify(payload) }),
}
