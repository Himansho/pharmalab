// src/api.js — thin fetch wrapper for the PharmaLab backend
const BASE = '/api'

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  let body = null
  try { body = await res.json() } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`)
    err.status = res.status
    err.code = body?.code
    err.body = body
    throw err
  }
  return body
}

export const api = {
  status: () => req('/status'),
  search: (q) => req(`/search?q=${encodeURIComponent(q)}`),
  label: (spl) => req(`/label?spl=${encodeURIComponent(spl)}`),
  rxnorm: (q) => req(`/rxnorm?q=${encodeURIComponent(q)}`),
  mechanism: (drug) => req(`/mechanism?drug=${encodeURIComponent(drug)}`),
  faers: (drug) => req(`/faers?drug=${encodeURIComponent(drug)}`),
  interactions: (drugs) => req('/interactions', { method: 'POST', body: JSON.stringify({ drugs }) }),
  pubmed: (q, max = 12) => req(`/pubmed?q=${encodeURIComponent(q)}&max=${max}`),
  abstract: (pmid) => req(`/pubmed/abstract?pmid=${pmid}`),
  ask: (question, drug) => req('/agent/ask', { method: 'POST', body: JSON.stringify({ question, drug }) }),
  summarize: (query, level) => req('/agent/summarize', { method: 'POST', body: JSON.stringify({ query, level }) }),
  vision: (imageDataUrl, question) => req('/agent/vision', { method: 'POST', body: JSON.stringify({ imageDataUrl, question }) }),
  regenerateMechanism: (drug) => req('/agent/mechanism', { method: 'POST', body: JSON.stringify({ drug }) }),
  cases: () => req('/cases'),
  caseDetail: (id) => req(`/cases/detail?id=${encodeURIComponent(id)}`),
  coach: (payload) => req('/cases/coach', { method: 'POST', body: JSON.stringify(payload) }),
}
