"""Le dessin des icônes de meubles (caissons, Répartition, dressing) : `i` est une scène de scripts/icons3d.py.
Penderie (i-rod) n'est plus ici : un pictogramme plat (un cintre et une silhouette), dessiné à la main dans le sprite."""


def cube(i, t="white", s=8):
    return i.box(-s / 2, -s / 2, -s / 2, s, s, s, t)


def plate(i, t="white", w=14, d=10, h=1.2, z=0):
    return i.box(-w / 2, -d / 2, z, w, d, h, t)


def carcass(i, w=11, d=6, h=14, t=1.1):
    """An open cabinet seen from the front: its back, in shade, then its left side and bottom."""
    i.box(-w / 2, -d / 2, 0, w, 0.3, h, "white")
    i.face([(-w / 2, -d / 2 + 0.3, 0), (w / 2, -d / 2 + 0.3, 0), (w / 2, -d / 2 + 0.3, h), (-w / 2, -d / 2 + 0.3, h)], "wr")
    i.box(-w / 2, -d / 2, 0, t, d, h, "white")
    i.box(-w / 2 + t, -d / 2, 0, w - 2 * t, d, t, "white")
    return i


def closed(i, w, d, h, t=1.1):
    i.box(w / 2 - t, -d / 2, 0, t, d, h, "white")
    return i.box(-w / 2, -d / 2, h - t, w, d, t, "white")


def cabinet(i):
    carcass(i)
    i.box(-4.4, -3, 4.6, 8.8, 6, 0.9, "blue").box(-4.4, -3, 8.8, 8.8, 6, 0.9, "white")
    closed(i, 11, 6, 14)


def fronts(i):
    i.box(-6, -3, 0, 12, 6, 14, "white")
    i.box(-5.7, 3, 0.3, 5.5, 0.4, 13.4, "blue").box(0.2, 3, 0.3, 5.5, 0.4, 13.4, "blue")
    i.box(-1.2, 3.4, 6, 0.5, 0.2, 2.4, "orange").box(0.7, 3.4, 6, 0.5, 0.2, 2.4, "orange")


def partition(i):
    """A wardrobe of three doors, one per bay, on its plinth."""
    i.box(-6.2, -2, 0, 12.4, 3.6, 1.3, "blue")
    i.box(-6.6, -2, 1.3, 13.2, 4, 17, "white")
    for k, x in enumerate((-6.3, -2.1, 2.1)):
        i.box(x, 2, 1.7, 4.2, 0.3, 16.2, "blue" if k == 1 else "white")
    for x in (-2.9, -1.4, 2.8):
        i.box(x, 2.3, 8.6, 0.5, 0.2, 2.8, "orange")


def shelves(i):
    carcass(i, 11, 6, 14)
    for z in (3.6, 6.8, 10):
        i.box(-4.4, -3, z, 8.8, 6, 0.9, "blue")
    closed(i, 11, 6, 14)


def cloisons(i):
    carcass(i, 14, 6, 12)
    for x in (-2.7, 1.8):
        i.box(x, -3, 1.1, 0.9, 6, 9.8, "blue")
    closed(i, 14, 6, 12)


def drawers(i):
    i.box(-6, -3.5, 0, 12, 7, 13, "white")
    for k, z in enumerate((0.9, 4.9, 8.9)):
        i.box(-5.4, 3.5, z, 10.8, 0.4, 3.3, "blue" if k == 1 else "white").box(-1.4, 3.9, z + 1.4, 2.8, 0.2, 0.5, "orange")


def dressing(i):
    carcass(i, 15, 6, 14)
    i.box(0.6, -3, 1.1, 0.9, 6, 11.8, "white")
    i.round(-6.4, 0, 11.6, 0.35, 7, "orange", "x")
    i.box(-5, -0.2, 5, 2.2, 0.4, 6.2, "blue").box(-2.2, -0.2, 5.6, 2.2, 0.4, 5.6, "blue")
    for z in (4, 7.4, 10.4):
        i.box(1.5, -3, z, 4.9, 6, 0.8, "white")
    closed(i, 15, 6, 14)


def niche(i):
    """The height of a niche: an arrow from the shelf under it to the shelf over it."""
    carcass(i, 11, 6, 15)
    i.box(-4.4, -3, 2.4, 8.8, 6, 0.9, "white").box(-4.4, -3, 11.2, 8.8, 6, 0.9, "white")
    i.face([(-4.4, -2.9, 3.3), (4.4, -2.9, 3.3), (4.4, -2.9, 11.2), (-4.4, -2.9, 11.2)], "bl")
    closed(i, 11, 6, 15)
    i.arrow((0, 3, 7.2), (0, 3, 11), "orange", 0.95).arrow((0, 3, 7.2), (0, 3, 3.4), "orange", 0.95)


def module(i):
    carcass(i, 11, 6, 15)
    i.box(-4.4, -3, 5.4, 8.8, 6, 0.9, "white")
    i.box(-4.4, 2.6, 1.3, 8.8, 0.4, 1.7, "blue").box(-4.4, 2.6, 3.4, 8.8, 0.4, 1.7, "blue")
    i.round(-4.4, 0, 12.6, 0.35, 8.8, "orange", "x")
    closed(i, 11, 6, 15)


def module_palette(i):
    """A module between two arrows: it moves, where the plain module stays put."""
    module(i)
    i.arrow((-4.6, 3, 7.5), (-8.8, 3, 7.5), "orange", 1.35).arrow((8.2, 3, 7.5), (12.4, 3, 7.5), "orange", 1.35)


def dressing_plan(i):
    plate(i, "white", 15, 15, 0.8)
    i.box(-7.5, -7.5, 0.8, 15, 3, 5, "blue").box(-7.5, -4.5, 0.8, 3, 12, 5, "blue")


def niche_copy(i):
    for x, t in ((-10, "white"), (3, "white")):
        i.box(x, -3, 0, 7.5, 6, 8, "white").box(x + 1, -2.9, 1, 5.5, 0.2, 6, "blue")
    i.arrow((-2.2, 3, 4), (3.2, 3, 4))


def niche_align(i):
    for x in (-8, -2.4, 3.2):
        i.box(x, -3, 0, 5, 6, 12, "white").box(x + 0.5, 3, 5.4, 4, 0.2, 1, "blue")
    i.line((-9.2, 3.2, 5.9), (9.6, 3.2, 5.9), "#ea580c", 0.5)


def dressing_style(i):
    dressing(i)
    i.ball(6, 3, 1.4, 3.3, "orange")


def door_fronts(i):
    i.box(-7, -3, 0, 14, 6, 12, "white")
    i.box(-6.6, 3, 0.4, 13.2, 0.5, 11.2, "blue")
    i.box(4.8, 3.5, 4.8, 0.6, 0.2, 2.4, "orange")


def doors_open(i):
    """A cabinet with its two doors swung wide open."""
    carcass(i, 11, 6, 14)
    closed(i, 11, 6, 14)
    i.face([(-5.5, 3, 0.3), (-7.6, 9, 0.3), (-7.6, 9, 13.7), (-5.5, 3, 13.7)], "bl")
    i.face([(5.5, 3, 0.3), (7.6, 9, 0.3), (7.6, 9, 13.7), (5.5, 3, 13.7)], "br")


def drawers_open(i):
    """A cabinet, its two drawers pulled out to the front."""
    i.box(-6, -4, 0, 12, 8, 13, "white")
    i.box(-5.4, 4, 7.2, 10.8, 5, 4.6, "blue").box(-5.4, 9, 7, 10.8, 0.9, 5, "white")
    i.box(-5.4, 4, 1.4, 10.8, 2.6, 4.6, "blue").box(-5.4, 6.6, 1.2, 10.8, 0.9, 5, "white")
    i.box(-1.6, 9.9, 9.2, 3.2, 0.4, 0.6, "orange").box(-1.6, 7.5, 3.4, 3.2, 0.4, 0.6, "orange")


def paneling(i):
    """A hollow box of panels, the near ones apart to show the mitred corner."""
    i.box(-6, -5, 0, 12, 10, 1.4, "white")
    i.box(-6, 3.6, 1.4, 12, 1.4, 8, "white").box(-6, -5, 1.4, 1.4, 8.6, 8, "white")
    i.box(4.6, -5, 1.4, 1.4, 8.6, 8, "blue").box(-4.6, -5, 1.4, 9.2, 1.4, 8, "blue")


def edge_paint(i):
    i.box(-7, -5, 0, 14, 10, 1.8, "white")
    i.face([(-7, 5, 0), (7, 5, 0), (7, 5, 1.8), (-7, 5, 1.8)], "ol")
    i.pencil(1, 5.6, 0.8)


def variants(i):
    """Three versions of one cabinet, one behind the other, the one in front in blue."""
    i.box(2, -8, 2.4, 11, 8, 11, "white").box(-1, -3, 1.2, 11, 8, 11, "white")
    i.box(-5, 2, 0, 11, 8, 11, "blue")
    cx, cy = i.p(6, 6, 5.5)
    i.mark([(cx - 5, cy - 2.4), (cx - 5, cy + 2.4)], "#ffffff", 0.9)


def live_check(i):
    """A board in a red frame, its mark of a part to look at."""
    i.box(-6, -6, -3, 12, 12, 6)
    i.wire(-8.5, -8.5, -5.5, 17, 17, 11, "#dc2626", 0.7)
    i.check(*i.p(0, 0, 3), 1.3)


# Drawn from the front: their insides show, as on the plan of a Répartition.
FACE = {"cabinet", "fronts", "partition", "shelves", "cloisons", "drawers", "dressing", "niche", "module", "niche-copy", "niche-align", "dressing-style", "door-fronts", "doors-open", "piece-dims", "part-tags", "module-palette"}

MEUBLES = {
    "cabinet": cabinet, "fronts": fronts, "partition": partition, "shelves": shelves, "cloisons": cloisons, "drawers": drawers,
    "dressing": dressing, "niche": niche, "module": module, "dressing-plan": dressing_plan, "niche-copy": niche_copy,
    "niche-align": niche_align, "dressing-style": dressing_style, "door-fronts": door_fronts, "doors-open": doors_open, "drawers-open": drawers_open, "paneling": paneling, "edge-paint": edge_paint,
    "variants": variants, "live-check": live_check, "module-palette": module_palette,
}
