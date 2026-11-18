"""
Le modèle « Studio » des icônes (scripts/icon_models.py) : chaque outil en petits solides vus en axonométrie
(X vers la droite et l'avant, Y vers la gauche et l'avant, Z en haut), gris clair, ce qui compte en couleur, les
arêtes fines et foncées ; les faces pleines cachent ce qui est derrière — dessinées du fond vers l'avant. Un dessin est
une fonction de l'origine o (là où tombe le point X = Y = Z = 0) ; fit() la choisit pour centrer le dessin. Sortes en
plus de icon_models_set.py : F une face grise, K une face bleu pâle, H une face bleue ; suivies de « < » pour une face
tournée à gauche, « > » à droite (plus sombres que le dessus).
"""
from math import hypot

from icon_models_set import BRACKETS, C, R, SMALL_POINTER, STAR, n

SEEN = []


def pt(o, X, Y, Z):
    """Where a point of the space falls on the icon."""
    x, y = o[0] + X - Y, o[1] + (X + Y) / 2 - Z
    SEEN.append((x, y))
    return x, y


def iso(o, *pts, close=True):
    d = "M" + "L".join(f"{n(x)} {n(y)}" for x, y in (pt(o, *p) for p in pts))
    return d + ("z" if close else "")


def line(o, *pts):
    return iso(o, *pts, close=False)


def arrow(o, P, Q, head=1.7):
    (x1, y1), (x2, y2) = pt(o, *P), pt(o, *Q)
    size = hypot(x2 - x1, y2 - y1)
    ux, uy = (x2 - x1) / size, (y2 - y1) / size
    bx, by, w = x2 - head * ux, y2 - head * uy, head * 0.65
    return f"M{n(x1)} {n(y1)}L{n(x2)} {n(y2)}M{n(bx - w * uy)} {n(by + w * ux)}L{n(x2)} {n(y2)}L{n(bx + w * uy)} {n(by - w * ux)}"


def rect(X, Y, a, b):
    return [(X, Y), (X + a, Y), (X + a, Y + b), (X, Y + b)]


def prism(o, pts, h, z=0):
    """A straight volume on the outline pts (X, Y), from z to z + h: the sides one sees turned left and turned right,
    back to front, and its top."""
    edges = list(zip(pts, pts[1:] + pts[:1]))
    turn = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in edges)
    left, right = [], []
    for (x1, y1), (x2, y2) in edges:
        nx, ny = (y2 - y1, x1 - x2) if turn > 0 else (y1 - y2, x2 - x1)
        if nx + ny > 1e-9:  # faces the eye, which looks along (-1, -1, -1)
            (left if ny > nx else right).append((x1 + x2 + y1 + y2, iso(o, (x1, y1, z), (x2, y2, z), (x2, y2, z + h), (x1, y1, z + h))))
    return "".join(d for _, d in sorted(left)), "".join(d for _, d in sorted(right)), iso(o, *((x, y, z + h) for x, y in pts))


def box(o, X, Y, Z, a, b, h, sides="F", top="F"):
    left, right, t = prism(o, rect(X, Y, a, b), h, Z)
    return [(sides + "<", left), (sides + ">", right), (top, t)]


def wire(o, X, Y, Z, a, b, h):
    """The edges one would see of a box, for a dashed outline."""
    return "".join(prism(o, rect(X, Y, a, b), h, Z))


def fit(draw, at=(12, 12)):
    """The drawing, centred on at; it must stay inside the 24 × 24 with a margin."""
    SEEN.clear()
    draw((0, 0))
    xs, ys = zip(*SEEN)
    assert max(xs) - min(xs) <= 21 and max(ys) - min(ys) <= 21, (max(xs) - min(xs), max(ys) - min(ys))
    return draw((at[0] - (min(xs) + max(xs)) / 2, at[1] - (min(ys) + max(ys)) / 2))


def mirror(o):
    left = [("F<", iso(o, (0, 8, 2), (4, 8, 7), (4, 8, 0), (0, 8, 0))), ("F>", iso(o, (4, 0, 7), (4, 8, 7), (4, 8, 0), (4, 0, 0))), ("F", iso(o, (0, 0, 2), (4, 0, 7), (4, 8, 7), (0, 8, 2)))]
    right = [("K<", iso(o, (6, 8, 7), (10, 8, 2), (10, 8, 0), (6, 8, 0))), ("K>", iso(o, (10, 0, 2), (10, 8, 2), (10, 8, 0), (10, 0, 0))), ("H", iso(o, (6, 0, 7), (10, 0, 2), (10, 8, 2), (6, 8, 7)))]
    return [*left, ("e", iso(o, (5, -1, 0), (5, 9, 0), (5, 9, 9), (5, -1, 9))), *right]


def doors(o, w, swing):
    """A carcass w wide, a shelf behind, and its doors open by swing (one per hinge: X of the hinge, end X, end Y)."""
    out = [*box(o, 0, 0, 0, w, 6, 10, "F", "K"), ("d", line(o, (0, 6, 5), (w, 6, 5)))]
    for x, ex, ey in swing:
        out.append(("H", iso(o, (x, 6, 0), (ex, ey, 0), (ex, ey, 10), (x, 6, 10))))
    return out


def cube(o, top="F", sides="F"):
    return box(o, 0, 0, 0, 8, 8, 8, sides, top)


DRAW = {
    "split-sides": lambda o: [*box(o, 0, 0, 0, 7, 7, 8), *box(o, 9, 0, 0, 1.2, 7, 8, "K", "H")],
    "linked-copy": lambda o: [*box(o, 0, 0, 0, 5, 5, 5), *box(o, 8, 1, 0, 5, 5, 5, "K", "H"), ("p", line(o, (2.5, 2.5, 5), (10.5, 3.5, 5)))],
    "combine": lambda o: [*box(o, 0, 0, 0, 9, 9, 3.5), *box(o, 2.5, 2.5, 3.5, 4, 4, 4.5, "K", "H")],
    "split": lambda o: [*box(o, 0, 0, 0, 4.5, 8, 7), ("p", iso(o, (5.5, -1, 0), (5.5, 9, 0), (5.5, 9, 8.5), (5.5, -1, 8.5))), *box(o, 6.5, 0, 0, 4.5, 8, 7, "K", "K")],
    "move-3d": lambda o: [("o", arrow(o, (0, 0, 0), (8, 0, 0)) + arrow(o, (0, 0, 0), (0, 8, 0)) + arrow(o, (0, 0, 0), (0, 0, 8))), *box(o, -1.5, -1.5, 0, 3, 3, 3, "F", "H")],
    "face-glue": lambda o: [*box(o, 0, 0, 0, 4.5, 8, 7), ("H>", iso(o, (4.5, 0, 7), (4.5, 8, 7), (4.5, 8, 0), (4.5, 0, 0))), *box(o, 7, 0, 0, 4.5, 8, 7, "K", "K"), ("o", arrow(o, (10, 4, 7), (6, 4, 7)))],
    "extend-element": lambda o: [*box(o, 0, 0, 0, 6, 6, 5), ("d", wire(o, 6, 0, 0, 5, 6, 5)), *box(o, 11.5, -1, 0, 1, 8, 8, "H", "H"), ("o", arrow(o, (1.5, 3, 5), (9, 3, 5)))],
    "push": lambda o: [*box(o, 0, 0, 0, 7, 7, 7, "F", "K"), ("o", arrow(o, (3.5, 14, 3.5), (3.5, 8.2, 3.5)))],
    "face-strip": lambda o: [*box(o, 0, 0, 0, 10, 10, 2.5), *box(o, 3, 3, 2.5, 4, 4, 2.5, "K", "H"), ("o", arrow(o, (5, 5, 5.5), (5, 5, 11)))],
    "mirror": mirror,
    "room": lambda o: [("F", iso(o, (0, 0, 0), (8, 0, 0), (8, 8, 0), (0, 8, 0))), *box(o, -1, -1, 0, 1, 9, 6), *box(o, 0, -1, 0, 8, 1, 6), ("H<", iso(o, (4.5, 0, 0), (7, 0, 0), (7, 0, 4.5), (4.5, 0, 4.5)))],
    "lighting": lambda o: [*box(o, 0, 3, 0, 10, 6, 4, "F", "K"), *box(o, 0, 0, 10, 10, 2, 1), ("p", line(o, (2, 2, 10), (2, 7.5, 4)) + line(o, (5, 2, 10), (5, 7.5, 4)) + line(o, (8, 2, 10), (8, 7.5, 4)))],
    "kitchen-plan": lambda o: [*box(o, -0.8, -0.8, 0, 9.8, 0.8, 7), *box(o, -0.8, 0, 0, 0.8, 9, 7), *(lambda left, right, t: [("K<", left), ("K>", right), ("F", t)])(*prism(o, [(0, 0), (9, 0), (9, 4), (4, 4), (4, 9), (0, 9)], 1.5)), ("H", iso(o, (5.8, 0.8, 1.5), (8.2, 0.8, 1.5), (8.2, 3.2, 1.5), (5.8, 3.2, 1.5)))],
    "kitchen": lambda o: [*box(o, 0, 0, 0, 11, 5, 5), *box(o, 0, 0, 5, 11, 5.6, 0.8, "H", "H"), *box(o, 0, 0, 8.5, 11, 3, 4), ("s", line(o, (3.7, 5, 0), (3.7, 5, 5)) + line(o, (7.3, 5, 0), (7.3, 5, 5)) + line(o, (3.7, 3, 8.5), (3.7, 3, 12.5)) + line(o, (7.3, 3, 8.5), (7.3, 3, 12.5)))],
    "kitchen-units": lambda o: [*box(o, 0, 0, 0, 7, 7, 9, "F", "K"), ("s", line(o, (0, 7, 6.5), (7, 7, 6.5))), ("a", line(o, (2.8, 7, 7.8), (4.2, 7, 7.8)) + line(o, (5.8, 7, 2.5), (5.8, 7, 4.5)))],
    "appliances": lambda o: [*box(o, 0, 0, 0, 7, 7, 10.5), ("K<", iso(o, (1.2, 7, 1.5), (5.8, 7, 1.5), (5.8, 7, 6.5), (1.2, 7, 6.5))), ("a", line(o, (1.2, 7, 8.5), (5.8, 7, 8.5)))],
    "doors-open": lambda o: doors(o, 6, [(6, 8.5, 11.5)]),
    "drawers-open": lambda o: [*box(o, 0, 0, 0, 7, 7, 9), ("s", line(o, (0, 7, 3), (7, 7, 3)) + line(o, (0, 7, 6), (7, 7, 6))), *box(o, 0.5, 7, 3.2, 6, 4, 2.6, "K", "F"), ("a", line(o, (2.5, 11, 4.5), (4.5, 11, 4.5)))],
    "cabinet": lambda o: [*box(o, 0, 0, 0, 7, 6, 10, "F", "K"), ("s", line(o, (3.5, 6, 0), (3.5, 6, 10))), ("a", line(o, (2.8, 6, 4.3), (2.8, 6, 5.8)) + line(o, (4.2, 6, 4.3), (4.2, 6, 5.8)))],
    "fronts": lambda o: [("d", wire(o, 0, 0, 0, 8, 6, 10)), *box(o, 0, 6.6, 0, 3.9, 0.8, 10, "H", "H"), *box(o, 4.1, 6.6, 0, 3.9, 0.8, 10, "H", "H")],
    "panels": lambda o: [*box(o, 0, 0, 0, 9, 7, 1, "H", "H"), *box(o, 0, 0, 1.6, 1, 7, 8), *box(o, 8, 0, 1.6, 1, 7, 8)],
    "finishing": lambda o: box(o, 0, 0, 0, 10, 8, 2, "H", "F"),
    "filter-auto": lambda o: box(o, 0, 0, 0, 7, 7, 7, "F", "K"),
    "filter-face": lambda o: cube(o, "H"),
    "filter-edge": lambda o: [*cube(o), ("b", line(o, (8, 8, 0), (8, 8, 8))), ("A", C(*pt(o, 8, 8, 0), 1.3) + C(*pt(o, 8, 8, 8), 1.3))],
    "filter-vertex": lambda o: [*cube(o), ("A", C(*pt(o, 8, 8, 8), 2.2))],
    "filter-body": lambda o: cube(o, "H", "H"),
    "window": lambda o: box(o, 0, 0, 0, 6, 6, 6, "K", "H"),
    "fit": lambda o: box(o, 0, 0, 0, 5.5, 5.5, 6, "F", "H"),
    "piece-dims": lambda o: [*box(o, 0, 0, 0, 8, 5, 2, "F", "K"), ("a", line(o, (0, 6.5, 0), (8, 6.5, 0)) + line(o, (0, 5.8, 0), (0, 7.2, 0)) + line(o, (8, 5.8, 0), (8, 7.2, 0)) + line(o, (9.5, 0, 0), (9.5, 5, 0)) + line(o, (8.8, 0, 0), (10.2, 0, 0)) + line(o, (8.8, 5, 0), (10.2, 5, 0)))],
    "grid": lambda o: [("F", iso(o, (0, 0, 0), (9, 0, 0), (9, 9, 0), (0, 9, 0))), ("s", line(o, (3, 0, 0), (3, 9, 0)) + line(o, (6, 0, 0), (6, 9, 0)) + line(o, (0, 3, 0), (9, 3, 0)) + line(o, (0, 6, 0), (9, 6, 0))), *box(o, 3, 3, 0, 3, 3, 2.5, "K", "H")],
    "select-all": lambda o: [*box(o, 0, 0, 0, 3.5, 3.5, 3.5, "K", "H"), *box(o, 5, 0, 0, 3.5, 3.5, 3.5, "K", "H"), *box(o, 0, 5, 0, 3.5, 3.5, 3.5, "K", "H")],
    "open-all": lambda o: doors(o, 8, [(0, -2, 9.5), (8, 10, 9.5)]),
    "xray": lambda o: [*cube(o, "K", "K"), ("d", line(o, (8, 0, 0), (0, 0, 0), (0, 8, 0)) + line(o, (0, 0, 0), (0, 0, 8))), ("A", C(*pt(o, 4, 4, 4), 2))],
    "isolate": lambda o: [("d", wire(o, -5.5, 1, 0, 3.5, 3.5, 3.5) + wire(o, 1, -5.5, 0, 3.5, 3.5, 3.5)), *box(o, 0, 0, 0, 5, 5, 5, "K", "H"), ("d", wire(o, 6, 6, 0, 3, 3, 3))],
}
# Where the volumes go when a flat sign (pointer, frame, star) shares the icon, and that sign.
AROUND = {
    "filter-auto": ((10, 11), [("F", SMALL_POINTER), ("O", STAR)]),
    "window": ((10, 10), [("e", R(2.5, 2.5, 15.5, 15.5, 1)), ("F", SMALL_POINTER)]),
    "fit": ((12, 12), [("a", BRACKETS)]),
    "select-all": ((12, 12), [("e", R(2, 2, 20, 20, 1.5))]),
}


def studio(name):
    at, signs = AROUND.get(name, ((12, 12), []))
    return fit(DRAW[name], at) + signs
