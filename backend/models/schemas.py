"""
models/schemas.py — Pydantic v2 request/response schemas for all 8 agents.
"""
from __future__ import annotations
from typing import Any, Optional, List, Literal, Dict
from pydantic import BaseModel, Field


# ── Shared ────────────────────────────────────────────────────────────────────

class NLPMeta(BaseModel):
    tokens: int = 0
    sentences: int = 0
    entities: list[dict] = []
    pos_tags: list[dict] = []
    processing_time_ms: float = 0.0


# ── Agent 1: Spectra ─────────────────────────────────────────────────────────
class MarketResearchRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=500)
    sources: List[Literal["reddit", "web"]] = Field(default=["reddit", "web"])
    max_results: int = Field(default=10, ge=1, le=50)
    use_exa: bool = False
class Entity(BaseModel):
    """Ranked market entity (ORG or PRODUCT only)."""
    name: str
    count: int
 
 
class Sentiment(BaseModel):
    positive: float
    negative: float
    neutral: float
    overall: Literal["POSITIVE", "NEGATIVE", "NEUTRAL"]
    avg_confidence: float
 
 
class Answer(BaseModel):
    question: str
    answer: str
 
 
class Source(BaseModel):
    title: Optional[str] = None
    url: str
    weight: float = Field(default=1.0, description="Source quality score 0–1")
 
 
class Cluster(BaseModel):
    """Theme cluster derived from embedding similarity."""
    label: str
    summary: str
 
 
class PositioningPoint(BaseModel):
    """2D competitor/product positioning."""
    name: str
    x: float = Field(..., description="Ease of use proxy (sentiment-based, 0–1)")
    y: float = Field(..., description="Feature richness proxy (mention density, 0–1)")
 
 
class TrendPoint(BaseModel):
    """Entity mention frequency for trend bar chart."""
    name: str
    value: int
 
 

class MarketResearchResponse(BaseModel):
    query: str
 
    # Executive summary (LLM-generated, structured)
    summary: str
 
    # Ranked ORG/PRODUCT entities with frequency counts
    entities: List[Entity]
 
    # Sentiment distribution
    sentiment: Sentiment
    sentiment_score: float  # range: -1 to +1
 
    # Structured strategic insights
    insights: List[str]
 
    # Weighted sources
    sources: List[Source]
 
    # Theme clusters
    clusters: List[Cluster]
 
    # Competitor positioning map data
    positioning: List[PositioningPoint]
 
    # Trend data for bar chart
    trends: List[TrendPoint]
 
    # QA answers
    answers: List[Answer]
 
    # Processing metadata (minimal)
    nlp_meta: NLPMeta

# ── Agent 2: Documentation Comparator ────────────────────────────────────────

class DocComparatorRequest(BaseModel):
    doc_a: str = Field(..., min_length=10)
    doc_b: str = Field(..., min_length=10)
    label_a: str = "Document A"
    label_b: str = "Document B"

class DocComparatorResponse(BaseModel):
    label_a: str
    label_b: str
    summary_a: str
    summary_b: str
    llm_verdict: Optional[str] = None
    features_only_a: list[str]
    features_only_b: list[str]
    shared_features: list[str]
    pros_a: list[str]
    cons_a: list[str]
    pros_b: list[str]
    cons_b: list[str]
    similarity_score: float
    morphological_insights: dict
    nlp_meta: NLPMeta


# ── Agent 3: Knowledge Graph ──────────────────────────────────────────────────

class KnowledgeGraphRequest(BaseModel):
    text: str = Field(..., min_length=20)
    max_nodes: int = Field(default=40, ge=5, le=100)

class KGNode(BaseModel):
    id: str
    label: str
    type: str
    weight: float = 1.0

class KGEdge(BaseModel):
    source: str
    target: str
    relation: str
    weight: float = 1.0

class KnowledgeGraphResponse(BaseModel):
    nodes: list[KGNode]
    edges: list[KGEdge]
    clusters: list[dict]
    nlp_meta: NLPMeta


# ── Agent 4: Review Analysis ──────────────────────────────────────────────────

class SentimentScores(BaseModel):
    positive: float
    negative: float
    neutral: float
    avg_confidence: float


class AspectSentiment(BaseModel):
    aspect: str
    mentions: int
    positive_pct: float
    negative_pct: float
    avg_score: float
    llm_insight: Optional[str] = None


class Cluster(BaseModel):
    cluster_id: int
    size: int
    theme: str
    samples: List[str]


class ReviewAnalysisRequest(BaseModel):
    product_name: str = Field(..., min_length=2)
    reviews: List[str] = Field(..., min_length=1)
    use_embeddings: bool = True


class ReviewAnalysisResponse(BaseModel):
    product_name: str
    overall_sentiment: str
    sentiment_scores: SentimentScores
    aspect_sentiments: List[AspectSentiment]
    top_positive_phrases: List[str]
    top_negative_phrases: List[str]
    embedding_clusters: List[Cluster]
    bow_top_terms: List[dict]
    nlp_meta: NLPMeta

# ── Agent 5: Trend Spotting ───────────────────────────────────────────────────

class TrendSpottingRequest(BaseModel):
    texts: list[str] = Field(..., min_length=2)
    timestamps: Optional[list[str]] = None
    n_topics: int = Field(default=5, ge=2, le=15)
    ngram_range: list[int] = Field(default=[1, 2])

class TrendSpottingResponse(BaseModel):
    topics: list[dict]
    trending_ngrams: list[dict]
    temporal_trend: list[dict]
    topic_evolution: list[dict]
    nlp_meta: NLPMeta
    anomalies: list[dict]


# ── Agent 6: Brand Association ────────────────────────────────────────────────

class BrandAssociationRequest(BaseModel):
    brand: str = Field(..., min_length=1)
    corpus: list[str] = Field(..., min_length=3)
    competitor_brands: list[str] = []

class BrandAssociationResponse(BaseModel):
    brand: str
    semantic_map: list[dict]
    thematic_roles: list[dict]
    association_strength: dict
    competitor_comparison: list[dict]
    vsm_top_terms: list[dict]
    nlp_meta: NLPMeta


# ── Agent 7: Persona Generator ────────────────────────────────────────────────

class PersonaGeneratorRequest(BaseModel):
    raw_text_samples: list[str] = Field(..., min_length=3)
    n_personas: int = Field(default=3, ge=1, le=6)
    context: str = ""

class Persona(BaseModel):
    name: str
    archetype: str
    demographics: dict
    psychographics: dict
    pain_points: list[str]
    goals: list[str]
    language_style: dict
    representative_quote: str

class PersonaGeneratorResponse(BaseModel):
    personas: list[Persona]
    cluster_info: list[dict]
    morphological_profile: dict
    embedding_distances: list[dict]
    nlp_meta: NLPMeta


# ── Agent 8: Compliance Checker (Hybrid RAG) ──────────────────────────────────
 
class ComplianceRequest(BaseModel):
    document: str = Field(..., min_length=20)
    regulations: list[str] = Field(default=["GDPR", "CCPA", "HIPAA"])
    custom_rules: list[str] = []
 
 
class ComplianceIssue(BaseModel):
    rule: str
    law: str = ""                   # e.g. "GDPR", "HIPAA"
    article: str = ""               # e.g. "Article 17", "164.312"
    severity: str                   # "HIGH" | "MEDIUM" | "LOW" | "CRITICAL"
    excerpt: str                    # offending text from user document
    law_excerpt: str = ""           # retrieved law chunk used for grounding
    explanation: str = ""           # LLM/NLI explanation grounded in law
    suggestion: str
    confidence: float = 0.0         # retrieval + NLI confidence [0-1]
    sentence_index: int = -1
 
 
class ComplianceResponse(BaseModel):
    overall_risk: str               # "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    risk_score: float               # 0–100
    issues: list[ComplianceIssue]
    recommendations: list[str]      # deduplicated actionable steps
    compliant_sections: list[str]
    entities: list[dict]            # renamed from ner_findings
    nlp_meta: NLPMeta


# ═══════════════════════════════════════════════════════════════════════════════
# Feature 1: Enterprise Knowledge RAG Engine
# ═══════════════════════════════════════════════════════════════════════════════

class RagQueryRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=500)
    session_id: str = Field(default="default")


class RagIngestRequest(BaseModel):
    content: str = Field(..., min_length=20)
    source_name: str = Field(default="manual-upload")


class RagSource(BaseModel):
    source: str
    text: str
    score: float


class RagQueryResponse(BaseModel):
    answer: str
    sources: List[RagSource]
    processing_time_ms: float


class RagIngestResponse(BaseModel):
    chunks_added: int
    source_name: str
    message: str


class RagStatsResponse(BaseModel):
    total_chunks: int
    total_sources: int
    sources: List[str]


# ═══════════════════════════════════════════════════════════════════════════════
# Feature 2: Due Diligence Document Analyzer
# ═══════════════════════════════════════════════════════════════════════════════

class DiligenceRisk(BaseModel):
    risk: str
    severity: str = "MEDIUM"
    detail: str = ""


class DiligenceResponse(BaseModel):
    summary: str
    financial_highlights: List[str]   # 🔥 ADD THIS
    extracted_entities: dict
    ner_entities: List[dict]
    risks: List[DiligenceRisk]
    verdict: str                     # 🔥 ADD
    verdict_reasoning: str = ""      # 🔥 ADD
    worst_case_scenario: str         # 🔥 ADD
    confidence_score: float          # 🔥 ADD
    rag_context: List[dict]
    processing_time_ms: float
    risk_counts: Dict[str, int] = {}  


# ═══════════════════════════════════════════════════════════════════════════════
# Feature 3: Automated Report Generator
# ═══════════════════════════════════════════════════════════════════════════════
class ReportSection(BaseModel):
    heading: str
    content: str


class ReportRequest(BaseModel):
    title: str = "Strategic Analysis Report"
    executive_summary: str = ""
    bullet_points: List[str] = []
    metrics: Dict[str, str] = {}
    sections: List[ReportSection] = []
    bulk_input: Optional[str] = ""


class ChartDataPoint(BaseModel):
    label: str
    value: float


class Chart(BaseModel):
    type: str
    title: str
    data: List[ChartDataPoint]


class ReportResponse(BaseModel):
    report_text: str
    structured_input: str
    suggested_visuals: List[str]
    charts: List[Chart] = []
    metrics: Dict[str, str] = {}
    processing_time_ms: float

# ═══════════════════════════════════════════════════════════════════════════════
# Feature 4: Predictive Risk Monitoring Agent
# ═══════════════════════════════════════════════════════════════════════════════

class RiskEvent(BaseModel):
    title: str
    description: str
    url: str = ""
    source: str = ""
    categories: List[str]
    keywords: List[str]
    severity: str
    key_sentences: List[str] = []


class SupplyChainNode(BaseModel):
    id: str
    affected: List[str]


class SupplyChainEdge(BaseModel):
    source: str
    target: str


class SupplyChainImpact(BaseModel):
    nodes: List[SupplyChainNode]
    edges: List[SupplyChainEdge]
    most_affected: str


class RiskAlertsResponse(BaseModel):
    detected_risks: List[RiskEvent]
    supply_chain_impact: SupplyChainImpact
    impact_analysis: str
    recommendations: List[str]
    risk_level: str
    total_articles_scanned: int
    processing_time_ms: float