"""
Les outils de vue, de navigation et de contrôle en volumes des modèles « Studio » et « Croquis » (suite de
icon_models_studio.py) : vues de face, de droite, de dessus, orbites, visite, scènes, rendus, sélection, accrochage.
"""
from math import cos, pi, sin

from icon_models_set import SMALL_POINTER, STAR, C
from icon_models_solid import around
from icon_models_studio import VIEW, arrow, box, cube, doors, iso, line, pt, wire
from icon_models_studio3 import ball

PLUS = "M18.2 1.5h1.6v3.4h3.4v1.6h-3.4v3.4h-1.6V6.5h-3.4V4.9h3.4z"
WARN = "M18 1.5l5 9h-10zM17.4 4.6v3h1.2v-3zM17.4 8.3v1.1h1.2V8.3z"


def orbit_ring(o, z, r=8, cx=4, cy=4, gap=0.5):
    """A ring around the middle at height z, open where its head is, and the head (kind R)."""
    pts = around(cx, cy, z, r, 32, gap, 2 * pi - 0.2)
    head = arrow(o, pts[-3][:3], pts[-1][:3], 2.2)
    return [("o", line(o, *pts[:-2])), ("R", head)]


def faced(o, which):
    """A cube with one face (front, right, top) in the accent and an arrow looking at it."""
    faces = {
        "front": ("H<", iso(o, (0, 8, 0), (8, 8, 0), (8, 8, 8), (0, 8, 8)), ((4, 15, 4), (4, 8.6, 4))),
        "right": ("H>", iso(o, (8, 0, 0), (8, 8, 0), (8, 8, 8), (8, 0, 8)), ((15, 4, 4), (8.6, 4, 4))),
        "top": ("H", iso(o, (0, 0, 8), (8, 0, 8), (8, 8, 8), (0, 8, 8)), ((4, 4, 15), (4, 4, 8.6))),
    }
    kind, d, (P, Q) = faces[which]
    return [*cube(o), (kind, d), ("R", arrow(o, P, Q))]


def footprints(o):
    foot = lambda X, Y: iso(o, *around(X, Y, 0, 1.1, 14)[:-1])
    return [("F", iso(o, (0, 0, 0), (12, 0, 0), (12, 12, 0), (0, 12, 0))), ("H", foot(3, 9) + foot(6, 7.5) + foot(7, 4) + foot(10, 2.5))]


DRAW4 = {
    "view-front": lambda o: faced(o, "front"),
    "view-right": lambda o: faced(o, "right"),
    "view-top": lambda o: faced(o, "top"),
    "view-iso": lambda o: [*cube(o, "H", "K"), ("A", C(*pt(o, 8, 8, 8), 1.4 * VIEW["scale"]))],
    "orbit": lambda o: [*cube(o, "K"), *orbit_ring(o, 3)],
    "orbit-free": lambda o: [("K", ball(o, 4, 4, 4, 4.5)), *orbit_ring(o, 4, 7.5), ("o", line(o, *[(4 + 7.5 * cos(a / 16 * pi), 4 - 7.5 * cos(a / 16 * pi), 4 + 7.5 * sin(a / 16 * pi)) for a in range(2, 15)]))],
    "orbit-constrained": lambda o: [("e", line(o, (4, 4, -3), (4, 4, 13))), *cube(o, "K"), *orbit_ring(o, 3)],
    "orbit-center": lambda o: [*cube(o, "K", "K"), ("e", line(o, (4, 4, -2), (4, 4, 10)) + line(o, (-2, 4, 4), (10, 4, 4))), ("A", C(*pt(o, 4, 4, 4), 1.8 * VIEW["scale"]))],
    "walk": footprints,
    "motion": lambda o: [*doors(o, 6, [(6, 10.5, 9.5)]), ("p", line(o, *[(6 + 4.5 * cos(a / 20 * pi), 6 + 4.5 * sin(a / 20 * pi), 0) for a in range(0, 11)]))],
    "scenes": lambda o: [*box(o, 0, 0, 5, 3, 3, 2, "F", "F"), *box(o, 0, 0, 0, 9, 6, 5, "F", "K"), ("H", ball(o, 4.5, 7.5, 2.5, 2.2))],
    "render": lambda o: [*cube(o, "H", "H"), ("s", line(o, (8, 1, 6), (8, 7, 5.4)) + line(o, (8, 1, 3), (8, 7, 2.4)) + line(o, (1, 8, 6), (7, 8, 5.4)) + line(o, (1, 8, 3), (7, 8, 2.4)))],
    "render-studio": lambda o: [("F", iso(o, (-2, -2, 0), (10, -2, 0), (10, 10, 0), (-2, 10, 0))), ("H", ball(o, 4, 4, 4, 4))],
    "select": lambda o: cube(o, "H", "K"),
    "select-plus": lambda o: [*box(o, 0, 0, 0, 9, 6, 2), *box(o, 0, 0, 2, 2, 6, 6), *box(o, 7, 0, 2, 2, 6, 6, "K", "H")],
    "snap-geometry": lambda o: [*cube(o), ("a", C(*pt(o, 8, 8, 8), 2.4 * VIEW["scale"])), ("A", C(*pt(o, 8, 8, 8), 1.1 * VIEW["scale"]))],
    "snap-smart": lambda o: [*box(o, 0, 0, 0, 5, 5, 6), *box(o, 9, -4, 0, 4, 4, 4, "K", "H"), ("e", line(o, (5, 5, 6), (5, 5, 12)) + line(o, (5, 5, 10), (13, 5, 10))), ("A", C(*pt(o, 5, 5, 10), 1.1 * VIEW["scale"]))],
    "layers": lambda o: [*box(o, 0, 0, 0, 10, 10, 1, "F", "F"), *box(o, 0, 0, 3, 10, 10, 1, "K", "K"), *box(o, 0, 0, 6, 10, 10, 1, "H", "H")],
    "weight": lambda o: [*box(o, 0, 0, 0, 7, 6, 11), ("A", C(*pt(o, 3.5, 6, 5.5), 1.6 * VIEW["scale"])), ("R", arrow(o, (3.5, 6, 4.2), (3.5, 6, -3)))],
    "part-tags": lambda o: [*box(o, 0, 0, 0, 1, 6, 9), *box(o, 1, 0, 0, 7, 6, 1), *box(o, 8, 0, 0, 1, 6, 9), ("A", C(*pt(o, 1, 3, 5), 1.3 * VIEW["scale"]) + C(*pt(o, 4.5, 6, 0.5), 1.3 * VIEW["scale"]) + C(*pt(o, 9, 3, 5), 1.3 * VIEW["scale"]))],
    "live-check": lambda o: [*box(o, 0, 0, 0, 7, 7, 7), ("p", wire(o, -1, -1, -1, 9, 9, 9))],
    "check-fab": lambda o: [*box(o, 0, 0, 0, 6, 6, 6), *box(o, 4, 3, 0, 6, 6, 4, "K", "K"), ("O", iso(o, (4, 3, 4), (6, 3, 4), (6, 6, 4), (4, 6, 4)))],
}
AROUND4 = {
    "select": ((10, 10), 13, [("F", SMALL_POINTER)]),
    "select-plus": ((9.5, 12.5), 15, [("F", SMALL_POINTER), ("O", PLUS)]),
    "render-studio": ((10, 13), 16.5, [("O", STAR)]),
    "check-fab": ((10, 13), 16.5, [("O", WARN)]),
}
