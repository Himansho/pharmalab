// tests/data.test.js — curated knowledge files are internally consistent
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mech = JSON.parse(readFileSync(path.join(__dirname, '../server/data/mechanisms.json'), 'utf8'))
const cases = JSON.parse(readFileSync(path.join(__dirname, '../server/data/cases.json'), 'utf8'))

describe('mechanism graphs', () => {
  it('all edges reference existing node ids', () => {
    for (const [drug, m] of Object.entries(mech)) {
      if (drug === '_meta') continue
      const ids = new Set(m.nodes.map((n) => n.id))
      for (const e of m.edges) {
        expect(ids.has(e.from), `${drug}: edge from ${e.from}`).toBe(true)
        expect(ids.has(e.to), `${drug}: edge to ${e.to}`).toBe(true)
      }
    }
  })
  it('every graph has exactly one drug node and citations', () => {
    for (const [drug, m] of Object.entries(mech)) {
      if (drug === '_meta') continue
      const drugs = m.nodes.filter((n) => n.type === 'drug')
      expect(drugs.length, drug).toBe(1)
      expect(m.citations.length, drug).toBeGreaterThan(0)
      expect(m.summary.length, drug).toBeGreaterThan(30)
    }
  })
  it('node types are within the allowed vocabulary', () => {
    const allowed = new Set(['drug', 'enzyme', 'receptor', 'transporter', 'ion_channel', 'molecule', 'pathway', 'effect'])
    for (const [drug, m] of Object.entries(mech)) {
      if (drug === '_meta') continue
      for (const n of m.nodes) expect(allowed.has(n.type), `${drug}/${n.id}`).toBe(true)
    }
  })
})

describe('clinical cases', () => {
  it('4 steps each, with model answers and citations', () => {
    expect(cases.cases.length).toBeGreaterThanOrEqual(3)
    for (const c of cases.cases) {
      expect(c.steps.length, c.id).toBe(4)
      for (const [i, s] of c.steps.entries()) {
        expect(s.modelAnswer.length, `${c.id} step${i}`).toBeGreaterThan(60)
        expect(s.citations.length, `${c.id} step${i}`).toBeGreaterThan(0)
      }
    }
  })
  it('every case medication is mentioned in its own record (no orphans)', () => {
    for (const c of cases.cases) expect(c.medications.length, c.id).toBeGreaterThan(1)
  })
})
