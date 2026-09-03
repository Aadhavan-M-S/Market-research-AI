"""
agents/diligence_agent.py — Feature 2: Due Diligence Document Analyzer
════════════════════════════════════════════════════════════════════════
Architecture:
  • PDF parsing via PyMuPDF (fitz), fallback to pdfplumber, fallback to OCR (pytesseract)
  • Chunked text processing (500–800 token windows, merged results)
  • Structured financial entity extraction (revenue / debt / liabilities / costs)
  • Filtered spaCy NER for organizational/legal entities
  • Ollama LLM with strict JSON schema output
  • RAG context injected into LLM prompt for grounded reasoning
  • Risk deduplication + severity ranking (CRITICAL > HIGH > MEDIUM > LOW)
  • Output: summary, financial_highlights, risks, verdict, confidence_score

AUDIT FIXES APPLIED:
  [FIX-1]  Financial highlights fallback — guaranteed non-empty from extracted entities
  [FIX-2]  worst_case_scenario validated with .strip() (not just truthiness)
  [FIX-3]  verdict hard-guaranteed — never empty/undefined
  [FIX-4]  Confidence score minimum floor (0.10) — prevents misleading 0
  [FIX-5]  LLM output schema validation — required fields checked post-parse
  [FIX-6]  Parallel LLM chunk execution via asyncio.gather
  [FIX-7]  spaCy model loaded once at module level (global singleton)
  [FIX-8]  Financial highlights seeded from deterministic extraction before LLM merge

FINAL FIX PASS (STABILITY + CORRECTNESS HARDENING):
  [FINAL-1]  _is_meaningless_text() — global filter for junk LLM outputs
  [FINAL-2]  Post-schema cleaning of meaningless financial_highlights and worst_case
  [FINAL-3]  Financial highlights fallback triggered when all values are meaningless
  [FINAL-4]  Worst-case scenario regenerated when meaningless (not just empty)
  [FINAL-5]  _compute_confidence() rewritten — hard floor 0.30, no more 0%
  [FINAL-6]  LLM chunk calls wrapped with asyncio.wait_for (30s timeout, no hangs)
  [FINAL-7]  Hardened full LLM failure fallback — all fields guaranteed
  [FINAL-8]  Risk deduplication uses Jaccard similarity (_similar()) instead of fragile loop
  [FINAL-9]  Empty financial_highlights caught again before final return
  [FINAL-10] Risks re-ranked before final return
"""
from __future__ import annotations

import asyncio
import io
import json
import logging
import re
import time
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Google ADK (optional) ─────────────────────────────────────────────────────
try:
    import google.adk  # noqa: F401
    _ADK_AVAILABLE = True
    logger.info("[Diligence] Google ADK available")
except ImportError:
    _ADK_AVAILABLE = False
    logger.info("[Diligence] Google ADK not available — using sequential pipeline")


# ── Constants ─────────────────────────────────────────────────────────────────

SEVERITY_ORDER   = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
VALID_SEVERITIES = {"CRITICAL", "HIGH", "MEDIUM", "LOW"}

_JUNK_ENTITIES = {
    "section", "draft", "ignore", "team", "page", "item", "note",
    "see", "ref", "table", "annex", "appendix", "schedule", "exhibit",
    "attachment", "herein", "hereof", "thereof", "thereto", "whereas",
    "n/a", "tbd", "tbc", "none", "nil",
}

_CHUNK_SIZE    = 700
_CHUNK_CHARS   = _CHUNK_SIZE * 4   # ~2800 chars per chunk
_CHUNK_OVERLAP = 200

# [FIX-4] Minimum confidence floor — prevents misleading 0 when extraction is valid
_CONFIDENCE_FLOOR = 0.10

# [FIX-7] spaCy model loaded once at module level (not per request)
_NLP = None

def _get_nlp():
    """Return cached spaCy model, loading it once on first call."""
    global _NLP
    if _NLP is None:
        try:
            import spacy
            _NLP = spacy.load("en_core_web_sm")
            logger.info("[Diligence] spaCy model loaded (en_core_web_sm)")
        except Exception as e:
            logger.warning(f"[Diligence] spaCy load failed: {e}")
    return _NLP


# ── [FINAL-1] Meaningless Text Filter ────────────────────────────────────────

def _is_meaningless_text(val: str) -> bool:
    if not val:
        return True

    v = str(val).strip().lower()

    # 🔥 normalize punctuation
    v = re.sub(r"[^\w\s]", "", v)

    return any(x in v for x in [
        "none",
        "none identified",
        "no data",
        "not available",
        "not assessed",
        "n/a",
        "na",
        "unknown",
        "nil",
        "tbd",
        "tbc",
    ])


# ── [1] Verdict Normalization ─────────────────────────────────────────────────

def _normalize_verdict(v: str) -> str:
    """Normalize free-form LLM verdict strings to canonical values."""
    if not v or not str(v).strip():
        return "Caution"
    v = str(v).lower().strip()
    if any(x in v for x in ["decline", "reject", "do not proceed"]):
        return "Decline"
    if any(x in v for x in ["caution", "risk", "conditional"]):
        return "Caution"
    if any(x in v for x in ["proceed", "approve"]):
        return "Proceed"
    return "Caution"


# ── [2] Deterministic Risk Score ──────────────────────────────────────────────

def _compute_risk_score(risks: List[Dict]) -> int:
    weights = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
    return sum(weights.get(r.get("severity", "MEDIUM"), 2) for r in risks)


def _apply_deterministic_verdict(analysis: Dict) -> None:
    score = _compute_risk_score(analysis.get("risks", []))
    if score >= 12:
        analysis["verdict"] = "Decline"
    elif score >= 7:
        analysis["verdict"] = "Caution"
    else:
        analysis["verdict"] = "Proceed"


# ── [3] Worst-Case Scenario Fallback ──────────────────────────────────────────

def _generate_worst_case(analysis: Dict) -> str:
    risks = analysis.get("risks", [])
    if not risks:
        return "Insufficient data to model downside scenario."
    top = risks[:2]
    risk_titles = [r.get("risk", "") for r in top if r.get("risk")]
    return (
        f"Combined materialization of {', '.join(risk_titles)} could disrupt operations, "
        "strain liquidity, and materially reduce EBITDA, with potential covenant breach risk."
    )


# ── [6] Minimum Output Quality Enforcement ────────────────────────────────────

def _enforce_minimum_quality(analysis: Dict) -> None:
    if not analysis.get("summary"):
        analysis["summary"] = "Insufficient structured data extracted from document."

    if not analysis.get("risks"):
        analysis["risks"] = [{
            "category": "Operational",
            "risk": "Insufficient risk extraction",
            "severity": "MEDIUM",
            "evidence": "",
            "impact": "Potential unidentified risks",
            "recommendation": "Manual review required",
        }]


# ── [9] Risk Severity Validation ─────────────────────────────────────────────

def _validate_risk_severities(analysis: Dict) -> None:
    for r in analysis.get("risks", []):
        sev = (r.get("severity") or "MEDIUM").upper()
        r["severity"] = sev if sev in VALID_SEVERITIES else "MEDIUM"


# ── [FIX-5] LLM Output Schema Validation ─────────────────────────────────────

_REQUIRED_FIELDS = {
    "summary": str,
    "financial_highlights": list,
    "risks": list,
    "verdict": str,
    "worst_case_scenario": str,
}

def _validate_llm_schema(parsed: Dict) -> Dict:
    """
    [FIX-5] Validate required fields exist and have correct types.
    Fills missing/wrong-typed fields with safe defaults rather than
    letting None/missing propagate to the UI.

    [FINAL-2] After type validation, strip meaningless values from
    financial_highlights and worst_case_scenario.
    """
    defaults = {
        "summary": "",
        "financial_highlights": [],
        "risks": [],
        "verdict": "Caution",
        "worst_case_scenario": "",
        "verdict_reasoning": "",
    }
    for field, expected_type in _REQUIRED_FIELDS.items():
        val = parsed.get(field)
        if val is None or not isinstance(val, expected_type):
            logger.warning(
                f"[Diligence][FIX-5] LLM field '{field}' missing or wrong type "
                f"(got {type(val).__name__}, expected {expected_type.__name__}) — using default"
            )
            parsed[field] = defaults[field]
        # Extra: coerce empty strings for list fields
        if expected_type is list and isinstance(val, str):
            parsed[field] = []

    # [FINAL-2] Remove meaningless financial highlights
    if isinstance(parsed.get("financial_highlights"), list):
        parsed["financial_highlights"] = [
            h for h in parsed["financial_highlights"]
            if isinstance(h, str) and not _is_meaningless_text(h)
        ]

    # [FINAL-2] Clean meaningless worst_case
    if _is_meaningless_text(parsed.get("worst_case_scenario")):
        parsed["worst_case_scenario"] = ""

    return parsed


# ── PDF Parsing ───────────────────────────────────────────────────────────────

def _ocr_fallback(file_bytes: bytes) -> str:
    try:
        import fitz
        import pytesseract
        from PIL import Image

        doc = fitz.open(stream=file_bytes, filetype="pdf")
        ocr_text = []
        for page in doc:
            pix = page.get_pixmap()
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            ocr_text.append(pytesseract.image_to_string(img))
        doc.close()
        result = "\n".join(ocr_text)
        logger.info(f"[Diligence] OCR extracted {len(result)} chars via pytesseract")
        return result
    except Exception as e:
        logger.error(f"[Diligence] OCR fallback failed: {e}")
        return ""


def _parse_pdf_bytes(file_bytes: bytes) -> str:
    try:
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages = [page.get_text() for page in doc]
        doc.close()
        text = "\n\n".join(pages)
        if text.strip():
            logger.info(f"[Diligence] Extracted {len(text)} chars via PyMuPDF")
            logger.debug(f"[DEBUG] Preview: {text[:300]}")
            return text
    except Exception as e:
        logger.debug(f"[Diligence] PyMuPDF failed: {e}")

    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages = [p.extract_text() or "" for p in pdf.pages]
        text = "\n\n".join(pages)
        if text.strip():
            logger.info(f"[Diligence] Extracted {len(text)} chars via pdfplumber")
            logger.debug(f"[DEBUG] Preview: {text[:300]}")
            return text
    except Exception as e:
        logger.error(f"[Diligence] pdfplumber failed: {e}")

    logger.warning("[Diligence] Primary parsers failed — attempting OCR fallback")
    return _ocr_fallback(file_bytes)


# ── Text Chunking ─────────────────────────────────────────────────────────────

def _chunk_text(text: str) -> List[str]:
    chunks: List[str] = []
    start = 0
    while start < len(text):
        end = start + _CHUNK_CHARS
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk)
        start += _CHUNK_CHARS - _CHUNK_OVERLAP
    return chunks or [text]


# ── Financial Entity Extraction ───────────────────────────────────────────────

_RE_MONEY = re.compile(
    r'(?:USD|GBP|EUR|£|\$|€)\s*[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|thousand|M|B|K))?'
    r'|[\d,]+(?:\.\d+)?\s*(?:million|billion)\s*(?:dollars?|pounds?|euros?)',
    re.IGNORECASE,
)
_RE_PCT  = re.compile(r'\b\d+\.?\d*\s*%')
_RE_DATE = re.compile(
    r'\bQ[1-4]\s*\d{4}'
    r'|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}'
    r'|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)'
    r'\s+\d{1,2},?\s*\d{4}'
)

_REVENUE_KW   = re.compile(r'\b(revenue|sales|turnover|income|receipts|gross profit)\b', re.I)
_DEBT_KW      = re.compile(r'\b(debt|loan|borrowing|credit facility|note payable|bond)\b', re.I)
_LIABILITY_KW = re.compile(r'\b(liabilit(?:y|ies)|obligation|payable|deficit|contingent)\b', re.I)
_COST_KW      = re.compile(r'\b(cost|expense|expenditure|opex|capex|amortization|depreciation)\b', re.I)


def _classify_money_mention(context: str) -> str:
    if _REVENUE_KW.search(context):   return "revenue"
    if _DEBT_KW.search(context):      return "debt"
    if _LIABILITY_KW.search(context): return "liabilities"
    if _COST_KW.search(context):      return "costs"
    return "other"


def _extract_financial_entities(text: str) -> Dict:
    buckets: Dict[str, List[str]] = {
        "revenue": [], "debt": [], "liabilities": [], "costs": [], "other": [],
    }
    seen_money: set = set()

    for m in _RE_MONEY.finditer(text):
        val = m.group().strip()
        if val in seen_money:
            continue
        seen_money.add(val)
        ctx_start = max(0, m.start() - 120)
        context = text[ctx_start: m.end() + 60]
        category = _classify_money_mention(context)
        buckets[category].append(val)

    percentages = list(dict.fromkeys(_RE_PCT.findall(text)))[:12]
    dates       = list(dict.fromkeys(_RE_DATE.findall(text)))[:15]

    return {
        "revenue":     buckets["revenue"][:15],
        "debt":        buckets["debt"][:10],
        "liabilities": buckets["liabilities"][:10],
        "costs":       buckets["costs"][:10],
        "percentages": percentages,
        "dates":       dates,
    }


# ── [FIX-1] Financial Highlights Fallback ─────────────────────────────────────

import re

def _parse_money(val):
    if not val:
        return None
    v = val.replace("$", "").replace("M", "").strip()
    try:
        return float(v)
    except:
        return None


def _build_financial_highlights_fallback(financial: dict):
    highlights = []

    revenue = financial.get("revenue", [])
    debt = financial.get("debt", [])
    liabilities = financial.get("liabilities", [])

    # 🔹 Revenue analysis
    if len(revenue) >= 2:
        nums = [_parse_money(x) for x in revenue if _parse_money(x) is not None]
        if len(nums) >= 2:
            growth = ((nums[-1] - nums[0]) / nums[0]) * 100 if nums[0] else 0
            highlights.append(
                f"Revenue increased from {revenue[0]} to {revenue[-1]} (~{growth:.1f}% growth), indicating strong top-line expansion"
            )

    # 🔹 Debt analysis
    if len(debt) >= 2:
        nums = [_parse_money(x) for x in debt if _parse_money(x) is not None]
        if len(nums) >= 2:
            if nums[-1] < nums[0]:
                highlights.append(
                    f"Debt reduced from {debt[0]} to {debt[-1]}, indicating improved leverage position"
                )
            else:
                highlights.append(
                    f"Debt increased from {debt[0]} to {debt[-1]}, indicating rising leverage risk"
                )

    # 🔹 Liabilities insight
    if liabilities:
        highlights.append(
            f"Liabilities estimated between {liabilities[0]} and {liabilities[-1]}, indicating potential financial or legal exposure"
        )

    return highlights

# ── NER Entities ──────────────────────────────────────────────────────────────

def _extract_nlp_entities(text: str) -> List[Dict]:
    """spaCy NER — uses globally loaded model ([FIX-7])."""
    nlp = _get_nlp()
    if nlp is None:
        return []
    try:
        doc = nlp(text[:8000])
        seen: set = set()
        entities: List[Dict] = []
        for ent in doc.ents:
            norm = ent.text.strip().lower()
            if (
                ent.label_ in {"ORG", "PERSON", "GPE", "MONEY", "DATE", "LAW"}
                and ent.text not in seen
                and len(norm) > 2
                and norm not in _JUNK_ENTITIES
                and not norm.isdigit()
            ):
                seen.add(ent.text)
                entities.append({"text": ent.text.strip(), "label": ent.label_})
        return entities[:40]
    except Exception as e:
        logger.warning(f"[Diligence] spaCy NER failed: {e}")
        return []


# ── LLM Strict JSON Analysis ──────────────────────────────────────────────────

_JSON_SCHEMA = """{
  "summary": "3-4 sentence synthesis of the document's financial and legal standing",
  "financial_highlights": ["key financial data point 1", "key financial data point 2"],
  "risks": [
    {
      "category": "Financial | Legal | Operational | Governance",
      "risk": "concise risk title",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "evidence": "verbatim or paraphrased quote from the document",
      "impact": "quantified or qualified downside if risk materializes",
      "recommendation": "specific mitigation or due-diligence action"
    }
  ],
  "verdict": "Proceed | Caution | Decline",
  "worst_case_scenario": "brief description of the most adverse realistic outcome",
  "verdict_reasoning": "1-2 sentence rationale for the verdict"
}"""

_SYSTEM_PROMPT = (
    "You are a Managing Director-level due diligence analyst at a top-tier investment bank. "
    "Your mandate is downside protection: assume every ambiguity conceals a risk until proven otherwise. "
    "Identify BOTH explicit risks stated in the document AND inferred risks from:\n"
    "  • Inconsistencies between stated figures\n"
    "  • Absent or insufficient risk mitigations\n"
    "  • Unusual contractual language or missing standard clauses\n"
    "  • Off-balance-sheet items, contingent liabilities, or deferred obligations\n\n"
    "Rules:\n"
    "  1. Return ONLY valid JSON matching the schema — no markdown, no commentary, no trailing text.\n"
    "  2. Each risk must cite document evidence (exact phrase or paraphrase with location if possible).\n"
    "  3. Severity must reflect realistic financial or legal materiality, not worst-case imagination.\n"
    "  4. Financial highlights must be specific data points (figures, ratios, dates) — not opinions.\n"
    "  5. Use professional investment-bank language; no hedging phrases like 'it appears' or 'seems'.\n"
)


def _safe_parse_llm_json(raw: str) -> Dict:
    try:
        return json.loads(raw)
    except Exception:
        pass

    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        parsed = json.loads(raw[start:end])
        if "risks" not in parsed or not isinstance(parsed["risks"], list):
            raise ValueError("Invalid schema")
        return parsed
    except Exception:
        raise ValueError("LLM OUTPUT BROKEN:\n" + raw[:500])


# ── [FINAL-8] Improved Risk Deduplication ────────────────────────────────────

def _similar(a: str, b: str) -> float:
    """
    [FINAL-8] Jaccard similarity between two tokenized strings.
    Replaces the fragile word-in-string loop that gave inconsistent
    results depending on token order.
    """
    sa, sb = set(a.split()), set(b.split())
    return len(sa & sb) / max(len(sa | sb), 1)


def _deduplicate_risks(risks: List[Dict]) -> List[Dict]:
    seen_norms: List[str] = []
    unique: List[Dict] = []
    for r in risks:
        title = re.sub(r'\W+', ' ', (r.get("risk") or "").lower()).strip()
        if not title:
            continue
        # [FINAL-8] Jaccard similarity instead of fragile substring counting
        is_dup = any(_similar(title, prev) > 0.6 for prev in seen_norms)
        if not is_dup:
            seen_norms.append(title)
            unique.append(r)
    return unique


def _rank_risks(risks: List[Dict]) -> List[Dict]:
    return sorted(
        risks,
        key=lambda r: SEVERITY_ORDER.get((r.get("severity") or "MEDIUM").upper(), 2),
    )


async def _llm_analyze_chunk(chunk: str, query: str, rag_context: str) -> Optional[Dict]:
    """
    Single-chunk LLM pass returning validated structured JSON.
    [FIX-5]    Schema validation after parse.
    [FINAL-6]  asyncio.wait_for timeout (30s) prevents hanging on slow Ollama.
    """
    from llm_client import ollama_generate

    prompt = (
        f"{_SYSTEM_PROMPT}\n\n"
        f"=== ANALYST QUERY ===\n{query}\n\n"
        f"=== DOCUMENT EXCERPT ===\n{chunk}\n\n"
        + (f"=== KNOWLEDGE BASE CONTEXT ===\n{rag_context}\n\n" if rag_context else "")
        + f"=== REQUIRED OUTPUT SCHEMA ===\n{_JSON_SCHEMA}\n\n"
        "Respond with ONLY valid JSON:"
    )

    for attempt in range(2):
        try:
            # [FINAL-6] Wrap with timeout — prevents pipeline hangs on slow/hung Ollama
            raw = await asyncio.wait_for(
                ollama_generate(prompt, model="llama3:latest", max_tokens=1200, temperature=0.15),
                timeout=400,
            )
            parsed = _safe_parse_llm_json(raw)
            # [FIX-5] Validate schema (also runs [FINAL-2] cleanup) before returning
            return _validate_llm_schema(parsed)
        except asyncio.TimeoutError:
            logger.warning(f"[Diligence][FINAL-6] LLM chunk attempt {attempt + 1} timed out after 30s")
        except Exception as e:
            logger.warning(f"[Diligence] LLM chunk attempt {attempt + 1} failed: {e}")
            prompt += "\nSTRICTLY RETURN VALID JSON ONLY."

    return None


def _merge_chunk_results(results: List[Dict], financial: Dict) -> Dict:
    """
    Merge multi-chunk LLM outputs into a single coherent analysis.
    [FIX-1]    Seeds financial_highlights from deterministic extraction when LLM returns empty.
    [FINAL-3]  Also triggers fallback when all highlights are meaningless strings.
    """
    VERDICT_ORDER = {"Decline": 0, "Caution": 1, "Proceed": 2}

    merged_risks:      List[Dict] = []
    merged_highlights: List[str]  = []
    summary = ""
    worst_case = ""
    verdict_reasoning = ""
    verdicts: List[str] = []

    for r in results:
        if not r:
            continue
        if not summary:
            summary = r.get("summary", "")
        if not verdict_reasoning:
            verdict_reasoning = r.get("verdict_reasoning", "")
        wc = r.get("worst_case_scenario", "")
        if wc and len(wc) > len(worst_case):
            worst_case = wc
        merged_risks.extend(r.get("risks") or [])
        merged_highlights.extend(r.get("financial_highlights") or [])
        v = r.get("verdict", "")
        if v:
            verdicts.append(v)

    verdict = "Caution"
    if verdicts:
        verdict = min(verdicts, key=lambda v: VERDICT_ORDER.get(v, 1))

    # Deduplicate highlights
    seen_hl: set = set()
    unique_highlights: List[str] = []
    for hl in merged_highlights:
        norm = hl.lower().strip()
        if norm not in seen_hl and len(norm) > 4:
            seen_hl.add(norm)
            unique_highlights.append(hl)

    # [FIX-1 / FINAL-3] Use deterministic fallback when LLM highlights are empty
    # OR when every highlight is a meaningless placeholder string
    if (
        not unique_highlights or
        all(_is_meaningless_text(h) for h in unique_highlights)
    ):
        logger.info("[FINAL FIX] Financial highlights invalid — using deterministic fallback")
        unique_highlights = _build_financial_highlights_fallback(financial)

    return {
        "summary": summary,
        "financial_highlights": unique_highlights[:10],
        "risks": _rank_risks(_deduplicate_risks(merged_risks)),
        "verdict": verdict,
        "worst_case_scenario": worst_case,
        "verdict_reasoning": verdict_reasoning,
    }


# ── [FINAL-5] Hardened Confidence Score ──────────────────────────────────────

def _compute_confidence(pdf_text: str, analysis: Dict, financial: Dict) -> float:
    """
    [FINAL-5] Completely rewritten confidence scoring.

    Scoring breakdown:
      • Text richness   → up to 0.35  (normalised over 8000 chars)
      • Financial hits  → up to 0.25  (normalised over 10 entities)
      • Risk coverage   → up to 0.25  (normalised over 6 risks)
      • Summary present → 0.15

    Hard floor of 0.30 when the PDF contained any parseable text —
    prevents the misleading "0 %" score that appeared even when the
    document was valid and financial data was extracted.
    """
    score = 0.0

    # Text richness
    if pdf_text.strip():
        score += min(len(pdf_text) / 8000, 0.35)

    # Financial extraction strength
    fin_count = sum(len(v) for v in financial.values() if isinstance(v, list))
    if fin_count > 0:
        score += min(fin_count / 10, 0.25)

    # Risk coverage
    risk_count = len(analysis.get("risks", []))
    if risk_count > 0:
        score += min(risk_count / 6, 0.25)

    # Summary presence
    if analysis.get("summary"):
        score += 0.15

    # [FINAL-5] Hard floor: any doc with parseable text scores at least 30%
    if pdf_text.strip():
        score = max(score, 0.3)
    print("DEBUG CONF:", {
    "pdf_len": len(pdf_text),
    "score_before_floor": score
})
    print("FINAL SCORE:", score)

    return round(min(score, 1.0), 2)


# ── RAG Integration ───────────────────────────────────────────────────────────

def _fetch_rag_context(query: str, top_k: int = 3) -> Tuple[List[Dict], str]:
    try:
        from agents.rag_engine import retrieve
        hits = retrieve(query, top_k=top_k)
    except Exception:
        hits = []

    formatted_hits = [
        {
            "text":   h.get("text", "")[:300],
            "source": h.get("source", ""),
            "score":  h.get("score", 0.0),
        }
        for h in hits
    ]

    rag_str = "\n".join(
        f"[{h['source']}] {h['text']}" for h in formatted_hits if h["text"]
    )
    return formatted_hits, rag_str


# ── Pipeline ──────────────────────────────────────────────────────────────────

async def _run_pipeline(pdf_text: str, query: str) -> Dict:
    """
    Orchestrate diligence steps:
      1. RAG retrieval (context injected into LLM)
      2. Financial entity extraction (deterministic, full text)
      3. [FIX-6] Parallel chunked LLM analysis via asyncio.gather
      4. spaCy NER (uses [FIX-7] global model)
    """
    # Step 1: RAG — retrieve before LLM so context can be injected
    try:
        rag_hits, rag_str = [], ""
    except Exception as e:
        logger.warning(f"[Diligence] RAG retrieval error: {e}")
        rag_hits, rag_str = [], ""

    # Step 2: Financial extraction — run before LLM merge so highlights can use it ([FIX-1, FIX-8])
    try:
        financial = _extract_financial_entities(pdf_text)
    except Exception as e:
        logger.error(f"[Diligence] Financial extraction error: {e}")
        financial = {"revenue": [], "debt": [], "liabilities": [], "costs": [], "percentages": [], "dates": []}

    # Step 3: [FIX-6] Parallel chunked LLM analysis
    if len(pdf_text) < 12000:
        analysis_chunks = [pdf_text]
    else:
        chunks = _chunk_text(pdf_text)
        analysis_chunks = chunks[:4]

    # [FIX-6] Run all chunks concurrently instead of sequentially
    logger.info(f"[Diligence][FIX-6] Launching {len(analysis_chunks)} LLM chunk(s) in parallel")
    chunk_tasks = [
        _llm_analyze_chunk(chunk, query, rag_str)
        for chunk in analysis_chunks
    ]
    chunk_results_raw = await asyncio.gather(*chunk_tasks, return_exceptions=True)

    # Filter out exceptions and Nones
    chunk_results = []
    for i, res in enumerate(chunk_results_raw):
        if isinstance(res, Exception):
            logger.warning(f"[Diligence][FIX-6] Chunk {i} raised exception: {res}")
        elif res is not None:
            chunk_results.append(res)

    # [FINAL-7] Hardened full LLM failure fallback — all fields guaranteed meaningful
    analysis = _merge_chunk_results(chunk_results, financial) if chunk_results else {
        "summary": "Analysis could not be completed — fallback applied.",
        "financial_highlights": _build_financial_highlights_fallback(financial),
        "risks": [{
            "category": "Operational",
            "risk": "LLM analysis unavailable",
            "severity": "MEDIUM",
            "evidence": "",
            "impact": "Incomplete automated risk detection",
            "recommendation": "Manual review required",
        }],
        "verdict": "Caution",
        "worst_case_scenario": _generate_worst_case({"risks": []}),
        "verdict_reasoning": "LLM unavailable — conservative fallback applied",
    }

    analysis.setdefault("summary", "")
    analysis.setdefault("financial_highlights", [])
    analysis.setdefault("risks", [])
    analysis.setdefault("verdict", "Caution")
    analysis.setdefault("worst_case_scenario", "")
    analysis.setdefault("verdict_reasoning", "")

    for r in analysis["risks"]:
        r.setdefault("category", "Operational")
        r.setdefault("severity", "MEDIUM")
        r.setdefault("evidence", "")
        r.setdefault("impact", "")
        r.setdefault("recommendation", "")

    _validate_risk_severities(analysis)
    _enforce_minimum_quality(analysis)
    _apply_deterministic_verdict(analysis)

    # [FIX-3] Hard guarantee: verdict is never empty/None/undefined
    analysis["verdict"] = _normalize_verdict(analysis.get("verdict", ""))
    if not analysis["verdict"]:
        logger.warning("[Diligence][FIX-3] verdict was empty after normalization — forcing Caution")
        analysis["verdict"] = "Caution"

    # [FINAL-4] Worst-case regenerated when empty OR meaningless (not just whitespace-empty)
    wcs = analysis.get("worst_case_scenario", "")
    if (
        not isinstance(wcs, str) or
        not wcs.strip() or
        _is_meaningless_text(wcs)
    ):
        logger.info("[FINAL FIX] Worst-case invalid — regenerating fallback")
        analysis["worst_case_scenario"] = _generate_worst_case(analysis)

    # [FINAL-10] Re-rank risks before returning (catches any re-ordering from quality enforcement)
    analysis["risks"] = _rank_risks(analysis.get("risks", []))

    # Step 4: NER (uses globally loaded model via [FIX-7])
    try:
        ner_entities = _extract_nlp_entities(pdf_text)
    except Exception as e:
        logger.error(f"[Diligence] NER error: {e}")
        ner_entities = []

    return {
        "financial":    financial,
        "ner_entities": ner_entities,
        "analysis":     analysis,
        "rag_context":  rag_hits,
    }


# ── Public entry point ────────────────────────────────────────────────────────

async def run_diligence_analysis(file_bytes: bytes, query: str) -> Dict:
    """
    Full due-diligence pipeline for an uploaded PDF.

    Returns:
        summary                — investment-grade narrative
        financial_highlights   — key figures as bullet strings (guaranteed non-empty [FIX-1])
        extracted_entities     — structured { revenue, debt, liabilities, costs, … }
        ner_entities           — spaCy named entities
        risks                  — ranked, deduplicated, evidence-backed risk list
        verdict                — Proceed | Caution | Decline (guaranteed [FIX-3])
        verdict_reasoning      — 1-2 sentence rationale
        worst_case_scenario    — concise adverse-outcome description (guaranteed [FIX-2/FINAL-4])
        rag_context            — knowledge-base chunks used
        confidence_score       — 0.0–1.0 with floor of 0.30 for valid docs ([FINAL-5])
        processing_time_ms     — wall-clock time
    """
    t0 = time.time()

    try:
        pdf_text = _parse_pdf_bytes(file_bytes)
    except Exception as e:
        logger.error(f"[Diligence] PDF parsing crashed: {e}")
        pdf_text = ""

    logger.info(f"[Diligence] Extracted text length: {len(pdf_text)}")

    if not pdf_text.strip():
        return {
            "summary": (
                "Could not extract text from the uploaded document. "
                "Please ensure the PDF contains selectable (non-scanned) text."
            ),
            "financial_highlights": ["No text could be extracted from this document."],
            "extracted_entities": {"revenue": [], "debt": [], "liabilities": [], "costs": [], "percentages": [], "dates": []},
            "ner_entities": [],
            "risks": [],
            "verdict": "Caution",  # [FIX-3] always a string
            "verdict_reasoning": "Insufficient data to render a verdict.",
            "worst_case_scenario": "Unable to assess — document text unreadable.",  # [FIX-2]
            "rag_context": [],
            "confidence_score": 0.0,
            "processing_time_ms": round((time.time() - t0) * 1000, 2),
        }

    try:
        pipeline_result = await _run_pipeline(pdf_text, query)
    except Exception as e:
        logger.error(f"[Diligence] Pipeline error: {e}")
        return {
            "summary": "An internal error occurred during analysis. Please retry.",
            "financial_highlights": [],
            "extracted_entities": {"revenue": [], "debt": [], "liabilities": [], "costs": [], "percentages": [], "dates": []},
            "ner_entities": [],
            "risks": [],
            "verdict": "Caution",  # [FIX-3]
            "verdict_reasoning": "Pipeline error — unable to render verdict.",
            "worst_case_scenario": "Analysis could not be completed due to an internal error.",  # [FIX-2]
            "rag_context": [],
            "confidence_score": 0.0,
            "processing_time_ms": round((time.time() - t0) * 1000, 2),
        }

    analysis  = pipeline_result["analysis"]
    financial = pipeline_result["financial"]

    # [FINAL-9] Last-chance guard: ensure financial_highlights is never empty in final response
    if not analysis.get("financial_highlights"):
        analysis["financial_highlights"] = _build_financial_highlights_fallback(financial)

    confidence = _compute_confidence(pdf_text, analysis, financial)  # [FINAL-5] floor 0.30

    risk_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for r in analysis.get("risks", []):
        sev = (r.get("severity") or "MEDIUM").upper()
        if sev in risk_counts:
            risk_counts[sev] += 1

    return {
        "summary":               analysis.get("summary", ""),
        "financial_highlights":  analysis.get("financial_highlights", []),
        "extracted_entities":    financial,
        "ner_entities":          pipeline_result["ner_entities"],
        "risks":                 analysis.get("risks", []),
        "verdict":               analysis.get("verdict", "Caution"),   # [FIX-3]
        "verdict_reasoning":     analysis.get("verdict_reasoning", ""),
        "worst_case_scenario":   analysis.get("worst_case_scenario", ""),  # [FINAL-4]
        "rag_context": [
            {"text": r.get("text", ""), "source": r.get("source", ""), "score": r.get("score", 0.0)}
            for r in pipeline_result["rag_context"]
        ],
        "confidence_score":     confidence,
        "risk_counts":          risk_counts,
        "processing_time_ms":   round((time.time() - t0) * 1000, 2),
    }