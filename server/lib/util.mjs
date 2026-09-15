// server/lib/util.mjs — env loading, fetching with timeout, TTL cache.
// Text/evidence helpers now live in shared/core.js (shared with the standalone client).
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export { htmlToText, extractSnippets, labelUrl, DISCLAIMER, LABEL_SECTIONS } from '../../shared/core.js'

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
