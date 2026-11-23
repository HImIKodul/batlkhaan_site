#!/usr/bin/env python3
import argparse
import json
import os
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
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    Flowable,
    Image,
    KeepTogether,
    LongTable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

GENERATOR_VERSION = "MMRI-PDF-1.6-BUSINESSMRI-BRAND"
# Noto Sans (SIL OFL 1.1) ships next to this script so the renderer does not depend on the server's font packages.
# Resolution order: environment override, bundled fonts/, legacy Linux system path.
_FONT_DIR = Path(__file__).resolve().parent / "fonts"


def _font_path(env_name, file_name, system_path):
    for candidate in (os.environ.get(env_name, "").strip(), str(_FONT_DIR / file_name), system_path):
        if candidate and Path(candidate).is_file():
            return candidate
    return system_path


FONT_REG = _font_path("MMRI_PDF_FONT_REGULAR", "NotoSans-Regular.ttf", "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf")
FONT_BOLD = _font_path("MMRI_PDF_FONT_BOLD", "NotoSans-Bold.ttf", "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf")

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
    canvas.drawString(14 * mm, height - 10.5 * mm, "BusinessMRI.mn")
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


# ---------------------------------------------------------------------------------------------------------------------
# Administrator visual annotations (source["annotations"]). An overlay drawn on top of each finished page, in page units
# (0..1 of the A4 width/height, origin top-left). It never takes part in the layout, so the three-page contract and the
# original content are unaffected; without annotations this code path draws nothing.
ANNOTATION_COLORS = {"red": "#D64545", "orange": "#E8913A", "green": "#2E9E6B", "blue": "#2F6FDE", "ink": "#1F2937", "yellow": "#F5C518"}


def _annotation_items(source, page):
    raw = (source.get("annotations") or {}).get("items") or []
    return [a for a in raw if isinstance(a, dict) and int(a.get("page", 0)) == page]


def draw_annotations(canvas, source, page):
    items = _annotation_items(source, page)
    if not items:
        return
    width, height = A4
    px = lambda v: float(v) * width
    py = lambda v: height - float(v) * height
    canvas.saveState()
    for a in items:
        kind = a.get("type")
        col = colors.HexColor(ANNOTATION_COLORS.get(a.get("color"), "#D64545"))
        sw = float(a.get("strokeWidth") or 1.5)
        canvas.setLineCap(1)
        canvas.setLineJoin(1)
        if kind == "highlight":
            canvas.setFillColor(col)
            canvas.setFillAlpha(0.35)
            canvas.rect(px(a["x"]), py(a["y"] + a["h"]), px(a["w"]), float(a["h"]) * height, fill=1, stroke=0)
        elif kind == "rect":
            canvas.setStrokeColor(col)
            canvas.setLineWidth(sw)
            canvas.roundRect(px(a["x"]), py(a["y"] + a["h"]), px(a["w"]), float(a["h"]) * height, 1.2, fill=0, stroke=1)
        elif kind == "arrow":
            (x1, y1), (x2, y2) = a["points"][0], a["points"][-1]
            ax, ay, bx, by = px(x1), py(y1), px(x2), py(y2)
            dx, dy = bx - ax, by - ay
            length = (dx * dx + dy * dy) ** 0.5 or 1.0
            ux, uy = dx / length, dy / length
            head = min(max(sw * 4.0, 6.0), length * 0.6)
            canvas.setStrokeColor(col)
            canvas.setFillColor(col)
            canvas.setLineWidth(sw)
            canvas.line(ax, ay, bx - ux * head * 0.7, by - uy * head * 0.7)
            path = canvas.beginPath()
            path.moveTo(bx, by)
            path.lineTo(bx - ux * head + uy * head * 0.45, by - uy * head - ux * head * 0.45)
            path.lineTo(bx - ux * head - uy * head * 0.45, by - uy * head + ux * head * 0.45)
            path.close()
            canvas.drawPath(path, fill=1, stroke=0)
        elif kind == "pen":
            pts = a.get("points") or []
            if len(pts) >= 2:
                canvas.setStrokeColor(col)
                canvas.setLineWidth(sw)
                path = canvas.beginPath()
                path.moveTo(px(pts[0][0]), py(pts[0][1]))
                for qx, qy in pts[1:]:
                    path.lineTo(px(qx), py(qy))
                canvas.drawPath(path, fill=0, stroke=1)
        elif kind == "text":
            bx, by, bw, bh = px(a["x"]), py(a["y"] + a["h"]), px(a["w"]), float(a["h"]) * height
            canvas.setFillColor(colors.HexColor("#FFFDF4"))
            canvas.setFillAlpha(0.94)
            canvas.setStrokeColor(col)
            canvas.setLineWidth(0.8)
            canvas.roundRect(bx, by, bw, bh, 1.6, fill=1, stroke=1)
            canvas.setFillAlpha(1)
            canvas.setFillColor(colors.HexColor("#1F2937"))
            size = float(a.get("fontSize") or 9)
            lead = size * 1.25
            pad = 3.0
            lines = []
            for para in str(a.get("text") or "").split("\n"):
                lines.extend(simpleSplit(para, "MMRINoto", size, max(bw - 2 * pad, 4)) or [""])
            room = max(int((bh - 2 * pad) // lead), 0)
            shown = lines[:room]
            canvas.setFont("MMRINoto", size)
            for i, line in enumerate(shown):
                canvas.drawString(bx + pad, by + bh - pad - size - i * lead, line)
    canvas.restoreState()


def annotated_canvas_factory(source):
    class AnnotatedCanvas(Canvas):
        def showPage(self):  # the page is complete here: draw the overlay on top of it, then finish the page
            draw_annotations(self, source, self._pageNumber)
            super().showPage()

    def make(*args, **kwargs):
        return AnnotatedCanvas(*args, **kwargs)

    return make


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


def company_logo_flowable(source):
    """The company logo (a validated PNG, <= 512 px) from the report's frozen snapshot, scaled to fit 26 x 17 mm keeping its aspect ratio and transparency. None when the report has no logo or the data is unusable (the report then renders exactly as before)."""
    import base64
    import io
    b64 = (source.get("render") or {}).get("companyLogoPng")
    if not b64 or not (source.get("companyLogo") or {}).get("sha256"):
        return None
    try:
        raw = base64.b64decode(b64, validate=True)
        from PIL import Image as PILImage
        im = PILImage.open(io.BytesIO(raw))
        w, h = im.size
        if w < 1 or h < 1:
            return None
        box_w, box_h = 26 * mm, 17 * mm
        scale = min(box_w / w, box_h / h)
        flow = Image(io.BytesIO(raw), width=w * scale, height=h * scale, mask="auto")
        flow.hAlign = "RIGHT"
        return flow
    except Exception:
        return None


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

    title_block = [
        p("УДИРДЛАГЫН ТАЙЛАН", st["eyebrow"]),
        p(source.get("companyName"), st["title"]),
        p("Бизнесийн оношилгооны үр дүн, тэргүүлэх 5 ажил, 12 сарын төлөвлөгөө", st["body"]),
    ]
    logo = company_logo_flowable(source)
    if logo is not None:
        # The logo sits in its own right-hand column of the title block; the title text keeps the remaining width, so nothing overlaps and page height is unchanged.
        logo_w = 30 * mm
        title_block = [Table([[title_block, logo]], colWidths=[content_width - logo_w, logo_w], style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 3 * mm),
            ("RIGHTPADDING", (1, 0), (1, 0), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("ALIGN", (1, 0), (1, 0), "RIGHT")]), hAlign="LEFT")]
    story = [
        Spacer(1, 3 * mm * SF),
        *title_block,
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


def roadmap_grouped_table(entries, st, source):
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
            period = horizon_period_label(source, horizon)
            desc = text(m.get("milestoneMn") or "")
            lines.append(Paragraph(
                f"<b>{text(period)}</b> ({text(horizon_title(horizon))}): {desc} <b>Гарц:</b> {text(m.get('deliverableMn') or '-')} <b>Хэмжүүр:</b> {text(m.get('kpiMn') or '-')}",
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


HORIZON_TITLES = {
    "H0": "Шууд эхлэх ажлууд",
    "H1": "Эхний сарын ажлууд",
    "H2": "Суурийг бий болгох үе",
    "H3": "Хэрэгжилтийг бататгах үе",
    "H4": "Жилийн хэрэгжилт ба дүгнэлт",
}


def _add_months_clamped(d, months):
    import calendar
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    return d.replace(year=y, month=m, day=min(d.day, calendar.monthrange(y, m)[1]))


def horizon_period_label(source, horizon):
    """Calendar dates for a fallback-roadmap stage. Day 0 is the report date; the window ends the day before the same calendar date twelve months later (documented date policy), so the last stage never
    runs past the twelve-month window. Falls back to the stored day bounds only for sources that carry no report date."""
    import datetime
    start_day, end_day = int(horizon.get("dayStart") or 0), int(horizon.get("dayEnd") or 0)
    raw = str((source.get("render") or {}).get("reportDate") or "")
    try:
        base = datetime.date.fromisoformat(raw[:10])
    except ValueError:
        return f"{start_day}-{end_day} өдөр"
    window_end = _add_months_clamped(base, 12) - datetime.timedelta(days=1)
    start_day, end_day = _closed_horizon_bounds(source, horizon, start_day, end_day)
    s = min(base + datetime.timedelta(days=start_day), window_end)
    e = min(base + datetime.timedelta(days=end_day), window_end)
    return period_label_mn(s, e)


def _closed_horizon_bounds(source, horizon, start_day, end_day):
    """Horizons without milestones are not printed, so the printed ones are stretched to cover the whole year (same rule as the web page): the first starts on
    day 0, each runs to the day before the next one starts, the last to the end of the window."""
    used = [h for h in source.get("roadmap") or [] if h.get("milestones")]
    i = next((n for n, h in enumerate(used) if h is horizon or h.get("horizon") == horizon.get("horizon")), None)
    if i is None:
        return start_day, end_day
    if i == 0:
        start_day = 0
    end_day = max(end_day, int(used[i + 1].get("dayStart") or 0) - 1) if i < len(used) - 1 else max(end_day, 365)
    return start_day, end_day


def period_label_mn(a, b):
    """Same natural label as planPeriodLabelMn (backend) and periodLabelMn (web)."""
    import calendar
    if a.year == b.year:
        if a.day == 1 and b.day == calendar.monthrange(b.year, b.month)[1]:
            return f"{a.year} оны {a.month}-р сар" if a.month == b.month else f"{a.year} оны {a.month}-{b.month}-р сар"
        return f"{a.year} оны {a.month}-р сарын {a.day} - {b.month}-р сарын {b.day}"
    return f"{a.year} оны {a.month}-р сарын {a.day} - {b.year} оны {b.month}-р сарын {b.day}"


def horizon_title(horizon):
    return HORIZON_TITLES.get(str(horizon.get("horizon") or ""), "")


def roadmap_table(source, st, content_width):
    entries = roadmap_summary_rows(source)
    if not entries:
        return p("Энэ оношилгоонд 12 сарын төлөвлөгөө үүсээгүй байна.", st["body"])
    if TIER_R >= 2:
        return roadmap_grouped_table(entries, st, source)
    _, _, pad = TIER_ROADMAP[TIER_R]
    head = [p("Хугацаа", st["table_head"]), p("Хийх ажил / үе шат", st["table_head"]), p("Хариуцагч", st["table_head"]), p("Гарц / хэмжүүр", st["table_head"])]
    rows = [head]
    spans = []
    start_row = None
    last_horizon = None
    for horizon, milestone in entries:
        hid = (horizon.get("horizon"), horizon.get("dayStart"), horizon.get("dayEnd"))
        idx = len(rows)
        period = horizon_period_label(source, horizon)
        first = hid != last_horizon
        if first:
            if start_row is not None and idx - 1 > start_row:
                spans.append(("SPAN", (0, start_row), (0, idx - 1)))
            start_row = idx
            last_horizon = hid
        label = Paragraph(f"<b>{text(period)}</b><br/>{text(horizon_title(horizon))}", st["rm_small_bold"]) if first else ""
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


# ---------------------------------------------------------------------------------------------------------------------
# 12-month plan, page 3 (source["annualPlan"]): ONE connected vertical timeline, calendar labels computed by the backend.
# Fixed readable sizes (never below 8.3 pt). Only page 3 is touched: pages 1-2 and the explanation tiers are unaffected. When the plan does not
# fit at the smallest readable size the report falls back to the existing page 3 (the backend rejects such plans before they are stored).
PLAN_BLUE = colors.HexColor("#1F5FBF")
PLAN_BLUE_DARK = colors.HexColor("#123B7A")
PLAN_BLUE_LIGHT = colors.HexColor("#EAF2FF")
PLAN_LINE = colors.HexColor("#9DB9E6")
PLAN_SIZES = ((11.0, 15.2, 12.4), (10.6, 14.6, 11.9), (10.2, 14.0, 11.5), (9.8, 13.4, 11.0), (9.4, 12.9, 10.6), (9.0, 12.4, 10.2), (8.6, 11.8, 9.8), (8.3, 11.2, 9.6))
PLAN_GUTTER = 9 * mm


class PlanStage(Flowable):
    """One stage: the period label on ONE line above the heading (natural Mongolian calendar words, computed by the backend), then the heading, the dependency note and the actions. The dot of the connected timeline sits on the period line."""

    def __init__(self, stage, size, is_first, is_last, width):
        super().__init__()
        base = getSampleStyleSheet()
        fs, lead, hs = size
        self.stage, self.is_first, self.is_last, self.avail = stage, is_first, is_last, width
        self.date_style = ParagraphStyle("pl_date", parent=base["BodyText"], fontName="MMRINotoBold", fontSize=max(8.6, fs - 1.0), leading=max(11.0, fs + 1.6), textColor=PLAN_BLUE)
        self.head_style = ParagraphStyle("pl_head", parent=base["BodyText"], fontName="MMRINotoBold", fontSize=hs, leading=hs + 2.6, textColor=PLAN_BLUE_DARK)
        self.note_style = ParagraphStyle("pl_note", parent=base["BodyText"], fontName="MMRINoto", fontSize=fs - 0.6, leading=lead - 0.8, textColor=PLAN_BLUE)
        self.body_style = ParagraphStyle("pl_body", parent=base["BodyText"], fontName="MMRINoto", fontSize=fs, leading=lead, textColor=INK_2)
        self.gap_after = 4.2 * mm

    def wrap(self, availWidth, availHeight):
        self.text_w = availWidth - PLAN_GUTTER
        self.parts = [Paragraph(text(self.stage.get("dateLabel")), self.date_style), Paragraph(text(self.stage.get("headingMn")), self.head_style)]
        if self.stage.get("dependencyNoteMn"):
            self.parts.append(Paragraph(text(self.stage["dependencyNoteMn"]), self.note_style))
        for a in self.stage.get("actions") or []:
            self.parts.append(Paragraph("&#8226;&nbsp;" + text(a.get("textMn")), self.body_style))
        h = 0
        self.heights = []
        for i, pp in enumerate(self.parts):
            _, ph = pp.wrap(self.text_w, 10000)
            self.heights.append(ph)
            h += ph + (0.6 * mm if i == 0 else 1.2 * mm)
        self.height = h + 0.6 * mm
        self.width = availWidth
        return self.width, self.height

    def draw(self):
        c = self.canv
        top = self.height
        x = PLAN_GUTTER / 2
        dot_y = top - self.heights[0] / 2
        c.setStrokeColor(PLAN_LINE)
        c.setLineWidth(1.6)
        line_from = dot_y if self.is_first else top
        line_to = dot_y if self.is_last else -self.gap_after
        if line_from != line_to:
            c.line(x, line_from, x, line_to)
        c.setFillColor(colors.white)
        c.setStrokeColor(PLAN_BLUE)
        c.setLineWidth(1.8)
        c.circle(x, dot_y, 1.9 * mm, fill=1, stroke=1)
        y = top
        for i, (pp, ph) in enumerate(zip(self.parts, self.heights)):
            y -= ph
            pp.drawOn(c, PLAN_GUTTER, y)
            y -= 0.6 * mm if i == 0 else 1.2 * mm


def annual_plan_pages(source, st, content_width):
    plan = source.get("annualPlan") or {}
    stages = plan.get("stages") or []
    head = [
        p("03 · 12 САРЫН ТӨЛӨВЛӨГӨӨ", st["eyebrow"]),
        p("12 сарын хэрэгжилтийн төлөвлөгөө", st["page_title"]),
        p("Төлөвлөгөөний хугацаа: " + text(plan.get("periodLabel")) + ". Төлөвлөгөө нэг жилийн бүх хугацааг хамарна; зарим ажил зэрэгцэн явагдана.", st["body"]),
        Spacer(1, 3 * mm),
    ]
    # The platypus frame keeps 6 pt of padding on every side: measure with the width and height the frame really gives, otherwise text wraps into more
    # lines than estimated and a plan that fits at a smaller size is rejected.
    inner_w = content_width - 12
    avail = A4[1] - 18 * mm - 15 * mm - 12 - 2 * mm
    used = 0
    for fl in head:
        _, h = fl.wrap(inner_w, avail)
        used += h + max(fl.getSpaceBefore(), 0) + max(fl.getSpaceAfter(), 0)
    for size in PLAN_SIZES:
        flows = [PlanStage(s, size, i == 0, i == len(stages) - 1, inner_w) for i, s in enumerate(stages)]
        total = 0
        for fl in flows:
            _, h = fl.wrap(inner_w, avail)
            total += h + fl.gap_after
        if used + total <= avail:
            body = []
            for i, fl in enumerate(flows):
                body.append(fl)
                if i < len(flows) - 1:
                    body.append(Spacer(1, fl.gap_after))
            return head + body
    print("annual plan does not fit page 3 at the smallest readable size", file=sys.stderr)
    if STRICT:
        raise SystemExit(4)  # approval/generation-time check: the plan must be shortened, never silently replaced or truncated
    return None


def roadmap_pages(source, st, content_width):
    return [
        p("03 · 12 САРЫН ТӨЛӨВЛӨГӨӨ", st["eyebrow"]),
        p("12 сарын хэрэгжилтийн төлөвлөгөө", st["page_title"]),
        p("Танай компанид зориулсан 12 сарын хувийн төлөвлөгөө энэ тайланд үүсээгүй байна. Доорх нь оношилгооны үр дүнгээс гарсан ерөнхий хугацааны дараалал бөгөөд хувийн төлөвлөгөө биш болно.", st["body"]),
        Spacer(1, 2 * mm),
        roadmap_table(source, st, content_width),
    ]


def build_story(source, st, content_width):
    story = []
    story += summary_page(source, st, content_width)
    story += actions_page(source, st, content_width)
    plan_pages = annual_plan_pages(source, st, content_width) if (source.get("annualPlan") or {}).get("stages") else None
    story += plan_pages if plan_pages is not None else roadmap_pages(source, st, content_width)
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
            title=f"BusinessMRI.mn {source.get('reportId', '')}",
            author="BusinessMRI.mn",
            subject=f"{GENERATOR_VERSION} {source.get('payloadHash', '')}",
            creator=GENERATOR_VERSION,
            pageCompression=1,
        )
        try:
            doc.build(
                build_story(source, st, content_width),
                onFirstPage=lambda c, d: page_header_footer(c, d, source, st),
                onLaterPages=lambda c, d: page_header_footer(c, d, source, st),
                canvasmaker=annotated_canvas_factory(source),
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
