"""
Les outils de vue, de navigation et de contrôle du modèle « Glyphe » (suite de icon_models_set.py, mêmes sortes) ;
« Studio » et « Croquis » les dessinent en volumes (icon_models_studio4.py).
"""
from icon_models_flat import turn
from icon_models_set import C, CUBE, CUBE_IN, POINTER, SMALL_POINTER, STAR, R
from icon_models_studio4 import PLUS, WARN

CUBE_FRONT = "M4 7.5l8 4.5v9l-8-4.5z"
CUBE_RIGHT = "M20 7.5L12 12v9l8-4.5z"
CUBE_TOP = "M12 3l8 4.5-8 4.5-8-4.5z"
RING = "M3.5 15.5a8.5 3.6 0 1 0 6.5-3.3"

GLYPHS4 = {
    "view-front": [("G", CUBE), ("A", CUBE_FRONT), ("s", CUBE_IN)],
    "view-right": [("G", CUBE), ("A", CUBE_RIGHT), ("s", CUBE_IN)],
    "view-top": [("G", CUBE), ("A", CUBE_TOP), ("s", CUBE_IN)],
    "view-iso": [("T", CUBE), ("A", CUBE_TOP), ("s", CUBE + CUBE_IN)],
    "orbit": [("G", R(8, 6, 8, 8, 1.5)), *turn(12, 12, 9, 150, 400)],
    "orbit-free": [("T", C(12, 12, 6)), *turn(12, 12, 9.5, 120, 380), ("e", "M12 2.5v19")],
    "orbit-constrained": [("G", R(8, 7, 8, 8, 1.5)), ("e", "M12 2v20"), ("o", RING), ("O", "M10 12.2l-3.2-1.4 2.9-1.9z")],
    "orbit-center": [("G", R(4, 4, 16, 16, 2)), ("e", "M12 2v20M2 12h20"), ("A", C(12, 12, 2.6))],
    "walk": [("A", "M8 3c2 0 3 2.5 2.6 5.5S8.4 12 7 11.5 5 9 5.5 6.5 6.4 3 8 3zM16 10c2 0 3 2.5 2.6 5.5s-2.2 3.5-3.6 3S13 16 13.5 13.5 14.4 10 16 10z"), ("G", R(5.5, 12.5, 4, 2.2, 1.1) + R(13.5, 19.5, 4, 2.2, 1.1))],
    "motion": [("S", R(3, 3, 10, 18, 1.5)), ("A", "M13.5 3l7 3v15l-7-3z"), ("p", "M13 21a8 8 0 0 0 8-8")],
    "scenes": [("S", R(2, 7, 15, 11, 2)), ("A", C(9.5, 12.5, 3.2)), ("S", "M17 10.5l5-3v10l-5-3z")],
    "render": [("A", CUBE_TOP), ("S", CUBE_FRONT + CUBE_RIGHT), ("a", "M5.5 11.5l5 2.8M5.5 15l5 2.8M18.5 11.5l-5 2.8M18.5 15l-5 2.8")],
    "render-studio": [("A", C(10, 13, 6.5)), ("G", R(2, 20, 16, 2, 1)), ("O", STAR), ("T", C(8, 11, 2))],
    "select": [("S", POINTER)],
    "select-plus": [("G", R(2, 9, 13, 13, 1.5)), ("A", R(5, 12, 7, 7, 1)), ("S", SMALL_POINTER), ("O", PLUS)],
    "snap-geometry": [("G", R(3, 9, 12, 12, 1.5)), ("a", C(15, 9, 4)), ("A", C(15, 9, 1.8))],
    "snap-smart": [("S", R(2, 12, 8, 10, 1.5)), ("A", R(14, 3, 8, 7, 1.5)), ("e", "M10 12V5h4"), ("O", C(10, 5, 1.8))],
    "layers": [("G", "M12 15.5l10-5 0 1.2-10 5-10-5v-1.2z"), ("T", "M12 12l10-5-10-5-10 5z"), ("A", "M12 19l10-5v1.5l-10 5-10-5V14z")],
    "weight": [("S", R(5, 2, 14, 15, 1.5)), ("A", C(12, 9.5, 2.8)), ("O", "M10.6 17.5h2.8V19H16l-4 3.5-4-3.5h2.6z")],
    "part-tags": [("G", R(3, 3, 18, 18, 2)), ("A", R(6, 6, 6, 6, 3)), ("S", R(14, 13, 5, 5, 2.5))],
    "live-check": [("G", R(6, 6, 12, 12, 1.5)), ("p", R(2.5, 2.5, 19, 19, 2))],
    "check-fab": [("S", R(2, 8, 10, 10, 1.5)), ("T", R(7, 12, 10, 10, 1.5)), ("A", R(7, 12, 5, 6)), ("O", WARN)],
}
ICONS4 = {name: {"glyphe": drawing} for name, drawing in GLYPHS4.items()}
