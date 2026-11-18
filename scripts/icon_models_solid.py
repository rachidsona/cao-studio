"""
Les solides de forme libre des modèles d'icônes en volumes (icon_models_studio.py) : des faces planes données par
leurs sommets dans l'espace, dont on garde celles tournées vers l'œil, du fond vers l'avant — de quoi dessiner une
pyramide, un toit, un tronc, une planche cintrée ou un cylindre. Une face presque horizontale prend la sorte du
dessus, les autres « < » ou « > » selon le côté où elles regardent.
"""
from math import atan2, cos, pi, sin

from icon_models_studio import VIEW, iso


def eye():
    """The direction toward the eye, in the space: along it, a point does not move on the icon."""
    v = VIEW
    return (-v["ay"], v["ax"], -v["bx"] * v["ay"] + v["by"] * v["ax"])


def normal(pts):
    nx = ny = nz = 0.0
    for (x1, y1, z1), (x2, y2, z2) in zip(pts, pts[1:] + pts[:1]):
        nx, ny, nz = nx + (y1 - y2) * (z1 + z2), ny + (z1 - z2) * (x1 + x2), nz + (x1 - x2) * (y1 + y2)
    size = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1
    return nx / size, ny / size, nz / size


def solid(o, faces, inside, kind="F", top=None, kinds=None):
    """The faces one sees of a solid around the point inside, back to front: each (kind, path)."""
    E = eye()
    out = []
    for i, pts in enumerate(faces):
        nx, ny, nz = normal(pts)
        c = [sum(p[k] for p in pts) / len(pts) for k in range(3)]
        if (c[0] - inside[0]) * nx + (c[1] - inside[1]) * ny + (c[2] - inside[2]) * nz < 0:
            nx, ny, nz = -nx, -ny, -nz
        if nx * E[0] + ny * E[1] + nz * E[2] <= 1e-6:
            continue
        k = (kinds or {}).get(i)
        if not k:
            k = (top or kind) if nz > 0.55 else kind + ("<" if VIEW["ax"] * nx + VIEW["ay"] * ny < 0 else ">")
        out.append((c[0] * E[0] + c[1] * E[1] + c[2] * E[2], i, k, iso(o, *pts)))
    return [(k, d) for _, _, k, d in sorted(out)]


def frustum(o, bottom, top_pts, kind="F", top=None):
    """A solid from a bottom outline to a top one (as many points), its bottom hidden."""
    sides = [[a, b, d, c] for a, b, c, d in zip(bottom, bottom[1:] + bottom[:1], top_pts, top_pts[1:] + top_pts[:1])]
    inside = [sum(p[k] for p in bottom + top_pts) / (2 * len(bottom)) for k in range(3)]
    return solid(o, sides + [top_pts], inside, kind, top)


def slab(o, profile, y0, y1, kind="F", top=None, front=None, accent=()):
    """A profile (X, Z) drawn counter-clockwise, run from y0 to y1: a moulding, a bent board; the strips from the
    profile's edges numbered in accent are of the kind H."""
    strips = [[(x1, y0, z1), (x2, y0, z2), (x2, y1, z2), (x1, y1, z1)] for (x1, z1), (x2, z2) in zip(profile, profile[1:] + profile[:1])]
    E = eye()
    out = []
    for i, ((x1, z1), (x2, z2), pts) in enumerate(zip(profile, profile[1:] + profile[:1], strips)):
        nx, nz = z2 - z1, x1 - x2  # outward for a counter-clockwise profile
        size = (nx * nx + nz * nz) ** 0.5 or 1
        nx, nz = nx / size, nz / size
        if nx * E[0] + nz * E[2] <= 1e-6:
            continue
        base = "H" if i in accent else kind
        k = (base if i in accent else top or kind) if nz > 0.55 else base + ("<" if VIEW["ax"] * nx < 0 else ">")
        out.append(((x1 + x2) / 2 * E[0] + (z1 + z2) / 2 * E[2], k, iso(o, *pts)))
    faces = [(k, d) for _, k, d in sorted(out)]
    end = iso(o, *((x, y1, z) for x, z in profile))
    return faces + [(front or kind + ("<" if VIEW["ay"] < 0 else ">"), end)]


def around(cx, cy, z, r, k=24, a0=0.0, a1=2 * pi):
    return [(cx + r * cos(a0 + (a1 - a0) * i / k), cy + r * sin(a0 + (a1 - a0) * i / k), z) for i in range(k + 1)]


def facing():
    """The angle, on the ground, of the side of a round turned to the eye."""
    E = eye()
    return atan2(E[1], E[0])


def cylinder(o, cx, cy, z, r, h, kind="F", top=None):
    """An upright cylinder: the half of its side one sees (one face, shaded across) and its top."""
    f = facing()
    low = around(cx, cy, z, r, 16, f - pi / 2, f + pi / 2)
    high = [(x, y, z + h) for x, y, _ in reversed(low)]
    return [(kind + "<", iso(o, *low, *high)), (top or kind, iso(o, *around(cx, cy, z + h, r, 32)[:-1]))]


def ring_wall(o, cx, cy, z, r, h, a0, a1, kind="H"):
    """A curved wall on a round, from angle a0 to a1 (radians), seen from outside."""
    low = around(cx, cy, z, r, 12, a0, a1)
    return [(kind + "<", iso(o, *low, *((x, y, z + h) for x, y, _ in reversed(low))))]
