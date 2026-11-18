"""
Les outils de documents, de fabrication et d'historique — plats par nature, dessinés une fois pour les trois modèles
d'icônes comme ceux de icon_models_flat.py (mêmes aides, mêmes sortes) : à plat dans Glyphe, posés sur une planche
(Studio) ou une feuille (Croquis) vues de biais.
"""
from icon_models_flat import P, box, dim, dots, turn
from icon_models_set import C, arr


def page(x0, y0, x1, y1, f=4.5):
    """A sheet with a folded corner, and its fold."""
    return P(x0, y0, x1 - f, y0, x1, y0 + f, x1, y1, x0, y1, close=True), P(x1 - f, y0, x1 - f, y0 + f, x1, y0 + f)


def rows(x0, x1, *ys):
    return "".join(P(x0, y, x1, y) for y in ys)


PAGE, FOLD = page(4, 2, 20, 22)
BUBBLE = "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4.5V16H5a2 2 0 0 1-2-2z"
BIN = P(6, 8, 18, 8, 17, 21, 7, 21, close=True)

FLAT2 = {
    # Documents
    "cutlist": [("F", PAGE), ("s", FOLD + rows(10, 17, 8, 12, 16)), ("A", box(6.5, 7, 8.5, 9) + box(6.5, 11, 8.5, 13) + box(6.5, 15, 8.5, 17))],
    "part-sheet": [("F", PAGE), ("s", FOLD), ("K", box(7, 11, 15, 17.5)), *dim(7, 11, 15, 11, 2.5)],
    "drawing": [("F", box(2, 3, 22, 21)), ("K", box(4.5, 11, 10.5, 18.5) + box(13, 11, 19, 18.5) + box(4.5, 5.5, 10.5, 9)), ("d", P(10.5, 15, 13, 15))],
    "drill-template": [("F", PAGE), ("s", FOLD + P(12, 9, 12, 19) + P(7, 14, 17, 14)), ("H", C(12, 14, 2.6)), ("A", dots(7.5, 19, 16.5, 19, 7.5, 9, r=1.2))],
    "assembly-guide": [("F", PAGE), ("s", FOLD), ("K", box(7, 15, 17, 19)), ("H", box(7, 7, 11, 11)), ("R", arr(12, 9, 12, 14, 2))],
    "labels": [("F", "M3 7a2 2 0 0 1 2-2h11l5 7-5 7H5a2 2 0 0 1-2-2z"), ("S", box(6, 8, 9, 11) + box(10, 12, 13, 15) + box(6, 13, 8, 15) + box(11, 8, 13, 10)), ("A", C(16.5, 12, 1.3))],
    "quote": [("F", PAGE), ("s", FOLD + rows(7, 13, 8, 11.5)), ("W", P(7, 16, 13, 16)), ("H", C(15.5, 17.5, 3))],
    "comments": [("K", BUBBLE), ("s", rows(7, 17, 7.5, 11))],
    "assistant": [("K", BUBBLE), ("O", "M12 4.5l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z")],
    "board": [("F", box(2, 4, 22, 20)), ("H", P(12, 7, 16.5, 9.5, 12, 12, 7.5, 9.5, close=True)), ("K", P(7.5, 9.5, 12, 12, 12, 17, 7.5, 14.5, close=True) + P(12, 12, 16.5, 9.5, 16.5, 14.5, 12, 17, close=True))],
    "tech-plan": [("F", box(2, 3, 22, 21)), ("a", P(6, 21, 6, 12, 11, 12)), ("O", C(16, 10, 2.4)), ("s", P(15.2, 9.2, 15.2, 10.8) + P(16.8, 9.2, 16.8, 10.8)), ("A", dots(6, 12, r=1.3))],
    "underlay": [("F", box(2, 4, 22, 20)), ("K", P(4, 18, 10, 10, 14, 15, 16.5, 12.5, 20, 18, close=True)), ("H", C(16.5, 8, 1.8)), ("e", P(5, 6, 19, 6, 19, 17))],
    # Fabrication
    "dxf": [("F", PAGE), ("s", FOLD), ("b", P(7, 18, 7, 11, 10, 8, 16, 8, 16, 18, close=True)), ("A", dots(10, 13, r=1.2))],
    "gcode": [("a", P(3, 19, 3, 15, 21, 15, 21, 11, 3, 11, 3, 7, 21, 7)), ("O", P(16, 2, 20, 2, 20, 6, 18, 9, 16, 6, close=True))],
    "nesting": [("F", box(2, 3, 22, 21)), ("H", box(4, 5, 13, 11)), ("K", box(4, 12.5, 9, 19) + box(14.5, 5, 20, 13) + box(10.5, 14.5, 20, 19))],
    "offcuts": [("F", P(3, 21, 3, 9, 9, 9, 9, 15, 21, 15, 21, 21, close=True)), ("H", box(12, 3, 21, 12))],
    "import-dxf": [("F", PAGE), ("s", FOLD), ("b", P(8, 18, 8, 13, 12, 10, 16, 13, 16, 18)), ("R", arr(12, 4, 12, 11, 2.4))],
    "import-parts": [("F", PAGE), ("s", FOLD + rows(7, 17, 14, 17.5)), ("R", arr(12, 4, 12, 11, 2.4))],
    "production-folder": [("K", "M2 6a2 2 0 0 1 2-2h5l2 2.5h9a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"), ("b", P(8, 13.5, 11, 16.5, 16.5, 10.5))],
    "batch": [("F", box(9, 2, 21, 14)), ("F", box(6, 5, 18, 17)), ("K", box(3, 8, 15, 20))],
    "progress": [("F", box(3, 3, 21, 21)), ("b", P(6, 8, 7.5, 9.5, 10, 6.5) + P(6, 14, 7.5, 15.5, 10, 12.5)), ("s", rows(12, 18, 8, 14)), ("d", P(6.5, 19, 10, 19) + P(12, 19, 18, 19))],
    "parameters": [("s", rows(3, 21, 6, 12, 18)), ("H", C(8, 6, 2.2) + C(15, 12, 2.2) + C(10, 18, 2.2))],
    "variants": [("F", box(3, 3, 13, 17)), ("K", box(11, 7, 21, 21)), ("R", arr(5, 20, 9, 20, 2) + arr(19, 4, 15, 4, 2))],
    "share": [("s", P(7, 12, 16.5, 6.5) + P(7, 12, 16.5, 17.5)), ("H", C(17, 6, 2.8) + C(17, 18, 2.8)), ("K", C(6, 12, 2.8))],
    # Historique : les opérations d'un corps
    "op-edit": [("K", box(3, 13, 13, 21)), ("O", "M17 2.5l4.5 4.5-9 9-5.2.7.7-5.2z")],
    "op-restore": [("K", box(7, 7, 17, 17)), *turn(12, 12, 9, 160, -110)],
    "op-suppress": [("K", box(4, 4, 20, 20)), ("w", P(3, 21, 21, 3))],
    "op-trash": [("F", BIN), ("s", P(5, 5.5, 18, 3) + P(10, 4.7, 9.6, 2.6, 13.6, 1.8, 14, 3.9)), ("o", P(10, 11, 10, 18) + P(14, 11, 14, 18))],
}
