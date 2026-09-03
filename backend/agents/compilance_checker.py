"""
agents/compliance_checker.py — Agent 8: Hybrid RAG Compliance Checker
═══════════════════════════════════════════════════════════════════════
Architecture:
  • Law corpus built from GDPR articles + HIPAA breach dataset at startup
  • BM25 (rank-bm25) + FAISS semantic search → weighted hybrid retrieval
  • Embeddings computed ONCE at startup; FAISS index held in memory
  • Per-request: embed input sentence (lightweight) → retrieve law chunks
  • NLI (DeBERTa zero-shot) classifies compliance against retrieved law
  • Ollama LLM generates grounded explanations + recommendations
  • Output: strict frontend-ready JSON per ComplianceResponse schema
"""
from __future__ import annotations

import csv
import os
import re
import time
import textwrap
import logging
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Dataset paths  (adjust to your deployment layout)
# ─────────────────────────────────────────────────────────────────────────────
GDPR_CSV  = Path( "agents/compliance-data/GDPR.csv")
HIPAA_CSV = Path( "agents/compliance-data/HIPAA.csv")
_EMBED_MODEL = None



# ─────────────────────────────────────────────────────────────────────────────
# Lazy-import helpers
# ─────────────────────────────────────────────────────────────────────────────
def _get_sentence_transformer():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("all-MiniLM-L6-v2")
def _get_embed_model():
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        _EMBED_MODEL = _get_sentence_transformer()
    return _EMBED_MODEL

def _get_faiss():
    import faiss
    return faiss

def _get_bm25_class():
    from rank_bm25 import BM25Okapi
    return BM25Okapi

def _get_nli_pipeline():
    from transformers import pipeline as hf_pipeline
    return hf_pipeline(
        "zero-shot-classification",
        model="cross-encoder/nli-deberta-v3-small",
        device=-1,
    )


# ═════════════════════════════════════════════════════════════════════════════
# Law corpus loader + chunker
# ═════════════════════════════════════════════════════════════════════════════

def _clean(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text


def _chunk_text(text: str, max_words: int = 120) -> list[str]:
    """Split long text into ≤max_words overlapping chunks (50-word stride)."""
    words = text.split()
    if len(words) <= max_words:
        return [text]
    chunks, stride = [], max_words // 2
    for i in range(0, len(words), stride):
        chunk = " ".join(words[i:i + max_words])
        if chunk:
            chunks.append(chunk)
        if i + max_words >= len(words):
            break
    return chunks or [text]


def _load_gdpr_corpus(path: Path) -> list[dict]:
    """
    Load GDPR CSV → list of law chunks with metadata.
    Fields used: Content, Article Number, Article Name.
    De-duplicates by article number (one canonical article text per article).
    """
    chunks = []
    seen_articles: dict[str, str] = {}

    if not path.exists():
        logger.warning(f"GDPR CSV not found at {path}; using empty corpus")
        return []

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            art_num  = row.get("Article Number", "").strip()
            art_name = row.get("Article Name",   "").strip()
            content  = _clean(row.get("Content", ""))
            if not content or art_num in seen_articles:
                continue
            seen_articles[art_num] = content

            for chunk in _chunk_text(content, max_words=120):
                chunks.append({
                    "law":     "GDPR",
                    "article": f"Article {art_num}",
                    "section": art_name,
                    "text":    chunk,
                })

    logger.info(f"GDPR corpus: {len(chunks)} chunks from {len(seen_articles)} articles")
    return chunks


def _load_hipaa_corpus(path: Path) -> list[dict]:
    """
    Load HIPAA breach CSV → law chunks derived from breach descriptions.
    These act as case-law examples grounding HIPAA safeguard requirements.
    """
    chunks = []

    if not path.exists():
        logger.warning(f"HIPAA CSV not found at {path}; using empty corpus")
        return []

    # Augment with canonical HIPAA rule text (hard-coded key sections)
    HIPAA_RULES = [
        {"article": "45 CFR §164.312", "section": "Technical Safeguards",
         "text": "Covered entities must implement technical security measures to guard against unauthorized access to ePHI transmitted over electronic communications networks. This includes encryption, access controls, audit controls, and integrity controls for all electronic protected health information."},
        {"article": "45 CFR §164.502", "section": "Minimum Necessary",
         "text": "Covered entities must make reasonable efforts to limit the use or disclosure of protected health information to the minimum necessary to accomplish the intended purpose. This minimum necessary standard does not apply to disclosures to or requests by a healthcare provider for treatment purposes."},
        {"article": "45 CFR §164.514", "section": "De-identification",
         "text": "Health information is not individually identifiable if it does not identify an individual and the covered entity has no reasonable basis to believe it can be used to identify an individual. De-identification methods include expert determination and the safe harbor method removing 18 specified identifiers."},
        {"article": "45 CFR §164.308", "section": "Administrative Safeguards",
         "text": "Covered entities must implement policies and procedures to prevent, detect, contain, and correct security violations. This includes risk analysis, risk management, workforce training, access management, and security incident response procedures."},
        {"article": "45 CFR §164.530", "section": "Administrative Requirements",
         "text": "Covered entities must designate a privacy official, train workforce members on privacy policies, apply appropriate sanctions against workforce members who violate privacy policies, and maintain documentation of policies and procedures."},
        {"article": "45 CFR §164.404", "section": "Breach Notification",
         "text": "Covered entities must notify each individual whose unsecured protected health information has been or is reasonably believed to have been accessed, acquired, used, or disclosed as a result of a breach. Notification must be provided without unreasonable delay and in no case later than 60 calendar days after discovery."},
    ]
    for rule in HIPAA_RULES:
        chunks.append({
            "law":     "HIPAA",
            "article": rule["article"],
            "section": rule["section"],
            "text":    rule["text"],
        })

    # Breach descriptions as case-law examples (sample 300 to keep index size reasonable)
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        breach_rows = [r for r in reader if r.get("Web Description", "").strip() not in ("", r"\N")]

    import random
    random.seed(42)
    sample = random.sample(breach_rows, min(300, len(breach_rows)))

    for row in sample:
        desc    = _clean(row.get("Web Description", ""))
        b_type  = row.get("Type of Breach", "Unknown breach")
        loc     = row.get("Location of Breached Information", "")
        section = f"Breach example — {b_type}"
        if loc:
            section += f" ({loc})"
        for chunk in _chunk_text(desc, max_words=100):
            chunks.append({
                "law":     "HIPAA",
                "article": "Breach Report",
                "section": section,
                "text":    chunk,
            })

    logger.info(f"HIPAA corpus: {len(chunks)} chunks")
    return chunks


# ═════════════════════════════════════════════════════════════════════════════
# HybridRetriever — BM25 + FAISS, built once at startup
# ═════════════════════════════════════════════════════════════════════════════

class HybridRetriever:
    """
    Hybrid BM25 + dense FAISS retriever over a static law corpus.

    Usage:
        retriever = HybridRetriever.build(chunks)
        results   = retriever.retrieve(query, top_k=5, law_filter=["GDPR"])
    """

    def __init__(
        self,
        chunks:       list[dict],
        embeddings:   np.ndarray,
        faiss_index,
        bm25,
        tokenized:    list[list[str]],
    ):
        self.chunks      = chunks
        self.embeddings  = embeddings  # shape (N, D), float32, L2-normalised
        self.faiss_index = faiss_index
        self.bm25        = bm25
        self.tokenized   = tokenized

    # ── Factory ──────────────────────────────────────────────────────────────

    @classmethod
    def build(cls, chunks: list[dict]) -> "HybridRetriever":
        if not chunks:
            raise ValueError("Cannot build retriever from empty corpus")

        texts = [c["text"] for c in chunks]

        # ── Dense embeddings (batch, normalised) ─────────────────────────────
        logger.info("Building dense embeddings for law corpus…")
        model = _get_embed_model()
        embs = model.encode(
            texts,
            batch_size=64,
            normalize_embeddings=True,
            show_progress_bar=False,
        ).astype(np.float32)          # (N, 384)

        # ── FAISS inner-product index (≡ cosine on normalised vectors) ────────
        faiss = _get_faiss()
        dim   = embs.shape[1]
        index = faiss.IndexFlatIP(dim)
        index.add(embs)
        logger.info(f"FAISS index built: {index.ntotal} vectors, dim={dim}")

        # ── BM25 ─────────────────────────────────────────────────────────────
        tokenized = [t.lower().split() for t in texts]
        BM25      = _get_bm25_class()
        bm25      = BM25(tokenized)
        logger.info("BM25 index built")

        return cls(chunks, embs, index, bm25, tokenized)

    # ── Retrieval ─────────────────────────────────────────────────────────────

    def retrieve(
        self,
        query:       str,
        top_k:       int  = 5,
        law_filter:  Optional[list[str]] = None,
        sem_weight:  float = 0.6,
        bm25_weight: float = 0.4,
    ) -> list[dict]:
        """
        Returns top_k law chunks ranked by weighted hybrid score.
        Each result: {text, law, article, section, score, bm25_score, sem_score}
        """
        N = len(self.chunks)
        if N == 0:
            return []

        q_lower = query.lower()

        # ── Dense retrieval ───────────────────────────────────────────────────
        model = _get_embed_model()
        q_emb  = model.encode([query], normalize_embeddings=True).astype(np.float32)
        k_faiss = min(top_k * 4, N)
        sem_scores_raw, faiss_idxs = self.faiss_index.search(q_emb, k_faiss)
        sem_scores_raw = sem_scores_raw[0]    # (k,)
        faiss_idxs     = faiss_idxs[0]

        # ── BM25 retrieval ────────────────────────────────────────────────────
        bm25_scores = np.array(self.bm25.get_scores(q_lower.split()), dtype=np.float32)
        bm25_max    = bm25_scores.max() + 1e-9
        bm25_norm   = bm25_scores / bm25_max   # normalise to [0,1]

        # ── Merge: build score array over all N ───────────────────────────────
        sem_all = np.zeros(N, dtype=np.float32)
        for rank_idx, corpus_idx in enumerate(faiss_idxs):
            if corpus_idx >= 0:
                sem_all[corpus_idx] = float(sem_scores_raw[rank_idx])

        hybrid = sem_weight * sem_all + bm25_weight * bm25_norm

        # ── Law filter ────────────────────────────────────────────────────────
        if law_filter:
            law_filter_upper = {l.upper() for l in law_filter}
            for i, chunk in enumerate(self.chunks):
                if chunk["law"].upper() not in law_filter_upper:
                    hybrid[i] = -1.0

        # ── Top-k ─────────────────────────────────────────────────────────────
        top_indices = np.argsort(hybrid)[::-1][:top_k]
        results = []
        for idx in top_indices:
            if hybrid[idx] < 0:
                continue
            chunk = self.chunks[idx]
            results.append({
                **chunk,
                "score":      float(hybrid[idx]),
                "sem_score":  float(sem_all[idx]),
                "bm25_score": float(bm25_norm[idx]),
            })
        return results


# ═════════════════════════════════════════════════════════════════════════════
# Global startup — load ONCE
# ═════════════════════════════════════════════════════════════════════════════

_RETRIEVER: Optional[HybridRetriever] = None
_LAW_CORPUS: list[dict] = []
_NLI_PIPELINE = None


def _get_retriever() -> HybridRetriever:
    global _RETRIEVER
    if _RETRIEVER is None:
        logger.info("Initialising law corpus retriever…")
        corpus = _load_gdpr_corpus(GDPR_CSV) + _load_hipaa_corpus(HIPAA_CSV)

        if not corpus:
            # Minimal hard-coded fallback so the system doesn't crash
            logger.warning("Both dataset files missing — using minimal built-in corpus")
            corpus = _BUILTIN_FALLBACK_CORPUS

        _RETRIEVER = HybridRetriever.build(corpus)
        logger.info(f"Retriever ready: {len(corpus)} law chunks indexed")
    return _RETRIEVER


def get_nli_pipeline():
    global _NLI_PIPELINE
    if _NLI_PIPELINE is None:
        try:
            _NLI_PIPELINE = _get_nli_pipeline()
            logger.info("NLI pipeline loaded")
        except Exception as e:
            logger.warning(f"NLI pipeline unavailable: {e}")
    return _NLI_PIPELINE


# ── Minimal built-in fallback corpus (used when CSVs are absent) ─────────────
_BUILTIN_FALLBACK_CORPUS = [
    {"law": "GDPR", "article": "Article 6",  "section": "Lawfulness of processing",
     "text": "Processing shall be lawful only if at least one of the following applies: the data subject has given consent; processing is necessary for the performance of a contract; processing is necessary for compliance with a legal obligation."},
    {"law": "GDPR", "article": "Article 17", "section": "Right to erasure",
     "text": "The data subject shall have the right to obtain from the controller the erasure of personal data concerning him or her without undue delay where the personal data are no longer necessary, consent is withdrawn, or the data subject objects to processing."},
    {"law": "GDPR", "article": "Article 32", "section": "Security of processing",
     "text": "The controller and processor shall implement appropriate technical and organisational measures including encryption of personal data, the ability to ensure ongoing confidentiality and integrity."},
    {"law": "GDPR", "article": "Article 13", "section": "Transparency",
     "text": "The controller shall provide the data subject with information about the identity of the controller, purposes of the processing, the recipients of the data, and the data subject's rights."},
    {"law": "GDPR", "article": "Article 20", "section": "Data portability",
     "text": "The data subject shall have the right to receive personal data in a structured, commonly used, machine-readable format and have the right to transmit that data to another controller."},
    {"law": "HIPAA", "article": "45 CFR §164.312", "section": "Technical Safeguards",
     "text": "Implement technical security measures to guard against unauthorized access to ePHI. Required specifications include access control and audit controls. Addressable specifications include encryption and decryption."},
    {"law": "HIPAA", "article": "45 CFR §164.502", "section": "Minimum Necessary",
     "text": "Covered entities must make reasonable efforts to limit PHI disclosure to the minimum necessary to accomplish the intended purpose."},
]


# ═════════════════════════════════════════════════════════════════════════════
# Compliance rules — lightweight descriptors (used for BM25 query building)
# ═════════════════════════════════════════════════════════════════════════════

REGULATION_RULES: dict[str, list[dict]] = {
    "GDPR": [
        {"id": "GDPR-6",  "law": "GDPR", "article": "Article 6",
         "description": "Lawful basis for processing personal data",
         "query": "lawful basis processing personal data consent legitimate interest contract",
         "trigger_patterns": [r"personal\s+data", r"process(?:ing)?\s+data", r"collect(?:ing)?\s+information"],
         "severity": "HIGH",
         "suggestion": "Specify the lawful basis for data processing (Art. 6 GDPR): consent, contract, legal obligation, vital interests, public task, or legitimate interest."},
        {"id": "GDPR-17", "law": "GDPR", "article": "Article 17",
         "description": "Right to erasure (right to be forgotten)",
         "query": "right erasure deletion data subject personal data removal",
         "trigger_patterns": [r"retain(?:ing)?\s+data", r"stor(?:e|ing)\s+data", r"keep(?:ing)?\s+records", r"indefinitely"],
         "severity": "HIGH",
         "suggestion": "Include a right-to-erasure provision (Art. 17 GDPR). Users must be able to request deletion of their data."},
        {"id": "GDPR-32", "law": "GDPR", "article": "Article 32",
         "description": "Security of processing — encryption and safeguards",
         "query": "encryption security technical measures pseudonymisation confidentiality",
         "trigger_patterns": [r"password", r"plain\s+text", r"unencrypt", r"no\s+encrypt"],
         "severity": "HIGH",
         "suggestion": "Implement and document appropriate technical safeguards including encryption (Art. 32 GDPR)."},
        {"id": "GDPR-13", "law": "GDPR", "article": "Article 13",
         "description": "Transparency — privacy notice",
         "query": "privacy notice transparency controller contact purpose rights data subject",
         "trigger_patterns": [r"privacy\s+polic", r"data\s+polic"],
         "severity": "MEDIUM",
         "suggestion": "Privacy notice must include controller contact details, processing purposes, and data subject rights (Art. 13 GDPR)."},
        {"id": "GDPR-20", "law": "GDPR", "article": "Article 20",
         "description": "Right to data portability",
         "query": "data portability structured machine readable format transfer controller",
         "trigger_patterns": [r"export\s+data", r"transfer\s+data", r"data\s+portab"],
         "severity": "MEDIUM",
         "suggestion": "Provide data portability (Art. 20 GDPR): users must be able to receive their data in a machine-readable format."},
    ],
    "CCPA": [
        {"id": "CCPA-1798.100", "law": "CCPA", "article": "§ 1798.100",
         "description": "Right to know about personal information collected",
         "query": "right know categories personal information collected consumers disclosure",
         "trigger_patterns": [r"collect(?:ing)?\s+(personal|user)\s+(?:data|information)"],
         "severity": "HIGH",
         "suggestion": "Disclose the categories of personal information collected (CCPA § 1798.100)."},
        {"id": "CCPA-1798.120", "law": "CCPA", "article": "§ 1798.120",
         "description": "Right to opt-out of sale of personal information",
         "query": "opt out sale personal information do not sell third party",
         "trigger_patterns": [r"sell(?:ing)?\s+(data|information)", r"third.party\s+shar"],
         "severity": "HIGH",
         "suggestion": "Provide an opt-out mechanism for the sale of personal information (CCPA § 1798.120)."},
        {"id": "CCPA-1798.105", "law": "CCPA", "article": "§ 1798.105",
         "description": "Right to deletion of personal information",
         "query": "right delete deletion personal information consumer request",
         "trigger_patterns": [r"personal\s+information", r"consumer\s+data"],
         "severity": "HIGH",
         "suggestion": "Include a right-to-deletion provision for consumer personal information (CCPA § 1798.105)."},
    ],
    "HIPAA": [
        {"id": "HIPAA-164.312", "law": "HIPAA", "article": "45 CFR §164.312",
         "description": "Technical safeguards for PHI",
         "query": "technical safeguards PHI encryption access control audit ePHI protected health information",
         "trigger_patterns": [r"health\s+(information|data|record)", r"medical\s+(data|record)", r"\bPHI\b"],
         "severity": "HIGH",
         "suggestion": "Implement encryption, access controls, and audit logging for PHI (HIPAA §164.312)."},
        {"id": "HIPAA-164.502", "law": "HIPAA", "article": "45 CFR §164.502",
         "description": "Minimum necessary use and disclosure of PHI",
         "query": "minimum necessary PHI disclosure health information limited need to know",
         "trigger_patterns": [r"share\s+health", r"disclose\s+(?:health|medical)", r"transfer\s+(?:health|medical)"],
         "severity": "HIGH",
         "suggestion": "State that PHI disclosure is limited to the minimum necessary (HIPAA §164.502)."},
        {"id": "HIPAA-164.514", "law": "HIPAA", "article": "45 CFR §164.514",
         "description": "De-identification of PHI",
         "query": "de-identification anonymization safe harbor expert determination PHI identifiers",
         "trigger_patterns": [r"de.identif", r"anon(?:ymize|ymous)", r"identif(?:y|ier)\s+remov"],
         "severity": "MEDIUM",
         "suggestion": "Describe de-identification method: expert determination or safe harbor (HIPAA §164.514)."},
        {"id": "HIPAA-164.404", "law": "HIPAA", "article": "45 CFR §164.404",
         "description": "Breach notification requirements",
         "query": "breach notification individuals affected unauthorized access PHI 60 days",
         "trigger_patterns": [r"breach", r"unauthori[sz]ed\s+access", r"data\s+incident"],
         "severity": "HIGH",
         "suggestion": "Define breach notification procedures: notify affected individuals within 60 days (HIPAA §164.404)."},
    ],
}


# ═════════════════════════════════════════════════════════════════════════════
# NLI compliance classification
# ═════════════════════════════════════════════════════════════════════════════

def _nli_classify(sentence, law_text, nli_pipeline):
    if nli_pipeline is None:
        return "unclear", 0.5

    try:
        combined = f"""
        Does this violate the regulation?

        USER TEXT:
        {sentence}

        LAW REQUIREMENT:
        {law_text}
        """

        result = nli_pipeline(
            combined,
            candidate_labels=["violation", "compliant", "unclear"]
        )

        label = result["labels"][0]
        score = result["scores"][0]

        return label, score

    except Exception as e:
        logger.warning(f"NLI error: {e}")
        return "unclear", 0.5
# ═════════════════════════════════════════════════════════════════════════════
# Sentence segmentation
# ═════════════════════════════════════════════════════════════════════════════

def _segment_sentences(text: str) -> list[str]:
    try:
        import nltk
        try:
            return nltk.sent_tokenize(text)
        except LookupError:
            nltk.download("punkt", quiet=True)
            nltk.download("punkt_tab", quiet=True)
            return nltk.sent_tokenize(text)
    except ImportError:
        pass
    # Fallback: simple regex splitter
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text)
    return [p.strip() for p in parts if len(p.split()) > 3]


# ═════════════════════════════════════════════════════════════════════════════
# Named entity extraction (lightweight)
# ═════════════════════════════════════════════════════════════════════════════

def _extract_entities(text: str) -> list[dict]:
    try:
        import spacy
        try:
            nlp = spacy.load("en_core_web_sm")
        except OSError:
            return []
        doc = nlp(text[:5000])
        seen: set[str] = set()
        out = []
        for ent in doc.ents:
            key = (ent.text.strip(), ent.label_)
            if key not in seen and ent.label_ in ("PERSON", "ORG", "GPE", "LAW", "PRODUCT", "DATE"):
                seen.add(key)
                out.append({"text": ent.text.strip(), "label": ent.label_})
        return out[:30]
    except Exception:
        return []


# ═════════════════════════════════════════════════════════════════════════════
# Risk scoring
# ═════════════════════════════════════════════════════════════════════════════

def _compute_risk_score(issues: list) -> float:
    weights = {"CRITICAL": 4.0, "HIGH": 3.0, "MEDIUM": 1.5, "LOW": 0.5}
    total = sum(
        weights.get((i.severity or "MEDIUM").upper(), 1.0) * (0.4 + (i.confidence or 0.5) * 0.6)
        for i in issues
    )
    return min(round(total * 6, 1), 100.0)


# ═════════════════════════════════════════════════════════════════════════════
# LLM explanation + recommendations
# ═════════════════════════════════════════════════════════════════════════════

async def _llm_explain_issue(
    user_excerpt: str,
    law_excerpt:  str,
    rule_id:      str,
    suggestion:   str,
    ollama_generate,
) -> str:
    prompt = (
        f"You are a compliance attorney. Explain why the following text violates {rule_id}.\n\n"
        f"Document text: \"{user_excerpt[:300]}\"\n\n"
        f"Relevant law: \"{law_excerpt[:300]}\"\n\n"
        f"Write 1–2 sentences referencing the specific legal requirement. Be direct and concrete."
    )
    result = await ollama_generate(prompt, temperature=0.1, max_tokens=150)
    if result and not result.startswith("["):
        return result.strip()
    return suggestion


async def _llm_recommendations(
    issues: list,
    regulations: list[str],
    ollama_generate,
) -> list[str]:
    if not issues:
        return []
    issue_summary = "\n".join(
        f"- [{i.severity}] {i.rule}: {i.suggestion}" for i in issues[:8]
    )
    prompt = (
        f"You are a senior data protection officer. Given these compliance issues for {', '.join(regulations)}:\n\n"
        f"{issue_summary}\n\n"
        f"List the top 5 prioritised remediation actions, ordered by urgency. "
        f"Each action on a new line starting with a number. Be specific and actionable."
    )
    result = await ollama_generate(prompt, temperature=0.2, max_tokens=400)
    if result and not result.startswith("["):
        lines = [l.strip() for l in result.split("\n") if l.strip() and not l.strip().startswith("#")]
        # Strip leading "1. " etc.
        cleaned = [re.sub(r"^\d+[\.\)]\s*", "", l) for l in lines if len(l) > 10]
        return cleaned[:6]
    # Fallback: deduplicate suggestions
    seen: set[str] = set()
    recs = []
    for i in issues:
        if i.suggestion and i.suggestion not in seen:
            seen.add(i.suggestion)
            recs.append(i.suggestion)
    return recs[:6]


# ═════════════════════════════════════════════════════════════════════════════
# Main compliance check pipeline
# ═════════════════════════════════════════════════════════════════════════════

async def run_compliance_check(req) -> dict:
    """
    Main entrypoint.  req: ComplianceRequest
    Returns a dict matching ComplianceResponse schema.
    """
    from models.schemas import ComplianceIssue, ComplianceResponse, NLPMeta
    from llm_client import ollama_generate

    t0 = time.time()
    text = req.document

    # ── 1. Sentence segmentation ──────────────────────────────────────────────
    sentences = [s for s in _segment_sentences(text) if len(s.split()) > 3]
    if not sentences:
        sentences = [text]

    # ── 2. Get global retriever (loads once) ──────────────────────────────────
    try:
        retriever = _get_retriever()
    except Exception as e:
        logger.error(f"Retriever init failed: {e}")
        retriever = None

    # ── 3. NLI pipeline ───────────────────────────────────────────────────────
    nli = get_nli_pipeline()

    # ── 4. Named entities ─────────────────────────────────────────────────────
    entities = _extract_entities(text)

    # ── 5. Core compliance checking ───────────────────────────────────────────
    issues: list[ComplianceIssue] = []
    compliant_sections: list[str] = []

    for reg in req.regulations:
        rules = REGULATION_RULES.get(reg.upper(), [])
        for rule in rules:
            triggered: list[tuple[int, str]] = []

            # Find sentences that match trigger patterns
            for i, sent in enumerate(sentences):
                sl = sent.lower()
                if any(re.search(p, sl) for p in rule["trigger_patterns"]):
                    triggered.append((i, sent))

            if not triggered:
                # No trigger → skip (rule may simply not apply to this document)
                continue

            for sent_idx, sent in triggered:
                # ── Hybrid retrieval over law corpus ──────────────────────────
                law_chunks: list[dict] = []
                if retriever:
                    try:
                        law_chunks = retriever.retrieve(
                           f"{rule['description']} {rule['query']} {sent[:120]}",
                            top_k=4,
                            law_filter=[reg] if reg in ("GDPR", "HIPAA") else None,
                        )
                    except Exception as e:
                        logger.warning(f"Retrieval failed: {e}")

                best_chunk = law_chunks[0] if law_chunks else {
                    "text": rule["description"], "article": rule["article"], "score": 0.5
                }
                law_excerpt = best_chunk["text"][:250]
                retrieval_score = float(best_chunk.get("score", 0.5))

                # ── NLI classification ────────────────────────────────────────
                nli_label, nli_conf = _nli_classify(sent, law_excerpt, nli)

                # Hybrid confidence: blend retrieval quality + NLI signal
                confidence = round(0.4 * retrieval_score + 0.6 * nli_conf, 3)

                if nli_label == "violation" and nli_conf > 0.6:
                        severity = rule["severity"]

                elif nli_label == "compliant" and nli_conf > 0.75:
                    compliant_sections.append(
                            f"[{reg}] {rule['id']} — sentence {sent_idx + 1} compliant "
                            f"(conf={confidence:.2f}): \"{sent[:80]}…\""
                        )
                    continue

                else:
                    # treat uncertain as violation (important)
                     severity = rule["severity"]

                # ── LLM explanation (grounded in law) ─────────────────────────
                explanation = await _llm_explain_issue(
                    sent, law_excerpt, rule["id"], rule["suggestion"], ollama_generate
                )

                issues.append(ComplianceIssue(
                    rule=f"[{reg}] {rule['id']}: {rule['description']}",
                    law=rule["law"],
                    article=rule["article"],
                    severity=severity,
                    excerpt=sent[:300],
                    law_excerpt=law_excerpt,
                    explanation=explanation,
                    suggestion=rule["suggestion"],
                    confidence=confidence,
                    sentence_index=sent_idx,
                ))

    # Deduplicate issues by (rule, excerpt[:60])
    seen_keys: set[tuple] = set()
    deduped: list[ComplianceIssue] = []
    for issue in issues:
        key = (issue.rule, issue.excerpt[:60])
        if key not in seen_keys:
            seen_keys.add(key)
            deduped.append(issue)
    issues = deduped

    # ── 6. Custom rule checks ─────────────────────────────────────────────────
    doc_lower = text.lower()
    for custom_rule in req.custom_rules:
        if custom_rule.lower() not in doc_lower:
            issues.append(ComplianceIssue(
                rule=f"[CUSTOM] '{custom_rule}' not found",
                law="CUSTOM",
                article="",
                severity="MEDIUM",
                excerpt="Document does not contain this required term.",
                law_excerpt="",
                explanation=f"The term '{custom_rule}' or its equivalent is absent from the document.",
                suggestion=f"Explicitly include a mention of '{custom_rule}'.",
                confidence=0.9,
                sentence_index=-1,
            ))
    # ── 6.5 Missing critical obligations (NEW) ───────────────────────────────

    # GDPR Article 17 — Right to Erasure
    if "GDPR" in [r.upper() for r in req.regulations]:
        if not any("GDPR-17" in i.rule and i.severity != "LOW" for i in issues):
            issues.append(ComplianceIssue(
                rule="[GDPR] GDPR-17: Right to erasure (missing)",
                law="GDPR",
                article="Article 17",
                severity="HIGH",
                excerpt="No data deletion clause found in document",
                law_excerpt="The data subject shall have the right to obtain erasure of personal data without undue delay.",
                explanation="The document does not specify a user right to delete or erase personal data, which is required under GDPR Article 17.",
                suggestion="Add a clear data deletion mechanism allowing users to request erasure of their personal data.",
                confidence=0.9,
                sentence_index=-1
            ))

    # ── 7. Risk scoring ───────────────────────────────────────────────────────
    risk_score = _compute_risk_score(issues)
    overall_risk = (
        "CRITICAL" if risk_score >= 70 else
        "HIGH"     if risk_score >= 40 else
        "MEDIUM"   if risk_score >= 20 else
        "LOW"
    )

    # ── 8. LLM recommendations ────────────────────────────────────────────────
    recommendations = await _llm_recommendations(issues, req.regulations, ollama_generate)

    # ── 9. NLP metadata ───────────────────────────────────────────────────────
    elapsed_ms = round((time.time() - t0) * 1000, 1)
    nlp_meta = NLPMeta(
        tokens=len(text.split()),
        sentences=len(sentences),
        entities=entities,
        processing_time_ms=elapsed_ms,
    )

    return ComplianceResponse(
        overall_risk=overall_risk,
        risk_score=risk_score,
        issues=issues,
        recommendations=recommendations,
        compliant_sections=compliant_sections[:20],
        entities=entities,
        nlp_meta=nlp_meta,
    )