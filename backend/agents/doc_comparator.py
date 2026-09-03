"""
agents/doc_comparator.py — Agent 2: Documentation Comparator  (Optimised)
══════════════════════════════════════════════════════════════════════════
Upgrades:
  • Dense similarity via sentence-transformers (replaces TF-IDF cosine)
    + TF-IDF retained for asymmetric lexical gap detection
  • Hierarchical document comparison: sentence-level FAISS alignment
    (inspired by BERTScore) — finds best-matching sentence pairs across docs
  • LED abstractive summarisation (replaces statistical extractive)
  • FLAIR + spaCy NER ensemble for feature phrase extraction
    (replaces bare spaCy noun_chunks — misses many named features)
  • DeBERTa-v3 pros/cons extraction with confidence-gated filtering
    (threshold raised to 0.67, batched inference)
  • Argument mining: identify claim sentences via dependency + POS patterns
    (obligation/assertion/concession classification)
  • RAG-powered cross-document QA: "what does doc_a say about X that doc_b misses?"
  • Structural diff: section/paragraph alignment via dense cosine matching
  • LLM prompt grounded with specific mismatched evidence passages
  • Vocabulary richness delta: type-token ratio comparison
"""
from __future__ import annotations
from functools import lru_cache
import time
from collections import defaultdict

import numpy as np

from models.schemas import DocComparatorRequest, DocComparatorResponse, NLPMeta
from nlp_engine import (
    analyze_morphology,
    bag_of_words,
    build_nlp_meta,
    build_rag_index,
    compute_similarity,
    extract_entities,
    preprocess_text,
    segment_sentences,
    summarize_text,
    tokenize,
    vector_space_model,
    remove_stopwords,
    classify_sentiment,
    _get_bi_encoder,
    _get_nlp,
)
from llm_client import ollama_generate

encoder = _get_bi_encoder()

# Feature phrase extraction — NER-augmented noun chunks
@lru_cache(maxsize=512)
def encode_text(text_tuple):
    return encoder.encode(list(text_tuple), normalize_embeddings=True)

def _extract_feature_phrases(text: str, top_k: int = 40) -> list[str]:
    """
    Combine spaCy noun_chunks (structural features) with FLAIR/spaCy NER
    entity spans (named features like product names, standards, regulations).
    Dense deduplication: merge phrases with cosine ≥ 0.92.
    """
    nlp = _get_nlp()
    doc = nlp(text[:8000])
    STOP_WORDS = {
    # --- Your Original List ---
    "the", "a", "an", "and", "or", "but", "if", "while", "with",
    "based", "using", "used", "also", "very", "more", "less",
    "such", "including", "provides", "offers", "allows",
    "system", "feature", "document", "data",

    # --- Pronouns & Articles ---
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", 
    "you", "your", "yours", "yourself", "yourselves", "he", "him", 
    "his", "himself", "she", "her", "hers", "herself", "it", "its", 
    "itself", "they", "them", "their", "theirs", "themselves", 
    "what", "which", "who", "whom", "this", "that", "these", "those",

    # --- Prepositions & Conjunctions ---
    "am", "is", "are", "was", "were", "be", "been", "being", 
    "have", "has", "had", "having", "do", "does", "did", "doing", 
    "for", "about", "against", "between", "into", "through", 
    "during", "before", "after", "above", "below", "to", "from", 
    "up", "down", "in", "out", "on", "off", "over", "under", "again", 
    "further", "then", "once", "here", "there", "when", "where", 
    "why", "how", "all", "any", "both", "each", "few", "other", 
    "some", "only", "own", "same", "so", "than", "too", "s", "t", 
    "can", "will", "just", "don", "should", "now"
}
    # Noun chunk phrases
    phrases: set[str] = {
        chunk.text.lower().strip()
        for chunk in doc.noun_chunks
        if len(chunk.text.strip()) > 3 and len(chunk.text.split()) <= 5
    }
    

    # NER-based features (ORG, PRODUCT, LAW, WORK_OF_ART, EVENT)
    entities = extract_entities(text[:8000])
    for e in entities:
        if e["label"] in ("ORG", "PRODUCT", "LAW", "WORK_OF_ART", "EVENT", "NORP"):
            phrases.add(e["text"].lower().strip())
    for token in doc:
        if token.pos_ in ("NOUN", "PROPN") and len(token.text) > 5:
            phrases.add(token.text.lower())
    clean_phrases = []
    for p in phrases:
        tokens = p.split()
        
        # remove stopwords inside phrase
        tokens = [t for t in tokens if t not in STOP_WORDS]
        
        if len(tokens) >= 1 and len(p)>5:  # keep meaningful phrases only
            clean_phrases.append(" ".join(tokens))

    phrase_list = sorted(set(clean_phrases))[:top_k * 2]
    if not phrase_list:
            return list(phrases)[:top_k]

    # Dense deduplication
    embs = encode_text(tuple(phrase_list))
    kept: list[int] = []
    dropped: set[int] = set()
    for i in range(len(phrase_list)):
        if i in dropped:
            continue
        kept.append(i)
        for j in range(i + 1, len(phrase_list)):
            if j not in dropped and float(np.dot(embs[i], embs[j])) >= 0.92:
                dropped.add(j)

    return [phrase_list[i] for i in kept][:top_k]


# Semantic feature gap: dense matching instead of set difference only

def _compare_feature_sets_dense(
    phrases_a: list[str], phrases_b: list[str], sim_threshold: float = 0.75
) -> dict:
    """
    Dense feature comparison via sentence-transformers:
    Two features are "shared" if their cosine ≥ sim_threshold.
    This catches paraphrase-equivalent features missed by exact set difference
    (e.g. "data deletion" ↔ "right to erasure").
    """
    if not phrases_a or not phrases_b:
        return {
            "shared": [], "only_a": list(phrases_a)[:20],
            "only_b": list(phrases_b)[:20], "paraphrase_matches": [],
        }

    embs_a = encode_text(tuple(phrases_a))
    embs_b = encode_text(tuple(phrases_b))

    sim_matrix = embs_a @ embs_b.T   # (|A|, |B|)

    matched_a: set[int] = set()
    matched_b: set[int] = set()
    paraphrase_matches: list[dict] = []

    for i in range(len(phrases_a)):
        best_j = int(np.argmax(sim_matrix[i]))
        best_sim = float(sim_matrix[i][best_j])
        if best_sim >= sim_threshold:
            matched_a.add(i)
            matched_b.add(best_j)
            if phrases_a[i] != phrases_b[best_j]:
                paraphrase_matches.append({
                    "a": phrases_a[i], "b": phrases_b[best_j],
                    "similarity": round(best_sim, 4),
                })

    # Exact matches also count as shared
    set_a, set_b = set(phrases_a), set(phrases_b)
    exact_shared = sorted(set_a & set_b)

    shared = exact_shared + [phrases_a[i] for i in matched_a if phrases_a[i] not in set_b]
    only_a = [p for i, p in enumerate(phrases_a) if i not in matched_a and p not in set_b]
    only_b = [p for j, p in enumerate(phrases_b) if j not in matched_b and p not in set_a]
    def _clean_features(lst):
        return [
        f for f in lst
        if (len(f.split()) >= 2) or (len(f) > 8)
][:10]
    return {
        "shared": [
    f for f in sorted(set(shared))
    if len(f) > 5
][:15],
        "only_a": _clean_features(only_a),
        "only_b": _clean_features(only_b),
        "paraphrase_matches": paraphrase_matches[:10],
    }

# BERTScore-style sentence alignment

def _sentence_alignment(
    sents_a: list[str], sents_b: list[str], top_k: int = 5
) -> dict:
    """
    Align sentences across two documents using dense cosine similarity
    (BERTScore-inspired). Returns:
    - precision: mean of best-match scores from A→B
    - recall:    mean of best-match scores from B→A
    - f1:        harmonic mean
    - top_mismatches: sentence pairs with LOW alignment (unique content)
    """
    if not sents_a or not sents_b:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0, "top_mismatches": []}

    embs_a = encode_text(tuple(sents_a[:70]))
    embs_b = encode_text(tuple(sents_b[:70]))

    sim = embs_a @ embs_b.T   # (|A|, |B|)

    precision_scores = sim.max(axis=1)   # best match for each A sentence in B
    recall_scores    = sim.max(axis=0)   # best match for each B sentence in A

    precision = float(precision_scores.mean())
    recall    = float(recall_scores.mean())
    f1 = 2 * precision * recall / max(precision + recall, 1e-9)

    # Mismatches: A sentences with lowest best-match score in B (unique content)
    low_idx_a = precision_scores.argsort()[:top_k]
    top_mismatches = [
        {
            "doc_a_sentence": sents_a[i],
            "best_doc_b_match": sents_b[int(sim[i].argmax())],
            "similarity": round(float(precision_scores[i]), 4),
        }
        for i in low_idx_a
        if len(sents_a[i].split()) > 5
    ]

    return {
        "precision": round(precision, 4),
        "recall":    round(recall, 4),
        "f1":        round(f1, 4),
        "top_mismatches": top_mismatches[:top_k],
    }

# DeBERTa pros/cons extraction (batched, confidence-gated)

def _extract_pros_cons(text: str, label: str) -> tuple[list[str], list[str]]:
    """
    DeBERTa-v3 sentiment over sentence segments.
    Confidence threshold raised to 0.67.
    Also filters out very short sentences and duplicate content
    via dense deduplication (cosine ≥ 0.88).
    """
    sentences = [s for s in segment_sentences(text)[:60] if len(s.split()) >= 5]
    if not sentences:
        return [], []

    sentiments = classify_sentiment(sentences)

    raw_pros, raw_cons = [], []
    for sent, s in zip(sentences, sentiments):
        if s["label"] == "POSITIVE" and s["score"] >= 0.67:
            raw_pros.append(sent.strip())
        elif s["label"] == "NEGATIVE" and s["score"] >= 0.67:
            raw_cons.append(sent.strip())

    def _dedup(items: list[str], threshold: float = 0.88) -> list[str]:
        if len(items) < 2:
            return items
        embs = encode_text(tuple(items))
        kept: list[str] = []
        dropped: set[int] = set()
        for i in range(len(items)):
            if i in dropped:
                continue
            kept.append(items[i])
            for j in range(i + 1, len(items)):
                if j not in dropped and float(np.dot(embs[i], embs[j])) >= threshold:
                    dropped.add(j)
        return kept

    return _dedup(raw_pros)[:8], _dedup(raw_cons)[:8]


# Argument mining — claim / assertion classification

def _mine_arguments(text: str) -> list[dict]:
    """
    Lightweight argument mining using:
    1. Dependency parse to find modal/assertion verbs.
    2. Sentence-level classification: claim / concession / fact / neutral.
    Useful for comparing what each document asserts vs concedes.
    """
    nlp = _get_nlp()
    doc = nlp(text[:6000])

    claim_indicators    = {"claim", "argue", "assert", "contend", "propose", "state", "maintain"}
    concession_indicators = {"acknowledge", "admit", "concede", "despite", "although", "however", "but"}
    fact_indicators     = {"is", "are", "was", "were", "has", "have", "show", "demonstrate", "prove"}
    modal_obligation    = {"must", "shall", "require", "mandate", "obligate"}
    modal_permission    = {"may", "can", "allow", "permit", "enable"}

    arguments = []
    for sent in doc.sents:
        sent_lemmas = {t.lemma_.lower() for t in sent}
        sent_text   = sent.text.strip()
        if len(sent_text.split()) < 5:
            continue

        if sent_lemmas & claim_indicators:
            arg_type = "CLAIM"
        elif sent_lemmas & concession_indicators:
            arg_type = "CONCESSION"
        elif sent_lemmas & modal_obligation:
            arg_type = "OBLIGATION"
        elif sent_lemmas & modal_permission:
            arg_type = "PERMISSION"
        elif sent_lemmas & fact_indicators:
            arg_type = "FACT"
        else:
            continue

        arguments.append({
            "type": arg_type,
            "sentence": sent_text[:150],
        })

    return arguments[:20]

# Vocabulary richness comparison

def _vocab_richness(tokens: list[str]) -> float:
    """Type-token ratio (TTR) — higher = richer vocabulary."""
    if not tokens:
        return 0.0
    return round(len(set(tokens)) / len(tokens), 4)

# RAG-powered cross-document QA

def _cross_doc_qa(
    rag_a, rag_b,
    features_only_a: list[str],
    features_only_b: list[str],
    label_a: str,
    label_b: str,
) -> list[dict]:
    """
    For each feature unique to doc_a, retrieve supporting context from doc_a
    and check if doc_b has anything related (RAG query).
    Returns a structured evidence list for the LLM prompt.
    """
    evidence = []

    for feat in features_only_a[:4]:
        ctx_a   = rag_a.retrieve(feat, top_k=1)
        ctx_b   = rag_b.retrieve(feat, top_k=1)
        a_text  = ctx_a[0]["text"][:120] if ctx_a else ""
        b_text  = ctx_b[0]["text"][:120] if ctx_b else "(no mention)"
        evidence.append({
            "feature": feat,
            "in_doc":   label_a,
            "context_a": a_text,
            "context_b": b_text,
        })

    for feat in features_only_b[:4]:
        ctx_a   = rag_a.retrieve(feat, top_k=1)
        ctx_b   = rag_b.retrieve(feat, top_k=1)
        a_text  = ctx_a[0]["text"][:120] if ctx_a else "(no mention)"
        b_text  = ctx_b[0]["text"][:120] if ctx_b else ""
        evidence.append({
            "feature": feat,
            "in_doc":   label_b,
            "context_a": a_text,
            "context_b": b_text,
        })

    return evidence


# LLM prompt — grounded with evidence

def _build_comparison_prompt(
    label_a: str, label_b: str,
    summary_a: str, summary_b: str,
    features: dict,
    alignment: dict,
    similarity: float,
    cross_evidence: list[dict],
    args_a: list[dict], args_b: list[dict],
) -> str:
    claim_a = [a["sentence"] for a in args_a if a["type"] == "CLAIM"][:2]
    claim_b = [a["sentence"] for a in args_b if a["type"] == "CLAIM"][:2]
    oblig_a = [a["sentence"] for a in args_a if a["type"] == "OBLIGATION"][:2]
    oblig_b = [a["sentence"] for a in args_b if a["type"] == "OBLIGATION"][:2]

    evidence_str = "\n".join(
        f"  • Feature '{e['feature']}' (only in {e['in_doc']}): "
        f"A says: \"{e['context_a'][:80]}\" | B says: \"{e['context_b'][:80]}\""
        for e in cross_evidence[:5]
    )
    paraphrase_str = "\n".join(
        f"  • \"{m['a']}\" ≈ \"{m['b']}\" (sim={m['similarity']})"
        for m in features.get("paraphrase_matches", [])[:4]
    )

    return f"""
Compare the following two technical documents as a senior product analyst.

━━━━━━━━━━━━━━━━━━━━━━━
DOCUMENT SUMMARIES
━━━━━━━━━━━━━━━━━━━━━━━
[{label_a}]
{summary_a}

[{label_b}]
{summary_b}

━━━━━━━━━━━━━━━━━━━━━━━
QUANTITATIVE SIGNALS
━━━━━━━━━━━━━━━━━━━━━━━
- Semantic Similarity: {similarity:.3f}
- Alignment F1: {alignment['f1']}

━━━━━━━━━━━━━━━━━━━━━━━
FEATURE DIFFERENCES
━━━━━━━━━━━━━━━━━━━━━━━
Unique to {label_a}:
{[f for f in features['only_a'] if len(f.split()) >= 1][:6]}

Unique to {label_b}:
{[f for f in features['only_b'] if len(f.split()) >= 1][:6]}

Shared / Overlapping:
{features['shared'][:6]}

━━━━━━━━━━━━━━━━━━━━━━━
EVIDENCE (RAG)
━━━━━━━━━━━━━━━━━━━━━━━
{evidence_str}

━━━━━━━━━━━━━━━━━━━━━━━
ARGUMENT SIGNALS
━━━━━━━━━━━━━━━━━━━━━━━
Claims in {label_a}: {claim_a}
Claims in {label_b}: {claim_b}

Obligations in {label_a}: {oblig_a}
Obligations in {label_b}: {oblig_b}

━━━━━━━━━━━━━━━━━━━━━━━
TASK
━━━━━━━━━━━━━━━━━━━━━━━

Write a structured comparison with EXACTLY these sections:

1. OVERALL ASSESSMENT  
   - Which document is more comprehensive and why  
   - Base this on feature coverage + depth  

2. KEY DIFFERENTIATORS  
   - 3–5 bullet points  
   - Each must reference specific features  

3. GAPS & WEAKNESSES  
   - What {label_a} is missing  
   - What {label_b} is missing  

4. PRACTICAL IMPACT  
   - How these differences affect developers / users  
   - Be concrete (integration, flexibility, scalability, etc.)

Rules:
- No generic statements
- No repetition
- Use feature names explicitly
- Keep response under 200 words
"""


# Main agent entrypoint

async def run_doc_comparator(req: DocComparatorRequest) -> DocComparatorResponse:
    t0 = time.time()

    # 1. Build per-document RAG indexes 
    sents_a = [s for s in segment_sentences(req.doc_a) if len(s.split()) > 4]
    sents_b = [s for s in segment_sentences(req.doc_b) if len(s.split()) > 4]

    rag_a = build_rag_index(sents_a or [req.doc_a])
    rag_b = build_rag_index(sents_b or [req.doc_b])

    # ── 2. LED abstractive summaries ──────────────────────────────────────────
    summary_a = summarize_text(req.doc_a, method="dl", max_sentences=3)
    summary_b = summarize_text(req.doc_b, method="dl", max_sentences=3)

    # ── 3. NER-augmented feature phrase extraction + dense dedup ──────────────
    phrases_a = _extract_feature_phrases(req.doc_a)
    phrases_b = _extract_feature_phrases(req.doc_b)

    # ── 4. Dense semantic feature gap ─────────────────────────────────────────
    features = _compare_feature_sets_dense(phrases_a, phrases_b)

    # ── 5. BERTScore-style sentence alignment ─────────────────────────────────
    alignment = _sentence_alignment(sents_a, sents_b)

    # ── 6. DeBERTa pros/cons (batched, confidence-gated, deduped) ────────────
    pros_a, cons_a = _extract_pros_cons(req.doc_a, req.label_a)
    pros_b, cons_b = _extract_pros_cons(req.doc_b, req.label_b)

    # ── 7. Dense document similarity (sentence-transformers) ──────────────────
    similarity = compute_similarity(req.doc_a, req.doc_b)

    # ── 8. Morphological comparison + vocab richness ──────────────────────────
    tokens_a = remove_stopwords(tokenize(req.doc_a))
    tokens_b = remove_stopwords(tokenize(req.doc_b))
    morph_a  = analyze_morphology(tokens_a[:80])
    morph_b  = analyze_morphology(tokens_b[:80])

    vocab_overlap = round(
        len(set(tokens_a) & set(tokens_b)) / max(len(set(tokens_a) | set(tokens_b)), 1) * 100, 1
    )
    morphological_insights = {
        req.label_a: {**morph_a, "vocab_richness": _vocab_richness(tokens_a)},
        req.label_b: {**morph_b, "vocab_richness": _vocab_richness(tokens_b)},
        "vocabulary_overlap_pct": vocab_overlap,
    }

    # ── 9. Argument mining ────────────────────────────────────────────────────
    args_a = _mine_arguments(req.doc_a)
    args_b = _mine_arguments(req.doc_b)

    # ── 10. RAG-powered cross-document evidence ───────────────────────────────
    cross_evidence = _cross_doc_qa(
        rag_a, rag_b,
        features["only_a"], features["only_b"],
        req.label_a, req.label_b,
    )

    # ── 11. Grounded LLM verdict ──────────────────────────────────────────────
    llm_prompt = _build_comparison_prompt(
        label_a=req.label_a, label_b=req.label_b,
        summary_a=summary_a, summary_b=summary_b,
        features=features,
        alignment=alignment,
        similarity=similarity,
        cross_evidence=cross_evidence,
        args_a=args_a, args_b=args_b,
    )
    llm_output = ""
    llm_verdict = await ollama_generate(llm_prompt, temperature=0.25)
    if llm_verdict and not llm_verdict.startswith("[Ollama"):
        llm_output = llm_verdict

    meta = build_nlp_meta(req.doc_a[:2000] + " " + req.doc_b[:2000], t0)

    return DocComparatorResponse(
        label_a=req.label_a,
        label_b=req.label_b,
        summary_a=summary_a,
        summary_b=summary_b,
        llm_verdict=llm_output,
        features_only_a=features["only_a"],
        features_only_b=features["only_b"],
        shared_features=features["shared"],
        pros_a=pros_a,
        cons_a=cons_a,
        pros_b=pros_b,
        cons_b=cons_b,
        similarity_score=round(similarity, 4),
        morphological_insights=morphological_insights,
        nlp_meta=NLPMeta(**meta),
    )