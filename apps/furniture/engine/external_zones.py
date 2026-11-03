"""
Zones externes au caisson : plinthe, pieds, socle.

Ces volumes ne participent PAS à la décomposition interne : ils sont rangés
sous la racine « caisson » comme objets externes et génèrent leurs propres
panneaux dans la liste de débit.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from .division import AABB, PanelDef, Vec3


@dataclass
class PlinthDef:
    cabinet_width: float
    cabinet_depth: float
    plinth_height: float = 100.0
    plinth_thickness: float = 19.0
    set_back: float = 0.0
    material_id: Optional[str] = None


@dataclass
class FootDef:
    count: int = 4
    foot_size_x: float = 50.0
    foot_size_y: float = 70.0
    foot_size_z: float = 50.0
    inset: float = 20.0
    material_id: Optional[str] = None


class ExternalZoneBuilder:
    def __init__(self, panel_thickness: float = 19.0):
        self.t = float(panel_thickness)

    def build_plinth(self, plinth: PlinthDef):
        """Plinthe en retrait, sous le caisson (Y négatif)."""
        width = max(1.0, plinth.cabinet_width - 2 * max(0.0, plinth.set_back))
        depth = max(1.0, plinth.cabinet_depth - 2 * max(0.0, plinth.set_back))
        bbox = AABB(
            Vec3(max(0.0, plinth.set_back), -abs(plinth.plinth_height), max(0.0, plinth.set_back)),
            Vec3(width, abs(plinth.plinth_height), depth),
        )
        panels = [
            PanelDef(
                name="Plinthe avant",
                material_id=plinth.material_id,
                length=width,
                width=plinth.plinth_height,
                thickness=plinth.plinth_thickness,
                qty=1,
                edge_banding="Chant supérieur",
                origin="external",
            ),
            PanelDef(
                name="Retour de plinthe",
                material_id=plinth.material_id,
                length=max(1.0, depth - self.t),
                width=plinth.plinth_height,
                thickness=plinth.plinth_thickness,
                qty=2,
                origin="external",
            ),
        ]
        return bbox, panels

    def build_feet(self, feet: FootDef, cabinet_width: float, cabinet_depth: float):
        boxes: List[AABB] = []
        positions = [
            (feet.inset, 0.0, feet.inset),
            (cabinet_width - feet.inset - feet.foot_size_x, 0.0, feet.inset),
            (feet.inset, 0.0, cabinet_depth - feet.inset - feet.foot_size_z),
            (
                cabinet_width - feet.inset - feet.foot_size_x,
                0.0,
                cabinet_depth - feet.inset - feet.foot_size_z,
            ),
        ][: feet.count]
        for px, py, pz in positions:
            boxes.append(
                AABB(Vec3(px, py - feet.foot_size_y, pz), Vec3(feet.foot_size_x, feet.foot_size_y, feet.foot_size_z))
            )
        panels = [
            PanelDef(
                name="Pied",
                material_id=feet.material_id,
                length=feet.foot_size_x,
                width=feet.foot_size_z,
                thickness=feet.foot_size_y,
                qty=feet.count,
                origin="external",
            )
        ]
        return boxes, panels
