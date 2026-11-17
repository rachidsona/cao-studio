"""
Icônes 3D de CAO Studio, style « Blanc premium » : de petits volumes blancs en vue isométrique, le bleu pour ce qui compte,
l'orange pour ce qui agit. Chaque icône décrite ici remplace son symbole dans templates/editor/_icons.html ; les autres
(esquisse, contraintes : du dessin à plat) gardent leur tracé, posé sur une touche blanche en relief.

    python3 scripts/icons3d.py
"""
import re
from math import cos, hypot, pi, sin

from icons3d_meubles import FACE
from icons3d_set import ICONS

SPRITE = "templates/editor/_icons.html"
K = 0.866  # cos 30°
STOPS = {  # tone: top, left, right faces, each from one colour to the next
    "w": (("var(--ic-w1)", "var(--ic-w2)"), ("var(--ic-w3)", "var(--ic-w4)"), ("var(--ic-w5)", "var(--ic-w6)")),
    "b": (("#7fd0ff", "#38b2f6"), ("#1f97e8", "#0f76c8"), ("#0d68b5", "#084f90")),
    "o": (("#ffc48a", "#ff9a4d"), ("#ff8a33", "#f0660f"), ("#e0580c", "#b53f06")),
    "g": (("#c5f08a", "#8fd64a"), ("#74c232", "#4f9e1f"), ("#468f1a", "#2f6e10")),
    "y": (("#fff3b0", "#ffd84d"), ("#ffcf33", "#f0ad10"), ("#e0a00c", "#b57a06")),
    "d": (("#64748b", "#475569"), ("#334155", "#1e293b"), ("#1e293b", "#0f172a")),
}
# Each colour a CSS variable with its value as fallback (--ic-b1 … --ic-b6, the white ones always set in app.css):
# the icon styles of the « ⋯ » menu (« Plat », « Contraste fort », « Monochrome ») change them, not the drawings.
STOPS = {tone: tuple(tuple(c if c.startswith("var(") else f"var(--ic-{tone}{2 * i + j + 1},{c})" for j, c in enumerate(face)) for i, face in enumerate(faces)) for tone, faces in STOPS.items()}
TONES = {"white": "w", "blue": "b", "orange": "o", "green": "g", "yellow": "y", "dark": "d"}
INK = "#0284c7"


def n(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


class Icon:
    """A little scene: x to the lower right, y to the lower left, z up. Drawn in order, then fitted into the 24 × 24 box."""

    def __init__(self, front=False):
        self.shapes = []
        self.front = front

    def p(self, x, y, z):
        # Seen from the front: x across, z up, y towards the viewer, what is further back up and to the right.
        return (x - y * 0.42, y * 0.42 - z) if self.front else ((x - y) * K, (x + y) * 0.5 - z)

    def flat(self, points, fill):
        """A shape given on the screen plane."""
        self.shapes.append(("face", list(points), fill))
        return self

    def face(self, points, fill):
        return self.flat([self.p(*q) for q in points], fill)

    def box(self, x, y, z, dx, dy, dz, tone="white"):
        c = TONES[tone]
        X, Y, Z = x + dx, y + dy, z + dz
        self.face([(x, y, Z), (X, y, Z), (X, Y, Z), (x, Y, Z)], c + "t")
        self.face([(x, Y, z), (X, Y, z), (X, Y, Z), (x, Y, Z)], c + "l")
        return self.face([(X, y, z), (X, Y, z), (X, Y, Z), (X, y, Z)], c + "r")

    def wire(self, x, y, z, dx, dy, dz, colour=INK, width=0.35):
        """The edges of a box, nothing filled."""
        X, Y, Z = x + dx, y + dy, z + dz
        for a, b in (((x, Y, z), (X, Y, z)), ((X, y, z), (X, Y, z)), ((X, Y, z), (X, Y, Z)), ((x, Y, z), (x, Y, Z)), ((X, y, z), (X, y, Z)), ((x, y, Z), (X, y, Z)), ((x, y, Z), (x, Y, Z)), ((X, y, Z), (X, Y, Z)), ((x, Y, Z), (X, Y, Z))):
            self.line(a, b, colour, width)
        return self

    def line(self, a, b, colour=INK, width=0.5):
        return self.path([a, b], colour, width)

    def path(self, points, colour=INK, width=0.5):
        self.shapes.append(("line", [self.p(*q) for q in points], (colour, width)))
        return self

    def round(self, x, y, z, r, h, tone="white", axis="z", steps=28):
        """A post: along z, or lying along x or y."""
        c = TONES[tone]
        def ring(at):
            for i in range(steps):
                a, b = r * cos(i * 2 * pi / steps), r * sin(i * 2 * pi / steps)
                yield {"z": (x + a, y + b, z + at), "x": (x + at, y + a, z + b), "y": (x + a, y + at, z + b)}[axis]
        low, high = [self.p(*q) for q in ring(0)], [self.p(*q) for q in ring(h)]
        d = (high[0][0] - low[0][0], high[0][1] - low[0][1])
        hull = sorted(range(steps), key=lambda i: low[i][0] * d[1] - low[i][1] * d[0])
        i, j = hull[0], hull[-1]
        self.flat([low[i], high[i], high[j], low[j]], c + ("l" if axis != "x" else "r"))
        return self.flat(high, c + "t")

    def disc(self, x, y, z, r, tone="dark", part="r", steps=28):
        return self.face([(x + r * cos(i * 2 * pi / steps), y + r * sin(i * 2 * pi / steps), z) for i in range(steps)], TONES[tone] + part)

    def ball(self, x, y, z, r, tone="white"):
        cx, cy = self.p(x, y, z)
        return self.flat([(cx + r * cos(i * pi / 16), cy + r * sin(i * pi / 16)) for i in range(32)], TONES[tone] + "b")

    def arrow(self, a, b, tone="orange", w=0.9):
        """A bold arrow from a to b, drawn on the screen, with a darker side under it."""
        (ax, ay), (bx, by) = self.p(*a), self.p(*b)
        length = hypot(bx - ax, by - ay)
        ux, uy = (bx - ax) / length, (by - ay) / length
        nx, ny = -uy, ux
        head = w * 2.1
        neck = (bx - ux * head * 1.1, by - uy * head * 1.1)
        shape = [(ax + nx * w / 2, ay + ny * w / 2), (neck[0] + nx * w / 2, neck[1] + ny * w / 2), (neck[0] + nx * head, neck[1] + ny * head), (bx, by), (neck[0] - nx * head, neck[1] - ny * head), (neck[0] - nx * w / 2, neck[1] - ny * w / 2), (ax - nx * w / 2, ay - ny * w / 2)]
        c = TONES[tone]
        self.flat([(q + 0.12, r + 0.42) for q, r in shape], c + "r")
        return self.flat(shape, c + "l")

    def turn(self, x, y, z, r, a0, a1, tone="orange", width=0.95):
        """A round arrow around z."""
        steps = 22
        c = TONES[tone]
        at = [a0 + (a1 - a0) * i / steps for i in range(steps + 1)]
        points = [(x + r * cos(a), y + r * sin(a), z) for a in at]
        self.path(points[:-2], {"o": "#f0660f", "b": "#0f76c8"}[c], width)
        return self.arrow(points[-3], points[-1], tone, width * 0.72)

    def pencil(self, x, y, z, length=13, w=1.7):
        """A round pencil coming down on (x, y, z): its lead, wood, three lit sides, ferrule and eraser."""
        tx, ty = self.p(x, y, z)
        ux, uy, nx, ny = 0.64, -0.77, 0.77, 0.64
        at = lambda along, across: (tx + ux * along + nx * across, ty + uy * along + ny * across)
        cone = 3.4
        self.flat([at(0, 0), at(cone, -w), at(cone, w)], "yt")
        self.flat([at(0, 0), at(1.3, -w * 0.38), at(1.3, w * 0.38)], "dr")
        for a, b, part in ((-1, -1 / 3, "t"), (-1 / 3, 1 / 3, "l"), (1 / 3, 1, "r")):
            self.flat([at(cone, w * a), at(length, w * a), at(length, w * b), at(cone, w * b)], "o" + part)
        self.flat([at(length, -w), at(length + 1.3, -w), at(length + 1.3, w), at(length, w)], "wr")
        return self.flat([at(length + 1.3, -w), at(length + 2.7, -w * 0.9), at(length + 2.7, w * 0.9), at(length + 1.3, w)], "or")

    def dashes(self, points, colour="#0284c7", width=0.5, on=1.5, off=1.1):
        """A closed dashed outline, given on the screen plane."""
        for (ax, ay), (bx, by) in zip(points, points[1:] + points[:1]):
            length = hypot(bx - ax, by - ay)
            at = 0.0
            while at < length:
                end = min(at + on, length)
                self.shapes.append(("line", [(ax + (bx - ax) * at / length, ay + (by - ay) * at / length), (ax + (bx - ax) * end / length, ay + (by - ay) * end / length)], (colour, width)))
                at = end + off
        return self

    def mark(self, points, colour="#ffffff", width=0.7):
        """Lines given on the screen plane."""
        self.shapes.append(("line", list(points), (colour, width)))
        return self

    def cursor(self, x, y, z):
        ax, ay = self.p(x, y, z)
        s = 1.25
        points = [(0, 0), (0, 6.8), (1.6, 5.3), (2.8, 7.8), (4, 7.2), (2.8, 4.9), (4.9, 4.7)]
        return self.flat([(ax + a * s, ay + b * s) for a, b in points], "ol")

    def check(self, cx, cy, s=1.0):
        return self.flat([(cx + a * s, cy + b * s) for a, b in [(-3, 0), (-1.6, -1.3), (-.5, -.1), (2, -3.1), (3.3, -2), (-.4, 2.3)]], "gl")

    def svg(self, room=23.0):
        points = [q for _, qs, _ in self.shapes for q in qs]
        x0, x1 = min(q[0] for q in points), max(q[0] for q in points)
        y0, y1 = min(q[1] for q in points), max(q[1] for q in points)
        f = room / max(x1 - x0, y1 - y0)
        dx, dy = 12 - (x0 + x1) / 2 * f, 12 - (y0 + y1) / 2 * f
        out = []
        for kind, qs, style in self.shapes:
            d = "M" + "L".join(f"{n(a * f + dx)} {n(b * f + dy)}" for a, b in qs)
            if kind == "face":
                out.append(f'<path d="{d}z" fill="url(#k{style})"/>')
            else:
                out.append(f'<path d="{d}" fill="none" stroke="{style[0]}" stroke-width="{n(style[1] * f)}"/>')
        return "".join(out)


GROUP = '<g stroke="var(--ic-edge)" style="stroke-width:var(--ic-edge-w,.28)" stroke-linejoin="round" stroke-linecap="round">'


def defs():
    out = []
    for tone, faces in STOPS.items():
        for part, (a, b) in zip("tlr", faces):
            out.append(f'<linearGradient id="k{tone}{part}" x1="0" y1="0" x2="{"1" if part == "t" else "0"}" y2="1"><stop offset="0" style="stop-color:{a}"/><stop offset="1" style="stop-color:{b}"/></linearGradient>')
        a, b = faces[0][0], faces[2][1]
        out.append(f'<radialGradient id="k{tone}b" cx=".36" cy=".3" r=".8"><stop offset="0" style="stop-color:{a}"/><stop offset=".55" style="stop-color:{faces[1][0]}"/><stop offset="1" style="stop-color:{b}"/></radialGradient>')
    out.append('<linearGradient id="kcap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--ic-cap1,#fff)"/><stop offset="1" style="stop-color:var(--ic-cap2,#e6ebf1)"/></linearGradient>')
    return "<defs>" + "".join(out) + "</defs>"


CAP = ('<g class="ic-cap"><rect x="1.8" y="2.6" width="20.4" height="20" rx="3.4" style="fill:var(--ic-cap-shadow,#9dafc2)"/>'
       '<rect x="1.8" y="1.4" width="20.4" height="20" rx="3.4" fill="url(#kcap)" stroke="var(--ic-edge)" style="stroke-width:var(--ic-cap-edge-w,.24)"/>'
       '<g transform="translate(3.72 3.32) scale(.69)" stroke-width="1.35" style="color:var(--ic-cap-ink,#334155);--ic-accent:var(--ic-cap-accent,#0284c7);--ic-action:var(--ic-cap-action,#ea580c)">')


def main():
    text = open(SPRITE, encoding="utf8").read()
    text = re.sub(r"<defs>.*?</defs>\n?", "", text, count=1, flags=re.S)
    done = kept = 0

    def symbol(match):
        nonlocal done, kept
        head, name, attrs, body = match.group(1), match.group(2), match.group(3), match.group(4)
        if name in ICONS:
            done += 1
            icon = Icon(front=name in FACE)
            ICONS[name](icon)
            return f'{head}<symbol id="i-{name}" viewBox="0 0 24 24">{GROUP}{icon.svg()}</g></symbol>'
        kept += 1
        if 'class="ic-cap"' in body:
            return match.group(0)
        # Drawn elsewhere at full size (a volume, or a selection's dashed frame): kept as it is, with no key under it;
        # the edges of its volumes in the variable of the others.
        if '<g stroke="var(--ic-edge)"' in body or body.startswith('<rect x="1" y="1" width="22" height="22"'):
            return re.sub(r'<g stroke="var\(--ic-edge\)" stroke-width="([.\d]+)"', r'<g stroke="var(--ic-edge)" style="stroke-width:var(--ic-edge-w,\1)"', match.group(0))
        return f'{head}<symbol id="i-{name}"{attrs}>{CAP}{body}</g></g></symbol>'

    text = re.sub(r'(\s*)<symbol id="i-([a-z0-9-]+)"([^>]*)>(.*?)</symbol>', symbol, text, flags=re.S)
    text = text.replace('focusable="false">\n', 'focusable="false">\n  ' + defs() + "\n", 1)
    open(SPRITE, "w", encoding="utf8").write(text)
    print(f"{done} volumes, {kept} touches, {len(text) // 1024} Ko")


if __name__ == "__main__":
    main()
