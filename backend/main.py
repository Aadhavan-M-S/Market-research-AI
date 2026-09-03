"""
main.py — SPECTRA Market Intelligence Platform
FastAPI application with CORS, routing for 8 NLP agents, and health checks.
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from fastapi import APIRouter
from fastapi.responses import FileResponse
from agents.market_research import run_market_research
from agents.market_research_pdf import generate_pdf_report

router = APIRouter()



from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from nlp_engine import _get_nlp, _get_bi_encoder, _get_sentiment_pipeline

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("spectra")
from nlp_engine import classify_sentiment, summarize_text


# ── Import all schemas ─────────────────────────────────────────────────────────
from models.schemas import (
    MarketResearchRequest,
    MarketResearchResponse,
    DocComparatorRequest,
    DocComparatorResponse,
    KnowledgeGraphRequest,
    KnowledgeGraphResponse,
    ReviewAnalysisRequest,
    ReviewAnalysisResponse,
    TrendSpottingRequest,
    TrendSpottingResponse,
    BrandAssociationRequest,
    BrandAssociationResponse,
    PersonaGeneratorRequest,
    PersonaGeneratorResponse,
    ComplianceRequest,
    ComplianceResponse,
)

# ── Import all agent runners ───────────────────────────────────────────────────
from agents.market_research import run_market_research
from agents.doc_comparator import run_doc_comparator
from agents.knowledge_graph import run_knowledge_graph
from agents.review_analysis import run_review_analysis
from agents.trend_spotting import run_trend_spotting
from agents.brand_association import run_brand_association
from agents.persona_generator import run_persona_generator
from agents.compilance_checker import run_compliance_check
from llm_client import check_ollama_health


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Warm up the cache BEFORE accepting requests
    print("Loading heavy NLP models into RAM...")
    _get_nlp()
    _get_bi_encoder()
    _get_sentiment_pipeline()
    print("Models loaded and cached! Server is ready.")
    
    yield # App runs here
    
    # Clean up (if needed) on shutdown
    print("Shutting down...")


# ── App factory ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="SPECTRA — Market Intelligence & NLP Platform",
    description="Premium AI research consultancy API powered by local LLMs and advanced NLP.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)
app.include_router(router)
# CORS — allow React dev server
cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request timing middleware ──────────────────────────────────────────────────

@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    t0 = time.time()
    response = await call_next(request)
    elapsed = round((time.time() - t0) * 1000, 2)
    response.headers["X-Processing-Time-Ms"] = str(elapsed)
    return response


# ── Global error handler ──────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)[:200]}"},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# HEALTH & META ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.on_event("startup")
def load_models():
    print(" Loading models once...")

    # trigger loading
    classify_sentiment(["test"])
    summarize_text("This is a test document.", method="dl")

    print("Models ready")

@app.get("/api/health", tags=["Meta"])
async def health_check():
    ollama_status = await check_ollama_health()
    return {
        "status": "online",
        "version": "1.0.0",
        "ollama": ollama_status,
        "agents": [
            "market-research", "doc-compare", "knowledge-graph",
            "review-analysis", "trend-spotting", "brand-association",
            "persona-generator", "compliance-check",
        ],
    }


@app.get("/api/nlp-map", tags=["Meta"])
async def nlp_technique_map():
    """Returns the mapping of NLP techniques to agents."""
    return {
        "techniques": [
            {"technique": "Porter Stemming", "category": "Preprocessing", "agents": ["all"]},
            {"technique": "Sentence Segmentation", "category": "Preprocessing", "agents": ["all"]},
            {"technique": "Morphological Analysis", "category": "Preprocessing", "agents": ["doc-compare", "persona-generator"]},
            {"technique": "POS Tagging", "category": "Syntax", "agents": ["knowledge-graph", "brand-association", "persona-generator"]},
            {"technique": "Shallow Parsing", "category": "Syntax", "agents": ["market-research", "knowledge-graph"]},
            {"technique": "Dependency Parsing", "category": "Syntax", "agents": ["compliance-check", "knowledge-graph"]},
            {"technique": "Bag of Words", "category": "Representation", "agents": ["review-analysis", "trend-spotting"]},
            {"technique": "TF-IDF VSM", "category": "Representation", "agents": ["doc-compare", "brand-association"]},
            {"technique": "N-gram Models", "category": "Representation", "agents": ["trend-spotting", "brand-association"]},
            {"technique": "Word2Vec", "category": "Representation", "agents": ["review-analysis", "persona-generator", "brand-association"]},
            {"technique": "Sentiment Classification", "category": "Advanced", "agents": ["review-analysis", "market-research"]},
            {"technique": "NER (CRF/LSTM)", "category": "Advanced", "agents": ["market-research", "compliance-check"]},
            {"technique": "Text Summarization", "category": "Advanced", "agents": ["doc-compare", "market-research"]},
            {"technique": "Machine Translation", "category": "Advanced", "agents": ["ollama-multilingual"]},
            {"technique": "Extractive QA", "category": "Applications", "agents": ["market-research"]},
            {"technique": "Topic Modeling (LDA)", "category": "Applications", "agents": ["trend-spotting"]},
            {"technique": "Conversational Agent", "category": "Applications", "agents": ["all (Ollama LLM)"]},
            {"technique": "Thematic Roles", "category": "Applications", "agents": ["brand-association", "persona-generator"]},
        ]
    }


# ═══════════════════════════════════════════════════════════════════════════════
# AGENT ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/market-research", response_model=MarketResearchResponse, tags=["Agents"])
async def market_research(req: MarketResearchRequest):
    """
    Agent 1: Spectra
    Scrapes Reddit + web, runs NER, sentiment, summarization, and QA.
    """
    logger.info(f"[Agent-1] Spectra query: '{req.query}'")
    return await run_market_research(req)


@app.post("/api/doc-compare", response_model=DocComparatorResponse, tags=["Agents"])
async def doc_compare(req: DocComparatorRequest):
    """
    Agent 2: Documentation Comparator
    Feature gap analysis, summarization, pros/cons, morphological insights.
    """
    logger.info(f"[Agent-2] Doc compare: '{req.label_a}' vs '{req.label_b}'")
    return await run_doc_comparator(req)


@app.post("/api/knowledge-graph", response_model=KnowledgeGraphResponse, tags=["Agents"])
async def knowledge_graph(req: KnowledgeGraphRequest):
    """
    Agent 3: Knowledge Graph Generator
    Entity-relation mapping via NER, dependency parsing, co-occurrence.
    """
    logger.info(f"[Agent-3] Knowledge graph: {len(req.text)} chars")
    return await run_knowledge_graph(req)


@app.post("/api/review-analysis", response_model=ReviewAnalysisResponse, tags=["Agents"])
async def review_analysis(req: ReviewAnalysisRequest):
    """
    Agent 4: Product Review Analysis
    DL sentiment, aspect-based analysis, BOW, Word2Vec clusters, RAG.
    """
    logger.info(f"[Agent-4] Review analysis: '{req.product_name}' ({len(req.reviews)} reviews)")
    return await run_review_analysis(req)


@app.post("/api/trend-spotting", response_model=TrendSpottingResponse, tags=["Agents"])
async def trend_spotting(req: TrendSpottingRequest):
    """
    Agent 5: Trend Spotting
    LDA topic modeling, N-gram analysis, temporal trend detection.
    """
    logger.info(f"[Agent-5] Trend spotting: {len(req.texts)} documents")
    return await run_trend_spotting(req)


@app.post("/api/brand-association", response_model=BrandAssociationResponse, tags=["Agents"])
async def brand_association(req: BrandAssociationRequest):
    """
    Agent 6: Brand Association NLP
    Word2Vec semantic map, thematic roles, VSM, competitor comparison.
    """
    logger.info(f"[Agent-6] Brand association: '{req.brand}'")
    return await run_brand_association(req)


@app.post("/api/persona-generator", response_model=PersonaGeneratorResponse, tags=["Agents"])
async def persona_generator(req: PersonaGeneratorRequest):
    """
    Agent 7: Persona Generator
    Clustering, morphology, embedding analysis → rich user personas.
    """
    logger.info(f"[Agent-7] Persona gen: {len(req.raw_text_samples)} samples, {req.n_personas} personas")
    return await run_persona_generator(req)


@app.post("/api/compliance-check", response_model=ComplianceResponse, tags=["Agents"])
async def compliance_check(req: ComplianceRequest):
    """
    Agent 8: Regulatory Compliance Checker
    GDPR/CCPA/HIPAA rule scanning, dependency parsing, NER, risk scoring.
    """
    logger.info(f"[Agent-8] Compliance check: {req.regulations}")
    return await run_compliance_check(req)

# ═══════════════════════════════════════════════════════════════════════════════
# ENTERPRISE FEATURE ROUTES  (Features 1–4)
# ═══════════════════════════════════════════════════════════════════════════════

from fastapi import File, Form, UploadFile
from agents.rag_engine import run_rag_query, ingest_document, get_index_stats
from agents.diligence_agent import run_diligence_analysis
from agents.report_generator import run_report_generation
from agents.risk_agent import run_risk_monitoring
from models.schemas import (
    RagQueryRequest, RagQueryResponse, RagIngestRequest, RagIngestResponse, RagStatsResponse,
    DiligenceResponse,
    ReportRequest, ReportResponse,
    RiskAlertsResponse,
)


# ── Feature 1: RAG Engine ─────────────────────────────────────────────────────

@app.post("/api/rag/query", response_model=RagQueryResponse, tags=["Enterprise Features"])
async def rag_query(req: RagQueryRequest):
    """
    Feature 1: Enterprise Knowledge RAG Query
    Retrieves top-k context chunks from FAISS, passes to Ollama with session history.
    """
    logger.info(f"[RAG] Query: '{req.query}' | session: {req.session_id}")
    try:
        result = await run_rag_query(req.query, req.session_id)
        return result
    except Exception as e:
        logger.error(f"[RAG] Query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"RAG query failed: {str(e)[:200]}")


@app.post("/api/rag/ingest", response_model=RagIngestResponse, tags=["Enterprise Features"])
async def rag_ingest_text(req: RagIngestRequest):
    """Ingest a plain-text document into the RAG knowledge base."""
    logger.info(f"[RAG] Ingest text — source: '{req.source_name}'")
    try:
        n = ingest_document(req.content, req.source_name)
        return {"chunks_added": n, "source_name": req.source_name, "message": f"Added {n} chunks to knowledge base."}
    except Exception as e:
        logger.error(f"[RAG] Ingest failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ingest failed: {str(e)[:200]}")


@app.post("/api/rag/ingest/file", response_model=RagIngestResponse, tags=["Enterprise Features"])
async def rag_ingest_file(
    file: UploadFile = File(...),
    source_name: str = Form(default=""),
):
    """Ingest an uploaded text or PDF file into the RAG knowledge base."""
    name = source_name or file.filename or "uploaded"
    logger.info(f"[RAG] Ingest file — '{name}'")
    try:
        raw = await file.read()
        if file.filename and file.filename.lower().endswith(".pdf"):
            from agents.diligence_agent import _parse_pdf_bytes
            content = _parse_pdf_bytes(raw)
        else:
            content = raw.decode("utf-8", errors="replace")
        n = ingest_document(content, name)
        return {"chunks_added": n, "source_name": name, "message": f"Added {n} chunks from '{name}'."}
    except Exception as e:
        logger.error(f"[RAG] File ingest failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"File ingest failed: {str(e)[:200]}")


@app.get("/api/rag/stats", response_model=RagStatsResponse, tags=["Enterprise Features"])
async def rag_stats():
    """Return current FAISS index statistics."""
    return get_index_stats()


# ── Feature 2: Due Diligence Agent ───────────────────────────────────────────

@app.post("/api/diligence/analyze", response_model=DiligenceResponse, tags=["Enterprise Features"])
async def diligence_analyze(
    file: UploadFile = File(...),
    query: str = Form(default="Identify key financial risks and obligations"),
):
    """
    Feature 2: Due Diligence Document Analyzer
    Accepts a PDF upload, extracts financial entities, runs NER + LLM risk analysis.
    """
    logger.info(f"[Diligence] Analyzing '{file.filename}' | query: '{query}'")
    try:
        file_bytes = await file.read()
        result = await run_diligence_analysis(file_bytes, query)
        return result
    except Exception as e:
        logger.error(f"[Diligence] Analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Diligence analysis failed: {str(e)[:200]}")


# ── Feature 3: Report Generator ──────────────────────────────────────────────

@app.post("/api/report/generate", response_model=ReportResponse, tags=["Enterprise Features"])
async def report_generate(req: ReportRequest):
    """
    Feature 3: Automated Consulting Report Generator
    Converts structured bullets/metrics/sections into a McKinsey-style report.
    """
    logger.info(f"[Report] Generating: '{req.title}'")
    try:
        result = await run_report_generation(req.model_dump())
        return result
    except Exception as e:
        logger.error(f"[Report] Generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)[:200]}")


# ── Feature 4: Risk Monitoring Agent ─────────────────────────────────────────

@app.get("/api/risk/alerts", response_model=RiskAlertsResponse, tags=["Enterprise Features"])
async def risk_alerts():
    """
    Feature 4: Predictive Risk Monitoring Agent
    Fetches live news, classifies risks, maps supply chain impact, generates executive alert.
    """
    logger.info("[Risk] Running monitoring pipeline")
    try:
        result = await run_risk_monitoring()
        return result
    except Exception as e:
        logger.error(f"[Risk] Monitoring failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Risk monitoring failed: {str(e)[:200]}")


@app.post("/api/market-research/pdf", tags=["Agents"])
async def market_research_pdf(req: MarketResearchRequest):
    """
    Generate a downloadable PDF report for Spectra.
    """
    try:
        # Run full pipeline
        data = await run_market_research(req)

        # Generate PDF
        path = generate_pdf_report(data)

        # Return file
        return FileResponse(
            path,
            media_type="application/pdf",
            filename="spectra_report.pdf",
        )

    except Exception as e:
        logger.error(f"[PDF] Generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="PDF generation failed")