"""
Les outils plats (icon_models_flat.py) dans les modèles en volumes : le tracé posé sur un support vu de biais — une
petite planche avec son épaisseur pour « Duo » ;
« Glyphe » le garde à plat. Chaque tracé y est réduit à des segments (arcs et courbes échantillonnés) puis projeté.
"""
import re
from math import atan2, ceil, cos, pi, radians, sin

from icon_models_set import n

# The support seen from the front and above: screen = (ax u + ay v, bx u + by v) for (u, v) from the centre of the
# 24 × 24 drawing; its thickness (0: a sheet). Its faces are of the kind F~: a face drawn in a fine grey line.
PLANES = {
    "duo": dict(ax=1, ay=-0.2, bx=0.1, by=0.72, depth=1.3),
}
EDGE = (1.5, 22.5)  # the support's sides, in the drawing's 24 × 24
TOKEN = re.compile(r"[MLHVACSZmlhvacsz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?")


def arc_points(x1, y1, rx, ry, phi, big, sweep, x2, y2):
    """The points of an SVG arc (endpoint form, SVG 1.1 F.6.5), without its first."""
    if not rx or not ry:
        return [(x2, y2)]
    c, s = cos(radians(phi)), sin(radians(phi))
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    xp, yp = c * dx + s * dy, -s * dx + c * dy
    rx, ry = abs(rx), abs(ry)
    lam = xp * xp / (rx * rx) + yp * yp / (ry * ry)
    if lam > 1:
        rx, ry = rx * lam ** 0.5, ry * lam ** 0.5
    num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
    k = (max(num, 0) / (rx * rx * yp * yp + ry * ry * xp * xp)) ** 0.5 * (-1 if big == sweep else 1)
    cxp, cyp = k * rx * yp / ry, -k * ry * xp / rx
    cx, cy = c * cxp - s * cyp + (x1 + x2) / 2, s * cxp + c * cyp + (y1 + y2) / 2
    t1 = atan2((yp - cyp) / ry, (xp - cxp) / rx)
    dt = atan2((-yp - cyp) / ry, (-xp - cxp) / rx) - t1
    if sweep and dt < 0:
        dt += 2 * pi
    elif not sweep and dt > 0:
        dt -= 2 * pi
    steps = max(2, ceil(abs(dt) / radians(15)))
    return [(cx + rx * cos(t1 + dt * i / steps) * c - ry * sin(t1 + dt * i / steps) * s,
             cy + rx * cos(t1 + dt * i / steps) * s + ry * sin(t1 + dt * i / steps) * c) for i in range(1, steps + 1)]


def flatten(d):
    """The sub-paths of a path as lists of points, each with whether it is closed."""
    tokens, out, i, cmd = TOKEN.findall(d), [], 0, ""
    x = y = sx = sy = 0.0
    last_ctrl = None
    take = lambda k: [float(v) for v in tokens[i:i + k]]
    while i < len(tokens):
        if tokens[i].isalpha():
            cmd, i = tokens[i], i + 1
            if cmd in "Zz":
                out[-1][1] = True
                x, y = sx, sy
                continue
        rel, C = cmd.islower(), cmd.upper()
        ox, oy = (x, y) if rel else (0, 0)
        if C == "M":
            (a, b), i = take(2), i + 2
            x, y = sx, sy = a + ox, b + oy
            out.append([[(x, y)], False])
            cmd = "l" if rel else "L"
        elif C in "LHV":
            if C == "L":
                (a, b), i = take(2), i + 2
                x, y = a + ox, b + oy
            elif C == "H":
                (a,), i = take(1), i + 1
                x = a + (x if rel else 0)
            else:
                (b,), i = take(1), i + 1
                y = b + (y if rel else 0)
            out[-1][0].append((x, y))
        elif C == "A":
            (rx, ry, phi, big, sweep, a, b), i = take(7), i + 7
            out[-1][0] += arc_points(x, y, rx, ry, phi, int(big), int(sweep), a + ox, b + oy)
            x, y = a + ox, b + oy
        elif C in "CS":
            if C == "C":
                (p1x, p1y, p2x, p2y, a, b), i = take(6), i + 6
                p1x, p1y = p1x + ox, p1y + oy
            else:
                (p2x, p2y, a, b), i = take(4), i + 4
                p1x, p1y = (2 * x - last_ctrl[0], 2 * y - last_ctrl[1]) if last_ctrl else (x, y)
            p2x, p2y, a, b = p2x + ox, p2y + oy, a + ox, b + oy
            out[-1][0] += [((1 - t) ** 3 * x + 3 * (1 - t) ** 2 * t * p1x + 3 * (1 - t) * t * t * p2x + t ** 3 * a,
                            (1 - t) ** 3 * y + 3 * (1 - t) ** 2 * t * p1y + 3 * (1 - t) * t * t * p2y + t ** 3 * b) for t in (k / 8 for k in range(1, 9))]
            x, y, last_ctrl = a, b, (p2x, p2y)
            continue
        last_ctrl = None
    return out


def on_plane(drawing, model, at=(12, 12), size=21):
    """A flat drawing laid on the model's support, scaled to fill the icon."""
    v = PLANES[model]
    lo, hi = EDGE
    raw = lambda x, y: (v["ax"] * (x - 12) + v["ay"] * (y - 12), v["bx"] * (x - 12) + v["by"] * (y - 12))
    corners = [raw(lo, lo), raw(hi, lo), raw(hi, hi), raw(lo, hi)]
    xs, ys = [c[0] for c in corners], [c[1] for c in corners] + [c[1] + v["depth"] for c in corners]
    scale = min(size / (max(xs) - min(xs)), size / (max(ys) - min(ys)))
    ox, oy = at[0] - scale * (max(xs) + min(xs)) / 2, at[1] - scale * (max(ys) + min(ys)) / 2
    pt = lambda x, y: (ox + scale * raw(x, y)[0], oy + scale * raw(x, y)[1])
    poly = lambda pts, closed: "M" + "L".join(f"{n(a)} {n(b)}" for a, b in pts) + ("z" if closed else "")
    top = [pt(*c) for c in ((lo, lo), (hi, lo), (hi, hi), (lo, hi))]
    t = v["depth"] * scale
    down = lambda p: (p[0], p[1] + t)
    support = [("F~", poly(top, True))]
    if t:  # the board's front and right edges, seen below its top
        support = [("F<~", poly([top[3], top[2], down(top[2]), down(top[3])], True)),
                   ("F>~", poly([top[2], top[1], down(top[1]), down(top[2])], True)), *support]
    laid = [(kind, "".join(poly([pt(*p) for p in pts], closed) for pts, closed in flatten(d))) for kind, d in drawing]
    return support + laid
