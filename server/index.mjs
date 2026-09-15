// server/index.mjs — PharmaLab API server (zero runtime deps: node:http + fetch)
import { createServer } from 'node:http'
import { readFile, mkdir, appendFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEnv, htmlToText } from './lib/util.mjs'
import * as openfda from './lib/openfda.mjs'
import * as rxnorm from './lib/rxnorm.mjs'
import * as pubmed from './lib/pubmed.mjs'
import { analyzePairs } from './lib/interactions.mjs'
import * as agent from './lib/agent.mjs'

loadEnv()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PORT = Number(process.env.PORT || 8787)

const DISCLAIMER = 'PharmaLab is for EDUCATIONAL and research use only. Data are aggregated from public sources (openFDA, RxNorm, PubMed) and may be outdated or incomplete; openFDA explicitly states its data should not be relied on for medical decisions. This app is not a clinical decision tool and does not store patient data.'

// ---- curated data -----------------------------------------------------------
const mechanisms = JSON.parse(await readFile(path.join(__dirname, '..', 'shared', 'data', 'mechanisms.json'), 'utf8'))
const casesData = JSON.parse(await readFile(path.join(__dirname, '..', 'shared', 'data', 'cases.json'), 'utf8'))
const aliasIndex = new Map()
for (const [key, m] of Object.entries(mechanisms)) {
  if (key === '_meta') continue
  aliasIndex.set(key, key)
  for (const a of m.aliases || []) aliasIndex.set(a.toLowerCase().trim(), key)
}

// ---- prompt log (audit trail per PRD §Evidence) -----------------------------
const logDir = path.join(ROOT, 'logs')
let logReady = mkdir(logDir, { recursive: true }).catch(() => {})
function logPrompt(entry) {
  logReady = logReady.then(() => appendFile(path.join(logDir, 'prompts.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n').catch(() => {}))
}

// ---- mechanism resolution ----------------------------------------------------
async function resolveMechanism(drug) {
  const q = drug.toLowerCase().trim()
  const curated = mechanisms[aliasIndex.get(q)]
  if (curated) {
    return { drug, source: 'curated', graph: curated, aiAvailable: agent.agentStatus().configured }
  }
  // Fall back to label-derived mechanism text; optionally AI-generated graph.
  const label = await openfda.labelByName(q).catch(() => null)
  const mechSec = label?.sections.find((s) => ['mechanism_of_action', 'clinical_pharmacology'].includes(s.key))
  const base = {
    drug,
    aiAvailable: agent.agentStatus().configured,
    labelSummary: mechSec?.text.slice(0, 1500) || '',
    citations: (label?.citations || []).slice(0, 3),
  }
  if (agent.agentStatus().configured) {
    try {
      const graph = await agent.generateMechanismGraph(label?.genericName || q, mechSec?.text)
      return { ...base, source: 'ai-generated', graph: { ...graph, summary: graph.summary, citations: base.citations, note: 'AI-generated from label text + model knowledge — verify against the cited sources.' } }
    } catch (e) {
      return { ...base, source: 'label-text', aiError: e.message }
    }
  }
  return { ...base, source: 'label-text' }
}

// ---- http plumbing -----------------------------------------------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' }

function send(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(body)
}

function readBody(req, limit = 14 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(Object.assign(new Error('Invalid JSON body'), { status: 400 })) }
    })
    req.on('error', reject)
  })
}

async function serveStatic(res, urlPath) {
  const distDir = path.join(ROOT, 'dist')
  if (!existsSync(distDir)) return send(res, 200, { app: 'PharmaLab API', ui: 'run `npm run dev` for the UI, or `npm run build` then restart for production static serving', disclaimer: DISCLAIMER })
  let file = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
  if (file.includes('..')) return send(res, 400, { error: 'bad path' })
  try {
    let data = await readFile(path.join(distDir, file))
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    const data = await readFile(path.join(distDir, 'index.html')) // SPA fallback
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(data)
  }
}

// ---- routes -------------------------------------------------------------------
const routes = []
const get = (p, h) => routes.push(['GET', p, h])
const post = (p, h) => routes.push(['POST', p, h])
const match = (method, p) => routes.find(([m, pat]) => {
  if (m !== method) return false
  const seg = pat.split('/'), act = p.split('/')
  if (seg.length !== act.length) return false
  const params = {}
  for (let i = 0; i < seg.length; i++) {
    if (seg[i].startsWith(':')) params[seg[i].slice(1)] = decodeURIComponent(act[i])
    else if (seg[i] !== act[i]) return false
  }
  return params
})

get('/api/status', async (_q, _p, res) => send(res, 200, {
  app: 'PharmaLab', version: '1.0.0',
  agent: agent.agentStatus(),
  features: { curatedMechanisms: aliasIndex.size, curatedCases: casesData.cases.length, dataSources: ['openFDA label', 'openFDA FAERS', 'RxNorm', 'PubMed E-utilities'] },
  disclaimer: DISCLAIMER,
}))

get('/api/search', async (q, _p, res) => {
  const query = (q.get('q') || '').trim()
  if (!query) return send(res, 400, { error: 'q required' })
  const [drugs, rx] = await Promise.all([
    openfda.searchLabels(query, Number(q.get('limit') || 10)),
    rxnorm.normalize(query).catch(() => ({ resolved: false })),
  ])
  send(res, 200, { query, normalization: rx, drugs, disclaimer: DISCLAIMER })
})

get('/api/label', async (q, _p, res) => {
  const spl = q.get('spl')
  if (!spl) return send(res, 400, { error: 'spl required' })
  send(res, 200, await openfda.getLabel(spl))
})

get('/api/rxnorm', async (q, _p, res) => {
  const name = (q.get('q') || '').trim()
  if (!name) return send(res, 400, { error: 'q required' })
  send(res, 200, await rxnorm.normalize(name))
})

get('/api/mechanism', async (q, _p, res) => {
  const drug = (q.get('drug') || '').trim()
  if (!drug) return send(res, 400, { error: 'drug required' })
  const out = await resolveMechanism(drug)
  if (out.source === 'label-text' && !out.labelSummary) return send(res, 404, { error: `No mechanism data for "${drug}" (no curated graph and label has none). Try a generic name.` })
  send(res, 200, { ...out, disclaimer: DISCLAIMER })
})

get('/api/faers', async (q, _p, res) => {
  const drug = (q.get('drug') || '').trim()
  if (!drug) return send(res, 400, { error: 'drug required' })
  const data = await openfda.topAdverseEvents(drug, Number(q.get('n') || 8))
  send(res, 200, { ...data, note: 'FAERS reports are voluntary and do NOT establish causality. Updated quarterly; may lag ~3 months.', disclaimer: DISCLAIMER })
})

post('/api/interactions', async (_q, _p, res, req) => {
  const body = await readBody(req)
  const drugs = Array.isArray(body.drugs) ? body.drugs : [body.a, body.b].filter(Boolean)
  const started = Date.now()
  const result = await analyzePairs(drugs)
  let aiSummary = null
  if (agent.agentStatus().configured && result.pairs.some((p) => p.findings.length)) {
    try {
      const evidence = result.pairs.flatMap((p) => p.findings.map((f) => ({ pair: `${p.drugA.generic}+${p.drugB.generic}`, severity: f.severity, section: f.section, snippet: f.snippet, spl: f.splId })))
      const { answer } = await askInternal(`Explain these FDA-label-matched drug-interaction findings in plain language, grouped by pair, stating severity and mechanism. Cite each point as [SPL:doc-id].\n\n${JSON.stringify(evidence).slice(0, 6000)}`)
      aiSummary = answer
    } catch { /* summary is optional */ }
  }
  logPrompt({ endpoint: '/api/interactions', drugs: result.drugs.map((d) => d.name), pairs: result.pairs.length, ms: Date.now() - started })
  send(res, 200, { ...result, aiSummary, disclaimer: DISCLAIMER })
})

get('/api/pubmed', async (q, _p, res) => {
  const query = (q.get('q') || '').trim()
  if (!query) return send(res, 400, { error: 'q required' })
  const out = await pubmed.search(query, Math.min(Number(q.get('max') || 12), 30))
  send(res, 200, { ...out, disclaimer: DISCLAIMER })
})

get('/api/pubmed/abstract', async (q, _p, res) => {
  const pmid = (q.get('pmid') || '').trim()
  if (!/^\d{5,9}$/.test(pmid)) return send(res, 400, { error: 'pmid must be digits' })
  send(res, 200, await pubmed.abstract(pmid))
})

// Small internal wrapper so /api/interactions can reuse the RAG generator
async function askInternal(prompt) {
  const out = await agent.askAgentRaw(prompt)
  return out
}

post('/api/agent/ask', async (_q, _p, res, req) => {
  const body = await readBody(req)
  const question = (body.question || '').trim()
  if (!question) return send(res, 400, { error: 'question required' })
  const started = Date.now()
  const out = await agent.askAgent(question, { drugHint: body.drug })
  logPrompt({ endpoint: '/api/agent/ask', question: question.slice(0, 300), sources: out.sources.length, ms: out.latencyMs })
  send(res, 200, { ...out, latencyMs: Date.now() - started, disclaimer: DISCLAIMER })
})

post('/api/agent/summarize', async (_q, _p, res, req) => {
  const body = await readBody(req)
  const query = (body.query || '').trim()
  if (!query) return send(res, 400, { error: 'query required' })
  const out = await agent.summarizeTopic(query, body.level || 'student')
  logPrompt({ endpoint: '/api/agent/summarize', query: query.slice(0, 200), sources: out.sources.length })
  send(res, 200, { ...out, disclaimer: DISCLAIMER })
})

post('/api/agent/vision', async (_q, _p, res, req) => {
  const body = await readBody(req)
  if (!body.imageDataUrl) return send(res, 400, { error: 'imageDataUrl required' })
  const out = await agent.analyzeChart(body.imageDataUrl, body.question || '')
  logPrompt({ endpoint: '/api/agent/vision', question: (body.question || '').slice(0, 200), imageBytes: body.imageDataUrl.length })
  send(res, 200, { ...out, disclaimer: DISCLAIMER })
})

post('/api/agent/mechanism', async (_q, _p, res, req) => {
  const body = await readBody(req)
  const drug = (body.drug || '').trim()
  if (!drug) return send(res, 400, { error: 'drug required' })
  const out = await resolveMechanism(drug)
  send(res, 200, { ...out, disclaimer: DISCLAIMER })
})

get('/api/cases', async (_q, _p, res) => send(res, 200, { cases: casesData.cases.map(({ steps, ...c }) => ({ ...c, stepsCount: steps.length })), disclaimer: DISCLAIMER }))
get('/api/cases/detail', async (q, _p, res) => {
  const c = casesData.cases.find((x) => x.id === q.get('id'))
  if (!c) return send(res, 404, { error: 'case not found' })
  send(res, 200, { ...c, disclaimer: DISCLAIMER })
})
post('/api/cases/coach', async (_q, _p, res, req) => {
  const body = await readBody(req)
  const c = casesData.cases.find((x) => x.id === body.caseId)
  if (!c) return send(res, 404, { error: 'case not found' })
  const step = c.steps[Number(body.stepIndex)]
  if (!step) return send(res, 400, { error: 'bad stepIndex' })
  const out = await agent.coachCase(c, step, body.userAnswer || '(student left this blank)', body.history || [])
  logPrompt({ endpoint: '/api/cases/coach', caseId: c.id, stepIndex: body.stepIndex })
  send(res, 200, { ...out, disclaimer: DISCLAIMER })
})

// ---- dispatch -----------------------------------------------------------------
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  try {
    if (url.pathname.startsWith('/api/')) {
      const hit = match(req.method, url.pathname)
      if (!hit) return send(res, 404, { error: 'No such endpoint' })
      const [, , handler, ] = hit
      await handler(url.searchParams, req.url, res, req)
      return
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
    await serveStatic(res, url.pathname)
  } catch (err) {
    const status = err.status || 500
    if (status >= 500 && err.code !== 'AGENT_UNCONFIGURED') console.error('[pharmalab]', req.method, url.pathname, err.message)
    send(res, status, { error: err.message || 'Internal error', code: err.code, disclaimer: DISCLAIMER })
  }
})

server.listen(PORT, () => console.log(`[pharmalab] API on http://localhost:${PORT} — agent ${agent.agentStatus().configured ? 'configured' : 'NOT configured (AI features degrade gracefully)'}`))
