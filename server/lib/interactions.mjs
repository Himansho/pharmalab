// server/lib/interactions.mjs — server-side DDI orchestration.
// Pure logic lives in shared/core.js (also bundled into the standalone app).
import { labelByName } from './openfda.mjs'
import { normalize } from './rxnorm.mjs'
import { nameVariants, crossReferenceMentions, dedupe, pairSeverity, labelUrl } from '../../shared/core.js'

export { detectSeverity, nameVariants, crossReferenceMentions, dedupe, sevRank, pairSeverity } from '../../shared/core.js'

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
