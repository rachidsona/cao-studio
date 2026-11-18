"""
Les outils de modélisation en volumes des modèles « Studio » et « Croquis » (suite de icon_models_studio.py, mêmes
sortes et même façon : un dessin est une fonction de l'origine o, mis à l'échelle de l'icône par fit()).
"""
from math import cos, pi, radians, sin

from icon_models_set import SMALL_POINTER, STAR, C
from icon_models_solid import cylinder, frustum, ring_wall, slab, solid
from icon_models_studio import arrow, box, iso, line, prism, pt, rect, wire


def turned(X, Y, a, b, deg, cx, cy):
    c, s = cos(radians(deg)), sin(radians(deg))
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in rect(X, Y, a, b)]


def shell(o, outline, inner, h, t, kind="F", inside_kind="K"):
    """An open container: its outer sides, the rim between two outlines, the inside one sees, back to front."""
    left, right, _ = prism(o, outline, h)
    rim = iso(o, *((x, y, h) for x, y in outline)) + iso(o, *((x, y, h) for x, y in reversed(inner)))
    floor = iso(o, *((x, y, t) for x, y in inner))
    # Inside, the walls one sees are those whose inner side looks at the eye: the far ones of an outline.
    walls = []
    for (x1, y1), (x2, y2) in zip(inner, inner[1:] + inner[:1]):
        walls.append(iso(o, (x1, y1, t), (x2, y2, t), (x2, y2, h), (x1, y1, h)))
    far = [d for d, ((x1, y1), (x2, y2)) in zip(walls, zip(inner, inner[1:] + inner[:1])) if (x1 + x2) + (y1 + y2) < sum(x + y for x, y in inner) * 2 / len(inner)]
    return [(kind + "<", left), (kind + ">", right), (inside_kind, floor), *((inside_kind + ">", d) for d in far), (kind, rim)]


def tent(o, w, d, h, peak):
    """A box whose top is pulled up to a point in its middle."""
    top = [(0, 0, h), (w, 0, h), (w, d, h), (0, d, h)]
    apex = (w / 2, d / 2, h + peak)
    faces = [[(0, 0, 0), (w, 0, 0), (w, 0, h), (0, 0, h)], [(w, 0, 0), (w, d, 0), (w, d, h), (w, 0, h)],
             [(w, d, 0), (0, d, 0), (0, d, h), (w, d, h)], [(0, d, 0), (0, 0, 0), (0, 0, h), (0, d, h)]]
    faces += [[a, b, apex] for a, b in zip(top, top[1:] + top[:1])]
    return solid(o, faces, (w / 2, d / 2, h / 2), "F", "H", {i: "H" for i in range(4, 8)})


def bent(o):
    """A board bent in an arch, and where it lay straight."""
    up = [(10 * i / 12, 4 * sin(pi * i / 12)) for i in range(13)]
    profile = [(x, z) for x, z in up] + [(x, z + 1.1) for x, z in reversed(up)]  # counter-clockwise
    return [("d", wire(o, 0, 0, 0, 10, 6, 0.6)), *slab(o, profile, 0, 6, "H", "H")]


def gable(o):
    roof = solid(o, [[(0, 0, 6), (5, 0, 10), (5, 8, 10), (0, 8, 6)], [(5, 0, 10), (10, 0, 6), (10, 8, 6), (5, 8, 10)],
                     [(0, 8, 6), (10, 8, 6), (5, 8, 10)], [(0, 0, 6), (10, 0, 6), (5, 0, 10)]], (5, 4, 7), "K", "H", {0: "H", 1: "H>"})
    return [*box(o, 0, 0, 0, 10, 8, 6), *roof]


def rounded(o, cut):
    """A block whose top front edge is rounded (cut False) or bevelled (cut True), the new faces in the accent."""
    corner = [(8, 3.5), (7.5, 5.2), (6.2, 6.4), (4.5, 7)] if not cut else [(8, 3.5), (4.5, 7)]
    return slab(o, [(0, 0), (8, 0), *corner, (0, 7)], 0, 8, "F", "F", accent=range(2, len(corner) + 1))


def hole(o):
    rim = [(5 + 2.4 * cos(2 * pi * i / 24), 5 + 2.4 * sin(2 * pi * i / 24), 4) for i in range(24)]
    return [*box(o, 0, 0, 0, 10, 10, 4), ("H<", iso(o, *rim)), ("R", arrow(o, (5, 5, 12), (5, 5, 5.2)))]


def frame(o):
    """A square frame swept from one profile, back pieces first."""
    return [*box(o, 0, 0, 0, 10, 2, 2, "F", "K"), *box(o, 0, 2, 0, 2, 6, 2, "F", "K"), *box(o, 8, 2, 0, 2, 6, 2, "F", "K"),
            *box(o, 0, 8, 0, 10, 2, 2, "H", "H")]


def section(o):
    plane = iso(o, (5, -1.5, -1), (5, 9.5, -1), (5, 9.5, 9.5), (5, -1.5, 9.5))
    return [("d", wire(o, 5, 0, 0, 5, 8, 8)), *box(o, 0, 0, 0, 5, 8, 8), ("H>", iso(o, (5, 0, 0), (5, 8, 0), (5, 8, 8), (5, 0, 8))), ("p", plane)]


DRAW2 = {
    "sketch": lambda o: [*box(o, 0, 0, 0, 11, 11, 0.8, "F", "K"), ("b", line(o, (2.5, 2.5, 0.8), (8, 2.5, 0.8), (8, 8, 0.8), (2.5, 8, 0.8), (2.5, 2.5, 0.8))), ("A", C(*pt(o, 8, 8, 0.8), 1) + C(*pt(o, 2.5, 2.5, 0.8), 1))],
    "extrude": lambda o: [*(lambda left, right, t: [("K<", left), ("K>", right), ("H", t)])(*prism(o, [(0, 0), (9, 0), (9, 3.5), (3.5, 3.5), (3.5, 9), (0, 9)], 5)), ("R", arrow(o, (1.7, 1.7, 5), (1.7, 1.7, 12)))],
    "extrude-path": lambda o: [("e", line(o, (1.2, 12, 0), (1.2, 1.2, 0), (12, 1.2, 0))), *box(o, 0, 0, 0, 12, 2.4, 2.4, "K", "H"), *box(o, 0, 2.4, 0, 2.4, 6, 2.4, "H", "H")],
    "revolve": lambda o: [("e", line(o, (0, 0, -2), (0, 0, 12))), *cylinder(o, 0, 0, 0, 3.5, 3, "K", "H"), *cylinder(o, 0, 0, 3, 2, 4, "K", "H"), *cylinder(o, 0, 0, 7, 4, 2.5, "K", "H")],
    "loft": lambda o: [*frustum(o, [(0, 0, 0), (10, 0, 0), (10, 10, 0), (0, 10, 0)], [(3, 3, 8), (7, 3, 8), (7, 7, 8), (3, 7, 8)], "K", "H"), ("e", iso(o, (0, 0, 0), (10, 0, 0), (10, 10, 0), (0, 10, 0)))],
    "sweep": frame,
    "fillet": lambda o: rounded(o, False),
    "chamfer": lambda o: rounded(o, True),
    "shell": lambda o: shell(o, rect(0, 0, 10, 10), rect(1.4, 1.4, 7.2, 7.2), 7, 1.2),
    "hollow": lambda o: shell(o, [(0, 0), (11, 0), (0, 11)], [(1.5, 1.5), (7.4, 1.5), (1.5, 7.4)], 6, 1.2),
    "hole": hole,
    "draw-on-face": lambda o: [*box(o, 0, 0, 0, 9, 9, 9), ("b", line(o, (9, 2, 2), (9, 7, 2), (9, 7, 6), (9, 4, 7.5), (9, 2, 6), (9, 2, 2)))],
    "pull-face": lambda o: [*box(o, 0, 0, 0, 6, 8, 8), ("H>", iso(o, (6, 0, 0), (6, 8, 0), (6, 8, 8), (6, 0, 8))), ("d", wire(o, 6, 0, 0, 5, 8, 8)), ("R", arrow(o, (6.5, 4, 4), (12, 4, 4)))],
    "move-edge": lambda o: [*solid(o, [[(0, 0, 0), (9, 0, 0), (9, 0, 9), (0, 0, 6)], [(9, 0, 0), (9, 9, 0), (9, 9, 9), (9, 0, 9)], [(0, 9, 0), (9, 9, 0), (9, 9, 9), (0, 9, 6)], [(0, 0, 6), (9, 0, 9), (9, 9, 9), (0, 9, 6)], [(0, 0, 0), (0, 9, 0), (0, 9, 6), (0, 0, 6)]], (4.5, 4.5, 3)), ("d", line(o, (9, 0, 6), (9, 9, 6))), ("b", line(o, (9, 0, 9), (9, 9, 9))), ("R", arrow(o, (9, 4.5, 6.2), (9, 4.5, 12)))],
    "offset-edge": lambda o: [*box(o, 0, 0, 0, 11, 11, 3, "F", "F"), ("H", iso(o, (2.2, 2.2, 3), (8.8, 2.2, 3), (8.8, 8.8, 3), (2.2, 8.8, 3)))],
    "intersect": lambda o: [*box(o, 0, 0, 0, 8, 8, 8), ("e", iso(o, (-3, -3, 4), (11, -3, 4), (11, 11, 4), (-3, 11, 4))), ("b", line(o, (8, 0, 4), (8, 8, 4), (0, 8, 4)))],
    "oi-intersect": lambda o: [*box(o, 0, 0, 0, 8, 8, 8, "F", "K"), ("b", line(o, (8, 0, 4), (8, 8, 4), (0, 8, 4)) + line(o, (4, 0, 8), (4, 8, 8), (4, 8, 0)))],
    "modifier": bent,
    "stretch": lambda o: [*box(o, 0, 0, 0, 5, 6, 6), ("d", wire(o, 5, 0, 0, 3, 6, 6)), *box(o, 8, 0, 0, 5, 6, 6, "K", "H"), ("p", iso(o, (6.5, -1.5, -1), (6.5, 7.5, -1), (6.5, 7.5, 7.5), (6.5, -1.5, 7.5))), ("R", arrow(o, (5.5, 3, 8.5), (10, 3, 8.5)))],
    "rotate": lambda o: [("d", wire(o, 0, 0, 0, 9, 5, 5)), *(lambda left, right, t: [("K<", left), ("K>", right), ("H", t)])(*prism(o, turned(0, 0, 9, 5, 35, 4.5, 2.5), 5)), ("o", line(o, *[(4.5 + 7 * cos(radians(a)), 2.5 + 7 * sin(radians(a)), 7) for a in range(-80, 40, 10)])), ("R", arrow(o, (4.5 + 7 * cos(radians(30)), 2.5 + 7 * sin(radians(30)), 7), (4.5 + 7 * cos(radians(55)), 2.5 + 7 * sin(radians(55)), 7)))],
    "align": lambda o: [*box(o, 0, 0, 0, 5, 5, 9), ("d", wire(o, 7, 0, 0, 5, 5, 5)), *box(o, 7, 0, 4, 5, 5, 5, "K", "H"), ("e", line(o, (-1, 0, 9), (13, 0, 9))), ("R", arrow(o, (9.5, 5, 2), (9.5, 5, 4.6)))],
    "center-in": lambda o: [*box(o, 0, 0, 0, 12, 12, 1.5, "F", "F"), ("e", line(o, (6, -1, 1.5), (6, 13, 1.5)) + line(o, (-1, 6, 1.5), (13, 6, 1.5))), *box(o, 4, 4, 1.5, 4, 4, 4, "K", "H")],
    "mate": lambda o: [*box(o, 0, 0, 0, 10, 10, 3, "F", "H"), *box(o, 2.5, 2.5, 8, 5, 5, 3, "K", "K"), ("R", arrow(o, (5, 5, 7.6), (5, 5, 3.6)))],
    "array": lambda o: [*box(o, 0, 0, 0, 3, 3, 5, "H", "H"), *box(o, 5, 0, 0, 3, 3, 5, "K", "K"), *box(o, 10, 0, 0, 3, 3, 5, "K", "K")],
    "rect-array": lambda o: [*box(o, 0, 0, 0, 4, 4, 4, "H", "H"), *box(o, 6, 0, 0, 4, 4, 4, "K", "K"), *box(o, 0, 6, 0, 4, 4, 4, "K", "K"), *box(o, 6, 6, 0, 4, 4, 4, "K", "K")],
    "copy-ops": lambda o: [*box(o, 0, 0, 0, 6, 8, 1.5), ("A", "".join(C(*pt(o, 3, y, 1.5), 0.9) for y in (2, 4, 6))), *box(o, 9, 0, 0, 6, 8, 1.5, "K", "K"), ("e", "".join(C(*pt(o, 12, y, 1.5), 0.9) for y in (2, 4, 6))), ("R", arrow(o, (3, 4, 4), (12, 4, 4)))],
    "bend-onto": lambda o: [*cylinder(o, 0, 0, 0, 4, 9, "F", "F"), *ring_wall(o, 0, 0, 1.5, 4.8, 6, 0.1, 1.5, "H")],
    "section": section,
    "plate": lambda o: box(o, 0, 0, 0, 11, 11, 1.6, "K", "H"),
    "ffd": lambda o: [*tent(o, 9, 9, 5, 4), ("A", C(*pt(o, 4.5, 4.5, 9), 1.3)), ("R", arrow(o, (4.5, 4.5, 9.8), (4.5, 4.5, 13)))],
    "gable": gable,
    "swap": lambda o: [*box(o, 0, 0, 0, 4, 4, 6), *box(o, 9, 0, 0, 4, 4, 6, "K", "H"), ("R", arrow(o, (2, 2, 8.5), (11, 2, 8.5)) + arrow(o, (11, 2, 12), (2, 2, 12)))],
    "spacing": lambda o: [*box(o, 0, 0, 0, 3, 7, 8), *box(o, 9, 0, 0, 3, 7, 8, "K", "K"), ("R", arrow(o, (6, 7, 4), (3.2, 7, 4)) + arrow(o, (6, 7, 4), (8.8, 7, 4)))],
    "overlap": lambda o: [*box(o, 0, 0, 0, 1.6, 8, 9), *box(o, 9, 0, 0, 1.6, 8, 9), *box(o, 0, 0, 9, 10.6, 8, 1.6, "H", "H")],
    "paneling": lambda o: [("d", wire(o, 0, 0, 0, 9, 9, 9)), *box(o, 0, 0, 9, 9, 9, 1.2, "K", "H"), *box(o, 9, 0, 0, 1.2, 9, 9, "H", "K")],
}
AROUND2 = {
    "plate": ((10, 13), 17, [("O", STAR)]),
    "oi-intersect": ((10, 10.5), 16, [("F", SMALL_POINTER)]),
}
