"""
Contrôles de cohérence : collisions, dépassements, débattements de portes.

Les fonctions retournent une liste de messages. Les erreurs bloquantes sont
levées par les outils (GeometryError), les avertissements sont affichés dans
l'interface et n'empêchent pas l'enregistrement.
"""
from __future__ import annotations

from typing import Iterable, List

from .division import AABB


class ValidationEngine:
    @staticmethod
    def check_shelf_length(shelf_bbox: AABB, volume_bbox: AABB) -> List[str]:
        messages: List[str] = []
        if shelf_bbox.width > volume_bbox.width + 0.01:
            messages.append(
                f"Étagère trop longue ({shelf_bbox.width:.1f} mm) pour une baie de "
                f"{volume_bbox.width:.1f} mm : collision avec les parois."
            )
        if shelf_bbox.depth > volume_bbox.depth + 0.01:
            messages.append(
                f"Étagère trop profonde ({shelf_bbox.depth:.1f} mm) pour un volume de "
                f"{volume_bbox.depth:.1f} mm."
            )
        if not volume_bbox.contains(shelf_bbox):
            messages.append("L'étagère sort du volume qui la contient.")
        return messages

    @staticmethod
    def check_overlap(a: AABB, b: AABB) -> bool:
        return a.intersects(b)

    @staticmethod
    def find_overlaps(components: Iterable[dict]) -> List[str]:
        messages: List[str] = []
        boxes = [c for c in components if c.get("bbox") is not None]
        for index, component in enumerate(boxes):
            for other in boxes[:index]:
                if component["bbox"].intersects(other["bbox"]):
                    messages.append(
                        f"Chevauchement détecté entre « {component.get('name', 'composant')} » "
                        f"et « {other.get('name', 'composant')} »."
                    )
        return messages

    @staticmethod
    def check_door_clearance(
        cabinet_depth: float,
        volume_depth: float,
        shelf_depth: float,
        door_thickness: float,
        door_gap: float,
    ) -> List[str]:
        """Vérifie qu'une étagère ne vient pas buter contre la porte."""
        messages: List[str] = []
        clearance = cabinet_depth - (volume_depth - shelf_depth)
        required = door_thickness + door_gap
        if clearance + 0.01 < required:
            messages.append(
                f"Débattement de porte insuffisant : il reste {clearance:.1f} mm "
                f"entre le chant de l'étagère et la façade, alors que l'épaisseur de "
                f"porte + jeu demande {required:.1f} mm."
            )
        return messages
