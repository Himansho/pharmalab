// server/lib/interactions.mjs — DDI pipeline:
// RxNorm-normalized inputs -> openFDA label sections -> cross-reference mentions.
// Pure scoring/extraction functions are exported separately for unit tests.
import { labelByName } from './openfda.mjs'
import { normalize } from './rxnorm.mjs'
import { extractSnippets } from './util.mjs'

// Severity keyword rules (checked in order; first match wins).
const SEVERITY_RULES = [
  { severity: 'major', terms: ['contraindicated', 'contraindication', 'concomitant use of', 'should not be coadministered', 'not be administered with', 'avoid concurrent', 'avoid use with', 'life-threatening', 'fatal', 'rhabdomyolysis', 'bleeding', 'serotonin syndrome', 'QT prolongation', 'discontinue'] },
  { severity: 'moderate', terms: ['monitor', 'caution', 'increased risk', 'potentiat', 'enhanced', 'additive', 'prolong', 'reduce the dose', 'dosage adjustment', 'clinically significant'] },
  { severity: 'minor', terms: ['no interaction', 'not clinically', 'no clinically', 'well tolerated', 'pharmacokinetic interaction was not'] },
]

// Negated reassurance must beat the "clinically significant" moderate term.
const NEGATED_REASSURANCE = /not\s+clinically\s+significant|no\s+clinically\s+significant|no\s+interaction|interaction\s+was\s+not|was\s+not\s+observed/i

export function detectSeverity(text) {
  if (!text) return 'unknown'
  const lower = String(text).toLowerCase()
  if (NEGATED_REASSURANCE.test(lower)) return 'minor'
  for (const rule of SEVERITY_RULES) {
    if (rule.terms.some((t) => lower.includes(t))) return rule.severity
  }
  return 'unknown'
}

// All name variants for a drug (lower-cased), from label + RxNorm.
export function nameVariants(label, rxnorm) {
  const set = new Set()
  const add = (s) => { if (s && String(s).trim()) set.add(String(s).toLowerCase().trim()) }
  if (label) {
    add(label.genericName); add(label.substanceName)
    ;(label.brandNames || []).forEach(add)
    ;(label.activeIngredient || '').split(';').forEach(add)
  }
  if (rxnorm) {
    add(rxnorm.rxnormName)
    ;(rxnorm.genericNames || []).forEach(add)
    ;(rxnorm.brandNames || []).forEach(add)
  }
  // Filter overly-generic single words
  return [...set].filter((s) => s.length > 3)
}

// Given drug B's name variants, find sentences in drug A's relevant sections
// that mention B (the "co-listed drugs or risk phrases" pipeline from the PRD).
export function crossReferenceMentions(sourceLabel, otherVariants, { max = 4 } = {}) {
  if (!sourceLabel) return []
  const sections = (sourceLabel.sections || []).filter((s) =>
    ['drug_interactions', 'contraindications', 'warnings_and_cautions', 'clinical_pharmacology'].includes(s.key))
  const findings = []
  for (const sec of sections) {
    const snippets = extractSnippets(sec.text, otherVariants, { max })
    for (const snip of snippets) {
      findings.push({
        section: sec.title,
        sectionKey: sec.key,
        snippet: snip,
        severity: detectSeverity(snip),
      })
    }
  }
  return dedupe(findings)
}

export function dedupe(findings) {
  const seen = new Set()
  const out = []
  for (const f of findings) {
    const key = f.snippet.slice(0, 120).toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!seen.has(key)) { seen.add(key); out.push(f) }
  }
  return out.sort((a, b) => sevRank(a.severity) - sevRank(b.severity))
}

export function sevRank(s) {
  return { major: 0, moderate: 1, unknown: 2, minor: 3 }[s] ?? 2
}

const RISK_ORDER = ['major', 'moderate', 'unknown', 'minor']
export function pairSeverity(findings) {
  if (!findings.length) return 'none-found'
  return RISK_ORDER.find((r) => findings.some((f) => f.severity === r)) || 'unknown'
}

// Orchestration: analyze every unordered pair among the given drug names.
export async function analyzePairs(drugNames) {
  const unique = [...new Set(drugNames.map((d) => d.trim().toLowerCase()).filter(Boolean))]
  if (unique.length < 2 || unique.length > 6) {
    const err = new Error('Provide 2 to 6 distinct drug names'); err.status = 400; throw err
  }
  const resolved = await Promise.all(unique.map(async (name) => {
    const [label, rxnorm] = await Promise.all([labelByName(name).catch(() => null), normalize(name)])
    return { name, label, rxnorm, variants: nameVariants(label, rxnorm) }
  }))

  const pairs = []
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i], b = resolved[j]
      const urlFor = (lbl) => (lbl ? `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(`set_id:"${lbl.splId}"`)}&limit=1` : null)
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
