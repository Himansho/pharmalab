// server/lib/openfda.mjs — FDA label (SPL) + FAERS adverse event queries
import { jsonFetch, cached, htmlToText } from './util.mjs'

const BASE = 'https://api.fda.gov'
const KEY = () => (process.env.OPENFDA_API_KEY ? `&api_key=${encodeURIComponent(process.env.OPENFDA_API_KEY)}` : '')

// Sections to show on the drug profile, in display order.
export const LABEL_SECTIONS = [
  ['indications_and_usage', 'Indications & Usage'],
  ['dosage_and_administration', 'Dosage & Administration'],
  ['contraindications', 'Contraindications'],
  ['warnings_and_cautions', 'Warnings & Cautions'],
  ['drug_interactions', 'Drug Interactions'],
  ['adverse_reactions', 'Adverse Reactions'],
  ['clinical_pharmacology', 'Clinical Pharmacology (Mechanism & PK)'],
  ['mechanism_of_action', 'Mechanism of Action'],
  ['pharmacodynamics', 'Pharmacodynamics'],
  ['pharmacokinetics', 'Pharmacokinetics'],
  ['specific_populations', 'Use in Specific Populations'],
  ['overdosage', 'Overdosage'],
]

const e = encodeURIComponent

// Free-text drug search across labels. Returns normalized hit list.
export async function searchLabels(query, limit = 10) {
  const clean = query.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim()
  const tokens = clean.split(' ')
  // openFDA: quoted wildcards ("atorva*") are rejected and poison the whole query;
  // use bare-token prefix clauses only for single-word queries.
  let expr = `(openfda.generic_name:"${clean}" OR openfda.brand_name:"${clean}")`
  if (tokens.length === 1) expr += ` OR (openfda.generic_name:${clean}* OR openfda.brand_name:${clean}*)`
  const url = `${BASE}/drug/label.json?search=${e(expr)}&limit=${limit}${KEY()}`
  const data = await cached(`label-search:${query.toLowerCase()}:${limit}`, 10 * 60_000, async () => {
    let json
    try { json = await jsonFetch(url) }
    catch (e2) { if (e2.status === 404) return [] /* openFDA uses 404 for "no results" */; throw e2 }
    return (json.results || []).map((r) => ({
      splId: r.set_id,
      genericName: (r.openfda?.generic_name || [])[0] || '',
      brandNames: r.openfda?.brand_name || [],
      manufacturer: (r.openfda?.manufacturer_name || [])[0] || '',
      route: (r.openfda?.route || [])[0] || '',
      dosageForm: (r.openfda?.dosage_form || [])[0] || '',
      productType: r.openfda?.product_type?.[0] || '',
      indicationsExcerpt: htmlToText(r.indications_and_usage).slice(0, 240),
    }))
  })
  return data
}

// Direct openFDA URL for a given SPL set id (citation-friendly).
export function labelUrl(setId) {
  return `${BASE}/drug/label.json?search=${e(`set_id:"${setId}"`)}&limit=1`
}

// Full label record for one SPL document (latest version returned by openFDA).
export async function getLabel(splSetId) {
  const url = `${BASE}/drug/label.json?search=${e(`set_id:"${splSetId}"`)}&limit=1${KEY()}`
  const fetchLabel = async () => {
    const json = await jsonFetch(url)
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
      rxcui: (r.openfda?.rxcui || []),
      isOtc: (r.openfda?.marketing_category || []).some((c) => /OTC/i.test(c)),
      effectiveTime: r.effective_time || '',
      sections,
      citations: [
        { label: `FDA SPL set ${r.set_id} (openFDA label API)`, url: labelUrl(r.set_id) },
        { label: 'DailyMed official label page', url: r.spl_related_url?.[0]?.url?.replace(/\/index\.html$/, '') || `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(r.set_id)}` },
        ...((r.openfda?.rxcui || []).map((id) => ({ label: `RxNorm concept ${id}`, url: `https://rxnav.nlm.nih.gov/REST/rxcui/${id}/properties.json` }))),
      ],
    }
  }
  return cached(`label:${splSetId}`, 60 * 60_000, fetchLabel)
}

// Look up label by drug name (first hit) — used by interactions/mechanism.
export async function labelByName(name) {
  const hits = await searchLabels(name, 3)
  const rx = name.trim().toLowerCase()
  const best = hits.find((h) => (h.genericName || '').toLowerCase() === rx)
    || hits.find((h) => (h.genericName || '').toLowerCase().startsWith(rx))
    || hits[0]
  if (!best) return null
  return getLabel(best.splId)
}

// FAERS: top reported adverse reactions for a drug (generic name).
export async function topAdverseEvents(name, count = 8) {
  const url = `${BASE}/drug/event.json?search=patient.drug.openfda.generic_name:${e(name)}&count=patient.reaction.reactionmeddrapt.exact&limit=${count}${KEY()}`
  return cached(`faers:${name.toLowerCase()}:${count}`, 2 * 60 * 60_000, async () => {
    const json = await jsonFetch(url)
    const results = (json.results || []).map((r) => ({ term: r.term, count: r.count }))
    const total = results.reduce((s, r) => s + r.count, 0)
    return { drug: name, results, totalReportsInTop: total }
  })
}
