const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, LevelFormat, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, VerticalAlign, Header, Footer
} = require('docx');
const fs = require('fs');

const TEAL = "0D4F7C";
const NAVY = "0A1628";
const GRAY = "444444";
const LIGHTBG = "EBF4FB";
const WHITE = "FFFFFF";

const border = { style: BorderStyle.SINGLE, size: 1, color: "C5D8E8" };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 32, bold: true, color: NAVY })]
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, font: "Arial", size: 26, bold: true, color: TEAL })]
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text, font: "Arial", size: 22, bold: true, color: GRAY })]
  });
}
function para(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 120 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, font: "Arial", size: 22, color: GRAY, ...opts })]
  });
}
function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: GRAY })]
  });
}
function figPlaceholder(label) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    alignment: AlignmentType.CENTER,
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: TEAL },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: TEAL },
      left: { style: BorderStyle.SINGLE, size: 4, color: TEAL },
      right: { style: BorderStyle.SINGLE, size: 4, color: TEAL },
    },
    children: [new TextRun({ text: label, font: "Arial", size: 20, color: TEAL, italic: true })]
  });
}
function tableRow(cells, isHeader = false) {
  return new TableRow({
    tableHeader: isHeader,
    children: cells.map(([txt, w]) => new TableCell({
      borders,
      width: { size: w, type: WidthType.DXA },
      shading: isHeader ? { fill: TEAL, type: ShadingType.CLEAR } : { fill: WHITE, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: txt, font: "Arial", size: 20, bold: isHeader, color: isHeader ? WHITE : GRAY })]
      })]
    }))
  });
}
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}
function spacer() {
  return new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun("")] });
}

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }, {
          level: 1, format: LevelFormat.BULLET, text: "\u25E6",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 } } }
        }]
      }
    ]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: GRAY } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: TEAL },
        paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: GRAY },
        paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 }
      }
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 1 } },
            spacing: { after: 120 },
            children: [
              new TextRun({ text: "SPECTRA & Product Intelligence Engine — Technical Report", font: "Arial", size: 18, color: TEAL, bold: true }),
              new TextRun({ text: "    |    VIT Chennai, 2025", font: "Arial", size: 18, color: GRAY }),
            ]
          })
        ]
      })
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: TEAL, space: 1 } },
            alignment: AlignmentType.CENTER,
            spacing: { before: 80 },
            children: [
              new TextRun({ text: "Page ", font: "Arial", size: 18, color: GRAY }),
              new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: GRAY }),
            ]
          })
        ]
      })
    },
    children: [

      // ── TITLE BLOCK ──
      new Paragraph({
        spacing: { before: 0, after: 80 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "SPECTRA Platform", font: "Arial", size: 48, bold: true, color: NAVY })]
      }),
      new Paragraph({
        spacing: { before: 0, after: 60 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "& Product Intelligence Engine", font: "Arial", size: 36, bold: true, color: TEAL })]
      }),
      new Paragraph({
        spacing: { before: 0, after: 60 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Integrated AI-Powered Market & Product Intelligence Platform", font: "Arial", size: 24, italic: true, color: GRAY })]
      }),
      new Paragraph({
        spacing: { before: 60, after: 60 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Pavithra  |  B.Tech (AI & Data Engineering)  |  VIT Chennai  |  2025", font: "Arial", size: 20, color: GRAY })]
      }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL, space: 1 } },
        spacing: { before: 40, after: 200 },
        children: [new TextRun("")]
      }),

      // ── ABSTRACT ──
      h1("Abstract"),
      para("This paper presents the design, architecture, and implementation of two complementary AI-powered systems: the SPECTRA Platform and the Product Intelligence Engine (PIE). Together, they constitute a unified, production-grade pipeline for automated market and product research. SPECTRA comprises eight specialized AI agents and four enterprise modules built on a local inference stack (Ollama llama3, spaCy, FLAIR, DeBERTa-v3, sentence-transformers), while PIE employs a cloud-augmented microservices architecture (Gemini 2.5 Flash, Groq Llama-3) with a four-stage classification pipeline. The integrated system aggregates user feedback from Reddit, HackerNews, Exa.ai neural search, and app stores, then processes it through hybrid retrieval-augmented generation (FAISS + BM25), named entity recognition ensembles, zero-shot NLI classification, LDA topic modeling, and K-Means clustering on transformer embeddings. Outputs include McKinsey-style consulting reports, article-level GDPR/HIPAA compliance findings, financial revenue-risk estimates, knowledge graphs, and temporal trend analyses. This paper describes each component's methodology, the NLP/ML/DL techniques employed, and the engineering decisions that make the system scalable, extensible, and suitable for academic and commercial deployment."),
      spacer(),

      pageBreak(),

      // ── 1. INTRODUCTION ──
      h1("1. Introduction"),
      para("The modern enterprise faces an acute intelligence deficit: user feedback is dispersed across dozens of platforms, competitive intelligence arrives too late to drive strategy, and compliance obligations demand manual review of thousands of regulatory articles. Traditional approaches relying on human analysts are slow, expensive, and do not scale. Recent advances in transformer-based natural language processing — particularly dense passage retrieval, zero-shot classification, and large language model synthesis — have created an opportunity to automate this workflow end-to-end."),
      para("The SPECTRA Platform and the Product Intelligence Engine represent a response to this gap. SPECTRA is a local-first system built around eight specialized AI agents and four enterprise modules, designed to provide consulting-quality market research without cloud inference costs. PIE is a microservices-based complement focused on product feedback triage, financial risk modeling, and professional PDF report generation using cloud-augmented LLMs. While architecturally distinct, both systems share core components — a hybrid retrieval engine combining FAISS dense indexing with BM25 sparse retrieval, a DeBERTa-v3 NLI zero-shot classifier, and an Ollama-backed LLM synthesis layer — enabling unified operation as an integrated intelligence platform."),
      para("This report documents the system architecture, methodology, implementation details, and technical contributions of the integrated platform, with particular emphasis on the NLP, ML, and deep learning techniques that underpin each module."),
      spacer(),

      // ── 2. PROBLEM STATEMENT ──
      h1("2. Problem Statement"),
      para("The research addresses five core problems in automated market and product intelligence:"),
      bullet("Fragmented Product Feedback: User opinions are spread across Reddit, HackerNews, app stores, and competitor mentions with no mechanism for unified aggregation, deduplication, or quality filtering."),
      bullet("Information Overload: Raw scraped data contains substantial spam, promotional content, and irrelevant noise that must be filtered before analysis without discarding genuine signal."),
      bullet("Qualitative-to-Quantitative Translation: Converting free-text reviews into structured financial risk estimates, compliance risk scores, and strategic insights requires both deep NLP and domain-specific modeling."),
      bullet("Compliance Automation: Manual GDPR/HIPAA review is error-prone, lacks article-level precision, and does not scale to the volume of documents enterprises must assess."),
      bullet("Reactive Market Positioning: Without real-time monitoring of news feeds and competitive signals, businesses respond to market shifts after the fact, incurring preventable revenue losses."),
      para("Together, these problems motivate a system that integrates data collection, intelligent classification, multi-method NLP analysis, and structured report generation into a single automated pipeline."),
      spacer(),

      pageBreak(),

      // ── 3. SYSTEM ARCHITECTURE ──
      h1("3. System Architecture"),
      para("The integrated platform follows a layered architecture comprising five distinct tiers: frontend presentation, API gateway, agent/pipeline layer, NLP/ML engine, and data/scraping layer. Each tier communicates via well-defined HTTP/REST interfaces with Pydantic v2 validated schemas at every boundary."),
      figPlaceholder("[Figure: Architecture Diagram — Five-Tier System Architecture]"),

      h2("3.1 SPECTRA Platform"),
      para("SPECTRA is a monolithic FastAPI application served by Uvicorn, with model singletons pre-loaded at startup via a lifespan hook to eliminate cold-start latency. The frontend is built with React 18.3.1 and Vite 5.3.1, using Axios for API communication, Recharts for data visualization, and react-force-graph-2d for interactive knowledge graph rendering."),
      para("The eight core agents — Spectra, Doc Comparator, Knowledge Graph, Review Analysis, Trend Spotting, Brand Association, Persona Generator, and Compliance Checker — each expose a dedicated REST endpoint (/api/spectra, /api/doc-compare, etc.) and share a common NLP engine (nlp_engine.py). All LLM synthesis is handled by a local Ollama llama3 instance via an async HTTP client, ensuring zero data egress. Four enterprise modules — Knowledge RAG, Due Diligence, Report Generator, and Risk Monitor — provide higher-order capabilities including document ingestion, M&A analysis, and live news feed monitoring."),

      h2("3.2 Product Intelligence Engine"),
      para("PIE follows a distributed microservices architecture with four services communicating over HTTP/REST: a Gateway Service (port 8000) for job orchestration and SQLite state management, a Scraper Service (port 8001) for multi-source data collection, a Classifier Service (port 8002) for the four-stage hybrid classification pipeline, and an Analysis Service (port 8003) for parallel AI agent execution. Docker Compose orchestrates all four services. Unlike SPECTRA, PIE uses cloud LLMs — Gemini 2.5 Flash for the analysis agents and Groq Llama-3.1-8b for fast relevance classification — trading privacy for higher throughput."),

      h2("3.3 Shared Components"),
      para("Both systems share three architectural patterns: (1) a hybrid RAG index combining FAISS IndexFlatIP for dense semantic retrieval with rank-bm25 for sparse keyword retrieval, fused via Reciprocal Rank Fusion; (2) a DeBERTa-v3-small model for batch sentiment classification and zero-shot NLI entailment scoring; and (3) sentence-transformers all-MiniLM-L6-v2 (384-dimensional, 22 million parameters) as the primary text encoder."),
      spacer(),

      pageBreak(),

      // ── 4. METHODOLOGY ──
      h1("4. Methodology"),

      h2("4.1 Named Entity Recognition"),
      para("Entity extraction employs a two-model ensemble: FLAIR's four-class sequence labeling model (PER, ORG, LOC, MISC) and spaCy's en_core_web_lg pipeline with extended entity types. Entity candidates from both models are merged, deduplicated by surface form and type, and ranked by frequency-weighted confidence score. This ensemble approach is applied across all eight SPECTRA agents and PIE's competitor analysis module. Junk entities (single characters, numeric-only tokens, stopword sequences) are filtered via a post-processing rule set. Extracted entities feed into the FAISS index as high-weight nodes and into knowledge graph construction as typed vertices."),

      h2("4.2 Sentiment Analysis"),
      para("Sentiment classification operates at two levels. At the document level, the system uses DeBERTa-v3-small (cross-encoder/nli-deberta-v3-small via HuggingFace Transformers) as a zero-shot NLI classifier, mapping text-hypothesis pairs (e.g., 'this review expresses positive sentiment') to entailment, neutral, or contradiction labels. Batch inference runs at 32–64 samples with FP16 precision on CUDA devices. At the review/sentence level, PIE's classifier service employs a RoBERTa model fine-tuned on Twitter data (cardiffnlp/twitter-roberta-base-sentiment) for three-class classification (POSITIVE, NEUTRAL, NEGATIVE) with confidence scores used to weight a quality-adjusted sentiment aggregate: sentiment_score = (sum(sentiment_map[label] × quality_score) / sum(quality_score)) × 10."),

      h2("4.3 Embeddings and Vector Search"),
      para("All semantic operations are grounded in sentence-level dense embeddings produced by all-MiniLM-L6-v2. Documents are chunked into 120-word overlapping windows with a 20-word stride, then encoded to 384-dimensional vectors. FAISS IndexFlatIP stores normalized vectors so inner product equals cosine similarity. BM25 (rank-bm25) provides complementary sparse retrieval over tokenized chunks. At query time, both indices return top-k candidates, and Reciprocal Rank Fusion (RRF) merges the ranked lists. In the Compliance Checker, this hybrid index is built over the GDPR and HIPAA law corpora; in the Knowledge RAG module, it is built over user-ingested documents persisted to disk (rag_data/)."),
      para("Deduplication in the Doc Comparator uses cosine similarity with a threshold of 0.92 to identify paraphrase-equivalent features (e.g., 'data deletion' and 'right to erasure'). K-Means clustering (scikit-learn, k=3–5 configurable) partitions sentence embeddings into coherent groups for theme discovery in Spectra, Review Analysis, and Persona Generator."),

      h2("4.4 LLM Prompting and RAG-Grounded Synthesis"),
      para("All LLM outputs are grounded in retrieved evidence to reduce hallucination. The synthesis prompt includes a structured system instruction adopting a McKinsey-style analyst persona, followed by retrieved RAG context chunks, the user query, and an explicit instruction to produce output in a specified JSON schema. For SPECTRA agents, Ollama llama3 (7B parameters, local) handles synthesis; for PIE's analysis agents, Gemini 2.5 Flash processes four parallel async requests (sentiment, priority, competitor, risk); for relevance classification, Groq Llama-3.1-8b processes batches of DistilBART-compressed summaries (max 60 tokens) for fast binary relevance decisions. The Report Generator employs a multi-segment prompt that normalizes diverse input formats (key:value pairs, bullet lists, pipe-separated insight tables, CSV metrics) before structured LLM generation."),

      h2("4.5 Topic Modeling"),
      para("Gensim Latent Dirichlet Allocation (LDA) with coherence scoring selects the optimal topic count between 5 and 15. Each document is represented as a bag-of-words count matrix after stopword removal and lemmatization. Per-topic top-n terms are extracted as thematic descriptors. In the Trend Spotting agent, corpus documents are binned into temporal periods; per-period sentence-transformer centroids are computed, and the cosine distance between consecutive centroids yields a temporal drift score. Statistical anomaly detection (IQR-based term frequency delta) flags terms that appear or disappear abruptly between periods."),

      h2("4.6 Financial Risk Modeling"),
      para("PIE's risk agent maps qualitative severity labels to numeric scores (CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1). Revenue risk per event is calculated as revenue_loss = severity_score × estimated_monthly_price, aggregated by risk category. These figures feed a Matplotlib-generated time-series chart and competitive benchmark radar chart embedded in the final PDF. The finance engine also estimates user churn impact by applying the severity-weighted revenue loss against user-provided MAU and ARPU inputs."),

      h2("4.7 Spam and Quality Classification Pipeline"),
      para("PIE's four-stage classifier filters reviews before analysis. Stage 1 applies regex hard-filters (promotional keywords, URL-heavy content, length < 10 characters). Stage 2 uses DistilBART to compress long reviews to 60-token summaries, reducing downstream LLM cost. Stage 3 submits batched summaries to Groq Llama-3.1-8b for binary relevance verification. Stage 4 computes a weighted quality score: base 0.5, +0.1 for text length > 50, +0.2 for upvotes > 10, +0.2 for high-credibility source, capped at 1.0. This score weights the final sentiment aggregate."),
      spacer(),

      pageBreak(),

      // ── 5. IMPLEMENTATION ──
      h1("5. Implementation Details"),

      h2("5.1 Technology Stack"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2600, 2200, 4560],
        rows: [
          tableRow([["Layer", 2600], ["Technology", 2200], ["Role", 4560]], true),
          tableRow([["Frontend", 2600], ["React 18.3.1 + Vite", 2200], ["Agent pages, dashboards, knowledge graph, PDF export", 4560]]),
          tableRow([["Backend", 2600], ["FastAPI 0.110 + Uvicorn", 2200], ["REST API, job orchestration, Pydantic v2 validation", 4560]]),
          tableRow([["NLP Core", 2600], ["spaCy 3.7 + FLAIR", 2200], ["NER ensemble, POS, dependency parsing, morphology", 4560]]),
          tableRow([["Embeddings", 2600], ["sentence-transformers 3.0", 2200], ["all-MiniLM-L6-v2, 384-dim dense encoder", 4560]]),
          tableRow([["Vector Index", 2600], ["FAISS + rank-bm25", 2200], ["Hybrid dense+sparse retrieval with RRF fusion", 4560]]),
          tableRow([["DL Classifier", 2600], ["DeBERTa-v3 + RoBERTa", 2200], ["NLI zero-shot, batch sentiment, aspect classification", 4560]]),
          tableRow([["Topic Model", 2600], ["Gensim LDA + BERTopic", 2200], ["LDA coherence-scored; BERTopic (UMAP+HDBSCAN) available", 4560]]),
          tableRow([["Local LLM", 2600], ["Ollama llama3:latest", 2200], ["Zero-egress synthesis, McKinsey prompts, structured JSON", 4560]]),
          tableRow([["Cloud LLMs", 2600], ["Gemini 2.5 Flash + Groq", 2200], ["PIE analysis agents + fast relevance classification", 4560]]),
          tableRow([["Graphs", 2600], ["NetworkX 3.3", 2200], ["Knowledge graph centrality, supply chain impact paths", 4560]]),
          tableRow([["Scraping", 2600], ["Playwright + BS4 + Exa.ai", 2200], ["Browser automation, HTML parsing, neural web search", 4560]]),
          tableRow([["PDF Generation", 2600], ["xhtml2pdf + ReportLab", 2200], ["Markdown → HTML → PDF with embedded Matplotlib charts", 4560]]),
          tableRow([["Persistence", 2600], ["SQLite + FAISS flat files", 2200], ["PIE job state; SPECTRA RAG index on disk", 4560]]),
        ]
      }),
      spacer(),

      h2("5.2 NLP Engine Architecture (SPECTRA)"),
      para("The nlp_engine.py module provides the shared computation layer for all SPECTRA agents. Model singletons are LRU-cached and lazy-loaded to prevent redundant initialization. The engine exposes: preprocessing (sentence segmentation, tokenization, lemmatization, morphological analysis); syntax parsing (POS tagging, shallow parsing, dependency tree); representation (TF-IDF VSM, cosine similarity, bag-of-words, n-gram modeling, Word2Vec embeddings); advanced NLP (DL sentiment batch inference, NER ensemble, aspect-level sentiment, thematic role analysis via dependency parse); and specialized functions (LDA topic modeling, hybrid RAG index construction, abstractive/extractive summarization, extractive QA, processing metadata). Typical agent latency is 5–15 seconds for scraping and analysis; LLM synthesis adds 3–8 seconds. Memory footprint is approximately 4–6 GB with FP16 inference on CUDA."),

      h2("5.3 Key Algorithms"),
      para("The quality scoring algorithm in PIE assigns a normalized score in [0, 1] based on text length, upvote count, and source credibility platform weighting. The weighted sentiment calculation uses this score as a continuous weight across the review corpus. Financial revenue risk is computed as the product of event severity score and the user-provided estimated monthly price, then aggregated per risk category. Spam detection combines regex pattern matching, a semantic similarity comparison to anchor 'advertisement' vs 'review' sentence embeddings using MiniLM cosine similarity (reject if ad_sim > review_sim + 0.05), and final LLM binary verification."),
      spacer(),

      pageBreak(),

      // ── 6. RESULTS & DISCUSSION ──
      h1("6. Results & Discussion"),
      para("The integrated platform generates four categories of structured output, each validated against domain-specific quality criteria."),

      h2("6.1 Spectra Reports"),
      para("The Spectra agent produces executive summaries grounded in live Reddit and Exa.ai corpus data, entity-ranked competitive maps, sentiment distribution charts, thematic clusters, and strategic recommendations. The Ollama synthesis layer, anchored by RAG-retrieved evidence, substantially reduces fabricated competitor claims compared to direct zero-shot prompting. K-Means clustering (k=3–5) consistently identifies coherent thematic groups across diverse product domains."),
      figPlaceholder("[Figure: Output Screenshot — Spectra Agent Results]"),

      h2("6.2 Compliance Analysis"),
      para("The Compliance Checker produces article-level GDPR and HIPAA citations with NLI entailment confidence scores, an aggregate 0–100 risk score, and severity-ranked issue lists with specific evidence passages and remediation suggestions. The hybrid BM25+FAISS retrieval over the law corpus retrieves relevant articles with higher precision than keyword-only matching, particularly for paraphrased obligations. Risk scores effectively differentiate critical non-compliance scenarios (e.g., absent consent mechanisms) from low-risk informational gaps."),

      h2("6.3 Financial Risk Assessment"),
      para("PIE's financial modeling layer translates qualitative severity classifications into quantitative revenue risk estimates, enabling product managers to prioritize fixes by business impact rather than subjective urgency. Radar charts provide competitive benchmarking across five dimensions, while the incident timeline chart contextualizes risk events temporally. The McKinsey-style PDF output is suitable for board-level reporting."),
      figPlaceholder("[Figure: Output Screenshot — Financial Risk PDF Report]"),

      h2("6.4 Knowledge Graphs and Personas"),
      para("The Knowledge Graph agent constructs typed entity-relation graphs from dependency-parsed text, with betweenness centrality identifying the most structurally significant entities. These graphs surface implicit relationships that flat entity lists miss. The Persona Generator reliably produces distinct persona clusters when the corpus is sufficiently diverse; single-domain corpora tend to collapse into fewer meaningful archetypes."),
      spacer(),

      pageBreak(),

      // ── 7. CHALLENGES ──
      h1("7. Challenges & Limitations"),
      bullet("LLM Hallucination: Despite RAG grounding, Ollama llama3 occasionally fabricates competitor names or regulatory article numbers not present in retrieved context. Post-generation citation verification is required for high-stakes compliance outputs."),
      bullet("Scraping Fragility: Reddit's stealth header approach and Playwright-based browser automation are sensitive to platform policy changes and bot-detection updates. Pipeline failures require manual intervention and re-engineering of user-agent rotation strategies."),
      bullet("Cold-Start Memory Overhead: Pre-loading spaCy (transformer pipeline), FLAIR, DeBERTa-v3, DistilBART, and sentence-transformers at startup requires 4–6 GB RAM and 5–10 seconds. This makes the system unsuitable for serverless or edge deployment without model quantization."),
      bullet("English-Only NLP: The current stack processes only English-language text. Non-English user reviews from international app stores are silently dropped, introducing geographic and demographic bias in corpus analysis."),
      bullet("Absence of Result Caching: Every identical query reruns the full pipeline. Without a Redis caching layer, latency and cloud API costs recur unnecessarily for repeated analyses."),
      bullet("Lack of Ground-Truth Evaluation: NLI entailment quality, LLM synthesis faithfulness, and knowledge graph edge accuracy lack standardized benchmark datasets for the specific domains covered. Evaluation currently relies on qualitative expert review rather than automated metrics."),
      spacer(),

      // ── 8. FUTURE ENHANCEMENTS ──
      h1("8. Future Enhancements"),
      h3("Short-Term"),
      bullet("Implement Redis caching for pipeline results; target 10x latency reduction on repeated queries."),
      bullet("Wire BERTopic (UMAP + HDBSCAN) — already installed as a dependency — into Trend Spotting agent responses for neural topic modeling alongside LDA."),
      bullet("Enable Ollama streaming via SSE to provide real-time report generation in the frontend."),
      h3("Mid-Term"),
      bullet("Domain-adaptive fine-tuning of DeBERTa-v3 on curated product-review datasets to improve sentiment classification F1 for technical vocabulary."),
      bullet("Implement cross-agent orchestration chains (e.g., Spectra → Trend Spotting → Report Generator) to enable automated multi-agent intelligence pipelines."),
      bullet("Expand multilingual support using spaCy multilingual models (xx_ent_wiki_sm) and multilingual sentence-transformers (paraphrase-multilingual-MiniLM-L12-v2)."),
      h3("Long-Term"),
      bullet("Replace FAISS flat-file persistence with Qdrant or ChromaDB for billion-scale vector storage with metadata filtering."),
      bullet("Introduce JWT-based multi-user authentication with workspace isolation for enterprise multi-tenant deployment."),
      bullet("Develop an automated evaluation harness benchmarking NER recall, NLI precision, LLM faithfulness (using BERTScore and faithfulness probes), and retrieval MRR against curated gold datasets."),
      spacer(),

      // ── 9. CONCLUSION ──
      h1("9. Conclusion"),
      para("This paper has presented the architecture, methodology, and implementation of two complementary AI-powered intelligence systems — SPECTRA and PIE — that together constitute a production-grade, end-to-end automated research pipeline. The platform integrates more than twenty NLP, ML, and deep learning techniques across a modular, extensible architecture, achieving consulting-quality outputs from raw unstructured text without human analyst intervention. Key contributions include the hybrid FAISS+BM25 RAG engine with Reciprocal Rank Fusion, the FLAIR+spaCy NER ensemble for higher entity recall, the DeBERTa-v3 NLI-based compliance scoring system with article-level citation, and the multi-agent parallel analysis architecture using both local (Ollama llama3) and cloud (Gemini 2.5 Flash) LLMs. The system demonstrates that the combination of retrieval-augmented generation, transformer-based classification, and structured LLM prompting can automate workflows that previously required teams of specialized analysts, opening practical avenues for scalable, real-time business intelligence in resource-constrained environments."),
      spacer(),

      // ── REFERENCES ──
      h1("References"),
      para("[1] Reimers, N. & Gurevych, I. (2019). Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks. EMNLP 2019.", { italic: true }),
      para("[2] He, P. et al. (2021). DeBERTa: Decoding-enhanced BERT with Disentangled Attention. ICLR 2021.", { italic: true }),
      para("[3] Johnson, J. et al. (2021). Billion-scale similarity search with GPUs. IEEE TPAMI.", { italic: true }),
      para("[4] Robertson, S. & Zaragoza, H. (2009). The Probabilistic Relevance Framework: BM25 and Beyond. FnTIR.", { italic: true }),
      para("[5] Lewis, P. et al. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. NeurIPS 2020.", { italic: true }),
      para("[6] Blei, D. M. et al. (2003). Latent Dirichlet Allocation. JMLR 3.", { italic: true }),
      para("[7] Lhoest, Q. et al. (2021). Datasets: A Community Library for Natural Language Processing. EMNLP 2021.", { italic: true }),
      para("[8] Akbik, A. et al. (2018). Contextual String Embeddings for Sequence Labeling. COLING 2018.", { italic: true }),

    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("report.docx", buf);
  console.log("DONE");
}).catch(e => { console.error(e); process.exit(1); });