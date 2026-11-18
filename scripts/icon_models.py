"""
Les modèles d'icônes de CAO Studio autres que les volumes en relief (scripts/icons3d.py) : les mêmes outils, redessinés
sur 24 × 24 — « Studio » (petits solides gris clair en axonométrie, ce qui compte en bleu, arêtes fines et foncées),
« Glyphe » (formes plates grises, un accent bleu) et « Croquis » (un trait de croquis sur des aplats jaune, bleu,
rouge). Un fichier par modèle dans static/icons/, que l'éditeur charge quand on le choisit (menu « ⋯ » → Icônes,
frontend/src/app/icon-models.ts) : chaque symbole y remplace celui du même nom de la page ; un outil pas encore
redessiné garde son volume. Les dessins sont dans scripts/icon_models_set.py et scripts/icon_models_studio.py.

    python3 scripts/icon_models.py
"""
from icon_models_set import ICONS
from icon_models_studio import studio

OUT = "static/icons/{}.svg"
# Each model: its strokes (width, ends, joins), its colours — the ink, the accent, what acts, the flats under a
# sketch (M, N), the dashes of what is hidden or gone (ghost) — and how opaque its ink fills are.
MODELS = {
    # Fixed colours, as parts drawn on paper: the same on a light or a dark toolbar.
    "studio": dict(width=0.75, cap="round", join="round", ink="#38424e", accent="#1f78d1", action="#f08a24", ink_fill=1, ghost="#8d99a6"),
    "glyphe": dict(width=1.6, cap="round", join="round", ink="currentColor", accent="var(--ic-accent)", action="var(--ic-action)", ink_fill=0.72, ghost="currentColor"),
    "croquis": dict(width=1.25, cap="round", join="round", ink="currentColor", accent="#2f7fd6", action="#e5392f", ink_fill=1, M="#f5c242", N="#e5392f", ghost="currentColor"),
}
DASH = ' stroke-dasharray="1.7 1.5"'
# A kind of shape: its stroke (colour, width × the model's, dashed), or its fill (colour, opacity).
STROKES = {"s": ("ink", 1, ""), "a": ("accent", 1, ""), "o": ("action", 1, ""), "d": ("ghost", 0.8, DASH), "e": ("accent", 0.8, DASH), "p": ("action", 0.8, DASH), "W": ("ink", 1.6, ""), "b": ("accent", 1.6, ""), "w": ("action", 1.6, "")}
FILLS = {"S": ("ink", 1), "A": ("accent", 1), "O": ("action", 1), "T": ("accent", 0.28), "G": ("ink", 0.3), "M": ("M", 1), "N": ("N", 1)}
# A face of a « Studio » solid, edged in the ink: its top, the side turned left (<), the side turned right (>).
FACES = {
    "F": ("#f4f6f8", "#d8dde3", "#bcc4cd"),
    "K": ("#e2eefb", "#c4daf1", "#a6c4e4"),
    "H": ("#66b4f2", "#3792da", "#2374b6"),
}


def n(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def shape(kind, d, m):
    if kind[0] in FACES:
        colour = FACES[kind[0]]["<>".find(kind[1:]) + 1 if kind[1:] else 0]
        return f'<path d="{d}" fill="{colour}" stroke="{m["ink"]}"/>'
    if kind in STROKES:
        colour, factor, dash = STROKES[kind]
        return f'<path d="{d}" stroke="{m[colour]}"' + (f' stroke-width="{n(m["width"] * factor)}"' if factor != 1 else "") + dash + "/>"
    colour, opacity = FILLS[kind]
    opacity *= m["ink_fill"] if colour == "ink" else 1
    return f'<path d="{d}" fill="{m[colour]}" stroke="none" fill-rule="evenodd"' + (f' fill-opacity="{n(opacity)}"' if opacity != 1 else "") + "/>"


def sprite(model):
    m = MODELS[model]
    out = ['<svg xmlns="http://www.w3.org/2000/svg">']
    for name, drawings in ICONS.items():
        drawing = studio(name) if model == "studio" else drawings[model]
        body = "".join(shape(kind, d, m) for kind, d in drawing)
        out.append(f'<symbol id="i-{name}" viewBox="0 0 24 24"><g fill="none" stroke="{m["ink"]}" stroke-width="{n(m["width"])}" stroke-linecap="{m["cap"]}" stroke-linejoin="{m["join"]}">{body}</g></symbol>')
    out.append("</svg>\n")
    return "\n".join(out)


def main():
    for model in MODELS:
        text = sprite(model)
        open(OUT.format(model), "w", encoding="utf8").write(text)
        print(f"{model} : {len(ICONS)} icônes, {len(text) // 1024} Ko")


if __name__ == "__main__":
    main()
