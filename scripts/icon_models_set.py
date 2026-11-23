"""
Les dessins à plat des modèles d'icônes (scripts/icon_models.py) : pour chaque outil, « glyphe » (formes plates
grises, un accent) sur 24 × 24 ; « studio » et « croquis » sont en volumes, dans icon_models_studio.py. Un dessin est
une suite de (sorte, tracé) : la sorte dit le trait ou l'aplat (icon_models.py : s a o les traits encre, accent,
orange ; d e p les mêmes en pointillés ; W b w en gras ; S A O les aplats ; T une teinte de l'accent, G un gris), le
tracé est celui d'un <path>.
"""


def n(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def R(x, y, w, h, r=0.0):
    """A rectangle, its corners rounded by r."""
    if not r:
        return f"M{n(x)} {n(y)}h{n(w)}v{n(h)}h{n(-w)}z"
    a = f"a{n(r)} {n(r)} 0 0 1"
    return f"M{n(x + r)} {n(y)}h{n(w - 2 * r)}{a} {n(r)} {n(r)}v{n(h - 2 * r)}{a} {n(-r)} {n(r)}h{n(2 * r - w)}{a} {n(-r)} {n(-r)}v{n(2 * r - h)}{a} {n(r)} {n(-r)}z"


def C(x, y, r):
    """A circle."""
    return f"M{n(x - r)} {n(y)}a{n(r)} {n(r)} 0 1 0 {n(2 * r)} 0a{n(r)} {n(r)} 0 1 0 {n(-2 * r)} 0z"


def arr(x1, y1, x2, y2, head=2.4):
    """An arrow from (x1, y1) to (x2, y2): its shaft to the base of a closed head (filled by the kind R)."""
    size = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    ux, uy = (x2 - x1) / size, (y2 - y1) / size
    bx, by, w = x2 - head * ux, y2 - head * uy, head * 0.55
    return f"M{n(x1)} {n(y1)}L{n(bx)} {n(by)}M{n(bx - w * uy)} {n(by + w * ux)}L{n(x2)} {n(y2)}L{n(bx + w * uy)} {n(by - w * ux)}z"


CUBE = "M12 3l8 4.5v9L12 21l-8-4.5v-9z"
CUBE_IN = "M12 12l8-4.5M12 12v9M12 12L4 7.5"
POINTER = "M6 3v14.5l3.8-3.6 2.6 5.6 2-1-2.6-5.5H17z"
SMALL_POINTER = "M14 12v9l2.4-2.2 1.6 3.4 1.6-.8-1.6-3.3H21z"
STAR = "M19 2l.9 2.1 2.1.9-2.1.9L19 8l-.9-2.1L16 5l2.1-.9z"
BRACKETS = "M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4"

ICONS = {
    "split-sides": {
        "glyphe": [("S", R(7, 2.5, 10, 3.6, 0.9) + R(7, 17.9, 10, 3.6, 0.9) + R(2.5, 7, 3.6, 10, 0.9)), ("A", R(17.9, 7, 3.6, 10, 0.9))],
    },
    "linked-copy": {
        "glyphe": [("S", R(2, 2, 9.5, 9.5, 2)), ("A", R(12.5, 12.5, 9.5, 9.5, 2)), ("w", "M10 10l4 4")],
    },
    "combine": {
        "glyphe": [("S", "M3 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-4H5a2 2 0 0 1-2-2z"), ("A", R(9, 9, 6, 6))],
    },
    "split": {
        "glyphe": [("S", R(2.5, 5, 7.8, 14, 1.5)), ("A", R(13.7, 5, 7.8, 14, 1.5)), ("o", "M12 2v20")],
    },
    "move-3d": {
        "glyphe": [("O", "M12 2l4 4h-2.6v4.6H18V8l4 4-4 4v-2.6h-4.6V18H16l-4 4-4-4h2.6v-4.6H6V16l-4-4 4-4v2.6h4.6V6H8z")],
    },
    "face-glue": {
        "glyphe": [("S", R(2, 6, 8, 12, 1.5)), ("A", R(14, 6, 8, 12, 1.5)), ("O", "M10.8 9.4l2.8 2.6-2.8 2.6z")],
    },
    "extend-element": {
        "glyphe": [("S", R(2, 8, 10, 8, 1.5)), ("O", "M13 9l4.6 3-4.6 3z"), ("A", R(19.4, 3, 2.6, 18, 1))],
    },
    "push": {
        "glyphe": [("S", R(12.5, 5, 9.5, 14, 2)), ("O", "M2 10.4h4.6V7l5 5-5 5v-3.4H2z")],
    },
    "face-strip": {
        "glyphe": [("S", R(3, 11, 18, 10, 2) + R(8, 14, 8, 4, 0.5)), ("O", "M12 2l4 4.5h-2.6V10h-2.8V6.5H8z"), ("O", STAR)],
    },
    "mirror": {
        "glyphe": [("S", "M10 5v14H3z"), ("A", "M14 5v14h7z"), ("d", "M12 2v20")],
    },
    "room": {
        "glyphe": [("S", R(2, 3, 20, 18, 1) + R(5, 6, 14, 12)), ("A", R(9, 18, 6, 3))],
    },
    "lighting": {
        "glyphe": [("S", "M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"), ("O", R(9, 18.4, 6, 1.6, 0.8) + R(10, 20.8, 4, 1.4, 0.7))],
    },
    "kitchen-plan": {
        "glyphe": [("S", "M3 3h18v6H9v12H3z"), ("A", C(15, 6, 1.6) + R(4.2, 14, 3.6, 5, 0.6))],
    },
    "kitchen": {
        "glyphe": [("S", R(3, 14, 5.4, 7, 0.8) + R(9.3, 14, 5.4, 7, 0.8) + R(15.6, 14, 5.4, 7, 0.8) + R(3, 3, 7, 6, 0.8) + R(14, 3, 7, 6, 0.8)), ("A", R(2, 11, 20, 1.8, 0.6))],
    },
    "kitchen-units": {
        "glyphe": [("S", R(5, 3, 14, 5, 1.2) + R(10, 4.9, 4, 1.2, 0.6)), ("S", R(5, 9.5, 14, 11.5, 1.2) + R(15.5, 12.3, 1.2, 3.4, 0.6))],
    },
    "appliances": {
        "glyphe": [("S", R(3, 2, 18, 20, 2.5) + R(6.5, 10.5, 11, 7.5, 1) + C(7, 6, 1.1) + C(10.6, 6, 1.1)), ("A", R(6.5, 8.2, 11, 1.1, 0.5))],
    },
    "doors-open": {
        "glyphe": [("S", R(3, 3, 11, 18, 1.5)), ("A", "M15.5 3l6 2.6v16l-6-2.6z")],
    },
    "drawers-open": {
        "glyphe": [("S", R(3, 3, 11, 18, 1.5)), ("A", R(14.6, 9.4, 7.4, 5.2, 1))],
    },
    "cabinet": {
        "glyphe": [("S", R(3, 2, 18, 20, 1.5) + R(6, 5, 12, 6) + R(6, 13, 12, 6))],
    },
    "fronts": {
        "glyphe": [("S", R(3, 3, 8.6, 18, 1.5) + R(8.8, 10.3, 1.2, 3.4, 0.6)), ("A", R(12.4, 3, 8.6, 18, 1.5) + R(14, 10.3, 1.2, 3.4, 0.6))],
    },
    "panels": {
        "glyphe": [("S", R(3, 3, 3.4, 14.2, 0.8) + R(17.6, 8, 3.4, 9.2, 0.8)), ("A", R(3, 18, 18, 3.4, 0.8))],
    },
    "finishing": {
        "glyphe": [("S", R(7.2, 6.8, 9.6, 14.2, 1)), ("A", R(3, 6.8, 3, 14.2, 0.8) + R(18, 6.8, 3, 14.2, 0.8) + R(3, 2.5, 18, 3.1, 0.8))],
    },
    "filter-auto": {
        "glyphe": [("S", POINTER), ("O", STAR)],
    },
    "filter-face": {
        "glyphe": [("S", R(3, 3, 18, 18, 2) + R(6, 6, 12, 12)), ("A", R(7.6, 7.6, 8.8, 8.8, 0.5))],
    },
    "filter-edge": {
        "glyphe": [("G", R(3, 3, 18, 14, 2)), ("A", R(2, 18.4, 20, 3.2, 1.6))],
    },
    "filter-vertex": {
        "glyphe": [("G", R(5, 3, 16, 16, 2)), ("A", C(5.5, 18.5, 3.5))],
    },
    "filter-body": {
        "glyphe": [("A", CUBE), ("s", CUBE_IN)],
    },
    "window": {
        "glyphe": [("T", R(3, 3, 14, 12, 1.5)), ("e", R(3, 3, 14, 12, 1.5)), ("S", SMALL_POINTER)],
    },
    "fit": {
        "glyphe": [("W", BRACKETS), ("A", R(7.5, 7.5, 9, 9, 1.5))],
    },
    "piece-dims": {
        "glyphe": [("S", R(3, 3, 13, 13, 1.5)), ("b", "M3 20.5h13M20.5 3v13")],
    },
    "grid": {
        "glyphe": [("S", "".join(R(3 + 6.4 * i, 3 + 6.4 * j, 5.2, 5.2, 1) for i in range(3) for j in range(3) if (i, j) != (1, 1))), ("A", R(9.4, 9.4, 5.2, 5.2, 1))],
    },
    "axes": {
        "glyphe": [("d", "M12 13l-5.2-3M12 13l5.2-3M12 13v6.5"), ("w", "M12 13l8.7 5"), ("b", "M12 13l-8.7 5"), ("W", "M12 13V3"), ("S", C(12, 13, 1.5))],
    },
    "select-all": {
        "glyphe": [("e", R(2.5, 2.5, 19, 19, 1.5)), ("S", R(5.5, 5.5, 6.5, 6.5, 1)), ("A", C(15.2, 15.2, 3.6))],
    },
    "open-all": {
        "glyphe": [("S", R(7.6, 3, 8.8, 18, 1)), ("A", "M6.4 3L2.5 5.5v15l3.9-2.5zM17.6 3l3.9 2.5v15l-3.9-2.5z")],
    },
    "xray": {
        "glyphe": [("G", CUBE), ("s", CUBE), ("A", C(12, 12, 3.2))],
    },
    "isolate": {
        "glyphe": [("A", R(7.5, 7.5, 9, 9, 1.5)), ("G", R(2, 2, 5, 5, 1) + C(19.5, 4.5, 2.5) + R(17, 17, 5, 5, 1) + C(4.5, 19.5, 2.5))],
    },
}
