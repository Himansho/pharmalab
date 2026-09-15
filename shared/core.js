// shared/core.js — pure logic used by BOTH the web server and the standalone
// (APK) client. No network, no Node APIs, no DOM — safe everywhere.

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

// openFDA returns HTML fragments in label sections — strip to readable text.
export function htmlToText(html) {
  if (!html) return ''
  return String(html)
    .replace(/<(.+?)>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

// Extract a sentence containing any of the given terms (evidence snippet).
export function extractSnippets(text, terms, { radius = 260, max = 3 } = {}) {
  if (!text || !terms.length) return []
  const out = []
  const lower = text.toLowerCase()
  const seen = new Set()
  for (const term of terms) {
    const t = term.toLowerCase()
    if (t.length < 4) continue
    let idx = lower.indexOf(t)
    while (idx !== -1 && out.length < max) {
      const start = Math.max(0, idx - radius)
      const end = Math.min(text.length, idx + t.length + radius)
      let s = start, e = end
      while (s > 0 && !/[.;:•]/.test(text[s - 1])) s--
      while (e < text.length && !/[.;:•]/.test(text[e])) e++
      const snip = text.slice(s, Math.min(e, text.length)).trim()
      const key = snip.slice(0, 80).toLowerCase()
      if (!seen.has(key)) { seen.add(key); out.push(snip) }
      idx = lower.indexOf(t, idx + t.length)
    }
  }
  return out
}

// ---- interaction severity heuristic -----------------------------------------
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
  return [...set].filter((s) => s.length > 3)
}

const SCANNED_SECTIONS = ['drug_interactions', 'contraindications', 'warnings_and_cautions', 'clinical_pharmacology']

export function crossReferenceMentions(sourceLabel, otherVariants, { max = 4 } = {}) {
  if (!sourceLabel) return []
  const sections = (sourceLabel.sections || []).filter((s) => SCANNED_SECTIONS.includes(s.key))
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

// labelUrl helper (citation-friendly direct openFDA URL for an SPL set id)
export function labelUrl(setId) {
  return `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(`set_id:"${setId}"`)}&limit=1`
}

export const DISCLAIMER = 'PharmaLab is for EDUCATIONAL and research use only. Data are aggregated from public sources (openFDA, RxNorm, PubMed) and may be outdated or incomplete; openFDA explicitly states its data should not be relied on for medical decisions. This app is not a clinical decision tool and does not store patient data.'
