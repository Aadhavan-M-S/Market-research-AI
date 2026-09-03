"""
agents/market_research.py — Spectra Platform (Consultancy Grade)

Architecture:
  1. Corpus ingestion + preprocessing + chunking
  2. Hybrid RAG (semantic + keyword fusion)
  3. Entity pipeline: extract → filter → deduplicate → count → rank
  4. Source weighting (length, recency, engagement)
  5. Clustering (embedding-based, 3–5 themes)
  6. Sentiment analysis + distribution
  7. Structured insights engine
  8. Competitor positioning map
  9. Trend aggregation
  10. Grounded LLM synthesis (McKinsey-style prompt)
"""
from __future__ import annotations

import re
import time
import hashlib
from functools import lru_cache
from collections import Counter, defaultdict
from typing import Any

import numpy as np

from models.schemas import (
    MarketResearchRequest,
    MarketResearchResponse,
    NLPMeta,
)
from nlp_engine import (
    build_nlp_meta,
    build_rag_index,
    classify_sentiment,
    extract_entities,
    extractive_qa,
    summarize_text,
    preprocess_text,
    _get_bi_encoder,
)
from scraper import build_corpus
from llm_client import ollama_generate

# ─────────────────────────────────────────────────────────────────────────────
# Optional singletons
# ─────────────────────────────────────────────────────────────────────────────
try:
    from sentence_transformers import CrossEncoder
    CE_MODEL = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
except ImportError:
    CE_MODEL = None

try:
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import normalize
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False


# ─────────────────────────────────────────────────────────────────────────────
# 1. Preprocessing
# ─────────────────────────────────────────────────────────────────────────────

def filter_texts(texts: list[str], min_words: int = 10) -> list[str]:
    """Remove noise: empties, duplicates, too-short strings."""
    seen: set[str] = set()
    cleaned: list[str] = []
    for t in texts:
        if not isinstance(t, str):
            continue
        t = t.strip()
        if len(t.split()) < min_words:
            continue
        sig = t[:80].lower()
        if sig in seen:
            continue
        seen.add(sig)
        cleaned.append(t)
    return cleaned


def chunk_text(text: str, chunk_words: int = 120, overlap: int = 20) -> list[str]:
    """Split text into overlapping word-boundary chunks (~100–150 words each)."""
    words = text.split()
    if not words:
        return []
    chunks: list[str] = []
    step = max(1, chunk_words - overlap)
    for i in range(0, len(words), step):
        chunk = " ".join(words[i : i + chunk_words])
        if len(chunk.split()) >= 15:
            chunks.append(chunk)
        if i + chunk_words >= len(words):
            break
    return chunks


def build_chunks_from_corpus(texts: list[str]) -> list[str]:
    """Filter texts then chunk each into retrieval units."""
    filtered = filter_texts(texts)
    all_chunks: list[str] = []
    for t in filtered:
        all_chunks.extend(chunk_text(t))
    if not all_chunks:
        all_chunks = filtered if filtered else ["No content available."]
    return all_chunks


# ─────────────────────────────────────────────────────────────────────────────
# 2. Hybrid RAG (semantic + keyword fusion)
# ─────────────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=32)
def get_cached_rag_index(query_hash: str, chunks_tuple: tuple):
    """Build and cache the RAG index over chunks."""
    corpus = list(chunks_tuple)
    if not corpus:
        corpus = ["Fallback content."]
    return build_rag_index(corpus)


def _keyword_score(query: str, text: str) -> float:
    """Simple BM25-style keyword overlap score."""
    q_words = set(re.findall(r"\w+", query.lower()))
    t_words = re.findall(r"\w+", text.lower())
    if not q_words or not t_words:
        return 0.0
    matches = sum(1 for w in t_words if w in q_words)
    return matches / (len(t_words) ** 0.5 + 1)


def hybrid_retrieve(rag_index, query: str, top_k: int = 6) -> list[dict]:
    """Fuse semantic retrieval scores with keyword scores."""
    semantic_hits = rag_index.retrieve(query, top_k=top_k * 2)
    if not semantic_hits:
        return []

    max_sem = max((h.get("score", 0) for h in semantic_hits), default=1) or 1
    fused: list[dict] = []
    for h in semantic_hits:
        sem_norm = h.get("score", 0) / max_sem
        kw = _keyword_score(query, h.get("text", ""))
        h["fused_score"] = 0.65 * sem_norm + 0.35 * kw
        fused.append(h)

    fused.sort(key=lambda x: x["fused_score"], reverse=True)

    if CE_MODEL:
        try:
            pairs = [(query, r["text"]) for r in fused[:top_k]]
            scores = CE_MODEL.predict(pairs)
            for i, h in enumerate(fused[:top_k]):
                h["fused_score"] = float(scores[i])
            fused[:top_k] = sorted(fused[:top_k], key=lambda x: x["fused_score"], reverse=True)
        except Exception:
            pass

    return fused[:top_k]


# ─────────────────────────────────────────────────────────────────────────────
# 3. Entity pipeline
# ─────────────────────────────────────────────────────────────────────────────

_KEEP_LABELS = {"ORG", "PRODUCT", "WORK_OF_ART"}


def _normalize_name(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().title()


def build_entity_leaderboard(raw_entities: list[dict]) -> list[dict]:
    """
    extract → filter (ORG/PRODUCT) → normalize → deduplicate → count → rank
    Returns: [{"name": str, "count": int}, ...]
    """
    if not raw_entities:
        return []

    # Filter to relevant label types
    filtered = [
        e for e in raw_entities
        if e.get("label") in _KEEP_LABELS and e.get("text", "").strip()
    ]

    if not filtered:
        # Fallback: take top entities regardless of label
        filtered = [e for e in raw_entities if e.get("text", "").strip()][:20]

    # Normalize names
    counter: Counter = Counter()
    for e in filtered:
        name = _normalize_name(e["text"])
        if len(name) >= 2:
            counter[name] += 1

    # Semantic deduplication via embeddings (merge near-duplicates)
    if len(counter) >= 2:
        try:
            encoder = _get_bi_encoder()
            names = list(counter.keys())
            embs = encoder.encode(names, batch_size=64, normalize_embeddings=True, show_progress_bar=False)
            absorbed: set[int] = set()
            for i in range(len(names)):
                if i in absorbed:
                    continue
                for j in range(i + 1, len(names)):
                    if j in absorbed:
                        continue
                    sim = float(np.dot(embs[i], embs[j]))
                    if sim >= 0.92:
                        # Merge j into i
                        counter[names[i]] += counter[names[j]]
                        absorbed.add(j)
            counter = Counter({names[i]: counter[names[i]] for i in range(len(names)) if i not in absorbed})
        except Exception:
            pass

    ranked = [{"name": n, "count": c} for n, c in counter.most_common(15)]
    return ranked


# ─────────────────────────────────────────────────────────────────────────────
# 4. Source weighting
# ─────────────────────────────────────────────────────────────────────────────

def score_sources(source_meta: list[dict]) -> list[dict]:
    """
    Score each source: weight = 0.5*length_score + 0.3*recency_score + 0.2*engagement_score
    Returns sources sorted by weight descending.
    """
    if not source_meta:
        return []

    scored: list[dict] = []
    lengths = [len(s.get("text", s.get("snippet", ""))) for s in source_meta]
    max_len = max(lengths, default=1) or 1

    for i, src in enumerate(source_meta):
        # Length score
        text_len = lengths[i]
        length_score = min(text_len / max_len, 1.0)

        # Recency score (use published_date epoch if available, else 0.5)
        recency_score = float(src.get("recency_score", 0.5))

        # Engagement (upvotes / score / comments, normalised)
        raw_eng = src.get("score", src.get("upvotes", src.get("engagement", 0))) or 0
        engagement_score = min(raw_eng / 1000.0, 1.0)

        weight = round(0.5 * length_score + 0.3 * recency_score + 0.2 * engagement_score, 4)

        scored.append({
            "title": src.get("title"),
            "url": src.get("url", "#"),
            "weight": weight,
        })

    scored.sort(key=lambda x: x["weight"], reverse=True)
    return scored[:8]


# ─────────────────────────────────────────────────────────────────────────────
# 5. Clustering (theme detection)
# ─────────────────────────────────────────────────────────────────────────────

def cluster_texts(chunks: list[str], n_clusters: int = 4) -> list[dict]:
    """
    Embed chunks, K-Means cluster, extract representative summary per cluster.
    Returns: [{"label": str, "summary": str}, ...]
    """
    if len(chunks) < n_clusters:
        n_clusters = max(2, len(chunks))

    try:
        encoder = _get_bi_encoder()
        embs = encoder.encode(chunks, batch_size=64, normalize_embeddings=True, show_progress_bar=False)
    except Exception:
        return _fallback_clusters(chunks)

    if not SKLEARN_AVAILABLE:
        return _fallback_clusters(chunks)

    try:
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = km.fit_predict(embs)
    except Exception:
        return _fallback_clusters(chunks)

    clusters: list[dict] = []
    for cluster_id in range(n_clusters):
        indices = [i for i, l in enumerate(labels) if l == cluster_id]
        if not indices:
            continue

        # Find centroid-nearest chunk as representative
        centroid = km.cluster_centers_[cluster_id]
        cluster_embs = embs[indices]
        sims = cluster_embs @ centroid
        best_local = int(np.argmax(sims))
        representative = chunks[indices[best_local]]

        # Summarize cluster (extractive: take first 2 sentences of representative)
        sents = re.split(r"(?<=[.!?])\s+", representative)
        summary = " ".join(sents[:2]).strip()
        if len(summary) < 40:
            summary = representative[:200]

        # Label: most frequent capitalized bigram or first noun phrase
        label = _infer_cluster_label(representative, cluster_id)
        clusters.append({"label": label, "summary": summary})

    return clusters


def _infer_cluster_label(text: str, cluster_id: int) -> str:
    """Heuristic: find most common capitalized token sequence as theme label."""
    words = text.split()
    caps = [w.strip(".,;:()") for w in words if w and w[0].isupper() and len(w) > 2]
    if caps:
        freq = Counter(caps)
        return freq.most_common(1)[0][0]
    return f"Theme {cluster_id + 1}"


def _fallback_clusters(chunks: list[str]) -> list[dict]:
    """Simple equal-split fallback when sklearn unavailable."""
    n = max(2, min(4, len(chunks)))
    size = max(1, len(chunks) // n)
    return [
        {
            "label": f"Theme {i + 1}",
            "summary": chunks[i * size][: 160] if i * size < len(chunks) else "N/A",
        }
        for i in range(n)
    ]


# ─────────────────────────────────────────────────────────────────────────────
# 6. Trend extraction
# ─────────────────────────────────────────────────────────────────────────────

def build_trends(entities: list[dict], top_n: int = 10) -> list[dict]:
    """Convert ranked entity list into trend data for bar chart."""
    return [{"name": e["name"], "value": e["count"]} for e in entities[:top_n]]


# ─────────────────────────────────────────────────────────────────────────────
# 7. Competitor positioning map
# ─────────────────────────────────────────────────────────────────────────────

def build_positioning_map(
    entities: list[dict],
    chunks: list[str],
    sentiment_results: list[dict],
    top_n: int = 8,
) -> list[dict]:
    """
    Proxy metrics:
      X (ease of use) = normalised positive-sentiment co-occurrence with entity
      Y (feature richness) = normalised mention density in corpus
    """
    if not entities:
        return []

    combined = " ".join(chunks).lower()
    total_words = len(combined.split()) or 1

    # Positive snippets
    positive_texts = " ".join(
        r.get("text", "") for r in sentiment_results if r.get("label") == "POSITIVE"
    ).lower()

    positioning: list[dict] = []
    max_count = max((e["count"] for e in entities[:top_n]), default=1) or 1

    for e in entities[:top_n]:
        name_lower = e["name"].lower()

        # Y: mention density normalised 0–1
        mention_density = combined.count(name_lower) / (total_words / 1000 + 1)
        y = round(min(mention_density / (max_count / 5 + 1), 1.0), 3)

        # X: positive mention ratio 0–1
        pos_mentions = positive_texts.count(name_lower)
        total_mentions = combined.count(name_lower) or 1
        x = round(min(pos_mentions / total_mentions, 1.0), 3)

        positioning.append({"name": e["name"], "x": x, "y": y})

    return positioning


# ─────────────────────────────────────────────────────────────────────────────
# 8. Structured insights engine
# ─────────────────────────────────────────────────────────────────────────────

def generate_insights(
    query: str,
    entities: list[dict],
    sentiment_agg: dict,
    clusters: list[dict],
    summary: str,
) -> list[str]:
    """
    Derive 4–6 structured, business-quality insights from pipeline outputs.
    No raw Reddit text — all derived from aggregated signals.
    """
    insights: list[str] = []

    # Sentiment signal
    pos = sentiment_agg.get("positive", 0)
    neg = sentiment_agg.get("negative", 0)
    overall = sentiment_agg.get("overall", "NEUTRAL")
    insights.append(
        f"{pos:.0f}% of market discussions carry a positive tone toward {query}, "
        f"with {neg:.0f}% negative — overall sentiment is {overall}."
    )

    # Top entities
    if entities:
        top = ", ".join(e["name"] for e in entities[:5])
        insights.append(
            f"Dominant players and tools in the space: {top}. "
            f"{entities[0]['name']} leads with {entities[0]['count']} mentions."
        )

    # Theme signal from clusters
    if clusters:
        theme_labels = " · ".join(c["label"] for c in clusters[:3])
        insights.append(
            f"Conversation clusters around {len(clusters)} core themes: {theme_labels} — "
            f"indicating a fragmented but active market."
        )

    # Volume / breadth signal
    if len(entities) >= 5:
        insights.append(
            f"High entity diversity ({len(entities)} distinct ORG/PRODUCT mentions) signals "
            f"a competitive, crowded market with low consolidation."
        )
    else:
        insights.append(
            f"Low entity diversity ({len(entities)} distinct mentions) may indicate "
            f"an emerging or niche market with consolidation potential."
        )

    # Risk signal (negative > 25%)
    if neg > 25:
        insights.append(
            f"Elevated negative sentiment ({neg:.0f}%) suggests significant friction — "
            f"likely around pricing, reliability, or onboarding complexity."
        )
    elif pos > 60:
        insights.append(
            f"Strong positive signal ({pos:.0f}%) reflects healthy adoption momentum "
            f"and unmet demand — an opportune entry window."
        )

    return insights[:6]


# ─────────────────────────────────────────────────────────────────────────────
# 9. LLM prompt (McKinsey-style, structured sections)
# ─────────────────────────────────────────────────────────────────────────────

def _build_strategic_prompt(
    query: str,
    summary: str,
    entities: list[dict],
    sentiment_agg: dict,
    rag_index,
    clusters: list[dict],
) -> str:
    def _retrieve(q: str) -> str:
        hits = hybrid_retrieve(rag_index, q, top_k=3)
        return " | ".join(h["text"][:140] for h in hits)

    landscape_ctx = _retrieve(f"market landscape competitive players {query}")
    opp_ctx       = _retrieve(f"growth opportunities unmet needs {query}")
    risk_ctx      = _retrieve(f"risks barriers challenges {query}")
    rec_ctx       = _retrieve(f"recommendations strategy action {query}")

    cluster_str = "; ".join(f'"{c["label"]}"' for c in clusters[:4])
    entity_str  = ", ".join(f'{e["name"]} ({e["count"]}x)' for e in entities[:8])
    sentiment_str = (
        f"{sentiment_agg['overall']} — "
        f"{sentiment_agg['positive']}% positive / {sentiment_agg['negative']}% negative"
    )

    return f"""You are a senior partner at a top-tier strategy consultancy.
Query: "{query}"

[Statistical Context]
Sentiment: {sentiment_str}
Top Entities: {entity_str}
Theme Clusters: {cluster_str}
Base Summary: {summary[:400]}

[Retrieved Evidence]
Market Landscape: {landscape_ctx}
Opportunities: {opp_ctx}
Risks: {risk_ctx}
Strategy signals: {rec_ctx}

Write a structured executive briefing with EXACTLY these four sections.
Each section: 2–3 sentences, data-driven, no filler language, no Reddit tone.

## Market Landscape
[current state, key players, maturity level]

## Opportunities
[specific growth vectors, underserved segments, tailwinds]

## Risks
[concrete barriers, competitive threats, adoption friction]

## Recommendations
[3 actionable strategic recommendations, prioritised]

Executive Briefing:"""


# ─────────────────────────────────────────────────────────────────────────────
# Main Agent Entrypoint
# ─────────────────────────────────────────────────────────────────────────────

async def run_market_research(req: MarketResearchRequest) -> dict:
    t0 = time.time()
    timing: dict[str, float] = {}

    # ── 1. Data Ingestion ────────────────────────────────────────────────────
    t1 = time.time()
    sources = req.sources or ["reddit"]
    corpus = await build_corpus(
        query=req.query,
        sources=sources,
        max_results=req.max_results,
        use_exa=getattr(req, "use_exa", False),
    )
    raw_texts: list[str] = corpus.get("texts", [f"No data found for: {req.query}"])
    source_meta: list[dict] = corpus.get("source_meta", [])
    timing["scrape"] = round(time.time() - t1, 2)

    # ── 2. Preprocessing + Chunking ──────────────────────────────────────────
    t1 = time.time()
    chunks = build_chunks_from_corpus(raw_texts)
    combined = " ".join(raw_texts)
    query_hash = hashlib.md5(req.query.encode()).hexdigest()
    timing["preprocessing"] = round(time.time() - t1, 2)

    # ── 3. Hybrid RAG Index ──────────────────────────────────────────────────
    t1 = time.time()
    rag_index = get_cached_rag_index(query_hash, tuple(chunks))
    timing["rag"] = round(time.time() - t1, 2)

    # ── 4. Entity Pipeline ───────────────────────────────────────────────────
    t1 = time.time()
    raw_entities = extract_entities(combined[:12000]) or []
    entities = build_entity_leaderboard(raw_entities)
    timing["ner"] = round(time.time() - t1, 2)

    # ── 5. Sentiment Analysis ────────────────────────────────────────────────
    t1 = time.time()
    sentiment_results = classify_sentiment(raw_texts[:30])
    pos = sum(1 for s in sentiment_results if s["label"] == "POSITIVE")
    neg = sum(1 for s in sentiment_results if s["label"] == "NEGATIVE")
    total = len(sentiment_results) or 1
    sentiment_agg = {
        "positive":       round(pos / total * 100, 1),
        "negative":       round(neg / total * 100, 1),
        "neutral":        round((total - pos - neg) / total * 100, 1),
        "overall":        "POSITIVE" if pos > neg else ("NEGATIVE" if neg > pos else "NEUTRAL"),
        "avg_confidence": round(sum(s.get("score", 0) for s in sentiment_results) / total, 3),
    }
    sentiment_score = round((pos - neg) / total, 4)
    timing["sentiment"] = round(time.time() - t1, 2)

    # ── 6. Source Weighting ──────────────────────────────────────────────────
    weighted_sources = score_sources(source_meta)

    # ── 7. Summarization (for LLM grounding) ────────────────────────────────
    t1 = time.time()
    summary_input = combined if len(combined) <= 8000 else " ".join([
        summarize_text(combined[i: i + 4000], method="dl", max_sentences=3)
        for i in range(0, min(len(combined), 24000), 4000)
    ])
    base_summary = summarize_text(summary_input, method="dl", max_sentences=4)
    timing["summarization"] = round(time.time() - t1, 2)

    # ── 8. Clustering ────────────────────────────────────────────────────────
    t1 = time.time()
    n_clusters = min(5, max(3, len(chunks) // 10 + 2))
    clusters = cluster_texts(chunks, n_clusters=n_clusters)
    timing["clustering"] = round(time.time() - t1, 2)

    # ── 9. Structured Insights ───────────────────────────────────────────────
    insights = generate_insights(req.query, entities, sentiment_agg, clusters, base_summary)

    # ── 10. Trends ───────────────────────────────────────────────────────────
    trends = build_trends(entities, top_n=10)

    # ── 11. Positioning Map ──────────────────────────────────────────────────
    positioning = build_positioning_map(entities, chunks, sentiment_results, top_n=8)

    # ── 12. Extractive QA (single key question) ──────────────────────────────
    t1 = time.time()
    qa_question = f"What are the key strategic insights about {req.query}?"
    qa_hits = hybrid_retrieve(rag_index, qa_question, top_k=3)
    qa_answer = " ".join(h["text"][:200] for h in qa_hits[:2]).strip()
    if not qa_answer:
        qa_answer = base_summary[:300]
    answers = [{"question": qa_question, "answer": qa_answer}]
    timing["qa"] = round(time.time() - t1, 2)

    # ── 13. LLM Strategic Synthesis ─────────────────────────────────────────
    t1 = time.time()
    llm_prompt = _build_strategic_prompt(
        req.query, base_summary, entities, sentiment_agg, rag_index, clusters
    )
    llm_output = await ollama_generate(llm_prompt, temperature=0.25)
    final_summary = (
        llm_output
        if llm_output and not llm_output.startswith("[Ollama")
        else base_summary
    )
    timing["llm"] = round(time.time() - t1, 2)

    # ── 14. NLP Meta (minimal) ───────────────────────────────────────────────
    nlp_meta = {
        "processing_time": round(time.time() - t0, 2),
        "models_used": ["bi-encoder/all-MiniLM-L6-v2", "sentiment-classifier", "ner-model"],
        "timing_breakdown": timing,
    }

    # ── Return ───────────────────────────────────────────────────────────────
    return {
        "query":           req.query,
        "summary":         final_summary,
        "entities":        entities,
        "sentiment":       sentiment_agg,
        "sentiment_score": sentiment_score,
        "insights":        insights,
        "sources":         weighted_sources,
        "clusters":        clusters,
        "positioning":     positioning,
        "trends":          trends,
        "answers":         answers,
        "nlp_meta":        nlp_meta,
    }