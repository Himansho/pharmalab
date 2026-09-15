// src/pages/Cases.jsx — clinical case simulator (educational, fictional patients)
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { navigate, useStatus } from '../App.jsx'
import { Citations, DisclaimerBar, ErrorBox, Md, Spinner } from '../ui.jsx'

export default function Cases({ id }) {
  const [list, setList] = useState(null)
  useEffect(() => { api.cases().then((d) => setList(d.cases)).catch(() => setList([])) }, [])

  if (!id) {
    return (
      <section aria-label="Clinical cases">
        <h1>Clinical Case Simulator</h1>
        <p className="muted">Fictional teaching scenarios. Work through the steps yourself, optionally get an AI tutor's feedback, then compare with the model analysis. <strong>All patients are invented — never enter real patient data.</strong></p>
        {!list && <Spinner label="Loading cases…" />}
        <div className="grid two">
          {list?.map((c) => (
            <div className="card" key={c.id}>
              <h2 style={{ marginTop: 0 }}><a href={`#/cases?id=${c.id}`}>{c.title}</a></h2>
              <p className="small muted">{c.persona} · {c.difficulty} · {c.stepsCount} steps</p>
              <p className="small">{c.presentation.split('.').slice(0, 2).join('.')}.</p>
              <button className="btn small" onClick={() => navigate(`/cases?id=${c.id}`)}>Open case →</button>
            </div>
          ))}
        </div>
        {list?.length === 0 && <p className="muted">Could not load the case library (is the API server running?).</p>}
        <DisclaimerBar />
      </section>
    )
  }
  return <CaseDetail id={id} />
}

function CaseDetail({ id }) {
  const [c, setC] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [revealed, setRevealed] = useState({})
  const [coach, setCoach] = useState({ loading: false, out: null, err: null })
  const status = useStatus()

  useEffect(() => { setC(null); setStep(0); setAnswers({}); setRevealed({}); setCoach({ loading: false, out: null, err: null })
    api.caseDetail(id).then(setC).catch(setError) }, [id])

  if (error) return <ErrorBox error={error} />
  if (!c) return <Spinner label="Loading case…" />

  const s = c.steps[step]
  const answered = (answers[step] || '').trim().length > 20

  return (
    <section aria-label="Case detail">
      <p><a href="#/cases">← all cases</a></p>
      <h1>{c.title}</h1>
      <div className="chips" style={{ marginBottom: 8 }}>
        <span className="chip">{c.age} y/o {c.sex}</span><span className="chip">{c.persona}</span><span className="chip">{c.difficulty}</span>
      </div>
      <div className="grid sidebar">
        <aside className="card" style={{ padding: 14, alignSelf: 'start' }} aria-label="Patient data (fictional)">
          <h3 style={{ marginTop: 0 }}>📋 Scenario</h3>
          <p className="small">{c.presentation}</p>
          <h3>Vitals</h3>
          <p className="small">{Object.entries(c.vitals).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
          <h3>Labs</h3>
          <table className="labs-table"><tbody>{c.labs.map((l) => (
            <tr key={l.name}><td>{l.name}</td><td><strong className={l.flag === 'HIGH' || l.flag?.startsWith?.('HIGH') ? 'HIGH' : l.flag === 'LOW' ? 'LOW' : ''}>{l.value}</strong></td><td className="small muted">{l.ref}</td></tr>
          ))}</tbody></table>
          <h3>Medications</h3>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{c.medications.map((m) => <li key={m}>{m}</li>)}</ul>
        </aside>
        <div>
          <div className="card">
            <div className="step-nav" role="tablist" aria-label="Case steps">
              {c.steps.map((_, i) => (
                <button key={i} role="tab" aria-selected={i === step} className={`step-dot ${i === step ? 'active' : ''}`} onClick={() => { setStep(i); setCoach({ loading: false, out: null, err: null }) }} aria-label={`Step ${i + 1}`}>{i + 1}</button>
              ))}
            </div>
            <h2 style={{ marginTop: 4 }}>Step {step + 1} of {c.steps.length}</h2>
            <p><Md text={s.prompt} /></p>
            <label className="small muted" htmlFor="ans">your analysis (type ≥20 chars, then get feedback)</label>
            <textarea id="ans" className="input" value={answers[step] || ''} onChange={(e) => setAnswers({ ...answers, [step]: e.target.value })} placeholder="Write your reasoning…" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button className="btn small secondary" onClick={() => setRevealed({ ...revealed, [step]: !revealed[step] })} aria-expanded={!!revealed[step]}>
                {revealed[step] ? 'Hide model answer' : '📖 Show model answer'}
              </button>
              <button className="btn small" disabled={coach.loading || !answered || !status.agent?.configured} title={!status.agent?.configured ? 'needs CAVOTI_API_KEY' : !answered ? 'write an answer first' : ''}
                onClick={() => {
                  setCoach({ loading: true, out: null, err: null })
                  api.coach({ caseId: c.id, stepIndex: step, userAnswer: answers[step], history: c.steps.slice(0, step).map((p, i) => ({ step: p.prompt, answer: answers[i] || '' })) })
                    .then((o) => setCoach({ loading: false, out: o.answer, err: null }))
                    .catch((e) => setCoach({ loading: false, out: null, err: e }))
                }}>{coach.loading ? 'Tutor thinking…' : '🤖 Ask AI tutor to critique my answer'}</button>
              {step < c.steps.length - 1 && <button className="btn small ghost" onClick={() => setStep(step + 1)}>next step →</button>}
            </div>
            {coach.out && <div style={{ borderTop: '1px solid var(--border)', marginTop: 12 }}><Md text={coach.out} /></div>}
            {coach.err && <ErrorBox error={coach.err} />}
            {!status.agent?.configured && answered && <p className="small muted">AI tutor offline (no key) — compare with the model answer instead; it includes the expected reasoning chain.</p>}
          </div>
          {revealed[step] && (
            <div className="card" aria-live="polite">
              <h3>📖 Model analysis</h3>
              <Md text={s.modelAnswer} />
              <div className="small muted" style={{ marginTop: 8 }}><strong>Hints used:</strong> {s.hints.join(' · ')}</div>
              <Citations items={s.citations} />
            </div>
          )}
          {step === c.steps.length - 1 && revealed[step] && (
            <div className="card"><h3>🎓 Teaching points</h3><Md text={c.teachingPoints.map((t) => `- ${t}`).join('\n')} /></div>
          )}
        </div>
      </div>
      <DisclaimerBar />
    </section>
  )
}
