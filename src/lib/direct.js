// src/lib/direct.js — standalone data layer: the app talks to openFDA / RxNorm /
// PubMed DIRECTLY (all CORS-enabled), with a localStorage-backed TTL cache,
// plus the bundled offline knowledge pack (mechanism graphs + clinical cases).
// The Node server becomes optional (AI features only).
import { htmlToText, extractSnippets, labelUrl, nameVariants, crossReferenceMentions, dedupe, pairSeverity, LABEL_SECTIONS } from '../../shared/core.js'
import mechanisms from '../../shared/data/mechanisms.json'
import casesData from '../../shared/data/cases.json'

const e = encodeURIComponent

// ---- cache (memory → localStorage, 10 MB guard) ------------------------------
const mem = new Map()
const LS_PREFIX = 'pl-cache:'
function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    if (!raw) return null
    const v = JSON.parse(raw)
    return v.expires > Date.now() ? v.value : null
  } catch { return null }
}
function lsPut(key, value) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify({ value, expires: Date.now() + 24 * 3600_000 })) }
  catch { /* quota — memory cache still works */ }
}
function cached(key, ttlMs, get) {
  if (mem.has(key)) {
    const h = mem.get(key)
    if (h.expires > Date.now()) return Promise.resolve(h.value)
  }
  const ls = lsGet(key)
  if (ls) { mem.set(key, { value: ls, expires: Date.now() + ttlMs }); return Promise.resolve(ls) }
  return get().then((value) => {
    mem.set(key, { value, expires: Date.now() + ttlMs })
    if (mem.size > 300) { const k = mem.keys().next().value; mem.delete(k) }
    lsPut(key, value)
    return value
  })
}

async function get(url, { timeoutMs = 20000, text = false } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) {
      const err = new Error(`Source returned ${res.status} (${new URL(url).host})`)
      err.status = res.status; throw err
    }
    return text ? await res.text() : await res.json()
  } catch (e2) {
    if (e2.name === 'AbortError') { const err = new Error('Request timed out — check your connection'); err.status = 504; throw err }
    if (!e2.status) { const err = new Error('Network error — this screen needs internet (drug data is fetched live from FDA/NLM/NCBI)'); err.cause = e2; throw err }
    throw e2
  } finally { clearTimeout(t) }
}

// ---- openFDA -----------------------------------------------------------------
export async function searchLabels(query, limit = 10) {
  const clean = query.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim()
  let expr = `(openfda.generic_name:"${clean}" OR openfda.brand_name:"${clean}")`
  if (!clean.includes(' ')) expr += ` OR (openfda.generic_name:${clean}* OR openfda.brand_name:${clean}*)`
  const url = `https://api.fda.gov/drug/label.json?search=${e(expr)}&limit=${limit}`
  return cached(`fs:${query.toLowerCase()}:${limit}`, 10 * 60_000, async () => {
    let json
    try { json = await get(url) } catch (e2) { if (e2.status === 404) return []; throw e2 }
    return (json.results || []).map((r) => ({
      splId: r.set_id,
      genericName: (r.openfda?.generic_name || [])[0] || '',
      brandNames: r.openfda?.brand_name || [],
      manufacturer: (r.openfda?.manufacturer_name || [])[0] || '',
      route: (r.openfda?.route || [])[0] || '',
      dosageForm: (r.openfda?.dosage_form || [])[0] || '',
      productType: r.openfda?.product_type?.[0] || '',
      isOtc: (r.openfda?.marketing_category || []).some((c) => /OTC/i.test(c)),
      indicationsExcerpt: htmlToText(r.indications_and_usage).slice(0, 240),
    }))
  })
}

export async function getLabel(splSetId) {
  return cached(`fl:${splSetId}`, 24 * 3600_000, async () => {
    const json = await get(`https://api.fda.gov/drug/label.json?search=${e(`set_id:"${splSetId}"`)}&limit=1`)
    const r = (json.results || [])[0]
    if (!r) { const err = new Error('Label not found'); err.status = 404; throw err }
    const sections = []
    for (const [key, title] of LABEL_SECTIONS) {
      if (r[key]) sections.push({ key, title, text: htmlToText(Array.isArray(r[key]) ? r[key].join(' ') : r[key]) })
    }
    const generic = (r.openfda?.generic_name || [])[0] || ''
    const brands = r.openfda?.brand_name || []
    return {
      splId: r.set_id,
      documentTitle: generic ? `${generic}${brands[0] ? ` (${brands[0]})` : ''} — FDA label` : '',
      genericName: generic,
      brandNames: brands,
      manufacturer: (r.openfda?.manufacturer_name || [])[0] || '',
      route: (r.openfda?.route || [])[0] || '',
      dosageForm: (r.openfda?.dosage_form || [])[0] || '',
      activeIngredient: (r.openfda?.active_ingredient || []).join('; '),
      substanceName: (r.openfda?.substance_name || [])[0] || '',
      rxcui: r.openfda?.rxcui || [],
      isOtc: (r.openfda?.marketing_category || []).some((c) => /OTC/i.test(c)),
      effectiveTime: r.effective_time || '',
      sections,
      citations: [
        { label: `FDA SPL set ${r.set_id.slice(0, 8)}… (openFDA)`, url: labelUrl(r.set_id) },
        { label: 'DailyMed official label page', url: r.spl_related_url?.[0]?.url?.replace(/\/index\.html$/, '') || `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${e(r.set_id)}` },
        ...((r.openfda?.rxcui || []).map((id) => ({ label: `RxNorm concept ${id}`, url: `https://rxnav.nlm.nih.gov/REST/rxcui/${id}/properties.json` }))),
      ],
    }
  })
}

export async function labelByName(name) {
  const hits = await searchLabels(name, 3).catch(() => [])
  const rx = name.trim().toLowerCase()
  const best = hits.find((h) => (h.genericName || '').toLowerCase() === rx)
    || hits.find((h) => (h.genericName || '').toLowerCase().startsWith(rx))
    || hits[0]
  if (!best) return null
  return getLabel(best.splId).catch(() => null)
}

export async function topAdverseEvents(name, count = 8) {
  return cached(`fe:${name.toLowerCase()}:${count}`, 2 * 24 * 3600_000, async () => {
    let json
    try { json = await get(`https://api.fda.gov/drug/event.json?search=${e(`patient.drug.openfda.generic_name:"${name}"`)}&count=patient.reaction.reactionmeddrapt.exact&limit=${count}`) }
    catch (e2) { if (e2.status === 404) return { drug: name, results: [], note: 'no reports for this exact name' }; throw e2 }
    return { drug: name, results: (json.results || []).map((r) => ({ term: r.term, count: r.count })), totalReportsInTop: 0 }
  })
}

// ---- RxNorm ------------------------------------------------------------------
export async function normalize(name) {
  return cached(`rx:${name.toLowerCase()}`, 24 * 3600_000, async () => {
    let idGroup
    try {
      const j = await get(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${e(name)}&search=1&form=1`)
      idGroup = j.idGroup
    } catch { idGroup = null }
    // RxNorm JSON quirk: array of STRING ids under "rxnormId" (capital D).
    const raw = idGroup?.rxnormId ?? idGroup?.rxnormid
    const list = Array.isArray(raw) ? raw : raw ? [raw] : []
    if (!list.length) return { query: name, resolved: false }
    const first = list[0]
    const hit = { rxcui: String(typeof first === 'string' ? first : (first.rxcui || first.rxnormid)), name: typeof first === 'object' ? (first.name || '') : '' }
    const [props, rel] = await Promise.all([
      get(`https://rxnav.nlm.nih.gov/REST/rxcui/${hit.rxcui}/properties.json`).then((j) => j.properties).catch(() => null),
      get(`https://rxnav.nlm.nih.gov/REST/rxcui/${hit.rxcui}/related.json?tty=IN+BN`).then((j) => (j.relatedConcept?.concept || [])).catch(() => []),
    ])
    const displayName = props?.name || props?.clinicalDrugName || hit.name || rel.filter((c) => c.tty === 'IN')[0]?.name || name
    return {
      query: name, resolved: true, rxcui: hit.rxcui, rxnormName: displayName,
      clinicalDrugName: props?.clinicalDrugName || displayName,
      genericNames: rel.filter((c) => c.tty === 'IN').map((c) => c.name).concat(displayName),
      brandNames: rel.filter((c) => c.tty === 'BN').map((c) => c.name),
      rxcuiUrl: `https://rxnav.nlm.nih.gov/REST/rxcui/${hit.rxcui}/properties.json`,
    }
  })
}

// ---- PubMed ------------------------------------------------------------------
export async function pubmedSearch(query, max = 12) {
  const es = await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${e(query)}&retmode=json&retmax=${max}&sort=relevance`)
  const ids = es.esearchresult?.idlist || []
  if (!ids.length) return { query, count: Number(es.esearchresult?.count || 0), results: [] }
  const sum = await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`)
  const results = ids.map((id) => {
    const r = sum.result?.[id]
    if (!r) return null
    return {
      pmid: id, title: r.title || '(untitled)', journal: r.fulljournalname || r.source || '',
      year: (r.pubdate || '').slice(0, 4), authors: (r.authors || []).slice(0, 6).map((a) => a.name),
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    }
  }).filter(Boolean)
  return { query, count: Number(es.esearchresult?.count || results.length), results }
}

export async function pubmedAbstract(pmid) {
  return cached(`ab:${pmid}`, 24 * 3600_000, async () => {
    const text = await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${e(pmid)}&rettype=abstract&retmode=text`, { text: true })
    return { pmid, text }
  })
}

// ---- interactions (client-side pipeline) --------------------------------------
export async function analyzeDrugPairs(drugNames) {
  const unique = [...new Set(drugNames.map((d) => d.trim().toLowerCase()).filter(Boolean))]
  if (unique.length < 2 || unique.length > 6) { const err = new Error('Enter 2 to 6 distinct drug names'); err.status = 400; throw err }
  const resolved = await Promise.all(unique.map(async (name) => {
    const [label, rx] = await Promise.all([labelByName(name).catch(() => null), normalize(name).catch(() => ({ resolved: false }))])
    return { name, label, rxnorm: rx, variants: nameVariants(label, rx) }
  }))
  const pairs = []
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i], b = resolved[j]
      const urlFor = (lbl) => (lbl ? labelUrl(lbl.splId) : null)
      const fromA = crossReferenceMentions(a.label, b.variants).map((f) => ({ ...f, foundIn: `${a.label?.genericName || a.name} label`, labelUrl: urlFor(a.label), splId: a.label?.splId || null }))
      const fromB = crossReferenceMentions(b.label, a.variants).map((f) => ({ ...f, foundIn: `${b.label?.genericName || b.name} label`, labelUrl: urlFor(b.label), splId: b.label?.splId || null }))
      const findings = dedupe([...fromA, ...fromB])
      pairs.push({
        drugA: { name: a.name, rxcui: a.rxnorm.rxcui || null, generic: a.label?.genericName || a.rxnorm.rxnormName || a.name, brands: (a.label?.brandNames || []).slice(0, 4) },
        drugB: { name: b.name, rxcui: b.rxnorm.rxcui || null, generic: b.label?.genericName || b.rxnorm.rxnormName || b.name, brands: (b.label?.brandNames || []).slice(0, 4) },
        severity: pairSeverity(findings),
        findings,
        evidenceNote: findings.length
          ? 'Matched sentences from FDA label sections (Drug Interactions, Contraindications, Warnings).'
          : 'No direct co-mention found in the fetched FDA labels. Absence of a label mention does NOT mean the combination is safe.',
      })
    }
  }
  return { drugs: resolved.map((r) => ({ name: r.name, rxcui: r.rxnorm.rxcui || null, resolved: !!r.label })), pairs }
}

// ---- offline knowledge pack ----------------------------------------------------
const aliasIndex = new Map()
for (const [key, m] of Object.entries(mechanisms)) {
  if (key === '_meta') continue
  aliasIndex.set(key, key)
  for (const a of m.aliases || []) aliasIndex.set(a.toLowerCase().trim(), key)
}

export async function resolveMechanismLocal(drug) {
  const q = drug.toLowerCase().trim()
  const curated = mechanisms[aliasIndex.get(q)]
  if (curated) return { drug, source: 'curated', graph: curated }
  const label = await labelByName(q).catch(() => null)
  const mechSec = label?.sections.find((s) => ['mechanism_of_action', 'clinical_pharmacology'].includes(s.key))
  return {
    drug,
    source: 'label-text',
    labelSummary: mechSec?.text.slice(0, 1500) || '',
    citations: (label?.citations || []).slice(0, 3),
  }
}

export function curatedDrugList() {
  return [...aliasIndex.keys()].sort()
}

export const localCases = {
  list: () => casesData.cases.map(({ steps, ...c }) => ({ ...c, stepsCount: steps.length })),
  detail: (id) => casesData.cases.find((x) => x.id === id) || null,
}
