# SPECTRA — Market Intelligence Platform
## System Documentation

---

## 1. Overview

**SPECTRA** is a production-grade AI-powered market intelligence platform that combines classical NLP, deep learning, and large language models to deliver consultancy-quality research outputs.

The platform is built around two pillars:

- **8 Specialized AI Agents** — each focused on a distinct analytical task (market research, compliance, persona generation, etc.)
- **4 Enterprise Feature Modules** — higher-order capabilities (RAG knowledge base, due diligence analysis, report generation, predictive risk monitoring)

All NLP processing runs locally using a multi-model ensemble. LLM synthesis is handled via a local Ollama `llama3` instance, ensuring data privacy and zero cloud inference costs.

---

## 2. Architecture

### High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      React Frontend (Vite)                   │
│   ┌──────────┐  ┌─────────────┐  ┌────────────────────────┐ │
│   │  Agent   │  │  Enterprise │  │  Dashboard / Charts /  │ │
│   │   Pages  │  │   Modules   │  │  Knowledge Graph View  │ │
│   └────┬─────┘  └──────┬──────┘  └────────────────────────┘ │
│        │   Axios API Client (baseURL: /api, 999s timeout)    │
└────────┼───────────────┼─────────────────────────────────────┘
         │               │
         ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│               FastAPI Application (Uvicorn)                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Lifespan Hook — pre-loads models at startup:        │   │
│  │  spaCy · sentence-transformers · DeBERTa sentiment  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│   /api/spectra    →  agents/spectra.py      │
│   /api/doc-compare        →  agents/doc_comparator.py       │
│   /api/knowledge-graph    →  agents/knowledge_graph.py      │
│   /api/review-analysis    →  agents/review_analysis.py      │
│   /api/trend-spotting     →  agents/trend_spotting.py       │
│   /api/brand-association  →  agents/brand_association.py    │
│   /api/persona-generator  →  agents/persona_generator.py   │
│   /api/compliance-check   →  agents/compilance_checker.py  │
│   /api/rag/*              →  agents/rag_engine.py           │
│   /api/diligence/*        →  agents/diligence_agent.py      │
│   /api/report/*           →  agents/report_generator.py    │
│   /api/risk/*             →  agents/risk_agent.py           │
└────────────┬────────────────────────┬───────────────────────┘
             │                        │
             ▼                        ▼
┌────────────────────────┐  ┌─────────────────────────────────┐
│    nlp_engine.py        │  │         llm_client.py           │
│  (Core NLP/ML Layer)   │  │   (Async Ollama HTTP Client)    │
│                        │  │                                 │
│  · spaCy 3.7 pipeline  │  │   Model: llama3:latest          │
│  · FLAIR NER           │  │   Base:  localhost:11434        │
│  · sentence-xformers   │  │   Temp:  0.3 (factual)         │
│  · DeBERTa-v3 NLI      │  │   Retry: 2× on timeout         │
│  · Gensim LDA/Word2Vec │  │   Chat + generate endpoints    │
│  · FAISS + BM25        │  └─────────────────────────────────┘
│  · scikit-learn        │
└────────────┬───────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────┐
│                      scraper.py                             │
│                                                            │
│   Playwright (browser automation, UA rotation)             │
│   Reddit JSON API (subreddit search + comments)            │
│   Exa.ai (optional neural semantic search)                 │
│   BeautifulSoup4 (HTML parsing + noise removal)            │
└────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

| Decision | Rationale |
|---|---|
| Local Ollama (llama3) | Zero data egress, offline inference, no API cost |
| Hybrid FAISS + BM25 retrieval | Dense semantic recall + exact keyword precision combined |
| Multi-model NLP ensemble | spaCy + FLAIR NER produces higher entity recall than either alone |
| Pydantic v2 schemas | Strict typed validation on all request/response boundaries |
| Pre-load models at startup | Eliminates cold-start latency on first request |
| Adaptive batch sizing | Prevents OOM on small/large corpora without code changes |

---

## 3. Agent / Module Breakdown

### 3.1 — 8 Core AI Agents

#### Agent 1 · Spectra (`spectra.py`)

**Purpose:** End-to-end market intelligence synthesis from live web and Reddit data.

**Pipeline:**
1. Build corpus via `scraper.build_corpus()` (Reddit + optional Exa.ai web search)
2. Chunk into 120-word overlapping windows (20-word stride)
3. Build hybrid FAISS + BM25 RAG index over chunks
4. Run NER ensemble (FLAIR + spaCy) → filter junk entities → deduplicate → rank by frequency
5. Batch DL sentiment classification (DeBERTa-v3) on all sentences
6. K-Means clustering (3–5 clusters) on sentence-transformer embeddings
7. Build 2D positioning map (sentiment × mention frequency scatter)
8. Extractive QA via dense passage retrieval
9. LLM synthesis (Ollama) with McKinsey-style prompt + RAG-grounded evidence

**Output:** Executive summary, entity rankings, sentiment distribution, strategic insights, competitor positioning map, theme clusters, trend bars, Q&A results.

---

#### Agent 2 · Doc Comparator (`doc_comparator.py`)

**Purpose:** Feature gap analysis between two documents (e.g., product specs, privacy policies, technical docs).

**Key Innovation:** Paraphrase-equivalent feature matching — identifies semantically identical features expressed with different vocabulary (e.g., "data deletion" ↔ "right to erasure") using dense cosine similarity (≥0.92 threshold).

**Pipeline:**
1. Extract features from each doc: spaCy noun chunks + FLAIR NER + verb phrases
2. Deduplicate with dense cosine similarity
3. Match features across docs using dense similarity (not just exact string diff)
4. Run TF-IDF + morphological analysis for vocabulary richness comparison
5. LED abstractive summarization for each doc
6. DeBERTa zero-shot classification for pros/cons extraction
7. LLM verdict with specific evidence passages injected

**Output:** Shared features, unique gaps per doc, similarity score, pros/cons, vocabulary analysis.

---

#### Agent 3 · Knowledge Graph (`knowledge_graph.py`)

**Purpose:** Automatically constructs entity-relation graphs from unstructured text.

**Pipeline:**
1. Node extraction: NER ensemble (FLAIR + spaCy) + noun chunks + TF-IDF keyphrases
2. Node weighting: entity frequency × type confidence × centrality score
3. Edge construction: per-sentence dependency parse → map dependency labels to semantic relations
   - `nsubj` → `SUBJECT_OF`, `dobj` → `OBJECT_OF`, `attr` → `IS_A`, etc.
4. Edge weighting: semantic similarity + co-occurrence count + dependency strength
5. Community detection via connected component analysis + betweenness centrality

**Output:** Typed nodes (PERSON, ORG, CONCEPT, etc.), labelled directed edges, cluster groups.

---

#### Agent 4 · Review Analysis (`review_analysis.py`)

**Purpose:** Deep analysis of product reviews — sentiment, aspects, themes, and contradictions.

**Pipeline:**
1. Batch DL sentiment per review (DeBERTa-v3, POSITIVE/NEGATIVE/NEUTRAL + confidence)
2. Aspect extraction: custom NER lexicons (hardware components, AI/ML field terms) + rule-based
3. Aspect-level sentiment: opinion targets from dependency parse
4. Dense embedding K-Means clustering on review texts (3–5 clusters)
5. N-gram phrase mining (bigrams/trigrams by TF frequency)
6. Contradiction detection: aspects with simultaneously high positive AND negative sentiment

**Output:** Overall sentiment, per-aspect scores, top positive/negative phrases, embedding clusters, contradictions list.

---

#### Agent 5 · Trend Spotting (`trend_spotting.py`)

**Purpose:** Temporal topic modeling and trend detection across a corpus.

**Pipeline:**
1. LDA topic modeling (Gensim, 5–15 topics) with coherence scoring
2. N-gram analysis: unigrams to 5-grams by TF frequency
3. Temporal bucketing: divide corpus by timestamp (monthly or equal thirds)
4. Per-period centroid computation (sentence-transformer embeddings)
5. Cosine distance between period centroids → drift score
6. Anomaly detection: terms with sudden appearance or disappearance between periods

**Output:** Topic distributions with coherence, trending n-grams, temporal drift scores, topic evolution per period, anomaly events.

---

#### Agent 6 · Brand Association (`brand_association.py`)

**Purpose:** Maps semantic associations, competitive landscape, and thematic roles for a target brand.

**Pipeline:**
1. FAISS hybrid retrieval to locate brand-mention context passages
2. Dense embedding ranking of context words (association_strength = frequency × semantic_similarity)
3. Harmonic mean scoring: combines raw co-occurrence count + dense relevance
4. Competitor analysis: per-rival brand RAG + TF-IDF top terms
5. Thematic role extraction: Agent/Theme/Instrument labeling from dependency parse
6. Batch DL sentiment on brand-mention sentences

**Output:** Semantic map (words ranked by combined score), thematic roles, competitor comparison, TF-IDF VSM top terms.

---

#### Agent 7 · Persona Generator (`persona_generator.py`)

**Purpose:** Derives rich user personas from unstructured text (reviews, forum posts, feedback).

**Pipeline:**
1. Encode all texts with sentence-transformers (all-MiniLM-L6-v2)
2. K-Means clustering into N personas (configurable)
3. Per-cluster: RAG retrieval of goal/pain-point sentences
4. Psychographic inference via DL sentiment on retrieved passages
5. Style profiling: POS tagging + morphology → formality score, sentence length, vocabulary richness
6. Archetype matching: cosine similarity to 6 predefined archetypes
7. LLM synthesis: structured persona with demographics, psychographics, quote

**Archetype Inventory:** Early Adopter · Pragmatic Professional · Price-Sensitive Shopper · Power User · Casual Explorer · Skeptical Analyst

**Output:** Structured personas (name, archetype, demographics, psychographics, pain points, goals, language style, representative quote).

---

#### Agent 8 · Compliance Checker (`compilance_checker.py`)

**Purpose:** Automated GDPR/HIPAA/CCPA compliance scanning with article-level citations.

**Law Corpus:**
- GDPR: Articles 1–99 (chunked by article from CSV)
- HIPAA: 45 CFR §164.x safeguard rules (case-law + hard-coded regulations)

**Pipeline:**
1. Chunk input document into 120-word overlapping windows
2. Hybrid BM25 (sparse) + FAISS (dense) retrieval over law corpus per chunk
3. DeBERTa-v3 NLI zero-shot: score entailment between document chunk and each retrieved law
4. Deduplicate retrieved laws by article number
5. Risk scoring: CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1 → aggregate 0–100 score
6. NER on document for legal entities (ORG, PERSON, LOC)

**Output:** Overall risk level, risk score, issues (with article citations, severity, evidence, explanation, suggestion, confidence), compliant sections.

---

### 3.2 — 4 Enterprise Feature Modules

#### Module 1 · Knowledge RAG (`rag_engine.py`)

**Purpose:** Enterprise knowledge base — ingest documents, query with natural language, get cited answers.

**Architecture:**
- **Encoder:** sentence-transformers all-MiniLM-L6-v2 (384-dim)
- **Index:** FAISS `IndexFlatIP` (inner product = cosine with normalized vectors)
- **Persistence:** FAISS binary + metadata JSON on disk (`rag_data/`)
- **Chunking:** 120-word windows with 20-word overlap
- **Query flow:** embed query → FAISS top-k → inject retrieved chunks → Ollama answer with source citations
- **Session memory:** per-session chat history (in-memory dict)

**Input sources:** Raw text, PDF/TXT file upload
**Output:** Cited answer + retrieved source passages + index statistics

---

#### Module 2 · Due Diligence (`diligence_agent.py`)

**Purpose:** Automated M&A document analysis — risk identification, financial extraction, investment verdict.

**Pipeline:**
1. PDF ingestion: PyMuPDF → pdfplumber → pytesseract OCR (cascading fallback)
2. Text chunking: 500–800 token windows
3. Financial entity extraction: regex patterns (revenue, debt, liabilities, costs, valuations)
4. Legal NER: spaCy ORG + NORP entities filtered for legal relevance
5. RAG-grounded LLM analysis: retrieved context injected into structured JSON prompt
6. Risk deduplication: Jaccard similarity merging
7. Severity ranking: CRITICAL > HIGH > MEDIUM > LOW
8. Confidence scoring (0.1–1.0, minimum floor 0.30)

**Output:** Executive summary, financial highlights, ranked risk list, verdict (Proceed/Caution/Decline), worst-case scenario narrative.

---

#### Module 3 · Report Generator (`report_generator.py`)

**Purpose:** Transforms raw data, metrics, and bullet points into structured consulting reports.

**Supported Input Formats:**
- `key: value` / `key = value` → extracted as KPIs
- `- bullet` / `* bullet` → formatted bullets
- `Insight | Impact | Priority` → structured priority table
- `metric, value` CSV → metrics table
- Plain prose → executive narrative

**Pipeline:**
1. Parse and normalize diverse input formats
2. Structure into LLM-ready prompt segments
3. Ollama generation with McKinsey-style system prompt
4. Chart recommendations extracted from LLM output
5. Structured data output for frontend rendering

**Output:** Full report narrative, structured input normalization, suggested visualizations, chart data objects, KPI summary.

---

#### Module 4 · Risk Monitor (`risk_agent.py`)

**Purpose:** Live risk intelligence — monitors news feeds for business-critical risk events.

**Architecture:**
- **News ingestion:** Async RSS parsing (BBC, CNN, Reuters, Financial Times)
- **Classification:** Keyword taxonomy matching → LLM event classification
- **Supply chain graph:** NetworkX (nodes = supply chain entities, edges = impact paths)

**Risk Categories and Keywords:**

| Category | Keywords |
|---|---|
| Supply Chain | shortage, logistics, shipping delay, inventory, disruption |
| Geopolitical | sanctions, tariff, embargo, trade war, conflict |
| Financial | recession, inflation, default, bankruptcy, credit crunch |
| Natural Disaster | earthquake, flood, hurricane, wildfire, drought |
| Cyber | breach, ransomware, cyberattack, vulnerability, data leak |

**Output:** Detected risk events (with severity), supply chain impact graph, LLM impact analysis, mitigation recommendations, overall risk level.

---

## 4. End-to-End Pipeline Flow

### Standard Agent Request Cycle

```
Client (React)
    │
    │  POST /api/<agent>  { query, sources, options }
    ▼
FastAPI Route Handler
    │
    ├─► scraper.build_corpus(query, sources)
    │       ├─ Reddit JSON API → [RedditPost]
    │       ├─ Playwright scrape → [ScrapedPage]
    │       └─ Exa.ai neural search (optional) → [dict]
    │
    ├─► nlp_engine.preprocess_text(corpus)
    │       ├─ Sentence segmentation (spaCy)
    │       ├─ Tokenization + lemmatization
    │       └─ Morphological analysis
    │
    ├─► [Agent-specific NLP pipeline]
    │       ├─ NER extraction (FLAIR + spaCy ensemble)
    │       ├─ Embedding encoding (sentence-transformers)
    │       ├─ FAISS index build + BM25 index build
    │       ├─ Clustering / topic modeling
    │       ├─ Sentiment classification (DeBERTa)
    │       └─ Specialized analysis (dependency parse, LDA, etc.)
    │
    ├─► llm_client.ollama_generate(structured_prompt)
    │       └─ RAG context + analysis results injected into prompt
    │
    └─► Return Pydantic-validated response JSON
            │
            ▼
    React renders: charts, graphs, tables, prose
```

### RAG Query Cycle

```
User query (text)
    │
    ├─► Encode with sentence-transformers → 384-dim vector
    │
    ├─► FAISS top-k search (inner product)  ─┐
    │                                        ├─► Hybrid fusion (RRF)
    └─► BM25 keyword search                 ─┘
    │
    ├─► Top-5 retrieved chunks (with source citations)
    │
    └─► Ollama prompt: [system] + [context chunks] + [query]
            │
            └─► Answer + cited sources
```

---

## 5. Features

### 5.1 Core Features

| Feature | Description |
|---|---|
| Multi-source corpus building | Reddit API + Playwright web scraping + Exa.ai semantic search |
| Hybrid RAG retrieval | FAISS dense + BM25 sparse combined via reciprocal rank fusion |
| NER ensemble | FLAIR + spaCy combined for higher entity recall and precision |
| Batch DL sentiment | DeBERTa-v3 zero-shot NLI on document-level and sentence-level text |
| LDA topic modeling | Gensim latent Dirichlet allocation (5–15 topics, coherence-scored) |
| Knowledge graph construction | Dependency-parsed entity-relation graphs with typed edges |
| Persona synthesis | Embedding-clustered archetypes with psychographic profiling |
| Compliance scanning | Article-level GDPR/HIPAA citation with entailment-scored risk |

### 5.2 Advanced AI Features

| Feature | Description |
|---|---|
| Extractive QA | Dense passage retrieval → question answering without generation |
| Paraphrase-equivalent matching | Semantic deduplication at ≥0.92 cosine threshold |
| Aspect-level sentiment | Fine-grained opinion extraction per product attribute |
| Contradiction detection | Identifies aspects with simultaneously high pos+neg polarity |
| Temporal drift analysis | Cosine distance between period-wise embedding centroids |
| Anomaly detection | Statistical detection of sudden term appearance/disappearance |
| Archetype matching | Semantic cosine similarity to 6 predefined persona archetypes |
| NLI zero-shot classification | DeBERTa document↔regulation entailment scoring |
| Thematic role extraction | Agent/Theme/Instrument labeling via dependency parse |
| Abstractive summarization | LED / DistilBART abstractive summarization per document |

### 5.3 Supporting Features

| Feature | Description |
|---|---|
| PDF export | html2canvas + jsPDF client-side PDF generation |
| Knowledge graph visualization | react-force-graph-2D interactive graph rendering |
| Interactive charts | Recharts for sentiment bars, trend lines, positioning scatter |
| Session-persistent RAG chat | In-memory per-session conversation history |
| Document PDF ingestion | PyMuPDF → pdfplumber → pytesseract OCR cascade |
| McKinsey-style report generation | Structured narrative with chart recommendations |
| Live risk feed monitoring | Async RSS ingestion from BBC, CNN, Reuters, FT |
| Supply chain impact graphs | NetworkX graph with severity-ranked impact paths |
| Processing time headers | X-Processing-Time-Ms on all API responses |
| Ollama health check | `/api/health` returns model availability + uptime |

---

## 6. Problems Solved

| Problem | Module | Business Value |
|---|---|---|
| Manual market research is slow and biased | Spectra Agent | Automated synthesis in seconds from live sources |
| Feature comparison across competing docs is tedious | Doc Comparator | Instant gap analysis with semantic matching |
| Understanding entity relationships in large text corpora | Knowledge Graph | Visual graph traversal of hidden connections |
| Product review analysis at scale | Review Analysis | Structured sentiment + contradiction detection across thousands of reviews |
| Identifying emerging trends before competitors | Trend Spotting | Temporal drift detection and anomaly alerts |
| Understanding how a brand is perceived | Brand Association | Semantic map + thematic roles from real discourse |
| Understanding diverse customer segments | Persona Generator | Data-driven personas with psychographic depth |
| Manual compliance review is error-prone and costly | Compliance Checker | Article-level GDPR/HIPAA citation with confidence scores |
| Proprietary knowledge locked in PDFs/docs | Knowledge RAG | Ask questions against your own document base |
| M&A due diligence is expensive and slow | Due Diligence | Automated risk extraction with severity ranking + verdict |
| Turning raw data into readable reports | Report Generator | McKinsey-style narrative from bullet points or metrics |
| Reactive risk management | Risk Monitor | Proactive live monitoring with taxonomy classification |

---

## 7. AI / NLP Techniques Mapping

### Classical NLP

| Technique | Implementation | Used By |
|---|---|---|
| Tokenization + Lemmatization | spaCy Universal Dependencies | All agents |
| POS Tagging | spaCy Universal POS (NOUN, VERB, ADJ, PROPN…) | Knowledge Graph, Review Analysis, Persona |
| Dependency Parsing | spaCy full syntactic tree | Knowledge Graph, Brand Association, Compliance |
| Morphological Analysis | UD morph tags (tense, number, mood) | Doc Comparator, Persona Generator |
| Shallow Parsing | spaCy noun chunks + verb phrases | Spectra, Doc Comparator, Knowledge Graph |
| Sentence Segmentation | spaCy sentencizer + regex fallback | All agents |
| Named Entity Recognition | FLAIR (4-class: PER, ORG, LOC, MISC) + spaCy (extended) ensemble | All agents |
| TF-IDF Vector Space Model | scikit-learn TfidfVectorizer | Doc Comparator, Brand Association, Knowledge Graph |
| Bag-of-Words | Term frequency counter | Review Analysis, Trend Spotting |
| N-gram Modeling | Unigrams to 5-grams by TF | Trend Spotting, Brand Association, Review Analysis |

### Statistical / ML

| Technique | Implementation | Used By |
|---|---|---|
| Word2Vec Embeddings | Gensim Word2Vec on corpus | Brand Association |
| LDA Topic Modeling | Gensim LDA (5–15 topics, coherence-scored) | Trend Spotting |
| K-Means Clustering | scikit-learn KMeans on 384-dim embeddings | Spectra, Review Analysis, Persona Generator |
| BM25 Sparse Retrieval | rank-bm25 library | Compliance Checker, Knowledge RAG, Spectra |
| Cosine Similarity | Dense cosine (scipy + sklearn) | Doc Comparator, Knowledge Graph, Brand Association |
| Thematic Role Analysis | Rule-based over dependency parse | Brand Association, Persona Generator |
| Graph Centrality | NetworkX betweenness + degree centrality | Knowledge Graph, Risk Monitor |
| Anomaly Detection | Term frequency delta (IQR-based) | Trend Spotting |
| Temporal Drift | Per-period cosine distance between embedding centroids | Trend Spotting |

### Deep Learning

| Technique | Model | Used By |
|---|---|---|
| Dense Sentence Embeddings | sentence-transformers all-MiniLM-L6-v2 (384-dim, 22M params) | All agents (primary encoder) |
| DL Sentiment Classification | DeBERTa-v3 (batch inference, FP16 on CUDA) | Spectra, Review Analysis, Brand Association |
| Zero-Shot NLI Classification | DeBERTa-v3 NLI (entailment/neutral/contradiction) | Compliance Checker, Doc Comparator (pros/cons) |
| Abstractive Summarization | LED / DistilBART (transformers) | Doc Comparator, Spectra |
| Aspect-Level Sentiment | DeBERTa + rule-based aspect extractor | Review Analysis |
| Semantic Vector Index | FAISS IndexFlatIP (normalized cosine) | RAG Engine, Spectra, Compliance, Brand Association |

### LLM Prompting

| Technique | Implementation | Used By |
|---|---|---|
| RAG-grounded synthesis | Ollama llama3 + top-k retrieved chunks as context | All agents (final synthesis) |
| Structured JSON output | LLM prompted to return strict schema | Due Diligence, Risk Monitor, Report Generator |
| McKinsey-style prompting | Professional analyst persona + evidence-first instruction | Report Generator, Spectra |
| Multi-turn chat | Session-keyed message history | Knowledge RAG |
| Psychographic inference | RAG-retrieved goal/pain sentences as LLM grounding | Persona Generator |

---

## 8. Tech Stack

### Frontend

| Technology | Version | Role |
|---|---|---|
| React | 18.3.1 | UI framework |
| Vite | 5.3.1 | Dev server + build tool (port 5173) |
| Axios | 1.7.2 | HTTP client (proxy to :8000) |
| Recharts | 3.8.1 | Charts: bar, line, scatter, pie |
| react-force-graph-2d | 1.29.1 | Interactive knowledge graph visualization |
| Framer Motion | 12.38.0 | Page + card animations |
| jsPDF + html2canvas | — | Client-side PDF export |
| Lucide React | — | Icon library |

### Backend

| Technology | Version | Role |
|---|---|---|
| FastAPI | 0.110.0 | REST API framework |
| Uvicorn | 0.29.0 | ASGI server |
| Pydantic | 2.7.1 | Request/response validation (v2) |
| httpx | 0.27.0 | Async HTTP (Ollama client) |
| Python-multipart | — | File upload support |

### NLP / ML

| Technology | Version | Role |
|---|---|---|
| spaCy | 3.7.1 | Core NLP pipeline (tok, NER, POS, dep, morph) |
| NLTK | 3.8.1 | Stopwords, tokenization utilities |
| Gensim | 4.3.2 | Word2Vec embeddings, LDA topic modeling |
| scikit-learn | 1.4.2 | TF-IDF, K-Means, cosine similarity, PCA |
| FLAIR | — | 4-class NER (PER, ORG, LOC, MISC) |
| BERTopic | — | Neural topic modeling (UMAP + HDBSCAN) |
| rank-bm25 | — | BM25 sparse retrieval |
| SciPy | 1.13.0 | Statistical operations |
| NumPy | 1.26.4 | Array operations |
| Pandas | 2.2.2 | Data manipulation (compliance CSVs) |
| NetworkX | 3.3 | Graph construction + centrality |

### Deep Learning

| Technology | Version | Role |
|---|---|---|
| PyTorch | 2.3.0 | DL compute backend |
| HuggingFace Transformers | 4.41.1 | DeBERTa-v3, LED, DistilBART models |
| sentence-transformers | 3.0.0 | all-MiniLM-L6-v2 dense encoder |
| FAISS | — | Dense vector index (IndexFlatIP) |
| UMAP | — | Dimensionality reduction (BERTopic) |
| HDBSCAN | — | Density-based clustering (BERTopic) |

### LLM

| Technology | Role |
|---|---|
| Ollama (llama3:latest) | Local LLM inference — synthesis, reasoning, verdict generation |
| DeBERTa-v3 | NLI zero-shot — compliance entailment, pros/cons classification |

### Scraping / Data

| Technology | Role |
|---|---|
| Playwright 1.44.0 | Browser automation — JS-rendered page scraping |
| BeautifulSoup4 4.12.3 | HTML parsing + content extraction |
| Reddit JSON API | Subreddit search + comment threads (no auth required) |
| Exa.ai | Optional neural semantic web search |
| PyMuPDF (fitz) | PDF text extraction (Due Diligence) |
| pdfplumber | Secondary PDF parsing fallback |
| pytesseract | OCR fallback for image-based PDFs |

---

## 9. NLP Engine Architecture (nlp_engine.py)

The NLP engine is the shared computation layer across all agents. It provides:

```
nlp_engine.py
├── Model Singletons (LRU-cached, lazy-loaded)
│   ├── _get_nlp()              → spaCy pipeline (trf > lg > sm > blank)
│   ├── _get_bi_encoder()       → sentence-transformers all-MiniLM-L6-v2
│   ├── _get_sentiment_pipeline() → DeBERTa-v3 zero-shot NLI
│   ├── _get_summarizer()       → LED or DistilBART
│   └── _get_flair_ner()        → FLAIR 4-class NER
│
├── Preprocessing
│   ├── segment_sentences()     → spaCy sentencizer + regex fallback
│   ├── tokenize()              → spaCy lemmatization
│   ├── remove_stopwords()      → NLTK + spaCy defaults
│   ├── analyze_morphology()    → UD morph tags
│   └── preprocess_text()       → full pipeline (sentences, tokens, lemmas, morph)
│
├── Syntax Parsing
│   ├── pos_tag()               → Universal POS tags
│   ├── shallow_parse()         → noun chunks + verb phrases
│   └── dependency_parse()      → full syntactic tree + relation labels
│
├── Representation
│   ├── vector_space_model()    → TF-IDF + cosine ranking
│   ├── compute_similarity()    → dense cosine similarity
│   ├── bag_of_words()          → TF counter + filtering
│   ├── ngram_model()           → N-gram frequencies (1–5 grams)
│   ├── word_embeddings()       → Gensim Word2Vec on corpus
│   └── get_word_embeddings()   → dense fasttext-style vectors
│
├── Advanced NLP
│   ├── classify_sentiment()    → batch DeBERTa DL sentiment
│   ├── extract_entities()      → FLAIR + spaCy NER ensemble
│   ├── extract_aspect_sentiments() → aspect-level opinion extraction
│   ├── dependency_parse()      → syntactic dependency tree
│   └── thematic_role_analysis() → Agent/Theme/Instrument extraction
│
└── Specialized
    ├── topic_modeling()        → Gensim LDA (5–15 topics)
    ├── build_rag_index()       → dual FAISS + BM25 hybrid
    ├── summarize_text()        → abstractive (DL) + extractive modes
    ├── extractive_qa()         → dense passage retrieval QA
    └── build_nlp_meta()        → processing metadata (tokens, sentences, entities, time)
```

**Performance Characteristics:**
- Model loading at startup: ~5–10 seconds
- Typical agent latency: 5–15 seconds (scraping + analysis)
- LLM synthesis latency: 3–8 seconds (Ollama llama3 CPU/GPU)
- RAG query latency: 1–2 seconds
- Batch inference: 32–64 samples (adaptive sizing)
- Memory footprint: ~4–6 GB (models + FAISS index)
- FP16 inference on CUDA devices for reduced memory

---

## 10. Optional Future Improvements

- [ ] **BERTopic integration** — already a dependency, not yet wired into agent responses
- [ ] **Cross-agent orchestration** — chaining Spectra → Report Generator automatically
- [ ] **Vector DB persistence** — replace FAISS flat files with Qdrant or ChromaDB for scale
- [ ] **Multi-language NLP** — spaCy supports multilingual, could expand beyond English
- [ ] **Streaming LLM responses** — Ollama supports streaming; wire to SSE for faster UI
- [ ] **User authentication** — no auth currently; add JWT for multi-user deployments
- [ ] **CCPA corpus** — Compliance Checker supports CCPA rules but no CSV loaded yet
- [ ] **Agent result caching** — identical queries hit full pipeline every time; add Redis cache
- [ ] **spaCy transformer model** — en_core_web_trf would improve NER quality at the cost of speed
