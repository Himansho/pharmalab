// server/lib/util.mjs — env loading, fetching with timeout, TTL cache, text helpers
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load server/.env (if present) into process.env without overwriting real env vars.
export function loadEnv() {
  const p = path.join(__dirname, '..', '.env')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const cache = new Map()
export function cached(key, ttlMs, get) {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value)
  return get().then((value) => {
    cache.set(key, { value, expires: Date.now() + ttlMs })
    if (cache.size > 500) { // naive eviction of oldest
      const oldest = [...cache.entries()].sort((a, b) => a[1].expires - b[1].expires)[0]
      if (oldest) cache.delete(oldest[0])
    }
    return value
  })
}

export async function jsonFetch(url, { timeoutMs = 15000, ...opts } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, ...opts })
    const text = await res.text()
    if (!res.ok) {
      const err = new Error(`Upstream ${res.status} from ${new URL(url).host}`)
      err.status = res.status >= 500 ? 502 : res.status
      err.body = text.slice(0, 500)
      throw err
    }
    try { return JSON.parse(text) }
    catch { const e = new Error('Upstream returned non-JSON'); e.status = 502; throw e }
  } catch (e) {
    if (e.name === 'AbortError') { const err = new Error('Upstream timed out'); err.status = 504; throw err }
    throw e
  } finally { clearTimeout(t) }
}

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
      // snap to sentence boundaries
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
