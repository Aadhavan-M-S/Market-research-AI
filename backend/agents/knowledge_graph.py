"""
agents/knowledge_graph.py — Agent 3: Knowledge Graph Generator  (v2 — Semantic Upgrade)
═══════════════════════════════════════════════════════════════════════════════════════════
Fixes applied:
  FIX 1  — Proper sentence segmentation via segment_sentences()
  FIX 2  — Per-sentence context-aware edge construction
  FIX 3  — Real relation labels via dep parse + LLM fallback
  FIX 4  — Composite edge weighting (semantic + co-occurrence + dependency)
  FIX 5  — Edge filtering (weight threshold + top-N cap)
  FIX 6  — Node importance via degree centrality + frequency
  FIX 7  — Expanded node extraction (NER + noun chunks + TF-IDF keyphrases)
  FIX 8  — Cluster min-size threshold
  FIX 9  — Accurate NLP meta (sentence + token count)
  BONUS  — relation_mode parameter: "fast" (dep-only) | "semantic" (dep + LLM)
"""
from __future__ import annotations

import re
import time
from collections import defaultdict
from typing import Literal

import numpy as np

from models.schemas import (
    KnowledgeGraphRequest,
    KnowledgeGraphResponse,
    KGNode,
    KGEdge,
    NLPMeta,
)
from nlp_engine import (
    build_nlp_meta,
    dependency_parse,
    extract_entities,
    segment_sentences,
    thematic_role_analysis,
    _get_nlp,
    _get_bi_encoder,
)
from llm_client import ollama_generate


# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

EDGE_WEIGHT_THRESHOLD = 0.2
MAX_EDGES = 100
MAX_TEXT_NER = 10_000
MAX_TEXT_DEP = 12_000

DEP_REL_MAP: dict[str, str] = {
    "nsubj":    "SUBJECT_OF",
    "nsubjpass": "SUBJECT_OF",
    "dobj":     "OBJECT_OF",
    "pobj":     "RELATED_TO",
    "attr":     "IS_A",
    "appos":    "ALIAS_OF",
    "prep":     "ASSOCIATED_WITH",
    "compound": "PART_OF",
    "amod":     "DESCRIBED_BY",
    "relcl":    "MODIFIED_BY",
    "conj":     "LINKED_TO",
    "agent":    "ACTED_BY",
}


# ─────────────────────────────────────────────────────────────────────────────
# FIX 7 — Expanded node extraction helpers
# ─────────────────────────────────────────────────────────────────────────────

def _extract_tfidf_keyphrases(sentences: list[str], top_k: int = 20) -> list[str]:
    """
    Lightweight TF-IDF keyphrase extraction over sentence corpus.
    Returns top_k unigram/bigram phrases by TF-IDF score.
    """
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            stop_words="english",
            max_features=200,
            min_df=1,
        )
        X = vectorizer.fit_transform(sentences)
        scores = np.asarray(X.sum(axis=0)).flatten()
        vocab = vectorizer.get_feature_names_out()
        top_indices = scores.argsort()[::-1][:top_k]
        return [vocab[i] for i in top_indices]
    except Exception:
        return []


def _collect_nodes(
    sentences: list[str],
    full_text: str,
    max_nodes: int,
) -> tuple[dict[str, KGNode], dict[str, int]]:
    """
    Collect nodes from:
      1. FLAIR + spaCy NER ensemble  (primary)
      2. spaCy noun chunks            (supplementary)
      3. TF-IDF keyphrases            (fill-in)

    Returns:
      node_map   — id → KGNode
      freq_map   — id → sentence-level mention count  (for FIX 6)
    """
    nlp = _get_nlp()
    node_map: dict[str, KGNode] = {}
    freq_map: dict[str, int] = defaultdict(int)

    # 1. NER ensemble
    ner_entities = extract_entities(full_text[:MAX_TEXT_NER])
    for ent in ner_entities:
        key = ent["text"].strip().lower()
        if len(key) < 2:
            continue
        if key not in node_map:
            node_map[key] = KGNode(
                id=key,
                label=ent["text"].strip(),
                type=ent["label"],
                weight=1.0 + ent.get("score", 0.5),
            )
        else:
            node_map[key].weight += 0.5
        freq_map[key] += 1

    # 2. Noun chunks — allow up to 5-word phrases (FIX 7: relaxed filter)
    doc = nlp(full_text[:MAX_TEXT_DEP])
    for chunk in doc.noun_chunks:
        key = chunk.text.strip().lower()
        words = key.split()
        if (
            key not in node_map
            and 1 < len(words) <= 5
            and len(key) > 3
            and chunk.root.pos_ in ("NOUN", "PROPN")
        ):
            node_map[key] = KGNode(
                id=key,
                label=chunk.text.strip(),
                type="CONCEPT",
                weight=0.6,
            )

    # 3. TF-IDF keyphrases as fallback nodes
    tfidf_phrases = _extract_tfidf_keyphrases(sentences, top_k=20)
    for phrase in tfidf_phrases:
        key = phrase.strip().lower()
        if key not in node_map and len(key) > 3:
            node_map[key] = KGNode(
                id=key,
                label=phrase.strip().title(),
                type="KEYPHRASE",
                weight=0.4,
            )

    # Build per-sentence mention counts for all nodes
    for sent in sentences:
        sent_lower = sent.lower()
        for key in node_map:
            if key in sent_lower:
                freq_map[key] += 1

    # Cap to max_nodes by weight
    nodes_sorted = sorted(node_map.values(), key=lambda n: n.weight, reverse=True)[:max_nodes]
    node_map_capped = {n.id: n for n in nodes_sorted}
    return node_map_capped, dict(freq_map)


# ─────────────────────────────────────────────────────────────────────────────
# FIX 3 — Relation labeling helpers
# ─────────────────────────────────────────────────────────────────────────────

def _dep_relation_for_pair(
    sent_doc,
    e1: str,
    e2: str,
) -> str | None:
    """
    Walk spaCy dependency tree within a sentence doc to find a typed relation
    between two entity surface forms. Returns mapped relation label or None.
    """
    for token in sent_doc:
        t_lower = token.text.lower()
        h_lower = token.head.text.lower()
        if token.dep_ not in DEP_REL_MAP:
            continue
        rel = DEP_REL_MAP[token.dep_]
        # direct match: token ↔ e1, head ↔ e2  or vice versa
        if (e1 in t_lower or t_lower in e1) and (e2 in h_lower or h_lower in e2):
            return rel
        if (e2 in t_lower or t_lower in e2) and (e1 in h_lower or h_lower in e1):
            return rel
    return None


async def _llm_relation(sentence: str, e1: str, e2: str) -> str:
    """
    Ask local LLM (ollama) for a short relation label between two entities.
    Returns a sanitised uppercase_underscored label or "RELATED_TO" on failure.
    """
    prompt = (
        f'Extract the relationship between "{e1}" and "{e2}" from this sentence:\n'
        f'"{sentence}"\n'
        'Reply with ONLY a short snake_case label like: developed_by, competes_with, founded, part_of.\n'
        'If no clear relation exists, reply: related_to'
    )
    try:
        raw: str = await ollama_generate(prompt)
        label = raw.strip().split()[0]          # first token only
        label = re.sub(r"[^a-z_]", "", label.lower())
        return label.upper() if label else "RELATED_TO"
    except Exception:
        return "RELATED_TO"


# ─────────────────────────────────────────────────────────────────────────────
# FIX 4 — Composite edge weight
# ─────────────────────────────────────────────────────────────────────────────

def _composite_weight(
    sem_sim: float,
    co_occur_freq: int,
    max_freq: int,
    dep_strength: float,
) -> float:
    """
    edge_weight = 0.5 * semantic_similarity
                + 0.3 * normalised_co_occurrence
                + 0.2 * dependency_strength
    Clipped to [0, 1].
    """
    norm_freq = co_occur_freq / max(max_freq, 1)
    w = 0.5 * sem_sim + 0.3 * norm_freq + 0.2 * dep_strength
    return round(float(np.clip(w, 0.0, 1.0)), 4)


# ─────────────────────────────────────────────────────────────────────────────
# FIX 1 + 2 — Per-sentence edge builder
# ─────────────────────────────────────────────────────────────────────────────

async def _build_entity_graph(
    text: str,
    max_nodes: int,
    relation_mode: Literal["fast", "semantic"] = "fast",
) -> tuple[list[KGNode], list[KGEdge]]:
    """
    Full upgraded pipeline:
      FIX 1  — segment_sentences() for real segmentation
      FIX 2  — per-sentence edge context
      FIX 3  — dep relation + optional LLM
      FIX 4  — composite weight
      FIX 5  — filter weak edges
      FIX 6  — degree-boosted node weights
      FIX 7  — expanded node extraction
    """
    nlp = _get_nlp()
    encoder = _get_bi_encoder()

    # ── FIX 1: Proper sentence segmentation ──────────────────────────────────
    sentences: list[str] = segment_sentences(text)
    if len(sentences) <= 1:
        # Fallback: split on punctuation if segment_sentences fails
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]

    # ── FIX 7: Expanded node collection ──────────────────────────────────────
    node_map, freq_map = _collect_nodes(sentences, text, max_nodes)
    node_ids = set(node_map.keys())

    if not node_ids:
        return [], []

    # Pre-compute semantic embeddings for all nodes (once)
    node_list = list(node_map.values())
    node_labels = [n.label for n in node_list]
    node_embs = encoder.encode(
        node_labels,
        batch_size=32,
        show_progress_bar=False,
        normalize_embeddings=True,
    )
    id_to_idx = {n.id: i for i, n in enumerate(node_list)}

    # Co-occurrence frequency counter across sentences
    cooccur_freq: dict[tuple[str, str], int] = defaultdict(int)

    # ── FIX 2: Per-sentence edge construction ────────────────────────────────
    raw_edges: dict[tuple[str, str, str], dict] = {}   # (src, tgt, rel) → attrs
    seen_canon: set[tuple[str, str]] = set()

    # Process sentences in chunks to avoid OOM on large texts
    BATCH = 50
    sentence_batches = [sentences[i:i+BATCH] for i in range(0, len(sentences), BATCH)]

    for batch in sentence_batches:
        batch_text = " ".join(batch)
        sent_docs = list(nlp.pipe(batch, disable=["ner"]))   # dep parse only

        for sent_text, sent_doc in zip(batch, sent_docs):
            sent_lower = sent_text.lower()

            # Find which nodes appear in this sentence
            sent_nodes = [nid for nid in node_ids if nid in sent_lower]
            if len(sent_nodes) < 2:
                continue

            for i, e1 in enumerate(sent_nodes):
                for e2 in sent_nodes[i + 1:]:
                    # Canonical pair (order-independent)
                    canon_pair = (min(e1, e2), max(e1, e2))
                    cooccur_freq[canon_pair] += 1

                    # FIX 3: Dependency relation
                    dep_rel = _dep_relation_for_pair(sent_doc, e1, e2)
                    dep_strength = 1.0 if dep_rel else 0.0
                    rel = dep_rel or "RELATED_TO"   # FIX 3: no more CO_OCCURS_WITH

                    # Edge key: prefer dep-typed over RELATED_TO
                    edge_key = (e1, e2, rel)
                    existing = raw_edges.get(edge_key)
                    if existing and existing["dep_strength"] >= dep_strength:
                        existing["cooccur"] += 1
                        continue

                    raw_edges[edge_key] = {
                        "sent_text": sent_text,
                        "dep_strength": dep_strength,
                        "cooccur": cooccur_freq[canon_pair],
                    }

    # ── FIX 3 BONUS: LLM relation enrichment (semantic mode) ─────────────────
    if relation_mode == "semantic":
        enrichable = [
            (key, attrs)
            for key, attrs in raw_edges.items()
            if key[2] == "RELATED_TO" and attrs["dep_strength"] == 0.0
        ][:30]   # cap LLM calls
        for (e1, e2, _rel), attrs in enrichable:
            llm_rel = await _llm_relation(attrs["sent_text"], e1, e2)
            new_key = (e1, e2, llm_rel)
            raw_edges[new_key] = attrs
            del raw_edges[(e1, e2, "RELATED_TO")]

    # ── FIX 4: Compute composite weights ─────────────────────────────────────
    max_freq = max(cooccur_freq.values(), default=1)
    edges: list[KGEdge] = []

    for (e1, e2, rel), attrs in raw_edges.items():
        idx1 = id_to_idx.get(e1)
        idx2 = id_to_idx.get(e2)
        if idx1 is None or idx2 is None:
            continue

        sem_sim = float(np.dot(node_embs[idx1], node_embs[idx2]))
        canon_pair = (min(e1, e2), max(e1, e2))
        w = _composite_weight(
            sem_sim=max(sem_sim, 0.0),
            co_occur_freq=cooccur_freq.get(canon_pair, 1),
            max_freq=max_freq,
            dep_strength=attrs["dep_strength"],
        )

        # FIX 5: Filter weak edges immediately
        if w < EDGE_WEIGHT_THRESHOLD:
            continue

        edges.append(KGEdge(source=e1, target=e2, relation=rel, weight=w))

    # FIX 5: Remove duplicate undirected edges — keep highest weight per pair
    best: dict[tuple[str, str], KGEdge] = {}
    for edge in edges:
        canon = (min(edge.source, edge.target), max(edge.source, edge.target))
        if canon not in best or edge.weight > best[canon].weight:
            best[canon] = edge
    edges = sorted(best.values(), key=lambda e: e.weight, reverse=True)[:MAX_EDGES]

    # ── FIX 6: Degree-boosted node importance ────────────────────────────────
    degree: dict[str, int] = defaultdict(int)
    for edge in edges:
        degree[edge.source] += 1
        degree[edge.target] += 1

    max_degree = max(degree.values(), default=1)
    max_freq_node = max(freq_map.values(), default=1)

    for node in node_list:
        norm_degree = degree.get(node.id, 0) / max_degree
        norm_freq = freq_map.get(node.id, 0) / max_freq_node
        node.weight = round(
            node.weight + (norm_degree * 0.3) + (norm_freq * 0.2),
            4,
        )

    # Re-sort nodes by final weight
    node_list.sort(key=lambda n: n.weight, reverse=True)

    return node_list, edges


# ─────────────────────────────────────────────────────────────────────────────
# FIX 8 — Cluster detection with min-size threshold
# ─────────────────────────────────────────────────────────────────────────────

def _detect_clusters(nodes: list[KGNode], min_cluster_size: int = 2) -> list[dict]:
    """
    Dense embedding k-means clustering.
    Clusters smaller than min_cluster_size are merged into an "OTHER" bucket.
    Falls back to type-based grouping for very small graphs.
    """
    if len(nodes) < 6:
        clusters: dict[str, list[str]] = defaultdict(list)
        for n in nodes:
            clusters[n.type].append(n.label)
        return [
            {"cluster_id": t, "type": t, "members": m[:10]}
            for t, m in clusters.items()
            if len(m) >= min_cluster_size
        ]

    encoder = _get_bi_encoder()
    labels = [n.label for n in nodes]
    embs = encoder.encode(labels, batch_size=32, show_progress_bar=False)

    from sklearn.cluster import KMeans

    n_clusters = max(2, min(8, len(nodes) // 4))
    try:
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        cluster_labels = km.fit_predict(embs)
    except Exception:
        clusters_by_type: dict[str, list[str]] = defaultdict(list)
        for n in nodes:
            clusters_by_type[n.type].append(n.label)
        return [
            {"cluster_id": t, "type": t, "members": m[:10]}
            for t, m in clusters_by_type.items()
        ]

    groups: dict[int, list[str]] = defaultdict(list)
    for node, cid in zip(nodes, cluster_labels):
        groups[int(cid)].append(node.label)

    # FIX 8: Enforce min cluster size
    result = []
    orphans: list[str] = []
    for cid, members in groups.items():
        if len(members) >= min_cluster_size:
            result.append({
                "cluster_id": f"cluster_{cid}",
                "type": "SEMANTIC_CLUSTER",
                "members": members[:10],
            })
        else:
            orphans.extend(members)

    if orphans:
        result.append({
            "cluster_id": "cluster_misc",
            "type": "MISCELLANEOUS",
            "members": orphans[:10],
        })

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Main agent entrypoint
# ─────────────────────────────────────────────────────────────────────────────

async def run_knowledge_graph(
    req: KnowledgeGraphRequest,
    relation_mode: Literal["fast", "semantic"] = "fast",
) -> KnowledgeGraphResponse:
    """
    Main entrypoint.

    Args:
        req:            KnowledgeGraphRequest (text + max_nodes)
        relation_mode:  "fast"     → dependency parse only (default, no LLM overhead)
                        "semantic" → dep parse + LLM relation extraction for ambiguous pairs
    """
    t0 = time.time()

    # ── FIX 9: Accurate sentence/token count via segment_sentences ────────────
    sentences = segment_sentences(req.text)
    if len(sentences) <= 1:
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", req.text) if s.strip()]

    # Build graph (FIX 1–7)
    nodes, edges = await _build_entity_graph(req.text, req.max_nodes, relation_mode)
    clusters = _detect_clusters(nodes)

    # Thematic roles → extra typed edges (unchanged pipeline component)
    roles = thematic_role_analysis(req.text[:4000])
    extra_node_ids = {n.id for n in nodes}
    for frame in roles[:12]:
        pred = frame["predicate"]
        for arg in frame["arguments"]:
            filler_lower = arg["filler"].lower()
            for node in nodes:
                if pred.lower() in node.id or node.id in pred.lower():
                    for n2 in nodes:
                        if filler_lower in n2.id or n2.id in filler_lower:
                            edges.append(KGEdge(
                                source=node.id,
                                target=n2.id,
                                relation=arg["role"],
                                weight=round(
                                    _composite_weight(0.6, 1, 1, 1.0), 4
                                ),
                            ))

    # Enforce final edge cap and dedup
    best: dict[tuple[str, str], KGEdge] = {}
    for edge in edges:
        canon = (min(edge.source, edge.target), max(edge.source, edge.target))
        if canon not in best or edge.weight > best[canon].weight:
            best[canon] = edge
    final_edges = sorted(best.values(), key=lambda e: e.weight, reverse=True)[:MAX_EDGES]

    # ── FIX 9: Accurate NLP meta ──────────────────────────────────────────────
    meta = build_nlp_meta(req.text[:3000], t0)
    # Override with accurate counts
    meta["sentences"] = len(sentences)
    meta["tokens"] = len(req.text.split())

    return KnowledgeGraphResponse(
        nodes=nodes,
        edges=final_edges,
        clusters=clusters,
        nlp_meta=NLPMeta(**meta),
    )