"""
agents/review_analysis.py — Agent 4: Product Review Analysis (Production Refactor)
═══════════════════════════════════════════════════════════════════════════════════
Fixes & Upgrades:
  • spaCy POS tagging (en_core_web_sm) — replaces broken naive tagger
  • spaCy NER with post-processing: COMPONENT / FIELD custom labels
  • Pydantic schemas for all structured outputs (no bare dicts)
  • Contradictions included in response
  • Review-level sentiment returned
  • LLM truncation fixed (max_tokens bumped, safe sentence-boundary trim)
"""
from __future__ import annotations

import re
import time
from collections import Counter
from typing import List, Optional

import numpy as np
from pydantic import BaseModel, Field

from models.schemas import NLPMeta
from nlp_engine import (
    bag_of_words,
    build_nlp_meta,
    build_rag_index,
    classify_sentiment,
    extract_aspect_sentiments,
    ngram_model,
    _get_bi_encoder,
    vector_space_model,
)
from llm_client import ollama_generate


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────────────────────────────────────

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


class Entity(BaseModel):
    text: str
    label: str
    confidence: float = 1.0


class POSTag(BaseModel):
    text: str
    pos: str


class ReviewSentiment(BaseModel):
    text: str
    label: str
    score: float


class Contradiction(BaseModel):
    aspect: str
    positive_pct: float
    negative_pct: float
    polarisation_score: float
    positive_example: str
    negative_example: str


class ReviewAnalysisRequest(BaseModel):
    product_name: str
    reviews: List[str]
    use_embeddings: bool = True


class ReviewAnalysisResponse(BaseModel):
    product_name: str
    overall_sentiment: str                          # "POSITIVE" | "NEGATIVE" | "NEUTRAL"
    sentiment_scores: SentimentScores
    aspect_sentiments: List[AspectSentiment]
    top_positive_phrases: List[str]
    top_negative_phrases: List[str]
    embedding_clusters: List[Cluster]
    bow_top_terms: list
    contradictions: List[Contradiction]
    review_sentiments: List[ReviewSentiment]
    pos_tags: List[POSTag]                          # First review tokenised
    entities: List[Entity]
    nlp_meta: NLPMeta


# ─────────────────────────────────────────────────────────────────────────────
# spaCy helpers — lazy-loaded once
# ─────────────────────────────────────────────────────────────────────────────

_NLP = None

def _get_spacy():
    global _NLP
    if _NLP is None:
        import spacy
        try:
            _NLP = spacy.load("en_core_web_sm")
        except OSError:
            # Auto-download if missing
            from spacy.cli import download
            download("en_core_web_sm")
            _NLP = spacy.load("en_core_web_sm")
    return _NLP


# Hardware / component terms and AI/ML field terms for custom NER rules
_HARDWARE_LEXICON = {
    "keyboard", "screen", "display", "battery", "camera", "speaker",
    "microphone", "port", "usb", "hdmi", "button", "trackpad", "mouse",
    "charger", "cable", "sensor", "chip", "processor", "gpu", "cpu",
    "ram", "storage", "ssd", "fan", "hinge", "chassis", "lens",
}

_FIELD_LEXICON = {
    "ml", "ai", "nlp", "cv", "llm", "rl", "gpt", "bert", "transformer",
    "neural", "deep learning", "machine learning", "artificial intelligence",
}


def _pos_tag_text(text: str) -> List[POSTag]:
    """
    Run spaCy POS tagging on a single text string.
    Returns coarse Universal POS tags (NOUN, VERB, ADJ, etc.)
    """
    nlp = _get_spacy()
    doc = nlp(text[:500])          # cap to ~500 chars for speed
    return [POSTag(text=tok.text, pos=tok.pos_) for tok in doc if not tok.is_space]


def _extract_entities(texts: List[str]) -> List[Entity]:
    """
    Run spaCy NER across all reviews with custom post-processing:
      - hardware lexicon  → COMPONENT
      - AI/ML field terms → FIELD
      - discard low-confidence / short tokens
    """
    nlp = _get_spacy()
    combined = " ".join(texts[:20])    # limit corpus size
    doc = nlp(combined[:4000])

    seen: set[str] = set()
    entities: List[Entity] = []

    for ent in doc.ents:
        raw = ent.text.strip()
        key = raw.lower()
        if len(raw) < 2 or key in seen:
            continue
        seen.add(key)

        # Custom label overrides
        if key in _HARDWARE_LEXICON or any(hw in key for hw in _HARDWARE_LEXICON):
            label = "COMPONENT"
        elif key in _FIELD_LEXICON or any(fl in key for fl in _FIELD_LEXICON):
            label = "FIELD"
        else:
            label = ent.label_

        # Filter noisy spaCy labels that are usually wrong for product reviews
        if label in {"CARDINAL", "ORDINAL", "DATE", "TIME", "PERCENT", "MONEY", "QUANTITY"}:
            continue

        entities.append(Entity(text=raw, label=label, confidence=round(ent._.get("score", 1.0) if ent.has_extension("score") else 1.0, 3)))

    return entities[:30]


# ─────────────────────────────────────────────────────────────────────────────
# Key phrase extraction — TF-IDF × sentiment polarity weighted
# ─────────────────────────────────────────────────────────────────────────────

def _extract_key_phrases_weighted(
    reviews: List[str],
    sentiments: List[dict],
    polarity: str,
    top_k: int = 10,
) -> List[str]:
    polarity_reviews = [r for r, s in zip(reviews, sentiments) if s["label"] == polarity]
    if not polarity_reviews:
        polarity_reviews = reviews

    conf_map: dict[str, float] = {
        r: s["score"] for r, s in zip(reviews, sentiments) if s["label"] == polarity
    }

    vsm = vector_space_model(polarity_reviews, query="")
    tfidf_terms = {t["term"]: t["score"] for t in vsm.get("tfidf_top_terms", [])}

    combined = " ".join(polarity_reviews)
    bigrams = ngram_model(combined, n=2, top_k=top_k * 4)

    scored = []
    for b in bigrams:
        words = b["ngram"].split()
        tfidf_w = sum(tfidf_terms.get(w, 0.0) for w in words) / max(len(words), 1)
        containing = [conf_map.get(r, 0.5) for r in polarity_reviews if b["ngram"] in r.lower()]
        conf_w = float(np.mean(containing)) if containing else 0.5
        scored.append((b["ngram"], tfidf_w * conf_w))

    scored.sort(key=lambda x: x[1], reverse=True)
    return [phrase for phrase, _ in scored[:top_k]]


# ─────────────────────────────────────────────────────────────────────────────
# Contradiction detection
# ─────────────────────────────────────────────────────────────────────────────

def _detect_contradictions(
    aspect_sentiments: List[dict],
    reviews: List[str],
    rag_index,
) -> List[Contradiction]:
    contradictions: List[Contradiction] = []
    for asp in aspect_sentiments:
        if asp.get("mentions", 0) < 2:
            continue
        pos_pct = asp.get("positive_pct", 0)
        neg_pct = asp.get("negative_pct", 0)
        polarity_gap = abs(pos_pct - neg_pct)
        if pos_pct > 20 and neg_pct > 20 and polarity_gap < 50:
            pos_ex = rag_index.retrieve(f"good {asp['aspect']} positive experience", top_k=1)
            neg_ex = rag_index.retrieve(f"bad {asp['aspect']} negative issue problem", top_k=1)
            contradictions.append(Contradiction(
                aspect=asp["aspect"],
                positive_pct=pos_pct,
                negative_pct=neg_pct,
                polarisation_score=round(1 - polarity_gap / 100, 3),
                positive_example=(pos_ex[0]["text"][:120] if pos_ex else ""),
                negative_example=(neg_ex[0]["text"][:120] if neg_ex else ""),
            ))
    contradictions.sort(key=lambda x: x.polarisation_score, reverse=True)
    return contradictions[:5]


# ─────────────────────────────────────────────────────────────────────────────
# Dense embedding clustering
# ─────────────────────────────────────────────────────────────────────────────

def _cluster_reviews_dense(reviews: List[str], n_clusters: int = 4) -> List[Cluster]:
    if len(reviews) < 4:
        return [Cluster(cluster_id=0, size=len(reviews), theme="All Reviews", samples=reviews[:2])]

    encoder = _get_bi_encoder()
    try:
        embs = encoder.encode(reviews, batch_size=32, show_progress_bar=False)
        from sklearn.cluster import KMeans
        n = min(n_clusters, len(reviews))
        km = KMeans(n_clusters=n, random_state=42, n_init=10)
        labels = km.fit_predict(embs)
    except Exception:
        return [Cluster(cluster_id=0, size=len(reviews), theme="All Reviews", samples=reviews[:2])]

    clusters: dict[int, list[str]] = {}
    for review, label in zip(reviews, labels):
        clusters.setdefault(int(label), []).append(review)

    result: List[Cluster] = []
    for cid, cluster_reviews in clusters.items():
        vsm = vector_space_model(cluster_reviews)
        theme_words = [t["term"] for t in vsm.get("tfidf_top_terms", [])[:3]]
        theme = ", ".join(theme_words) or "Mixed"

        if len(cluster_reviews) > 1:
            try:
                c_embs = encoder.encode(cluster_reviews, batch_size=32, show_progress_bar=False, normalize_embeddings=True)
                centroid = c_embs.mean(axis=0)
                centroid /= np.linalg.norm(centroid) + 1e-9
                sims = (c_embs @ centroid).flatten()
                representative = cluster_reviews[int(sims.argmax())]
            except Exception:
                representative = cluster_reviews[0]
        else:
            representative = cluster_reviews[0]

        result.append(Cluster(
            cluster_id=cid,
            size=len(cluster_reviews),
            theme=theme,
            samples=[representative] + cluster_reviews[1:2],
        ))
    return result


# ─────────────────────────────────────────────────────────────────────────────
# LLM prompt — RAG-grounded
# ─────────────────────────────────────────────────────────────────────────────

def _build_review_llm_prompt(
    product_name: str,
    overall: str,
    sentiment_scores: SentimentScores,
    top_positive: List[str],
    top_negative: List[str],
    contradictions: List[Contradiction],
    rag_index,
) -> str:
    top_pos_review = rag_index.retrieve("excellent great love best highly recommend", top_k=1)
    top_neg_review = rag_index.retrieve("terrible bad worst disappointed broken problem", top_k=1)
    top_pos_text = top_pos_review[0]["text"][:150] if top_pos_review else ""
    top_neg_text = top_neg_review[0]["text"][:150] if top_neg_review else ""

    contradiction_summary = (
        [f"{c.aspect}: {c.positive_pct}% pos / {c.negative_pct}% neg" for c in contradictions[:3]]
        if contradictions else []
    )

    return (
        f"You are a senior product analyst. Summarize customer sentiment for '{product_name}'.\n\n"
        f"[Sentiment Distribution]\n"
        f"Overall: {overall} | Positive: {sentiment_scores.positive}% | "
        f"Negative: {sentiment_scores.negative}% | "
        f"Avg confidence: {sentiment_scores.avg_confidence}\n\n"
        f"[Top Positive Themes]: {top_positive[:5]}\n"
        f"[Top Negative Themes]: {top_negative[:5]}\n\n"
        f"[Most Positive Review Sample]: {top_pos_text}\n"
        f"[Most Negative Review Sample]: {top_neg_text}\n\n"
        f"[Polarised Aspects]: {contradiction_summary}\n\n"
        f"Provide 3 specific, actionable recommendations for the product team. "
        f"Reference actual themes and polarised aspects where relevant. "
        f"Keep each recommendation to 2-3 complete sentences."
    )


def _safe_truncate_llm(text: str, max_chars: int = 800) -> str:
    """Trim to last complete sentence within max_chars."""
    if len(text) <= max_chars:
        return text
    trimmed = text[:max_chars]
    # Find last sentence boundary
    for sep in (".", "!", "?"):
        last = trimmed.rfind(sep)
        if last > max_chars // 2:
            return trimmed[: last + 1].strip()
    return trimmed.rstrip() + "…"


# ─────────────────────────────────────────────────────────────────────────────
# Main agent entrypoint
# ─────────────────────────────────────────────────────────────────────────────

async def run_review_analysis(req: ReviewAnalysisRequest) -> ReviewAnalysisResponse:
    t0 = time.time()
    reviews = req.reviews

    # ── 1. RAG index ──────────────────────────────────────────────────────────
    rag_index = build_rag_index(reviews)

    # ── 2. Batch sentiment (DeBERTa-v3) ──────────────────────────────────────
    raw_sentiments: List[dict] = classify_sentiment(reviews)

    # ── 3. Review-level sentiment ─────────────────────────────────────────────
    review_sentiments: List[ReviewSentiment] = [
        ReviewSentiment(text=r, label=s["label"], score=round(s["score"], 4))
        for r, s in zip(reviews, raw_sentiments)
    ]

    # ── 4. Aggregation ────────────────────────────────────────────────────────
    pos   = sum(1 for s in raw_sentiments if s["label"] == "POSITIVE")
    neg   = sum(1 for s in raw_sentiments if s["label"] == "NEGATIVE")
    total = max(len(raw_sentiments), 1)
    overall = "POSITIVE" if pos > neg else ("NEGATIVE" if neg > pos else "NEUTRAL")
    sentiment_scores = SentimentScores(
        positive=round(pos / total * 100, 1),
        negative=round(neg / total * 100, 1),
        neutral=round((total - pos - neg) / total * 100, 1),
        avg_confidence=round(sum(s["score"] for s in raw_sentiments) / total, 3),
    )

    # ── 5. Aspect-based sentiment ─────────────────────────────────────────────
    raw_aspects: List[dict] = extract_aspect_sentiments(reviews)
    aspect_sentiments: List[AspectSentiment] = [
        AspectSentiment(
            aspect=a["aspect"],
            mentions=a.get("mentions", 0),
            positive_pct=a.get("positive_pct", 0.0),
            negative_pct=a.get("negative_pct", 0.0),
            avg_score=a.get("avg_score", 0.0),
            llm_insight=a.get("llm_insight"),
        )
        for a in raw_aspects
    ]

    # ── 6. Contradiction detection ────────────────────────────────────────────
    contradictions = _detect_contradictions(raw_aspects, reviews, rag_index)

    # ── 7. Key phrases ────────────────────────────────────────────────────────
    top_positive = _extract_key_phrases_weighted(reviews, raw_sentiments, "POSITIVE")
    top_negative = _extract_key_phrases_weighted(reviews, raw_sentiments, "NEGATIVE")

    # ── 8. BOW ────────────────────────────────────────────────────────────────
    bow_data = bag_of_words(reviews, max_features=100)

    # ── 9. Dense clusters ─────────────────────────────────────────────────────
    clusters = _cluster_reviews_dense(reviews) if req.use_embeddings else []

    # ── 10. POS tagging (spaCy) — first non-empty review ─────────────────────
    first_review = next((r for r in reviews if r.strip()), "")
    pos_tags = _pos_tag_text(first_review)

    # ── 11. NER (spaCy + custom labels) ──────────────────────────────────────
    entities = _extract_entities(reviews)

    # ── 12. RAG-grounded LLM synthesis ───────────────────────────────────────
    llm_prompt = _build_review_llm_prompt(
        product_name=req.product_name,
        overall=overall,
        sentiment_scores=sentiment_scores,
        top_positive=top_positive,
        top_negative=top_negative,
        contradictions=contradictions,
        rag_index=rag_index,
    )
    # Increase max_tokens to prevent truncation; safe-trim output
    llm_raw = await ollama_generate(llm_prompt, temperature=0.28, max_tokens=1024)
    llm_insights = _safe_truncate_llm(llm_raw or "", max_chars=900)

    # ── 13. Prepend LLM summary as first aspect entry ─────────────────────────
    final_aspects: List[AspectSentiment] = list(aspect_sentiments)
    if llm_insights and not llm_insights.startswith("[Ollama"):
        final_aspects.insert(0, AspectSentiment(
            aspect="LLM Summary",
            mentions=len(reviews),
            positive_pct=sentiment_scores.positive,
            negative_pct=sentiment_scores.negative,
            avg_score=sentiment_scores.avg_confidence,
            llm_insight=llm_insights,
        ))

    meta = build_nlp_meta(" ".join(reviews[:5]), t0)

    return ReviewAnalysisResponse(
        product_name=req.product_name,
        overall_sentiment=overall,
        sentiment_scores=sentiment_scores,
        aspect_sentiments=final_aspects,
        top_positive_phrases=top_positive,
        top_negative_phrases=top_negative,
        embedding_clusters=clusters,
        bow_top_terms=bow_data.get("top_terms", [])[:15],
        contradictions=contradictions,
        review_sentiments=review_sentiments,
        pos_tags=pos_tags,
        entities=entities,
        nlp_meta=NLPMeta(**meta),
    )