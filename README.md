# ⚛ PharmaLab — Drug Mechanism & Safety Explorer
**v1.0.0**

Educational/research web app built from the PharmaLab PRD: explore drug actions, interactions
and safety through authoritative data (openFDA, RxNorm, PubMed) plus an AI agent
(Qwen3.8-Flash via Cavoti) using strict retrieval-augmented, citation-first answers.

> **Educational use only — not medical advice.** No patient data is stored. Per FDA guidance,
> do not rely on openFDA for clinical decisions.

## Features

| Feature | How it works | AI needed? |
|---|---|---|
| 🔍 **Drug search** | openFDA label search with prefix autocomplete + RxNorm normalization (brand↔generic, RxCUI) | no |
| 📄 **Label profile** | Structured SPL sections (indications, contraindications, interactions, warnings…) with citations & version date | no |
| ⚛️ **MOA visualizer** | Interactive SVG mechanism diagram (10 curated graphs); click nodes to focus neighborhoods, tooltips, zoom/pan, keyboard-navigable; other drugs: label text fallback or 🤖 AI-generated graph | optional |
| ⚗️ **Interaction simulator** | Every pair cross-referenced inside the *other* drug's label sections; keyword severity heuristic (major/moderate/minor) + matched evidence sentences with source links | optional AI summary |
| 📚 **PubMed engine** | E-utilities esearch/esummary/efetch; on-demand abstracts; 🤖 RAG summary (layman/student/expert) citing [PMID]s | optional |
| 📈 **Chart analysis** | Drag-drop or built-in sample PK chart; 🤖 multimodal reading of Cmax/Tmax/trends | yes |
| 🩺 **Clinical cases** | 3 fictional multi-step cases with labs/vitals, model answers + citations, 🤖 AI tutor critique mode | optional |
| 💬 **Ask agent** | RAG over label + FAERS + PubMed, citation-forced answers, "no data" instead of guessing | yes |
| 🌙 UI | Responsive (mobile-first), dark mode (persisted), WCAG-minded: semantic HTML, ARIA tabs/roles, focus outlines, reduced-motion support, skip link | — |

## Quick start

```bash
npm install
npm run dev        # API :8787 + Vite dev server :5173 (proxies /api)
```
Open http://localhost:5173 — **everything except AI features works immediately.**

### Enable the AI agent (optional)
```bash
cp server/.env.example server/.env   # then fill CAVOTI_API_KEY
```
Restart. Model defaults: `qwen-3.8-flash` @ `https://cavoti.com/v1` (OpenAI-compatible,
including vision). Audit trail of AI calls: `logs/prompts.jsonl`.

### Production-style run
```bash
npm run build && npm start   # serves dist/ + API from :8787
```

### Tests & Docker
```bash
npm test                     # 17 unit tests (vitest): DDI heuristic, snippets, data integrity
docker build -t pharmalab . && docker run -p 8787:8787 --env-file server/.env pharmalab
```

## Regression cases (evaluation harness seed, per PRD §Evaluation)

- `warfarin + ibuprofen` → **major** (bleeding risk co-listed)
- `simvastatin + clarithromycin` → **major** (contraindicated: strong CYP3A4 inhibitor)
- mechanism search `advil` → curated Ibuprofen COX graph
- `ciprofloxacin` (unseen drug) → label-text fallback / AI graph

## Architecture

React SPA → Node (`node:http`, zero runtime deps) → openFDA / RxNorm / PubMed (in-memory TTL cache)
+ curated JSON + Cavoti LLM. Full spec: [docs/API.md](docs/API.md) · ERD + diagrams: [docs/DATA_MODEL.md](docs/DATA_MODEL.md)

## Roadmap beyond this build (PRD stages 2–3)

Postgres/Elasticsearch indexing, DrugBank enrichment, Redis-shared cache, Kubernetes,
Sentry monitoring, CI (GitHub Actions), E2E (Playwright), i18n, pharmacist user testing.
