from __future__ import annotations

import asyncio
import logging
import time
from collections import Counter, defaultdict
from datetime import datetime
from typing import Optional

import numpy as np

from models.schemas import TrendSpottingRequest, TrendSpottingResponse, NLPMeta
from nlp_engine import (
    build_nlp_meta,
    build_rag_index,
    ngram_model,
    remove_stopwords,
    tokenize,
    topic_modeling,
    _get_bi_encoder,
)
from llm_client import ollama_generate

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Custom stopwords (domain-aware supplement to base stopwords)
# ─────────────────────────────────────────────────────────────────────────────

_CUSTOM_STOPWORDS = frozenset({
    "new", "making", "made", "announces", "announced", "launches", "launched",
    "says", "said", "via", "use", "using", "used", "just", "also", "now",
    "will", "can", "may", "one", "two", "three", "first", "last", "next",
    "year", "month", "week", "day", "time", "way", "well", "back", "still",
    "even", "like", "make", "take", "get", "got", "come", "coming", "going",
    "today", "latest", "big", "key", "top", "best", "report", "update",
    "news", "source", "according", "amid", "major", "move",
})

# ─────────────────────────────────────────────────────────────────────────────
# JSON serialization safety
# ─────────────────────────────────────────────────────────────────────────────

def to_python(obj):
    """Recursively convert numpy types to native Python for JSON serialisation."""
    if isinstance(obj, dict):
        return {k: to_python(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_python(v) for v in obj]
    if isinstance(obj, np.generic):
        return obj.item()
    return obj


# ─────────────────────────────────────────────────────────────────────────────
# Embedding cache — compute once, reuse everywhere
# ─────────────────────────────────────────────────────────────────────────────

class _EmbeddingCache:
    """
    Encodes all texts exactly once per request and exposes:
      - embeddings:  (N, D) normalised float32 array
      - centroid_for(indices): unit-normed mean of a subset
    """

    def __init__(self, texts: list[str]):
        encoder = _get_bi_encoder()
        self.texts = texts

        # Adaptive batch size: small datasets → tiny batches avoid overhead
        batch = max(8, min(16, len(texts)))
        raw = encoder.encode(
            texts,
            batch_size=batch,
            show_progress_bar=False,
            normalize_embeddings=True,
        )
        self.embeddings: np.ndarray = raw.astype(np.float32)

    def centroid_for(self, indices: list[int]) -> np.ndarray:
        subset = self.embeddings[indices]
        c = subset.mean(axis=0)
        norm = np.linalg.norm(c)
        return c / norm if norm > 0 else c


# ─────────────────────────────────────────────────────────────────────────────
# Temporal bucketing
# ─────────────────────────────────────────────────────────────────────────────

def _bucket_texts(
    texts: list[str],
    timestamps: list[str] | None,
) -> list[tuple[str, list[str], list[int]]]:
    """
    Returns a list of (period_key, [text, ...], [original_index, ...]).
    Falls back to three equal splits when timestamps are absent or mismatched.
    """
    n = len(texts)

    if not timestamps or len(timestamps) != n:
        thirds = [n // 3, 2 * n // 3, n]
        slices = [(0, thirds[0]), (thirds[0], thirds[1]), (thirds[1], n)]
        return [
            (label, texts[a:b], list(range(a, b)))
            for label, (a, b) in zip(("Early", "Mid", "Late"), slices)
            if a < b
        ]

    indexed = sorted(enumerate(zip(timestamps, texts)), key=lambda x: x[1][0])
    buckets: dict[str, tuple[list[str], list[int]]] = defaultdict(lambda: ([], []))

    for orig_idx, (ts, txt) in indexed:
        try:
            dt = datetime.fromisoformat(ts)
            key = dt.strftime("%Y-%m")
        except Exception:
            key = str(ts)[:7]

        buckets[key][0].append(txt)
        buckets[key][1].append(orig_idx)

    return [(k, txts, idxs) for k, (txts, idxs) in sorted(buckets.items())]


# ─────────────────────────────────────────────────────────────────────────────
# Temporal trends — embeddings reused from cache
# ─────────────────────────────────────────────────────────────────────────────

def _compute_temporal_trends(
    buckets: list[tuple[str, list[str], list[int]]],
    cache: _EmbeddingCache,
) -> list[dict]:
    result = []
    prev_centroid: Optional[np.ndarray] = None

    for period, period_texts, indices in buckets:
        if not period_texts:
            continue

        combined = " ".join(period_texts)
        raw_tokens = remove_stopwords(tokenize(combined))
        tokens = [t for t in raw_tokens if t not in _CUSTOM_STOPWORDS and len(t) > 2]
        top_terms = Counter(tokens).most_common(8)

        centroid = cache.centroid_for(indices)

        drift = 0.0
        if prev_centroid is not None:
            # cosine distance in [0, 2] for normalised vectors
            drift = float(round(max(0.0, 1.0 - float(np.dot(centroid, prev_centroid))), 4))

        prev_centroid = centroid

        result.append({
            "period":        str(period),
            "top_terms":     [{"term": t, "count": int(c)} for t, c in top_terms],
            "doc_count":     len(period_texts),
            "semantic_drift": drift,
        })

    return result


# ─────────────────────────────────────────────────────────────────────────────
# CUSUM anomaly detection
# ─────────────────────────────────────────────────────────────────────────────

def _cusum_anomalies(temporal: list[dict]) -> list[dict]:
    if len(temporal) < 3:
        return []

    n = len(temporal)
    term_series: dict[str, list[int]] = defaultdict(lambda: [0] * n)

    for i, bucket in enumerate(temporal):
        for t in bucket["top_terms"]:
            term_series[t["term"]][i] = t["count"]

    anomalies = []
    log_threshold = 2.5 + 0.5 * np.log(max(n, 2))

    for term, series in term_series.items():
        arr = np.array(series, dtype=float)
        if arr.sum() == 0:
            continue

        std = arr.std()
        if std == 0:
            continue

        z = (arr - arr.mean()) / std
        cusum = np.cumsum(z)

        if np.max(np.abs(cusum)) > log_threshold:
            idx = int(np.argmax(np.abs(z)))
            anomalies.append({
                "term":         term,
                "spike_period": temporal[idx]["period"],
                "direction":    "spike" if z[idx] > 0 else "drop",
            })

    return sorted(anomalies, key=lambda x: x["term"])[:8]


# ─────────────────────────────────────────────────────────────────────────────
# N-gram velocity
# ─────────────────────────────────────────────────────────────────────────────

def _ngram_velocity(buckets: list[tuple[str, list[str], list[int]]]) -> list[dict]:
    if len(buckets) < 2:
        return []

    early_text = " ".join(buckets[0][1])
    late_text  = " ".join(buckets[-1][1])

    early_grams = {g["ngram"]: g["count"] for g in ngram_model(early_text, n=2, top_k=40)}
    late_grams  = {g["ngram"]: g["count"] for g in ngram_model(late_text,  n=2, top_k=40)}

    all_grams = set(early_grams) | set(late_grams)
    result = []

    for gram in all_grams:
        e = early_grams.get(gram, 0)
        l = late_grams.get(gram, 0)
        velocity = float(round((l - e) / (e + 1), 4))
        result.append({"ngram": gram, "velocity": velocity})

    return sorted(result, key=lambda x: abs(x["velocity"]), reverse=True)[:15]


# ─────────────────────────────────────────────────────────────────────────────
# Topic evolution — embedding-based, sensitivity fixed
# ─────────────────────────────────────────────────────────────────────────────

def _topic_evolution_rag(
    topics: list[dict],
    buckets: list[tuple[str, list[str], list[int]]],
    cache: _EmbeddingCache,
) -> list[dict]:
    """
    Measures how much each topic's centroid similarity shifts from the
    earliest bucket to the latest.  Uses cached embeddings so RAG index
    is built only once per bucket, and scores are normalised to [0, 1]
    before differencing to avoid the all-stable collapse.
    """
    if not topics or len(buckets) < 2:
        return []

    # Build per-bucket RAG indices only once
    early_index = build_rag_index(buckets[0][1])
    late_index  = build_rag_index(buckets[-1][1])

    # Normalise scores within each bucket so absolute magnitude differences
    # don't mask real trend signals.
    def _retrieve_norm_score(index, query: str, top_k: int = 3) -> float:
        hits = index.retrieve(query, top_k=top_k)
        if not hits:
            return 0.0
        scores = [float(h["score"]) for h in hits]
        # Use max-normalised mean so inter-bucket comparisons are fair
        max_s = max(scores) or 1.0
        return float(sum(s / max_s for s in scores) / len(scores))

    results = []

    for topic in topics[:4]:           # top 4 topics only
        words = topic.get("words", [])
        if not words:
            continue

        query = " ".join(
            (w["word"] if isinstance(w, dict) else w) for w in words[:6]
        )

        e_score = _retrieve_norm_score(early_index, query)
        l_score = _retrieve_norm_score(late_index,  query)

        delta = float(round(l_score - e_score, 4))

        # Relative change: how large is delta relative to baseline?
        rel_change = abs(delta) / (abs(e_score) + 1e-6)

        if rel_change < 0.01:
            trend = "stable"
        elif delta > 0:
            trend = "strongly_rising" if rel_change > 0.3 else "rising"
        else:
            trend = "strongly_declining" if rel_change > 0.3 else "declining"

        results.append({
            "topic_id": topic["topic_id"],
            "trend":    trend,
            "delta":    delta,
        })

    return results


# ─────────────────────────────────────────────────────────────────────────────
# LLM prompt construction (consulting-grade output)
# ─────────────────────────────────────────────────────────────────────────────

def _build_prompt(
    topics: list[dict],
    temporal: list[dict],
    evolution: list[dict],
    rag_index,
) -> str:
    if not topics:
        return "No trend data available for analysis."

    # Top-topic keywords
    words = topics[0].get("words", [])
    query = " ".join(
        (w["word"] if isinstance(w, dict) else w) for w in words[:5]
    )

    evidence = rag_index.retrieve(query, top_k=3)
    context_snippets = " | ".join(r["text"][:120] for r in evidence)

    # Trend trajectory summary
    evolution_lines = []
    for e in evolution[:4]:
        evolution_lines.append(f"  • Topic {e['topic_id']}: {e['trend']} (Δ={e['delta']:+.4f})")
    evolution_summary = "\n".join(evolution_lines) or "  • Insufficient data"

    # Temporal drift summary
    drift_lines = []
    for t in temporal[-3:]:
        drift_lines.append(f"  • {t['period']}: drift={t['semantic_drift']:.4f}, docs={t['doc_count']}")
    drift_summary = "\n".join(drift_lines) or "  • No temporal data"

    # Top terms across recent buckets
    recent_terms: list[str] = []
    if temporal:
        for item in temporal[-2:]:
            recent_terms.extend(tt["term"] for tt in item.get("top_terms", [])[:4])
    term_summary = ", ".join(list(dict.fromkeys(recent_terms))[:10]) or "N/A"
    return f"""You are a senior Spectra intelligence analyst. Based on the following trend data, provide a concise executive summary (3–4 sentences) identifying the dominant narrative shifts, emerging signals, and strategic implications.

TOPIC EVOLUTION:
{evolution_summary}

TEMPORAL SEMANTIC DRIFT (recent periods):
{drift_summary}

TRENDING TERMS: {term_summary}

SUPPORTING EVIDENCE: {context_snippets}

Deliver a precise, insight-driven narrative. Avoid filler language."""


# ─────────────────────────────────────────────────────────────────────────────
# MAIN entry point
# ─────────────────────────────────────────────────────────────────────────────

async def run_trend_spotting(req: TrendSpottingRequest) -> TrendSpottingResponse:
    t0 = time.time()
    texts = req.texts
    n = len(texts)

    # ── 1. Precompute embeddings once for ALL texts ──────────────────────────
    cache = _EmbeddingCache(texts)

    # ── 2. Build global RAG index (once) ────────────────────────────────────
    rag_index = build_rag_index(texts)

    # ── 3. Topic modelling — more words, custom stopword filter ─────────────
    raw_topics = topic_modeling(texts, n_topics=req.n_topics, n_words=15)

    # Filter generic terms from topic word lists
    for topic in raw_topics:
        topic["words"] = [
            w for w in topic.get("words", [])
            if (w["word"] if isinstance(w, dict) else w) not in _CUSTOM_STOPWORDS
        ]

    topics = to_python(raw_topics)

    # ── 4. Temporal bucketing — indices carried for embedding reuse ──────────
    buckets = _bucket_texts(texts, req.timestamps)

    # ── 5. Temporal trends — reuse cache, no re-encoding ────────────────────
    temporal = to_python(
        _compute_temporal_trends(buckets, cache)
        if n >= 3
        else []
    )

    # ── 6. CUSUM anomalies ───────────────────────────────────────────────────
    anomalies = to_python(_cusum_anomalies(temporal))

    # ── 7. N-gram velocity ───────────────────────────────────────────────────
    velocities = to_python(
        _ngram_velocity(buckets) if n >= 4 else []
    )

    # ── 8. Topic evolution — sensitivity-fixed, cache-aware ─────────────────
    evolution = to_python(
        _topic_evolution_rag(topics, buckets, cache)
        if n >= 4 and len(buckets) >= 2
        else []
    )

    # ── 9. LLM narrative — with timeout + full error logging ────────────────
    narrative: str | None = None

    if topics:
        prompt = _build_prompt(topics, temporal, evolution, rag_index)
        try:
            narrative = await asyncio.wait_for(
                ollama_generate(prompt),
                timeout=120.0,
            )
            logger.info("LLM narrative generated (%.2fs)", time.time() - t0)
        except asyncio.TimeoutError:
            logger.error("LLM generation timed out after 120s")
            narrative = "Narrative generation timed out. Core trend data remains valid."
        except Exception as exc:
            logger.error("LLM generation failed: %s", exc, exc_info=True)
            narrative = f"Narrative unavailable: {type(exc).__name__}"

        if narrative:
            topics.insert(0, {"topic_id": -1, "narrative": narrative})

    # ── 10. NLP meta ─────────────────────────────────────────────────────────
    meta = build_nlp_meta(" ".join(texts[:20]), t0)

    logger.info(
        "Trend spotting complete | texts=%d buckets=%d topics=%d elapsed=%.2fs",
        n, len(buckets), len(topics), time.time() - t0,
    )

    return TrendSpottingResponse(
        topics          = topics,
        trending_ngrams = velocities,
        temporal_trend  = temporal,
        topic_evolution = evolution,
        nlp_meta        = NLPMeta(**meta),
        anomalies       = anomalies,
    )