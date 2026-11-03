"""Exports PDF : croquis 2D (élévation avant + vue de dessus) et liste de débit.

Toutes les cotes sont exprimées en centimètres (stockage interne en mm).
Le croquis reprend la mise en plan de l'onglet « Croquis 2D » de l'éditeur :
panneaux en fil de fer, chaînes de cotes rouges avec flèches, lignes de
rappel grises et cotes d'ensemble.
"""
from __future__ import annotations

import base64
import binascii
import math
import re
from io import BytesIO
from typing import List, Optional, Tuple

from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image as RLImage, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import Cabinet, CompanyProfile, RoomOpening
from .scene import _cabinet_boxes, _volume_boxes
from .engine.nesting import build_nesting

DIM = colors.HexColor("#dc2626")
EXT = colors.HexColor("#9aa7b5")
INK = colors.HexColor("#1f2937")
DASH_STROKE = colors.HexColor("#7c8794")
MUTED = colors.HexColor("#5b6774")
SUBTITLE_INK = colors.HexColor("#475569")
TITLE_INK = colors.HexColor("#334155")

APPLIANCE_COLORS = {
    "sink": "#cbd5e1",
    "hob": "#1f2937",
    "hood": "#94a3b8",
    "oven": "#475569",
    "fridge": "#e2e8f0",
    "dishwasher": "#cbd5e1",
    "microwave": "#64748b",
    "washing_machine": "#e2e8f0",
    "other": "#d1d5db",
}

PAGE_W_MM = 210.0
MARGIN_MM = 12.0
LEFT_ZONE_MM = 32.0
RIGHT_ZONE_MM = 22.0
DRAW_W_MAX = PAGE_W_MM - 2 * MARGIN_MM - LEFT_ZONE_MM - RIGHT_ZONE_MM


def _cm(value: float, digits: int = 1) -> str:
    """mm → chaîne en cm avec virgule décimale française."""
    return f"{value / 10.0:.{digits}f}".replace(".", ",")


def _num(value: float, digits: int = 2) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def _fit_text(text: str, font: str, size: float, max_mm: float) -> str:
    """Tronque un texte avec « ... » pour tenir dans une largeur donnée."""
    text = text or ""
    if stringWidth(text, font, size) / mm <= max_mm:
        return text
    while text and stringWidth(text + "...", font, size) / mm > max_mm:
        text = text[:-1]
    return (text.rstrip() + "...") if text else ""


def _safe_hex(value: Optional[str], fallback: str = "#ffffff"):
    try:
        return colors.HexColor(str(value or fallback))
    except Exception:
        return colors.HexColor(fallback)


# ----------------------------------------------------------------------
# Intervalles (panneaux pleins / espaces libres)
# ----------------------------------------------------------------------

def _merged_intervals(intervals):
    solids = sorted((a, b) if a <= b else (b, a) for a, b in intervals if abs(b - a) > 0.5)
    merged: List[List[float]] = []
    for start, end in solids:
        if merged and start <= merged[-1][1] + 0.5:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged


def _gaps(merged, lo: float, hi: float) -> List[Tuple[float, float]]:
    gaps: List[Tuple[float, float]] = []
    cursor = lo
    for start, end in merged:
        if start - cursor > 0.5:
            gaps.append((cursor, start))
        cursor = max(cursor, end)
    if hi - cursor > 0.5:
        gaps.append((cursor, hi))
    return gaps


def _spans_full(gaps: List[Tuple[float, float]], lo: float, hi: float) -> bool:
    return len(gaps) == 1 and gaps[0][0] - lo < 0.5 and hi - gaps[0][1] < 0.5


# ----------------------------------------------------------------------
# Primitives de dessin (coordonnées en mm, converties en points)
# ----------------------------------------------------------------------

def _line_mm(c, x1, y1, x2, y2, color, width_pt=0.5):
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(width_pt)
    c.line(x1 * mm, y1 * mm, x2 * mm, y2 * mm)
    c.restoreState()


def _arrow_mm(c, x, y, dx, dy, color=DIM, length=1.7, half=0.85):
    base_x = x - dx * length
    base_y = y - dy * length
    perp_x = -dy * half
    perp_y = dx * half
    p = c.beginPath()
    p.moveTo(x * mm, y * mm)
    p.lineTo((base_x + perp_x) * mm, (base_y + perp_y) * mm)
    p.lineTo((base_x - perp_x) * mm, (base_y - perp_y) * mm)
    p.close()
    c.saveState()
    c.setFillColor(color)
    c.drawPath(p, fill=1, stroke=0)
    c.restoreState()


def _text_mm(c, x, y, text, *, size, color, font="Helvetica",
             centered=False, bold=False, italic=False, halo=False, right=False):
    if bold:
        font = "Helvetica-Bold" if font == "Helvetica" else f"{font}-Bold"
    if italic:
        font = "Helvetica-Oblique" if font == "Helvetica" else f"{font}-Oblique"
    c.saveState()
    if halo:
        width = stringWidth(text, font, size) / mm
        c.setFillColor(colors.white)
        if centered:
            c.rect((x - width / 2 - 0.7) * mm, (y - 1.1) * mm,
                   (width + 1.4) * mm, (size / 2.834 + 1.7) * mm, fill=1, stroke=0)
    c.setFillColor(color)
    c.setFont(font, size)
    if centered:
        c.drawCentredString(x * mm, y * mm, text)
    elif right:
        c.drawRightString(x * mm, y * mm, text)
    else:
        c.drawString(x * mm, y * mm, text)
    c.restoreState()


def _text_rotated_mm(c, x, y, text, *, size, color, bold=False, halo=False):
    font = "Helvetica-Bold" if bold else "Helvetica"
    c.saveState()
    if halo:
        width = stringWidth(text, font, size) / mm
        c.setFillColor(colors.white)
        c.rect((x - size / 2.834 / 2 - 0.7) * mm, (y - width / 2 - 0.7) * mm,
               (size / 2.834 + 1.4) * mm, (width + 1.4) * mm, fill=1, stroke=0)
    c.setFillColor(color)
    c.setFont(font, size)
    c.translate(x * mm, y * mm)
    c.rotate(90)
    c.drawCentredString(0, 0, text)
    c.restoreState()


def _rect_mm(c, x, y, w, h, *, stroke, fill=None, fill_alpha=1.0, dashed=False,
             width_pt=0.7):
    c.saveState()
    if dashed:
        c.setDash(1.1 * mm, 0.75 * mm)
    c.setStrokeColor(stroke)
    c.setLineWidth(width_pt)
    if fill is not None:
        c.setFillColor(fill)
        c.setFillAlpha(fill_alpha)
        c.rect(x * mm, y * mm, w * mm, h * mm, stroke=1, fill=1)
    else:
        c.rect(x * mm, y * mm, w * mm, h * mm, stroke=1, fill=0)
    c.restoreState()


# ----------------------------------------------------------------------
# Cotes (chaînes et ensembles) — portage de la logique de l'éditeur
# ----------------------------------------------------------------------

def _chain_h(c, gaps, to_x, chain_y, draw_top):
    if not gaps:
        return
    segments = [(to_x(a), to_x(b), _cm(b - a)) for a, b in gaps]
    levels: List[float] = []
    labels = []
    for x1, x2, label in segments:
        width = stringWidth(label, "Helvetica", 7) / mm + 1.4
        cx = (x1 + x2) / 2
        level = 0
        while level < len(levels) and levels[level] + 1.2 > cx - width / 2:
            level += 1
        if level == len(levels):
            levels.append(float("-inf"))
        levels[level] = cx + width / 2
        labels.append((cx, chain_y + 4.0 + level * 8.5, label))
    for x1, x2, _label in segments:
        _line_mm(c, x1, chain_y, x2, chain_y, DIM, 0.6)
        narrow = (x2 - x1) < 7.5
        _arrow_mm(c, x1, chain_y, 1.0 if narrow else -1.0, 0.0)
        _arrow_mm(c, x2, chain_y, -1.0 if narrow else 1.0, 0.0)
    for cx, y, label in labels:
        _text_mm(c, cx, y, label, size=7, color=DIM, centered=True, halo=True)
    for edge in sorted({edge for gap in gaps for edge in gap}):
        x = to_x(edge)
        _line_mm(c, x, chain_y - 1.2, x, draw_top, EXT, 0.4)


def _chain_v(c, gaps, to_y, chain_x, draw_left):
    """Chaîne verticale à gauche du dessin (segments triés du haut vers le bas)."""
    if not gaps:
        return
    segments = []
    for a, b in gaps:
        ya, yb = to_y(a), to_y(b)
        top = max(ya, yb)
        bottom = min(ya, yb)
        segments.append((top, bottom, _cm(b - a)))
    segments.sort(key=lambda item: -item[0])

    levels: List[float] = []
    labels = []
    for top, bottom, label in segments:
        width = stringWidth(label, "Helvetica", 7) / mm + 1.4
        mid = (top + bottom) / 2
        level = 0
        # chevauchement si le bas de l'étiquette précédente dépasse le haut de la nouvelle
        while level < len(levels) and levels[level] - 1.2 < mid + width / 2:
            level += 1
        if level == len(levels):
            levels.append(float("inf"))
        levels[level] = mid - width / 2
        labels.append((chain_x - 4.0 - level * 8.5, mid, label))
    for top, bottom, _label in segments:
        _line_mm(c, chain_x, top, chain_x, bottom, DIM, 0.6)
        narrow = (top - bottom) < 7.5
        _arrow_mm(c, chain_x, top, 0.0, -1.0 if narrow else 1.0)
        _arrow_mm(c, chain_x, bottom, 0.0, 1.0 if narrow else -1.0)
    for x, mid, label in labels:
        _text_rotated_mm(c, x, mid, label, size=7, color=DIM, halo=True)
    for edge in sorted({edge for gap in gaps for edge in gap}):
        y = to_y(edge)
        _line_mm(c, chain_x + 1.2, y, draw_left, y, EXT, 0.4)


def _total_h(c, y_line, x1, x2, draw_top, label):
    _line_mm(c, x1, y_line, x2, y_line, DIM, 0.8)
    _arrow_mm(c, x1, y_line, -1.0, 0.0)
    _arrow_mm(c, x2, y_line, 1.0, 0.0)
    _line_mm(c, x1, y_line - 1.2, x1, draw_top, EXT, 0.4)
    _line_mm(c, x2, y_line - 1.2, x2, draw_top, EXT, 0.4)
    _text_mm(c, (x1 + x2) / 2, y_line + 4.0, label, size=8.5, color=DIM,
             centered=True, bold=True, halo=True)


def _total_v(c, x_line, y_top, y_bottom, draw_right, label):
    _line_mm(c, x_line, y_top, x_line, y_bottom, DIM, 0.8)
    _arrow_mm(c, x_line, y_top, 0.0, 1.0)
    _arrow_mm(c, x_line, y_bottom, 0.0, -1.0)
    _line_mm(c, draw_right, y_top, x_line - 1.2, y_top, EXT, 0.4)
    _line_mm(c, draw_right, y_bottom, x_line - 1.2, y_bottom, EXT, 0.4)
    _text_rotated_mm(c, x_line + 4.5, (y_top + y_bottom) / 2, label, size=8.5,
                     color=DIM, bold=True, halo=True)


# ----------------------------------------------------------------------
# Croquis 2D
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Identité de l'atelier (logo + coordonnées)
# ----------------------------------------------------------------------

def _logo_image(profile):
    """The profile's logo (a PNG or JPEG data URL, apps/catalog) as a file for reportlab, or None."""
    match = re.match(r"^data:image/(png|jpeg);base64,(.+)$", profile.logo or "", re.S)
    if not match:
        return None
    try:
        return BytesIO(base64.b64decode(match.group(2)))
    except (ValueError, binascii.Error):
        return None


def _company_profile():
    try:
        profile = CompanyProfile.load()
        if profile.name or profile.logo or profile.phone or profile.email:
            return profile
    except Exception:
        pass
    return None


def _brand_header_canvas(c) -> bool:
    """Logo en haut à gauche + coordonnées en haut à droite (PDF canvas)."""
    profile = _company_profile()
    if profile is None:
        return False
    if profile.logo:
        try:
            reader = ImageReader(_logo_image(profile))
            iw, ih = reader.getSize()
            if iw and ih:
                w_mm = iw / 2.834
                h_mm = ih / 2.834
                scale = min(36.0 / w_mm, 13.5 / h_mm)
                w, h = w_mm * scale, h_mm * scale
                c.drawImage(
                    reader, MARGIN_MM * mm, (285.0 - h - 1.5) * mm,
                    width=w * mm, height=h * mm, mask="auto",
                )
        except Exception:
            pass
    lines = []
    if profile.name:
        lines.append((profile.name, True))
    if profile.address:
        lines.append((profile.address, False))
    contact = " · ".join(bit for bit in (profile.phone, profile.email) if bit)
    if contact:
        lines.append((contact, False))
    if profile.website:
        lines.append((profile.website, False))
    y = 283.5
    for text, is_bold in lines[:4]:
        _text_mm(
            c, PAGE_W_MM - MARGIN_MM, y, text,
            size=8.5 if is_bold else 7.2,
            color=TITLE_INK if is_bold else MUTED,
            bold=is_bold, right=True,
        )
        y -= 4.3
    return True


def _brand_paragraphs(styles):
    """Bloc d'en-tête Platypus : logo à gauche, coordonnées à droite."""
    profile = _company_profile()
    if profile is None:
        return []
    contact = "<br/>".join(
        escape(bit)
        for bit in (profile.address, profile.phone, profile.email, profile.website)
        if bit
    )
    logo_cell = ""
    if profile.logo:
        try:
            reader = ImageReader(_logo_image(profile))
            iw, ih = reader.getSize()
            if iw and ih:
                w_mm = iw / 2.834
                h_mm = ih / 2.834
                scale = min(30.0 / w_mm, 12.0 / h_mm)
                logo_cell = RLImage(
                    _logo_image(profile),
                    width=(w_mm * scale) * mm,
                    height=(h_mm * scale) * mm,
                )
        except Exception:
            logo_cell = ""
    name_style = ParagraphStyle(
        "brand_name", fontName="Helvetica-Bold", fontSize=10, textColor=INK
    )
    contact_style = ParagraphStyle(
        "brand_contact", fontName="Helvetica", fontSize=7.5,
        textColor=MUTED, alignment=2,
    )
    left = Paragraph(escape(profile.name), name_style) if not logo_cell else logo_cell
    right = Paragraph(
        f"<b>{escape(profile.name)}</b><br/>{contact}" if logo_cell else contact,
        contact_style,
    )
    if not contact and not logo_cell:
        return []
    brand = Table(
        [[left, "", right]],
        colWidths=[40 * mm, 102 * mm, 40 * mm],
    )
    brand.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return [brand]


def _box_category(box: dict) -> Optional[Tuple[str, str]]:
    kind = box["kind"]
    if kind == "carcass":
        return "Carcasse", box.get("color") or "#ffffff"
    if box.get("label") == "Étagère":
        return "Étagères", box.get("color") or "#ffffff"
    if kind == "divider":
        return "Séparations / côtés", box.get("color") or "#ffffff"
    if kind == "plinth":
        return "Plinthe", box.get("color") or "#b08d57"
    if kind in ("foot", "base", "skirt"):
        return "Zone externe", box.get("color") or "#b08d57"
    if kind == "back":
        return "Fond", box.get("color") or "#a88964"
    if kind == "door":
        return "Façades", box.get("color") or "#ffffff"
    return None


def build_sketch_pdf(cabinet: Cabinet) -> HttpResponse:
    volumes = list(cabinet.internal_volumes.select_related("parent").all())
    components = list(cabinet.components.select_related("material", "volume").all())
    all_boxes = _cabinet_boxes(cabinet) + _volume_boxes(volumes, components, cabinet)

    elev_boxes = [box for box in all_boxes if box["kind"] not in ("back", "door", "volume")]
    if not elev_boxes:
        return HttpResponse(
            "Aucun élément à dessiner pour ce caisson.",
            status=400,
            content_type="text/plain; charset=utf-8",
        )

    strips = [
        box for box in all_boxes
        if (box["kind"] == "carcass" and box.get("side") in ("left", "right"))
        or (box["kind"] == "divider" and box["h"] > box["w"])
    ]
    back_boxes = [box for box in all_boxes if box["kind"] == "back"]
    doors = [box for box in all_boxes if box["kind"] == "door"]
    dashed = [
        box for box in all_boxes
        if box["kind"] == "shelf" or (box["kind"] == "divider" and box["h"] <= box["w"])
    ]

    elev_min_x = min(box["x"] for box in elev_boxes)
    elev_max_x = max(box["x"] + box["w"] for box in elev_boxes)
    elev_min_y = min(box["y"] for box in elev_boxes)
    elev_max_y = max(box["y"] + box["h"] for box in elev_boxes)
    total_w_elev = max(1.0, elev_max_x - elev_min_x)
    total_h_elev = max(1.0, elev_max_y - elev_min_y)

    top_refs = strips + back_boxes + doors
    has_top_view = bool(top_refs)
    total_w_top = total_h_top = 1.0
    top_min_x = top_max_x = top_min_z = top_max_z = 0.0
    if has_top_view:
        top_min_x = min(box["x"] for box in top_refs)
        top_max_x = max(box["x"] + box["w"] for box in top_refs)
        top_min_z = min(box["z"] for box in top_refs)
        top_max_z = max(box["z"] + box["d"] for box in top_refs)
        total_w_top = max(1.0, top_max_x - top_min_x)
        total_h_top = max(1.0, top_max_z - top_min_z)

    # Échelle commune aux deux vues
    max_width = max(total_w_elev, total_w_top)
    height_budget = 163.0 if has_top_view else 205.0
    scale = min(DRAW_W_MAX / max_width, height_budget / (total_h_elev + total_h_top))

    def draw_left(total_w: float) -> float:
        return MARGIN_MM + LEFT_ZONE_MM + (DRAW_W_MAX - total_w * scale) / 2

    buffer = BytesIO()
    c = pdf_canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Croquis 2D — {cabinet.name}")
    _brand_header_canvas(c)

    # --- en-tête --------------------------------------------------------
    _text_mm(c, PAGE_W_MM / 2, 280.0, f"Croquis 2D — {cabinet.name}",
             size=13, color=TITLE_INK, centered=True, bold=True)
    _text_mm(
        c, PAGE_W_MM / 2, 271.5,
        f"L {_cm(cabinet.width)} × H {_cm(cabinet.height)} × P {_cm(cabinet.depth)} cm"
        f"  ·  {timezone.localdate().strftime('%d/%m/%Y')}",
        size=9, color=MUTED, centered=True,
    )

    legend_items: List[Tuple[str, str]] = []
    for box in all_boxes:
        category = _box_category(box)
        if category and category not in legend_items:
            legend_items.append(category)
    if legend_items:
        widths = [stringWidth(label, "Helvetica", 8) / mm + 9.0 for _, label in legend_items]
        x = (PAGE_W_MM - sum(widths)) / 2
        for (label, color_hex), width in zip(legend_items, widths):
            _rect_mm(c, x, 263.0, 3.2, 2.4,
                     stroke=colors.HexColor("#b6b0a4"), fill=colors.HexColor(color_hex))
            _text_mm(c, x + 4.6, 263.0, label, size=8, color=MUTED)
            x += width

    # --- élévation avant -------------------------------------------------
    draw_top_elev = 219.5
    draw_h_elev = total_h_elev * scale
    draw_bottom_elev = draw_top_elev - draw_h_elev
    draw_l_elev = draw_left(total_w_elev)
    draw_r_elev = draw_l_elev + total_w_elev * scale

    def ex(x):
        return draw_l_elev + (x - elev_min_x) * scale

    def ey(y):
        return draw_bottom_elev + (y - elev_min_y) * scale

    _text_mm(c, PAGE_W_MM / 2, 256.5, "Élévation avant", size=10,
             color=SUBTITLE_INK, centered=True, bold=True)

    for box in elev_boxes:
        is_carcass = box["kind"] == "carcass"
        _rect_mm(c, ex(box["x"]), ey(box["y"]), box["w"] * scale, box["h"] * scale,
                 stroke=INK, fill=colors.HexColor(box.get("color") or "#ffffff"),
                 fill_alpha=0.16 if is_carcass else 0.4)

    v_panels = [[box["x"], box["x"] + box["w"]] for box in elev_boxes if box["h"] > box["w"]]
    h_panels = [[box["y"], box["y"] + box["h"]] for box in elev_boxes if box["w"] >= box["h"]]
    x_gaps = _gaps(_merged_intervals(v_panels), elev_min_x, elev_max_x)
    y_gaps = _gaps(_merged_intervals(h_panels), elev_min_y, elev_max_y)

    chain_y = draw_top_elev + 18.0
    total_y = draw_top_elev + 27.0
    chain_x = draw_l_elev - 15.0
    total_hx = draw_r_elev + 13.0

    if v_panels and not _spans_full(x_gaps, elev_min_x, elev_max_x):
        _chain_h(c, x_gaps, ex, chain_y, draw_top_elev)
    if h_panels and not _spans_full(y_gaps, elev_min_y, elev_max_y):
        _chain_v(c, y_gaps, ey, chain_x, draw_l_elev)
    _total_h(c, total_y, draw_l_elev, draw_r_elev, draw_top_elev, f"{_cm(total_w_elev)} cm")
    _total_v(c, total_hx, draw_top_elev, draw_bottom_elev, draw_r_elev,
             f"{_cm(total_h_elev)} cm")

    # --- vue de dessus ----------------------------------------------------
    if has_top_view:
        subtitle_top = draw_bottom_elev - 7.5
        draw_top_top = subtitle_top - 30.0
        draw_h_top = total_h_top * scale
        draw_bottom_top = draw_top_top - draw_h_top
        draw_l_top = draw_left(total_w_top)
        draw_r_top = draw_l_top + total_w_top * scale

        def tx(x):
            return draw_l_top + (x - top_min_x) * scale

        def tz(z):
            # arrière (z bas) en haut de la vue, avant (z haut) en bas
            return draw_bottom_top + (top_max_z - z) * scale

        _text_mm(c, PAGE_W_MM / 2, subtitle_top, "Vue de dessus", size=10,
                 color=SUBTITLE_INK, centered=True, bold=True)

        for box in back_boxes:
            _rect_mm(c, tx(box["x"]), tz(box["z"] + box["d"]), box["w"] * scale,
                     box["d"] * scale, stroke=INK,
                     fill=colors.HexColor(box.get("color") or "#a88964"), fill_alpha=0.4)
        for box in strips:
            _rect_mm(c, tx(box["x"]), tz(box["z"] + box["d"]), box["w"] * scale,
                     box["d"] * scale, stroke=INK,
                     fill=colors.HexColor(box.get("color") or "#ffffff"),
                     fill_alpha=0.16 if box["kind"] == "carcass" else 0.4)
        for box in doors:
            _rect_mm(c, tx(box["x"]), tz(box["z"] + box["d"]), box["w"] * scale,
                     box["d"] * scale, stroke=EXT,
                     fill=colors.HexColor(box.get("color") or "#ffffff"), fill_alpha=0.18)
        for box in dashed:
            _rect_mm(c, tx(box["x"]), tz(box["z"] + box["d"]), box["w"] * scale,
                     box["d"] * scale, stroke=DASH_STROKE, dashed=True)

        z_solids = [[box["z"], box["z"] + box["d"]] for box in back_boxes + doors]
        z_gaps = _gaps(_merged_intervals(z_solids), top_min_z, top_max_z)
        chain_z_x = draw_l_top - 15.0
        if z_solids and not _spans_full(z_gaps, top_min_z, top_max_z):
            _chain_v(c, z_gaps, tz, chain_z_x, draw_l_top)
        _total_v(c, draw_r_top + 13.0, draw_top_top, draw_bottom_top, draw_r_top,
                 f"{_cm(total_h_top)} cm")

        # jeu avant des étagères
        if dashed and strips:
            front_z = max(box["z"] + box["d"] for box in dashed)
            carcass_front = max(box["z"] + box["d"] for box in strips)
            if carcass_front - front_z > 1.0:
                x_dim = draw_r_top - 12.0
                y_front = tz(front_z)
                y_carcass = tz(carcass_front)
                y_hi = max(y_front, y_carcass)
                y_lo = min(y_front, y_carcass)
                _line_mm(c, x_dim, y_hi, x_dim, y_lo, DIM, 0.6)
                narrow = (y_hi - y_lo) < 7.5
                _arrow_mm(c, x_dim, y_hi, 0.0, -1.0 if narrow else 1.0)
                _arrow_mm(c, x_dim, y_lo, 0.0, 1.0 if narrow else -1.0)
                _text_rotated_mm(c, x_dim - 4.0, (y_hi + y_lo) / 2,
                                 _cm(carcass_front - front_z), size=7, color=DIM, halo=True)

        _text_mm(c, (draw_l_top + draw_r_top) / 2, draw_bottom_top - 7.0, "Avant",
                 size=8, color=MUTED, centered=True, italic=True)

    _text_mm(c, MARGIN_MM, 6.0,
             f"poly_3D · croquis généré le {timezone.localdate().strftime('%d/%m/%Y')}",
             size=7.5, color=MUTED)

    c.showPage()
    c.save()

    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="croquis-{cabinet.pk}.pdf"'
    return response


# ----------------------------------------------------------------------
# Liste de débit (cm)
# ----------------------------------------------------------------------

def build_cutlist_pdf(cabinet: Cabinet) -> HttpResponse:
    panels = list(cabinet.panels.select_related("material"))
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=16 * mm, bottomMargin=16 * mm,
        title=f"Liste de débit — {cabinet.name}",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("cutlist_title", parent=styles["Title"],
                                 fontSize=16, spaceAfter=2)
    subtitle_style = ParagraphStyle("cutlist_subtitle", parent=styles["Normal"],
                                    fontSize=9, textColor=MUTED, spaceAfter=8,
                                    alignment=1)
    total_style = ParagraphStyle("cutlist_total", parent=styles["Normal"],
                                 fontSize=10.5, textColor=INK, spaceBefore=10)
    header_cell = ParagraphStyle("cutlist_header", fontName="Helvetica-Bold",
                                 fontSize=8, leading=10, textColor=colors.white,
                                 alignment=1)
    body_cell = ParagraphStyle("cutlist_body", fontName="Helvetica",
                               fontSize=8.5, leading=10.5, textColor=INK)
    num_cell = ParagraphStyle("cutlist_num", parent=body_cell, alignment=2)

    elems = _brand_paragraphs(styles) + [
        Paragraph(f"Liste de débit — {escape(cabinet.name)}", title_style),
        Paragraph(
            f"Caisson « {escape(cabinet.name)} » · "
            f"L {_cm(cabinet.width)} × H {_cm(cabinet.height)} × P {_cm(cabinet.depth)} cm"
            f" · {timezone.localdate().strftime('%d/%m/%Y')}",
            subtitle_style,
        ),
    ]

    header = ["Référence", "Catégorie", "Matériau",
              "Long. (cm)", "Larg. (cm)", "Épais. (cm)", "Qté", "Chant"]
    rows = [[Paragraph(escape(cell), header_cell) for cell in header]]
    for panel in panels:
        category = (panel.get_category_display()
                    if hasattr(panel, "get_category_display") else panel.category)
        rows.append([
            Paragraph(escape(panel.name), body_cell),
            Paragraph(escape(str(category)), body_cell),
            Paragraph(escape(panel.material.name), body_cell),
            Paragraph(_cm(panel.length), num_cell),
            Paragraph(_cm(panel.width), num_cell),
            Paragraph(_cm(panel.thickness), num_cell),
            Paragraph(str(panel.quantity), num_cell),
            Paragraph(escape(panel.edge_banding or "—"), body_cell),
        ])

    total_qty = sum(panel.quantity for panel in panels)
    total_area = sum(panel.area_m2 for panel in panels)
    total_cost = sum(panel.cost for panel in panels)

    table = Table(rows, colWidths=[36 * mm, 22 * mm, 32 * mm, 17 * mm, 17 * mm,
                                   17 * mm, 10 * mm, 24 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (3, 0), (6, -1), "RIGHT"),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c8c2b6")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor("#0b5d56")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f4ef")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    elems.append(table)
    elems.append(Spacer(1, 4))
    elems.append(Paragraph(
        f"<b>Total : {total_qty} panneau(x)</b> · surface {_num(total_area)} m²"
        f" · coût matière {_num(total_cost)} €",
        total_style,
    ))

    doc.build(elems)

    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="liste-debit-{cabinet.pk}.pdf"'
    return response


# ----------------------------------------------------------------------
# Optimisation de découpe (diagrammes de feuilles)
# ----------------------------------------------------------------------

def build_nesting_pdf(cabinet: Cabinet) -> HttpResponse:
    from .engine.nesting import build_nesting as compute

    data = compute(cabinet)
    return _nesting_pdf_response(data, cabinet.name, f"optimisation-{cabinet.pk}.pdf")


def build_project_nesting_pdf(project) -> HttpResponse:
    from .engine.nesting import build_nesting_multi
    from .project import project_cabinets

    data = build_nesting_multi(project_cabinets(project))
    return _nesting_pdf_response(
        data, f"{project.name} — {project.client_name}",
        f"optimisation-projet-{project.pk}.pdf",
    )


def _nesting_pdf_response(data, doc_title, filename) -> HttpResponse:
    groups = data.get("groups", [])
    if not groups:
        return HttpResponse(
            "Aucun panneau à optimiser.",
            status=400,
            content_type="text/plain; charset=utf-8",
        )

    buffer = BytesIO()
    c = pdf_canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Optimisation de découpe — {doc_title}")
    _brand_header_canvas(c)

    usable_w = PAGE_W_MM - 2 * MARGIN_MM

    # --- page 1 : synthèse ---------------------------------------------
    _text_mm(c, PAGE_W_MM / 2, 280.0, f"Optimisation de découpe — {doc_title}",
             size=13, color=TITLE_INK, centered=True, bold=True)
    _text_mm(
        c, PAGE_W_MM / 2, 271.5,
        f"Trait de scie {data['kerf']:g} mm · {timezone.localdate().strftime('%d/%m/%Y')}",
        size=9, color=MUTED, centered=True,
    )
    _text_mm(c, PAGE_W_MM / 2, 258.0,
             f"{data['total_sheets']} feuille(s) · utilisation {_num(data['total_utilization'] * 100, 1)} %"
             f" · chute {_num(data['total_waste_percent'], 1)} % · coût matière {_num(data['total_cost'])} €",
             size=10, color=INK, centered=True, bold=True)

    header = ["Matière", "Épais. (mm)", "Feuilles", "Pièces", "Utilisation", "Coût"]
    rows = [header]
    for group in groups:
        rows.append([
            escape(group["material"]),
            f"{group['thickness']:g}",
            str(group["sheet_count"]),
            str(group["piece_count"]),
            f"{_num(group['utilization'] * 100, 1)} %",
            f"{_num(group['cost'])} €",
        ])

    table = Table(rows, colWidths=[56 * mm, 22 * mm, 20 * mm, 18 * mm, 32 * mm, 30 * mm])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c8c2b6")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f4ef")]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    c.saveState()
    table.wrapOn(c, usable_w * mm, 200 * mm)
    table.drawOn(c, MARGIN_MM * mm, 235 * mm)
    c.restoreState()

    _text_mm(c, MARGIN_MM, 225.0,
             "Diagrammes de découpe (une vignette = une feuille, pièces en cm) :",
             size=9.5, color=SUBTITLE_INK, bold=True)

    # --- diagrammes ------------------------------------------------------
    card_w = (usable_w - 8) / 2
    card_h = 92.0
    col = 0
    row_y = 222.0
    sheet_no = 0
    total_sheets = data["total_sheets"]

    for group in groups:
        color = colors.HexColor(group.get("color") or "#ffffff")
        for sheet in group["sheets"]:
            sheet_no += 1
            if row_y - card_h < MARGIN_MM:
                c.showPage()
                row_y = 280.0
            x0 = MARGIN_MM + col * (card_w + 8)
            y0 = row_y - card_h
            # en-tête de vignette
            _text_mm(
                c, x0 + 2, y0 + card_h - 4,
                f"{group['material']} · {group['thickness']:g} mm — feuille {sheet_no}/{total_sheets}",
                size=7, color=MUTED,
            )
            # cadre feuille à l'échelle
            pad_top = 9.0
            draw_w = card_w - 4
            draw_h = card_h - pad_top - 4
            scale = min(draw_w / group["sheet_width"], draw_h / group["sheet_length"])
            fw = group["sheet_width"] * scale
            fh = group["sheet_length"] * scale
            fx = x0 + 2 + (draw_w - fw) / 2
            fy = y0 + 2 + (draw_h - fh) / 2
            _rect_mm(c, fx, fy, fw, fh, stroke=INK, fill=colors.HexColor("#f6f4ef"))
            for p in sheet["placements"]:
                _rect_mm(
                    c, fx + p["x"] * scale, fy + p["y"] * scale,
                    p["w"] * scale, p["h"] * scale,
                    stroke=INK, fill=color, fill_alpha=0.55,
                )
                label_w = p["w"] * scale
                label_h = p["h"] * scale
                if label_w >= 14 and label_h >= 7:
                    _text_mm(
                        c, fx + p["x"] * scale + label_w / 2, fy + p["y"] * scale + label_h / 2 - 1.2,
                        f"{_cm(p['w'])} × {_cm(p['h'])}", size=5.5, color=INK, centered=True,
                    )
                if label_w >= 20 and label_h >= 13:
                    _text_mm(
                        c, fx + p["x"] * scale + label_w / 2, fy + p["y"] * scale + label_h / 2 + 1.8,
                        p["label"], size=5.5, color=SUBTITLE_INK, centered=True,
                    )
            col += 1
            if col == 2:
                col = 0
                row_y -= card_h + 8

    _text_mm(
        c, MARGIN_MM, 6.0,
        f"poly_3D · optimisation générée le {timezone.localdate().strftime('%d/%m/%Y')}"
        f" · dimensions des pièces en cm",
        size=7.5, color=MUTED,
    )
    c.showPage()
    c.save()

    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


# ----------------------------------------------------------------------
# Exports combinés pour les projets (multi-caissons)
# ----------------------------------------------------------------------

def build_project_sketch_pdf(project) -> HttpResponse:
    """Élévation de l'assemblage complet (caissons côte à côte)."""
    from .project import project_boxes, project_layout, project_stats

    all_boxes, stats = project_boxes(project)
    elev_boxes = [b for b in all_boxes if b["kind"] not in ("back", "door", "volume")]
    if not elev_boxes:
        return HttpResponse(
            "Aucun caisson dans cette affaire.",
            status=400,
            content_type="text/plain; charset=utf-8",
        )

    min_x = min(b["x"] for b in elev_boxes)
    max_x = max(b["x"] + b["w"] for b in elev_boxes)
    min_y = min(b["y"] for b in elev_boxes)
    max_y = max(b["y"] + b["h"] for b in elev_boxes)
    total_w = max(1.0, max_x - min_x)
    total_h = max(1.0, max_y - min_y)

    scale = min(DRAW_W_MAX / total_w, 200.0 / total_h)
    draw_w = total_w * scale
    draw_h = total_h * scale
    draw_l = MARGIN_MM + LEFT_ZONE_MM + (DRAW_W_MAX - draw_w) / 2
    draw_r = draw_l + draw_w
    draw_t = 219.5
    draw_b = draw_t - draw_h

    def ex(x):
        return draw_l + (x - min_x) * scale

    def ey(y):
        return draw_b + (y - min_y) * scale

    buffer = BytesIO()
    c = pdf_canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Croquis — {project.name}")
    _brand_header_canvas(c)

    _text_mm(c, PAGE_W_MM / 2, 280.0, f"Affaire — {project.name}",
             size=13, color=TITLE_INK, centered=True, bold=True)
    _text_mm(
        c, PAGE_W_MM / 2, 271.5,
        f"Client : {escape(project.client_name)} · {stats['cabinet_count']} caisson(s)"
        f" · L {_cm(total_w)} × H {_cm(total_h)} cm"
        f" · {timezone.localdate().strftime('%d/%m/%Y')}",
        size=9, color=MUTED, centered=True,
    )

    legend_items: List[Tuple[str, str]] = []
    for box in all_boxes:
        category = _box_category(box)
        if category and category not in legend_items:
            legend_items.append(category)
    if legend_items:
        widths = [stringWidth(lbl, "Helvetica", 8) / mm + 9.0 for _, lbl in legend_items]
        x = (PAGE_W_MM - sum(widths)) / 2
        for (label, color_hex), width in zip(legend_items, widths):
            _rect_mm(c, x, 263.0, 3.2, 2.4,
                     stroke=colors.HexColor("#b6b0a4"), fill=colors.HexColor(color_hex))
            _text_mm(c, x + 4.6, 263.0, label, size=8, color=MUTED)
            x += width

    _text_mm(c, PAGE_W_MM / 2, 256.5, "Élévation de l'assemblage", size=10,
             color=SUBTITLE_INK, centered=True, bold=True)

    for box in elev_boxes:
        is_carcass = box["kind"] == "carcass"
        _rect_mm(c, ex(box["x"]), ey(box["y"]), box["w"] * scale, box["h"] * scale,
                 stroke=INK, fill=colors.HexColor(box.get("color") or "#ffffff"),
                 fill_alpha=0.16 if is_carcass else 0.4)

    # noms des caissons sous le dessin
    for entry in project_layout(project):
        cabinet = entry["cabinet"]
        cx = ex(entry["offset_x"] + float(cabinet.width) / 2)
        _text_mm(c, cx, draw_b - 5.0, escape(cabinet.name),
                 size=7.5, color=SUBTITLE_INK, centered=True)

    v_panels = [[b["x"], b["x"] + b["w"]] for b in elev_boxes if b["h"] > b["w"]]
    x_gaps = _gaps(_merged_intervals(v_panels), min_x, max_x)
    chain_y = draw_t + 18.0
    total_y = draw_t + 27.0
    if v_panels and not _spans_full(x_gaps, min_x, max_x):
        _chain_h(c, x_gaps, ex, chain_y, draw_t)
    _total_h(c, total_y, draw_l, draw_r, draw_t, f"{_cm(total_w)} cm")
    _total_v(c, draw_r + 13.0, draw_t, draw_b, draw_r, f"{_cm(total_h)} cm")

    _text_mm(c, MARGIN_MM, 6.0,
             f"poly_3D · croquis d'affaire généré le {timezone.localdate().strftime('%d/%m/%Y')}",
             size=7.5, color=MUTED)
    c.showPage()
    c.save()

    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="croquis-projet-{project.pk}.pdf"'
    return response


APPLIANCE_BADGES = {
    "sink": "Évier",
    "hob": "Plaque",
    "hood": "Hotte",
    "oven": "Four",
    "fridge": "Froid",
    "dishwasher": "Lave-v.",
    "microwave": "Micro-ondes",
    "washing_machine": "Lave-linge",
    "other": "Appareil",
}

DARK_APPLIANCE_KINDS = {"hob", "oven", "microwave"}


def _draw_appliance_symbol(c, appliance, center_x, center_y, width_mm, depth_mm):
    """Emprise + symbole technique d'un appareil, orientés dans la pièce."""
    kind = appliance.kind
    fill = _safe_hex(APPLIANCE_COLORS.get(kind, "#d1d5db"))
    dark = kind in DARK_APPLIANCE_KINDS
    ink = colors.white if dark else colors.HexColor("#1f2937")
    w = max(2.0, width_mm)
    d = max(2.0, depth_mm)

    c.saveState()
    c.translate(center_x * mm, center_y * mm)
    c.rotate(-float(appliance.rotation or 0))
    c.setFillColor(fill)
    c.setFillAlpha(0.55 if kind == "hood" else 0.72)
    c.setStrokeColor(colors.HexColor("#1f2937"))
    c.setLineWidth(0.7)
    if kind == "hood":
        c.setDash(1.3 * mm, 0.8 * mm)
    c.rect(-w / 2 * mm, -d / 2 * mm, w * mm, d * mm, fill=1, stroke=1)
    c.setDash()

    c.setStrokeColor(ink)
    c.setLineWidth(0.6)
    if kind == "sink":
        c.rect(-0.32 * w * mm, -0.26 * d * mm, 0.64 * w * mm, 0.52 * d * mm,
               fill=0, stroke=1)
        c.circle(0, 0, max(0.5, min(w, d) * 0.055) * mm, fill=0, stroke=1)
    elif kind == "hob":
        radius = max(0.7, min(w, d) * 0.09)
        for sx in (-0.21, 0.21):
            for sy in (-0.18, 0.18):
                c.circle(sx * w * mm, sy * d * mm, radius * mm, fill=0, stroke=1)
    elif kind == "hood":
        c.setDash(0.8 * mm, 0.6 * mm)
        c.rect(-0.36 * w * mm, -0.3 * d * mm, 0.72 * w * mm, 0.6 * d * mm,
               fill=0, stroke=1)
        c.setDash()
        p = c.beginPath()
        p.moveTo(-0.18 * w * mm, 0.12 * d * mm)
        p.lineTo(0, 0.26 * d * mm)
        p.lineTo(0.18 * w * mm, 0.12 * d * mm)
        c.drawPath(p, fill=0, stroke=1)
    elif kind == "fridge":
        c.line(-0.05 * w * mm, -0.45 * d * mm, -0.05 * w * mm, 0.45 * d * mm)
        c.line(0.02 * w * mm, 0.08 * d * mm, 0.14 * w * mm, 0.08 * d * mm)
        c.line(0.02 * w * mm, -0.12 * d * mm, 0.14 * w * mm, -0.12 * d * mm)
    elif kind == "oven":
        c.rect(-0.3 * w * mm, -0.32 * d * mm, 0.6 * w * mm, 0.5 * d * mm,
               fill=0, stroke=1)
        c.line(-0.3 * w * mm, 0.1 * d * mm, 0.3 * w * mm, 0.1 * d * mm)
        c.circle(-0.2 * w * mm, 0.24 * d * mm, 0.035 * max(w, d) * mm,
                 fill=0, stroke=1)
        c.circle(0.2 * w * mm, 0.24 * d * mm, 0.035 * max(w, d) * mm,
                 fill=0, stroke=1)
    elif kind in {"dishwasher", "washing_machine"}:
        c.circle(0, -0.06 * d * mm, max(0.7, min(w, d) * 0.24) * mm,
                 fill=0, stroke=1)
        c.rect(-0.3 * w * mm, 0.28 * d * mm, 0.6 * w * mm, 0.08 * d * mm,
               fill=0, stroke=1)
    elif kind == "microwave":
        c.rect(-0.34 * w * mm, -0.26 * d * mm, 0.5 * w * mm, 0.52 * d * mm,
               fill=0, stroke=1)
        c.rect(0.2 * w * mm, -0.26 * d * mm, 0.14 * w * mm, 0.52 * d * mm,
               fill=0, stroke=1)
    else:
        c.line(-0.28 * w * mm, -0.28 * d * mm, 0.28 * w * mm, 0.28 * d * mm)
        c.line(-0.28 * w * mm, 0.28 * d * mm, 0.28 * w * mm, -0.28 * d * mm)
    c.restoreState()

    badge = APPLIANCE_BADGES.get(kind, "Appareil")
    badge_size = 5.4 if min(w, d) >= 8.0 else 4.6
    if w >= 9.0 and d >= 6.0:
        _text_mm(
            c, center_x, center_y - 0.7,
            _fit_text(badge, "Helvetica-Bold", badge_size, w - 2.0),
            size=badge_size, color=colors.white if dark else INK,
            centered=True, bold=True,
        )


def _draw_room_appliance_sheet(
    c, project, appliances, worktops, outside_ids, warnings
):
    """Page 2 du plan de pièce : appareils, plans de travail et contrôles."""
    _brand_header_canvas(c)
    _text_mm(
        c, PAGE_W_MM / 2, 280.0,
        f"Appareils et plans de travail — {project.name}",
        size=13, color=TITLE_INK, centered=True, bold=True,
    )
    _text_mm(
        c, PAGE_W_MM / 2, 271.5,
        f"Client : {project.client_name} · {len(appliances)} appareil(s)"
        f" · {len(worktops)} plan(s) de travail"
        f" · {timezone.localdate().strftime('%d/%m/%Y')}",
        size=9, color=MUTED, centered=True,
    )

    y = 258.0
    _text_mm(c, MARGIN_MM, y, "Plans de travail", size=10,
             color=SUBTITLE_INK, bold=True)
    y -= 6.0
    for x, label in (
        (MARGIN_MM, "Repère"),
        (58.0, "Hauteur (cm)"),
        (88.0, "Épaisseur (cm)"),
        (122.0, "Surface (cm)"),
    ):
        _text_mm(c, x, y, label, size=7, color=MUTED, bold=True)
    _line_mm(c, MARGIN_MM, y - 1.4, PAGE_W_MM - MARGIN_MM, y - 1.4, EXT, 0.4)
    y -= 5.2
    if worktops:
        for index, worktop in enumerate(worktops):
            _text_mm(c, MARGIN_MM, y,
                     f"Plan {index + 1} · rotation {_cm(worktop['rotation'], 0)}°",
                     size=7.2, color=INK)
            _text_mm(c, 58.0, y, f"{_cm(worktop['height'], 0)}",
                     size=7.2, color=INK)
            _text_mm(c, 88.0, y, f"{_cm(worktop['thickness'], 1)}",
                     size=7.2, color=INK)
            _text_mm(c, 122.0, y, f"{_cm(worktop['surface'], 0)}",
                     size=7.2, color=INK)
            y -= 4.4
    else:
        _text_mm(c, MARGIN_MM, y,
                 "Aucun plan de travail : posez au moins un caisson bas.",
                 size=7.2, color=MUTED, italic=True)
        y -= 4.4

    y -= 8.0
    _text_mm(c, MARGIN_MM, y, "Appareils posés", size=10,
             color=SUBTITLE_INK, bold=True)
    y -= 6.0
    for x, label in (
        (MARGIN_MM, "Appareil"),
        (62.0, "Type"),
        (92.0, "Dimensions (cm)"),
        (136.0, "Position X / Y (cm)"),
        (176.0, "Élévation (cm)"),
    ):
        _text_mm(c, x, y, label, size=7, color=MUTED, bold=True)
    _text_mm(c, PAGE_W_MM - MARGIN_MM, y, "Prix", size=7, color=MUTED,
             bold=True, right=True)
    _line_mm(c, MARGIN_MM, y - 1.4, PAGE_W_MM - MARGIN_MM, y - 1.4, EXT, 0.4)
    y -= 5.2
    if appliances:
        for appliance in appliances[:18]:
            is_outside = appliance.pk in outside_ids
            label = ("! " if is_outside else "") + str(appliance)
            _text_mm(
                c, MARGIN_MM, y,
                _fit_text(label, "Helvetica", 7.2, 46.0),
                size=7.2, color=DIM if is_outside else INK,
            )
            _text_mm(c, 62.0, y,
                     _fit_text(appliance.get_kind_display(), "Helvetica", 7.2, 27.0),
                     size=7.2, color=INK)
            _text_mm(
                c, 92.0, y,
                f"{_cm(appliance.width, 0)} × {_cm(appliance.height, 0)}"
                f" × {_cm(appliance.depth, 0)}",
                size=7.2, color=INK,
            )
            _text_mm(
                c, 136.0, y,
                f"{_cm(appliance.pos_x, 0)} / {_cm(appliance.pos_y, 0)}",
                size=7.2, color=INK,
            )
            elevation = (
                f"+{_cm(appliance.elevation, 0)}"
                if float(appliance.elevation) > 0.5 else "—"
            )
            _text_mm(c, 176.0, y, elevation, size=7.2, color=INK)
            _text_mm(
                c, PAGE_W_MM - MARGIN_MM, y,
                f"{_num(float(appliance.price), 2)} €",
                size=7.2, color=INK, right=True,
            )
            y -= 4.4
        if len(appliances) > 18:
            _text_mm(c, MARGIN_MM, y - 1.0,
                     f"+ {len(appliances) - 18} autre(s) appareil(s).",
                     size=7, color=MUTED, italic=True)
            y -= 4.4
    else:
        _text_mm(c, MARGIN_MM, y, "Aucun appareil posé dans la pièce.",
                 size=7.2, color=MUTED, italic=True)
        y -= 4.4

    if outside_ids:
        _text_mm(
            c, MARGIN_MM, y - 2.0,
            f"! {len(outside_ids)} appareil(s) hors pièce, non représenté(s) "
            "sur le plan.",
            size=7, color=DIM, italic=True,
        )
        y -= 6.0

    y -= 8.0
    _text_mm(c, MARGIN_MM, y, "Contrôles ergonomiques", size=10,
             color=SUBTITLE_INK, bold=True)
    y -= 6.0
    if warnings:
        for warning in warnings[:8]:
            _text_mm(
                c, MARGIN_MM, y,
                _fit_text(f"• {warning['message']}", "Helvetica", 7.2, 180.0),
                size=7.2, color=DIM,
            )
            y -= 4.2
        if len(warnings) > 8:
            _text_mm(c, MARGIN_MM, y,
                     f"+ {len(warnings) - 8} autre(s) alerte(s) dans l'éditeur.",
                     size=7, color=MUTED, italic=True)
            y -= 4.2
    else:
        _text_mm(c, MARGIN_MM, y, "Aucune alerte : l'implantation respecte les règles.",
                 size=7.2, color=MUTED, italic=True)
        y -= 4.2

    _text_mm(
        c, MARGIN_MM, 6.0,
        f"poly_3D · fiche appareils générée le "
        f"{timezone.localdate().strftime('%d/%m/%Y')} · cotes en cm",
        size=7.5, color=MUTED,
    )


def build_room_sketch_pdf(project) -> HttpResponse:
    """Plan de pièce vu de dessus : murs, ouvertures et emprises des caissons."""
    from .room import (
        _point_in_polygon,
        appliance_corners,
        compute_worktops,
        ensure_room,
        item_corners,
        project_warnings,
        room_area_m2,
        room_polygon,
        wall_length,
    )

    walls = list(project.walls.all())
    if not walls:
        walls = ensure_room(project)
    polygon = room_polygon(project)
    if len(polygon) < 3:
        return HttpResponse(
            "La pièce ne possède pas de contour exploitable.",
            status=400,
            content_type="text/plain; charset=utf-8",
        )

    items = list(
        project.items.select_related(
            "cabinet", "cabinet__material_carcase"
        ).order_by("slot", "id")
    )
    openings = list(
        project.openings.select_related("wall").order_by("wall__index", "offset", "id")
    )
    appliances = list(project.appliances.all())
    worktops = compute_worktops(project)
    wall_by_id = {wall.pk: wall for wall in walls}

    drawable_items = []
    outside_items = []
    for item in items:
        if all(
            _point_in_polygon(x, y, polygon) for x, y in item_corners(item)
        ):
            drawable_items.append(item)
        else:
            outside_items.append(item)

    drawable_appliances = []
    outside_appliances = []
    for appliance in appliances:
        if all(
            _point_in_polygon(x, y, polygon)
            for x, y in appliance_corners(appliance)
        ):
            drawable_appliances.append(appliance)
        else:
            outside_appliances.append(appliance)

    xs = [float(point[0]) for point in polygon]
    ys = [float(point[1]) for point in polygon]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    room_w = max(1.0, max_x - min_x)
    room_d = max(1.0, max_y - min_y)
    centroid_x = sum(xs) / len(xs)
    centroid_y = sum(ys) / len(ys)

    plan_left = MARGIN_MM + 18.0
    plan_right = PAGE_W_MM - MARGIN_MM - 18.0
    plan_top = 244.0
    plan_bottom = 100.0
    scale = min(
        (plan_right - plan_left) / room_w,
        (plan_top - plan_bottom) / room_d,
    )
    draw_w = room_w * scale
    draw_h = room_d * scale
    draw_l = plan_left + ((plan_right - plan_left) - draw_w) / 2.0
    draw_t = plan_bottom + ((plan_top - plan_bottom) + draw_h) / 2.0
    draw_r = draw_l + draw_w
    draw_b = draw_t - draw_h

    def ex(x: float) -> float:
        return draw_l + (x - min_x) * scale

    def ey(y: float) -> float:
        return draw_t - (y - min_y) * scale

    def inward_normal(wall) -> Tuple[float, float]:
        length = wall_length(wall)
        if length < 1e-6:
            return 0.0, 0.0
        ux = (float(wall.x2) - float(wall.x1)) / length
        uy = (float(wall.y2) - float(wall.y1)) / length
        nx, ny = -uy, ux
        mx = (float(wall.x1) + float(wall.x2)) / 2.0
        my = (float(wall.y1) + float(wall.y2)) / 2.0
        if (centroid_x - mx) * nx + (centroid_y - my) * ny < 0:
            nx, ny = -nx, -ny
        return nx, ny

    buffer = BytesIO()
    c = pdf_canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Plan de pièce — {project.name}")
    _brand_header_canvas(c)

    _text_mm(
        c, PAGE_W_MM / 2, 280.0, f"Plan de pièce — {project.name}",
        size=13, color=TITLE_INK, centered=True, bold=True,
    )
    _text_mm(
        c, PAGE_W_MM / 2, 271.5,
        f"Client : {project.client_name} · {project.get_room_type_display()}"
        f" · {_cm(room_w)} × {_cm(room_d)} cm · {_num(room_area_m2(project), 2)} m²"
        f" · {len(items)} caisson(s) · {len(appliances)} appareil(s)"
        f" · {timezone.localdate().strftime('%d/%m/%Y')}",
        size=9, color=MUTED, centered=True,
    )

    accent = colors.HexColor("#2078CF")
    legend = [
        ("Caisson", "box"),
        ("Façade", "front"),
        ("Plan de travail", "worktop"),
        ("Appareil", "appliance"),
        ("Ouverture", "opening"),
    ]
    widths = [stringWidth(label, "Helvetica", 8) / mm + 9.0 for label, _ in legend]
    lx = (PAGE_W_MM - sum(widths)) / 2.0
    for (label, kind), width in zip(legend, widths):
        if kind == "box":
            _rect_mm(c, lx, 261.4, 3.2, 2.4, stroke=INK,
                     fill=colors.HexColor("#eef2f6"))
        elif kind == "front":
            _line_mm(c, lx, 262.6, lx + 3.2, 262.6, accent, 1.4)
        elif kind == "worktop":
            _rect_mm(c, lx, 261.4, 3.2, 2.4, stroke=colors.HexColor("#a89f8f"),
                     fill=colors.HexColor("#d9d2c5"), dashed=True)
        elif kind == "appliance":
            _rect_mm(c, lx, 261.4, 3.2, 2.4, stroke=INK,
                     fill=colors.HexColor("#cbd5e1"))
        else:
            _rect_mm(c, lx, 261.4, 3.2, 2.4, stroke=DASH_STROKE,
                     fill=colors.white, dashed=True)
        _text_mm(c, lx + 4.6, 262.1, label, size=8, color=MUTED)
        lx += width

    # Fond de pièce et contour des murs
    c.saveState()
    c.setFillColor(colors.HexColor("#f8fafc"))
    c.setStrokeColor(INK)
    c.setLineWidth(2.2)
    path = c.beginPath()
    path.moveTo(ex(polygon[0][0]) * mm, ey(polygon[0][1]) * mm)
    for x, y in polygon[1:]:
        path.lineTo(ex(x) * mm, ey(y) * mm)
    path.close()
    c.drawPath(path, fill=1, stroke=1)
    c.restoreState()

    # Ouvertures : masque blanc puis symbole (porte / fenêtre / passage)
    for opening in openings:
        wall = wall_by_id.get(opening.wall_id)
        if wall is None:
            continue
        length = wall_length(wall)
        if length < 1e-6:
            continue
        ux = (float(wall.x2) - float(wall.x1)) / length
        uy = (float(wall.y2) - float(wall.y1)) / length
        offset = max(0.0, float(opening.offset))
        width = max(0.0, float(opening.width))
        start_x = float(wall.x1) + ux * offset
        start_y = float(wall.y1) + uy * offset
        end_x = float(wall.x1) + ux * (offset + width)
        end_y = float(wall.y1) + uy * (offset + width)
        sx, sy = ex(start_x), ey(start_y)
        tx, ty = ex(end_x), ey(end_y)
        _line_mm(c, sx, sy, tx, ty, colors.white, 3.6)
        nx, ny = inward_normal(wall)
        pnx, pny = nx, -ny

        if opening.kind == RoomOpening.KIND_DOOR:
            leaf = width * scale
            leaf_x = sx + pnx * leaf
            leaf_y = sy + pny * leaf
            _line_mm(c, sx, sy, leaf_x, leaf_y, MUTED, 0.8)
            start_angle = math.degrees(math.atan2(pny, pnx))
            end_angle = math.degrees(math.atan2(-uy, ux))
            extent = ((end_angle - start_angle + 180.0) % 360.0) - 180.0
            if abs(extent) > 1e-6 and leaf > 0.5:
                c.saveState()
                c.setStrokeColor(MUTED)
                c.setLineWidth(0.6)
                c.arc(
                    (sx - leaf) * mm, (sy - leaf) * mm,
                    (sx + leaf) * mm, (sy + leaf) * mm,
                    startAng=start_angle, extent=extent,
                )
                c.restoreState()
        elif opening.kind == RoomOpening.KIND_WINDOW:
            for shift in (-1.2, 1.2):
                _line_mm(
                    c, sx + pnx * shift, sy + pny * shift,
                    tx + pnx * shift, ty + pny * shift,
                    SUBTITLE_INK, 0.7,
                )
        else:
            c.saveState()
            c.setStrokeColor(EXT)
            c.setLineWidth(0.7)
            c.setDash(1.0 * mm, 0.8 * mm)
            c.line(sx * mm, sy * mm, tx * mm, ty * mm)
            c.restoreState()

        label = opening.name or opening.get_kind_display()
        # À l'extérieur de la pièce : évite de recouvrir les caissons posés
        # contre le mur.
        _text_mm(
            c, (sx + tx) / 2.0 - pnx * 7.0, (sy + ty) / 2.0 - pny * 7.0,
            label, size=6.8, color=SUBTITLE_INK, centered=True, halo=True,
        )

    # Plans de travail (sous les caissons et les appareils)
    for worktop in worktops:
        corners = [(ex(x), ey(y)) for x, y in worktop["corners"]]
        c.saveState()
        c.setFillColor(_safe_hex(worktop["color"], "#d9d2c5"))
        c.setFillAlpha(0.55)
        c.setStrokeColor(colors.HexColor("#a89f8f"))
        c.setLineWidth(0.6)
        c.setDash(1.2 * mm, 0.8 * mm)
        path = c.beginPath()
        path.moveTo(corners[0][0] * mm, corners[0][1] * mm)
        for x, y in corners[1:]:
            path.lineTo(x * mm, y * mm)
        path.close()
        c.drawPath(path, fill=1, stroke=1)
        c.restoreState()

    # Emprises des caissons (uniquement ceux entièrement dans la pièce)
    for item in drawable_items:
        corners = [(ex(x), ey(y)) for x, y in item_corners(item)]
        c.saveState()
        c.setFillColor(_safe_hex(item.cabinet.material_carcase.color))
        c.setFillAlpha(0.24)
        c.setStrokeColor(INK)
        c.setLineWidth(0.8)
        path = c.beginPath()
        path.moveTo(corners[0][0] * mm, corners[0][1] * mm)
        for x, y in corners[1:]:
            path.lineTo(x * mm, y * mm)
        path.close()
        c.drawPath(path, fill=1, stroke=1)
        c.restoreState()

        # Bord avant (côté façades) : repère bleu
        _line_mm(
            c, corners[3][0], corners[3][1],
            corners[2][0], corners[2][1], accent, 1.1,
        )

    # Étiquettes regroupées par position : des caissons superposés (meuble
    # haut au-dessus d'un meuble bas) partagent la même emprise et seraient
    # illisibles s'ils étaient libellés séparément.
    label_groups: List[Dict] = []
    for item in drawable_items:
        key = (
            round(float(item.pos_x), 0),
            round(float(item.pos_y), 0),
            round(float(item.rotation) % 360.0, 1),
        )
        group = next((g for g in label_groups if g["key"] == key), None)
        if group is None:
            group = {"key": key, "items": []}
            label_groups.append(group)
        group["items"].append(item)

    for group in label_groups:
        points = [
            (ex(x), ey(y))
            for item in group["items"]
            for x, y in item_corners(item)
        ]
        left = min(point[0] for point in points)
        right = max(point[0] for point in points)
        top = max(point[1] for point in points)
        bottom = min(point[1] for point in points)
        center_x = (left + right) / 2.0
        center_y = (top + bottom) / 2.0
        max_text = max(6.0, (right - left) * 0.9)
        group_items = group["items"]

        if len(group_items) == 1:
            item = group_items[0]
            label = _fit_text(item.cabinet.name, "Helvetica-Bold", 6.4, max_text)
            _text_mm(
                c, center_x, center_y + 0.8, label, size=6.4,
                color=INK, centered=True, bold=True, halo=True,
            )
            if float(item.elevation) > 0.5:
                _text_mm(
                    c, center_x, center_y - 2.6,
                    f"+{_cm(float(item.elevation), 0)}", size=6.0,
                    color=SUBTITLE_INK, centered=True, halo=True,
                )
            continue

        visible = group_items[:3]
        line_height = 3.0
        start_y = center_y + (len(visible) - 1) * line_height / 2.0
        for index, item in enumerate(visible):
            label = _fit_text(item.cabinet.name, "Helvetica-Bold", 5.8, max_text)
            _text_mm(
                c, center_x, start_y - index * line_height, label,
                size=5.8, color=INK, centered=True, bold=True, halo=True,
            )
        if len(group_items) > len(visible):
            _text_mm(
                c, center_x, start_y - len(visible) * line_height,
                f"+{len(group_items) - len(visible)}", size=5.6,
                color=SUBTITLE_INK, centered=True, halo=True,
            )

    # Appareils : symbole technique et repère court. Ils sont dessinés après
    # les caissons car un évier ou une plaque recouvre le caisson qui le porte.
    for appliance in drawable_appliances:
        corners = [(ex(x), ey(y)) for x, y in appliance_corners(appliance)]
        center_x = sum(point[0] for point in corners) / 4.0
        center_y = sum(point[1] for point in corners) / 4.0
        width_mm = math.hypot(
            corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]
        )
        depth_mm = math.hypot(
            corners[3][0] - corners[0][0], corners[3][1] - corners[0][1]
        )
        _draw_appliance_symbol(
            c, appliance, center_x, center_y, width_mm, depth_mm
        )

    # Longueurs des murs sans ouverture (pour ne pas surcharger)
    walls_with_openings = {opening.wall_id for opening in openings}
    for wall in walls:
        if wall.pk in walls_with_openings:
            continue
        length = wall_length(wall)
        if length < 1.0:
            continue
        mx = (float(wall.x1) + float(wall.x2)) / 2.0
        my = (float(wall.y1) + float(wall.y2)) / 2.0
        nx, ny = inward_normal(wall)
        _text_mm(
            c, ex(mx) - nx * 4.8, ey(my) + ny * 4.8,
            f"{_cm(length, 0)} cm", size=7, color=MUTED,
            centered=True, halo=True,
        )

    _total_h(c, draw_t + 14.0, draw_l, draw_r, draw_t, f"{_cm(room_w)} cm")
    _total_v(c, draw_r + 14.0, draw_t, draw_b, draw_r, f"{_cm(room_d)} cm")

    # Liste compacte des caissons
    notes = []
    if outside_items:
        notes.append(
            f"{len(outside_items)} caisson(s) hors pièce non représenté(s) sur le plan (!)"
        )
    if outside_appliances:
        notes.append(
            f"{len(outside_appliances)} appareil(s) hors pièce non représenté(s) (!)"
        )
    if any(len(group["items"]) > 1 for group in label_groups):
        notes.append("les caissons superposés partagent la même emprise")
    if appliances:
        notes.append("détail des appareils et plans de travail en page 2")
    if notes:
        note_text = " · ".join(notes)
        note_text = note_text[:1].upper() + note_text[1:] + "."
        _text_mm(
            c, MARGIN_MM, 96.0, note_text, size=7,
            color=DIM if (outside_items or outside_appliances) else MUTED,
            italic=True,
        )
    _text_mm(c, MARGIN_MM, 92.0, "Caissons posés", size=9,
             color=SUBTITLE_INK, bold=True)
    header_y = 86.0
    for x, label in (
        (MARGIN_MM, "Caisson"),
        (72.0, "Dimensions (cm)"),
        (116.0, "Position X / Y (cm)"),
        (166.0, "Élévation (cm)"),
    ):
        _text_mm(c, x, header_y, label, size=7, color=MUTED, bold=True)
    _line_mm(c, MARGIN_MM, header_y - 1.6, PAGE_W_MM - MARGIN_MM,
             header_y - 1.6, EXT, 0.4)

    row_y = 81.5
    max_rows = 16
    outside_ids = {item.pk for item in outside_items}
    for item in items[:max_rows]:
        cabinet = item.cabinet
        is_outside = item.pk in outside_ids
        label = ("! " if is_outside else "") + cabinet.name
        _text_mm(
            c, MARGIN_MM, row_y,
            _fit_text(label, "Helvetica", 7.2, 55.0),
            size=7.2, color=DIM if is_outside else INK,
        )
        _text_mm(
            c, 72.0, row_y,
            f"{_cm(float(cabinet.width), 0)} × {_cm(float(cabinet.height), 0)}"
            f" × {_cm(float(cabinet.depth), 0)}",
            size=7.2, color=INK,
        )
        _text_mm(
            c, 116.0, row_y,
            f"{_cm(float(item.pos_x), 0)} / {_cm(float(item.pos_y), 0)}",
            size=7.2, color=INK,
        )
        elevation = (
            f"+{_cm(float(item.elevation), 0)}"
            if float(item.elevation) > 0.5 else "—"
        )
        _text_mm(c, 166.0, row_y, elevation, size=7.2, color=INK)
        row_y -= 4.5
    if len(items) > max_rows:
        _text_mm(
            c, MARGIN_MM, row_y - 1.0,
            f"+ {len(items) - max_rows} autre(s) caisson(s) — voir la liste de débit.",
            size=7, color=MUTED, italic=True,
        )
    elif not items:
        _text_mm(c, MARGIN_MM, row_y, "Aucun caisson posé dans la pièce.",
                 size=7.2, color=MUTED, italic=True)

    _text_mm(
        c, MARGIN_MM, 6.0,
        f"poly_3D · plan de pièce généré le {timezone.localdate().strftime('%d/%m/%Y')}"
        " · cotes en cm",
        size=7.5, color=MUTED,
    )
    c.showPage()
    if appliances:
        _draw_room_appliance_sheet(
            c,
            project,
            appliances,
            worktops,
            {appliance.pk for appliance in outside_appliances},
            project_warnings(project),
        )
        c.showPage()
    c.save()

    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="plan-piece-projet-{project.pk}.pdf"'
    return response


def build_project_cutlist_pdf(project) -> HttpResponse:
    """Liste de débit combinée : tous les panneaux de l'affaire, en cm."""
    from .project import project_cabinets

    cabinets = project_cabinets(project)
    panels = []
    for cabinet in cabinets:
        panels.extend(cabinet.panels.select_related("material", "cabinet"))
    if not panels:
        return HttpResponse(
            "Aucun panneau dans cette affaire.",
            status=400,
            content_type="text/plain; charset=utf-8",
        )

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=12 * mm, rightMargin=12 * mm,
        topMargin=16 * mm, bottomMargin=16 * mm,
        title=f"Liste de débit — {project.name}",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("pcut_title", parent=styles["Title"],
                                 fontSize=16, spaceAfter=2)
    subtitle_style = ParagraphStyle("pcut_sub", parent=styles["Normal"],
                                    fontSize=9, textColor=MUTED, spaceAfter=8, alignment=1)
    header_cell = ParagraphStyle("pcut_header", fontName="Helvetica-Bold",
                                 fontSize=7.5, leading=9, textColor=colors.white, alignment=1)
    body_cell = ParagraphStyle("pcut_body", fontName="Helvetica",
                               fontSize=8, leading=9.5, textColor=INK)
    num_cell = ParagraphStyle("pcut_num", parent=body_cell, alignment=2)

    elems = _brand_paragraphs(styles) + [
        Paragraph(f"Liste de débit — {escape(project.name)}", title_style),
        Paragraph(
            f"Client : {escape(project.client_name)} · {len(cabinets)} caisson(s)"
            f" · {timezone.localdate().strftime('%d/%m/%Y')}",
            subtitle_style,
        ),
    ]
    header = ["Caisson", "Référence", "Catégorie", "Matériau",
              "Long. (cm)", "Larg. (cm)", "Épais. (cm)", "Qté", "Chant"]
    rows = [[Paragraph(escape(cell), header_cell) for cell in header]]
    total_qty = 0
    total_area = 0.0
    total_cost = 0.0
    for panel in panels:
        category = (panel.get_category_display()
                    if hasattr(panel, "get_category_display") else panel.category)
        total_qty += panel.quantity
        total_area += panel.area_m2
        total_cost += panel.cost
        rows.append([
            Paragraph(escape(panel.cabinet.name), body_cell),
            Paragraph(escape(panel.name), body_cell),
            Paragraph(escape(str(category)), body_cell),
            Paragraph(escape(panel.material.name), body_cell),
            Paragraph(_cm(panel.length), num_cell),
            Paragraph(_cm(panel.width), num_cell),
            Paragraph(_cm(panel.thickness), num_cell),
            Paragraph(str(panel.quantity), num_cell),
            Paragraph(escape(panel.edge_banding or "—"), body_cell),
        ])

    table = Table(rows, colWidths=[24 * mm, 32 * mm, 19 * mm, 27 * mm,
                                   15 * mm, 15 * mm, 15 * mm, 9 * mm, 21 * mm],
                  repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c8c2b6")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f4ef")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    elems.append(table)
    elems.append(Spacer(1, 4))
    elems.append(Paragraph(
        f"<b>Total : {total_qty} panneau(x)</b> · surface {_num(total_area)} m²"
        f" · coût matière {_num(total_cost)} €",
        ParagraphStyle("pcut_total", parent=styles["Normal"], fontSize=10.5,
                       textColor=INK, spaceBefore=10),
    ))
    doc.build(elems)

    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="liste-debit-projet-{project.pk}.pdf"'
    return response


def build_project_quote_pdf(project) -> HttpResponse:
    """Devis d'affaire : caissons, appareils, marge et TVA du projet."""
    from .project import project_layout

    entries = project_layout(project)
    appliances = list(project.appliances.all())
    if not entries and not appliances:
        return HttpResponse(
            "Aucun article dans cette affaire.",
            status=400,
            content_type="text/plain; charset=utf-8",
        )

    materials = 0.0
    hardware = 0.0
    lines = []
    for entry in entries:
        cabinet = entry["cabinet"]
        quote = getattr(cabinet, "quote", None)
        if quote is not None:
            materials += float(quote.subtotal_materials)
            hardware += float(quote.subtotal_hardware)
            lines.append((cabinet.name, float(quote.subtotal_materials),
                          float(quote.subtotal_hardware), float(quote.total_ht)))
        else:
            cabinet_materials = sum(panel.cost for panel in cabinet.panels.all())
            materials += cabinet_materials
            lines.append((cabinet.name, cabinet_materials, 0.0, cabinet_materials))

    appliances_total = sum(float(appliance.price) for appliance in appliances)
    cost = materials + hardware + appliances_total
    margin_amount = cost * float(project.margin_percent) / 100.0
    total_ht = cost + margin_amount
    tax_amount = total_ht * float(project.tax_rate) / 100.0
    total_ttc = total_ht + tax_amount

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Devis — {project.name}",
    )
    styles = getSampleStyleSheet()
    elems = _brand_paragraphs(styles) + [
        Paragraph(f"Devis — {escape(project.name)}",
                  ParagraphStyle("pq_title", parent=styles["Title"], fontSize=17)),
        Paragraph(
            f"Client : {escape(project.client_name)} · {len(entries)} caisson(s)"
            f" · {len(appliances)} appareil(s)"
            f" · {timezone.localdate().strftime('%d/%m/%Y')}",
            ParagraphStyle("pq_sub", parent=styles["Normal"], fontSize=10,
                           textColor=MUTED, alignment=1, spaceAfter=10),
        ),
    ]

    section_style = ParagraphStyle(
        "pq_section", parent=styles["Normal"], fontSize=11.5,
        textColor=INK, spaceBefore=8, spaceAfter=4,
    )
    table_style = TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c8c2b6")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f4ef")]),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ])

    if lines:
        elems.append(Paragraph("Caissons", section_style))
        rows = [["Caisson", "Matériaux", "Quincaillerie", "Total HT"]]
        for name, mat, hard, total in lines:
            rows.append([escape(name), _num(mat), _num(hard), _num(total)])
        table = Table(rows, colWidths=[70 * mm, 34 * mm, 34 * mm, 34 * mm])
        table.setStyle(table_style)
        elems.append(table)

    if appliances:
        elems.append(Paragraph("Appareils électroménagers", section_style))
        rows = [["Appareil", "Type", "Total HT"]]
        for appliance in appliances:
            rows.append([
                escape(str(appliance)),
                escape(appliance.get_kind_display()),
                _num(float(appliance.price)),
            ])
        table = Table(rows, colWidths=[78 * mm, 52 * mm, 42 * mm])
        table.setStyle(table_style)
        elems.append(table)

    elems.append(Spacer(1, 10))

    total_style = ParagraphStyle("pq_total", parent=styles["Normal"],
                                fontSize=10.5, textColor=INK, leading=16)
    elems.append(Paragraph(
        f"<b>Matériaux</b> : {_num(materials)} €<br/>"
        f"<b>Quincaillerie</b> : {_num(hardware)} €<br/>"
        f"<b>Appareils</b> : {_num(appliances_total)} €<br/>"
        f"<b>Coût</b> : {_num(cost)} €<br/>"
        f"<b>Marge {_num(project.margin_percent, 1)} %</b> : {_num(margin_amount)} €<br/>"
        f"<b>Total HT</b> : {_num(total_ht)} €<br/>"
        f"<b>TVA {_num(project.tax_rate, 1)} %</b> : {_num(tax_amount)} €",
        total_style,
    ))
    elems.append(Spacer(1, 6))
    elems.append(Paragraph(
        f"<font size=13><b>Total TTC : {_num(total_ttc)} €</b></font>",
        ParagraphStyle("pq_ttc", parent=total_style, fontSize=13),
    ))
    doc.build(elems)

    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="devis-projet-{project.pk}.pdf"'
    return response
