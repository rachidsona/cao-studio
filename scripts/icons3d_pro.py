"""
Icônes plus parlantes pour la cuisine et la fabrication : chacune montre l'objet de l'outil (une hotte et sa lumière,
une grille d'aération, un tabouret de snack, une notice ouverte…) dans le style des volumes de scripts/icons3d.py.
Elles remplacent celles du même nom de icons3d_set.py. `i` est une scène : x vers le bas à droite, y vers le bas à
gauche, z en haut ; « cloisons » est vu de face (icons3d_meubles.FACE).
"""
from math import cos, pi, sin

from icons3d_meubles import carcass, closed

BLUE = "#0284c7"
ORANGE = "#f0660f"
YELLOW = "#ffc21a"


def ring(i, x, y, z, r, colour, width=0.45, steps=24):
    """A circle lying on a face (horizontal)."""
    pts = [(x + r * cos(k * 2 * pi / steps), y + r * sin(k * 2 * pi / steps), z) for k in range(steps + 1)]
    return i.path(pts, colour, width)


def double(i, a, b, tone="orange", w=0.7):
    """A dimension: an arrow both ways between a and b."""
    mid = tuple((p + q) / 2 for p, q in zip(a, b))
    return i.arrow(mid, b, tone, w).arrow(mid, a, tone, w)


def lighting(i):
    """A wall unit over the worktop, its LED strip lit, the light falling on the worktop."""
    i.box(-9, -4, 0, 18, 9, 1.6)
    for x in (-5, -1.5, 2, 5.5):
        i.line((x, 2.2, 8.2), (x + 0.8, 4.4, 1.7), YELLOW, 0.55)
    i.box(-8, -4, 9, 16, 6, 6)
    i.face([(-8, 2, 9), (8, 2, 9), (8, 2, 15), (-8, 2, 15)], "bl")
    i.line((0, 2.05, 9.4), (0, 2.05, 14.6), "#ffffff", 0.35)
    return i.box(-7.4, 1, 8.3, 14.8, 1, 0.7, "yellow")


def plinth_tech(i):
    """A base unit on its plinth, the plinth with a ventilation grille in front."""
    i.box(-7.4, -3.4, 0, 14.8, 7, 3.4, "dark")
    for k in range(11):
        x = -6 + k * 1.2
        i.line((x, 3.64, 0.6), (x, 3.64, 2.8), "#94a3b8", 0.4)
    i.box(-8, -4, 3.4, 16, 8, 10)
    i.face([(-7.4, 4, 4), (7.4, 4, 4), (7.4, 4, 12.8), (-7.4, 4, 12.8)], "bl")
    return i.box(-1.6, 4, 10.8, 3.2, 0.3, 0.6, "orange")


def snack(i):
    """An island, its worktop running over its side into a bar, and a stool under it."""
    i.box(-8, -5, 0, 9, 9, 8)
    i.face([(-7.4, 4, 0.6), (0.4, 4, 0.6), (0.4, 4, 7.4), (-7.4, 4, 7.4)], "bl")
    i.box(-8.6, -5.6, 8, 15.6, 10.2, 1.1)
    i.round(5.4, 0.6, 0, 0.35, 5.2, "dark")
    i.round(5.4, 0.6, 0, 1.6, 0.3, "dark")
    return i.round(5.4, 0.6, 5.2, 2.2, 0.9, "orange")


def worktop_bars(i):
    """A long worktop cut into three bars, the one in the middle measured."""
    i.box(-12, -3, 0, 7.4, 6, 1.6)
    i.box(-4, -3, 0, 7.6, 6, 1.6, "blue")
    i.box(4.2, -3, 0, 7.4, 6, 1.6)
    for x in (-4.3, 3.9):
        i.line((x, -3.4, 2.6), (x, -3.4, 5.4), ORANGE, 0.4)
    return double(i, (-4.3, -3.4, 4.4), (3.9, -3.4, 4.4))


def tech_plan(i):
    """A wall with what comes out of it: cold water in blue, hot in orange, a socket above."""
    i.box(-8, -2, 0, 16, 1.2, 15)
    i.round(-4.6, -0.1, 0, 1, 8, "blue")
    i.round(-0.6, -0.1, 0, 1, 8, "orange")
    i.box(2.6, -0.8, 9, 4.4, 0.7, 4.4)
    for x in (4, 5.6):
        i.face([(x - 0.3, -0.09, 10.6), (x + 0.3, -0.09, 10.6), (x + 0.3, -0.09, 11.6), (x - 0.3, -0.09, 11.6)], "dl")
    return i.dashes([i.p(4.8, -0.8, 9), i.p(4.8, -0.8, 1.2), i.p(1, -0.8, 1.2)], "#475569", 0.45)


def cutout(i):
    """A worktop with its cut-outs: a sink with its tap, a hob with its zones."""
    i.box(-10, -5, 0, 20, 10, 1.6)
    i.face([(-8.6, -3.6, 1.6), (-1.4, -3.6, 1.6), (-1.4, 3.6, 1.6), (-8.6, 3.6, 1.6)], "dl")
    i.face([(-7.8, -2.8, 1.6), (-2.2, -2.8, 1.6), (-2.2, 2.8, 1.6), (-7.8, 2.8, 1.6)], "dt")
    i.disc(-5, 0, 1.62, 0.6, "white", "t")
    i.round(-5, -4.3, 1.6, 0.4, 3.6, "white")
    i.box(-5.3, -4.3, 4.6, 0.6, 3, 0.6, "white")
    i.face([(1, -3.6, 1.6), (8.6, -3.6, 1.6), (8.6, 3.6, 1.6), (1, 3.6, 1.6)], "dt")
    for x, y, r in ((3, -1.6, 1.4), (6.6, -1.6, 1.1), (3, 1.9, 1.1), (6.6, 1.9, 1.4)):
        ring(i, x, y, 1.62, r, ORANGE if r > 1.2 else "#94a3b8", 0.4)
    return i


def cloisons(i):
    """A cabinet from the front, two upright boards in blue, the bays measured the same."""
    carcass(i, 15, 6, 12)
    for x in (-2.85, 2.05):
        i.box(x, -3, 1.1, 0.8, 6, 9.8, "blue")
    closed(i, 15, 6, 12)
    for a, b in ((-6.3, -2.95), (-1.95, 1.95), (2.95, 6.3)):
        double(i, (a, 3.2, 6), (b, 3.2, 6), "orange", 0.5)
    return i


def push(i):
    """A block, its face pushed further: the part added in blue, the arrow that pushes."""
    i.box(-8, -4, 0, 8, 8, 8)
    i.box(0, -4, 0, 5, 8, 8, "blue")
    i.dashes([i.p(0, 4, 0), i.p(0, 4, 8), i.p(0, -4, 8)], "#ffffff", 0.35)
    return i.arrow((6, 0, 4), (12, 0, 4))


def face_strip(i):
    """On the top of a block, a line drawn, then the strip it makes pulled up in blue."""
    i.box(-8, -6, 0, 16, 12, 5)
    i.line((-8, 1.6, 5), (8, 1.6, 5), ORANGE, 0.5)
    i.box(-8, -1.6, 5, 16, 3.2, 3.4, "blue")
    return i.arrow((0, 0, 9.2), (0, 0, 14.5))


def drawing(i):
    """A drawing sheet: the part seen from the front and from above, measured, its title block."""
    i.box(-9, -7, 0, 18, 14, 0.5)
    z = 0.5
    i.path([(-7, -5, z), (-1, -5, z), (-1, -1, z), (-7, -1, z), (-7, -5, z)], BLUE, 0.45)
    i.path([(-7, 1, z), (-1, 1, z), (-1, 4, z), (-7, 4, z), (-7, 1, z)], BLUE, 0.45)
    i.path([(1, -5, z), (4, -5, z), (4, -1, z), (1, -1, z), (1, -5, z)], BLUE, 0.45)
    double(i, (-7, -6.2, z), (-1, -6.2, z), "orange", 0.45)
    i.box(2, 2.4, z, 6, 3.6, 0.3, "blue")
    return i


def nesting(i):
    """A raw panel and its parts packed in it, the saw cutting along them."""
    i.box(-10, -8, 0, 20, 16, 0.8)
    z = 0.8
    i.box(-9, -7, z, 9, 6, 0.5, "blue").box(1, -7, z, 8, 9, 0.5, "blue")
    i.box(-9, 0, z, 5, 7, 0.5, "blue").box(-3, 0, z, 3, 7, 0.5).box(1, 3, z, 8, 4, 0.5)
    i.dashes([i.p(0.5, -8, z + 0.5), i.p(0.5, 8, z + 0.5)], ORANGE, 0.45, 1.2, 0.8)
    i.disc(0.5, 8.6, z + 0.6, 2.2, "orange", "t")
    return i.disc(0.5, 8.6, z + 0.62, 0.6, "white", "t")


def edge_paint(i):
    """A board being edge-banded: the band in orange along its front edge, from its roll."""
    i.box(-9, -6, 0, 16, 12, 1.8)
    i.face([(-9, 6, 0), (3, 6, 0), (3, 6, 1.8), (-9, 6, 1.8)], "ol")
    i.face([(3, 6, 0), (8, 7.6, 0.4), (8, 7.6, 2.2), (3, 6, 1.8)], "ol")
    i.round(9.4, 7.6, 3.4, 3.4, 1.6, "orange", "y")
    return i.round(9.4, 9.2, 3.4, 1.2, 0.2, "white", "y")


def sheet(i, w=13, d=17):
    return i.box(-w / 2, -d / 2, 0, w, d, 0.6)


def cutlist(i):
    """A clipboard: the list of parts, each with its board and its size."""
    i.box(-7.5, -9.5, 0, 15, 19, 0.8, "dark")
    i.box(-6.5, -8.5, 0.8, 13, 17, 0.4)
    i.box(-2.5, -10, 1.2, 5, 2, 0.8, "dark")
    z = 1.2
    for k in range(4):
        y = -5.5 + k * 3.6
        i.box(-5.4, y - 0.9, z, 2.4, 1.8, 0.4, "blue" if k % 2 == 0 else "white")
        i.line((-1.6, y, z), (4.8, y, z), BLUE, 0.5)
    return i


def production_folder(i):
    """A folder of the job: its sheets and a drawing sticking out, its tab in orange."""
    i.box(-8, -6, 0, 16, 12, 0.6, "blue")
    i.box(-7, -7.2, 0.6, 13, 10, 0.4)
    i.box(-6, -8.2, 1, 12, 9, 0.4)
    i.path([(-4.5, -6.6, 1.4), (-0.5, -6.6, 1.4), (-0.5, -3.6, 1.4), (-4.5, -3.6, 1.4), (-4.5, -6.6, 1.4)], BLUE, 0.4)
    i.box(-8, -6, 1.4, 16, 12, 0.6, "blue")
    return i.box(-6, 5.2, 2, 5, 1.6, 0.3, "orange")


def batch(i):
    """Three cabinets made together: in a row on the same panel, one of them in blue."""
    i.box(-11, -5, 0, 22, 10, 0.8)
    for k, x in enumerate((-10, -3, 4)):
        i.box(x, -3.5, 0.8, 6, 6, 7)
        i.face([(x + 0.5, 2.5, 1.3), (x + 5.5, 2.5, 1.3), (x + 5.5, 2.5, 7.3), (x + 0.5, 2.5, 7.3)], "bl" if k == 1 else "wl")
    return i.arrow((-9, 6.6, 0.8), (9, 6.6, 0.8), "orange", 0.7)


def assembly_guide(i):
    """An open booklet: on its page, a cabinet whose side goes on, the arrow showing how."""
    i.face([(-10, -6, 0), (0, -6, 1.4), (0, 6, 1.4), (-10, 6, 0)], "wt")
    i.face([(0, -6, 1.4), (10, -6, 0), (10, 6, 0), (0, 6, 1.4)], "wt")
    i.line((0, -6, 1.4), (0, 6, 1.4), "#94a3b8", 0.35)
    for k in range(3):
        y = -3.6 + k * 2.6
        i.line((-8, y, 0.3 + 0.0), (-2, y, 1.1), BLUE, 0.45)
    i.box(2.5, -2, 1, 5, 4, 4.6, "blue")
    i.box(8.6, -2, 1, 0.7, 4, 4.6)
    return i.arrow((9.6, 0, 3.4), (7.8, 0, 3.4), "orange", 0.6)


def part_sheet(i):
    """A part's sheet: the board drawn with its holes to drill, measured."""
    sheet(i)
    z = 0.6
    i.box(-4.5, -5.5, z, 9, 7, 0.6, "blue")
    for x, y in ((-3, -4), (3, -4), (-3, 0), (3, 0)):
        i.disc(x, y, z + 0.62, 0.55, "white", "t")
    double(i, (-4.5, 2.6, z), (4.5, 2.6, z), "orange", 0.45)
    i.line((-4.5, 5, z), (2, 5, z), BLUE, 0.45)
    return i.line((-4.5, 6.6, z), (0, 6.6, z), BLUE, 0.45)


PRO = {
    "lighting": lighting, "plinth-tech": plinth_tech, "snack": snack, "worktop-bars": worktop_bars, "tech-plan": tech_plan,
    "cutout": cutout, "cloisons": cloisons, "push": push, "face-strip": face_strip, "drawing": drawing, "nesting": nesting,
    "edge-paint": edge_paint, "cutlist": cutlist, "production-folder": production_folder, "batch": batch,
    "assembly-guide": assembly_guide, "part-sheet": part_sheet,
}
