# PharmaLab API Specification (v1.0)

Base URL: `http://localhost:8787` · all responses JSON · errors: `{ error, code?, disclaimer }`.
Every upstream call is cached in-memory (10 min–24 h per endpoint). AI endpoints return
**503** with `code: "AGENT_UNCONFIGURED"` when no `CAVOTI_API_KEY` is set — clients degrade, never crash.

| Endpoint | Method | Params | Returns |
|---|---|---|---|
| `/api/status` | GET | — | `{app, agent:{configured,model}, features, disclaimer}` |
| `/api/search` | GET | `q`, `limit?` | `{normalization:{rxcui,rxnormName,genericNames,brandNames}, drugs:[{splId,genericName,brandNames,route,…,indicationsExcerpt}]}` |
| `/api/label` | GET | `spl` (SPL set id) | full label: `{genericName, brandNames, sections:[{key,title,text}], citations[], effectiveTime, rxcui[]}` |
| `/api/rxnorm` | GET | `q` | RxNorm normalization + `rxcuiUrl` |
| `/api/mechanism` | GET | `drug` | `{source: curated\|ai-generated\|label-text, graph:{nodes,edges,summary}, citations}` |
| `/api/faers` | GET | `drug`, `n?` | `{results:[{term,count}], note(no causality)}` |
| `/api/interactions` | POST | `{drugs:[…2–6]}` | `{drugs:[{name,rxcui,resolved}], pairs:[{drugA,drugB,severity,findings:[{snippet,section,foundIn,severity,labelUrl}],evidenceNote}], aiSummary?}` |
| `/api/pubmed` | GET | `q`, `max?` | `{count, results:[{pmid,title,journal,year,authors,url}]}` |
| `/api/pubmed/abstract` | GET | `pmid` | `{pmid, text}` |
| `/api/agent/ask` | POST | `{question, drug?}` | RAG answer: `{answer, sources:[{type,id,label,url}], retrievedChunks, latencyMs}` |
| `/api/agent/summarize` | POST | `{query, level: layman\|student\|expert}` | `{answer, sources[PMID]}` (retrieves ≤5 abstracts first) |
| `/api/agent/vision` | POST | `{imageDataUrl, question?}` | `{answer}` chart interpretation |
| `/api/agent/mechanism` | POST | `{drug}` | force AI graph generation |
| `/api/cases` | GET | — | case list (no steps) |
| `/api/cases/detail` | GET | `id` | full case incl. `steps[{prompt,hints,modelAnswer,citations}]`, `teachingPoints` |
| `/api/cases/coach` | POST | `{caseId, stepIndex, userAnswer, history}` | tutor feedback (503 if no key) |

## Upstream mapping
| Function | Upstream |
|---|---|
| search | `api.fda.gov/drug/label.json` (`openfda.generic_name`/`brand_name`, quoted-phrase + bare prefix wildcards) |
| normalization | `rxnav.nlm.nih.gov/REST/rxcui?search=1&form=1`, `/rxcui/{id}/properties`, `/related?tty=IN+BN` |
| literature | `eutils.ncbi.nlm.nih.gov` esearch/esummary/efetch (JSON; `NCBI_API_KEY` optional) |
| adverse events | `api.fda.gov/drug/event.json` `count=patient.reaction.reactionmeddrapt.exact` |
| LLM | Cavoti OpenAI-compatible `POST /chat/completions` (text + `image_url` parts) |

## Severity heuristic (documented limitation)
Keyword rules over matched sentences, in order: contraindication/severe-harm terms → **major**;
monitor/caution terms → **moderate**; negated-reassurance → **minor**; else unknown.
It ranks *label language*, not true clinical risk — UI always surfaces the raw snippet.
