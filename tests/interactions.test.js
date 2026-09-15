// tests/interactions.test.js — pure logic of the DDI pipeline (no network)
import { describe, it, expect } from 'vitest'
import { detectSeverity, nameVariants, crossReferenceMentions, pairSeverity, dedupe } from '../server/lib/interactions.mjs'
import { extractSnippets, htmlToText } from '../server/lib/util.mjs'

describe('detectSeverity', () => {
  it('flags contraindication language as major', () => {
    expect(detectSeverity('Concomitant use with strong CYP3A4 inhibitors is contraindicated.')).toBe('major')
    expect(detectSeverity('...may cause life-threatening rhabdomyolysis')).toBe('major')
    expect(detectSeverity('increased risk of bleeding')).toBe('major')
  })
  it('flags monitoring/caution as moderate', () => {
    expect(detectSeverity('Monitor INR when coadministered; dosage adjustment may be needed.')).toBe('moderate')
  })
  it('recognizes reassuring language as minor', () => {
    expect(detectSeverity('No clinically significant interaction was observed.')).toBe('minor')
  })
  it('returns unknown for unclassifiable text', () => {
    expect(detectSeverity('Take with food.')).toBe('unknown')
    expect(detectSeverity('')).toBe('unknown')
  })
})

describe('htmlToText', () => {
  it('strips tags and decodes entities', () => {
    expect(htmlToText('<li>Take &amp; rest</li> &#8226; ok')).toBe('Take & rest • ok')
  })
})

describe('nameVariants', () => {
  it('merges label + rxnorm names, lower-cased, dropping short tokens', () => {
    const label = { genericName: 'WARFARIN SODIUM', brandNames: ['Coumadin'], activeIngredient: 'warfarin sodium', substanceName: 'WARFARIN' }
    const rx = { rxnormName: 'warfarin', genericNames: ['warfarin sodium'], brandNames: ['Jantoven', 'Marevan'] }
    const v = nameVariants(label, rx)
    expect(v).toContain('coumadin')
    expect(v).toContain('jantoven')
    expect(v).toContain('warfarin sodium')
    expect(v.every((s) => s.length > 3)).toBe(true)
  })
})

describe('extractSnippets', () => {
  const filler = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud. '
  const text = `Warfarin interacts with many agents listed in Table 3. NSAIDs such as ibuprofen increase bleeding risk. ${filler}${filler} A second sentence mentions Ibuprofen again and its effects. Unrelated filler text ends here.`
  it('finds sentences mentioning the term, up to max', () => {
    const snips = extractSnippets(text, ['ibuprofen'], { max: 5 })
    expect(snips.length).toBeGreaterThanOrEqual(2)
    expect(snips.every((s) => /ibuprofen/i.test(s))).toBe(true)
  })
  it('returns empty for missing term or short terms', () => {
    expect(extractSnippets(text, ['zzz'])).toEqual([])
    expect(extractSnippets(text, ['war'])).toEqual([]) // <4 chars skipped
  })
})

describe('crossReferenceMentions', () => {
  const fakeLabel = {
    genericName: 'DrugA',
    sections: [
      { key: 'drug_interactions', title: 'Drug Interactions', text: 'When DRUG-B is coadministered with DrugA, avoid concurrent use due to major bleeding.' },
      { key: 'adverse_reactions', title: 'Adverse Reactions', text: 'This section is not searched for interactions.' },
    ],
  }
  it('only scans interaction-relevant sections and inherits severity', () => {
    const hits = crossReferenceMentions(fakeLabel, ['drug-b'])
    expect(hits.length).toBe(1)
    expect(hits[0].section).toBe('Drug Interactions')
    expect(hits[0].severity).toBe('major')
  })
  it('tolerates missing label', () => {
    expect(crossReferenceMentions(null, ['x'])).toEqual([])
  })
})

describe('pairSeverity + dedupe', () => {
  it('escalates to worst finding', () => {
    expect(pairSeverity([{ severity: 'moderate' }, { severity: 'major' }, { severity: 'minor' }])).toBe('major')
    expect(pairSeverity([])).toBe('none-found')
  })
  it('dedupes near-identical snippets and sorts by severity', () => {
    const out = dedupe([
      { snippet: 'Avoid use with drug B completely.', severity: 'major' },
      { snippet: 'avoid use with drug b completely', severity: 'major' },
      { snippet: 'Monitor therapy when combining.', severity: 'moderate' },
    ])
    expect(out.length).toBe(2)
    expect(out[0].severity).toBe('major')
  })
})
