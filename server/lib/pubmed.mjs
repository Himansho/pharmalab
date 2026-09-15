// server/lib/pubmed.mjs — NCBI Entrez E-utilities (esearch / esummary / efetch)
import { jsonFetch, cached } from './util.mjs'

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const keyQ = () => (process.env.NCBI_API_KEY ? `&api_key=${encodeURIComponent(process.env.NCBI_API_KEY)}` : '')
const e = encodeURIComponent

export async function search(query, max = 12) {
  const esUrl = `${BASE}/esearch.fcgi?db=pubmed&term=${e(query)}&retmode=json&retmax=${max}&sort=relevance${keyQ()}`
  const json = await cached(`pm-esearch:${query.toLowerCase()}:${max}`, 30 * 60_000, () => jsonFetch(esUrl))
  const ids = json.esearchresult?.idlist || []
  if (!ids.length) return { query, count: Number(json.esearchresult?.count || 0), results: [] }
  const sumUrl = `${BASE}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json${keyQ()}`
  const sum = await cached(`pm-esummary:${ids.join(',')}`, 24 * 60 * 60_000, () => jsonFetch(sumUrl))
  const results = ids.map((id) => {
    const r = sum.result?.[id]
    if (!r) return null
    return {
      pmid: id,
      title: r.title || '(untitled)',
      journal: r.fulljournalname || r.source || '',
      year: (r.pubdate || '').slice(0, 4),
      authors: (r.authors || []).slice(0, 6).map((a) => a.name),
      articleTypes: r.pubtype || [],
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    }
  }).filter(Boolean)
  return { query, count: Number(json.esearchresult?.count || results.length), results }
}

export async function abstract(pmid) {
  const url = `${BASE}/efetch.fcgi?db=pubmed&id=${e(pmid)}&rettype=abstract&retmode=text${keyQ()}`
  return cached(`pm-abs:${pmid}`, 24 * 60 * 60_000, async () => {
    const res = await fetch(url)
    if (!res.ok) { const err = new Error(`PubMed efetch failed (${res.status})`); err.status = 502; throw err }
    return { pmid, text: await res.text() }
  })
}
