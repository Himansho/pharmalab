// src/pages/Charts.jsx — upload PK/PD-style charts for AI vision interpretation
import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useStatus } from '../App.jsx'
import { DisclaimerBar, ErrorBox, Md, Spinner } from '../ui.jsx'

// Draw a textbook two-compartment-looking PK curve (2 dose levels) on canvas,
// export as PNG data URL — a deterministic sample chart for the vision test.
function samplePkChart() {
  const c = document.createElement('canvas')
  c.width = 640; c.height = 400
  const x = c.getContext('2d')
  const W = c.width, H = c.height, L = 60, B = 50, T = 30, R = 20
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H)
  x.strokeStyle = '#333'; x.lineWidth = 1.5
  x.beginPath(); x.moveTo(L, T); x.lineTo(L, H - B); x.lineTo(W - R, H - B); x.stroke()
  x.fillStyle = '#333'; x.font = '13px system-ui'
  x.fillText('Plasma concentration (µg/mL)', 12, T - 10)
  x.fillText('Time (h)', W - 80, H - 20)
  const pk = (t, absorb, elim, scale) => scale * (Math.exp(-elim * t) - Math.exp(-absorb * t)) / (Math.exp(-Math.log(absorb / elim) * (absorb / (absorb - elim))))
  const tmax = (a, e) => Math.log(a / e) / (a - e)
  const plot = (scale, a, e, color, label) => {
    x.strokeStyle = color; x.lineWidth = 2.5; x.beginPath()
    const Tmax = tmax(a, e), Cmax = pk(Tmax, a, e, scale)
    for (let i = 0; i <= 24; i += 0.05) {
      const px = L + (i / 24) * (W - L - R), py = H - B - (pk(i, a, e, scale) / (Cmax * 1.25)) * (H - B - T)
      i === 0 ? x.moveTo(px, Math.min(H - B, Math.max(T, py))) : x.lineTo(px, Math.min(H - B, Math.max(T, py)))
    }
    x.stroke()
    const pxT = L + (Tmax / 24) * (W - L - R), pyC = H - B - (Cmax / (Cmax * 1.25)) * (H - B - T)
    x.fillStyle = color; x.beginPath(); x.arc(pxT, pyC, 4, 0, 7); x.fill()
    x.fillText(label, pxT + 8, pyC - 6)
  }
  plot(60, 1.5, 0.18, '#0f766e', 'Cmax (250 mg) · Tmax ~1.2 h')
  plot(120, 1.5, 0.17, '#7c3aed', 'Cmax (500 mg) · Tmax ~1.2 h')
  return c.toDataURL('image/png')
}

export default function Charts() {
  const [img, setImg] = useState(null)
  const [name, setName] = useState('')
  const [question, setQuestion] = useState('')
  const [out, setOut] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const fileRef = useRef()
  const status = useStatus()

  const loadFile = (file) => {
    if (!file || !file.type.startsWith('image/')) { setErr(new Error('Please drop an image file (PNG/JPEG).')); return }
    const r = new FileReader()
    r.onload = () => { setImg(r.result); setName(file.name); setOut(null); setErr(null) }
    r.readAsDataURL(file)
  }

  function analyze() {
    if (!img) return
    setBusy(true); setErr(null); setOut(null)
    api.vision(img, question).then(setOut).catch(setErr).finally(() => setBusy(false))
  }

  return (
    <section aria-label="Chart analysis">
      <h1>Chart &amp; Image Analysis</h1>
      <p className="muted">Drop a scientific chart (PK curve, glucose time-course, dose–response). The multimodal model describes trends and reads off Cmax / Tmax when visible — a vision capability test.</p>

      <div className="grid two" style={{ alignItems: 'start' }}>
        <div>
          <div
            className={`drop-zone ${over ? 'over' : ''}`}
            role="button" tabIndex={0} aria-label="Upload chart image"
            onClick={() => fileRef.current.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); loadFile(e.dataTransfer.files[0]) }}
          >
            ⬆️ Drag &amp; drop a chart image here, or click to browse
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => loadFile(e.target.files[0])} />
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn small secondary" onClick={() => { setImg(samplePkChart()); setName('sample-pk-chart.png'); setOut(null) }}>🎨 Use built-in sample PK chart</button>
            {img && <button className="btn small ghost" onClick={() => { setImg(null); setName(''); setOut(null) }}>clear</button>}
          </div>
          {img && <p className="small muted">{name}</p>}
        </div>
        <div>
          {img && <img className="preview-img" src={img} alt={`Uploaded chart preview: ${name}`} />}
        </div>
      </div>

      {img && (
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label className="small muted" htmlFor="ch-q">question for the analyst (optional)</label>
            <input id="ch-q" className="input" style={{ marginTop: 4 }} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. compare the two dose curves" />
          </div>
          <button className="btn" onClick={analyze} disabled={busy || !status.agent?.configured} style={{ alignSelf: 'flex-end' }}>
            {busy ? 'Reading the chart…' : '👁 Analyze with Qwen vision'}
          </button>
        </div>
      )}
      {img && !status.agent?.configured && <p className="small muted">Vision model not configured (set <code>CAVOTI_API_KEY</code> in <code>server/.env</code>). Upload &amp; preview work anyway — perfect for manual review.</p>}
      {busy && <p><Spinner label="Image sent to multimodal model…" /></p>}
      <ErrorBox error={err} />
      {out && <div className="card"><h2>Interpretation</h2><Md text={out.answer} /></div>}
      <DisclaimerBar />
    </section>
  )
}
