// src/App.jsx — shell: hash router, header nav, dark mode, agent-status context
import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api.js'
import Ask from './pages/Ask.jsx'
import Search from './pages/Search.jsx'
import DrugProfile from './pages/DrugProfile.jsx'
import Interactions from './pages/Interactions.jsx'
import Literature from './pages/Literature.jsx'
import Charts from './pages/Charts.jsx'
import Cases from './pages/Cases.jsx'
import About from './pages/About.jsx'

export const StatusCtx = createContext({ agent: { configured: false } })
export const useStatus = () => useContext(StatusCtx)

export function navigate(to) { window.location.hash = to }

const PAGES = [
  ['ask', 'Ask', '💬'],
  ['search', 'Drug Search', '🔍'],
  ['interactions', 'Interactions', '⚗️'],
  ['literature', 'Literature', '📚'],
  ['charts', 'Chart AI', '📈'],
  ['cases', 'Clinical Cases', '🩺'],
  ['about', 'About', 'ℹ️'],
]

function parseHash() {
  const raw = (window.location.hash || '#/ask').replace(/^#\/?/, '')
  const [path, query] = raw.split('?')
  return { path: path || 'ask', params: new URLSearchParams(query || '') }
}

export default function App() {
  const [route, setRoute] = useState(parseHash)
  const [status, setStatus] = useState({ agent: { configured: false } })
  const [theme, setTheme] = useState(() => localStorage.getItem('pharmalab-theme')
    || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))

  useEffect(() => {
    const onHash = () => { setRoute(parseHash()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', onHash)
    api.status().then(setStatus).catch(() => {})
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('pharmalab-theme', theme)
  }, [theme])

  const page = route.path.startsWith('drug/')
    ? <DrugProfile spl={route.path.split('/')[1]} />
    : {
        ask: <Ask />,
        search: <Search q={route.params.get('q') || ''} />,
        profile: <DrugProfile spl={route.params.get('spl')} />,
        interactions: <Interactions preset={route.params.get('drugs')?.split('|')} />,
        literature: <Literature preset={route.params.get('q')} />,
        charts: <Charts />,
        cases: <Cases id={route.path === 'cases' ? null : route.params.get('id')} />,
        about: <About />,
      }[route.path.split('/')[0]] || <Ask />

  return (
    <StatusCtx.Provider value={status}>
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="app-header">
        <div className="bar">
          <a className="logo" href="#/ask" aria-label="PharmaLab home">⚛ PharmaLab <small className="muted">drug mechanism &amp; safety explorer</small></a>
          <nav className="main-nav" aria-label="Main">
            {PAGES.map(([key, label, icon]) => (
              <a key={key} href={`#/${key}`} aria-current={route.path.split('/')[0] === key || (key === 'search' && route.path.startsWith('drug')) ? 'page' : undefined}>
                <span aria-hidden="true">{icon} </span>{label}
              </a>
            ))}
          </nav>
          <div className="header-actions">
            {!status.agent?.configured && <span className="chip" title="Set CAVOTI_API_KEY in server/.env to enable AI features">🤖 AI off</span>}
            <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="container">{page}</main>
      <footer className="app-footer container">
        PharmaLab · educational/research use only · sources: openFDA, RxNorm (NLM), PubMed E-utilities · no patient data stored ·
        {' '}<a href="#/about">disclaimer &amp; architecture</a>
      </footer>
    </StatusCtx.Provider>
  )
}
