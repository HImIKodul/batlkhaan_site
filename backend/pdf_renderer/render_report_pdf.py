#!/usr/bin/env python3
import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab import rl_config
rl_config.invariant = 1
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    LongTable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

GENERATOR_VERSION = "MMRI-PDF-1.5-BUSINESS-REPORT"
FONT_REG = "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"

# Restrained business-report palette: one brand family, one risk color, neutrals.
INK = colors.HexColor("#163C30")
INK_2 = colors.HexColor("#29483C")
MUTED = colors.HexColor("#667A71")
LINE = colors.HexColor("#DDE7E2")
PAPER = colors.white
SOFT = colors.HexColor("#F4F8F6")
SOFT_2 = colors.HexColor("#EDF4F0")
ACCENT = colors.HexColor("#1F7A55")
ACCENT_DARK = colors.HexColor("#14523B")
ACCENT_LIGHT = colors.HexColor("#E8F4EE")
# Domain colour (fills/strokes/eyebrows). Strength/risk tones stay green/red so domain colour never reads as status.
DOMAIN_COLORS = {
    "marketing": ("#FF3D8D", "#D81B70", "#FFE9F2"),
    "it": ("#00A6FF", "#007AC0", "#E0F4FF"),
    "finance": ("#FFD000", "#8F6B00", "#FFF6CC"),
    "people": ("#7C4DFF", "#5A31D6", "#EFE9FF"),
    "operations": ("#FF6A00", "#C24E00", "#FFEBDC"),
}
DOMAIN = ACCENT
DOMAIN_INK = ACCENT
DOMAIN_LIGHT = ACCENT_LIGHT


# Layout tier: 0 is the accepted design. Higher tiers shrink only the optional approved explanations and the milestone table
# (never drop a milestone or an approved sentence) when a plan or reviewer edit would otherwise push the report past exactly 3 pages.
TIER_E = 0  # explanation tier (pages 1-2): 0-3 print every approved word, 4 shortens (never in --strict), 5 omits explanations (never in --strict)
STRICT = False
TIER_R = 0  # roadmap tier (page 3)
TIER_ROADMAP = {0: (7.5, 10.6, 3.5), 1: (6.9, 8.9, 2.4), 2: (6.3, 8.0, 1.7), 3: (5.8, 7.3, 1.2), 4: (5.8, 7.3, 1.0)}
TIER_EXPLAIN = {0: (6.9, 9.2), 1: (6.3, 8.2), 2: (5.9, 7.4), 3: (5.6, 7.0), 4: (5.6, 7.0), 5: (5.6, 7.0)}


def set_domain(code):
    global DOMAIN, DOMAIN_INK, DOMAIN_LIGHT
    fill, ink, light = DOMAIN_COLORS.get(code, (None, None, None))
    if fill:
        DOMAIN, DOMAIN_INK, DOMAIN_LIGHT = colors.HexColor(fill), colors.HexColor(ink), colors.HexColor(light)
RISK = colors.HexColor("#B34238")
RISK_LIGHT = colors.HexColor("#FBEDEC")
WARN = colors.HexColor("#9B6A19")
WARN_LIGHT = colors.HexColor("#FFF7E8")


def fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(2)


def text(v):
    # customer-facing text never contains em dashes (matches frontend api/client.ts noEmDash)
    return escape(re.sub(r"\s*[\u2014\u2015]\s*", " - ", str(v or "")))


def score(v):
    if v is None:
        return "-"
    try:
        return str(int(round(float(v))))
    except Exception:
        return "-"


def pct(v):
    if v is None:
        return "-"
    try:
        return f"{int(round(float(v) * 100))}%"
    except Exception:
        return "-"


def font_setup():
    if not Path(FONT_REG).is_file() or not Path(FONT_BOLD).is_file():
        fail("Noto Sans fonts are required for Mongolian PDF rendering")
    pdfmetrics.registerFont(TTFont("MMRINoto", FONT_REG))
    pdfmetrics.registerFont(TTFont("MMRINotoBold", FONT_BOLD))


def styles():
    base = getSampleStyleSheet()
    rm_size, rm_lead, _ = TIER_ROADMAP[TIER_R]
    ex_size, ex_lead = TIER_EXPLAIN[TIER_E]
    return {
        "rm_body": ParagraphStyle(
            "rm_body", parent=base["BodyText"], fontName="MMRINoto",
            fontSize=rm_size, leading=rm_lead, textColor=INK_2,
        ),
        "rm_small_bold": ParagraphStyle(
            "rm_small_bold", parent=base["BodyText"], fontName="MMRINotoBold",
            fontSize=min(6.6, rm_size), leading=min(8.8, rm_lead), textColor=MUTED,
        ),
        "explain": ParagraphStyle(
            "explain", parent=base["BodyText"], fontName="MMRINoto",
            fontSize=ex_size, leading=ex_lead, textColor=INK_2,
        ),
        "eyebrow": ParagraphStyle(
            "eyebrow", parent=base["BodyText"], fontName="MMRINotoBold",
            fontSize=7.2, leading=9.2, textColor=DOMAIN_INK,
            spaceAfter=1.5 * mm, tracking=0.5,
        ),
        "title": ParagraphStyle(
            "title", parent=base["Heading1"], fontName="MMRINotoBold",
            fontSize=21, leading=25, textColor=INK, spaceAfter=2.5 * mm,
        ),
        "page_title": ParagraphStyle(
            "page_title", parent=base["Heading1"], fontName="MMRINotoBold",
            fontSize=17, leading=21, textColor=INK, spaceAfter=3.5 * mm,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], fontName="MMRINotoBold",
            fontSize=11.5, leading=14.5, textColor=INK, spaceAfter=2.4 * mm,
        ),
        "h3": ParagraphStyle(
            "h3", parent=base["Heading3"], fontName="MMRINotoBold",
            fontSize=8.8, leading=11.2, textColor=INK, spaceAfter=0.8 * mm,
        ),
        "body": ParagraphStyle(
            "body", parent=base["BodyText"], fontName="MMRINoto",
            fontSize=8.2, leading=12.2, textColor=INK_2, spaceAfter=1.5 * mm,
        ),
        "body_compact": ParagraphStyle(
            "body_compact", parent=base["BodyText"], fontName="MMRINoto",
            fontSize=7.5, leading=10.6, textColor=INK_2,
        ),
        "small": ParagraphStyle(
            "small", parent=base["BodyText"], fontName="MMRINoto",
            fontSize=6.6, leading=8.8, textColor=MUTED,
        ),
        "small_bold": ParagraphStyle(
            "small_bold", parent=base["BodyText"], fontName="MMRINotoBold",
            fontSize=6.6, leading=8.8, textColor=MUTED,
        ),
        "metric": ParagraphStyle(
            "metric", parent=base["BodyText"], fontName="MMRINotoBold",
            fontSize=10, leading=12.5, textColor=INK,
        ),
        "score": ParagraphStyle(
            "score", parent=base["BodyText"], fontName="MMRINotoBold",
            fontSize=30, leading=32, alignment=TA_CENTER, textColor=DOMAIN_INK,
        ),
        "score_label": ParagraphStyle(
            "score_label", parent=base["BodyText"], fontName="MMRINotoBold",
            fontSize=6.2, leading=8.2, alignment=TA_CENTER, textColor=MUTED,
        ),
        "table_head": ParagraphStyle(
            "table_head", parent=base["BodyText"], fontName="MMRINotoBold",
            fontSize=6.4, leading=8.2, textColor=INK,
        ),
        "warning": ParagraphStyle(
            "warning", parent=base["BodyText"], fontName="MMRINoto",
            fontSize=7.1, leading=10.2, textColor=colors.HexColor("#6C4D13"),
        ),
    }


def p(value, style):
    return Paragraph(text(value), style)


def date_label(value):
    raw = str(value or "").strip()
    if not raw:
        return "-"
    try:
        d = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return f"{d.year}.{d.month:02d}.{d.day:02d}"
    except Exception:
        return raw[:10]


class AccentBar(Flowable):
    def __init__(self, width, height=2.2 * mm, color=None):
        super().__init__()
        self.width = width
        self.height = height
        self.color = color

    def draw(self):
        self.canv.setFillColor(self.color or DOMAIN)
        self.canv.roundRect(0, 0, self.width, self.height, self.height / 2, fill=1, stroke=0)


class ScoreBadge(Flowable):
    def __init__(self, value, diameter=33 * mm):
        super().__init__()
        self.value = score(value)
        self.width = diameter
        self.height = diameter

    def draw(self):
        c = self.canv
        d = self.width
        c.setFillColor(DOMAIN_LIGHT)
        c.circle(d / 2, d / 2, d / 2, fill=1, stroke=0)
        c.setStrokeColor(DOMAIN)
        c.setLineWidth(2.0)
        c.circle(d / 2, d / 2, d / 2 - 1.2 * mm, fill=0, stroke=1)
        c.setFillColor(DOMAIN_INK)
        c.setFont("MMRINotoBold", 27)
        c.drawCentredString(d / 2, d / 2 + 1.7 * mm, self.value)
        c.setFillColor(MUTED)
        c.setFont("MMRINotoBold", 5.8)
        c.drawCentredString(d / 2, d / 2 - 7.0 * mm, "НИЙТ ҮНЭЛГЭЭ")


def page_header_footer(canvas, doc, source, st):
    canvas.saveState()
    width, height = A4
    # Thin domain-colour frame around the full business document.
    canvas.setStrokeColor(DOMAIN)
    canvas.setLineWidth(0.8)
    canvas.roundRect(6.5 * mm, 6.5 * mm, width - 13 * mm, height - 13 * mm, 2.2 * mm, fill=0, stroke=1)
    # Header
    canvas.setFillColor(INK)
    canvas.setFont("MMRINotoBold", 7.2)
    canvas.drawString(14 * mm, height - 10.5 * mm, "BUSINESSMMRI.MN")
    canvas.setFillColor(MUTED)
    canvas.setFont("MMRINoto", 6.3)
    canvas.drawRightString(width - 14 * mm, height - 10.5 * mm, "Бизнесийн оношилгооны тайлан")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(14 * mm, height - 13.3 * mm, width - 14 * mm, height - 13.3 * mm)
    # Footer
    canvas.line(14 * mm, 11.2 * mm, width - 14 * mm, 11.2 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("MMRINoto", 6.1)
    company = str(source.get("companyName", ""))[:70]
    canvas.drawString(14 * mm, 7.0 * mm, company)
    canvas.drawCentredString(width / 2, 7.0 * mm, date_label(source.get("generatedAt")))
    canvas.drawRightString(width - 14 * mm, 7.0 * mm, f"{doc.page}")
    canvas.restoreState()


PRELIM_NOTE = "Урьдчилсан гэж тэмдэглэсэн чадавхыг одоогийн хариултын бодит оноогоор эрэмбэлсэн бөгөөд нэмэлт нотолгоо бүрдэх тусам баталгаажна."


def metric_strip(source, st):
    official = source.get("metricType") == "OFFICIAL_OVERALL_SCORE"
    cells = [
        ("Үнэлгээний түвшин", source.get("overallBand") or "-"),
        ("Үнэлгээний төрөл", "Албан ёсны" if official else "Урьдчилсан"),
    ]
    row = []
    for label, value in cells:
        row.append(Table(
            [[p(label, st["small_bold"])], [p(value, st["metric"])]],
            colWidths=[54 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), SOFT),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]),
        ))
    return Table([row], colWidths=[56 * mm] * len(cells), hAlign="LEFT", style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))


def explanation_text(value, limit):
    """Approved explanation text. Only the last-resort tier 4 shortens it (at a word boundary, marked with an ellipsis)."""
    v = re.sub(r"\s+", " ", str(value or "")).strip()
    if not v or TIER_E >= 5:
        return ""
    if TIER_E >= 4 and len(v) > limit:
        v = v[:limit].rsplit(" ", 1)[0] + "..."
    return v


def compact_finding_list(items, st, positive=True):
    tone = ACCENT if positive else RISK
    bg = ACCENT_LIGHT if positive else RISK_LIGHT
    rows = []
    spans = []
    expl_rows = []
    for i, item in enumerate(items[:5], 1):
        rows.append([
            p(str(i), st["small_bold"]),
            p((item.get("nameMn") or "-") + (" · урьдчилсан" if item.get("basis") == "RELATIVE_RANK" else ""), st["h3"]),
            p(score(item.get("score")), st["h3"]),
        ])
        # Approved narrative wording (reviewer or AI) that differs from the default is part of the customer report (MMRI-13).
        explanation = explanation_text(item.get("explanationMn"), 110)
        if explanation:
            rows.append(["", p(explanation, st["explain"]), ""])
            spans.append(("SPAN", (1, len(rows) - 1), (2, len(rows) - 1)))
            expl_rows.append(len(rows) - 1)
    if not rows:
        rows = [[p("-", st["small"]), p("Мэдээлэл алга", st["small"]), p("-", st["small"])]]
    t = Table(rows, colWidths=[7 * mm, 55 * mm, 12 * mm])
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.45, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 3.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3.5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5 if TIER_E < 3 else 2.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 if TIER_E < 3 else 2.2),
        ("BACKGROUND", (0, 0), (0, -1), bg),
        ("TEXTCOLOR", (2, 0), (2, -1), tone),
    ] + spans
    for r in expl_rows:
        commands += [("TOPPADDING", (0, r), (-1, r), 0), ("BOTTOMPADDING", (0, r), (-1, r), 2.5)]
        commands.append(("BOTTOMPADDING", (0, r - 1), (-1, r - 1), 1.5))
    t.setStyle(TableStyle(commands))
    return t


def summary_page(source, st, content_width):
    SF = 1.0 if TIER_E < 2 else 0.5  # compact vertical gaps only when approved explanations need the room
    left = Table(
        [[ScoreBadge(source.get("overallScore"))]],
        colWidths=[39 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), SOFT),
            ("BOX", (0, 0), (-1, -1), 0.6, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
        ]),
    )
    conclusion = Table(
        [[p("Ерөнхий дүгнэлт", st["h2"])], [p(source.get("conclusionMn"), st["body_compact"])]],
        colWidths=[content_width],
        style=TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.6, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]),
    )
    hero = Table([[left, metric_strip(source, st)]], colWidths=[42 * mm, 130 * mm], hAlign="LEFT")
    hero.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    strong = compact_finding_list(source.get("strengths") or [], st, True)
    weak = compact_finding_list(source.get("weaknesses") or [], st, False)
    snapshot = Table([
        [p("Давуу талын товч зураг", st["h2"]), p("Сул талын товч зураг", st["h2"])],
        [strong, weak],
    ], colWidths=[85 * mm, 85 * mm], hAlign="LEFT")
    snapshot.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5 * mm),
    ]))

    story = [
        Spacer(1, 3 * mm * SF),
        p("УДИРДЛАГЫН ТАЙЛАН", st["eyebrow"]),
        p(source.get("companyName"), st["title"]),
        p("Бизнесийн оношилгооны үр дүн, тэргүүлэх 5 ажил, 12 сарын төлөвлөгөө", st["body"]),
        AccentBar(content_width),
        Spacer(1, 4 * mm * SF),
        hero,
        Spacer(1, 3 * mm * SF),
        conclusion,
        Spacer(1, 4 * mm * SF),
        snapshot,
    ]
    prelim = any(x.get("basis") == "RELATIVE_RANK" for x in (source.get("strengths") or []) + (source.get("weaknesses") or []))
    if prelim:
        story += [Spacer(1, 1.5 * mm * SF), p(PRELIM_NOTE, st["small"])]
    notes = list(source.get("warnings") or []) + list(source.get("risks") or [])
    if notes:
        box = Table([[[p(note, st["warning"]) for note in notes[:3]]]], colWidths=[content_width], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), WARN_LIGHT),
            ("BOX", (0, 0), (-1, -1), 0.45, colors.HexColor("#E6CF9A")),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story += [Spacer(1, 3 * mm * SF), box]
    story.append(PageBreak())
    return story


def action_card(action, index, st, content_width):
    score_box = Table([
        [p("Одоо", st["small_bold"]), p(score(action.get("currentScore")), st["h3"])],
        [p("Зорилт", st["small_bold"]), p(score(action.get("targetScore")), st["h3"])],
    ], colWidths=[15 * mm, 13 * mm])
    score_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), DOMAIN_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.4, DOMAIN),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    title = Table([
        [
            p(str(index), st["h3"]),
            p(action.get("titleMn") or "-", st["h3"]),
            p(action.get("ownerRoleLabelMn") or "-", st["small_bold"]),
            score_box,
        ],
    ], colWidths=[9 * mm, 91 * mm, 38 * mm, 30 * mm])
    title.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), DOMAIN_LIGHT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    facts = Table([
        [p("Хийх ажил", st["small_bold"]), p(action.get("actionMn") or action.get("narrativeMn") or "-", st["body_compact"])],
        [p("Гарц", st["small_bold"]), p(action.get("deliverableMn") or "-", st["body_compact"])],
        [p("Хэмжүүр", st["small_bold"]), p(action.get("kpiMn") or "-", st["body_compact"])],
    ] + ([[p("Тайлбар", st["small_bold"]), p(explanation_text(action.get("explanationMn"), 300), st["explain"])]] if explanation_text(action.get("explanationMn"), 300) else []), colWidths=[24 * mm, 144 * mm])
    facts.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEABOVE", (0, 1), (-1, -1), 0.25, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    card = Table([[title], [facts]], colWidths=[content_width])
    card.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return KeepTogether([card, Spacer(1, 2.2 * mm)])


def actions_page(source, st, content_width):
    story = [
        p("02 · ТЭРГҮҮЛЭХ 5 АЖИЛ", st["eyebrow"]),
        p("Эхэлж хэрэгжүүлэх 5 ажил", st["page_title"]),
        p("Сул чадавхыг бодит ахиц болгохын тулд хариуцагч, гарах үр дүн, хэмжүүрийг хамтад нь тодорхойлов.", st["body"]),
        Spacer(1, 2 * mm),
    ]
    for i, action in enumerate((source.get("criticalActions") or [])[:5], 1):
        story.append(action_card(action, i, st, content_width))
    story.append(PageBreak())
    return story


def roadmap_summary_rows(source):
    """Every milestone in plan order with its own period (MMRI-30). Nothing is merged across horizons."""
    out = []
    for horizon in source.get("roadmap") or []:
        for milestone in horizon.get("milestones") or []:
            out.append((horizon, milestone))
    return out


def roadmap_grouped_table(entries, st):
    """Compact layout for long plans (tier 2+): one block per recommendation, every milestone still on its own line with
    its own period, description, deliverable and measure, in chronological order. Nothing is merged or dropped."""
    _, _, pad = TIER_ROADMAP[TIER_R]
    order, groups = [], {}
    for horizon, milestone in entries:
        key = str(milestone.get("recommendationId") or milestone.get("milestoneId") or "")
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append((horizon, milestone))
    head = [p("Хариуцагч / ажил", st["table_head"]), p("Үе шат бүрийн хугацаа, ажил, гарц, хэмжүүр", st["table_head"])]
    rows = [head]
    for key in order:
        items = groups[key]
        first = items[0][1]
        left = Paragraph(f"<b>{text(first.get('titleMn') or '-')}</b><br/>{text(first.get('ownerRoleLabelMn') or '-')}", st["rm_body"])
        lines = []
        for horizon, m in items:
            period = f"{horizon.get('dayStart', 0)}-{horizon.get('dayEnd', 0)} өдөр"
            desc = text(m.get("milestoneMn") or "")
            lines.append(Paragraph(
                f"<b>{text(period)}</b> ({text(horizon.get('nameMn') or '')}): {desc} <b>Гарц:</b> {text(m.get('deliverableMn') or '-')} <b>Хэмжүүр:</b> {text(m.get('kpiMn') or '-')}",
                st["rm_body"]))
        rows.append([left, lines])
    table = Table(rows, colWidths=[44 * mm, 126 * mm], repeatRows=1, hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), DOMAIN_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.55, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), pad),
        ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
    ]
    for idx in range(1, len(rows)):
        if idx % 2 == 0:
            commands.append(("BACKGROUND", (0, idx), (-1, idx), SOFT))
    table.setStyle(TableStyle(commands))
    return table


def roadmap_table(source, st, content_width):
    entries = roadmap_summary_rows(source)
    if not entries:
        return p("Энэ оношилгоонд 12 сарын төлөвлөгөө үүсээгүй байна.", st["body"])
    if TIER_R >= 2:
        return roadmap_grouped_table(entries, st)
    _, _, pad = TIER_ROADMAP[TIER_R]
    head = [p("Хугацаа", st["table_head"]), p("Хийх ажил / үе шат", st["table_head"]), p("Хариуцагч", st["table_head"]), p("Гарц / хэмжүүр", st["table_head"])]
    rows = [head]
    spans = []
    start_row = None
    last_horizon = None
    for horizon, milestone in entries:
        hid = (horizon.get("horizon"), horizon.get("dayStart"), horizon.get("dayEnd"))
        idx = len(rows)
        period = f"{horizon.get('dayStart', 0)}-{horizon.get('dayEnd', 0)} өдөр"
        first = hid != last_horizon
        if first:
            if start_row is not None and idx - 1 > start_row:
                spans.append(("SPAN", (0, start_row), (0, idx - 1)))
            start_row = idx
            last_horizon = hid
        label = Paragraph(f"<b>{text(period)}</b><br/>{text(horizon.get('nameMn') or '')}", st["rm_small_bold"]) if first else ""
        title = text(milestone.get("titleMn") or "-")
        desc = text(milestone.get("milestoneMn") or "")
        deliverable = text(milestone.get("deliverableMn") or "-")
        measure = text(milestone.get("kpiMn") or "-")
        rows.append([
            label,
            Paragraph(f"<b>{title}</b>" + (f"<br/>{desc}" if desc else ""), st["rm_body"]),
            Paragraph(text(milestone.get("ownerRoleLabelMn") or "-"), st["rm_body"]),
            Paragraph(f"<b>Гарц:</b> {deliverable}<br/><b>Хэмжүүр:</b> {measure}", st["rm_body"]),
        ])
    if start_row is not None and len(rows) - 1 > start_row:
        spans.append(("SPAN", (0, start_row), (0, len(rows) - 1)))
    table = Table(rows, colWidths=[23 * mm, 66 * mm, 28 * mm, 53 * mm], repeatRows=1, hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), DOMAIN_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.55, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), pad),
        ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
    ] + spans
    for idx in range(1, len(rows)):
        if idx % 2 == 0:
            commands.append(("BACKGROUND", (1, idx), (-1, idx), SOFT))
    table.setStyle(TableStyle(commands))
    return table


def roadmap_pages(source, st, content_width):
    return [
        p("03 · 12 САРЫН ТӨЛӨВЛӨГӨӨ", st["eyebrow"]),
        p("12 сарын хэрэгжилтийн төлөвлөгөө", st["page_title"]),
        p("Үе шат бүрийн хугацаа, ажил, хариуцагч, гарах үр дүн, хэмжүүрийг дарааллаар нь харуулав.", st["body"]),
        Spacer(1, 2 * mm),
        roadmap_table(source, st, content_width),
    ]


def build_story(source, st, content_width):
    story = []
    story += summary_page(source, st, content_width)
    story += actions_page(source, st, content_width)
    story += roadmap_pages(source, st, content_width)
    return story


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--strict", action="store_true", help="never shorten or omit approved explanations; exit 3 when they do not fit")
    args = ap.parse_args()
    source = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if source.get("sourceVersion") != "MMRI-PDF-SOURCE-1.0":
        fail("Unsupported MMRI PDF source version")
    for key in ("payloadHash", "narrativeHash", "bindingHash"):
        if len(str(source.get(key, ""))) != 64:
            fail(f"Invalid {key}")

    set_domain((source.get("render") or {}).get("domainCode"))
    font_setup()
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)

    # A4 portrait with a stable 14 mm content margin and dedicated header/footer space.
    left = right = 14 * mm
    top = 18 * mm
    bottom = 15 * mm
    content_width = A4[0] - left - right
    global TIER_E, TIER_R, STRICT
    STRICT = args.strict
    # Tier 0/0 is the accepted design. The explanation tier (pages 1-2) and the roadmap tier (page 3) grow independently, smallest total first.
    for te, tr in sorted(((a, b) for a in TIER_EXPLAIN for b in TIER_ROADMAP), key=lambda x: (x[0] >= 4, x[0] + x[1], x[1])):
        if STRICT and te >= 4:
            continue
        TIER_E, TIER_R = te, tr
        st = styles()
        doc = SimpleDocTemplate(
            str(out),
            pagesize=A4,
            rightMargin=right,
            leftMargin=left,
            topMargin=top,
            bottomMargin=bottom,
            title=f"MMRI {source.get('reportId', '')}",
            author="BusinessMMRI.mn",
            subject=f"{GENERATOR_VERSION} {source.get('payloadHash', '')}",
            creator=GENERATOR_VERSION,
            pageCompression=1,
        )
        try:
            doc.build(
                build_story(source, st, content_width),
                onFirstPage=lambda c, d: page_header_footer(c, d, source, st),
                onLaterPages=lambda c, d: page_header_footer(c, d, source, st),
            )
        except Exception as exc:  # a single block taller than a page raises LayoutError: that tier simply does not fit
            if "too large" not in str(exc) and exc.__class__.__name__ != "LayoutError":
                raise
            doc.page = 0
            continue
        if doc.page == 3:
            break
    if doc.page != 3 and STRICT:
        print("PDF layout budget exceeded: approved text does not fit three pages", file=sys.stderr)
        raise SystemExit(3)
    if doc.page != 3:
        fail(f"PDF page contract violated: expected 3 pages, rendered {doc.page}")
    if not out.is_file() or out.stat().st_size < 8_000:
        fail("PDF renderer did not create a valid-sized artifact")


if __name__ == "__main__":
    main()
