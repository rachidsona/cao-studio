"""
Les modèles d'icônes de CAO Studio autres que les volumes en relief (scripts/icons3d.py) : les mêmes outils, redessinés
sur 24 × 24 — « Glyphe » (formes plates grises, un accent), « Duo » (de petits solides en axonométrie, peints à plat
en deux tons, sans trait de contour), « Pastille » (les dessins de Glyphe en blanc, chacun sur une tuile de couleur
aux coins ronds) et « Dégradé » (les dessins de Glyphe dans un dégradé bleu-violet). Un fichier par modèle dans static/icons/, que l'éditeur charge quand on le
choisit (menu « ⋯ » → Icônes, frontend/src/app/icon-models.ts) : chaque symbole y remplace celui du même nom de la
page, tous les outils. Les dessins sont dans scripts/icon_models_set.py à _set4.py (Glyphe), scripts/icon_models_studio.py
à _studio4.py (les volumes de Duo, avec les solides de icon_models_solid.py) et scripts/icon_models_flat.py et
_flat2.py (les outils plats par nature, un dessin pour tous, posé sur une planche par icon_models_plane.py).

    python3 scripts/icon_models.py
"""
from icon_models_flat import FLAT
from icon_models_flat2 import FLAT2
from icon_models_plane import PLANES, on_plane
from icon_models_set import ICONS
from icon_models_set2 import ICONS2
from icon_models_set3 import ICONS3
from icon_models_set4 import ICONS4
from icon_models_studio import AROUND, DRAW, scene
from icon_models_studio2 import AROUND2, DRAW2
from icon_models_studio3 import AROUND3, DRAW3
from icon_models_studio4 import AROUND4, DRAW4

for more in (DRAW2, DRAW3, DRAW4):
    DRAW.update(more)
for more in (AROUND2, AROUND3, AROUND4):
    AROUND.update(more)

OUT = "static/icons/{}.svg"
# Every tool: its own drawing per model (or volumes, DRAW), or one flat drawing for all three ("all").
TOOLS = {**ICONS, **ICONS2, **ICONS3, **ICONS4, **{name: {"all": drawing} for name, drawing in {**FLAT, **FLAT2}.items()}}
# Each model: its strokes (width, ends, joins), its colours — the ink, the accent, what acts, the dashes of what is
# hidden or gone (ghost) — how opaque its ink fills are, and the faces of its volumes: for F (neutral), K (pale
# accent), H (accent), the top, the side turned left, the side turned right.
MODELS = {
    # flat: the stroke of the drawings shared by the models (icon_models_flat.py), lines more than volumes.
    "glyphe": dict(width=1.6, flat=1.6, ink="currentColor", accent="var(--ic-accent)", action="var(--ic-action)", ghost="currentColor", ink_fill=0.72),
    # Flat isometric in two tones, slate and blue, no outline: the solids of DRAW, each face one plain colour.
    "duo": dict(width=1.0, flat=1.3, ink="#8b98ad", accent="#3b82f6", action="#f97316", ghost="#8b98ad", ink_fill=1, edges=False, faces={
        "F": ("#e2e8f0", "#b4c0cf", "#8997ad"),
        "K": ("#cfe3fd", "#a9cdfb", "#7fb2f5"),
        "H": ("#60a5fa", "#3b82f6", "#1d4ed8"),
    }),
    # Glyphe's drawings in white, each on a rounded tile of its colour (TILES), as app icons.
    "pastille": dict(width=1.7, flat=1.7, ink="#ffffff", accent="#ffffff", action="#fde68a", ghost="#ffffff", ink_fill=0.45, glyph=True, tile=True),
    # Glyphe's drawings in a blue-to-violet gradient, the accent cyan-to-blue, what acts in orange.
    "degrade": dict(width=1.6, flat=1.6, ink="url(#icm-grad)", accent="url(#icm-grad2)", action="#f97316", ghost="url(#icm-grad)", ink_fill=0.9, glyph=True, defs=(
        '<defs><linearGradient id="icm-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#a78bfa"/></linearGradient>'
        '<linearGradient id="icm-grad2" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>')),
}
# The tiles of « pastille », one colour per tool (always the same for a tool).
TILES = ["#2563eb", "#0d9488", "#7c3aed", "#ea580c", "#0891b2", "#db2777", "#16a34a", "#4f46e5"]
DASH = ' stroke-dasharray="1.7 1.5"'
# A kind of shape: its stroke (colour, width × the model's, dashed), or its fill (colour, opacity).
STROKES = {"s": ("ink", 1, ""), "a": ("accent", 1, ""), "o": ("action", 1, ""), "d": ("ghost", 0.8, DASH), "e": ("accent", 0.8, DASH), "p": ("action", 0.8, DASH), "W": ("ink", 1.6, ""), "b": ("accent", 1.6, ""), "w": ("action", 1.6, "")}
FILLS = {"S": ("ink", 1), "A": ("accent", 1), "O": ("action", 1), "T": ("accent", 0.28), "G": ("ink", 0.3)}


def n(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def face(kind, d, m):
    # A face ending in « ~ » (a support under a drawing) has a fine grey outline.
    line = f'stroke="{m["ghost"]}" stroke-width="{n(m["width"] * 0.6)}"' if kind.endswith("~") else f'stroke="{m["ink"]}"'
    kind = kind.rstrip("~")
    side = "<>".find(kind[1:]) + 1 if kind[1:] else 0
    colour = m["faces"][kind[0]][side]
    if m.get("edges") is False:  # no outline: a hairline of its own colour closes the seams between faces
        return f'<path d="{d}" fill="{colour}" stroke="{colour}" stroke-width="0.35"/>'
    return f'<path d="{d}" fill="{colour}" {line}/>'


def shape(kind, d, m):
    if kind[0] in "FKH" and "faces" in m:
        return face(kind, d, m)
    if kind[0] in "FKH":  # a face in a model without volumes: a flat tint and its outline
        fill, outline = {"F": ("G", "s"), "K": ("T", "a"), "H": ("A", "")}[kind[0]]
        return shape(fill, d, m) + (shape(outline, d, m) if outline else "")
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
    for i, (name, drawings) in enumerate(TOOLS.items()):
        if model in drawings:
            drawing, mm = drawings[model], m
        elif m.get("glyph"):  # drawn as in Glyphe, in the model's colours
            drawing = drawings.get("glyphe") or drawings["all"]
            mm = m if "glyphe" in drawings else dict(m, width=m["flat"])
        elif name in DRAW:
            drawing, mm = scene(name, model), m
        else:
            # A flat tool: as it is in Glyphe, laid on a board in the volume models.
            drawing = on_plane(drawings["all"], model) if model in PLANES else drawings["all"]
            mm = dict(m, width=m["flat"])
        body = "".join(shape(kind, d, mm) for kind, d in drawing)
        if m.get("tile"):
            tile = TILES[sum(map(ord, name)) % len(TILES)]
            body = f'<path d="M6 .5h12a5.5 5.5 0 0 1 5.5 5.5v12a5.5 5.5 0 0 1-5.5 5.5H6A5.5 5.5 0 0 1 .5 18V6A5.5 5.5 0 0 1 6 .5z" fill="{tile}" stroke="none"/><g transform="translate(4.2 4.2) scale(.65)">{body}</g>'
        # The gradients once, in the first symbol: the page keeps every tool's symbol, so they are always there.
        body = (m.get("defs", "") if i == 0 else "") + body
        out.append(f'<symbol id="i-{name}" viewBox="0 0 24 24"><g fill="none" stroke="{mm["ink"]}" stroke-width="{n(mm["width"])}" stroke-linecap="round" stroke-linejoin="round">{body}</g></symbol>')
    out.append("</svg>\n")
    return "\n".join(out)


def main():
    for model in MODELS:
        text = sprite(model)
        open(OUT.format(model), "w", encoding="utf8").write(text)
        print(f"{model} : {len(TOOLS)} icônes, {len(text) // 1024} Ko")


if __name__ == "__main__":
    main()
