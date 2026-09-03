"""
agents/persona_generator.py — Agent 7: Persona Generator (Optimised & Merged)
═══════════════════════════════════════════════════════════════════════
Upgrades:
  • sentence-transformers clustering replaces TF-IDF + KMeans on raw counts
  • DeBERTa-v3 sentiment for psychographic inference (replaces lexicon)
  • RAG-powered archetype matching: retrieve semantically representative
    texts per cluster before LLM persona synthesis
  • Robust spaCy integration for accurate POS, morphological tagging, and custom NER
  • Deduplication and dataset artifact cleaning
  • Formality scoring via spaCy morph tags (augments POS ratio heuristic)
  • Batched inference; no per-text pipeline reload
"""
from __future__ import annotations

import random
import time
import re
import numpy as np
import spacy

# Load spaCy model for accurate POS and NER
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    import spacy.cli
    spacy.cli.download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")

from models.schemas import (
    PersonaGeneratorRequest,
    PersonaGeneratorResponse,
    Persona,
    NLPMeta,
)
from nlp_engine import (
    analyze_morphology,
    build_nlp_meta,
    build_rag_index,
    classify_sentiment,
    extract_entities,
    get_word_embeddings,
    segment_sentences,
    thematic_role_analysis,
    tokenize,
    remove_stopwords,
    _get_bi_encoder,
)
from llm_client import ollama_generate

PERSONA_ARCHETYPES = [
    "The Early Adopter",
    "The Pragmatic Professional",
    "The Price-Sensitive Shopper",
    "The Power User",
    "The Casual Explorer",
    "The Skeptical Analyst",
]

AGE_RANGES   = ["18-24", "25-34", "35-44", "45-54", "55+"]
TECH_LEVELS  = ["Novice", "Intermediate", "Advanced", "Expert"]


# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────

def dedupe_and_truncate(lst: list[str], max_len: int = 120, limit: int = 3) -> list[str]:
    """Deduplicates items, truncates strings to max_len, and limits list size."""
    cleaned = [str(x)[:max_len].strip() for x in lst if x]
    return list(dict.fromkeys(cleaned))[:limit]

def _clean_raw_text(text: str) -> str:
    """Removes dataset artifacts and trims whitespace."""
    pattern = r"(?i)(Customer Interview \d+:|Survey Response:|Support Ticket.*?:|User Review:|Feedback:)"
    return re.sub(pattern, "", text).strip()


# ─────────────────────────────────────────────────────────────────────────────
# Clustering
# ─────────────────────────────────────────────────────────────────────────────

def _cluster_texts_by_style(texts: list[str], n_clusters: int) -> list[list[str]]:
    """
    Dense semantic clustering via sentence-transformers + KMeans.
    Replaces TF-IDF BoW clustering — captures paraphrase & topic similarity.
    Falls back to even-split for tiny corpora.
    """
    if len(texts) <= n_clusters:
        return [[t] for t in texts]

    encoder = _get_bi_encoder()
    try:
        embs = encoder.encode(texts, batch_size=32, show_progress_bar=False)
        from sklearn.cluster import KMeans
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = km.fit_predict(embs)
        clusters: list[list[str]] = [[] for _ in range(n_clusters)]
        for text, label in zip(texts, labels):
            clusters[label].append(text)
        return [c for c in clusters if c]
    except Exception:
        chunk = max(1, len(texts) // n_clusters)
        return [texts[i * chunk: (i + 1) * chunk] for i in range(n_clusters)]


# ─────────────────────────────────────────────────────────────────────────────
# Style & psychographic profiling
# ─────────────────────────────────────────────────────────────────────────────

def _language_style_profile(texts: list[str]) -> dict:
    """Style profiling upgraded to use spaCy for accurate POS and Morph tags."""
    combined = " ".join(texts)
    sentences = segment_sentences(combined)
    tokens = tokenize(combined)
    avg_sent_len = len(tokens) / max(len(sentences), 1)

    # Use spaCy for reliable POS tagging
    doc = nlp(combined[:3000])
    pos_counts: dict[str, int] = {}
    morph_formal_signals = 0
    
    for token in doc:
        pos_counts[token.pos_] = pos_counts.get(token.pos_, 0) + 1
        if "VerbForm=Part" in str(token.morph) or "Mood=Sub" in str(token.morph):
            morph_formal_signals += 1

    total_pos = sum(pos_counts.values()) or 1
    vocab_richness = len(set(tokens)) / max(len(tokens), 1)

    formal_tags   = pos_counts.get("NOUN", 0) + pos_counts.get("ADJ", 0)
    informal_tags = pos_counts.get("PRON", 0) + pos_counts.get("INTJ", 0)

    formality_score = (formal_tags - informal_tags + morph_formal_signals) / max(total_pos, 1)
    formality = "formal" if formality_score > 0 else "informal"

    return {
        "avg_sentence_length": round(avg_sent_len, 1),
        "vocabulary_richness": round(vocab_richness, 3),
        "formality": formality,
        "formality_score": round(formality_score, 4),
        "pos_distribution": {k: round(v / total_pos, 3) for k, v in pos_counts.items()},
        "dominant_pos": max(pos_counts, key=pos_counts.get, default="NOUN"),
    }


def _infer_psychographics(texts: list[str], rag_index) -> dict:
    """
    Psychographic inference using DeBERTa sentiment to classify sentences:
    - POSITIVE sentences with high confidence → goals / motivations
    - NEGATIVE sentences with high confidence → pain points
    """
    # Split cluster texts into individual sentences for finer-grained classification
    all_sents = []
    for t in texts[:15]:
        sents = segment_sentences(t)
        all_sents.extend([s.strip() for s in sents if len(s.split()) >= 5])

    if not all_sents:
        all_sents = [t[:200] for t in texts[:10]]

    # DeBERTa batch sentiment classification
    sentiments = classify_sentiment(all_sents[:30])

    goals_raw, pain_raw = [], []
    for sent, s in zip(all_sents, sentiments):
        clean = sent.strip()[:150]
        if s["label"] == "POSITIVE" and s["score"] >= 0.60:
            goals_raw.append(clean)
        elif s["label"] == "NEGATIVE" and s["score"] >= 0.60:
            pain_raw.append(clean)

    pos_pct = sum(1 for s in sentiments if s["label"] == "POSITIVE") / max(len(sentiments), 1)

    values = []
    if pos_pct > 0.6:
        values.extend(["quality", "efficiency", "innovation"])
    elif pos_pct < 0.4:
        values.extend(["reliability", "cost-effectiveness", "support"])
    else:
        values.extend(["value", "simplicity", "trust"])

    return {
        "motivations": (goals_raw[:4] or ["improve workflow efficiency", "reduce manual effort"]),
        "pain_points_raw": (pain_raw[:4] or ["complexity in current tools", "lack of clear guidance"]),
        "positive_sentiment_ratio": round(pos_pct, 2),
        "inferred_values": values,
    }


# ─────────────────────────────────────────────────────────────────────────────
# LLM persona synthesis
# ─────────────────────────────────────────────────────────────────────────────

async def _generate_persona_with_llm(
    cluster_texts: list[str],
    archetype: str,
    style: dict,
    psycho: dict,
    context: str,
    rag_index,
) -> Persona:
    """
    RAG-augmented LLM persona synthesis:
    Retrieve the most representative 3 texts per cluster via dense similarity
    before constructing the LLM prompt — ensures richer, grounded personas.
    """
    try:
        encoder = _get_bi_encoder()
        embs = encoder.encode(cluster_texts, batch_size=32, show_progress_bar=False, normalize_embeddings=True)
        centroid = embs.mean(axis=0, keepdims=True)
        centroid = centroid / (np.linalg.norm(centroid) + 1e-9)
        sims = (embs @ centroid.T).flatten()
        top_indices = sims.argsort()[::-1][:3]
        sample = [cluster_texts[i] for i in top_indices]
    except Exception:
        sample = cluster_texts[:3]

    llm_prompt = (
        f"You are a UX research expert. Analyze these user quotes and create a realistic persona.\n\n"
        f"USER QUOTES:\n" + "\n".join(f"- \"{s[:200]}\"" for s in sample) + "\n\n"
        f"CONTEXT: {context or 'B2B/B2C user'}\n\n"
        f"Return ONLY a valid JSON object (no markdown, no explanation) with these exact keys:\n"
        f'{{"name": "A realistic full name",'
        f' "archetype": "A 2-4 word archetype derived from the quotes (e.g. The Efficiency-Driven Manager, The Technical Power User, The Overwhelmed Beginner)",'
        f' "age_range": "e.g. 25-34",'
        f' "occupation": "A specific job title based on the quotes",'
        f' "tech_level": "Novice or Intermediate or Advanced or Expert",'
        f' "goals": ["goal 1", "goal 2", "goal 3"],'
        f' "pain_points": ["pain 1", "pain 2", "pain 3"],'
        f' "representative_quote": "The most representative quote from the input"}}\n\n'
        f"IMPORTANT: goals must be aspirational objectives. pain_points must be frustrations or problems. Do NOT mix them up."
    )
    raw = await ollama_generate(llm_prompt, temperature=0.6, max_tokens=1024)

    import json, re
    import logging
    logger = logging.getLogger("spectra")

    json_match = re.search(r"\{.*\}", raw, re.DOTALL)
    
    if json_match:
        try:
            data = json.loads(json_match.group())
            llm_archetype = data.get("archetype", archetype)
            return Persona(
                name=data.get("name", "Anonymous"),
                archetype=llm_archetype,
                demographics={
                    "age_range":  data.get("age_range",  random.choice(AGE_RANGES)),
                    "occupation": data.get("occupation", "Specialized Professional"),
                    "tech_level": data.get("tech_level", random.choice(TECH_LEVELS)),
                },
                psychographics={
                    "values": dedupe_and_truncate(psycho["inferred_values"], 50),
                    "motivations": dedupe_and_truncate(data.get("goals", psycho["motivations"]), 150),
                    "positive_sentiment_ratio":  psycho["positive_sentiment_ratio"],
                },
                pain_points=dedupe_and_truncate(data.get("pain_points", psycho["pain_points_raw"]), 150),
                goals=dedupe_and_truncate(data.get("goals", psycho["motivations"]), 150),
                language_style=style,
                representative_quote=str(data.get("representative_quote", sample[0][:150] if sample else ""))[:200],
            )
        except Exception as e:
            logger.warning(f"[Persona] LLM JSON parse failed: {e} | raw: {raw[:300]}")

    else:
        logger.warning(f"[Persona] No JSON found in LLM output: {raw[:300]}")

    # NLP-only fallback — uses DeBERTa sentiment-classified goals/pains from psycho
    # Pick the most representative sentence as the quote
    best_quote = cluster_texts[0][:200] if cluster_texts else ""
    for t in cluster_texts:
        if len(t.split()) >= 8:
            best_quote = t[:200]
            break

    return Persona(
        name=f"User Cluster {archetype.split()[-1]}",
        archetype=f"The {archetype.split()[-1]} Archetype",
        demographics={
            "age_range":  random.choice(AGE_RANGES),
            "occupation": "Professional (LLM unavailable)",
            "tech_level": "Intermediate",
        },
        psychographics={
            "values": dedupe_and_truncate(psycho["inferred_values"], 50),
            "motivations": dedupe_and_truncate(psycho["motivations"], 150),
            "positive_sentiment_ratio": psycho["positive_sentiment_ratio"],
        },
        pain_points=dedupe_and_truncate(psycho["pain_points_raw"], 150),
        goals=dedupe_and_truncate(psycho["motivations"], 150),
        language_style=style,
        representative_quote=best_quote,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Main agent entrypoint
# ─────────────────────────────────────────────────────────────────────────────

async def run_persona_generator(req: PersonaGeneratorRequest) -> PersonaGeneratorResponse:
    t0 = time.time()
    
    # Apply text cleaning
    texts = [_clean_raw_text(t) for t in req.raw_text_samples if _clean_raw_text(t)]
    if not texts:
        raise ValueError("No valid text remaining after cleaning.")
        
    n = req.n_personas

    # Apply Custom NER post-processing for better metadata
    combined_raw = " ".join(texts)[:5000]
    doc = nlp(combined_raw)
    refined_entities = []
    for ent in doc.ents:
        if ent.label_ in ["CARDINAL", "DATE", "TIME", "ORDINAL", "PERCENT"]:
            continue
        label = ent.label_
        if label in ["ORG", "PRODUCT"] and "AI" in ent.text: label = "FIELD"
        if label in ["PRODUCT"] and "hardware" in ent.text.lower(): label = "COMPONENT"
        refined_entities.append({"text": ent.text, "label": label})

    # Build RAG index once across all cluster analyses (using cleaned texts)
    rag_index = build_rag_index(texts)

    # 1. Dense-embedding cluster assignment
    clusters = _cluster_texts_by_style(texts, n)

    # 2. Per-cluster analysis
    personas, cluster_info = [], []

    for i, cluster_texts in enumerate(clusters[:n]):
        archetype_hint = PERSONA_ARCHETYPES[i % len(PERSONA_ARCHETYPES)]
        style   = _language_style_profile(cluster_texts)
        psycho  = _infer_psychographics(cluster_texts, rag_index)
        persona = await _generate_persona_with_llm(
            cluster_texts, archetype_hint, style, psycho, req.context, rag_index
        )
        personas.append(persona)
        cluster_info.append({
            "cluster_id": i,
            "size": len(cluster_texts),
            "archetype": persona.archetype,
            "sample_count": len(cluster_texts),
        })

    # 3. Morphological profile
    combined = " ".join(texts)
    tokens = remove_stopwords(tokenize(combined))
    morph_profile = analyze_morphology(tokens[:100])

    # 4. Dual-path embedding distances (W2V + sentence-transformers)
    target_words = [p.name.split()[-1].lower() for p in personas]
    embedding_distances = get_word_embeddings(texts, target_words[:5], vector_size=64)

    meta = build_nlp_meta(combined[:3000], t0)
    # Optional: Inject refined entities into the metadata or response if needed 
    # meta["extracted_entities"] = refined_entities

    return PersonaGeneratorResponse(
        personas=personas,
        cluster_info=cluster_info,
        morphological_profile=morph_profile,
        embedding_distances=embedding_distances,
        nlp_meta=NLPMeta(**meta),
    )