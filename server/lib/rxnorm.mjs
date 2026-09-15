// server/lib/rxnorm.mjs — NLM RxNorm normalization (name -> RxCUI, synonyms)
import { jsonFetch, cached } from './util.mjs'

const BASE = 'https://rxnav.nlm.nih.gov/REST'
const e = encodeURIComponent

export async function lookupByName(name) {
  const url = `${BASE}/rxcui.json?name=${e(name)}&search=1&form=1`
  return cached(`rxnorm-lookup:${name.toLowerCase()}`, 60 * 60_000, async () => {
    try {
      const json = await jsonFetch(url)
      // RxNorm JSON quirk: array of STRING ids under "rxnormId" (capital D).
      const raw = json.idGroup?.rxnormId ?? json.idGroup?.rxnormid
      const list = Array.isArray(raw) ? raw : raw ? [raw] : []
      if (!list.length) return null
      const first = list[0]
      if (typeof first === 'string') return { rxcui: first, name: '' }
      return { rxcui: first.rxcui || first.rxnormid, name: first.name || '' }
    } catch { return null }
  })
}

export async function properties(rxcui) {
  const url = `${BASE}/rxcui/${e(rxcui)}/properties.json`
  return cached(`rxnorm-props:${rxcui}`, 24 * 60 * 60_000, async () => {
    try {
      const json = await jsonFetch(url)
      return json.properties || null
    } catch { return null }
  })
}

export async function relatedNames(rxcui) {
  const url = `${BASE}/rxcui/${e(rxcui)}/related.json?tty=IN+BN`
  return cached(`rxnorm-rel:${rxcui}`, 24 * 60 * 60_000, async () => {
    try {
      const json = await jsonFetch(url)
      const concepts = json.relatedConcept?.concept || []
      return {
        generic: concepts.filter((c) => c.tty === 'IN').map((c) => c.name),
        brand: concepts.filter((c) => c.tty === 'BN').map((c) => c.name),
      }
    } catch { return { generic: [], brand: [] } }
  })
}

// Full normalization: RxCUI + properties + generic/brand names.
export async function normalize(name) {
  const hit = await lookupByName(name)
  if (!hit) return { query: name, resolved: false }
  const [props, rel] = await Promise.all([properties(hit.rxcui), relatedNames(hit.rxcui)])
  const displayName = props?.name || props?.clinicalDrugName || hit.name || rel.generic[0] || name
  return {
    query: name,
    resolved: true,
    rxcui: hit.rxcui,
    rxnormName: displayName,
    clinicalDrugName: props?.clinicalDrugName || displayName,
    type: props?.recordType,
    genericNames: rel.generic.length ? rel.generic : [displayName],
    brandNames: rel.brand,
    rxcuiUrl: `https://rxnav.nlm.nih.gov/REST/rxcui/${hit.rxcui}/properties.json`,
  }
}
