// tests/standalone.test.js — proves the client direct-data layer works WITHOUT
// the server: the exact code path bundled into the APK. Hits live public APIs.
import { describe, it, expect, beforeAll } from 'vitest'

// localStorage stub so direct.js cache works in node.
beforeAll(() => {
  globalThis.localStorage = {
    _m: new Map(),
    getItem(k) { return this._m.get(k) ?? null },
    setItem(k, v) { this._m.set(k, v) },
    removeItem(k) { this._m.delete(k) },
  }
})

const direct = () => import('../src/lib/direct.js')

describe('standalone data layer (APK code path)', () => {
  it('searchLabels: prefix query "atorva" resolves to atorvastatin labels', async () => {
    const d = await direct()
    const hits = await d.searchLabels('atorva', 5)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].genericName.toLowerCase()).toContain('atorvastatin')
    expect(hits[0].splId).toMatch(/[0-9a-f-]{36}/i)
  }, 30000)

  it('getLabel: full sections + citations', async () => {
    const d = await direct()
    const [first] = await d.searchLabels('warfarin', 1)
    const label = await d.getLabel(first.splId)
    expect(label.sections.length).toBeGreaterThan(3)
    expect(label.sections.some((s) => s.key === 'drug_interactions')).toBe(true)
    expect(label.citations.length).toBeGreaterThan(0)
    expect(label.citations[0].url).toContain('api.fda.gov')
  }, 30000)

  it('normalize: RxNorm gives rxcui + brands', async () => {
    const d = await direct()
    const rx = await d.normalize('lipitor')
    expect(rx.resolved).toBe(true)
    expect(rx.rxcui).toMatch(/^\d+$/)
  }, 30000)

  it('analyzeDrugPairs: warfarin + ibuprofen => major (no server involved)', async () => {
    const d = await direct()
    const out = await d.analyzeDrugPairs(['warfarin', 'ibuprofen'])
    expect(out.pairs.length).toBe(1)
    expect(out.pairs[0].severity).toBe('major')
    expect(out.pairs[0].findings[0].snippet.length).toBeGreaterThan(30)
  }, 60000)

  it('resolveMechanismLocal: alias "advil" -> curated COX graph; unknown drug -> label fallback', async () => {
    const d = await direct()
    const m = await d.resolveMechanismLocal('advil')
    expect(m.source).toBe('curated')
    expect(m.graph.nodes.some((n) => n.id === 'cox2')).toBe(true)
    const c = await d.resolveMechanismLocal('ciprofloxacin')
    expect(c.source).toBe('label-text')
    expect(c.labelSummary.length).toBeGreaterThan(50)
  }, 30000)

  it('pubmedSearch + pubmedAbstract direct from NCBI', async () => {
    const d = await direct()
    const found = await d.pubmedSearch('metformin longevity', 3)
    expect(found.results.length).toBeGreaterThan(0)
    const abs = await d.pubmedAbstract(found.results[0].pmid)
    expect(abs.text.length).toBeGreaterThan(100)
  }, 30000)

  it('curated packs bundled: cases + faers', async () => {
    const d = await direct()
    expect(d.localCases.list().length).toBe(3)
    expect(d.localCases.detail('statin-macrolide').steps.length).toBe(4)
    const fa = await d.topAdverseEvents('metformin', 5)
    expect(fa.results.length).toBeGreaterThan(0)
  }, 30000)

  it('cache: second searchLabels call returns instantly from memory', async () => {
    const d = await direct()
    const t0 = Date.now()
    await d.searchLabels('aspirin', 3)
    const dt1 = Date.now() - t0
    const t1 = Date.now()
    await d.searchLabels('aspirin', 3)
    expect(Date.now() - t1).toBeLessThan(Math.max(dt1, 5))
  }, 30000)
})
