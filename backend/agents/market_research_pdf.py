"""
PDF Report Generator for Spectra Platform
Appended to agents/market_research.py — drop this block at the end of the file.

Requires: reportlab
  pip install reportlab
"""

import os
from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ── Colour palette ──────────────────────────────────────────────────────────
NAVY      = colors.HexColor("#0a1128")
ACCENT    = colors.HexColor("#4f8ef7")
TEAL      = colors.HexColor("#1fe4c8")
WARM      = colors.HexColor("#f0894a")
PURPLE    = colors.HexColor("#9b76ef")
LIGHT_BG  = colors.HexColor("#f4f6fb")
MID_GRAY  = colors.HexColor("#8a96b0")
DARK_TEXT = colors.HexColor("#1a1f36")
WHITE     = colors.white

PAGE_W, PAGE_H = A4
MARGIN = 22 * mm


# ── Style factory ────────────────────────────────────────────────────────────
def _make_styles():
    base = getSampleStyleSheet()

    cover_title = ParagraphStyle(
        "CoverTitle",
        parent=base["Title"],
        fontSize=28,
        leading=34,
        textColor=WHITE,
        alignment=TA_CENTER,
        spaceAfter=8,
        fontName="Helvetica-Bold",
    )
    cover_sub = ParagraphStyle(
        "CoverSub",
        parent=base["Normal"],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#b0bdd6"),
        alignment=TA_CENTER,
        spaceAfter=4,
        fontName="Helvetica",
    )
    cover_meta = ParagraphStyle(
        "CoverMeta",
        parent=base["Normal"],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#6a7a99"),
        alignment=TA_CENTER,
        fontName="Helvetica",
    )
    section_h = ParagraphStyle(
        "SectionHeading",
        parent=base["Heading1"],
        fontSize=13,
        leading=17,
        textColor=ACCENT,
        fontName="Helvetica-Bold",
        spaceBefore=14,
        spaceAfter=6,
    )
    sub_h = ParagraphStyle(
        "SubHeading",
        parent=base["Heading2"],
        fontSize=10,
        leading=14,
        textColor=TEAL,
        fontName="Helvetica-Bold",
        spaceBefore=8,
        spaceAfter=4,
    )
    body = ParagraphStyle(
        "Body",
        parent=base["Normal"],
        fontSize=9.5,
        leading=15,
        textColor=DARK_TEXT,
        fontName="Helvetica",
        spaceAfter=4,
    )
    bullet = ParagraphStyle(
        "Bullet",
        parent=body,
        leftIndent=14,
        bulletIndent=0,
        spaceAfter=3,
    )
    caption = ParagraphStyle(
        "Caption",
        parent=base["Normal"],
        fontSize=8,
        leading=11,
        textColor=MID_GRAY,
        fontName="Helvetica-Oblique",
        spaceAfter=2,
    )
    footer = ParagraphStyle(
        "Footer",
        parent=base["Normal"],
        fontSize=7.5,
        textColor=MID_GRAY,
        alignment=TA_CENTER,
        fontName="Helvetica",
    )

    return {
        "cover_title": cover_title,
        "cover_sub":   cover_sub,
        "cover_meta":  cover_meta,
        "section_h":   section_h,
        "sub_h":       sub_h,
        "body":        body,
        "bullet":      bullet,
        "caption":     caption,
        "footer":      footer,
    }


# ── Cover page (drawn via onFirstPage callback) ───────────────────────────────
def _cover_canvas(canvas_obj, doc):
    """Full-bleed navy cover with teal accent bar."""
    canvas_obj.saveState()

    # Background
    canvas_obj.setFillColor(NAVY)
    canvas_obj.rect(0, 0, PAGE_W, PAGE_H, fill=True, stroke=False)

    # Teal accent strip (top)
    canvas_obj.setFillColor(TEAL)
    canvas_obj.rect(0, PAGE_H - 6, PAGE_W, 6, fill=True, stroke=False)

    # Accent strip (bottom)
    canvas_obj.setFillColor(ACCENT)
    canvas_obj.rect(0, 0, PAGE_W, 4, fill=True, stroke=False)

    # Decorative diagonal band
    canvas_obj.setFillColor(colors.HexColor("#0d1635"))
    p = canvas_obj.beginPath()
    p.moveTo(0, PAGE_H * 0.45)
    p.lineTo(PAGE_W * 0.55, PAGE_H * 0.45)
    p.lineTo(PAGE_W * 0.65, PAGE_H * 0.30)
    p.lineTo(0, PAGE_H * 0.30)
    p.close()
    canvas_obj.drawPath(p, fill=True, stroke=False)

    canvas_obj.restoreState()


def _inner_canvas(canvas_obj, doc):
    """Inner pages: light left sidebar + subtle footer."""
    canvas_obj.saveState()

    # Left accent bar
    canvas_obj.setFillColor(ACCENT)
    canvas_obj.rect(0, 0, 4, PAGE_H, fill=True, stroke=False)

    # Footer rule + text
    y_foot = MARGIN - 8 * mm
    canvas_obj.setStrokeColor(colors.HexColor("#dce3f0"))
    canvas_obj.setLineWidth(0.5)
    canvas_obj.line(MARGIN, y_foot + 4 * mm, PAGE_W - MARGIN, y_foot + 4 * mm)
    canvas_obj.setFont("Helvetica", 7.5)
    canvas_obj.setFillColor(MID_GRAY)
    canvas_obj.drawCentredString(
        PAGE_W / 2,
        y_foot,
        f"Spectra  ·  Confidential  ·  Page {doc.page}",
    )

    canvas_obj.restoreState()


# ── Divider helper ────────────────────────────────────────────────────────────
def _hr(color=ACCENT, thickness=0.6):
    return HRFlowable(
        width="100%",
        thickness=thickness,
        color=color,
        spaceAfter=6,
        spaceBefore=2,
    )


# ── Table style helpers ───────────────────────────────────────────────────────
def _base_table_style(header_bg=ACCENT):
    return TableStyle([
        # Header row
        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
        ("TEXTCOLOR",  (0, 0), (-1, 0), WHITE),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
        ("TOPPADDING",    (0, 0), (-1, 0), 7),
        # Data rows
        ("FONTNAME",   (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",   (0, 1), (-1, -1), 8.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_BG]),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("TOPPADDING",    (0, 1), (-1, -1), 5),
        # Grid
        ("GRID",       (0, 0), (-1, -1), 0.4, colors.HexColor("#dce3f0")),
        ("LEFTPADDING",  (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
    ])


# ── Section builders ──────────────────────────────────────────────────────────

def _section_cover(story, data: dict, styles: dict):
    """Title page content (flows over the navy background)."""
    # Push content ~35% down the page
    story.append(Spacer(1, PAGE_H * 0.32))

    story.append(Paragraph("Spectra", styles["cover_sub"]))
    story.append(Spacer(1, 6))

    query_text = data.get("query", "Market Report")
    story.append(Paragraph(query_text, styles["cover_title"]))
    story.append(Spacer(1, 10))

    story.append(Paragraph(
        "Confidential Strategic Research Report",
        styles["cover_sub"],
    ))
    story.append(Spacer(1, 20))

    date_str = datetime.utcnow().strftime("%B %d, %Y")
    story.append(Paragraph(
        f"Generated {date_str}  ·  Powered by AI Intelligence Pipeline",
        styles["cover_meta"],
    ))

    story.append(PageBreak())


def _section_summary(story, data: dict, styles: dict):
    story.append(Paragraph("Executive Summary", styles["section_h"]))
    story.append(_hr())
    story.append(Paragraph(
        data.get("summary", "No summary available."),
        styles["body"],
    ))
    story.append(Spacer(1, 10))


def _section_insights(story, data: dict, styles: dict):
    insights = data.get("insights", [])
    if not insights:
        return
    story.append(Paragraph("Key Strategic Insights", styles["section_h"]))
    story.append(_hr(TEAL))
    for ins in insights:
        story.append(Paragraph(f"&#8226;&#160; {ins}", styles["bullet"]))
    story.append(Spacer(1, 10))


def _section_sentiment(story, data: dict, styles: dict):
    sent = data.get("sentiment")
    if not sent:
        return
    story.append(Paragraph("Sentiment Analysis", styles["section_h"]))
    story.append(_hr(WARM))

    score = data.get("sentiment_score", 0)
    overall = sent.get("overall", "NEUTRAL")
    story.append(Paragraph(
        f"Overall market sentiment is <b>{overall}</b> "
        f"(composite score: {score:+.3f}).",
        styles["body"],
    ))
    story.append(Spacer(1, 5))

    table_data = [
        ["Polarity", "Share of Discussions"],
        ["Positive", f"{sent.get('positive', 0):.1f}%"],
        ["Negative", f"{sent.get('negative', 0):.1f}%"],
        ["Neutral",  f"{sent.get('neutral', 0):.1f}%"],
    ]
    t = Table(table_data, colWidths=[90 * mm, 70 * mm])
    ts = _base_table_style(WARM)
    ts.add("ALIGNMENT", (1, 0), (1, -1), "CENTER")
    t.setStyle(ts)
    story.append(t)
    story.append(Spacer(1, 10))


def _section_entities(story, data: dict, styles: dict):
    entities = data.get("entities", [])
    if not entities:
        return
    story.append(Paragraph("Market Landscape — Entity Leaderboard", styles["section_h"]))
    story.append(_hr())
    story.append(Paragraph(
        "Ranked organisations and products by mention frequency across analysed sources.",
        styles["caption"],
    ))
    story.append(Spacer(1, 4))

    table_data = [["Rank", "Entity", "Mentions"]]
    for i, e in enumerate(entities[:15], 1):
        table_data.append([str(i), e.get("name", ""), str(e.get("count", 0))])

    col_w = [(PAGE_W - 2 * MARGIN) * r for r in (0.08, 0.72, 0.20)]
    t = Table(table_data, colWidths=col_w)
    ts = _base_table_style()
    ts.add("ALIGNMENT", (0, 0), (0, -1), "CENTER")
    ts.add("ALIGNMENT", (2, 0), (2, -1), "CENTER")
    # Highlight top entity
    ts.add("TEXTCOLOR",  (1, 1), (1, 1), ACCENT)
    ts.add("FONTNAME",   (1, 1), (1, 1), "Helvetica-Bold")
    t.setStyle(ts)
    story.append(t)
    story.append(Spacer(1, 10))


def _section_trends(story, data: dict, styles: dict):
    trends = data.get("trends", [])
    if not trends:
        return
    story.append(Paragraph("Mention Trends", styles["section_h"]))
    story.append(_hr(TEAL))
    story.append(Paragraph(
        "Frequency analysis of top entities across the corpus.",
        styles["caption"],
    ))
    story.append(Spacer(1, 4))

    table_data = [["Entity", "Mention Count"]]
    for tr in trends[:10]:
        table_data.append([tr.get("name", ""), str(tr.get("value", 0))])

    col_w = [(PAGE_W - 2 * MARGIN) * r for r in (0.72, 0.28)]
    t = Table(table_data, colWidths=col_w)
    ts = _base_table_style(TEAL)
    ts.add("ALIGNMENT", (1, 0), (1, -1), "CENTER")
    t.setStyle(ts)
    story.append(t)
    story.append(Spacer(1, 10))


def _section_clusters(story, data: dict, styles: dict):
    clusters = data.get("clusters", [])
    if not clusters:
        return
    story.append(Paragraph("Theme Clusters", styles["section_h"]))
    story.append(_hr(PURPLE))
    story.append(Paragraph(
        "Embedding-based thematic grouping of market discourse.",
        styles["caption"],
    ))
    story.append(Spacer(1, 4))

    for i, c in enumerate(clusters, 1):
        story.append(Paragraph(
            f"{i}. {c.get('label', f'Theme {i}')}",
            styles["sub_h"],
        ))
        story.append(Paragraph(c.get("summary", ""), styles["body"]))
    story.append(Spacer(1, 10))


def _section_positioning(story, data: dict, styles: dict):
    positioning = data.get("positioning", [])
    if not positioning:
        return
    story.append(Paragraph("Competitive Positioning Map", styles["section_h"]))
    story.append(_hr(WARM))
    story.append(Paragraph(
        "X-axis: Ease-of-use proxy (positive sentiment ratio)  ·  "
        "Y-axis: Feature richness proxy (normalised mention density).",
        styles["caption"],
    ))
    story.append(Spacer(1, 4))

    table_data = [["Competitor / Product", "Ease of Use", "Feature Richness"]]
    for p in positioning:
        table_data.append([
            p.get("name", ""),
            f"{p.get('x', 0) * 100:.0f}%",
            f"{p.get('y', 0) * 100:.0f}%",
        ])

    col_w = [(PAGE_W - 2 * MARGIN) * r for r in (0.50, 0.25, 0.25)]
    t = Table(table_data, colWidths=col_w)
    ts = _base_table_style(WARM)
    ts.add("ALIGNMENT", (1, 0), (-1, -1), "CENTER")
    t.setStyle(ts)
    story.append(t)
    story.append(Spacer(1, 10))


def _section_sources(story, data: dict, styles: dict):
    sources = data.get("sources", [])
    if not sources:
        return
    story.append(Paragraph("Sources", styles["section_h"]))
    story.append(_hr())
    story.append(Paragraph(
        "Weighted by content length, recency, and engagement signal.",
        styles["caption"],
    ))
    story.append(Spacer(1, 4))

    table_data = [["Title / URL", "Quality Score"]]
    for src in sources[:8]:
        title = src.get("title") or src.get("url", "#")
        if len(title) > 80:
            title = title[:77] + "..."
        weight = src.get("weight", 0)
        table_data.append([title, f"{weight * 100:.0f} pts"])

    col_w = [(PAGE_W - 2 * MARGIN) * r for r in (0.82, 0.18)]
    t = Table(table_data, colWidths=col_w)
    ts = _base_table_style()
    ts.add("ALIGNMENT", (1, 0), (1, -1), "CENTER")
    t.setStyle(ts)
    story.append(t)
    story.append(Spacer(1, 10))


def _section_meta(story, data: dict, styles: dict):
    meta = data.get("nlp_meta")
    if not meta:
        return
    story.append(Paragraph("Processing Intelligence", styles["section_h"]))
    story.append(_hr(MID_GRAY, 0.4))

    proc_time = meta.get("processing_time", "—")
    models    = ", ".join(meta.get("models_used", []))
    story.append(Paragraph(
        f"Total processing time: <b>{proc_time}s</b>  ·  Models: {models}",
        styles["body"],
    ))

    breakdown = meta.get("timing_breakdown", {})
    if breakdown:
        rows = "  ·  ".join(f"{k}: {v}s" for k, v in breakdown.items())
        story.append(Paragraph(rows, styles["caption"]))

    story.append(Spacer(1, 6))


# ── Main generator ────────────────────────────────────────────────────────────

def generate_pdf_report(data: dict, output_path: str = "/mnt/data/market_report.pdf") -> str:
    """
    Generate a consultancy-grade PDF report from a MarketResearchResponse dict.

    Args:
        data: MarketResearchResponse serialised as dict (use .model_dump() or dict())
        output_path: Destination file path.

    Returns:
        output_path on success.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN + 8 * mm,
        title=f"Spectra — {data.get('query', 'Report')}",
        author="AI Intelligence Platform",
        subject="Confidential Spectra Report",
    )

    styles = _make_styles()
    story  = []

    # ── Cover ────────────────────────────────────────────────────────────────
    _section_cover(story, data, styles)

    # ── Executive Summary ────────────────────────────────────────────────────
    _section_summary(story, data, styles)

    # ── Key Insights ─────────────────────────────────────────────────────────
    _section_insights(story, data, styles)

    # ── Sentiment ────────────────────────────────────────────────────────────
    _section_sentiment(story, data, styles)

    # ── Entity Leaderboard ───────────────────────────────────────────────────
    _section_entities(story, data, styles)

    # ── Trends ───────────────────────────────────────────────────────────────
    _section_trends(story, data, styles)

    # ── Clusters ─────────────────────────────────────────────────────────────
    _section_clusters(story, data, styles)

    # ── Positioning Map ──────────────────────────────────────────────────────
    _section_positioning(story, data, styles)

    # ── Sources ──────────────────────────────────────────────────────────────
    _section_sources(story, data, styles)

    # ── NLP Meta ─────────────────────────────────────────────────────────────
    _section_meta(story, data, styles)

    # ── Build ────────────────────────────────────────────────────────────────
    doc.build(
        story,
        onFirstPage=_cover_canvas,
        onLaterPages=_inner_canvas,
    )

    return output_path


# ── FastAPI / Flask endpoint helper ──────────────────────────────────────────
# Drop this into your router file (e.g. routes/spectra_routes.py):
#
#   from fastapi import APIRouter
#   from fastapi.responses import FileResponse
#   from agents.market_research import run_market_research
#   from agents.market_research_pdf import generate_pdf_report
#
#   router = APIRouter()
#
#   @router.post("/api/spectra/pdf")
#   async def spectra_pdf(req: MarketResearchRequest):
#       data = await run_market_research(req)
#       path = generate_pdf_report(data)
#       return FileResponse(
#           path,
#           media_type="application/pdf",
#           filename="spectra_report.pdf",
#       )