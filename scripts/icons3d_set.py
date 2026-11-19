"""Le dessin des icônes d'outils : `i` est une scène de scripts/icons3d.py, x vers le bas à droite, y vers le bas à gauche."""
from icons3d_meubles import MEUBLES, plate
from icons3d_vue import VUE


def cube(i, t="white", s=8):
    return i.box(-s / 2, -s / 2, -s / 2, s, s, s, t)


def extrude(i):
    i.box(-6, -6, 0, 12, 12, 1, "blue").box(-4, -4, 1, 8, 8, 6)
    i.arrow((0, 0, 7), (0, 0, 13.5))


def revolve(i):
    i.round(0, 0, 0, 5, 7)
    i.turn(0, 0, 3.6, 8, 0.2, 4.4)


def plate_icon(i):
    plate(i, "white", 14, 11, 1.8)


def offset_edge(i):
    plate(i, "white", 14, 12, 1.4)
    i.path([(-5.2, -4.2, 1.4), (5.2, -4.2, 1.4), (5.2, 4.2, 1.4), (-5.2, 4.2, 1.4), (-5.2, -4.2, 1.4)], "#0284c7", 0.55)


def hole(i):
    i.box(-7, -7, 0, 14, 14, 6)
    i.disc(0, 0, 6, 3.5, "dark")
    i.arrow((0, 0, 14), (0, 0, 6.6))


def fillet(i):
    i.face([(-6, -6, 7), (5, -6, 7), (5, 5, 7), (-6, 5, 7)], "wt")
    i.face([(-6, 6, 0), (5, 6, 0), (5, 6, 6), (-6, 6, 6)], "wl")
    i.face([(6, -6, 0), (6, 5, 0), (6, 5, 6), (6, -6, 6)], "wr")
    i.face([(-6, 5, 7), (5, 5, 7), (5.7, 5.7, 6.7), (6, 6, 6), (-6, 6, 6)], "bt")
    i.face([(5, -6, 7), (5, 5, 7), (5.7, 5.7, 6.7), (6, 6, 6), (6, -6, 6)], "bl")


def chamfer(i):
    i.face([(-6, -6, 8), (6, -6, 8), (6, 2, 8), (2, 6, 8), (-6, 6, 8)], "wt")
    i.face([(-6, 6, 0), (2, 6, 0), (2, 6, 8), (-6, 6, 8)], "wl")
    i.face([(6, -6, 0), (6, 2, 0), (6, 2, 8), (6, -6, 8)], "wr")
    i.face([(2, 6, 0), (6, 2, 0), (6, 2, 8), (2, 6, 8)], "bl")


def combine(i):
    i.box(-7, -2, 0, 9, 8, 8).box(-2, -6, 3, 8, 8, 8, "blue")


def split(i):
    i.box(-8, -4, 0, 6, 8, 8)
    i.face([(-1, -6, -1), (-1, 6, -1), (-1, 6, 10), (-1, -6, 10)], "ol")
    i.box(0.4, -4, 0, 6, 8, 8, "blue")


def move(i):
    plate(i, "white", 11, 11, 1)
    i.arrow((0, 0, 1), (9.5, 0, 1)).arrow((0, 0, 1), (-9.5, 0, 1)).arrow((0, 0, 1), (0, 9.5, 1)).arrow((0, 0, 1), (0, -9.5, 1))


def move_3d(i):
    cube(i, "white", 7)
    i.arrow((3.5, 0, 0), (10, 0, 0), "blue").arrow((0, 3.5, 0), (0, 10, 0), "green").arrow((0, 0, 3.5), (0, 0, 10))


def shell(i):
    i.box(-6, -6, 0, 12, 0.9, 8).box(-6, -6, 0, 0.9, 12, 8).box(-5.1, -5.1, 0, 10.2, 10.2, 0.9, "blue")
    i.box(5.1, -6, 0, 0.9, 12, 8).box(-6, 5.1, 0, 11.1, 0.9, 8)


def hollow(i):
    """A body emptied: its walls kept, the inside dark, an arrow taking what was inside out."""
    i.box(-6, -6, 0, 12, 0.9, 8).box(-6, -6, 0, 0.9, 12, 8).box(-5.1, -5.1, 0, 10.2, 10.2, 0.9, "dark")
    i.box(5.1, -6, 0, 0.9, 12, 8).box(-6, 5.1, 0, 11.1, 0.9, 8)
    i.arrow((0, 0, 2.5), (0, 0, 13))


def loft(i):
    i.box(-7, -7, 0, 14, 14, 1, "blue")
    i.path([(-7, 7, 1), (-3, 3, 10)], "#94a3b8", 0.3).path([(7, 7, 1), (3, 3, 10)], "#94a3b8", 0.3).path([(7, -7, 1), (3, -3, 10)], "#94a3b8", 0.3)
    i.box(-3, -3, 10, 6, 6, 1)


def layers(i):
    i.box(-7, -7, 0, 14, 14, 1, "white").box(-7, -7, 3, 14, 14, 1, "white").box(-7, -7, 6, 14, 14, 1, "blue")


def modifier(i):
    i.box(-7, -5, 0, 14, 10, 2)
    i.turn(0, 0, 2.2, 5.5, 0.4, 4.6)


def linked_copy(i):
    i.box(-9, -3, 0, 6, 6, 6).box(4, -3, 0, 6, 6, 6, "blue")
    i.line((-3, 0, 3), (4, 0, 3), "#ea580c", 0.7)


def select_plus(i):
    cube(i, "blue", 9)
    i.cursor(0, 2, 2)


def mirror(i):
    i.box(-9, -3, 0, 6, 6, 7)
    i.face([(0, -7, -1), (0, 7, -1), (0, 7, 10), (0, -7, 10)], "bt")
    i.box(3, -3, 0, 6, 6, 7, "blue")


def mate(i):
    i.box(-8, -4, 0, 8, 8, 5).box(0, -4, 5, 8, 8, 5, "blue")
    i.arrow((10, 0, 13), (6, 0, 11))


def align(i):
    for k, h in enumerate((10, 6, 8)):
        i.box(-6 + k * 4.6, 0, 0, 3.6, 4, h, "blue" if k == 1 else "white")
    i.line((-7, 0, 0), (9, 0, 0), "#ea580c", 0.5)


def stretch(i):
    i.box(-6, -3, 0, 12, 6, 5, "blue")
    i.arrow((6, 0, 2.5), (12, 0, 2.5)).arrow((-6, 0, 2.5), (-12, 0, 2.5))


def array(i):
    for x in (-8, -2, 4):
        for y in (-8, -2, 4):
            i.box(x, y, 0, 4, 4, 4, "blue" if x + y == -16 else "white")


def rotate(i):
    cube(i, "white", 8)
    i.turn(0, 0, 4, 8.5, -0.6, 3.6)


def section(i):
    i.box(-6, -6, 0, 12, 6, 9)
    i.face([(-8, 0, -1), (8, 0, -1), (8, 0, 11), (-8, 0, 11)], "ot")


def machining(i):
    i.box(-8, -5, 0, 16, 10, 2)
    for x in (-5, -1, 3, 7):
        i.disc(x - 1, 2.5, 2, 0.9, "dark")


def cutout(i):
    i.box(-7, -7, 0, 14, 14, 2)
    i.face([(-3, -3, 2), (4, -3, 2), (4, 4, 2), (-3, 4, 2)], "dr")


def assembly(i):
    i.box(-8, -4, 0, 16, 8, 1.6).box(-8, -4, 1.6, 1.6, 8, 10)
    i.round(-7.2, 0, 6, 0.5, 6, "orange", "x")


def kitchen(i):
    i.box(-9, -3, 0, 18, 6, 7).box(-9.4, -3, 7, 18.8, 6.8, 0.8, "dark").box(-9, -3, 11, 18, 3, 5)
    i.box(-8.6, 3, 0.6, 5.4, 0.3, 5.8, "blue").box(-2.7, 3, 0.6, 5.4, 0.3, 5.8, "blue").box(3.2, 3, 0.6, 5.4, 0.3, 5.8, "blue")


def kitchen_plan(i):
    # The plan on the floor, its runs drawn in line only: an L along two walls and an island.
    i.box(-9, -9, 0, 18, 18, 0.8)
    i.wire(-9, -9, 0.8, 18, 4.5, 6).wire(-9, -4.5, 0.8, 4.5, 13.5, 6).wire(-2, 2.5, 0.8, 9, 4.5, 6)


def kitchen_units(i):
    for x in (-9, -3, 3):
        i.box(x, -3, 0, 5.6, 6, 8, "blue" if x == -3 else "white")


def lighting(i):
    i.box(-7, -3, 7, 14, 6, 1.2)
    i.box(-6, -1, 6.2, 12, 1.4, 0.8, "yellow")
    i.face([(-6, 0.4, 6.2), (6, 0.4, 6.2), (7, 2, 3), (-7, 2, 3)], "yt")


def gable(i):
    i.face([(-7, 0, 0), (7, 0, 0), (7, 0, 8), (0, 0, 13), (-7, 0, 8)], "wl")
    i.face([(7, 0, 0), (7, -1.4, 0), (7, -1.4, 8), (7, 0, 8)], "wr")
    i.face([(-7, 0, 8), (0, 0, 13), (0, -1.4, 13), (-7, -1.4, 8)], "bt")
    i.face([(0, 0, 13), (7, 0, 8), (7, -1.4, 8), (0, -1.4, 13)], "bl")


def intersect(i):
    i.box(-7, -2, 0, 9, 8, 8).box(-2, -6, 3, 8, 8, 8)
    i.box(-2, -2, 3, 4, 4, 5, "blue")


def weight(i):
    i.face([(-3.6, -3.6, 8), (3.6, -3.6, 8), (3.6, 3.6, 8), (-3.6, 3.6, 8)], "wt")
    i.face([(-5, 5, 0), (5, 5, 0), (3.6, 3.6, 8), (-3.6, 3.6, 8)], "wl")
    i.face([(5, 5, 0), (5, -5, 0), (3.6, -3.6, 8), (3.6, 3.6, 8)], "wr")
    i.round(0, 0, 8, 1.6, 1.4, "blue")


def sag(i):
    i.box(-9, -3, 0, 1.2, 6, 8).box(7.8, -3, 0, 1.2, 6, 8)
    i.path([(-7.8, 3, 6), (-3, 3, 5), (0, 3, 4.6), (3, 3, 5), (7.8, 3, 6)], "#0284c7", 1.1)


def progress(i):
    for k, x in enumerate((-9, -3, 3)):
        i.box(x, -3, 0, 5, 6, 2 + k * 3, "blue" if k == 2 else "white")


def room(i):
    i.box(-7, -7, 0, 14, 14, 0.8)
    i.box(-7, -7, 0.8, 14, 0.9, 10).box(-7, -6.1, 0.8, 0.9, 13.1, 10)
    i.box(0, 1, 0.8, 5, 4, 5, "blue")


def finishing(i):
    i.box(-7, -3, 1.4, 14, 6, 11)
    i.box(-7, -3, 0, 14, 6.8, 1.4, "blue")


def standard(i):
    for z in (0, 2, 4):
        i.box(-7, -6, z, 14, 12, 1.5)
    i.check(0, 0, 1.1)


def overlap(i):
    i.box(-8, -4, 0, 11, 8, 1.8).box(-3, -4, 1.8, 11, 8, 1.8, "orange")


def offcuts(i):
    i.face([(-7, -7, 1), (7, -7, 1), (7, 1, 1), (0, 1, 1), (0, 7, 1), (-7, 7, 1)], "wt")
    i.box(3, 3, 0, 4, 4, 1.8, "blue")


def batch(i):
    for k in (0, 1, 2):
        i.box(-6 + k * 2.2, -5 - k * 1.2, k * 1.6, 12, 10, 1.2, "blue" if k == 2 else "white")


def layout_copy(i):
    i.box(-10, -5, 0, 8, 10, 1.2).box(3, -5, 0, 8, 10, 1.2, "blue")
    i.arrow((-2, 0, 1.2), (4, 0, 1.2))


def replace_icon(i):
    i.box(-9, -3, 0, 6, 6, 3).box(4, -3, 0, 6, 6, 3, "blue")
    i.arrow((-3, -2, 3), (4, -2, 3)).arrow((4, 2, 3), (-3, 2, 3), "blue")


def hardware(i):
    i.round(0, 0, 0, 1, 11, "white")
    i.round(0, 0, 11, 3, 1.6, "blue")


def library(i):
    for k, t in enumerate(("white", "blue", "white", "orange")):
        i.box(-7 + k * 3.2, -4, 0, 2.6, 8, 11 - (k % 2) * 2, t)


def assembly_guide(i):
    i.box(-7, -6, 0, 14, 12, 1.2)
    i.box(-4, -3, 1.2, 5, 5, 5, "blue")
    i.arrow((5, 3, 8), (2, 1, 4.4))


def check_fab(i):
    i.box(-7, -7, 0, 14, 14, 2.2)
    i.check(0, -2.4, 1.6)


def sheet(i, marks="blue"):
    i.box(-6, -8, 0, 12, 16, 0.6)
    return i


def rows(i, count=4, t="#0284c7"):
    for k in range(count):
        y = -6 + k * 3.8
        i.line((-4, y, 0.6), (4, y, 0.6), t, 0.5)
    return i


def part_sheet(i):
    rows(sheet(i), 2)
    i.box(-3.6, 1.6, 0.6, 7, 4.6, 1.2, "blue")


def labels(i):
    i.box(-8, -5, 0, 16, 10, 0.8)
    i.disc(-5, 2.4, 0.8, 1.2, "dark")
    i.line((-1, -2, 0.8), (6, -2, 0.8), "#0284c7", 0.6).line((-1, 1, 0.8), (6, 1, 0.8), "#0284c7", 0.6)


def cutlist(i):
    rows(sheet(i))


def quote(i):
    rows(sheet(i), 3)
    i.box(-3.6, 5, 0.6, 7, 2, 0.5, "orange")


def dxf(i):
    sheet(i)
    i.path([(-4, 5, 0.6), (-4, -4, 0.6), (4, -4, 0.6), (4, 1, 0.6), (0, 1, 0.6), (0, 5, 0.6), (-4, 5, 0.6)], "#0284c7", 0.5)


def gcode(i):
    i.box(-7, -7, 0, 14, 14, 1.6)
    i.path([(-5, 5, 1.6), (-5, -5, 1.6), (-2, -5, 1.6), (-2, 5, 1.6), (1, 5, 1.6), (1, -5, 1.6), (4, -5, 1.6), (4, 5, 1.6)], "#ea580c", 0.45)


def nesting(i):
    i.box(-8, -8, 0, 16, 16, 0.7)
    i.box(-7, -7, 0.7, 7, 9, 0.5, "blue").box(1, -7, 0.7, 6, 5, 0.5).box(1, -1, 0.7, 6, 8, 0.5, "blue").box(-7, 3, 0.7, 7, 4, 0.5)


def panels(i):
    for k in (0, 1, 2):
        i.box(-7 + k * 3.6, -5, 0, 1.2, 10, 12, "blue" if k == 1 else "white")


def production_folder(i):
    i.box(-7, -5, 0, 14, 10, 1.2, "blue").box(-6, -4, 1.2, 12, 8, 0.7).box(-7, -5, 1.9, 14, 10, 1.2, "white")


def import_parts(i):
    i.box(-7, -5, 0, 14, 10, 2)
    i.arrow((0, 0, 11), (0, 0, 2.6))


def hidden_joints(i):
    i.box(-7, -4, 0, 14, 8, 1.4).box(-7, -4, 1.4, 1.4, 8, 10)
    for y in (-2, 2):
        i.round(-6.3, y, -0.6, 0.45, 3.6, "orange")


def oi_intersect(i):
    i.box(-8, -4, 0, 16, 8, 1.6).box(-1, -8, 0, 2, 16, 8, "blue")


def ffd(i):
    i.wire(-7, -7, 0, 14, 14, 11, "#38bdf8", 0.34)
    for p in ((-7, 7, 0), (7, 7, 0), (7, -7, 0), (-7, 7, 11), (7, 7, 11), (7, -7, 11), (-7, -7, 11)):
        i.ball(*p, 1.2, "orange")


def swap(i):
    i.box(-9, -3, 0, 6, 6, 6).box(4, -3, 0, 6, 6, 6, "blue")
    i.arrow((-3, -1.6, 6), (5, -1.6, 6)).arrow((5, 1.6, 2), (-3, 1.6, 2), "blue")


def pull_face(i):
    i.box(-6, -6, 0, 12, 12, 7)
    i.face([(-6, -6, 7), (6, -6, 7), (6, 6, 7), (-6, 6, 7)], "bt")
    i.arrow((0, 0, 7), (0, 0, 14))


def move_edge(i):
    i.box(-6, -6, 0, 12, 12, 7)
    i.line((-6, 6, 7), (6, 6, 7), "#0284c7", 0.9)
    i.arrow((0, 6, 7), (0, 12, 7))


def spacing(i):
    i.box(-9, -3, 0, 2, 6, 11).box(7, -3, 0, 2, 6, 11)
    i.arrow((-2, 0, 5.5), (-7, 0, 5.5)).arrow((2, 0, 5.5), (7, 0, 5.5))


def extrude_path(i):
    i.path([(-9, 7, 0), (-2, 7, 0), (-2, -6, 0), (9, -6, 0)], "#ea580c", 0.8)
    i.box(-4.6, -1.6, -1.6, 5, 5, 3.6, "blue")


def sweep(i):
    i.path([(-8, 6, 0), (-3, 6, 0), (0, 3, 0), (0, -3, 0), (3, -6, 0), (9, -6, 0)], "#0f76c8", 2.6)
    i.path([(-8, 6, 0.5), (-3, 6, 0.5), (0, 3, 0.5), (0, -3, 0.5), (3, -6, 0.5), (9, -6, 0.5)], "#7fd0ff", 0.8)


def rect_array(i):
    for x in (-8, -1, 6):
        i.box(x, -3, 0, 5, 6, 5, "blue" if x == -8 else "white")


def motion(i):
    i.box(-5, -3, 0, 10, 6, 13)
    i.box(-5, 3, 0, 1, 8, 13, "blue")
    i.turn(-5, 3, 13.4, 7, 1.9, 0.5)


def drawing(i):
    i.box(-8, -6, 0, 16, 12, 0.6)
    i.box(-5, -3, 0.6, 5, 5, 4, "blue")
    i.path([(2, -3, 0.6), (6, -3, 0.6), (6, 2, 0.6), (2, 2, 0.6), (2, -3, 0.6)], "#0284c7", 0.4)


def scenes(i):
    i.box(-6, -4, 0, 12, 8, 7, "dark")
    i.ball(-1, 4, 3.5, 2.5, "blue")
    i.box(1, -2, 7, 3, 3, 1.2, "white")


def render(i):
    i.box(-9, -9, 0, 18, 18, 0.6)
    i.ball(0, 0, 6.5, 6, "blue")


def render_studio(i):
    i.box(-9, -9, 0, 18, 18, 0.6).box(-9, -9, 0.6, 18, 0.6, 11)
    i.ball(1, 1, 5, 4.4, "orange")


def appearance(i):
    i.ball(0, 0, 5, 6, "white")
    i.ball(-3, 3, 7, 1.7, "blue").ball(3, 3, 6, 1.7, "orange").ball(0, 5, 3, 1.7, "green")


def material(i):
    for z, t in ((0, "white"), (2, "white"), (4, "blue")):
        i.box(-8, -5, z, 16, 10, 1.6, t)


def measure(i):
    i.box(-9, -2, 0, 18, 4, 1)
    for x in (-7, -4, -1, 2, 5, 8):
        i.line((x, 2, 1), (x, 0.4 if x % 3 == 2 else 1, 1), "#334155", 0.3)


def view_iso(i):
    cube(i, "blue", 10)


def view_front(i):
    i.box(-5, -5, -5, 10, 10, 10)
    i.face([(-5, 5, -5), (5, 5, -5), (5, 5, 5), (-5, 5, 5)], "bl")


def view_top(i):
    i.box(-5, -5, -5, 10, 10, 10)
    i.face([(-5, -5, 5), (5, -5, 5), (5, 5, 5), (-5, 5, 5)], "bt")


def view_right(i):
    i.box(-5, -5, -5, 10, 10, 10)
    i.face([(5, -5, -5), (5, 5, -5), (5, 5, 5), (5, -5, 5)], "bl")


def xray(i):
    i.wire(-6, -6, 0, 12, 12, 11, "#94a3b8", 0.3)
    i.box(-3, -3, 0, 6, 6, 5, "blue")


def display(i):
    i.box(-7, -3, 0, 14, 6, 1.1, "white").box(-7, -3, 3.6, 14, 6, 1.1, "blue").box(-7, -3, 7.2, 14, 6, 1.1, "white")


def assistant(i):
    i.box(-6, -6, 0, 12, 12, 1.2)
    for x, y, s in ((0, 0, 3.2), (4.6, -3, 1.6), (-3.6, 4, 1.4)):
        cx, cy = i.p(x, y, 5)
        i.flat([(cx, cy - s * 1.6), (cx + s * 0.35, cy - s * 0.35), (cx + s * 1.6, cy), (cx + s * 0.35, cy + s * 0.35), (cx, cy + s * 1.6), (cx - s * 0.35, cy + s * 0.35), (cx - s * 1.6, cy), (cx - s * 0.35, cy - s * 0.35)], "ol")


ICONS = {
    **MEUBLES,
    **VUE,
    "extrude": extrude, "revolve": revolve, "plate": plate_icon, "offset-edge": offset_edge, "hole": hole, "fillet": fillet,
    "chamfer": chamfer, "combine": combine, "split": split, "move": move, "move-3d": move_3d, "shell": shell, "hollow": hollow, "loft": loft,
    "layers": layers, "modifier": modifier, "linked-copy": linked_copy,
    "select-plus": select_plus, "mirror": mirror, "mate": mate, "align": align, "stretch": stretch,
    "array": array, "rotate": rotate, "section": section, "machining": machining, "cutout": cutout, "assembly": assembly,
    "kitchen": kitchen, "kitchen-plan": kitchen_plan, "kitchen-units": kitchen_units, "lighting": lighting,
    "gable": gable, "intersect": intersect, "weight": weight, "sag": sag, "progress": progress, "room": room,
    "finishing": finishing, "standard": standard, "overlap": overlap, "offcuts": offcuts, "batch": batch,
    "layout-copy": layout_copy, "replace": replace_icon, "hardware": hardware, "library": library,
    "assembly-guide": assembly_guide, "check-fab": check_fab, "part-sheet": part_sheet, "labels": labels, "cutlist": cutlist,
    "quote": quote, "dxf": dxf, "gcode": gcode, "nesting": nesting, "panels": panels, "production-folder": production_folder,
    "import-parts": import_parts, "hidden-joints": hidden_joints, "oi-intersect": oi_intersect, "ffd": ffd, "swap": swap,
    "pull-face": pull_face, "move-edge": move_edge, "spacing": spacing, "extrude-path": extrude_path, "sweep": sweep,
    "rect-array": rect_array, "motion": motion, "drawing": drawing, "scenes": scenes, "render": render,
    "render-studio": render_studio, "appearance": appearance, "material": material, "measure": measure,
    "view-iso": view_iso, "view-front": view_front, "view-top": view_top, "view-right": view_right, "xray": xray,
    "display": display, "assistant": assistant,
}

# The kitchen and making tools drawn again, more telling (scripts/icons3d_pro.py): they take the place of those above.
from icons3d_pro import PRO  # noqa: E402

ICONS.update(PRO)
