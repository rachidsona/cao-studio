"""Le dessin des icônes de la vue et de la sélection (filtres, fenêtre, orbite…) et du crayon : `i` est une scène de scripts/icons3d.py."""
from math import pi

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
    i.box(-7, -4, 0, 14, 8, 2.4)
    i.arrow((-1, 6.6, 0), (-7.6, 6.6, 0), "blue", 0.55).arrow((1, 6.6, 0), (7.6, 6.6, 0), "blue", 0.55)
    i.line((-7, 5, 0), (-7, 8, 0), SKY, 0.5).line((7, 5, 0), (7, 8, 0), SKY, 0.5)


def part_tags(i):
    i.box(-7, -5, 0, 14, 10, 2)
    cx, cy = i.p(0, 1, 2)
    i.flat([(cx - 5.5, cy - 1), (cx - 3, cy - 4.2), (cx + 5.5, cy - 4.2), (cx + 5.5, cy + 2.2), (cx - 3, cy + 2.2)], "bl")
    i.mark([(cx - 0.9, cy + 0.9), (cx + 1.2, cy - 3), (cx + 3.3, cy + 0.9)], "#ffffff", 0.8).mark([(cx + 0.1, cy - 0.5), (cx + 2.3, cy - 0.5)], "#ffffff", 0.7)


VUE = {
    "sketch": sketch, "face-strip": face_strip, "draw-on-face": draw_on_face, "filter-auto": filter_auto, "filter-face": filter_face,
    "filter-edge": filter_edge, "filter-vertex": filter_vertex, "filter-body": filter_body, "window": window, "fit": fit,
    "orbit": orbit, "piece-dims": piece_dims, "part-tags": part_tags,
}
