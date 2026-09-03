"""
agents/rag_engine.py — Feature 1: Enterprise Knowledge RAG Engine
═══════════════════════════════════════════════════════════════════
Architecture:
  • Documents chunked with word-boundary overlap (120 words, 20 overlap)
  • HuggingFace sentence-transformers (all-MiniLM-L6-v2) for embeddings
  • FAISS IndexFlatIP persisted locally — rebuilt only if missing
  • Per-query: embed → retrieve top-k → pass to Ollama with context
  • Session-isolated chat history (in-memory dict keyed by session_id)
  • Output: answer + source citations
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────────
RAG_DATA_DIR = Path("rag_data")
FAISS_INDEX_PATH = RAG_DATA_DIR / "faiss.index"
METADATA_PATH = RAG_DATA_DIR / "metadata.json"
DOCS_DIR = RAG_DATA_DIR / "docs"

RAG_DATA_DIR.mkdir(exist_ok=True)
DOCS_DIR.mkdir(exist_ok=True)

# ── Session memory (per session_id, isolated to this module) ──────────────────
_session_history: Dict[str, List[Dict]] = {}

# ── Model singletons ──────────────────────────────────────────────────────────
_embed_model = None
_faiss_index = None
_metadata: List[Dict] = []


def _get_embed_model():
    global _embed_model
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer
        _embed_model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("[RAG] Embedding model loaded")
    return _embed_model


def _embed(texts: List[str]) -> np.ndarray:
    model = _get_embed_model()
    return model.encode(texts, normalize_embeddings=True, show_progress_bar=False)


# ── FAISS helpers ─────────────────────────────────────────────────────────────

def _load_or_build_index():
    """Load persisted FAISS index + metadata, or return a fresh empty index."""
    import faiss
    if FAISS_INDEX_PATH.exists() and METADATA_PATH.exists():
        try:
            index = faiss.read_index(str(FAISS_INDEX_PATH))
            with open(METADATA_PATH, "r", encoding="utf-8") as f:
                meta = json.load(f)
            logger.info(f"[RAG] Loaded FAISS index — {index.ntotal} vectors")
            return index, meta
        except Exception as e:
            logger.warning(f"[RAG] Failed to load persisted index: {e}")
    dim = 384  # all-MiniLM-L6-v2 output dim
    index = faiss.IndexFlatIP(dim)
    return index, []


def _persist_index(index, meta: List[Dict]) -> None:
    import faiss
    faiss.write_index(index, str(FAISS_INDEX_PATH))
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def _get_index():
    global _faiss_index, _metadata
    if _faiss_index is None:
        _faiss_index, _metadata = _load_or_build_index()
    return _faiss_index, _metadata


# ── Document ingestion ────────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = 120, overlap: int = 20) -> List[str]:
    """Word-boundary overlap chunking — matches existing project style."""
    words = text.split()
    chunks: List[str] = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i: i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    return [c for c in chunks if len(c.strip()) > 30]


def ingest_document(content: str, source_name: str = "uploaded") -> int:
    """Chunk, embed, and persist a document into the FAISS index."""
    global _faiss_index, _metadata

    index, meta = _get_index()
    chunks = chunk_text(content)
    if not chunks:
        return 0

    embeddings = _embed(chunks).astype("float32")
    index.add(embeddings)

    for chunk in chunks:
        meta.append({"source": source_name, "text": chunk})

    _persist_index(index, meta)
    logger.info(f"[RAG] Ingested {len(chunks)} chunks from '{source_name}'")
    return len(chunks)


def clear_index() -> None:
    """Reset the FAISS index and metadata (for testing/admin use)."""
    global _faiss_index, _metadata
    import faiss
    _faiss_index = faiss.IndexFlatIP(384)
    _metadata = []
    _persist_index(_faiss_index, _metadata)
    logger.info("[RAG] Index cleared")


# ── Retrieval ─────────────────────────────────────────────────────────────────

def retrieve(query: str, top_k: int = 5) -> List[Dict]:
    """Embed query, search FAISS index, return top-k chunks with scores."""
    index, meta = _get_index()
    if index.ntotal == 0:
        return []

    q_emb = _embed([query]).astype("float32")
    k = min(top_k, index.ntotal)
    scores, idxs = index.search(q_emb, k)

    results: List[Dict] = []
    for score, idx in zip(scores[0], idxs[0]):
        if 0 <= idx < len(meta):
            results.append({
                "text": meta[idx]["text"],
                "source": meta[idx]["source"],
                "score": float(score),
            })
    return results


# ── RAG query pipeline ────────────────────────────────────────────────────────

async def run_rag_query(query: str, session_id: str) -> Dict:
    """
    Full RAG pipeline:
    1. Retrieve top-k chunks from FAISS
    2. Build context-aware prompt with session history
    3. Call Ollama chat API
    4. Update session history
    5. Return answer + sources
    """
    from llm_client import ollama_chat

    t0 = time.time()

    # Retrieve context
    docs = retrieve(query, top_k=5)
    context_blocks = [
        f"[Source: {d['source']}]\n{d['text']}"
        for d in docs
    ]
    context = "\n\n---\n\n".join(context_blocks) if context_blocks else "No documents have been indexed yet."

    # Build messages with session history
    if session_id not in _session_history:
        _session_history[session_id] = []
    history = _session_history[session_id]

    system_msg = {
        "role": "system",
        "content": (
            "You are an enterprise knowledge assistant. Answer questions using ONLY "
            "the provided context. Be precise, cite the source, and structure your "
            "answer clearly. If the context is insufficient, state that explicitly. "
            "Never fabricate information not present in the context."
        ),
    }
    user_msg = {
        "role": "user",
        "content": f"Context:\n{context}\n\nQuestion: {query}",
    }

    # Include last 6 history messages (3 turns) for continuity
    messages = [system_msg] + history[-6:] + [user_msg]

    answer = await ollama_chat(messages=messages)

    # Update session history (keep last 20 messages)
    history.append({"role": "user", "content": query})
    history.append({"role": "assistant", "content": answer})
    _session_history[session_id] = history[-20:]

    sources = [
        {
            "source": d["source"],
            "text": d["text"][:250],
            "score": round(d["score"], 4),
        }
        for d in docs
    ]

    return {
        "answer": answer,
        "sources": sources,
        "processing_time_ms": round((time.time() - t0) * 1000, 2),
    }


def get_index_stats() -> Dict:
    """Return current index statistics."""
    index, meta = _get_index()
    sources = list({m["source"] for m in meta})
    return {
        "total_chunks": index.ntotal,
        "total_sources": len(sources),
        "sources": sources,
    }
