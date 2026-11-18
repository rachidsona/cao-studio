"""
Les modèles d'icônes de CAO Studio autres que les volumes en relief (scripts/icons3d.py) : les mêmes outils, redessinés
à plat sur 24 × 24 — « Ligne » (pictogrammes au trait), « Solide » (formes pleines), « Technique » (dessin d'atelier :
traits fins, pointillés, cotes). Un fichier par modèle dans static/icons/, que l'éditeur charge quand on le choisit
(menu « ⋯ » → Icônes, frontend/src/app/icon-models.ts) : chaque symbole y remplace celui du même nom de la page ; un
outil pas encore redessiné garde son volume. Les dessins sont dans scripts/icon_models_set.py.

    python3 scripts/icon_models.py
"""
from icon_models_set import ICONS

OUT = "static/icons/{}.svg"
# Each model: the width of its strokes, and how they end and join.
MODELS = {
    "ligne": (1.6, "round", "round"),
    "solide": (1.6, "round", "round"),
    "technique": (1.05, "butt", "miter"),
}
INK, ACCENT, ACTION = "currentColor", "var(--ic-accent)", "var(--ic-action)"
DASH = ' stroke-dasharray="1.7 1.5"'
# A kind of shape: its stroke (colour, width × the model's, dashed), or its fill (colour, opacity).
STROKES = {"s": (INK, 1, ""), "a": (ACCENT, 1, ""), "o": (ACTION, 1, ""), "d": (INK, 0.8, DASH), "e": (ACCENT, 0.8, DASH), "p": (ACTION, 0.8, DASH), "W": (INK, 1.6, ""), "b": (ACCENT, 1.6, ""), "w": (ACTION, 1.6, "")}
FILLS = {"S": (INK, 1), "A": (ACCENT, 1), "O": (ACTION, 1), "T": (ACCENT, 0.28), "G": (INK, 0.3)}


def n(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def shape(kind, d, width):
    if kind in STROKES:
        colour, factor, dash = STROKES[kind]
        return f'<path d="{d}" stroke="{colour}"' + (f' stroke-width="{n(width * factor)}"' if factor != 1 else "") + dash + "/>"
    colour, opacity = FILLS[kind]
    return f'<path d="{d}" fill="{colour}" stroke="none" fill-rule="evenodd"' + (f' fill-opacity="{opacity}"' if opacity != 1 else "") + "/>"


def sprite(model):
    width, cap, join = MODELS[model]
    out = ['<svg xmlns="http://www.w3.org/2000/svg">']
    for name, drawings in ICONS.items():
        body = "".join(shape(kind, d, width) for kind, d in drawings[model])
        out.append(f'<symbol id="i-{name}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="{n(width)}" stroke-linecap="{cap}" stroke-linejoin="{join}">{body}</g></symbol>')
    out.append("</svg>\n")
    return "\n".join(out)


def main():
    for model in MODELS:
        text = sprite(model)
        open(OUT.format(model), "w", encoding="utf8").write(text)
        print(f"{model} : {len(ICONS)} icônes, {len(text) // 1024} Ko")


if __name__ == "__main__":
    main()
