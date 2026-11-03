"""Optimisation de découpe : placement des pièces sur feuilles commerciales.

Algorithme guillotine par bandes (First-Fit Decreasing Height) avec
rotation 90° et trait de scie. Les pièces sont groupées par
(matière, épaisseur) : un groupe = un type de feuille = une série de
feuilles remplies.

Chaque feuille est remplie par bandes horizontales empilées de bas en
haut, chaque bande de gauche à droite — découpes guillotine compatibles
avec une scie à format.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from ..models import Cabinet

DEFAULT_KERF = 4.0


@dataclass
class NestingPiece:
    label: str
    ref: str
    w: float
    h: float


@dataclass
class NestingPlacement:
    x: float
    y: float
    w: float
    h: float
    rotated: bool
    label: str


class _Shelf:
    __slots__ = ("y", "height", "cursor")

    def __init__(self, y: float, height: float):
        self.y = y
        self.height = height
        self.cursor = 0.0


class _Sheet:
    __slots__ = ("shelves", "next_y", "placements")

    def __init__(self):
        self.shelves: List[_Shelf] = []
        self.next_y = 0.0
        self.placements: List[NestingPlacement] = []


def pack_group(
    pieces: List[NestingPiece],
    sheet_width: float,
    sheet_length: float,
    kerf: float = DEFAULT_KERF,
) -> List[List[NestingPlacement]]:
    """Place toutes les pièces ; renvoie la liste des feuilles (placements)."""
    usable_w = float(sheet_width)
    usable_h = float(sheet_length)

    ordered = sorted(
        pieces,
        key=lambda p: (-max(p.w, p.h), -min(p.w, p.h), p.label),
    )

    sheets: List[_Sheet] = []

    def orientations(piece: NestingPiece):
        # orientation naturelle d'abord, puis tournée de 90°
        yield piece.w, piece.h, False
        if piece.h != piece.w:
            yield piece.h, piece.w, True

    def new_shelf(sheet: _Sheet, piece: NestingPiece) -> Optional[NestingPlacement]:
        for pw, ph, rotated in orientations(piece):
            if pw <= usable_w and sheet.next_y + ph <= usable_h:
                shelf = _Shelf(sheet.next_y, ph)
                sheet.shelves.append(shelf)
                sheet.next_y += ph + kerf
                placement = NestingPlacement(0.0, shelf.y, pw, ph, rotated, piece.label)
                sheet.placements.append(placement)
                shelf.cursor = pw + kerf
                return placement
        return None

    for piece in ordered:
        # 1) meilleur emplacement dans une bande existante :
        #    déchet vertical minimal, puis première feuille
        best: Optional[Tuple[float, int, _Shelf, NestingPlacement]] = None
        for sheet_index, sheet in enumerate(sheets):
            for shelf in sheet.shelves:
                for pw, ph, rotated in orientations(piece):
                    if shelf.cursor + pw <= usable_w and ph <= shelf.height:
                        score = (shelf.height - ph, sheet_index)
                        if best is None or score < (best[0], best[1]):
                            placement = NestingPlacement(
                                shelf.cursor, shelf.y, pw, ph, rotated, piece.label
                            )
                            best = (score[0], sheet_index, shelf, placement)
        if best is not None:
            _score, _sheet_index, shelf, placement = best
            shelf.cursor = placement.x + placement.w + kerf
            sheets[_sheet_index].placements.append(placement)
            continue

        # 2) nouvelle bande dans une feuille existante (la plus récente d'abord)
        for sheet_index in range(len(sheets) - 1, -1, -1):
            if new_shelf(sheets[sheet_index], piece) is not None:
                break
        else:
            # 3) nouvelle feuille
            sheet = _Sheet()
            sheets.append(sheet)
            placement = new_shelf(sheet, piece)
            assert placement is not None, "pièce plus grande que la feuille"

    return [[p for p in sheet.placements] for sheet in sheets]


def build_nesting(cabinet: Cabinet, kerf: float = DEFAULT_KERF) -> Dict:
    """Optimisation de débit pour les panneaux d'un seul caisson."""
    return _nesting_from_panels(cabinet.panels.select_related("material"), kerf)


def build_nesting_multi(cabinets, kerf: float = DEFAULT_KERF) -> Dict:
    """Optimisation de débit combinée pour plusieurs caissons."""
    panels = []
    for cabinet in cabinets:
        panels.extend(cabinet.panels.select_related("material"))
    return _nesting_from_panels(panels, kerf)


def _nesting_from_panels(panels_iterable, kerf: float = DEFAULT_KERF) -> Dict:
    """Calcule l'optimisation de débit pour des panneaux donnés.

    Renvoie un dictionnaire exploitable par l'interface et les exports PDF.
    """
    groups: Dict[Tuple[int, float], Dict] = {}
    for panel in panels_iterable:
        material = panel.material
        key = (material.pk, round(float(panel.thickness), 2))
        group = groups.setdefault(
            key,
            {
                "material": material,
                "thickness": float(panel.thickness),
                "pieces": [],
                "pieces_area": 0.0,
            },
        )
        for index in range(panel.quantity):
            group["pieces"].append(
                NestingPiece(
                    label=f"{panel.name} {index + 1}",
                    ref=panel.name,
                    w=float(panel.width),
                    h=float(panel.length),
                )
            )
        group["pieces_area"] += panel.area_m2

    results: List[Dict] = []
    total_sheets = 0
    total_cost = 0.0
    total_pieces_area = 0.0
    total_sheets_area = 0.0

    for key in sorted(
        groups, key=lambda k: (groups[k]["material"].name, groups[k]["thickness"])
    ):
        group = groups[key]
        material = group["material"]
        sheet_w = float(material.sheet_width)
        sheet_h = float(material.sheet_length)
        sheets = pack_group(group["pieces"], sheet_w, sheet_h, kerf=kerf)

        sheet_area = sheet_w * sheet_h / 1_000_000.0
        sheets_area = sheet_area * len(sheets)
        pieces_area = group["pieces_area"]
        utilization = pieces_area / sheets_area if sheets_area else 0.0
        cost = sheets_area * float(material.price_per_m2)

        results.append(
            {
                "material": material.name,
                "material_id": material.pk,
                "color": material.color,
                "thickness": group["thickness"],
                "sheet_width": round(sheet_w, 1),
                "sheet_length": round(sheet_h, 1),
                "sheet_count": len(sheets),
                "piece_count": len(group["pieces"]),
                "pieces_area_m2": round(pieces_area, 3),
                "sheets_area_m2": round(sheets_area, 3),
                "utilization": round(utilization, 4),
                "waste_percent": round((1.0 - utilization) * 100.0, 1),
                "cost": round(cost, 2),
                "kerf": kerf,
                "sheets": [
                    {
                        "placements": [
                            {
                                "x": round(p.x, 1),
                                "y": round(p.y, 1),
                                "w": round(p.w, 1),
                                "h": round(p.h, 1),
                                "rotated": p.rotated,
                                "label": p.label,
                            }
                            for p in sheet_placements
                        ]
                    }
                    for sheet_placements in sheets
                ],
            }
        )
        total_sheets += len(sheets)
        total_cost += cost
        total_pieces_area += pieces_area
        total_sheets_area += sheets_area

    overall = total_pieces_area / total_sheets_area if total_sheets_area else 0.0
    return {
        "ok": True,
        "kerf": kerf,
        "groups": results,
        "total_sheets": total_sheets,
        "total_cost": round(total_cost, 2),
        "total_pieces_area_m2": round(total_pieces_area, 3),
        "total_sheets_area_m2": round(total_sheets_area, 3),
        "total_utilization": round(overall, 4),
        "total_waste_percent": round((1.0 - overall) * 100.0, 1),
    }
