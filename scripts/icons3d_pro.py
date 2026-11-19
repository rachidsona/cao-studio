"""
Icônes plus parlantes pour la cuisine et la fabrication, dans le style des meubles de icons3d_meubles.py : un seul
objet, gros, vu de face le plus souvent (FRONT : x en travers, z en haut, y vers soi), le bleu pour ce qui compte,
l'orange pour ce qui agit. Elles remplacent celles du même nom de icons3d_set.py ; les autres sont vues en
perspective (x vers le bas à droite, y vers le bas à gauche, z en haut).
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


def star(i, cx, cy, r, fill="yt"):
    """A spark of four points, on the screen plane."""
    return i.flat([(cx + (r if k % 2 == 0 else r * 0.38) * cos(k * pi / 4 - pi / 2), cy + (r if k % 2 == 0 else r * 0.38) * sin(k * pi / 4 - pi / 2)) for k in range(8)], fill)


def double(i, a, b, tone="orange", w=0.7):
    """A dimension: an arrow both ways between a and b."""
    mid = tuple((p + q) / 2 for p, q in zip(a, b))
    return i.arrow(mid, b, tone, w).arrow(mid, a, tone, w)


def lighting(i):
    """A wall unit from the front, three spots under it, their beams on the worktop."""
    i.box(-9, -3, 0, 18, 6, 1.4, "dark")
    for x in (-5.5, 0, 5.5):
        i.face([(x - 0.8, 2, 9.6), (x + 0.8, 2, 9.6), (x + 2.8, 3, 1.4), (x - 2.8, 3, 1.4)], "yt")
    i.box(-8, -3, 10, 16, 4.6, 6)
    i.box(-7.7, 1.6, 10.3, 7.4, 0.3, 5.4, "blue").box(0.3, 1.6, 10.3, 7.4, 0.3, 5.4, "blue")
    for x in (-5.5, 0, 5.5):
        i.round(x, 0.4, 9.4, 0.9, 0.6, "yellow")
    return i


def plinth_tech(i):
    """A base unit, its plinth brought forward to show the ventilation grille in it."""
    i.box(-8, -3, 4.2, 16, 6.4, 10.8)
    i.box(-7.7, 3.4, 4.5, 7.4, 0.3, 10.2, "blue").box(0.3, 3.4, 4.5, 7.4, 0.3, 10.2, "blue")
    i.box(-8, 3.6, 0, 16, 1.2, 3.4)
    i.box(-5, 4.8, 0.6, 10, 0.2, 2.2, "dark")
    for k in range(7):
        x = -4.2 + k * 1.4
        i.line((x, 5.02, 0.9), (x, 5.02, 2.5), "#cbd5e1", 0.5)
    return i


def snack(i):
    """An island, its worktop running out over a bar stool."""
    i.box(-9, -3, 0, 9, 6, 9.4)
    i.box(-8.7, 3, 0.3, 8.4, 0.3, 8.8, "blue")
    i.box(-9.6, -3.4, 9.4, 17.4, 6.8, 1.3)
    i.box(4.2, 0.4, 0, 0.7, 0.7, 6.4, "dark").box(2.6, 0.4, 2.6, 3.9, 0.7, 0.5, "dark")
    return i.box(2.2, -0.8, 6.4, 4.7, 3.2, 1.2, "orange")


def worktop_bars(i):
    """A run of base units, its worktop in three bars, the one in the middle measured."""
    i.box(-10.4, -3, 0, 20.8, 5.6, 5)
    for x, w, t in ((-11, 6.8, "white"), (-3.9, 7.8, "blue"), (4.2, 6.8, "white")):
        i.box(x, -3.2, 5, w, 6.4, 2.2, t)
    for x in (-3.9, 3.9):
        i.line((x, 3.2, 7.8), (x, 3.2, 11.6), ORANGE, 0.45)
    return double(i, (-3.9, 3.2, 10.4), (3.9, 3.2, 10.4), "orange", 0.75)


def tech_plan(i):
    """A wall and what comes out of it: cold water in blue, hot in orange, the drain, a socket."""
    i.box(-8.5, -2, 0, 17, 1, 15.5)
    i.round(-3, -1, 1.4, 1.5, 2, "dark", "y")
    i.round(-5.4, -1, 5.6, 1, 3.2, "blue", "y")
    i.round(-1.4, -1, 5.6, 1, 3.2, "orange", "y")
    i.box(2.2, -1, 8, 5, 0.9, 5)
    for x in (3.4, 5.4):
        i.round(x, -0.1, 10.5, 0.45, 0.12, "dark", "y")
    return i


def worktop_base(i):
    """A base unit, its blue doors, its worktop: the top of the worktop at z = 10.4."""
    i.box(-8.4, -5, 0, 16.8, 9.4, 8)
    i.face([(-8, 4.4, 0.4), (-0.2, 4.4, 0.4), (-0.2, 4.4, 7.6), (-8, 4.4, 7.6)], "bl")
    i.face([(0.2, 4.4, 0.4), (8, 4.4, 0.4), (8, 4.4, 7.6), (0.2, 4.4, 7.6)], "bl")
    i.box(-9.4, -6, 8, 18.8, 11.4, 2.4)
    return 10.4


def cutout(i):
    """A base unit and its worktop, the sink and its tap set in it, the outline of the cut in orange dashes."""
    z = worktop_base(i)
    i.dashes([i.p(-8, -4.4, z), i.p(1.4, -4.4, z), i.p(1.4, 4.4, z), i.p(-8, 4.4, z)], ORANGE, 0.55, 1.4, 0.9)
    i.face([(-7.2, -3.6, z), (0.6, -3.6, z), (0.6, 3.6, z), (-7.2, 3.6, z)], "wr")
    i.face([(-6.4, -2.8, z - 0.02), (-0.2, -2.8, z - 0.02), (-0.2, 2.8, z - 0.02), (-6.4, 2.8, z - 0.02)], "dl")
    i.disc(-3.3, 0, z, 0.6, "white", "t")
    i.round(5.2, -3.2, z, 0.55, 5.4, "white")
    return i.box(4.9, -3.2, z + 5, 0.6, 4.2, 0.7, "white")


def kitchen_plan(i):
    """A blueprint standing, the kitchen drawn on it in white (an L of units, an island), a pencil on it."""
    i.box(-8, -0.5, 0, 16, 1, 16, "blue")
    y = 0.52
    i.path([(-6.4, y, 14.4), (6.4, y, 14.4), (6.4, y, 11.6), (-3.6, y, 11.6), (-3.6, y, 1.6), (-6.4, y, 1.6), (-6.4, y, 14.4)], "#ffffff", 0.75)
    i.path([(-0.4, y, 7.8), (5.2, y, 7.8), (5.2, y, 4.6), (-0.4, y, 4.6), (-0.4, y, 7.8)], "#ffffff", 0.75)
    return i.pencil(5.4, y, 2.6, 11, 1.5)


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
    """A thick board, a piece of it pulled out of its hole, lifted over it."""
    i.box(-9, -7, 0, 18, 14, 3.2)
    i.face([(-5, -4, 3.2), (5, -4, 3.2), (5, 4, 3.2), (-5, 4, 3.2)], "dr")
    i.face([(-5, -4, 3.2), (5, -4, 3.2), (5, -4, 1.2), (-5, -4, 1.2)], "dl")
    i.face([(-5, -4, 3.2), (-5, 4, 3.2), (-5, 4, 1.2), (-5, -4, 1.2)], "dt")
    i.box(-5, -4, 8.4, 10, 8, 2.2, "blue")
    return i.arrow((0, 0, 11.4), (0, 0, 16.4), "orange", 0.95)


def drawing(i):
    """A drawing sheet: a cabinet drawn from the front, measured, its title block."""
    i.box(-7, -0.5, 0, 14, 1, 17)
    z, y = 0.5, 0.52
    i.path([(-4.8, y, 5), (4.8, y, 5), (4.8, y, 14.6), (-4.8, y, 14.6), (-4.8, y, 5)], BLUE, 0.6)
    i.line((0, y, 5), (0, y, 14.6), BLUE, 0.5)
    i.line((-1.2, y, 9), (-1.2, y, 11), ORANGE, 0.5).line((1.2, y, 9), (1.2, y, 11), ORANGE, 0.5)
    double(i, (-4.8, y, 3.3), (4.8, y, 3.3), "orange", 0.55)
    return i.box(1.4, 0.5, 0.6, 4.8, 0.2, 1.6, "blue")


def nesting(i):
    """A raw panel standing, the parts packed in it, the saw cutting between them."""
    i.box(-8.5, -0.6, 0, 17, 1.2, 14)
    y = 0.6
    i.box(-7.8, y, 0.7, 7.4, 0.3, 6.6, "blue").box(0.4, y, 0.7, 7.4, 0.3, 4.4, "blue")
    i.box(-7.8, y, 7.9, 4.4, 0.3, 5.4, "blue").box(-2.8, y, 7.9, 2.4, 0.3, 5.4).box(0.4, y, 5.7, 7.4, 0.3, 7.6, "blue")
    i.round(0, 0.9, 15.4, 3, 0.6, "orange", "y")
    return i.round(0, 1.5, 15.4, 0.8, 0.1, "white", "y")


def edge_paint(i):
    """A thick board, its front edge banded in orange from the roll."""
    i.box(-9, -6, 0, 14, 12, 3)
    i.face([(-9, 6, 0), (1, 6, 0), (1, 6, 3), (-9, 6, 3)], "ol")
    i.face([(1, 6, 0), (5.6, 7.6, 0.6), (5.6, 7.6, 3.6), (1, 6, 3)], "ol")
    i.round(8.4, 7.6, 4.4, 4.4, 2, "orange", "y")
    return i.round(8.4, 9.6, 4.4, 1.5, 0.2, "white", "y")


def cutlist(i):
    """A clipboard and its list: each part, its board and its size."""
    i.box(-6.8, -0.8, 0, 13.6, 1, 17.4, "dark")
    i.box(-5.8, 0.2, 0.8, 11.6, 0.3, 14.8)
    i.box(-2.6, -0.6, 15.2, 5.2, 1.5, 2.6, "blue")
    y = 0.52
    for k in range(4):
        z = 12.4 - k * 3.2
        i.box(-4.6, y, z - 0.9, 2, 0.2, 1.8, "orange" if k == 0 else "blue")
        i.line((-1.8, y + 0.2, z), (4.4, y + 0.2, z), BLUE, 0.7)
    return i


def production_folder(i):
    """The folder of the job, its sheets sticking out, its label in orange."""
    i.box(-8, -1.2, 0, 16, 0.6, 12.4, "blue").box(-8, -1.2, 12.4, 6.4, 0.6, 1.8, "blue")
    i.box(-7, -0.6, 1, 14, 0.3, 12.8).box(-6.2, -0.3, 1, 13, 0.3, 12)
    i.box(-8, 0, 0, 16, 0.6, 9.6, "blue")
    return i.box(-3, 0.6, 4.4, 6, 0.2, 1.8, "orange")


def batch(i):
    """Three cabinets made together, in a row on the line, the way it goes in orange."""
    i.box(-10, -3.4, 0, 20, 7, 1.4, "dark")
    for k, x in enumerate((-9.2, -2.9, 3.4)):
        i.box(x, -2.8, 1.4, 5.8, 5.6, 9)
        i.box(x + 0.3, 2.8, 1.7, 5.2, 0.3, 8.4, "blue")
        i.box(x + 2.65, 3.1, 6.6, 0.5, 0.2, 2.2, "orange")
    return i.arrow((-8, 3.7, -1.4), (8.6, 3.7, -1.4), "orange", 0.8)


def assembly_guide(i):
    """The assembly sheet behind, and a cabinet whose side goes on, the arrow showing how."""
    i.box(-9, -3, 3, 9, 0.6, 13)
    for k in range(3):
        z = 13.6 - k * 2.6
        i.line((-7.6, -2.38, z), (-1.4, -2.38, z), BLUE, 0.6)
    i.box(-3, -1, 0, 7, 5, 8.6)
    i.box(-2.7, 4, 0.3, 6.4, 0.3, 8, "blue")
    i.box(6.8, -1, 0, 0.9, 5, 8.6, "blue")
    return i.arrow((10.4, 2.4, 4.3), (8, 2.4, 4.3), "orange", 0.75)


def part_sheet(i):
    """A part's sheet: its board drawn with the holes to drill, measured."""
    i.box(-6.8, -0.5, 0, 13.6, 1, 17)
    y = 0.5
    i.box(-5.2, y, 5.4, 10.4, 0.3, 7.2, "blue")
    for x, z in ((-3.6, 7), (3.6, 7), (-3.6, 11), (3.6, 11)):
        i.round(x, y + 0.3, z, 0.7, 0.12, "white", "y")
    double(i, (-5.2, y, 3.6), (5.2, y, 3.6), "orange", 0.55)
    return i.line((-5.2, y + 0.02, 14.8), (1.6, y + 0.02, 14.8), BLUE, 0.7)


# Seen from the front, as the cabinets are.
FRONT = {"kitchen-plan", "lighting", "plinth-tech", "snack", "worktop-bars", "tech-plan", "drawing", "nesting", "cutlist", "production-folder", "batch", "assembly-guide", "part-sheet"}

PRO = {
    "lighting": lighting, "plinth-tech": plinth_tech, "snack": snack, "worktop-bars": worktop_bars, "tech-plan": tech_plan,
    "cutout": cutout, "kitchen-plan": kitchen_plan, "cloisons": cloisons, "push": push, "face-strip": face_strip, "drawing": drawing, "nesting": nesting,
    "edge-paint": edge_paint, "cutlist": cutlist, "production-folder": production_folder, "batch": batch,
    "assembly-guide": assembly_guide, "part-sheet": part_sheet,
}
