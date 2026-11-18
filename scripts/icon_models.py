"""
Les modèles d'icônes de CAO Studio autres que les volumes en relief (scripts/icons3d.py) : les mêmes outils, redessinés
sur 24 × 24 — « Studio » (petits solides en axonométrie, gris clair ombrés en dégradé, ce qui compte en bleu, ce qui
agit en orange), « Glyphe » (formes plates grises, un accent) et « Croquis » (des solides vus plus de face, en
couleurs vives et à plat, au trait noir qui dépasse des coins comme un croquis à main levée). Un fichier par modèle
dans static/icons/, que l'éditeur charge quand on le choisit (menu « ⋯ » → Icônes, frontend/src/app/icon-models.ts) :
chaque symbole y remplace celui du même nom de la page ; un outil pas encore redessiné garde son volume. Les dessins
sont dans scripts/icon_models_set.py (Glyphe) et scripts/icon_models_studio.py (Studio, Croquis).

    python3 scripts/icon_models.py
"""
import re
from math import hypot

from icon_models_set import ICONS
from icon_models_studio import scene

OUT = "static/icons/{}.svg"
# Each model: its strokes (width, ends, joins), its colours — the ink, the accent, what acts, the dashes of what is
# hidden or gone (ghost) — how opaque its ink fills are, and the faces of its volumes: for F (neutral), K (pale
# accent), H (accent), the top, the side turned left, the side turned right.
MODELS = {
    # Fixed colours, as rendered parts: the same on a light or a dark toolbar. Faces shaded by gradients (GRADIENTS).
    "studio": dict(width=0.7, ink="#46505c", accent="#1f78d1", action="#f08a24", ghost="#8d99a6", ink_fill=1, faces="gradient"),
    "glyphe": dict(width=1.6, ink="currentColor", accent="var(--ic-accent)", action="var(--ic-action)", ghost="currentColor", ink_fill=0.72),
    # Flat bright paint and a black hand line that runs past the corners.
    "croquis": dict(width=0.95, ink="#1d1f22", accent="#2f7fd6", action="#e2382b", ghost="#7b7f86", ink_fill=1, faces={
        "F": ("#fffdf7", "#f0e6cf", "#ddcca6"),
        "K": ("#e4f1fc", "#c3dcf3", "#a5c6e8"),
        "H": ("#ffd23f", "#f6b623", "#df9612"),
    }),
}
DASH = ' stroke-dasharray="1.7 1.5"'
# A kind of shape: its stroke (colour, width × the model's, dashed), or its fill (colour, opacity).
STROKES = {"s": ("ink", 1, ""), "a": ("accent", 1, ""), "o": ("action", 1, ""), "d": ("ghost", 0.8, DASH), "e": ("accent", 0.8, DASH), "p": ("action", 0.8, DASH), "W": ("ink", 1.6, ""), "b": ("accent", 1.6, ""), "w": ("action", 1.6, "")}
FILLS = {"S": ("ink", 1), "A": ("accent", 1), "O": ("action", 1), "T": ("accent", 0.28), "G": ("ink", 0.3)}
# « Studio »: each face a gradient, light from the top left — (id, from, to, vertical).
GRADIENTS = {
    "F": (("#ffffff", "#e6eaee", 0), ("#e4e8ed", "#c8cfd7", 1), ("#c3cad3", "#a3adb9", 1)),
    "K": (("#f1f8ff", "#d4e7fb", 0), ("#d0e3f7", "#afcbec", 1), ("#a8c5e8", "#8aaed8", 1)),
    "H": (("#94d0fa", "#4ea6ec", 0), ("#4fa3e8", "#2d80cd", 1), ("#2f80cc", "#1b60a6", 1)),
}
DEFS = "<defs>" + "".join(
    f'<linearGradient id="icm-{kind}{i}" x1="0" y1="0" x2="{0 if vertical else 1}" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>'
    for kind, faces in GRADIENTS.items() for i, (a, b, vertical) in enumerate(faces)) + "</defs>"


def n(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def sketch(d, k=0.8):
    """The edges of a drawn outline (M, L, z only), each run k past its two ends."""
    out = []
    for part in re.findall(r"M[^M]*", d):
        pts = [(float(x), float(y)) for x, y in re.findall(r"(-?[\d.]+) (-?[\d.]+)", part)]
        ends = pts[1:] + (pts[:1] if part.endswith("z") else [])
        for (x1, y1), (x2, y2) in zip(pts, ends):
            size = hypot(x2 - x1, y2 - y1) or 1
            ux, uy = (x2 - x1) / size * k, (y2 - y1) / size * k
            out.append(f"M{n(x1 - ux)} {n(y1 - uy)}L{n(x2 + ux)} {n(y2 + uy)}")
    return "".join(out)


def face(kind, d, m):
    side = "<>".find(kind[1:]) + 1 if kind[1:] else 0
    if m["faces"] == "gradient":
        return f'<path d="{d}" fill="url(#icm-{kind[0]}{side})" stroke="{m["ink"]}"/>'
    fill = f'<path d="{d}" fill="{m["faces"][kind[0]][side]}" stroke="none"/>'
    # A hand line past the corners where the outline is plain points; a curved one (a pointer) keeps its own.
    return fill + f'<path d="{sketch(d) if not re.search("[a-yA-LN-Y]", d) else d}" stroke="{m["ink"]}"/>'


def shape(kind, d, m):
    if kind[0] in "FKH" and "faces" in m:
        return face(kind, d, m)
    if kind == "R":
        return f'<path d="{d}" fill="{m["action"]}" stroke="{m["action"]}" stroke-width="{n(m["width"] * 2)}"/>'
    if kind in STROKES:
        colour, factor, dash = STROKES[kind]
        return f'<path d="{d}" stroke="{m[colour]}"' + (f' stroke-width="{n(m["width"] * factor)}"' if factor != 1 else "") + dash + "/>"
    colour, opacity = FILLS[kind]
    opacity *= m["ink_fill"] if colour == "ink" else 1
    return f'<path d="{d}" fill="{m[colour]}" stroke="none" fill-rule="evenodd"' + (f' fill-opacity="{n(opacity)}"' if opacity != 1 else "") + "/>"


def sprite(model):
    m = MODELS[model]
    out = ['<svg xmlns="http://www.w3.org/2000/svg">']
    for i, (name, drawings) in enumerate(ICONS.items()):
        drawing = drawings[model] if model in drawings else scene(name, model)
        # The gradients once, in the first symbol: the page keeps every tool's symbol, so they are always there.
        body = (DEFS if m.get("faces") == "gradient" and i == 0 else "") + "".join(shape(kind, d, m) for kind, d in drawing)
        out.append(f'<symbol id="i-{name}" viewBox="0 0 24 24"><g fill="none" stroke="{m["ink"]}" stroke-width="{n(m["width"])}" stroke-linecap="round" stroke-linejoin="round">{body}</g></symbol>')
    out.append("</svg>\n")
    return "\n".join(out)


def main():
    for model in MODELS:
        text = sprite(model)
        open(OUT.format(model), "w", encoding="utf8").write(text)
        print(f"{model} : {len(ICONS)} icônes, {len(text) // 1024} Ko")


if __name__ == "__main__":
    main()
