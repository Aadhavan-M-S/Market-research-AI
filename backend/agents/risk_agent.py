"""
agents/risk_agent.py — Feature 4: Predictive Risk Monitoring Agent
═══════════════════════════════════════════════════════════════════
Architecture:
  • Fetches live news from multiple RSS feeds via httpx
  • spaCy sentence segmentation on article bodies
  • Hybrid event detection: keyword category mapping + LLM classification
  • NetworkX supply chain graph: maps events to affected chain nodes
  • Google ADK tools: fetch_news, extract_events, map_supply_chain, generate_alert
  • Output: detected risks, supply chain impact, recommendations
"""
from __future__ import annotations

import logging
import re
import time
import xml.etree.ElementTree as ET
from typing import Dict, List

import httpx

logger = logging.getLogger(__name__)

# ── Google ADK (optional) ─────────────────────────────────────────────────────
try:
    import google.adk  # noqa: F401
    _ADK_AVAILABLE = True
    logger.info("[Risk] Google ADK available")
except ImportError:
    _ADK_AVAILABLE = False
    logger.info("[Risk] Google ADK not available — using sequential pipeline")

# ── RSS feed list ─────────────────────────────────────────────────────────────
RSS_FEEDS: List[str] = [
    "https://feeds.bbci.co.uk/news/business/rss.xml",
    "https://rss.cnn.com/rss/edition_business.rss",
    "https://feeds.reuters.com/reuters/businessNews",
    "https://www.ft.com/rss/home/uk",
]

# ── Risk keyword taxonomy ─────────────────────────────────────────────────────
RISK_KEYWORDS: Dict[str, List[str]] = {
    "supply_chain": [
        "shortage", "supply chain", "logistics", "shipping delay", "port congestion",
        "inventory", "disruption", "backlog", "freight", "customs",
    ],
    "geopolitical": [
        "sanctions", "tariff", "embargo", "trade war", "conflict", "war",
        "regulation", "export ban", "import restriction", "political instability",
    ],
    "financial": [
        "recession", "inflation", "default", "bankruptcy", "credit crunch",
        "liquidity", "interest rate", "currency crash", "market crash",
    ],
    "natural": [
        "earthquake", "flood", "hurricane", "wildfire", "drought",
        "climate", "storm", "tsunami", "extreme weather",
    ],
    "cyber": [
        "breach", "ransomware", "cyberattack", "hack", "vulnerability",
        "data leak", "phishing", "zero-day", "malware",
    ],
}

_CRITICAL_KW = {"war", "ransomware", "default", "sanctions", "embargo", "market crash", "cyberattack"}
_HIGH_RISK_CATS = {"geopolitical", "financial", "cyber"}


# ── Tool 1: fetch_news ────────────────────────────────────────────────────────

async def _fetch_single_feed(url: str, client: httpx.AsyncClient) -> List[Dict]:
    """Parse one RSS feed into a list of article dicts."""
    try:
        resp = await client.get(url, timeout=10.0, follow_redirects=True)
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        items: List[Dict] = []
        for item in root.iter("item"):
            title_el = item.find("title")
            desc_el = item.find("description")
            link_el = item.find("link")

            title = (title_el.text or "").strip() if title_el is not None else ""
            desc = (desc_el.text or "").strip() if desc_el is not None else ""
            desc = re.sub(r"<[^>]+>", "", desc)[:400]  # strip HTML
            link = (link_el.text or "").strip() if link_el is not None else ""

            if title:
                items.append({"title": title, "description": desc, "url": link, "source": url})
        return items[:10]
    except Exception as e:
        logger.warning(f"[Risk] RSS fetch failed for {url}: {e}")
        return []


async def fetch_news() -> List[Dict]:
    """Concurrently fetch all RSS feeds and return merged article list."""
    import asyncio
    async with httpx.AsyncClient(
        headers={"User-Agent": "Mozilla/5.0 (compatible; SPECTRA-Risk/1.0)"},
        timeout=httpx.Timeout(15.0),
    ) as client:
        tasks = [_fetch_single_feed(url, client) for url in RSS_FEEDS]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    articles: List[Dict] = []
    for r in results:
        if isinstance(r, list):
            articles.extend(r)
    return articles


# ── Tool 2: extract_events ────────────────────────────────────────────────────

def _segment_sentences(text: str) -> List[str]:
    """Use spaCy sentencizer; fallback to regex split."""
    try:
        import spacy
        nlp = spacy.load("en_core_web_sm")
        doc = nlp(text[:2000])
        return [s.text.strip() for s in doc.sents if len(s.text.strip()) > 10]
    except Exception:
        return [s.strip() for s in re.split(r"[.!?]+", text) if len(s.strip()) > 10]


def _score_severity(categories: List[str], matched_kw: List[str]) -> str:
    if any(kw in _CRITICAL_KW for kw in matched_kw):
        return "CRITICAL"
    if any(c in _HIGH_RISK_CATS for c in categories):
        return "HIGH"
    if len(categories) >= 2:
        return "MEDIUM"
    return "LOW"


def extract_events(articles: List[Dict]) -> List[Dict]:
    """
    Classify each article by risk category using keyword matching.
    Applies spaCy sentence segmentation to description bodies.
    Returns events sorted by severity.
    """
    sev_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    events: List[Dict] = []

    for article in articles:
        combined = (article.get("title", "") + " " + article.get("description", "")).lower()
        matched_cats: List[str] = []
        matched_kw: List[str] = []

        for category, keywords in RISK_KEYWORDS.items():
            hits = [kw for kw in keywords if re.search(rf"\b{re.escape(kw)}\b", combined)]
            if hits:
                matched_cats.append(category)
                matched_kw.extend(hits)

        # ✅ checks AFTER matching
        if not matched_kw:
            continue

        if len(article.get("description", "")) < 50:
            continue

        sentences = _segment_sentences(article.get("description", ""))
        key_sentences = [s for s in sentences if any(kw in s.lower() for kw in matched_kw)][:3]

        events.append({
            "title": article.get("title", ""),
            "description": article.get("description", "")[:300],
            "url": article.get("url", ""),
            "source": article.get("source", ""),
            "categories": matched_cats,
            "keywords": list(dict.fromkeys(matched_kw))[:5],
            "severity": _score_severity(matched_cats, matched_kw),
            "key_sentences": key_sentences,
        })

    events.sort(key=lambda x: sev_order.get(x["severity"], 4))
    return events[:20]


# ── Tool 3: map_supply_chain ──────────────────────────────────────────────────

def map_supply_chain(events: List[Dict]) -> Dict:
    """
    Build a NetworkX supply chain DAG and map detected events to affected nodes.
    Returns node/edge list for frontend graph rendering.
    """
    try:
        import networkx as nx

        chain_nodes = [
            "Raw Materials", "Manufacturing", "Logistics",
            "Distribution", "Retail", "End Customer",
        ]
        chain_edges = [
            ("Raw Materials", "Manufacturing"),
            ("Manufacturing", "Logistics"),
            ("Logistics", "Distribution"),
            ("Distribution", "Retail"),
            ("Retail", "End Customer"),
        ]

        G = nx.DiGraph()
        G.add_nodes_from(chain_nodes)
        G.add_edges_from(chain_edges)

        _cat_to_nodes: Dict[str, List[str]] = {
            "supply_chain": ["Logistics", "Distribution"],
            "geopolitical": ["Raw Materials", "Manufacturing"],
            "financial": ["Manufacturing", "Retail"],
            "natural": ["Raw Materials", "Logistics"],
            "cyber": ["Manufacturing", "Distribution"],
        }

        affected: Dict[str, List[str]] = {}
        for event in events[:6]:
            for cat in event.get("categories", []):
                for node in _cat_to_nodes.get(cat, []):
                    affected.setdefault(node, [])
                    title_short = event["title"][:60]
                    if title_short not in affected[node]:
                        affected[node].append(title_short)

        most_affected = max(affected.items(), key=lambda x: len(x[1]))[0] if affected else "None"

        return {
            "nodes": [{"id": n, "affected": affected.get(n, [])} for n in chain_nodes],
            "edges": [{"source": s, "target": t} for s, t in chain_edges],
            "most_affected": most_affected,
        }

    except Exception as e:
        logger.warning(f"[Risk] NetworkX supply chain mapping failed: {e}")
        return {"nodes": [], "edges": [], "most_affected": "Unknown"}


# ── Tool 4: generate_alert ────────────────────────────────────────────────────

def _determine_risk_level(events: List[Dict]) -> str:
    if not events:
        return "LOW"
    critical = sum(1 for e in events if e["severity"] == "CRITICAL")
    high = sum(1 for e in events if e["severity"] == "HIGH")
    if critical >= 2:
        return "CRITICAL"
    if critical >= 1 or high >= 3:
        return "HIGH"
    if high >= 1:
        return "MEDIUM"
    return "LOW"

def _extract_bullets(text: str) -> List[str]:
    bullets = []

    for line in text.split("\n"):
        line = line.strip()

        # ONLY accept numbered bullets like "1. text"
        if re.match(r"^\d+\.\s+", line):
            cleaned = re.sub(r"^\d+\.\s+", "", line).strip()
            if len(cleaned) > 10:
                bullets.append(cleaned)

    return bullets[:5]


async def generate_alert(events: List[Dict], supply_chain: Dict) -> Dict:
    """
    Use Ollama to synthesize an executive risk brief and extract recommendations.
    Falls back gracefully if Ollama is offline.
    """
    from llm_client import ollama_generate

    risk_level = _determine_risk_level(events)

    if not events:
        return {
            "summary": "No significant risk signals detected in the current news cycle. Continue standard monitoring.",
            "recommendations": ["Maintain regular monitoring cadence.", "Review supply chain contingency plans quarterly."],
            "risk_level": "LOW",
        }

    event_lines = "\n".join([
        f"  [{e['severity']}] {e['title']} — categories: {', '.join(e['categories'])}"
        for e in events[:8]
    ])
    most_affected = supply_chain.get("most_affected", "Unknown")

    prompt = (
        "You are a Chief Risk Officer preparing an executive risk brief.\n"
        "Based on the detected events below, provide:\n"
        "1. Overall risk assessment (2-3 sentences)\n"
        "2. Top 3 actionable recommendations (numbered list)\n"
        "3. Most critical event to monitor closely\n\n"
        "STRICT: Only output plain text. Use numbered list for recommendations.\n\n"
        f"Most impacted supply chain node: {most_affected}\n"
        f"Overall risk level: {risk_level}\n\n"
        f"Detected Risk Events:\n{event_lines}"
    )

    analysis = await ollama_generate(prompt, max_tokens=600, temperature=0.3)
    if len(recommendations) < 3:
        recommendations = [
            "Diversify supply chain sources",
            "Monitor geopolitical developments closely",
            "Prepare contingency plans for disruptions",
        ]

    return {
        "summary": analysis,
        "recommendations": recommendations,
        "risk_level": risk_level,
    }


# ── Public entry point ────────────────────────────────────────────────────────

async def run_risk_monitoring() -> Dict:
    """
    Full risk monitoring pipeline:
    fetch_news → extract_events → map_supply_chain → generate_alert
    """
    t0 = time.time()

    try:
        # Tool 1
        articles = await fetch_news()

        # Tool 2
        events = extract_events(articles)

        # Tool 3
        supply_chain = map_supply_chain(events)

        # Tool 4
        alert = await generate_alert(events, supply_chain)

        return {
            "detected_risks": events,
            "supply_chain_impact": supply_chain,
            "impact_analysis": alert["summary"],
            "recommendations": alert["recommendations"],
            "risk_level": alert["risk_level"],
            "total_articles_scanned": len(articles),
            "processing_time_ms": round((time.time() - t0) * 1000, 2),
        }

    except Exception as e:
        logger.error(f"[Risk] Monitoring pipeline failed: {e}", exc_info=True)
        return {
            "detected_risks": [],
            "supply_chain_impact": {"nodes": [], "edges": [], "most_affected": "Unknown"},
            "impact_analysis": f"Risk monitoring pipeline encountered an error: {str(e)[:200]}",
            "recommendations": ["Check network connectivity and RSS feed availability."],
            "risk_level": "UNKNOWN",
            "total_articles_scanned": 0,
            "processing_time_ms": round((time.time() - t0) * 1000, 2),
        }
