"""
agents/report_generator.py — Feature 3: Automated Consulting Report Generator (UPGRADED)
══════════════════════════════════════════════════════════════════════════════════════════
Architecture:
  • Accepts structured input: title, bullets, metrics, sections
  • NEW: Bulk text parser (key:value, bullets, CSV rows)
  • Converts to structured prompt context
  • Google ADK tools: structure_content, generate_summary, suggest_visuals
  • Ollama LLM generates McKinsey-grade consulting report text
  • NEW: Structured chart data generation
  • Output: full report text + chart data + visual suggestions
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Google ADK (optional) ─────────────────────────────────────────────────────
try:
    import google.adk  # noqa: F401
    _ADK_AVAILABLE = True
    logger.info("[Report] Google ADK available")
except ImportError:
    _ADK_AVAILABLE = False
    logger.info("[Report] Google ADK not available — using function pipeline")


# ── NEW: Bulk input parser ────────────────────────────────────────────────────

def parse_bulk_input(raw: str) -> Dict:
    """
    Parse free-form bulk text input into structured data.

    Supports:
      • key:value or key=value pairs   → metrics dict
      • bullet lines (-, *, •)         → bullet_points list
      • CSV rows (Metric,Value)        → metrics dict
      • Insight | Impact | Priority    → structured bullet with meta
      • Plain paragraphs               → executive_summary

    Returns partial dict ready to be merged into main payload.
    """
    if not raw or not raw.strip():
        return {}

    lines = [l.strip() for l in raw.strip().splitlines() if l.strip()]
    metrics: Dict[str, str] = {}
    bullets: List[str] = []
    paragraphs: List[str] = []

    kv_pattern = re.compile(r'^(.+?)\s*[:=]\s*(.+)$')
    bullet_pattern = re.compile(r'^[-*•]\s+(.+)$')
    pipe_pattern = re.compile(r'^(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$')
    csv_header_seen = False

    for line in lines:
        # CSV header detection
        low = line.lower()
        if low in ('metric,value', 'metric, value', 'name,value'):
            csv_header_seen = True
            continue

        # CSV data rows (after header or comma-separated with 2 cols)
        if csv_header_seen:
            parts = [p.strip() for p in line.split(',', 1)]
            if len(parts) == 2 and parts[0] and parts[1]:
                metrics[parts[0]] = parts[1]
            continue

        # Pipe-separated insight rows: Insight | Impact | Priority
        m = pipe_pattern.match(line)
        if m:
            insight, impact, priority = m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
            bullets.append(f"{insight} — {impact} [{priority.upper()}]")
            continue

        # Bullet lines
        m = bullet_pattern.match(line)
        if m:
            bullets.append(m.group(1).strip())
            continue

        # key:value or key=value → metric
        m = kv_pattern.match(line)
        if m:
            k, v = m.group(1).strip(), m.group(2).strip()
            # Avoid treating long sentences as metrics
            if len(k) <= 60 and len(k.split()) <= 6:
                metrics[k] = v
                continue

        # Fallback: treat as paragraph content
        paragraphs.append(line)

    result: Dict[str, Any] = {}
    if metrics:
        result["metrics"] = metrics
    if bullets:
        result["bullet_points"] = bullets
    if paragraphs:
        result["executive_summary"] = " ".join(paragraphs)

    return result


# ── Tool: structure_content ───────────────────────────────────────────────────

def structure_content(data: Dict) -> str:
    """
    Convert the raw input dict into a structured prompt context string.
    Handles: title, executive_summary, bullet_points, metrics, sections.
    """
    lines: List[str] = []

    title = data.get("title") or "Strategic Analysis Report"
    lines.append(f"REPORT TITLE: {title}")
    lines.append("")

    exec_summary = data.get("executive_summary", "").strip()
    if exec_summary:
        lines.append("EXECUTIVE CONTEXT:")
        lines.append(exec_summary)
        lines.append("")

    bullets = data.get("bullet_points", [])
    if bullets:
        lines.append("KEY POINTS:")
        for bp in bullets:
            if bp.strip():
                lines.append(f"  • {bp.strip()}")
        lines.append("")

    metrics = data.get("metrics", {})
    if metrics:
        lines.append("METRICS & KPIs:")
        for k, v in metrics.items():
            lines.append(f"  • {k}: {v}")
        lines.append("")

    sections = data.get("sections", [])
    for sec in sections:
        heading = sec.get("heading", "Section").strip()
        content = sec.get("content", "").strip()
        if heading and content:
            lines.append(f"{heading.upper()}:")
            lines.append(content)
            lines.append("")

    return "\n".join(lines).strip()


# ── NEW: Tool: generate_charts ────────────────────────────────────────────────

def generate_charts(data: Dict) -> List[Dict]:
    """
    Produce chart data structures from metrics, trends, and comparisons.
    Returns a list of chart objects ready for frontend rendering.
    """
    charts: List[Dict] = []
    metrics = data.get("metrics", {})

    if not metrics:
        return charts

    # ── Bar chart: all numeric KPIs ──
    numeric_items = []
    for k, v in metrics.items():
        # Strip currency, %, B, M, K symbols and try to parse
        clean = re.sub(r'[^\d.\-]', '', str(v).replace(',', ''))
        try:
            numeric_items.append({"label": k, "value": float(clean), "raw": v})
        except ValueError:
            pass

    if len(numeric_items) >= 2:
        charts.append({
            "type": "bar",
            "title": "KPI Overview",
            "data": [{"label": item["label"], "value": item["value"]} for item in numeric_items],
        })

    # ── Pie chart: if values look like percentages or shares ──
    pct_items = []
    for k, v in metrics.items():
        clean = re.sub(r'[^\d.]', '', str(v))
        try:
            fval = float(clean)
            if 0 < fval <= 100 and ('%' in str(v) or 'share' in k.lower() or 'mix' in k.lower()):
                pct_items.append({"label": k, "value": fval})
        except ValueError:
            pass

    if len(pct_items) >= 2:
        charts.append({
            "type": "pie",
            "title": "Distribution / Share Breakdown",
            "data": pct_items,
        })

    # ── Trend line: if keys look time-series-like ──
    # Detect patterns like "2020: X, 2021: Y" or "Q1: X, Q2: Y"
    trend_pattern = re.compile(r'^(20\d{2}|q[1-4]|fy\d{2,4}|h[12])', re.IGNORECASE)
    trend_items = []
    for k, v in metrics.items():
        if trend_pattern.match(k.strip()):
            clean = re.sub(r'[^\d.\-]', '', str(v).replace(',', ''))
            try:
                trend_items.append({"label": k, "value": float(clean)})
            except ValueError:
                pass

    if len(trend_items) >= 3:
        charts.append({
            "type": "line",
            "title": "Trend Analysis",
            "data": trend_items,
        })

    return charts


# ── Tool: generate_summary ────────────────────────────────────────────────────

async def generate_summary(structured: str) -> str:
    """
    Pass structured content to Ollama and produce a professional consulting report.
    Prompt engineering targets McKinsey/BCG-style executive deliverables.
    """
    from llm_client import ollama_generate

    prompt = (
        "You are a Principal Consultant at a top-tier management consulting firm (McKinsey, BCG, Bain).\n"
        "Transform the structured input below into a polished, professional consulting report.\n\n"
        "MANDATORY report structure — include ALL sections with bold headers:\n"
        "**Executive Summary** — 3-4 crisp sentences framing the situation and key conclusion\n"
        "**Key Findings** — 5-7 evidence-based bullet points drawn directly from the data\n"
        "**Strategic Analysis** — 2-3 paragraphs with industry context, competitive dynamics, and strategic implications\n"
        "**Risks** — 3 prioritized risks (label each HIGH / MEDIUM / LOW)\n"
        "**Opportunities** — 3 prioritized opportunities (label each HIGH / MEDIUM / LOW)\n"
        "**Investment Verdict** — One decisive paragraph: Buy / Hold / Pass with rationale\n"
        "**Recommendations** — 3-5 numbered, time-bound, actionable recommendations\n"
        "**Next Steps** — 3 concrete immediate actions with owners and timelines\n\n"
        "Style guidelines:\n"
        "- Use precise, action-oriented language\n"
        "- Back every claim with specific data from the input\n"
        "- No filler, no generic statements, no buzzwords\n"
        "- Structure output for executive readability and slide conversion\n"
        "- Each section should stand alone as a slide-ready block\n"
        "- Numbers and percentages where relevant\n\n"
        f"INPUT DATA:\n{structured}\n\n"
        "Generate the full report:"
    )

    return await ollama_generate(prompt, max_tokens=1800, temperature=0.3)


# ── Tool: suggest_visuals ─────────────────────────────────────────────────────

def suggest_visuals(data: Dict) -> List[str]:
    """
    Recommend chart/visualization types based on the input data structure.
    """
    suggestions: List[str] = []

    metrics = data.get("metrics", {})
    if len(metrics) >= 2:
        suggestions.append("Bar chart — KPI performance vs. benchmark targets")
        suggestions.append("Gauge / scorecard — headline metric at a glance")

    bullets = data.get("bullet_points", [])
    if len(bullets) >= 4:
        suggestions.append("Numbered priority matrix — top findings ranked by impact")

    sections = data.get("sections", [])
    if len(sections) >= 2:
        suggestions.append("Executive slide — 3-column layout with section summaries")
        suggestions.append("Risk matrix — probability × impact 2×2 grid")

    if len(metrics) >= 4:
        suggestions.append("Radar / spider chart — multi-dimensional KPI comparison")

    if not suggestions:
        suggestions.append("Summary table — key data points in structured rows")
        suggestions.append("One-page narrative layout with section dividers")

    return suggestions


# ── Pipeline orchestration ────────────────────────────────────────────────────

async def run_report_generation(data: Dict) -> Dict:
    """
    Orchestrate the tools: parse_bulk → structure → generate → charts → suggest_visuals.
    Returns report_text, charts, structured_input, and suggested_visuals.
    """
    t0 = time.time()

    try:
        # Optional: merge bulk input if provided
        bulk_raw = data.get("bulk_input", "")
        if bulk_raw and bulk_raw.strip():
            parsed_bulk = parse_bulk_input(bulk_raw)
            # Merge: bulk fills in fields not already set
            if "metrics" in parsed_bulk:
                existing = data.get("metrics", {})
                data["metrics"] = {**parsed_bulk["metrics"], **existing}
            if "bullet_points" in parsed_bulk:
                existing = data.get("bullet_points", [])
                data["bullet_points"] = parsed_bulk["bullet_points"] + existing
            if "executive_summary" in parsed_bulk and not data.get("executive_summary", "").strip():
                data["executive_summary"] = parsed_bulk["executive_summary"]

        # Tool 1: structure_content
        structured = structure_content(data)
        if not structured.strip():
            structured = "No input data provided."

        # Tool 2: generate_summary
        report_text = await generate_summary(structured)

        # Tool 3: generate_charts
        charts = generate_charts(data)

        # Tool 4: suggest_visuals
        visuals = suggest_visuals(data)

        return {
            "report_text": report_text,
            "charts": charts,
            "structured_input": structured,
            "suggested_visuals": visuals,
            "processing_time_ms": round((time.time() - t0) * 1000, 2),
        }

    except Exception as e:
        logger.error(f"[Report] Generation failed: {e}", exc_info=True)
        return {
            "report_text": f"[Report generation failed: {str(e)[:200]}]",
            "metrics": data.get("metrics", {}), 
            "charts": [],
            "structured_input": "",
            "suggested_visuals": [],
            "processing_time_ms": round((time.time() - t0) * 1000, 2),
        }