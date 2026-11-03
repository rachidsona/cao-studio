"""
Outil « Étagère ».

L'étagère est placée dans un volume **feuille**. Sa largeur est recalculée à
partir des parois latérales du volume, sa profondeur à partir du fond du
caisson (moins le jeu avant éventuel). Le moteur ne stocke donc pas une
longueur figée : la longueur est une conséquence des contraintes du volume.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional
import uuid

from .division import AABB, GeometryError, PanelDef, Vec3, VolumeNode


@dataclass
class ShelfPlacement:
    volume_id: str
    height_from_bottom: float
    depth_clearance_front: float = 0.0
    material_id: Optional[str] = None
    fixed: bool = False
    mode: str = "absolute"  # absolute | ratio


@dataclass
class ShelfInstance:
    id: str
    cabinet_id: str
    volume_id: str
    bbox: AABB
    height_from_bottom: float
    depth_clearance_front: float = 0.0
    fixed: bool = False
    material_id: Optional[str] = None
    constraints: dict = None


class ShelfTool:
    """Place et recalcule une étagère à l'intérieur d'un volume."""

    MIN_CLEARANCE = 10.0

    def __init__(self, panel_thickness: float = 19.0, side_clearance: float = 0.0):
        self.t = float(panel_thickness)
        self.side_clearance = float(side_clearance)

    def _check_volume(self, volume: VolumeNode) -> None:
        if volume.bbox is None:
            raise GeometryError("Volume sans géométrie (bbox manquante).")
        if volume.locked:
            raise GeometryError("Ce volume est verrouillé : impossible d'y ajouter une étagère.")
        if not volume.is_leaf:
            raise GeometryError("Choisissez une baie libre (sans séparation) pour l'étagère.")

    def validate_placement(
        self,
        volume: VolumeNode,
        height_from_bottom: float,
        depth_clearance_front: float = 0.0,
    ) -> List[str]:
        errors: List[str] = []
        self._check_volume(volume)
        b = volume.bbox
        if height_from_bottom < self.MIN_CLEARANCE:
            errors.append(
                f"L'étagère doit être à au moins {self.MIN_CLEARANCE:.0f} mm du bas "
                f"(position demandée : {height_from_bottom:.1f} mm)."
            )
        if height_from_bottom + self.t > b.height - self.MIN_CLEARANCE:
            errors.append(
                f"L'étagère dépasse du volume : position + épaisseur = "
                f"{height_from_bottom + self.t:.1f} mm pour une hauteur utile de "
                f"{b.height - self.MIN_CLEARANCE:.1f} mm."
            )
        clear_depth = b.depth - depth_clearance_front
        if clear_depth < self.t:
            errors.append(
                f"Profondeur insuffisante : {clear_depth:.1f} mm après un jeu avant de "
                f"{depth_clearance_front:.1f} mm."
            )
        return errors

    def place_shelf(self, volume: VolumeNode, placement: ShelfPlacement):
        errors = self.validate_placement(volume, placement.height_from_bottom, placement.depth_clearance_front)
        if errors:
            raise GeometryError(" ".join(errors))

        b = volume.bbox
        shelf_width = max(1.0, b.width - 2 * self.side_clearance)
        shelf_depth = max(1.0, b.depth - placement.depth_clearance_front)
        shelf_bbox = AABB(
            Vec3(b.x0 + self.side_clearance, b.y0 + placement.height_from_bottom, b.z0),
            Vec3(shelf_width, self.t, shelf_depth),
        )
        instance = ShelfInstance(
            id=str(uuid.uuid4()),
            cabinet_id=volume.cabinet_id,
            volume_id=volume.id,
            bbox=shelf_bbox,
            height_from_bottom=placement.height_from_bottom,
            depth_clearance_front=placement.depth_clearance_front,
            fixed=placement.fixed,
            material_id=placement.material_id or volume.meta.get("material_carcase_id"),
            constraints={"auto_length": True, "follow_volume_resize": True},
        )
        panel = self.panel_for(instance, placement.material_id)
        return instance, panel

    def panel_for(self, shelf: ShelfInstance, material_id=None) -> PanelDef:
        return PanelDef(
            name="Étagère",
            material_id=material_id or shelf.material_id,
            length=shelf.bbox.width,
            width=shelf.bbox.depth,
            thickness=self.t,
            qty=1,
            edge_banding="Chant avant",
            origin="shelf",
        )

    def recalc(self, volume: VolumeNode, height_from_bottom: float, depth_clearance_front: float = 0.0):
        """Recalcule l'étagère après un redimensionnement du volume."""
        b = volume.bbox
        height_from_bottom = min(
            max(height_from_bottom, self.MIN_CLEARANCE),
            max(self.MIN_CLEARANCE, b.height - self.t - self.MIN_CLEARANCE),
        )
        depth_clearance_front = min(max(depth_clearance_front, 0.0), max(0.0, b.depth - self.t))
        shelf_width = max(1.0, b.width - 2 * self.side_clearance)
        shelf_depth = max(1.0, b.depth - depth_clearance_front)
        bbox = AABB(
            Vec3(b.x0 + self.side_clearance, b.y0 + height_from_bottom, b.z0),
            Vec3(shelf_width, self.t, shelf_depth),
        )
        return bbox, height_from_bottom, depth_clearance_front
