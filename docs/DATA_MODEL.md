# PharmaLab — Data Model & Architecture

## System architecture (as-built)

```mermaid
flowchart LR
    User["User (browser)"] -->|"REST/JSON"| Server
    subgraph Local["Single Node process (server/index.mjs)"]
        Server["node:http API\n(static SPA in prod)"]
        Cache[("TTL memory cache")]
        Curated[("curated JSON:\nMOA graphs · cases")]
        Log[("logs/prompts.jsonl")]
    end
    Server --> Cache
    Server --> Curated
    Server -->|"RAG prompts"| LLM["Qwen3.8-Flash\n(Cavoti OpenAI-compat API)"]
    Server --> openFDA["openFDA label + event"]
    Server --> RxNorm["RxNorm API (NLM)"]
    Server --> PubMed["PubMed E-utilities"]
    Server --> Log
```

Differences from PRD target architecture: direct upstream queries behind an in-memory TTL
cache instead of Elasticsearch/Redis/Postgres (sufficient for a local educational instance);
DrugBank is optional/absent (openFDA + RxNorm fallback path is what ships).

## ER diagram

```mermaid
erDiagram
    DRUG {
        string rxcui PK "RxNorm (NLM)"
        string spl_set_id "openFDA SPL set"
        string generic_name
        string brand_names "[]"
        string drug_class "curated"
    }
    LABEL_SECTION {
        string spl_set_id FK
        string key "e.g. drug_interactions"
        string title
        text content "html-stripped"
        string effective_time "freshness"
    }
    INTERACTION {
        string drugA_rxcui FK
        string drugB_rxcui FK
        string severity "major|moderate|minor|unknown"
        text snippet "verbatim label sentence"
        string source_spl FK
    }
    MECHANISM_GRAPH {
        string drug_key PK "generic, lower-case"
        string source "curated|ai-generated|label-text"
        json nodes "[{id,label,type,note}]"
        json edges "[{from,to,kind,label}]"
    }
    LIT_REF {
        string pmid PK
        string title
        string journal
        string year
        text abstract "on demand"
    }
    CASE {
        string case_id PK
        int age
        string sex
        text presentation
        json labs "[] {name,value,ref,flag}"
        json medications "[]"
        json steps "[{prompt,hints,modelAnswer,citations[]}]"
    }
    PROMPT_LOG {
        int id PK
        datetime ts
        string endpoint
        text prompt_excerpt
        int sources_cited
        int latency_ms
    }
    DRUG ||--|{ LABEL_SECTION : "documents"
    DRUG ||--o{ INTERACTION : "co-listed_with"
    DRUG ||--|{ MECHANISM_GRAPH : "visualized_by"
    DRUG ||--o{ LIT_REF : "studied_in"
    DRUG }o--o{ CASE : "appears_in"
    PROMPT_LOG ||--o{ LIT_REF : "cites"
    PROMPT_LOG ||--o{ LABEL_SECTION : "cites"
```

## Freshness & compliance notes
* openFDA labels weekly · FAERS quarterly (≈3-month lag, no causality) · RxNorm monthly · PubMed live.
* All AI outputs forced to cite SPL/PMID/RxNorm ids or declare "no data".
* No PHI path exists: cases are static fiction, uploads/logs stay local.
