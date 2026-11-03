"""
Paramétrie : calcul des dimensions internes et des panneaux de structure.

Aucune position n'est « codée en dur » dans la base : le volume racine est
recalculé à partir des dimensions globales, puis l'arbre de volumes est
rejoué. Les divisions stockées en mode ``ratio`` suivent le redimensionnement,
les divisions en mode ``absolute`` restent à leur cote (dans la limite des
contraintes).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass
class InternalMetrics:
    width: float
    height: float
    depth: float
    thickness: float
    back_thickness: float
    bottom_setback: float

    def as_dict(self) -> Dict[str, float]:
        return {
            "width": round(self.width, 2),
            "height": round(self.height, 2),
            "depth": round(self.depth, 2),
        }


class ParametricSolver:
    MIN_INTERNAL = 100.0

    def __init__(self, panel_thickness: float = 19.0):
        self.t = float(panel_thickness)

    def recompute_cabinet(self, cabinet_data: Dict[str, float]) -> Dict[str, float]:
        """Calcule les dimensions internes et les panneaux de caisson.

        ``cabinet_data`` : width, height, depth, thickness, back_thickness,
        bottom_setback (jeu arrière).
        """
        width = float(cabinet_data["width"])
        height = float(cabinet_data["height"])
        depth = float(cabinet_data["depth"])
        t = float(cabinet_data.get("thickness", self.t))
        back_t = float(cabinet_data.get("back_thickness", 0) or 0)
        setback = float(cabinet_data.get("bottom_setback", 0) or 0)

        internal_width = width - 2 * t
        internal_height = height - 2 * t
        internal_depth = depth - back_t - setback

        if internal_width < self.MIN_INTERNAL or internal_height < self.MIN_INTERNAL:
            raise ValueError(
                f"Dimensions internes insuffisantes ({internal_width:.1f} x "
                f"{internal_height:.1f} mm). Minimum {self.MIN_INTERNAL:.0f} mm."
            )
        if internal_depth < 60:
            raise ValueError(
                f"Profondeur interne insuffisante ({internal_depth:.1f} mm). "
                "Réduisez le jeu arrière ou augmentez la profondeur."
            )
        return {
            "internal_width": round(internal_width, 2),
            "internal_height": round(internal_height, 2),
            "internal_depth": round(internal_depth, 2),
            "carcase": {
                "sides": {"length": height, "width": depth, "qty": 2},
                "top_bottom": {"length": max(0.0, width - 2 * t), "width": depth, "qty": 2},
                "back": {"length": internal_width, "width": internal_height, "qty": 1},
            },
        }

    def metrics(self, cabinet) -> InternalMetrics:
        data = self.recompute_cabinet(
            {
                "width": cabinet.width,
                "height": cabinet.height,
                "depth": cabinet.depth,
                "thickness": cabinet.material_carcase.thickness,
                "back_thickness": cabinet.material_back.thickness if cabinet.material_back else 0,
                "bottom_setback": cabinet.bottom_setback,
            }
        )
        return InternalMetrics(
            width=data["internal_width"],
            height=data["internal_height"],
            depth=data["internal_depth"],
            thickness=cabinet.material_carcase.thickness,
            back_thickness=cabinet.material_back.thickness if cabinet.material_back else 0,
            bottom_setback=cabinet.bottom_setback,
        )
