"""
Les outils de menuiserie en volumes du modèle « Duo » (suite de icon_models_studio.py) : caissons
ouverts vus de face et de dessus (la face avant est du côté Y), leurs étagères, tiroirs, niches et quincaillerie.
"""
from math import cos, pi, sin

from icon_models_set import STAR, C
from icon_models_solid import cylinder, slab
from icon_models_studio import SEEN, VIEW, arrow, box, iso, line, prism, pt, wire


def carcass(o, w, d, h, t=0.8, kind="F", x=0):
    """An open carcass at x, its front on the Y side: (what is behind its inside, what is in front of it)."""
    behind = [*box(o, x, 0, 0, w, 0.5, h, kind, kind), *box(o, x, 0, 0, t, d, h, kind, kind), *box(o, x + t, 0, 0, w - 2 * t, d, t, kind, kind)]
    front = [*box(o, x + t, 0, h - t, w - 2 * t, d, t, kind, kind), *box(o, x + w - t, 0, 0, t, d, h, kind, kind)]
    return behind, front


def cab(o, inside=(), w=8, d=6, h=10, after=(), x=0):
    """A carcass with what is inside it, and what stands in front of it."""
    behind, front = carcass(o, w, d, h, x=x)
    return [*behind, *inside, *front, *after]


def shelf(o, z, w=8, d=6, kind="H", x0=0.8, x1=None, x=0):
    return box(o, x + x0, 0.5, z, (x1 or w - 0.8) - x0, d - 0.5, 0.7, kind, kind)


def upright(o, x, h=10, d=6, kind="H", z0=0.8, z1=None):
    return box(o, x, 0.5, z0, 0.8, d - 0.5, (z1 or h - 0.8) - z0, kind, kind)


def fronts(o, rows, w=8, d=6, kind="H"):
    """Drawer fronts on the carcass: (z, height) each, a handle in the middle."""
    out = []
    for z, hh in rows:
        out += box(o, 0, d, z, w, 0.6, hh, kind, kind)
        out.append(("s", line(o, (w / 2 - 1.2, d + 0.6, z + hh * 0.6), (w / 2 + 1.2, d + 0.6, z + hh * 0.6))))
    return out


def ball(o, X, Y, Z, r):
    """A ball (a circle facing the eye) around a point of the space."""
    s = VIEW["scale"]
    x, y = pt(o, X, Y, Z)
    SEEN.extend([(x - r * s, y - r * s), (x + r * s, y + r * s)])
    return C(x, y, r * s)


def sagging(o):
    sag = [(0.8 + 8.4 * i / 12, 6 - 1.6 * sin(pi * i / 12)) for i in range(13)]
    profile = [*sag, *((x, z + 0.7) for x, z in reversed(sag))]  # counter-clockwise
    return [*box(o, 0, 0, 0, 0.8, 6, 10), ("d", line(o, (0.8, 6, 6.7), (9.2, 6, 6.7))), *slab(o, profile, 0.5, 6, "H", "H"), *box(o, 9.2, 0, 0, 0.8, 6, 10)]


def cutout(o):
    top = [*box(o, 0, 0, 0, 13, 7, 1.2, "F", "F")]
    sink = [("K<", iso(o, (2, 1.5, 1.2), (6.5, 1.5, 1.2), (6.5, 5.5, 1.2), (2, 5.5, 1.2))), ("s", line(o, (2, 5.5, 1.2), (2, 1.5, 1.2), (6.5, 1.5, 1.2)))]
    hob = [("H", "".join(C(*pt(o, x, y, 1.2), 1.1 * VIEW["scale"]) for x, y in ((9, 2.5), (11, 2.5), (9, 4.8), (11, 4.8))))]
    return top + sink + hob


DRAW3 = {
    "partition": lambda o: cab(o, [*upright(o, 3.6), *shelf(o, 5, x1=3.6), *shelf(o, 6.5, x0=4.4)]),
    "cloisons": lambda o: cab(o, [*upright(o, 2.6), *upright(o, 4.8)]),
    "shelves": lambda o: cab(o, [*shelf(o, 3.6), *shelf(o, 6.4)]),
    "drawers": lambda o: cab(o, after=fronts(o, [(0.2, 3), (3.4, 3), (6.6, 3.2)])),
    "niche": lambda o: cab(o, [*shelf(o, 4.6, kind="F"), ("H<", iso(o, (0.8, 0.5, 5.3), (7.2, 0.5, 5.3), (7.2, 0.5, 9.2), (0.8, 0.5, 9.2)))], after=[("R", arrow(o, (4, 6, 7.2), (4, 6, 4.9)))]),
    "niche-align": lambda o: [*cab(o, shelf(o, 4, w=6), w=6), *cab(o, shelf(o, 4, w=6, x=7), w=6, x=7), ("e", line(o, (-1, 6, 4.7), (14.5, 6, 4.7)))],
    "niche-copy": lambda o: [*cab(o, [*shelf(o, 3.5, w=6), *shelf(o, 6.5, w=6)], w=6), *box(o, 7.5, 0, 0, 6, 6, 10, "K", "K"), ("e", line(o, (7.5, 6, 3.5), (13.5, 6, 3.5)) + line(o, (7.5, 6, 6.5), (13.5, 6, 6.5))), ("R", arrow(o, (3, 6, 11.5), (10.5, 6, 11.5)))],
    "module": lambda o: cab(o, [*shelf(o, 6, kind="F"), *box(o, 1.2, 1, 0.8, 5.6, 4.8, 4.6, "H", "H")]),
    "module-palette": lambda o: [*box(o, 0, 0, 0, 4, 4, 6, "K", "K"), *box(o, 5, 0, 0, 4, 4, 4, "H", "H"), *box(o, 10, 0, 0, 4, 4, 8, "K", "K")],
    "accessory": lambda o: cab(o, [*shelf(o, 5.6, kind="F"), ("H", iso(o, (0.8, 1, 1.4), (7.2, 1, 1.4), (7.2, 6, 3.4), (0.8, 6, 3.4)))]),
    "rod": lambda o: cab(o, [("a", line(o, (3, 3, 7), (3, 3, 6), (1.2, 3, 4), (4.8, 3, 4), (3, 3, 6)) + line(o, (5.4, 3, 7), (5.4, 3, 6), (3.8, 3, 4.2), (7, 3, 4.2), (5.4, 3, 6))), *box(o, 0.8, 2.6, 7, 6.4, 0.8, 0.8, "H", "H")]),
    "dressing": lambda o: [*box(o, 0, 0, 0, 12, 4, 10), *box(o, 0, 4, 0, 4, 7, 10, "K", "K"), ("s", line(o, (4, 4, 0), (4, 4, 10)) + line(o, (8, 4, 0), (8, 4, 10)) + line(o, (4, 7.5, 0), (4, 7.5, 10)))],
    "dressing-plan": lambda o: [("F", iso(o, (0, 0, 0), (12, 0, 0), (12, 12, 0), (0, 12, 0))), *(lambda l, r, t: [("K<", l), ("K>", r), ("H", t)])(*prism(o, [(0, 0), (12, 0), (12, 9), (9, 9), (9, 3), (3, 3), (3, 9), (0, 9)], 1.6))],
    "dressing-style": lambda o: [*box(o, 0, 0, 0, 9, 6, 10), *box(o, 0, 6, 0, 4.4, 0.6, 10, "H", "H"), *box(o, 4.6, 6, 0, 4.4, 0.6, 10, "K", "K"), ("o", line(o, (3.5, 6.6, 4), (3.5, 6.6, 6)) + line(o, (5.5, 6.6, 4), (5.5, 6.6, 6)))],
    "high-storage": lambda o: [*box(o, 0, 0, 0, 7, 6, 9), *box(o, 0, 0, 9.3, 7, 6, 3.5, "H", "H"), ("e", line(o, (-1, 6, 9.15), (8.5, 6, 9.15))), ("R", arrow(o, (3.5, 7, 13.5), (3.5, 7, 9.9)))],
    "layout-copy": lambda o: [*cab(o, [*shelf(o, 6, w=6), *box(o, 0.8, 0.5, 0.8, 4.4, 5.5, 2.4, "H", "H")], w=6), ("d", wire(o, 7.5, 0, 0, 6, 6, 10)), ("R", arrow(o, (3, 6, 11.5), (10.5, 6, 11.5)))],
    "door-fronts": lambda o: cab(o, [*shelf(o, 5, kind="F")], after=[*box(o, 0, 6, 0, 8, 0.6, 10, "H", "H"), ("s", line(o, (6.8, 6.6, 4), (6.8, 6.6, 6)))]),
    "plinth-tech": lambda o: [*box(o, 0, 0, 2, 11, 6, 7), *box(o, 0, 5, 0, 11, 0.6, 2, "H", "H"), ("s", "".join(line(o, (x, 5.6, 0.5), (x, 5.6, 1.5)) for x in (2, 3.5, 5, 6.5, 8, 9.5)))],
    "snack": lambda o: [*cylinder(o, 6, 10.5, 0, 1.2, 5, "K", "H"), *box(o, 0, 0, 0, 12, 5, 7), *box(o, 0, 0, 7, 12, 9, 0.8, "H", "H")],
    "worktop-bars": lambda o: [*box(o, 0, 0, 0, 7, 5, 1.2, "H", "H"), *box(o, 7.4, 0, 0, 7, 5, 1.2, "K", "K"), ("o", line(o, (7.2, -1, 1.2), (7.2, 6, 1.2)))],
    "cutout": cutout,
    "hardware": lambda o: [*box(o, 0, 0, 0, 8, 1, 11, "F", "F"), ("H<", iso(o, *[(1.6 + 0.9 * cos(2 * pi * i / 16), 1, 8.5 + 0.9 * sin(2 * pi * i / 16)) for i in range(16)])), *box(o, 6, 1, 3.5, 0.7, 1, 4, "K", "H")],
    "edge-paint": lambda o: [*box(o, 0, 0, 0, 11, 7, 1.4, "H", "F"), ("R", arrow(o, (13, 9, 4), (10, 7.5, 1.2)))],
    "machining": lambda o: [*box(o, 0, 0, 0, 11, 7, 1.2, "F", "F"), ("S", "".join(C(*pt(o, x, 1.4, 1.2), 0.5 * VIEW["scale"]) for x in (1.5, 3.1, 4.7, 6.3, 7.9, 9.5))), ("b", line(o, (0.6, 5.8, 1.2), (10.4, 5.8, 1.2))), ("A", C(*pt(o, 8.5, 3.6, 1.2), 1.1 * VIEW["scale"]))],
    "joinery-shapes": lambda o: (lambda l, r, t: [("F<", l), ("F>", r), ("F", t), ("b", line(o, (11, 1.5, 1.6), (8.5, 1, 1.6), (8.5, 6, 1.6), (11, 5.5, 1.6)))])(*prism(o, [(0, 0), (11, 0), (11, 1.5), (8.5, 1), (8.5, 6), (11, 5.5), (11, 7), (0, 7)], 1.6)),
    "hidden-joints": lambda o: [*box(o, 0, 0, 0, 5, 7, 7), *box(o, 5, 0, 0, 5, 7, 7), ("d", line(o, (5, 0, 7), (5, 7, 7), (5, 7, 0)))],
    "assembly": lambda o: [*box(o, 0, 0, 0, 10, 7, 1.2), *box(o, 0, 0, 1.2, 1.2, 7, 8, "K", "K"), ("e", line(o, (-1, 2, 0.6), (3.5, 2, 0.6)) + line(o, (-1, 5, 0.6), (3.5, 5, 0.6))), ("O", C(*pt(o, 0.6, 2, 0.6), 0.8 * VIEW["scale"]) + C(*pt(o, 0.6, 5, 0.6), 0.8 * VIEW["scale"]))],
    "material": lambda o: [*box(o, 0, 0, 0, 11, 8, 1.4, "F", "K"), ("a", "".join(line(o, (1, y, 1.4), (10, y, 1.4)) for y in (2, 4, 6))), ("R", arrow(o, (2, 9.5, 1.4), (10, 9.5, 1.4)))],
    "appearance": lambda o: [*box(o, -2, -2, 0, 10, 10, 0.8, "F", "F"), ("H", ball(o, 3, 3, 5, 3.6))],
    "standard": lambda o: [*cab(o, w=8, h=9), ("H", iso(o, (2, 6.5, 0), (7, 6.5, 0), (2, 6.5, 5)))],
    "sag": sagging,
    "replace": lambda o: [*box(o, 0, 0, 0, 8, 6, 1.2, "F", "F"), *box(o, 0, 0, 3.2, 8, 6, 1.2, "F", "F"), *box(o, 0, 0, 6.4, 8, 6, 1.2, "H", "H"), ("R", arrow(o, (10, 3, 0.6), (10, 3, 7)))],
    "library": lambda o: [*cab(o, [*shelf(o, 5, kind="F"), *box(o, 1.2, 1, 0.8, 2.5, 4.5, 3.6, "H", "H"), *box(o, 4.2, 1, 0.8, 2.5, 4.5, 2.6, "K", "K")], h=9)],
    "measure": lambda o: [("H", iso(o, (4, 1, 0), (14, 1, 0), (14, 3, 0), (4, 3, 0))), ("s", "".join(line(o, (x, 1, 0), (x, 1.9, 0)) for x in range(6, 14, 2))), *box(o, 0, 0, 0, 4.5, 4, 4.5, "K", "K")],
    "inventory": lambda o: [*box(o, 0, 0, 0, 7, 6, 1.4, "K", "K"), *box(o, 0, 0, 1.4, 7, 6, 1.4, "H", "H"), *box(o, 0, 0, 2.8, 7, 6, 1.4, "K", "K"), ("s", line(o, (10.5, 3, 10), (10.5, 3, 8.6), (8, 3, 6.4), (13, 3, 6.4), (10.5, 3, 8.6)))],
    "display": lambda o: cab(o, [*shelf(o, 5, kind="F")], after=[("e", wire(o, 0, 6, 0, 8, 0.6, 10))]),
}
AROUND3 = {"library": ((10, 13), 17, [("O", STAR)])}
