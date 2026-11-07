"""Le dessin des icônes de la vue et de la sélection (filtres, fenêtre, orbite…) et du crayon : `i` est une scène de scripts/icons3d.py."""
from math import cos, pi, sin

BLUE = "#0284c7"
SKY = "#38bdf8"
ORANGE = "#ea580c"


def cube(i, t="white", s=10):
    return i.box(-s / 2, -s / 2, -s / 2, s, s, s, t)


def sketch(i):
    i.box(-7, -7, 0, 14, 14, 1.4)
    i.path([(-4, 3.5, 1.4), (3.5, 3.5, 1.4), (3.5, -4, 1.4), (-4, -4, 1.4), (-4, 3.5, 1.4)], BLUE, 0.7)
    i.pencil(1, 3.5, 1.4, 12, 1.9)


def face_strip(i):
    """A trowel laying a blue strip."""
    i.box(-6, -3, -3.5, 12, 6, 1.6, "blue")
    i.box(-1.2, -0.7, -1.9, 2.4, 1.4, 1.3, "white")
    cx, cy = i.p(0, 0, 0)
    i.flat([(cx - 1, cy + 0.6), (cx + 7.5, cy - 5.4), (cx + 9, cy - 3.9), (cx + 0.8, cy + 1.8)], "ol")


def draw_on_face(i):
    i.box(-6, -6, 0, 12, 12, 9)
    i.face([(-6, -6, 9), (6, -6, 9), (6, 6, 9), (-6, 6, 9)], "bt")
    i.path([(-3, 3, 9), (3, 3, 9), (3, -3, 9), (-3, -3, 9), (-3, 3, 9)], "#ffffff", 0.6)
    i.pencil(3, 3, 9, 10, 1.8)


def filter_auto(i):
    cube(i)
    i.face([(-5, 5, -5), (5, 5, -5), (5, 5, 5), (-5, 5, 5)], "bl")
    i.cursor(1, 1, 3)


def filter_face(i):
    cube(i)
    i.face([(-5, -5, 5), (5, -5, 5), (5, 5, 5), (-5, 5, 5)], "bt")


def filter_edge(i):
    cube(i)
    i.line((5, -5, 5), (5, 5, 5), ORANGE, 1.1)


def filter_vertex(i):
    cube(i)
    i.ball(5, 5, 5, 2.1, "orange")


def filter_body(i):
    cube(i, "blue")


def window(i):
    cube(i, "blue", 8)
    i.dashes([(-10.5, -10.5), (10.5, -10.5), (10.5, 10.5), (-10.5, 10.5)], SKY, 0.7)
    i.cursor(3, 3, -3)


def fit(i):
    cube(i, "blue", 9)
    r, length = 10.6, 4
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        i.mark([(sx * r, sy * (r - length)), (sx * r, sy * r), (sx * (r - length), sy * r)], ORANGE, 1.1)


def orbit(i):
    i.turn(0, 0, 0, 10, pi * 1.05, pi * 1.95, "orange", 0.8)
    cube(i, "white", 9)
    i.turn(0, 0, 0, 10, 0.15, pi * 0.85, "orange", 1)


def piece_dims(i):
    """A panel seen from the front, its width under it and its height beside it."""
    i.box(-4, 0, -6, 13, 2, 14)
    i.line((-4, 2, -7.2), (-4, 2, -11), SKY, 0.5).line((9, 2, -7.2), (9, 2, -11), SKY, 0.5)
    i.arrow((2.5, 2, -10), (-3.8, 2, -10), "blue", 0.95).arrow((2.5, 2, -10), (8.8, 2, -10), "blue", 0.95)
    i.line((-5.2, 2, -6), (-9, 2, -6), SKY, 0.5).line((-5.2, 2, 8), (-9, 2, 8), SKY, 0.5)
    i.arrow((-8, 2, 1), (-8, 2, -5.8), "blue", 0.95).arrow((-8, 2, 1), (-8, 2, 7.8), "blue", 0.95)


def part_tags(i):
    """A panel seen from the front, with the letter of the part on a blue tag."""
    i.box(-7, 0, -8, 14, 2, 16)
    cx, cy = i.p(0, 2, 0)
    r = 5.6
    i.flat([(cx + r * cos(k * pi / 16), cy + r * sin(k * pi / 16)) for k in range(32)], "bb")
    i.mark([(cx - 2.6, cy + 3), (cx, cy - 3.2), (cx + 2.6, cy + 3)], "#ffffff", 1.1).mark([(cx - 1.5, cy + 0.8), (cx + 1.5, cy + 0.8)], "#ffffff", 0.95)


def grid(i):
    """A plate squared in blue, lying like the grid of the view."""
    s = 9
    i.box(-s, -s, -1.2, 2 * s, 2 * s, 1.2)
    for k in (-s, -s / 3, s / 3, s):
        i.line((k, -s, 0), (k, s, 0), BLUE, 0.65).line((-s, k, 0), (s, k, 0), BLUE, 0.65)


VUE = {
    "sketch": sketch, "face-strip": face_strip, "draw-on-face": draw_on_face, "filter-auto": filter_auto, "filter-face": filter_face,
    "filter-edge": filter_edge, "filter-vertex": filter_vertex, "filter-body": filter_body, "window": window, "fit": fit,
    "orbit": orbit, "piece-dims": piece_dims, "part-tags": part_tags, "grid": grid,
}
