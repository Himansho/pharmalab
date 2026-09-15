// server/lib/agent.mjs — Qwen3.8-Flash via Cavoti (OpenAI-compatible), with RAG
// prompts. All functions throw AGENT_UNCONFIGURED when no API key is set, so
// routes can degrade gracefully.
import { jsonFetch } from './util.mjs'
import { searchLabels, getLabel, labelByName, topAdverseEvents } from './openfda.mjs'
import { normalize } from './rxnorm.mjs'
import * as pubmed from './pubmed.mjs'

export const AGENT_UNCONFIGURED = 'AGENT_UNCONFIGURED'

export function agentStatus() {
  return {
    configured: !!process.env.CAVOTI_API_KEY,
    model: process.env.LLM_MODEL || 'qwen-3.8-flash',
    visionModel: process.env.LLM_VISION_MODEL || process.env.LLM_MODEL || 'qwen-3.8-flash',
    baseUrl: process.env.LLM_BASE_URL || 'https://cavoti.com/v1',
  }
}

function requireKey() {
  const s = agentStatus()
  if (!process.env.CAVOTI_API_KEY) {
    const err = new Error('LLM agent is not configured. Set CAVOTI_API_KEY in server/.env (see server/.env.example).')
    err.code = AGENT_UNCONFIGURED; err.status = 503; throw err
  }
  return s
}

async function chat(messages, { temperature = 0.2, maxTokens = 1600, model } = {}) {
  const s = requireKey()
  const json = await jsonFetch(`${s.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    timeoutMs: 60000,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CAVOTI_API_KEY}` },
    body: JSON.stringify({ model: model || s.model, messages, temperature, max_tokens: maxTokens }),
  })
  return json.choices?.[0]?.message?.content || ''
}

const SYSTEM = [
  'You are PharmaLab, an educational pharmacology assistant for pharmacists, students, researchers and clinicians.',
  'STRICT EVIDENCE RULES:',
  '1. Base every factual claim ONLY on the provided SOURCES. If sources do not cover something, say "No data available from retrieved sources" — never guess.',
  '2. Cite inline like [SPL:doc-id] for FDA labels, [PMID:12345678] for literature, [RxNorm:1234] for identifiers. Every paragraph must carry at least one citation.',
  '3. Never recommend doses for a real patient; this tool is educational, not clinical decision support.',
  '4. Be concise, use markdown headings/bullets. Plain language but keep correct terminology.',
].join('\n')

// Raw grounded prompt passthrough (used by interaction summary).
export async function askAgentRaw(prompt) {
  const answer = await chat([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: prompt + '\n\nEnd with: "Educational use only — not medical advice."' },
  ], { maxTokens: 1100 })
  return { answer }
}

// RAG question answering: retrieve from openFDA + FAERS + PubMed, then generate.
export async function askAgent(question, { drugHint } = {}) {
  const started = Date.now()
  const sources = []
  const chunks = []

  // 1) Try drug-name retrieval if a hint is given (or extract capital-word guess).
  const drugQuery = drugHint || (question.match(/\b([A-Za-z]{6,})\b/g) || []).find(Boolean)
  const tasks = []
  if (drugQuery) {
    tasks.push((async () => {
      const label = await labelByName(drugQuery).catch(() => null)
      if (!label) return
      const rx = await normalize(drugQuery).catch(() => null)
      sources.push({ type: 'spl', id: label.splId, label: `FDA label: ${label.genericName || drugQuery}`, url: `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(`set_id:"${label.splId}"`)}&limit=1` })
      if (rx.rxcui) sources.push({ type: 'rxnorm', id: rx.rxcui, label: `RxNorm: ${rx.rxnormName}`, url: rx.rxcuiUrl })
      const keep = ['indications_and_usage', 'Drug Interactions', 'Contraindications', 'Warnings', 'Adverse', 'Mechanism', 'Clinical Pharmacology', 'Pharmacokinetics']
      for (const sec of label.sections) {
        if (keep.some((k) => sec.title.toLowerCase().includes(k.toLowerCase()))) {
          chunks.push(`[SPL:${label.splId} · ${sec.title}]\n${sec.text.slice(0, 3000)}`)
        }
      }
      const faers = await topAdverseEvents(label.genericName || drugQuery, 6).catch(() => null)
      if (faers?.results.length) {
        sources.push({ type: 'faers', id: label.genericName || drugQuery, label: `FAERS top reports for ${label.genericName || drugQuery}`, url: `https://openfda.fda.gov/` })
        chunks.push(`[FAERS · reported adverse events, not proof of causality]\n${faers.results.map((r) => `${r.term}: ${r.count}`).join('\n')}`)
      }
    })())
  }
  // 2) Always retrieve PubMed on the question text.
  tasks.push((async () => {
    const found = await pubmed.search(question.slice(0, 180), 6).catch(() => null)
    if (!found?.results.length) return
    for (const r of found.results.slice(0, 2)) {
      const abs = await pubmed.abstract(r.pmid).catch(() => null)
      if (abs?.text) {
        sources.push({ type: 'pmid', id: r.pmid, label: r.title.slice(0, 120), url: r.url })
        chunks.push(`[PMID:${r.pmid} · ${r.title} (${r.journal} ${r.year})]\n${abs.text.slice(0, 2200)}`)
      }
    }
  })())

  await Promise.all(tasks)

  const context = chunks.slice(0, 8).join('\n\n---\n\n') || '(No sources retrieved.)'
  const answer = await chat([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `SOURCES:\n${context}\n\nQUESTION: ${question}\n\nAnswer using ONLY the sources above with inline citations. End with: "Educational use only — not medical advice."` },
  ])
  return { question, answer, sources, retrievedChunks: chunks.length, latencyMs: Date.now() - started }
}

// Summarize top-N abstracts for a topic at a level (layman|student|expert).
export async function summarizeTopic(query, level = 'student') {
  const found = await pubmed.search(query, 8)
  const items = []
  for (const r of (found.results || []).slice(0, 5)) {
    const abs = await pubmed.abstract(r.pmid).catch(() => null)
    if (abs?.text) items.push({ r, text: abs.text })
  }
  const sources = items.map(({ r }) => ({ type: 'pmid', id: r.pmid, label: r.title.slice(0, 120), url: r.url }))
  if (!items.length) return { answer: 'No PubMed abstracts retrieved for this query.', sources, latencyMs: 0 }
  const style = { layman: 'Explain like the reader is a healthy adult with no medical training.', student: 'Write for a pharmacy student: precise, teach the concepts.', expert: 'Write for a clinical researcher: dense, note limitations and study designs.' }[level] || ''
  const answer = await chat([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `${style}\n\nSummarize findings across these abstracts for the topic "${query}". Cite each claim as [PMID:xxxx]. If papers conflict, say so.\n\n` + items.map(({ r, text }) => `[PMID:${r.pmid} · ${r.title}]\n${text.slice(0, 2500)}`).join('\n\n---\n\n') + '\n\nEnd with: "Educational use only — not medical advice."' },
  ])
  return { query, level, answer, sources }
}

// Chart/image analysis via the vision model.
export async function analyzeChart(imageDataUrl, question) {
  const s = requireKey()
  if (!/^data:image\//.test(imageDataUrl)) { const e = new Error('image must be a data: URL'); e.status = 400; throw e }
  const content = [
    { type: 'text', text: `You are analyzing a scientific chart for an educational pharmacology app. ${question || 'Describe what the chart shows; if it is a pharmacokinetic curve, identify Cmax, approximate Tmax, half-life trend, and compare lines if multiple.'}\nBase claims only on what is visible in the image; state uncertainty explicitly. End with: "Educational use only — not medical advice."` },
    { type: 'image_url', image_url: { url: imageDataUrl } },
  ]
  const answer = await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content }], { model: s.visionModel, maxTokens: 1200 })
  return { answer }
}

// AI mechanism-graph generation (structured JSON output).
export async function generateMechanismGraph(drugName, labelMechText) {
  const prompt = `Produce a mechanism-of-action graph for the drug "${drugName}".\n${labelMechText ? `Use this FDA-label-derived mechanism text as the primary source:\n${labelMechText.slice(0, 2500)}` : 'Rely on established pharmacology; keep it standard textbook-level.'}\n\nReturn STRICT JSON only, no prose, matching:\n{"nodes":[{"id":"snake_case","label":"Short name","type":"drug|enzyme|receptor|transporter|ion_channel|molecule|pathway|effect","note":"1-2 sentence explanation"}],"edges":[{"from":"id","to":"id","kind":"inhibits|activates|blocks|produces|leads_to|binds_to","label":"optional short label"}],"summary":"2-3 sentence plain summary"}\nRules: 4-9 nodes, one drug node, chain from drug target to therapeutic effect. No invented facts beyond the source text.`
  const raw = await chat([
    { role: 'system', content: 'You output only valid JSON. No markdown fences.' },
    { role: 'user', content: prompt },
  ], { temperature: 0.1, maxTokens: 1200 })
  const clean = raw.replace(/```json|```/g, '').trim()
  const graph = JSON.parse(clean)
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('Bad graph JSON')
  return graph
}

// Clinical-case coaching across steps.
export async function coachCase(caseData, step, userAnswer, history) {
  const prompt = `You are a pharmacology tutor for a clinical case simulator (EDUCATIONAL ONLY; fictional patient).\nCASE: ${JSON.stringify({ age: caseData.age, sex: caseData.sex, presentation: caseData.presentation, vitals: caseData.vitals, labs: caseData.labs, medications: caseData.medications }).slice(0, 1500)}\nSTEP ${step.index + 1} of ${caseData.steps.length} (${step.prompt}).\nPrior steps: ${JSON.stringify(history || {}).slice(0, 1200)}\nStudent answer to critique: """${userAnswer.slice(0, 1500)}"""\n\nReply with: (1) brief feedback on the student's answer (what's right, what's missing), (2) the key reasoning points expected for this step, (3) one hint toward the next step if applicable. Cite label sections as [SPL:...] only when case citations exist. End with: "Educational use only — not medical advice."`
  const answer = await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], { maxTokens: 1100 })
  return { answer }
}
