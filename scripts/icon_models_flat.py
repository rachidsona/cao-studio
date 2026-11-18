"""
Les outils plats par nature — tracés, contraintes et cotes d'esquisse — dessinés une fois pour les trois modèles
d'icônes (scripts/icon_models.py) : à plat dans Glyphe, posés sur une planche (Studio) ou une feuille (Croquis) vues
de biais (icon_models_plane.py), chaque modèle avec ses couleurs. Mêmes sortes que icon_models_set.py ; F, K, H y sont des
surfaces à plat (neutre, teinte de l'accent, accent), R une flèche qui agit, sa pointe pleine.
"""
import re
from math import cos, radians, sin

from icon_models_set import C, SMALL_POINTER, STAR, arr, n


def P(*pts, close=False):
    """A polyline through the points (x, y, x, y…), closed or not."""
    xy = list(zip(pts[::2], pts[1::2]))
    return "M" + "L".join(f"{n(x)} {n(y)}" for x, y in xy) + ("z" if close else "")


def box(x0, y0, x1, y1):
    return P(x0, y0, x1, y0, x1, y1, x0, y1, close=True)


def rot(d, cx, cy, deg):
    """A polyline drawn by P() turned by deg around (cx, cy)."""
    c, si = cos(radians(deg)), sin(radians(deg))
    pts = [(float(x), float(y)) for x, y in re.findall(r"(-?[\d.]+) (-?[\d.]+)", d)]
    return P(*(v for x, y in pts for v in (cx + (x - cx) * c - (y - cy) * si, cy + (x - cx) * si + (y - cy) * c)), close=d.endswith("z"))


def dots(*pts, r=1.5):
    return "".join(C(x, y, r) for x, y in zip(pts[::2], pts[1::2]))


def ngon(cx, cy, r, k, start=0):
    return P(*(v for i in range(k) for v in (cx + r * cos(radians(start + 360 * i / k)), cy + r * sin(radians(start + 360 * i / k)))), close=True)


def turn(cx, cy, r, a1, a2, head=2.4):
    """A curved arrow around (cx, cy), from angle a1 to a2 (degrees, clockwise on screen): its arc and its head."""
    at = lambda a, rr=r: (cx + rr * cos(radians(a)), cy + rr * sin(radians(a)))
    back = a2 - (head / r) * 57.3 * (1 if a2 > a1 else -1)
    (x1, y1), (x2, y2), (bx, by) = at(a1), at(a2), at(back)
    big, sweep = int(abs(back - a1) > 180), int(a2 > a1)
    w = head * 0.55
    (lx, ly), (rx, ry) = at(back, r - w), at(back, r + w)
    return [("o", f"M{n(x1)} {n(y1)}A{n(r)} {n(r)} 0 {big} {sweep} {n(bx)} {n(by)}"), ("R", f"M{n(lx)} {n(ly)}L{n(x2)} {n(y2)}L{n(rx)} {n(ry)}z")]


def dim(x1, y1, x2, y2, off):
    """A dimension of the segment (x1, y1)–(x2, y2), off to its left: extension lines, the line, filled heads."""
    L = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    ux, uy = (x2 - x1) / L, (y2 - y1) / L
    nx, ny = uy * off, -ux * off
    a, b = (x1 + nx, y1 + ny), (x2 + nx, y2 + ny)
    k = 1 + 1.2 / abs(off)
    # No extension lines for a dimension laid on its own segment (a diameter).
    ext = P(x1 + nx * 0.25, y1 + ny * 0.25, x1 + nx * k, y1 + ny * k) + P(x2 + nx * 0.25, y2 + ny * 0.25, x2 + nx * k, y2 + ny * k) if abs(off) > 0.1 else ""
    head = lambda p, s: P(p[0], p[1], p[0] + s * 2.4 * ux - 1 * uy, p[1] + s * 2.4 * uy + 1 * ux, p[0] + s * 2.4 * ux + 1 * uy, p[1] + s * 2.4 * uy - 1 * ux, close=True)
    return [("a", ext + P(*a, *b)), ("A", head(a, 1) + head(b, -1))]


ARC_UP = "M3 17A9 9 0 0 1 21 17"
SQUARES = lambda *pts: "".join(box(x - 1.6, y - 1.6, x + 1.6, y + 1.6) for x, y in zip(pts[::2], pts[1::2]))

FLAT = {
    # Tracés
    "line": [("s", P(3, 19, 10, 7, 21, 15)), ("A", dots(3, 19, 10, 7, 21, 15))],
    "arc": [("e", P(19, 16, 8, 16, 8, 5)), ("a", "M19 16A11 11 0 0 0 8 5"), ("O", dots(8, 16, r=1.7)), ("A", dots(19, 16, 8, 5))],
    "arc-3pt": [("a", ARC_UP), ("A", dots(3, 17, 12, 8, 21, 17))],
    "arc-tangent": [("s", P(3, 18, 11, 18)), ("a", "M11 18A7 7 0 0 0 18 11"), ("S", dots(3, 18, r=1.3)), ("A", dots(11, 18, 18, 11))],
    "circle": [("K", C(12, 12, 8.5)), ("e", P(12, 12, 18, 6)), ("O", dots(12, 12, r=1.7)), ("A", dots(18, 6))],
    "circle-2pt": [("K", C(12, 12, 8.5)), ("e", P(6, 6, 18, 18)), ("A", dots(6, 6, 18, 18))],
    "circle-3pt": [("K", C(12, 12.5, 8.5)), ("A", dots(12, 4, 4.64, 16.75, 19.36, 16.75))],
    "oval": [("K", "M3 12A9 6 0 0 1 21 12A9 6 0 0 1 3 12z"), ("e", P(3, 12, 21, 12) + P(12, 6, 12, 18)), ("O", dots(12, 12, r=1.6))],
    "rect": [("K", box(3, 5, 21, 19)), ("A", dots(3, 5, 21, 19))],
    "rect-3pt": [("K", P(4.6, 11, 14.6, 5, 19.4, 13, 9.4, 19, close=True)), ("A", dots(4.6, 11, 14.6, 5, 19.4, 13))],
    "rect-center": [("K", box(3, 6, 21, 18)), ("e", P(12, 12, 21, 18)), ("O", dots(12, 12, r=1.7)), ("A", dots(21, 18))],
    "polygon": [("K", ngon(12, 12, 9, 6)), ("e", P(12, 12, 21, 12)), ("O", dots(12, 12, r=1.6)), ("A", dots(21, 12))],
    "slot": [("K", "M7 7.5H17A4.5 4.5 0 0 1 17 16.5H7A4.5 4.5 0 0 1 7 7.5z"), ("e", P(7, 12, 17, 12)), ("A", dots(7, 12, 17, 12))],
    "curve": [("a", "M3 18C6 6 10 6 12 12S18 18 21 6"), ("A", dots(3, 18, 12, 12, 21, 6))],
    "points": [("s", P(4, 18, 10, 7, 20, 14)), ("S", SQUARES(4, 18, 10, 7, 20, 14))],
    "text": [("S", "M5 3.5H19V8H17V6H13.3V18.5H15.5V20.5H8.5V18.5H10.7V6H7V8H5z"), ("b", P(19.5, 13, 19.5, 21))],
    "construction": [("s", P(3, 17, 21, 17)), ("p", P(5, 21, 19, 3)), ("A", dots(3, 17, 21, 17))],
    "offset": [("s", "M4 20V11A7 7 0 0 1 11 4H20"), ("a", "M9 20V11A2 2 0 0 1 11 9H20")],
    "trim": [("s", P(8, 3, 8, 21) + P(3, 12, 8, 12)), ("d", P(8, 12, 21, 12)), ("w", "M13.5 9.5l5 5M18.5 9.5l-5 5")],
    "extend": [("s", P(20, 3, 20, 21) + P(3, 14, 11, 14)), ("e", P(11, 14, 20, 14)), ("A", dots(20, 14)), ("R", arr(5, 8, 16, 8))],
    "break": [("s", P(3, 12, 10, 12) + P(14, 12, 21, 12)), ("o", P(10, 17, 14, 7)), ("A", dots(10, 12, 14, 12))],
    "sketch-fillet": [("d", P(4, 12, 4, 4, 12, 4)), ("s", P(4, 21, 4, 12) + P(12, 4, 21, 4)), ("b", "M4 12A8 8 0 0 1 12 4"), ("A", dots(4, 12, 12, 4))],
    "sketch-chamfer": [("d", P(4, 12, 4, 4, 12, 4)), ("s", P(4, 21, 4, 12) + P(12, 4, 21, 4)), ("b", P(4, 12, 12, 4)), ("A", dots(4, 12, 12, 4))],
    "project": [("F", box(5, 3, 19, 9)), ("R", arr(12, 10.5, 12, 15.5)), ("b", P(3, 19, 21, 19)), ("A", dots(5, 19, 19, 19))],
    "finish": [("b", P(4, 13, 9.5, 18.5, 20, 6))],
    "delete": [("F", P(6, 8, 18, 8, 17, 21, 7, 21, close=True)), ("s", P(4, 8, 20, 8) + P(9.5, 8, 9.5, 4.5, 14.5, 4.5, 14.5, 8)), ("o", P(10, 11, 10, 18) + P(14, 11, 14, 18))],
    # Modifier les traits
    "move": [("d", box(3, 11, 11, 19)), ("K", box(13, 4, 21, 12)), ("R", arr(7.5, 14.5, 14.5, 9.5))],
    "sk-rotate": [("d", box(6, 10, 18, 17)), ("K", rot(box(6, 10, 18, 17), 12, 13.5, -30)), *turn(12, 13.5, 10, -165, -95)],
    "sk-mirror": [("F", P(10, 5, 10, 19, 3, 19, close=True)), ("K", P(14, 5, 14, 19, 21, 19, close=True)), ("d", P(12, 2, 12, 22))],
    "sk-polar": [("O", dots(12, 12, r=1.6)), *[("K" if i else "H", C(12 + 7.5 * cos(radians(-90 + 60 * i)), 12 + 7.5 * sin(radians(-90 + 60 * i)), 2.2)) for i in range(6)]],
    "sk-scale": [("K", box(3, 5, 19, 21)), ("d", box(3, 13, 11, 21)), ("R", arr(11.5, 12.5, 18, 6))],
    "sk-similar": [("F", box(13, 3.5, 20.5, 11) + box(3.5, 13, 11, 20.5)), ("H", C(7.2, 7.2, 3.8)), ("H", C(16.8, 16.8, 3.8))],
    "sk-stretch": [("K", P(3, 8, 19, 8, 19, 16, 3, 16, close=True)), ("d", P(14, 8, 14, 16)), ("e", box(11, 5, 21.5, 19)), ("R", arr(14.5, 12, 20.5, 12, 2.2))],
    "sketch-array": [("H" if (i, j) == (0, 0) else "K", C(5 + 7 * i, 5 + 7 * j, 2.4)) for i in range(3) for j in range(3)],
    "select-sketches": [("e", box(2.5, 2.5, 21.5, 21.5)), ("a", P(6, 17, 11, 7)), ("K", C(15.5, 14, 3.5)), ("A", dots(6, 17, 11, 7))],
    "sk-chain": [("b", P(3, 15, 3, 7, 8, 3, 16, 5, 16, 15, close=True)), ("A", dots(3, 15, 3, 7, 8, 3, 16, 5, 16, 15)), ("F", SMALL_POINTER)],
    # Contraintes
    "coincident": [("s", P(3, 19, 12, 12, 21, 7)), ("a", C(12, 12, 3.4)), ("A", dots(12, 12, r=1.6)), ("S", dots(3, 19, 21, 7, r=1.2))],
    "concentric": [("F", C(12, 12, 9)), ("K", C(12, 12, 5)), ("A", dots(12, 12, r=1.5))],
    "midpoint": [("s", P(3, 17, 21, 7)), ("S", dots(3, 17, 21, 7, r=1.3)), ("A", P(12, 9, 15, 14, 9, 14, close=True))],
    "parallel": [("W", P(5, 18, 13, 5)), ("b", P(11, 19, 19, 6))],
    "perpendicular": [("W", P(3, 20, 21, 20)), ("b", P(12, 20, 12, 4)), ("s", P(12, 16, 16, 16, 16, 20))],
    "tangent": [("K", C(10, 14, 6.5)), ("b", P(2.5, 7.5, 21.5, 7.5)), ("A", dots(10, 7.5))],
    "equal": [("W", P(3, 5, 14, 5) + P(10, 19, 21, 19)), ("b", P(8, 10.5, 16, 10.5) + P(8, 13.5, 16, 13.5))],
    "horizontal": [("d", P(3, 18, 21, 14)), ("b", P(3, 10, 21, 10)), ("A", dots(3, 10, 21, 10))],
    "vertical": [("d", P(18, 3, 14, 21)), ("b", P(10, 3, 10, 21)), ("A", dots(10, 3, 10, 21))],
    "symmetric": [("d", P(12, 2, 12, 22)), ("s", P(3, 19, 7, 7) + P(21, 19, 17, 7)), ("A", dots(7, 7, 17, 7))],
    "fix": [("W", "M8.5 11V8A3.5 3.5 0 0 1 15.5 8V11"), ("H", box(5.5, 11, 18.5, 21)), ("S", dots(12, 16, r=1.3))],
    "point-on-curve": [("s", "M3 18C8 4 16 4 21 14"), ("a", C(12, 7, 3.2)), ("A", dots(12, 7, r=1.5))],
    "fully-define": [("F", box(7, 9, 20, 20)), *dim(7, 9, 20, 9, 4), *dim(7, 20, 7, 9, 4)],
    "glyphs": [("s", P(3, 18, 21, 18)), ("K", box(7, 4, 17, 12)), ("s", P(9.8, 6, 9.8, 10) + P(14.2, 6, 14.2, 10) + P(9.8, 8, 14.2, 8)), ("S", dots(3, 18, 21, 18, r=1.3))],
    # Cotes
    "dimension": [("s", P(4, 20, 18, 6)), ("S", dots(4, 20, 18, 6, r=1.3)), *dim(4, 20, 18, 6, -4.5)],
    "dimension-x": [("F", box(4, 12, 20, 20)), *dim(4, 12, 20, 12, 6)],
    "dimension-y": [("F", box(4, 4, 12, 20)), *dim(12, 20, 12, 4, -6)],
    "dim-angle": [("s", P(21, 20, 4, 20, 16, 6)), ("a", "M17 20A13 13 0 0 0 12.5 10.1"), ("A", P(17, 20, 15.6, 17.6, 18.4, 17.6, close=True) + P(12.5, 10.1, 15.1, 10.7, 13.4, 12.9, close=True))],
    "dim-chain": [("s", P(3, 19, 21, 19)), ("S", dots(3, 19, 9, 19, 15, 19, 21, 19, r=1.3)), *dim(3, 19, 9, 19, 9), *dim(9, 19, 15, 19, 9), *dim(15, 19, 21, 19, 9)],
    "dim-diameter": [("K", C(12, 12, 8.5)), *dim(6, 18, 18, 6, 0.01)],
    "dim-radius": [("K", C(12, 12, 8.5)), ("O", dots(12, 12, r=1.5)), ("a", P(12, 12, 18, 6)), ("A", P(18, 6, 15.6, 6.9, 17.1, 8.4, close=True))],
    "autodim": [("F", box(3, 11, 15, 21)), *dim(3, 11, 15, 11, 4), *dim(15, 21, 15, 11, -3.5), ("O", STAR)],
}
