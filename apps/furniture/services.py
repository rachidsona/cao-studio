"""
Service applicatif : relie le moteur paramétrique, les modèles Django, la
liste de débit et le devis.

Toute mutation passe par ``rebuild()`` : l'arbre de volumes est rejoué, les
dimensions des composants recalculées, les panneaux régénérés puis la liste de
débit et le devis resynchronisés. C'est ce qui garantit la paramétrie de bout
en bout.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from django.core.exceptions import ValidationError
from django.db import transaction

from .engine import (
    AABB,
    ExternalZoneBuilder,
    GeometryError,
    ParametricSolver,
    PlinthDef,
    ShelfTool,
    ValidationEngine,
    Vec3,
    VolumeNode,
    VolumetricDivider,
)
from .models import Cabinet, CarcassPanel, Component, ExternalZone, InternalVolume, Material, Panel
from .scene import build_scene
from apps.quotes.models import Quote, QuoteLine
from apps.workshop.models import CutList, CutListItem


def _cm(millimetres: float) -> str:
    """Une longueur en mm écrite en cm à la française (« 2,3 »)."""
    return f"{millimetres / 10:.1f}".replace(".", ",")


class CabinetDesignError(Exception):
    """Erreur métier remontée à l'interface (message en français)."""


class CabinetDesignService:
    MIN_BAY = 50.0
    MIN_SHELF_CLEARANCE = 10.0
    MIN_PARTITION_HEIGHT = 40.0

    def __init__(self, cabinet: Cabinet):
        self.cabinet = cabinet
        self.t = float(cabinet.material_carcase.thickness)
        self.solver = ParametricSolver(panel_thickness=self.t)
        self.divider = VolumetricDivider(self.t, min_bay=self.MIN_BAY, min_clearance=5.0)
        self.shelf_tool = ShelfTool(self.t, side_clearance=cabinet.shelf_side_clearance)

    # ------------------------------------------------------------------
    # Racine et reconstruction paramétrique
    # ------------------------------------------------------------------
    def _root_bbox(self) -> AABB:
        metrics = self.solver.metrics(self.cabinet)
        cp = {panel.side: panel for panel in self.cabinet.carcass_panels.all()}
        left_t = float(cp["left"].effective_thickness) if cp.get("left") else self.t
        right_t = float(cp["right"].effective_thickness) if cp.get("right") else self.t
        bottom_t = float(cp["bottom"].effective_thickness) if cp.get("bottom") else self.t
        top_t = float(cp["top"].effective_thickness) if cp.get("top") else self.t
        bottom_pos = float(cp["bottom"].position) if cp.get("bottom") else 0.0
        top_pos = float(cp["top"].position) if cp.get("top") else 0.0
        width = max(1.0, self.cabinet.width - left_t - right_t)
        height = max(1.0, self.cabinet.height - bottom_t - top_t - bottom_pos - top_pos)
        return AABB(
            Vec3(left_t, bottom_t + bottom_pos, metrics.back_thickness),
            Vec3(width, height, metrics.depth),
        )

    def ensure_root_volume(self) -> InternalVolume:
        bbox = self._root_bbox()
        if bbox.width < 1 or bbox.height < 1 or bbox.depth < 1:
            raise CabinetDesignError(
                "Dimensions internes insuffisantes : augmentez les cotes du caisson "
                "ou réduisez l'épaisseur des panneaux."
            )
        roots = list(self.cabinet.internal_volumes.filter(is_root=True).order_by("pk"))
        if roots:
            root = roots[0]
            for duplicate in roots[1:]:
                duplicate.delete()
        else:
            root = InternalVolume(cabinet=self.cabinet, is_root=True, slot="")
        root.parent = None
        root.pos_x, root.pos_y, root.pos_z = bbox.x0, bbox.y0, bbox.z0
        root.width, root.height, root.depth = bbox.width, bbox.height, bbox.depth
        root.save()
        return root

    @transaction.atomic
    def rebuild(self) -> List[str]:
        """Rejoue tout l'arbre et resynchronise panneaux, cut-list et devis."""
        root = self.ensure_root_volume()
        self._layout_volume(root, depth=0)
        self._ensure_carcass_panels()
        warnings = self._validate()
        self._sync_panels()
        self._sync_cutlist()
        self._sync_quote()
        return warnings

    def _ensure_carcass_panels(self) -> None:
        """Crée les panneaux structurels éditables s'ils manquent."""
        for side, _label in CarcassPanel.SIDES:
            CarcassPanel.objects.get_or_create(cabinet=self.cabinet, side=side)

    def _layout_volume(self, volume: InternalVolume, depth: int = 0) -> None:
        if depth > 30:
            raise CabinetDesignError("Profondeur de décomposition excessive (arbre corrompu).")

        if volume.split_direction:
            self._layout_split(volume, depth)
        else:
            self._layout_leaf(volume, depth)
        volume.save()

    def _layout_split(self, volume: InternalVolume, depth: int) -> None:
        children = list(volume.children.order_by("slot", "pk"))
        if len(children) < 2:
            # Auto-réparation : recrée les niches manquantes.
            for slot in ("a", "b"):
                if not any(child.slot == slot for child in children):
                    children.append(
                        InternalVolume.objects.create(
                            cabinet=self.cabinet,
                            parent=volume,
                            slot=slot,
                            width=1,
                            height=1,
                            depth=1,
                        )
                    )
        extra = children[2:]
        children = sorted(children[:2], key=lambda child: (child.slot or "", child.pk))
        if extra:
            for child in extra:
                child.delete()

        node = VolumeNode(
            id=str(volume.pk),
            cabinet_id=str(self.cabinet.pk),
            bbox=AABB(
                Vec3(volume.pos_x, volume.pos_y, volume.pos_z),
                Vec3(volume.width, volume.height, volume.depth),
            ),
            meta={"material_carcase_id": str(self.cabinet.material_carcase_id)},
        )

        vertical = volume.split_direction == "vertical"
        size = volume.width if vertical else volume.height
        component_type = "divider_v" if vertical else "divider_h"

        existing = list(
            volume.components.filter(component_type=component_type).order_by("pk")
        )

        # Un « côté » de séparation est constitué de deux panneaux collés :
        # le côté droit de la niche de gauche et le côté gauche de la niche
        # de droite. L'épaisseur totale des deux panneaux décale les niches.
        double_side = vertical and volume.split_side
        if double_side:
            thicknesses: List[float] = []
            for component in existing[:2]:
                candidate = float(component.width)
                thicknesses.append(candidate if candidate > 0 else self.t)
            if not thicknesses:
                thicknesses = [self.t, self.t]
            elif len(thicknesses) == 1:
                thicknesses.append(thicknesses[0])
            total_thickness = sum(thicknesses)
        else:
            thickness = self.t
            if existing:
                candidate = float(
                    existing[0].width if vertical else existing[0].height
                )
                if candidate > 0:
                    thickness = candidate
            total_thickness = thickness

        tool = self.divider
        if abs(total_thickness - self.t) > 0.01:
            tool = VolumetricDivider(
                total_thickness, min_bay=self.MIN_BAY, min_clearance=5.0
            )

        bounds = tool.bounds_for(size)
        if volume.split_mode == "ratio":
            offset = volume.split_ratio * size
        else:
            offset = volume.split_offset
        offset = min(max(offset, bounds["min"]), bounds["max"])

        if vertical:
            result = tool.split_vertical(node, offset)
        else:
            result = tool.split_horizontal(node, offset)

        volume.split_offset = result.offset
        volume.split_ratio = result.offset / size if size else 0.5

        for child, child_node in zip(children, result.children):
            child.parent = volume
            child.pos_x, child.pos_y, child.pos_z = (
                child_node.bbox.x0,
                child_node.bbox.y0,
                child_node.bbox.z0,
            )
            child.width, child.height, child.depth = (
                child_node.bbox.width,
                child_node.bbox.height,
                child_node.bbox.depth,
            )
            child.save()
            self._layout_volume(child, depth + 1)

        if double_side:
            base_material = (
                existing[0].material if existing else self.cabinet.material_carcase
            )
            base_edge = existing[0].edge_banding if existing else "Chant avant"
            while len(existing) < 2:
                thickness_value = thicknesses[len(existing)]
                component = Component.objects.create(
                    cabinet=self.cabinet,
                    volume=volume,
                    component_type="divider_v",
                    material=base_material,
                    position_from_left=result.offset,
                    width=thickness_value,
                    height=volume.height,
                    depth=volume.depth,
                    edge_banding=base_edge or "Chant avant",
                )
                existing.append(component)
            dividers = existing[:2]
            for orphan in existing[2:]:
                orphan.delete()

            cursor = result.offset - total_thickness / 2
            for index, divider in enumerate(dividers):
                thickness_value = thicknesses[index]
                if divider.material_id is None:
                    divider.material = base_material
                divider.offset_mode = volume.split_mode
                divider.ratio = volume.split_ratio
                divider.position_from_left = cursor + thickness_value / 2
                divider.width = thickness_value
                divider.height = volume.height
                divider.depth = volume.depth
                if not divider.edge_banding:
                    divider.edge_banding = "Chant avant"
                divider.save()
                cursor += thickness_value
        else:
            if existing:
                divider = existing[0]
            else:
                divider = Component(
                    cabinet=self.cabinet,
                    volume=volume,
                    component_type=component_type,
                    material=self.cabinet.material_carcase,
                    width=thickness if vertical else volume.width,
                    height=volume.height if vertical else thickness,
                    depth=volume.depth,
                    edge_banding="Chant avant",
                )
            if divider.material_id is None:
                divider.material = self.cabinet.material_carcase
            divider.offset_mode = volume.split_mode
            divider.ratio = volume.split_ratio
            if vertical:
                divider.position_from_left = result.offset
                divider.width = thickness
                divider.height = volume.height
            else:
                divider.position_from_bottom = result.offset
                divider.width = volume.width
                divider.height = thickness
            if component_type == "divider_h" and volume.split_shelf:
                divider.depth = max(
                    1.0,
                    volume.depth - max(0.0, float(divider.depth_clearance_front)),
                )
            else:
                divider.depth = volume.depth
            if not divider.edge_banding:
                divider.edge_banding = "Chant avant"
            divider.save()
            for orphan in existing[1:]:
                orphan.delete()
            dividers = [divider]

        # Un volume divisé ne peut pas contenir d'étagère ni de séparation
        # partielle directement.
        volume.components.filter(
            component_type__in=("shelf", "partition_v")
        ).delete()
        self._delete_orphan_dividers(
            volume, keep=[divider.pk for divider in dividers]
        )

    def _delete_orphan_dividers(
        self, volume: InternalVolume, keep: Optional[Any] = None
    ) -> None:
        queryset = volume.components.filter(
            component_type__in=("divider_v", "divider_h")
        )
        if keep:
            keep_ids = [keep] if isinstance(keep, int) else list(keep)
            queryset = queryset.exclude(pk__in=keep_ids)
        queryset.delete()

    def _layout_leaf(self, volume: InternalVolume, depth: int) -> None:
        # Données anciennes / incohérentes : un volume feuille ne doit pas avoir
        # de niches filles ni de séparation résiduelle.
        if volume.children.exists():
            volume.children.all().delete()
        self._delete_orphan_dividers(volume)

        shelves = list(
            volume.components.filter(component_type="shelf").select_related(
                "shelf_left_partition", "shelf_right_partition"
            )
        )
        for shelf in shelves:
            bbox = AABB(
                Vec3(volume.pos_x, volume.pos_y, volume.pos_z),
                Vec3(volume.width, volume.height, volume.depth),
            )
            node = VolumeNode(id=str(volume.pk), cabinet_id=str(self.cabinet.pk), bbox=bbox)
            if shelf.offset_mode == "ratio":
                requested = shelf.ratio * volume.height
            else:
                requested = shelf.position_from_bottom
            new_bbox, position, clearance = self.shelf_tool.recalc(
                node, requested, shelf.depth_clearance_front
            )
            shelf.position_from_bottom = position
            shelf.ratio = position / volume.height if volume.height else 0.5
            shelf.depth_clearance_front = clearance
            # Largeur provisoire : elle sera recalculée après le placement
            # des séparations, dont dépendent les étagères de colonne.
            shelf.width = new_bbox.width
            shelf.position_from_left = max(0.0, (volume.width - new_bbox.width) / 2)
            shelf.height = new_bbox.height
            shelf.depth = new_bbox.depth
            shelf.material = shelf.material or self.cabinet.material_carcase
            shelf.edge_banding = shelf.edge_banding or "Chant avant"
            shelf.save()

        self._layout_partitions(volume)

        # Les séparations ont maintenant leur position définitive : on ajuste la
        # largeur des étagères de colonne entre leurs deux séparations.
        for shelf in volume.components.filter(component_type="shelf").select_related(
            "shelf_left_partition", "shelf_right_partition"
        ):
            self._layout_shelf_span(volume, shelf)
            shelf.save()

    def _layout_partitions(self, volume: InternalVolume) -> None:
        """Recalcule les séparations partielles après les étagères de la niche."""
        partitions = list(
            volume.components.filter(component_type="partition_v").select_related(
                "partition_lower_shelf", "partition_upper_shelf"
            )
        )
        if not partitions:
            return

        bounds = self.divider.bounds_for(volume.width)
        for partition in partitions:
            lower = partition.partition_lower_shelf
            upper = partition.partition_upper_shelf
            if (
                (lower is not None and lower.volume_id != volume.pk)
                or (upper is not None and upper.volume_id != volume.pk)
                or (lower is not None and upper is not None and lower.pk == upper.pk)
            ):
                partition.delete()
                continue

            if (
                lower is not None
                and upper is not None
                and lower.position_from_bottom > upper.position_from_bottom
            ):
                lower, upper = upper, lower
                partition.partition_lower_shelf = lower
                partition.partition_upper_shelf = upper

            lower_top = lower.position_from_bottom + lower.height if lower is not None else 0.0
            upper_bottom = upper.position_from_bottom if upper is not None else volume.height
            gap = upper_bottom - lower_top

            requested = partition.ratio * volume.width if partition.offset_mode == "ratio" else partition.position_from_left
            if bounds["max"] <= bounds["min"]:
                center = volume.width / 2
            else:
                center = min(max(requested, bounds["min"]), bounds["max"])

            if lower is not None and upper is not None:
                partition_depth = min(lower.depth, upper.depth)
            elif lower is not None:
                partition_depth = lower.depth
            elif upper is not None:
                partition_depth = upper.depth
            else:
                partition_depth = volume.depth

            partition.position_from_bottom = lower_top
            partition.height = max(1.0, gap)
            partition.position_from_left = center
            partition.ratio = center / volume.width if volume.width else 0.5
            partition.width = self.t
            partition.depth = max(1.0, min(partition_depth, volume.depth))
            partition.material = partition.material or self.cabinet.material_carcase
            partition.edge_banding = partition.edge_banding or "Chant avant"
            partition.save()

    def _partitions_at_height(
        self,
        volume: InternalVolume,
        height_from_bottom: float,
        thickness: float,
    ) -> List[Component]:
        """Séparations verticales présentes sur toute la hauteur de l'étagère."""
        top = height_from_bottom + thickness
        return [
            partition
            for partition in volume.components.filter(component_type="partition_v").order_by(
                "position_from_left", "pk"
            )
            if partition.position_from_bottom <= height_from_bottom + 0.01
            and partition.position_from_bottom + partition.height >= top - 0.01
        ]

    def _column_boundaries(
        self,
        volume: InternalVolume,
        height_from_bottom: float,
        thickness: float,
        left_partition_id: Optional[int],
        right_partition_id: Optional[int],
    ) -> tuple[Optional[Component], Optional[Component]]:
        """Valide les deux séparations qui encadrent une étagère de colonne."""
        partitions = self._partitions_at_height(volume, height_from_bottom, thickness)
        if left_partition_id is None and right_partition_id is None:
            if partitions:
                raise CabinetDesignError(
                    "Cette niche contient des séparations à cette hauteur. "
                    "Choisissez la colonne qui doit recevoir l'étagère."
                )
            return None, None

        by_id = {partition.pk: partition for partition in partitions}
        if left_partition_id is not None and left_partition_id not in by_id:
            raise CabinetDesignError(
                "La séparation de gauche n'existe pas à la hauteur de l'étagère."
            )
        if right_partition_id is not None and right_partition_id not in by_id:
            raise CabinetDesignError(
                "La séparation de droite n'existe pas à la hauteur de l'étagère."
            )
        if left_partition_id is not None and left_partition_id == right_partition_id:
            raise CabinetDesignError("Les deux limites de l'étagère sont identiques.")

        ordered = [None] + [partition.pk for partition in partitions] + [None]
        try:
            left_index = 0 if left_partition_id is None else ordered.index(left_partition_id)
            right_index = (
                len(ordered) - 1
                if right_partition_id is None
                else ordered.index(right_partition_id)
            )
        except ValueError as exc:
            raise CabinetDesignError(
                "Choisissez deux limites adjacentes pour l'étagère."
            ) from exc
        if right_index != left_index + 1:
            raise CabinetDesignError(
                "Choisissez deux séparations adjacentes : une autre séparation se trouve entre elles."
            )

        return by_id.get(left_partition_id), by_id.get(right_partition_id)

    def _shelf_span_bounds(
        self,
        volume: InternalVolume,
        left_partition: Optional[Component],
        right_partition: Optional[Component],
    ) -> tuple[float, float]:
        """Retourne les bords gauche/droit de l'étagère dans le volume."""
        clearance = max(0.0, float(self.cabinet.shelf_side_clearance))
        left_face = 0.0
        if left_partition is not None:
            left_face = left_partition.position_from_left + left_partition.width / 2
        right_face = float(volume.width)
        if right_partition is not None:
            right_face = right_partition.position_from_left - right_partition.width / 2
        left = max(0.0, min(left_face + clearance, float(volume.width)))
        right = max(0.0, min(right_face - clearance, float(volume.width)))
        return left, right

    def _partition_column_bounds(
        self,
        volume: InternalVolume,
        shelves: List[Component],
    ) -> tuple[float, float, bool]:
        """Déduit la colonne horizontale des étagères qui bornent une séparation.

        L'emprise commune des étagères, élargie du jeu latéral, donne les faces
        de la colonne. Sans étagère de référence, la séparation occupe toute la
        largeur de la niche. Deux étagères de colonnes différentes n'ont pas
        d'emprise commune : la séparation ne peut pas les relier.
        """
        if not shelves:
            return 0.0, float(volume.width), True
        clearance = max(0.0, float(self.cabinet.shelf_side_clearance))
        left = max(float(shelf.position_from_left) for shelf in shelves) - clearance
        right = min(
            float(shelf.position_from_left) + float(shelf.width)
            for shelf in shelves
        ) + clearance
        left = max(0.0, left)
        right = min(float(volume.width), right)
        if right - left < 1.0:
            raise CabinetDesignError(
                "Les deux étagères ne sont pas dans la même colonne."
            )
        full_width = left <= 0.01 and right >= float(volume.width) - 0.01
        return left, right, full_width

    def _layout_shelf_span(self, volume: InternalVolume, shelf: Component) -> None:
        """Recalcule la largeur d'une étagère après le placement des séparations."""
        left_partition = shelf.shelf_left_partition
        right_partition = shelf.shelf_right_partition
        if left_partition is not None and left_partition.volume_id != volume.pk:
            left_partition = None
            shelf.shelf_left_partition = None
        if right_partition is not None and right_partition.volume_id != volume.pk:
            right_partition = None
            shelf.shelf_right_partition = None

        if left_partition is None and right_partition is None:
            shelf.width = max(
                1.0,
                float(volume.width) - 2 * max(0.0, float(self.cabinet.shelf_side_clearance)),
            )
            shelf.position_from_left = max(0.0, (float(volume.width) - shelf.width) / 2)
            return

        left, right = self._shelf_span_bounds(volume, left_partition, right_partition)
        if right - left < 1.0:
            center = (left + right) / 2
            left = max(0.0, min(center - 0.5, float(volume.width) - 1.0))
            right = min(float(volume.width), left + 1.0)
        shelf.position_from_left = max(0.0, min(left, float(volume.width) - 1.0))
        shelf.width = max(1.0, min(right - left, float(volume.width) - shelf.position_from_left))

    # ------------------------------------------------------------------
    # Outil de division
    # ------------------------------------------------------------------
    def _volume(self, volume_id: int) -> InternalVolume:
        try:
            return self.cabinet.internal_volumes.get(pk=volume_id)
        except InternalVolume.DoesNotExist as exc:
            raise CabinetDesignError("Volume introuvable.") from exc

    @transaction.atomic
    def split_volume(
        self,
        volume_id: int,
        direction: str,
        position: float,
        mode: str = "ratio",
        side: bool = False,
    ) -> Dict[str, Any]:
        if side:
            direction = "vertical"
        if direction not in ("vertical", "horizontal"):
            raise CabinetDesignError("Direction de division invalide.")
        if mode not in ("ratio", "absolute"):
            raise CabinetDesignError("Mode de position invalide.")
        volume = self._volume(volume_id)
        if not volume.is_leaf:
            raise CabinetDesignError("Ce volume est déjà divisé.")
        if volume.locked:
            raise CabinetDesignError("Ce volume est verrouillé.")
        if volume.components.filter(component_type__in=("shelf", "partition_v")).exists():
            raise CabinetDesignError(
                "Retirez les étagères et séparations de ce volume avant de le diviser "
                "(ou créez la division avant les étagères)."
            )

        size = volume.width if direction == "vertical" else volume.height
        if position <= 1.0 and mode == "ratio":
            offset = position * size
            ratio = position
        else:
            offset = float(position)
            ratio = offset / size if size else 0.5

        # Validation immédiate (lève GeometryError si les niches sont trop petites)
        node = VolumeNode(
            id=str(volume.pk),
            cabinet_id=str(self.cabinet.pk),
            bbox=AABB(
                Vec3(volume.pos_x, volume.pos_y, volume.pos_z),
                Vec3(volume.width, volume.height, volume.depth),
            ),
        )
        divider_tool = self.divider
        if side and direction == "vertical":
            # Deux panneaux collés : la séparation occupe 2 × épaisseur.
            divider_tool = VolumetricDivider(
                self.t * 2, min_bay=self.MIN_BAY, min_clearance=5.0
            )
        if direction == "vertical":
            divider_tool.split_vertical(node, offset)
        else:
            divider_tool.split_horizontal(node, offset)

        volume.split_direction = direction
        volume.split_side = bool(side)
        volume.split_mode = mode
        volume.split_ratio = ratio
        volume.split_offset = offset
        volume.save()

        # Les enfants sont créés par le rebuild s'ils manquent ; on les crée ici
        # pour conserver les identifiants stables dès la première division.
        if not volume.children.exists():
            InternalVolume.objects.create(
                cabinet=self.cabinet, parent=volume, slot="a", width=1, height=1, depth=1
            )
            InternalVolume.objects.create(
                cabinet=self.cabinet, parent=volume, slot="b", width=1, height=1, depth=1
            )

        warnings = self.rebuild()
        if side:
            message = "Côté créé : deux panneaux collés."
        elif direction == "vertical":
            message = "Séparation créée."
        else:
            message = "Étagère créée."
        return {"scene": self.scene(warnings), "message": message}

    @transaction.atomic
    def update_split(
        self,
        volume_id: int,
        position: float,
        mode: str = "absolute",
    ) -> Dict[str, Any]:
        volume = self._volume(volume_id)
        if not volume.split_direction:
            raise CabinetDesignError("Ce volume n'est pas divisé.")
        size = volume.width if volume.split_direction == "vertical" else volume.height
        if mode not in ("ratio", "absolute"):
            raise CabinetDesignError("Mode de position invalide.")
        if mode == "ratio":
            volume.split_ratio = min(max(float(position), 0.0), 1.0)
            volume.split_offset = volume.split_ratio * size
        else:
            volume.split_offset = float(position)
            volume.split_ratio = volume.split_offset / size if size else 0.5
        volume.split_mode = mode
        volume.save()
        warnings = self.rebuild()
        if volume.split_side:
            message = "Côté déplacé."
        elif volume.split_direction == "horizontal":
            message = "Étagère déplacée."
        else:
            message = "Séparation déplacée."
        return {"scene": self.scene(warnings), "message": message}

    @transaction.atomic
    def remove_split(self, volume_id: int) -> Dict[str, Any]:
        volume = self._volume(volume_id)
        if not volume.split_direction:
            raise CabinetDesignError("Ce volume n'est pas divisé.")
        volume.children.all().delete()
        volume.components.filter(component_type__in=("divider_v", "divider_h")).delete()
        volume.split_direction = ""
        volume.split_mode = "ratio"
        volume.split_ratio = 0.5
        volume.split_offset = 0
        volume.save()
        warnings = self.rebuild()
        return {"scene": self.scene(warnings), "message": "Division supprimée."}

    # ------------------------------------------------------------------
    # Outil compartiments (grille de divisions)
    # ------------------------------------------------------------------
    @staticmethod
    def _normalize_distribution(
        values: Optional[Any],
        count: int,
        label: str,
    ) -> List[float]:
        """Normalise une liste de proportions, ou retourne des parts égales."""
        if values is None or (isinstance(values, str) and not values.strip()):
            return [1.0 / count] * count
        if isinstance(values, str):
            parts = [
                part.strip()
                for part in values.replace(";", ",").split(",")
                if part.strip()
            ]
        elif isinstance(values, (list, tuple)):
            parts = list(values)
        else:
            raise CabinetDesignError(f"Format des {label} invalide.")
        if len(parts) != count:
            raise CabinetDesignError(
                f"Indiquez {count} valeur{'s' if count > 1 else ''} pour les {label}."
            )
        numbers: List[float] = []
        for part in parts:
            try:
                value = float(part)
            except (TypeError, ValueError) as exc:
                raise CabinetDesignError(
                    f"Valeur invalide dans les {label}."
                ) from exc
            if not math.isfinite(value) or value <= 0:
                raise CabinetDesignError(f"Les {label} doivent être positives.")
            numbers.append(value)
        total = sum(numbers)
        if total <= 0:
            raise CabinetDesignError(f"Les {label} doivent être positives.")
        return [value / total for value in numbers]

    def _distribute_sizes(
        self,
        size: float,
        count: int,
        weights: List[float],
        singular: str,
        error: str,
    ) -> List[float]:
        """Répartit une longueur disponible entre des compartiments."""
        available = float(size) - (count - 1) * self.t
        if available <= 0:
            raise CabinetDesignError(error)
        sizes = [available * weight for weight in weights]
        if any(value < self.MIN_BAY - 0.01 for value in sizes):
            raise CabinetDesignError(
                f"{error} Chaque {singular} doit mesurer au moins "
                f"{self.MIN_BAY:.0f} mm."
            )
        return sizes

    def _split_once(
        self,
        volume: InternalVolume,
        direction: str,
        offset: float,
    ) -> tuple[InternalVolume, InternalVolume]:
        """Crée une division et retourne les deux niches filles (a, b)."""
        if direction not in ("vertical", "horizontal"):
            raise CabinetDesignError("Direction de division invalide.")
        size = volume.width if direction == "vertical" else volume.height
        bounds = self.divider.bounds_for(size)
        if not math.isfinite(offset):
            raise CabinetDesignError("Position de division invalide.")
        if offset < bounds["min"] - 0.01 or offset > bounds["max"] + 0.01:
            raise CabinetDesignError(
                f"Division hors limites : {offset:.1f} mm "
                f"(autorisé entre {bounds['min']:.1f} et {bounds['max']:.1f} mm)."
            )

        volume.split_direction = direction
        volume.split_mode = "ratio"
        volume.split_offset = offset
        volume.split_ratio = offset / size if size else 0.5
        volume.save(
            update_fields=[
                "split_direction",
                "split_mode",
                "split_offset",
                "split_ratio",
            ]
        )

        children = list(volume.children.order_by("slot", "pk"))
        for slot in ("a", "b"):
            if not any(child.slot == slot for child in children):
                children.append(
                    InternalVolume.objects.create(
                        cabinet=self.cabinet,
                        parent=volume,
                        slot=slot,
                        width=1,
                        height=1,
                        depth=1,
                    )
                )
        children = sorted(children[:2], key=lambda child: (child.slot or "", child.pk))
        self._layout_volume(volume)
        # _layout_split met à jour les niches via une autre instance : on relit
        # les dimensions calculées avant de poursuivre la grille.
        for child in children:
            child.refresh_from_db()
        return children[0], children[1]

    @transaction.atomic
    def add_compartment_grid(
        self,
        *,
        volume_id: int,
        columns: int,
        rows: int,
        column_widths: Optional[Any] = None,
        row_heights: Optional[Any] = None,
        top_row_height: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Crée une grille de compartiments par divisions imbriquées.

        La grille est structurelle : elle crée des niches et des séparations,
        pas des étagères. Elle doit donc être créée dans une niche vide, avant
        les étagères et les séparations. ``top_row_height`` ajoute une rangée
        supérieure pleine largeur au-dessus de la grille.
        """
        try:
            columns_value = int(columns)
            rows_value = int(rows)
        except (TypeError, ValueError) as exc:
            raise CabinetDesignError(
                "Nombre de colonnes ou de rangées invalide."
            ) from exc
        if isinstance(columns, bool) or float(columns) != columns_value:
            raise CabinetDesignError("Le nombre de colonnes doit être un entier.")
        if isinstance(rows, bool) or float(rows) != rows_value:
            raise CabinetDesignError("Le nombre de rangées doit être un entier.")
        if not 2 <= columns_value <= 8:
            raise CabinetDesignError(
                "Le nombre de colonnes doit être compris entre 2 et 8."
            )
        if not 1 <= rows_value <= 8:
            raise CabinetDesignError(
                "Le nombre de rangées doit être compris entre 1 et 8."
            )

        volume = self._volume(int(volume_id))
        if not volume.is_leaf or volume.children.exists():
            raise CabinetDesignError(
                "Choisissez une niche libre pour créer les compartiments."
            )
        if volume.locked:
            raise CabinetDesignError("Ce volume est verrouillé.")
        if volume.components.filter(component_type__in=("shelf", "partition_v")).exists():
            raise CabinetDesignError(
                "Ce volume contient déjà des étagères ou des séparations. "
                "Créez la grille avant, ou choisissez une niche vide."
            )

        column_weights = self._normalize_distribution(
            column_widths, columns_value, "largeurs de colonnes"
        )
        row_weights = self._normalize_distribution(
            row_heights, rows_value, "hauteurs de rangées"
        )

        top_height: Optional[float] = None
        if top_row_height not in (None, ""):
            try:
                top_height = float(top_row_height)
            except (TypeError, ValueError) as exc:
                raise CabinetDesignError(
                    "Hauteur de la rangée du haut invalide."
                ) from exc
            if not math.isfinite(top_height) or top_height <= 0:
                raise CabinetDesignError(
                    "La hauteur de la rangée du haut doit être positive."
                )
            if top_height < self.MIN_BAY - 0.01:
                raise CabinetDesignError(
                    f"La rangée du haut doit mesurer au moins "
                    f"{self.MIN_BAY:.0f} mm."
                )
            if top_height > volume.height - self.t - self.MIN_BAY + 0.01:
                raise CabinetDesignError(
                    "La rangée du haut laisse trop peu de place pour les "
                    "compartiments."
                )

        grid_volume = volume
        if top_height is not None:
            offset = volume.height - top_height - self.t / 2
            bottom, _top = self._split_once(volume, "horizontal", offset)
            grid_volume = bottom

        column_sizes = self._distribute_sizes(
            grid_volume.width,
            columns_value,
            column_weights,
            "colonne",
            "La niche est trop étroite pour ces colonnes.",
        )

        column_volumes: List[InternalVolume] = []
        remaining = grid_volume
        for index in range(columns_value - 1):
            offset = column_sizes[index] + self.t / 2
            left, remaining = self._split_once(remaining, "vertical", offset)
            column_volumes.append(left)
        column_volumes.append(remaining)

        row_sizes = self._distribute_sizes(
            column_volumes[0].height,
            rows_value,
            row_weights,
            "rangée",
            "La hauteur est trop faible pour ces rangées.",
        )
        for column in column_volumes:
            remaining = column
            for index in range(rows_value - 1):
                offset = row_sizes[index] + self.t / 2
                _bottom, remaining = self._split_once(remaining, "horizontal", offset)

        warnings = self.rebuild()
        count = columns_value * rows_value + (1 if top_height is not None else 0)
        return {
            "scene": self.scene(warnings),
            "message": (
                f"Grille de {count} compartiment{'s' if count > 1 else ''} créée."
            ),
        }

    # ------------------------------------------------------------------
    # Outil étagère
    # ------------------------------------------------------------------
    @transaction.atomic
    def add_shelf(
        self,
        volume_id: int,
        position: float,
        mode: str = "absolute",
        depth_clearance_front: float = 0.0,
        material_id: Optional[int] = None,
        left_partition_id: Optional[int] = None,
        right_partition_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        volume = self._volume(volume_id)
        if not volume.is_leaf:
            raise CabinetDesignError("Choisissez une niche libre pour ajouter une étagère.")
        if mode not in ("absolute", "ratio"):
            raise CabinetDesignError("Mode de position invalide.")

        if left_partition_id is not None or right_partition_id is not None:
            raise CabinetDesignError(
                "Les étagères de colonne ne sont plus prises en charge : divisez "
                "d'abord la niche par une séparation verticale, puis ajoutez l'étagère "
                "dans la colonne obtenue."
            )

        if mode == "ratio" and 0.0 <= position <= 1.0:
            height_from_bottom = position * volume.height
        else:
            height_from_bottom = float(position)

        # L'étagère découpe la niche en deux niches (principe PolyBoard).
        # ``offset`` est le centre du panneau horizontal.
        offset = height_from_bottom + self.t / 2
        if not math.isfinite(offset):
            raise CabinetDesignError("Position d'étagère invalide.")
        bounds = self.divider.bounds_for(volume.height)
        if offset < bounds["min"] - 0.01 or offset > bounds["max"] + 0.01:
            low = bounds["min"] - self.t / 2
            high = bounds["max"] - self.t / 2
            if high < low:
                raise CabinetDesignError(
                    "Niche trop basse pour une étagère : il faut au moins "
                    f"{_cm(2 * self.MIN_BAY + self.t)} cm de haut."
                )
            raise CabinetDesignError(
                f"Étagère hors limites : {_cm(height_from_bottom)} cm du bas de la niche. "
                f"Elle doit rester à {_cm(self.MIN_BAY)} cm au moins du dessous et du "
                f"dessus (entre {_cm(low)} et {_cm(high)} cm)."
            )

        self._split_once(volume, "horizontal", offset)
        volume.refresh_from_db()
        volume.split_shelf = True
        volume.save(update_fields=["split_shelf"])

        divider = volume.components.get(component_type="divider_h")
        divider.depth_clearance_front = max(0.0, float(depth_clearance_front))
        if material_id:
            try:
                divider.material = Material.objects.get(pk=material_id)
            except Material.DoesNotExist as exc:
                raise CabinetDesignError("Matériau d'étagère introuvable.") from exc
        divider.save()

        warnings = self.rebuild()
        return {"scene": self.scene(warnings), "message": "Étagère ajoutée."}

    @transaction.atomic
    def add_shelf_series(
        self,
        *,
        volume_id: Optional[int],
        count: int,
        lower_shelf_id: Optional[int] = None,
        upper_shelf_id: Optional[int] = None,
        depth_clearance_front: float = 0.0,
        material_id: Optional[int] = None,
        left_partition_id: Optional[int] = None,
        right_partition_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Crée N étagères également espacées dans une niche.

        Principe PolyBoard : chaque étagère découpe la niche en deux niches. La
        série produit donc N étagères et N + 1 niches de hauteurs égales. Les
        limites et colonnes ne sont plus prises en charge : divisez d'abord la
        niche par des séparations verticales pour travailler en colonnes.
        """
        try:
            count_value = int(count)
        except (TypeError, ValueError) as exc:
            raise CabinetDesignError("Nombre d'étagères invalide.") from exc
        if isinstance(count, bool) or float(count) != count_value:
            raise CabinetDesignError("Le nombre d'étagères doit être un entier.")
        if not 1 <= count_value <= 20:
            raise CabinetDesignError(
                "Le nombre d'étagères doit être compris entre 1 et 20."
            )

        if (
            lower_shelf_id is not None
            or upper_shelf_id is not None
            or left_partition_id is not None
            or right_partition_id is not None
        ):
            raise CabinetDesignError(
                "La série d'étagères crée désormais des niches pleine largeur. "
                "Divisez d'abord la niche par des séparations verticales pour "
                "travailler en colonnes."
            )

        if volume_id is None:
            raise CabinetDesignError(
                "Sélectionnez une niche pour créer la série d'étagères."
            )
        volume = self._volume(int(volume_id))
        if not volume.is_leaf:
            raise CabinetDesignError(
                "Choisissez une niche libre pour créer une série d'étagères."
            )

        row_sizes = self._distribute_sizes(
            volume.height,
            count_value + 1,
            [1.0 / (count_value + 1)] * (count_value + 1),
            "rangée",
            "La hauteur est trop faible pour ces étagères.",
        )

        clearance = max(0.0, float(depth_clearance_front))
        current = volume
        for index in range(count_value):
            offset = row_sizes[index] + self.t / 2
            bottom, top = self._split_once(current, "horizontal", offset)
            parent = bottom.parent
            parent.refresh_from_db()
            parent.split_shelf = True
            parent.save(update_fields=["split_shelf"])
            divider = parent.components.get(component_type="divider_h")
            divider.depth_clearance_front = clearance
            divider.save()
            current = top

        warnings = self.rebuild()
        plural = count_value > 1
        return {
            "scene": self.scene(warnings),
            "message": (
                f"{count_value} étagère{'s' if plural else ''} "
                f"ajoutée{'s' if plural else ''}."
            ),
        }

    # ------------------------------------------------------------------
    # Outil Déplacer / Copier (étagères)
    # ------------------------------------------------------------------
    def _shelf_group_root(self, volume: InternalVolume) -> InternalVolume:
        """Remonte jusqu'à la niche d'origine d'une série d'étagères."""
        current = volume
        while current.parent_id:
            parent = current.parent
            if parent.split_direction == "horizontal" and parent.split_shelf:
                current = parent
            else:
                break
        return current

    def _collect_shelf_components(self, volume: InternalVolume) -> List[Component]:
        result: List[Component] = []
        if volume.split_direction == "horizontal" and volume.split_shelf:
            divider = volume.components.filter(component_type="divider_h").first()
            if divider is not None:
                result.append(divider)
        for child in volume.children.all():
            result.extend(self._collect_shelf_components(child))
        return sorted(result, key=lambda component: component.position_from_bottom)

    def _shelf_specs(self, root: InternalVolume) -> List[Dict[str, Any]]:
        """Décrit les étagères d'une niche en coordonnées absolues."""
        specs: List[Dict[str, Any]] = []
        for component in self._collect_shelf_components(root):
            parent = component.volume
            specs.append(
                {
                    "component_pk": component.pk,
                    "position": parent.pos_y + parent.split_offset - root.pos_y,
                    "thickness": float(component.height),
                    "material": component.material,
                    "edge_banding": component.edge_banding,
                    "depth_clearance_front": float(
                        component.depth_clearance_front or 0
                    ),
                }
            )
        return sorted(specs, key=lambda spec: spec["position"])

    def _is_in_subtree(self, volume: InternalVolume, root_id: int) -> bool:
        current: Optional[InternalVolume] = volume
        while current is not None:
            if current.pk == root_id:
                return True
            current = current.parent
        return False

    def _clear_shelf_group(self, root: InternalVolume) -> None:
        """Supprime toutes les divisions d'une série d'étagères."""
        root.children.all().delete()
        root.components.filter(
            component_type__in=("divider_v", "divider_h")
        ).delete()
        root.split_direction = ""
        root.split_shelf = False
        root.split_side = False
        root.split_mode = "ratio"
        root.split_ratio = 0.5
        root.split_offset = 0
        root.save()

    def _apply_shelf_spec(self, divider: Component, spec: Dict[str, Any]) -> None:
        divider.material = spec["material"] or self.cabinet.material_carcase
        divider.height = max(3.0, float(spec["thickness"] or self.t))
        divider.edge_banding = spec["edge_banding"] or "Chant avant"
        divider.depth_clearance_front = max(
            0.0, float(spec["depth_clearance_front"] or 0)
        )
        divider.save()

    def _recreate_shelves(
        self,
        root: InternalVolume,
        specs: List[Dict[str, Any]],
        *,
        niche_label: str = "source",
    ) -> None:
        """Recrée des étagères aux positions absolues demandées."""
        current = root
        for spec in sorted(specs, key=lambda item: item["position"]):
            offset = float(spec["position"]) - (current.pos_y - root.pos_y)
            bounds = self.divider.bounds_for(current.height)
            if offset < bounds["min"] - 0.01 or offset > bounds["max"] + 0.01:
                max_position = (current.pos_y - root.pos_y) + bounds["max"]
                raise CabinetDesignError(
                    f"L'étagère à {float(spec['position']) / 10:.1f} cm ne tient pas "
                    f"dans la niche {niche_label} "
                    f"(maximum {max_position / 10:.1f} cm)."
                )
            bottom, top = self._split_once(current, "horizontal", offset)
            parent = bottom.parent
            parent.refresh_from_db()
            parent.split_shelf = True
            parent.save(update_fields=["split_shelf"])
            divider = parent.components.get(component_type="divider_h")
            self._apply_shelf_spec(divider, spec)
            # Recalcule les niches avec l'épaisseur réelle de l'étagère avant
            # de placer l'étagère suivante.
            self._layout_volume(parent)
            top.refresh_from_db()
            current = top

    def _rebase_specs_to_target(
        self,
        specs: List[Dict[str, Any]],
        source_root: InternalVolume,
        target: InternalVolume,
    ) -> List[Dict[str, Any]]:
        """Exprime les hauteurs des étagères dans le repère de la niche cible.

        Les specs sont relatives au bas de la niche source. On les convertit en
        hauteur absolue dans le caisson, puis en hauteur relative au bas de la
        niche cible. On conserve ainsi le niveau d'origine de l'étagère, ce qui
        permet de l'aligner avec sa position d'origine même si la niche cible
        ne démarre pas à la même hauteur.
        """
        offset = float(source_root.pos_y) - float(target.pos_y)
        rebased: List[Dict[str, Any]] = []
        for spec in specs:
            item = dict(spec)
            item["position"] = float(spec["position"]) + offset
            rebased.append(item)
        return rebased

    def _fit_specs_to_target(
        self,
        specs: List[Dict[str, Any]],
        target: InternalVolume,
    ) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """Adapte les hauteurs des étagères pour qu'elles tiennent dans la cible.

        Les positions reçues sont déjà exprimées dans le repère de la niche
        cible (voir ``_rebase_specs_to_target``). Règles appliquées :

        1. si toutes les étagères tiennent à leur niveau d'origine, on ne
           touche à rien ;
        2. une étagère seule hors limites est placée à la limite la plus
           proche (hauteur maximale ou minimale) ;
        3. une série qui ne tient pas est décalée si elle peut entrer sans
           changer les espacements, sinon elle est compressée proportionnellement ;
           si les espacements deviennent trop serrés, elle est répartie
           uniformément sur toute la hauteur utilisable.

        Retourne les specs ajustées et un descriptif de l'ajustement.
        """
        if not specs:
            return [], {"adjusted": False, "mode": "none", "max_position": 0.0}

        ordered = sorted(
            (dict(spec) for spec in specs), key=lambda item: item["position"]
        )
        thicknesses = [
            max(0.0, float(spec["thickness"] or self.t)) for spec in ordered
        ]
        # On prend l'épaisseur la plus forte pour que la marge haute/basse soit
        # valable pour toutes les étagères, y compris celles sur mesure.
        half = max([self.t / 2.0] + [thickness / 2.0 for thickness in thicknesses])
        min_center = half + self.MIN_BAY
        max_center = float(target.height) - half - self.MIN_BAY
        if max_center < min_center - 0.01:
            raise CabinetDesignError(
                "La niche de destination est trop basse pour recevoir une étagère "
                f"({target.height / 10:.1f} cm disponibles)."
            )

        def required_gap(previous: Dict[str, Any], current: Dict[str, Any]) -> float:
            previous_half = max(
                self.t, float(previous["thickness"] or self.t)
            ) / 2.0
            current_half = max(
                self.t, float(current["thickness"] or self.t)
            ) / 2.0
            return previous_half + current_half + self.MIN_BAY

        def gaps_ok(values: List[float]) -> bool:
            return all(
                values[index] - values[index - 1]
                >= required_gap(ordered[index - 1], ordered[index]) - 0.01
                for index in range(1, len(values))
            )

        positions = [float(spec["position"]) for spec in ordered]
        if (
            positions[0] >= min_center - 0.01
            and positions[-1] <= max_center + 0.01
            and gaps_ok(positions)
        ):
            return ordered, {
                "adjusted": False,
                "mode": "none",
                "max_position": max_center,
            }

        def clamp(value: float) -> float:
            return min(max(value, min_center), max_center)

        if len(ordered) == 1:
            adjusted_positions = [clamp(positions[0])]
            mode = "clamped"
        else:
            available = max_center - min_center
            current_span = positions[-1] - positions[0]
            if current_span <= available + 0.01 and gaps_ok(positions):
                # La série entre telle quelle : on la décale juste ce qu'il faut
                # pour respecter les marges, sans modifier les espacements.
                shift = 0.0
                if positions[0] < min_center:
                    shift = min_center - positions[0]
                elif positions[-1] > max_center:
                    shift = max_center - positions[-1]
                adjusted_positions = [position + shift for position in positions]
                mode = "shifted"
            else:
                scaled: Optional[List[float]] = None
                if current_span > 0.01:
                    ratio = available / current_span
                    candidate = [
                        min_center + (position - positions[0]) * ratio
                        for position in positions
                    ]
                    if gaps_ok(candidate):
                        scaled = candidate
                if scaled is not None:
                    adjusted_positions = scaled
                    mode = "scaled"
                else:
                    # Répartition uniforme sur toute la hauteur utilisable.
                    step = available / (len(ordered) - 1)
                    uniform = [
                        min_center + index * step for index in range(len(ordered))
                    ]
                    if not gaps_ok(uniform):
                        needed = 2 * half + 2 * self.MIN_BAY + sum(
                            required_gap(ordered[index - 1], ordered[index])
                            for index in range(1, len(ordered))
                        )
                        raise CabinetDesignError(
                            f"La niche de destination est trop basse pour recevoir "
                            f"{len(ordered)} étagères : il faut au moins "
                            f"{needed / 10:.1f} cm (la niche en fait "
                            f"{target.height / 10:.1f} cm)."
                        )
                    adjusted_positions = uniform
                    mode = "distributed"

        for spec, position in zip(ordered, adjusted_positions):
            spec["position"] = position
        return ordered, {
            "adjusted": True,
            "mode": mode,
            "max_position": max_center,
            "min_position": min_center,
        }

    @transaction.atomic
    def move_element(
        self,
        *,
        source_volume_id: int,
        target_volume_id: int,
        source_component_id: Optional[int] = None,
        source_component_ids: Optional[List[int]] = None,
        copy: bool = False,
    ) -> Dict[str, Any]:
        """Déplace ou copie une ou plusieurs étagères vers une autre niche."""
        source = self._volume(int(source_volume_id))
        target = self._volume(int(target_volume_id))
        root = self._shelf_group_root(source)
        specs = self._shelf_specs(root)
        if not specs:
            raise CabinetDesignError("Aucune étagère à déplacer.")
        if not target.is_leaf:
            raise CabinetDesignError("Choisissez une niche libre comme destination.")
        if target.pk == root.pk or self._is_in_subtree(target, root.pk):
            raise CabinetDesignError("Choisissez une autre niche comme destination.")
        if target.components.filter(
            component_type__in=("shelf", "partition_v")
        ).exists():
            raise CabinetDesignError(
                "Retirez les étagères et séparations de la niche de destination."
            )

        requested: set = set()
        if source_component_ids:
            try:
                requested |= {int(component_id) for component_id in source_component_ids}
            except (TypeError, ValueError) as exc:
                raise CabinetDesignError(
                    "Sélection d'étagères invalide."
                ) from exc
        if source_component_id is not None:
            try:
                requested.add(int(source_component_id))
            except (TypeError, ValueError) as exc:
                raise CabinetDesignError("Étagère à déplacer invalide.") from exc

        if requested:
            selected_specs = [
                spec for spec in specs if spec["component_pk"] in requested
            ]
            if len(selected_specs) != len(requested):
                raise CabinetDesignError(
                    "Certaines étagères sélectionnées n'appartiennent pas à cette niche."
                )
        else:
            selected_specs = list(specs)

        if not selected_specs:
            raise CabinetDesignError("Aucune étagère à déplacer.")

        copy_value = bool(copy)
        selected_ids = {spec["component_pk"] for spec in selected_specs}

        if not copy_value:
            remaining = [
                spec for spec in specs if spec["component_pk"] not in selected_ids
            ]
            self._clear_shelf_group(root)
            if remaining:
                self._recreate_shelves(root, remaining)

        target_specs = self._rebase_specs_to_target(selected_specs, root, target)
        fitted_specs, fit = self._fit_specs_to_target(target_specs, target)
        self._recreate_shelves(
            target, fitted_specs, niche_label="de destination"
        )
        warnings = self.rebuild()
        count = len(selected_specs)
        plural = count > 1
        action = (
            ("copiées" if copy_value else "déplacées")
            if plural
            else ("copiée" if copy_value else "déplacée")
        )
        message = f"{count} étagère{'s' if plural else ''} {action}"
        if fit["adjusted"]:
            if fit["mode"] == "clamped" and count == 1:
                original = float(target_specs[0]["position"])
                too_high = original > fit["max_position"]
                limit = fit["max_position"] if too_high else fit["min_position"]
                if too_high:
                    message += (
                        f". Elle ne tenait pas à {original / 10:.1f} cm : elle a "
                        f"été placée à {limit / 10:.1f} cm, la hauteur maximale "
                        "de la niche de destination."
                    )
                else:
                    message += (
                        f". Elle a été placée à {limit / 10:.1f} cm, la hauteur "
                        "minimale de la niche de destination."
                    )
            elif fit["mode"] == "shifted":
                message += (
                    " et décalées pour tenir dans la niche de destination "
                    "(espacements conservés)."
                )
            elif fit["mode"] == "distributed":
                message += (
                    " et réparties uniformément pour tenir dans la niche de "
                    "destination."
                )
            else:
                message += (
                    " et réparties proportionnellement pour tenir dans la niche "
                    "de destination."
                )
        else:
            message += " au même niveau que l'original dans le caisson."
        return {
            "scene": self.scene(warnings),
            "message": message,
        }

    @transaction.atomic
    def add_side_series(self, *, volume_id: Optional[int], count: int) -> Dict[str, Any]:
        """Crée N côtés pleine hauteur, également espacés dans une niche."""
        try:
            count_value = int(count)
        except (TypeError, ValueError) as exc:
            raise CabinetDesignError("Nombre de côtés invalide.") from exc
        if isinstance(count, bool) or float(count) != count_value:
            raise CabinetDesignError("Le nombre de côtés doit être un entier.")
        if not 1 <= count_value <= 8:
            raise CabinetDesignError("Le nombre de côtés doit être compris entre 1 et 8.")
        if volume_id is None:
            raise CabinetDesignError("Sélectionnez une niche pour créer la série de côtés.")
        volume = self._volume(int(volume_id))
        if not volume.is_leaf:
            raise CabinetDesignError(
                "Choisissez une niche libre pour créer une série de côtés."
            )
        if volume.components.filter(
            component_type__in=("shelf", "partition_v")
        ).exists():
            raise CabinetDesignError(
                "Retirez les étagères et séparations de cette niche avant de créer "
                "une série de côtés."
            )

        total_divider = 2 * self.t
        available = float(volume.width) - count_value * total_divider
        if available <= 0:
            raise CabinetDesignError("La largeur est trop faible pour ces côtés.")
        column_size = available / (count_value + 1)
        if column_size < self.MIN_BAY - 0.01:
            raise CabinetDesignError(
                f"La largeur est trop faible pour ces côtés. Chaque "
                f"compartiment doit mesurer au moins {self.MIN_BAY:.0f} mm."
            )

        current = volume
        for _index in range(count_value):
            offset = column_size + total_divider / 2
            left, right = self._split_once(current, "vertical", offset)
            parent = left.parent
            parent.refresh_from_db()
            parent.split_side = True
            parent.save(update_fields=["split_side"])
            # Recalcule immédiatement avec les deux panneaux collés pour que
            # la niche suivante parte de la bonne largeur.
            self._layout_volume(parent)
            current = right
            current.refresh_from_db()

        warnings = self.rebuild()
        plural = count_value > 1
        return {
            "scene": self.scene(warnings),
            "message": (
                f"{count_value} côté{'s' if plural else ''} "
                f"ajouté{'s' if plural else ''}."
            ),
        }

    @transaction.atomic
    def add_partition(
        self,
        *,
        volume_id: Optional[int],
        lower_shelf_id: Optional[int],
        upper_shelf_id: Optional[int],
        position: float,
        mode: str = "ratio",
    ) -> Dict[str, Any]:
        """Crée une séparation verticale entre deux limites d'une niche.

        Une limite peut être une étagère ou un bord de la niche :

        - ``lower_shelf_id=None`` : la séparation part du dessous de la niche ;
        - ``upper_shelf_id=None`` : la séparation va jusqu'au dessus de la niche.

        Les deux limites doivent être adjacentes : aucune étagère ne doit se
        trouver entre elles, sinon la séparation traverserait un panneau.
        """
        if mode not in ("ratio", "absolute"):
            raise CabinetDesignError("Mode de position invalide.")

        raw_shelf_ids = [
            value for value in (lower_shelf_id, upper_shelf_id) if value is not None
        ]
        try:
            shelf_ids = list(dict.fromkeys(int(value) for value in raw_shelf_ids))
        except (TypeError, ValueError) as exc:
            raise CabinetDesignError("Sélection d'étagères invalide.") from exc
        if len(shelf_ids) != len(raw_shelf_ids):
            raise CabinetDesignError("Les deux limites doivent être différentes.")

        shelves = {
            shelf.pk: shelf
            for shelf in self.cabinet.components.select_related("volume").filter(
                pk__in=shelf_ids, component_type="shelf"
            )
        }
        if len(shelves) != len(shelf_ids):
            raise CabinetDesignError("Les étagères sélectionnées sont introuvables.")

        if shelves:
            volume_ids = {shelf.volume_id for shelf in shelves.values()}
            if len(volume_ids) != 1:
                raise CabinetDesignError("Les deux étagères doivent appartenir à la même niche.")
            volume = next(iter(shelves.values())).volume
            if volume_id is not None and int(volume_id) != volume.pk:
                raise CabinetDesignError("La niche sélectionnée ne correspond pas aux étagères.")
        else:
            if volume_id is None:
                raise CabinetDesignError("Sélectionnez une niche pour créer la séparation.")
            volume = self._volume(int(volume_id))

        if not volume.is_leaf:
            raise CabinetDesignError("Choisissez une niche libre pour créer une séparation.")

        lower_id = int(lower_shelf_id) if lower_shelf_id is not None else None
        upper_id = int(upper_shelf_id) if upper_shelf_id is not None else None
        all_shelves = list(
            volume.components.filter(component_type="shelf").order_by(
                "position_from_bottom", "pk"
            )
        )
        by_id = {shelf.pk: shelf for shelf in all_shelves}
        lower = by_id.get(lower_id) if lower_id is not None else None
        upper = by_id.get(upper_id) if upper_id is not None else None

        if lower is not None and upper is not None and lower.pk == upper.pk:
            raise CabinetDesignError("Les deux limites doivent être différentes.")
        if lower is not None and upper is not None and lower.position_from_bottom > upper.position_from_bottom:
            lower, upper = upper, lower

        column_left, column_right, full_width = self._partition_column_bounds(
            volume, [shelf for shelf in (lower, upper) if shelf is not None]
        )

        def in_column(shelf: Component) -> bool:
            return (
                shelf.position_from_left < column_right - 0.01
                and shelf.position_from_left + shelf.width > column_left + 0.01
            )

        column_shelves = [shelf for shelf in all_shelves if in_column(shelf)]
        lower_index = (
            next(
                (
                    index
                    for index, shelf in enumerate(column_shelves)
                    if lower is not None and shelf.pk == lower.pk
                ),
                None,
            )
            if lower is not None
            else None
        )
        upper_index = (
            next(
                (
                    index
                    for index, shelf in enumerate(column_shelves)
                    if upper is not None and shelf.pk == upper.pk
                ),
                None,
            )
            if upper is not None
            else None
        )

        where = "de la niche" if full_width else "de la colonne"
        if lower is not None and upper is None:
            if lower_index is None or lower_index != len(column_shelves) - 1:
                raise CabinetDesignError(
                    f"Pour une séparation jusqu'au dessus, choisissez l'étagère "
                    f"la plus haute {where}."
                )
        elif lower is None and upper is not None:
            if upper_index is None or upper_index != 0:
                raise CabinetDesignError(
                    f"Pour une séparation depuis le dessous, choisissez l'étagère "
                    f"la plus basse {where}."
                )
        elif lower is not None and upper is not None:
            if lower_index is None or upper_index is None or upper_index != lower_index + 1:
                raise CabinetDesignError(
                    f"Choisissez deux étagères adjacentes {where} : une autre "
                    f"étagère se trouve entre elles."
                )
        elif column_shelves:
            raise CabinetDesignError(
                f"Une séparation du dessous au dessus traverserait les étagères {where}."
            )

        lower_top = lower.position_from_bottom + lower.height if lower is not None else 0.0
        upper_bottom = upper.position_from_bottom if upper is not None else volume.height
        gap = upper_bottom - lower_top
        if gap < self.MIN_PARTITION_HEIGHT:
            raise CabinetDesignError(
                f"Espace insuffisant entre les limites : {gap:.1f} mm "
                f"(minimum {self.MIN_PARTITION_HEIGHT:.0f} mm)."
            )

        bounds = self.divider.bounds_for(volume.width)
        min_bay = float(self.divider.min_bay)
        min_center = max(bounds["min"], column_left + self.t / 2 + min_bay)
        max_center = min(bounds["max"], column_right - self.t / 2 - min_bay)
        if max_center <= min_center:
            if full_width:
                raise CabinetDesignError(
                    f"Niche trop étroite pour une séparation ({volume.width:.1f} mm)."
                )
            raise CabinetDesignError(
                f"Colonne trop étroite pour une séparation "
                f"({column_right - column_left:.1f} mm)."
            )
        if mode == "ratio":
            raw_position = float(position)
            if not math.isfinite(raw_position):
                raise CabinetDesignError("Position de la séparation invalide.")
            ratio = min(max(raw_position, 0.0), 1.0)
            center = ratio * volume.width
        else:
            center = float(position)
            if not math.isfinite(center):
                raise CabinetDesignError("Position de la séparation invalide.")
            ratio = center / volume.width if volume.width else 0.5
        if center < min_center - 0.01 or center > max_center + 0.01:
            raise CabinetDesignError(
                f"Position de la séparation hors limites : {center:.1f} mm "
                f"(autorisé entre {min_center:.1f} et {max_center:.1f} mm)."
            )
        center = min(max(center, min_center), max_center)

        for existing in volume.components.filter(component_type="partition_v"):
            existing_left = existing.position_from_left - existing.width / 2
            existing_right = existing.position_from_left + existing.width / 2
            existing_bottom = existing.position_from_bottom
            existing_top = existing_bottom + existing.height
            vertical_overlap = (
                lower_top < existing_top - 0.01
                and existing_bottom < upper_bottom - 0.01
            )
            horizontal_overlap = (
                center - self.t / 2 < existing_right - 0.01
                and existing_left < center + self.t / 2 - 0.01
            )
            if vertical_overlap and horizontal_overlap:
                raise CabinetDesignError(
                    "Une séparation occupe déjà cette position sur cette hauteur."
                )

        if lower is not None and upper is not None:
            partition_depth = min(lower.depth, upper.depth)
        elif lower is not None:
            partition_depth = lower.depth
        elif upper is not None:
            partition_depth = upper.depth
        else:
            partition_depth = volume.depth

        Component.objects.create(
            cabinet=self.cabinet,
            volume=volume,
            component_type="partition_v",
            material=self.cabinet.material_carcase,
            partition_lower_shelf=lower,
            partition_upper_shelf=upper,
            position_from_bottom=lower_top,
            position_from_left=center,
            offset_mode=mode,
            ratio=ratio,
            depth_clearance_front=0.0,
            width=self.t,
            height=gap,
            depth=max(1.0, min(partition_depth, volume.depth)),
            edge_banding="Chant avant",
        )
        warnings = self.rebuild()
        return {"scene": self.scene(warnings), "message": "Séparation créée entre les limites choisies."}

    @transaction.atomic
    def add_partition_between_shelves(
        self,
        shelf_ids: List[int],
        position: float,
        mode: str = "ratio",
    ) -> Dict[str, Any]:
        """Compatibilité : crée une séparation entre deux étagères."""
        try:
            ids = list(dict.fromkeys(int(value) for value in shelf_ids))
        except (TypeError, ValueError) as exc:
            raise CabinetDesignError("Sélection d'étagères invalide.") from exc
        if len(ids) != 2:
            raise CabinetDesignError("Sélectionnez exactement deux étagères.")

        shelves = list(
            self.cabinet.components.select_related("volume")
            .filter(pk__in=ids, component_type="shelf")
            .order_by("position_from_bottom", "pk")
        )
        if len(shelves) != 2:
            raise CabinetDesignError("Les deux étagères sélectionnées sont introuvables.")
        volume_ids = {shelf.volume_id for shelf in shelves}
        if len(volume_ids) != 1:
            raise CabinetDesignError("Les deux étagères doivent appartenir à la même niche.")

        volume = shelves[0].volume
        return self.add_partition(
            volume_id=volume.pk,
            lower_shelf_id=shelves[0].pk,
            upper_shelf_id=shelves[1].pk,
            position=position,
            mode=mode,
        )

    @transaction.atomic
    def remove_components(self, component_ids: List[int]) -> Dict[str, Any]:
        """Supprime un ou plusieurs composants en préservant les étagères non visées."""
        try:
            ids = {int(component_id) for component_id in component_ids}
        except (TypeError, ValueError) as exc:
            raise CabinetDesignError("Sélection de composants invalide.") from exc
        if not ids:
            raise CabinetDesignError("Aucun élément sélectionné.")
        components = list(
            self.cabinet.components.filter(pk__in=ids).select_related("volume")
        )
        if not components:
            raise CabinetDesignError("Composants introuvables.")

        shelf_groups: Dict[int, tuple] = {}
        others: List[Component] = []
        for component in components:
            if component.component_type == "divider_h" and component.volume.split_shelf:
                root = self._shelf_group_root(component.volume)
                shelf_groups.setdefault(root.pk, (root, set()))[1].add(component.pk)
            else:
                others.append(component)

        # Les étagères d'une même niche sont retirées en une seule passe afin de
        # conserver les autres étagères à leur position exacte.
        for root, selected_ids in shelf_groups.values():
            specs = self._shelf_specs(root)
            remaining = [
                spec for spec in specs if spec["component_pk"] not in selected_ids
            ]
            self._clear_shelf_group(root)
            if remaining:
                self._recreate_shelves(root, remaining)

        for component in others:
            if not Component.objects.filter(pk=component.pk).exists():
                continue
            if component.component_type == "divider_v":
                volume = InternalVolume.objects.filter(pk=component.volume_id).first()
                if volume is not None and volume.split_direction:
                    self.remove_split(volume.pk)
            else:
                Component.objects.filter(pk=component.pk).delete()

        warnings = self.rebuild()
        count = len(components)
        plural = count > 1
        return {
            "scene": self.scene(warnings),
            "message": (
                f"{count} élément{'s' if plural else ''} supprimé"
                f"{'s' if plural else ''}."
            ),
        }

    @transaction.atomic
    def remove_component(self, component_id: int) -> Dict[str, Any]:
        return self.remove_components([component_id])

    @transaction.atomic
    def update_component(self, component_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        """Modifie la matière, l'épaisseur ou le chant d'un composant.

        Pour une séparation, l'épaisseur est la largeur du panneau ;
        pour une étagère, c'est la hauteur. Les niches sont recalculées
        en conséquence.
        """
        try:
            component = self.cabinet.components.select_related("volume").get(pk=component_id)
        except Component.DoesNotExist as exc:
            raise CabinetDesignError("Composant introuvable.") from exc

        if "material_id" in data:
            try:
                component.material = Material.objects.get(pk=data["material_id"])
            except Material.DoesNotExist as exc:
                raise CabinetDesignError("Matériau introuvable.") from exc

        if "thickness" in data:
            try:
                thickness = float(data["thickness"])
            except (TypeError, ValueError) as exc:
                raise CabinetDesignError("Épaisseur invalide.") from exc
            if not math.isfinite(thickness) or thickness < 3 or thickness > 100:
                raise CabinetDesignError(
                    "L'épaisseur doit être comprise entre 3 et 100 mm."
                )
            if component.component_type in ("divider_v", "partition_v"):
                component.width = thickness
            else:
                component.height = thickness

        if "edge_banding" in data:
            component.edge_banding = str(data["edge_banding"])[:100]

        if "depth_clearance_front" in data:
            try:
                component.depth_clearance_front = max(0.0, float(data["depth_clearance_front"]))
            except (TypeError, ValueError) as exc:
                raise CabinetDesignError("Jeu avant invalide.") from exc

        component.save()
        warnings = self.rebuild()
        return {"scene": self.scene(warnings), "message": "Composant modifié."}

    @transaction.atomic
    def update_carcass_panel(self, side: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Modifie la matière ou l'épaisseur d'un panneau structurel du caisson."""
        valid = {value for value, _label in CarcassPanel.SIDES}
        if side not in valid:
            raise CabinetDesignError("Panneau de structure inconnu.")
        panel, _created = CarcassPanel.objects.get_or_create(
            cabinet=self.cabinet, side=side
        )

        if "material_id" in data:
            material_id = data["material_id"]
            if material_id:
                try:
                    panel.material = Material.objects.get(pk=material_id)
                except Material.DoesNotExist as exc:
                    raise CabinetDesignError("Matériau introuvable.") from exc
            else:
                panel.material = None

        if "thickness" in data:
            try:
                thickness = float(data["thickness"])
            except (TypeError, ValueError) as exc:
                raise CabinetDesignError("Épaisseur invalide.") from exc
            if not math.isfinite(thickness) or thickness < 3 or thickness > 100:
                raise CabinetDesignError(
                    "L'épaisseur doit être comprise entre 3 et 100 mm."
                )
            panel.thickness = thickness

        if "position" in data:
            try:
                position = float(data["position"])
            except (TypeError, ValueError) as exc:
                raise CabinetDesignError("Position invalide.") from exc
            if not math.isfinite(position) or position < 0 or position > 500:
                raise CabinetDesignError(
                    "La position doit être comprise entre 0 et 500 mm."
                )
            panel.position = position

        panel.save()
        warnings = self.rebuild()
        return {"scene": self.scene(warnings), "message": "Panneau de structure modifié."}

    # ------------------------------------------------------------------
    # Zones externes
    # ------------------------------------------------------------------
    @transaction.atomic
    def set_plinth(self, height: Optional[float] = None, setback: Optional[float] = None) -> Dict[str, Any]:
        height = self.cabinet.plinth_height if height is None else float(height)
        setback = self.cabinet.plinth_setback if setback is None else float(setback)
        if height < 20:
            raise CabinetDesignError("La plinthe doit mesurer au moins 20 mm.")
        if height > self.cabinet.height / 2:
            raise CabinetDesignError("La plinthe est trop haute par rapport au caisson.")
        if setback < 0 or setback * 2 >= self.cabinet.width - 100:
            raise CabinetDesignError("Retrait de plinthe invalide.")

        self.cabinet.plinth_height = height
        self.cabinet.plinth_setback = setback
        self.cabinet.save(update_fields=["plinth_height", "plinth_setback", "updated_at"])

        builder = ExternalZoneBuilder(self.t)
        bbox, _ = builder.build_plinth(
            PlinthDef(
                cabinet_width=self.cabinet.width,
                cabinet_depth=self.cabinet.depth,
                plinth_height=height,
                plinth_thickness=self.t,
                set_back=setback,
                material_id=str(self.cabinet.material_carcase_id),
            )
        )
        zones = self.cabinet.external_zones.filter(zone_type="plinth").order_by("pk")
        zone = zones.first() or ExternalZone(cabinet=self.cabinet, zone_type="plinth")
        if zone.pk:
            zones.exclude(pk=zone.pk).delete()
        zone.pos_x, zone.pos_y, zone.pos_z = bbox.x0, bbox.y0, bbox.z0
        zone.width, zone.height, zone.depth = bbox.width, bbox.height, bbox.depth
        zone.material = self.cabinet.material_carcase
        zone.save()
        warnings = self.rebuild()
        return {"scene": self.scene(warnings), "message": "Plinthe mise à jour."}

    @transaction.atomic
    def remove_plinth(self) -> Dict[str, Any]:
        self.cabinet.external_zones.filter(zone_type="plinth").delete()
        warnings = self.rebuild()
        return {"scene": self.scene(warnings), "message": "Plinthe supprimée."}

    # ------------------------------------------------------------------
    # Paramétrie / redimensionnement
    # ------------------------------------------------------------------
    @transaction.atomic
    def update_cabinet(self, data: Dict[str, Any]) -> Dict[str, Any]:
        allowed = {
            "name",
            "width",
            "height",
            "depth",
            "material_id",
            "material_back_id",
            "back_thickness",
            "bottom_setback",
            "shelf_side_clearance",
            "waste_percent",
            "has_doors",
            "door_thickness",
            "door_gap",
            "has_hanging_rail",
            "hanging_rail_height",
            "has_drawers",
            "drawer_count",
            "drawer_height",
            "plinth_height",
            "plinth_setback",
            "back_in_groove",
        }
        unknown = set(data) - allowed
        if unknown:
            raise CabinetDesignError(f"Champ(s) non autorisé(s) : {', '.join(sorted(unknown))}.")

        if "material_id" in data:
            try:
                self.cabinet.material_carcase = Material.objects.get(pk=data["material_id"])
            except Material.DoesNotExist as exc:
                raise CabinetDesignError("Matériau de carcasse introuvable.") from exc
        if "material_back_id" in data:
            back_id = data["material_back_id"]
            if back_id:
                try:
                    self.cabinet.material_back = Material.objects.get(pk=back_id)
                except Material.DoesNotExist as exc:
                    raise CabinetDesignError("Matériau de fond introuvable.") from exc
            else:
                self.cabinet.material_back = None
        if "back_thickness" in data:
            raw_thickness = data["back_thickness"]
            if raw_thickness in (None, ""):
                self.cabinet.back_thickness_override = None
            else:
                if not self.cabinet.material_back:
                    raise CabinetDesignError(
                        "Choisissez une matière de fond avant de définir son épaisseur."
                    )
                try:
                    back_thickness = float(raw_thickness)
                except (TypeError, ValueError) as exc:
                    raise CabinetDesignError("Épaisseur du fond invalide.") from exc
                if not math.isfinite(back_thickness) or back_thickness < 3 or back_thickness > 100:
                    raise CabinetDesignError(
                        "L'épaisseur du fond doit être comprise entre 3 et 100 mm."
                    )
                self.cabinet.back_thickness_override = back_thickness
        if "name" in data:
            name = str(data["name"]).strip()
            if not name:
                raise CabinetDesignError("Le nom du caisson ne peut pas être vide.")
            self.cabinet.name = name[:150]
        for field in ("width", "height", "depth"):
            if field in data:
                try:
                    value = float(data[field])
                except (TypeError, ValueError) as exc:
                    raise CabinetDesignError(f"Dimension {field} invalide.") from exc
                if value < 100:
                    raise CabinetDesignError("Chaque dimension globale doit être d'au moins 100 mm.")
                setattr(self.cabinet, field, value)
        for field in ("bottom_setback", "shelf_side_clearance", "waste_percent", "door_thickness", "door_gap", "plinth_height", "plinth_setback"):
            if field in data:
                try:
                    setattr(self.cabinet, field, max(0.0, float(data[field])))
                except (TypeError, ValueError) as exc:
                    raise CabinetDesignError(f"Valeur invalide pour {field}.") from exc
        if "has_doors" in data:
            self.cabinet.has_doors = bool(data["has_doors"])
        if "has_hanging_rail" in data:
            self.cabinet.has_hanging_rail = bool(data["has_hanging_rail"])
        if "hanging_rail_height" in data:
            try:
                rail_height = float(data["hanging_rail_height"])
            except (TypeError, ValueError) as exc:
                raise CabinetDesignError("Hauteur de tringle invalide.") from exc
            if not math.isfinite(rail_height) or rail_height < 0:
                raise CabinetDesignError(
                    "La hauteur de tringle doit être une valeur positive."
                )
            self.cabinet.hanging_rail_height = min(
                rail_height, max(0.0, self.cabinet.height - 50.0)
            )
        if "has_drawers" in data:
            self.cabinet.has_drawers = bool(data["has_drawers"])
        if "drawer_count" in data:
            try:
                drawer_count = int(data["drawer_count"])
            except (TypeError, ValueError) as exc:
                raise CabinetDesignError("Nombre de tiroirs invalide.") from exc
            if drawer_count < 1 or drawer_count > 10:
                raise CabinetDesignError(
                    "Le nombre de tiroirs doit être compris entre 1 et 10."
                )
            self.cabinet.drawer_count = drawer_count
        if "drawer_height" in data:
            try:
                drawer_height = float(data["drawer_height"])
            except (TypeError, ValueError) as exc:
                raise CabinetDesignError("Hauteur de tiroir invalide.") from exc
            if not math.isfinite(drawer_height) or drawer_height < 20:
                raise CabinetDesignError(
                    "La hauteur d'un tiroir doit être d'au moins 20 mm."
                )
            self.cabinet.drawer_height = min(
                drawer_height, max(20.0, self.cabinet.height - 20.0)
            )
        if "back_in_groove" in data:
            self.cabinet.back_in_groove = bool(data["back_in_groove"])

        try:
            self.cabinet.full_clean()
        except ValidationError as exc:
            messages = exc.messages or ["Données du caisson invalides."]
            raise CabinetDesignError(" ".join(messages)) from exc
        self.cabinet.save()

        # Les réglages d'outils doivent suivre les nouvelles propriétés.
        self.t = float(self.cabinet.material_carcase.thickness)
        self.solver = ParametricSolver(panel_thickness=self.t)
        self.divider = VolumetricDivider(self.t, min_bay=self.MIN_BAY, min_clearance=5.0)
        self.shelf_tool = ShelfTool(self.t, side_clearance=self.cabinet.shelf_side_clearance)

        warnings = self.rebuild()
        return {"scene": self.scene(warnings), "message": "Caisson recalculé."}

    # ------------------------------------------------------------------
    # Synchronisation fabrication / devis
    # ------------------------------------------------------------------
    def _panel(self, **kwargs) -> Panel:
        return Panel(cabinet=self.cabinet, **kwargs)

    def _full_height_divider_positions(self) -> List[float]:
        """Centres X absolus des côtés doubles (outil Côté) pleine hauteur.

        Seuls ces côtés traversent et découpent le dessous et le dessus du caisson ; une séparation faite avec
        Séparer divise la niche seulement, entre le dessous et le dessus, qui restent d'une pièce.
        """
        root = self.cabinet.root_volume
        if root is None:
            return []
        positions: List[float] = []
        for component in self.cabinet.components.filter(component_type="divider_v").select_related("volume"):
            volume = component.volume
            if not volume.split_side:
                continue
            bottom_ok = abs(volume.pos_y - root.pos_y) < 0.01
            top_ok = abs((volume.pos_y + volume.height) - (root.pos_y + root.height)) < 0.01
            if bottom_ok and top_ok:
                positions.append(volume.pos_x + component.position_from_left)
        return sorted(positions)

    @staticmethod
    def _split_lengths(left: float, right: float, positions: List[float], t: float) -> List[float]:
        if not positions:
            return [right - left]
        edges = [left]
        for position in positions:
            edges.append(position - t / 2)
            edges.append(position + t / 2)
        edges.append(right)
        lengths: List[float] = []
        for index in range(0, len(edges) - 1, 2):
            length = edges[index + 1] - edges[index]
            if length > 0.01:
                lengths.append(length)
        return lengths

    def _sync_panels(self) -> None:
        self.cabinet.panels.all().delete()
        t = self.t
        W, H, D = self.cabinet.width, self.cabinet.height, self.cabinet.depth
        carcass = self.cabinet.material_carcase
        back = self.cabinet.material_back
        panels: List[Panel] = []

        cp = {panel.side: panel for panel in self.cabinet.carcass_panels.all()}
        left_t = float(cp.get("left", CarcassPanel()).effective_thickness)
        right_t = float(cp.get("right", CarcassPanel()).effective_thickness)
        bottom_t = float(cp.get("bottom", CarcassPanel()).effective_thickness)
        top_t = float(cp.get("top", CarcassPanel()).effective_thickness)
        bottom_pos = float(cp.get("bottom").position) if cp.get("bottom") else 0.0
        top_pos = float(cp.get("top").position) if cp.get("top") else 0.0
        left_mat = cp.get("left").effective_material if cp.get("left") else carcass
        right_mat = cp.get("right").effective_material if cp.get("right") else carcass
        bottom_mat = cp.get("bottom").effective_material if cp.get("bottom") else carcass
        top_mat = cp.get("top").effective_material if cp.get("top") else carcass

        panels.append(
            self._panel(
                name="Côté gauche",
                material=left_mat,
                category="caisson",
                length=H,
                width=D,
                thickness=left_t,
                quantity=1,
                edge_banding="Chant avant",
            )
        )
        panels.append(
            self._panel(
                name="Côté droit",
                material=right_mat,
                category="caisson",
                length=H,
                width=D,
                thickness=right_t,
                quantity=1,
                edge_banding="Chant avant",
            )
        )
        divider_positions = self._full_height_divider_positions()
        bottom_left = left_t
        bottom_right = W - right_t
        for length in self._split_lengths(bottom_left, bottom_right, divider_positions, self.t):
            panels.append(
                self._panel(
                    name="Dessous",
                    material=bottom_mat,
                    category="caisson",
                    length=length,
                    width=D,
                    thickness=bottom_t,
                    quantity=1,
                    edge_banding="Chant avant",
                )
            )
        for length in self._split_lengths(bottom_left, bottom_right, divider_positions, self.t):
            panels.append(
                self._panel(
                    name="Dessus",
                    material=top_mat,
                    category="caisson",
                    length=length,
                    width=D,
                    thickness=top_t,
                    quantity=1,
                    edge_banding="Chant avant",
                )
            )
        if back:
            panels.append(
                self._panel(
                    name="Fond",
                    material=back,
                    category="fond",
                    length=max(0.0, W - left_t - right_t),
                    width=max(0.0, H - bottom_t - top_t - bottom_pos - top_pos),
                    thickness=self.cabinet.back_thickness,
                    quantity=1,
                )
            )

        if self.cabinet.has_doors:
            gap = self.cabinet.door_gap
            count = 2 if W >= 600 else 1
            door_width = max(1.0, (W - gap * (count + 1)) / count)
            panels.append(
                self._panel(
                    name="Façade",
                    material=carcass,
                    category="facade",
                    length=max(1.0, H - 2 * gap),
                    width=door_width,
                    thickness=self.cabinet.door_thickness,
                    quantity=count,
                    edge_banding="Chants périphériques",
                )
            )

        for component in self.cabinet.components.select_related("volume", "material"):
            if component.component_type == "divider_v":
                is_side = bool(component.volume.split_side)
                panels.append(
                    self._panel(
                        component=component,
                        name="Côté" if is_side else "Séparation",
                        material=component.material,
                        category="caisson" if is_side else "separation",
                        length=H if is_side else component.volume.height,
                        width=D if is_side else component.volume.depth,
                        thickness=component.width if is_side else component.material.thickness,
                        quantity=1,
                        edge_banding=component.edge_banding or "Chant avant",
                    )
                )
            elif component.component_type == "divider_h":
                panels.append(
                    self._panel(
                        component=component,
                        name="Étagère",
                        material=component.material,
                        category="etagere",
                        length=component.volume.width,
                        width=component.depth,
                        thickness=component.material.thickness,
                        quantity=1,
                        edge_banding=component.edge_banding or "Chant avant",
                    )
                )
            elif component.component_type == "partition_v":
                if (
                    component.partition_lower_shelf_id is None
                    and component.partition_upper_shelf_id is None
                ):
                    partition_name = "Séparation dessous–dessus"
                elif component.partition_lower_shelf_id is None:
                    partition_name = "Séparation dessous–étagère"
                elif component.partition_upper_shelf_id is None:
                    partition_name = "Séparation étagère–dessus"
                else:
                    partition_name = "Séparation entre étagères"
                panels.append(
                    self._panel(
                        component=component,
                        name=partition_name,
                        material=component.material,
                        category="separation",
                        length=component.height,
                        width=component.depth,
                        thickness=component.material.thickness,
                        quantity=1,
                        edge_banding=component.edge_banding or "Chant avant",
                    )
                )
            elif component.component_type == "shelf":
                panels.append(
                    self._panel(
                        component=component,
                        name="Étagère",
                        material=component.material,
                        category="etagere",
                        length=component.width,
                        width=component.depth,
                        thickness=component.height,
                        quantity=1,
                        edge_banding=component.edge_banding or "Chant avant",
                    )
                )

        for zone in self.cabinet.external_zones.select_related("material"):
            if zone.zone_type == "plinth":
                panels.append(
                    self._panel(
                        external_zone=zone,
                        name="Plinthe avant",
                        material=zone.material or carcass,
                        category="plinthe",
                        length=zone.width,
                        width=zone.height,
                        thickness=t,
                        quantity=1,
                        edge_banding="Chant supérieur",
                    )
                )
                panels.append(
                    self._panel(
                        external_zone=zone,
                        name="Retour de plinthe",
                        material=zone.material or carcass,
                        category="plinthe",
                        length=max(0.0, zone.depth - t),
                        width=zone.height,
                        thickness=t,
                        quantity=2,
                    )
                )
            elif zone.zone_type == "foot":
                panels.append(
                    self._panel(
                        external_zone=zone,
                        name="Pied",
                        material=zone.material or carcass,
                        category="pied",
                        length=zone.width,
                        width=zone.depth,
                        thickness=zone.height,
                        quantity=1,
                    )
                )

        Panel.objects.bulk_create(panels)
        self.cabinet.refresh_from_db()

    def _sync_cutlist(self) -> None:
        cutlist, _ = CutList.objects.get_or_create(cabinet=self.cabinet)
        CutListItem.objects.filter(cut_list=cutlist).delete()
        CutListItem.objects.bulk_create(
            [CutListItem(cut_list=cutlist, panel=panel) for panel in self.cabinet.panels.all()]
        )
        cutlist.optimized = False
        cutlist.save()

    def _sync_quote(self) -> None:
        quote, created = Quote.objects.get_or_create(
            cabinet=self.cabinet, defaults={"client_name": "Client"}
        )
        QuoteLine.objects.filter(quote=quote).delete()
        waste = 1 + self.cabinet.waste_percent / 100.0
        lines: List[QuoteLine] = []
        for panel in self.cabinet.panels.select_related("material"):
            unit_price = panel.unit_area_m2 * panel.material.price_per_m2 * waste
            lines.append(
                QuoteLine(
                    quote=quote,
                    description=(
                        f"{panel.name} {panel.length:.0f}×{panel.width:.0f} "
                        f"×{panel.thickness:.0f} mm – {panel.material.name}"
                    ),
                    material=panel.material,
                    quantity=panel.quantity,
                    unit="u",
                    unit_price=round(unit_price, 2),
                    is_material=True,
                    is_hardware=False,
                )
            )
        for hardware in self.cabinet.hardware_rules.all():
            quantity = self._hardware_quantity(hardware)
            if quantity <= 0:
                continue
            lines.append(
                QuoteLine(
                    quote=quote,
                    description=hardware.name,
                    quantity=quantity,
                    unit=hardware.unit,
                    unit_price=hardware.unit_price,
                    is_material=False,
                    is_hardware=True,
                )
            )
        QuoteLine.objects.bulk_create(lines)
        quote.save()

    # ------------------------------------------------------------------
    # Quincaillerie automatique
    # ------------------------------------------------------------------
    def _hardware_counts(self) -> dict:
        """Compte les objets géométriques utilisés par les règles auto."""
        cabinet = self.cabinet
        door_count = 0
        if cabinet.has_doors:
            door_count = 2 if cabinet.width >= 600 else 1
        shelf_count = cabinet.components.filter(component_type="shelf").count()
        for volume in cabinet.internal_volumes.filter(split_shelf=True):
            shelf_count += volume.components.filter(
                component_type="divider_h"
            ).count()
        niche_count = sum(
            1
            for volume in cabinet.internal_volumes.all()
            if volume.is_leaf
        )
        side_count = cabinet.components.filter(component_type="divider_v").count()
        return {
            "doors": door_count,
            "shelves": shelf_count,
            "niches": niche_count,
            "sides": side_count,
        }

    @staticmethod
    def _hinges_per_door(height: float) -> int:
        """Charnières par façade selon la hauteur (règle atelier standard)."""
        if height <= 900:
            return 2
        if height <= 1600:
            return 3
        if height <= 2000:
            return 4
        return 5

    def _hardware_quantity(self, hardware) -> float:
        """Quantité d'une règle : auto (géométrie) ou manuelle."""
        mode = hardware.auto_mode
        per = float(hardware.auto_per_unit or 1)
        if not mode:
            return float(hardware.default_quantity or 0)
        counts = self._hardware_counts()
        cabinet = self.cabinet
        if mode == "cabinet":
            return per
        if mode == "door":
            return counts["doors"] * per
        if mode == "door_hinge":
            if not counts["doors"]:
                return 0.0
            return counts["doors"] * self._hinges_per_door(float(cabinet.height)) * per
        if mode == "shelf":
            return counts["shelves"] * per
        if mode == "niche":
            return counts["niches"] * per
        if mode == "side":
            return counts["sides"] * per
        return float(hardware.default_quantity or 0)

    # ------------------------------------------------------------------
    # Contrôles et sérialisation
    # ------------------------------------------------------------------
    def _validate(self) -> List[str]:
        warnings: List[str] = []
        metrics = self.solver.metrics(self.cabinet)
        if metrics.width < 150:
            warnings.append(f"Largeur interne faible ({metrics.width:.0f} mm).")
        if metrics.height < 150:
            warnings.append(f"Hauteur interne faible ({metrics.height:.0f} mm).")

        volumes = list(self.cabinet.internal_volumes.select_related("parent"))
        components = list(
            self.cabinet.components.select_related(
                "volume",
                "material",
                "partition_lower_shelf",
                "partition_upper_shelf",
                "shelf_left_partition",
                "shelf_right_partition",
            )
        )
        shelves_by_volume: Dict[int, List[Component]] = {}
        partitions_by_volume: Dict[int, List[Component]] = {}
        for component in components:
            if component.is_shelf:
                shelves_by_volume.setdefault(component.volume_id, []).append(component)
            elif component.is_partition:
                partitions_by_volume.setdefault(component.volume_id, []).append(component)
        for shelves in shelves_by_volume.values():
            shelves.sort(key=lambda shelf: (shelf.position_from_bottom, shelf.pk))

        def shelf_bounds(component: Component) -> tuple[float, float]:
            return component.position_from_left, component.position_from_left + component.width

        def partition_bounds(component: Component) -> tuple[float, float]:
            return (
                component.position_from_left - component.width / 2,
                component.position_from_left + component.width / 2,
            )

        def ranges_overlap(first: tuple[float, float], second: tuple[float, float]) -> bool:
            return first[0] < second[1] - 0.01 and second[0] < first[1] - 0.01

        def shelves_overlap(first: Component, second: Component) -> bool:
            return ranges_overlap(shelf_bounds(first), shelf_bounds(second))

        def shelf_crosses_partition(shelf: Component, partition: Component) -> bool:
            return ranges_overlap(shelf_bounds(shelf), partition_bounds(partition))

        def vertical_overlap(first: Component, second: Component) -> bool:
            return (
                first.position_from_bottom < second.position_from_bottom + second.height - 0.01
                and second.position_from_bottom < first.position_from_bottom + first.height - 0.01
            )

        for volume in volumes:
            if volume.is_root:
                continue
            if volume.width <= 0 or volume.height <= 0 or volume.depth <= 0:
                warnings.append(f"Le volume {volume.pk} a une dimension nulle.")
            if volume.split_direction and volume.components.filter(component_type="shelf").exists():
                warnings.append(f"Le volume {volume.pk} contient une étagère et une division.")

        for volume_id, shelves in shelves_by_volume.items():
            volume = next((v for v in volumes if v.pk == volume_id), None)
            if volume is None:
                continue
            for index, shelf in enumerate(shelves):
                if shelf.position_from_bottom + shelf.height > volume.height + 0.01:
                    warnings.append(
                        f"Étagère {shelf.pk} : hauteur + épaisseur dépasse la niche de "
                        f"{max(0.0, volume.height - shelf.position_from_bottom - shelf.height):.1f} mm."
                    )
                if shelf.width > volume.width + 0.01:
                    warnings.append(f"Étagère {shelf.pk} trop large pour sa niche.")
                if shelf.depth > volume.depth + 0.01:
                    warnings.append(f"Étagère {shelf.pk} trop profonde pour sa niche.")
                front_gap = volume.depth - shelf.depth
                if self.cabinet.has_doors and front_gap < 10:
                    warnings.append(
                        f"Étagère {shelf.pk} : seulement {front_gap:.1f} mm de jeu avant, "
                        "risque de collision avec la façade."
                    )
                for other in shelves[:index]:
                    if (
                        abs(other.position_from_bottom - shelf.position_from_bottom) < self.t
                        and shelves_overlap(other, shelf)
                    ):
                        warnings.append(
                            f"Deux étagères se chevauchent dans le volume {volume_id} "
                            f"({other.position_from_bottom:.0f} mm / {shelf.position_from_bottom:.0f} mm)."
                        )

                for partition in partitions_by_volume.get(volume_id, []):
                    if vertical_overlap(shelf, partition) and shelf_crosses_partition(shelf, partition):
                        warnings.append(
                            f"Étagère {shelf.pk} traverse la séparation {partition.pk}. "
                            "Choisissez une étagère de colonne ou retirez la séparation."
                        )

                for boundary in (shelf.shelf_left_partition, shelf.shelf_right_partition):
                    if boundary is None:
                        continue
                    if not (
                        boundary.position_from_bottom <= shelf.position_from_bottom + 0.01
                        and boundary.position_from_bottom + boundary.height
                        >= shelf.position_from_bottom + shelf.height - 0.01
                    ):
                        warnings.append(
                            f"L'étagère {shelf.pk} est liée à la séparation {boundary.pk}, "
                            "qui ne couvre pas sa hauteur."
                        )

        if self.cabinet.has_doors:
            if self.cabinet.door_thickness >= self.cabinet.depth:
                warnings.append("L'épaisseur de façade est supérieure à la profondeur du caisson.")
            if self.cabinet.door_gap * 2 >= self.cabinet.height:
                warnings.append("Les jeux de façade sont trop importants.")
            for shelf in components:
                if shelf.component_type == "divider_h" and shelf.volume.split_shelf:
                    front_gap = shelf.volume.depth - shelf.depth
                    if front_gap < 10:
                        warnings.append(
                            f"Étagère {shelf.pk} : seulement {front_gap:.1f} mm de jeu avant, "
                            "risque de collision avec la façade."
                        )

        for partition in components:
            if not partition.is_partition:
                continue
            volume = partition.volume
            lower = partition.partition_lower_shelf
            upper = partition.partition_upper_shelf
            shelves = shelves_by_volume.get(volume.pk, [])
            shelf_ids = {shelf.pk for shelf in shelves}
            if lower is not None and (lower.volume_id != volume.pk or lower.pk not in shelf_ids):
                warnings.append(f"Séparation {partition.pk} : étagère basse de référence introuvable.")
                continue
            if upper is not None and (upper.volume_id != volume.pk or upper.pk not in shelf_ids):
                warnings.append(f"Séparation {partition.pk} : étagère haute de référence introuvable.")
                continue
            if lower is not None and upper is not None and lower.pk == upper.pk:
                warnings.append(f"Séparation {partition.pk} : les deux limites sont identiques.")
                continue

            lower_top = lower.position_from_bottom + lower.height if lower is not None else 0.0
            upper_bottom = upper.position_from_bottom if upper is not None else volume.height
            gap = upper_bottom - lower_top
            if gap < self.MIN_PARTITION_HEIGHT - 0.01:
                warnings.append(
                    f"Séparation {partition.pk} : espace insuffisant entre les limites "
                    f"({gap:.1f} mm)."
                )
            crossing_shelves = [
                shelf
                for shelf in shelves
                if shelf.pk not in {lower.pk if lower else None, upper.pk if upper else None}
                and vertical_overlap(shelf, partition)
                and shelf_crosses_partition(shelf, partition)
            ]
            if lower is None and upper is None:
                if crossing_shelves:
                    warnings.append(
                        f"Séparation {partition.pk} : elle traverse les étagères de la niche."
                    )
            elif lower is None:
                if any(
                    shelf.position_from_bottom < upper.position_from_bottom
                    for shelf in crossing_shelves
                ):
                    warnings.append(
                        f"Séparation {partition.pk} : elle traverse une étagère avant la limite haute."
                    )
            elif upper is None:
                if any(
                    shelf.position_from_bottom > lower.position_from_bottom
                    for shelf in crossing_shelves
                ):
                    warnings.append(
                        f"Séparation {partition.pk} : elle traverse une étagère après la limite basse."
                    )
            elif crossing_shelves:
                warnings.append(
                    f"Séparation {partition.pk} : une étagère se trouve entre ses deux limites."
                )
            if partition.position_from_bottom + partition.height > volume.height + 0.01:
                warnings.append(f"Séparation {partition.pk} : hauteur supérieure à la niche.")
            if partition.depth > volume.depth + 0.01:
                warnings.append(f"Séparation {partition.pk} : profondeur supérieure à la niche.")

        # Détection de chevauchement des boîtes de composants (séparations/étagères)
        boxes = []
        for component in components:
            volume = component.volume
            if component.is_divider:
                if component.component_type == "divider_v":
                    position = Vec3(
                        volume.pos_x + component.position_from_left - component.width / 2,
                        volume.pos_y,
                        volume.pos_z,
                    )
                    size = Vec3(component.width, volume.height, volume.depth)
                else:
                    position = Vec3(
                        volume.pos_x,
                        volume.pos_y + volume.split_offset - component.height / 2,
                        volume.pos_z,
                    )
                    size = Vec3(volume.width, component.height, volume.depth)
                boxes.append(
                    {
                        "name": component.get_component_type_display(),
                        "bbox": AABB(position, size),
                    }
                )
            elif component.is_partition:
                boxes.append(
                    {
                        "name": component.get_component_type_display(),
                        "bbox": AABB(
                            Vec3(
                                volume.pos_x + component.position_from_left - component.width / 2,
                                volume.pos_y + component.position_from_bottom,
                                volume.pos_z,
                            ),
                            Vec3(component.width, component.height, component.depth),
                        ),
                    }
                )
        warnings.extend(ValidationEngine.find_overlaps(boxes))
        return warnings

    def scene(self, warnings: Optional[List[str]] = None) -> Dict[str, Any]:
        return build_scene(self.cabinet, warnings if warnings is not None else self._validate())

    def scene_safe(self) -> Dict[str, Any]:
        """Reconstruit puis renvoie la scène (utilisé à l'ouverture de l'éditeur)."""
        warnings = self.rebuild()
        return self.scene(warnings)


@transaction.atomic
def create_cabinet(
    *,
    name: str,
    width: float,
    height: float,
    depth: float,
    material: Material,
    material_back: Optional[Material] = None,
    **options,
) -> Cabinet:
    """Crée un caisson, son volume racine, ses panneaux et son devis."""
    dimensions = {"width": width, "height": height, "depth": depth}
    for label, value in dimensions.items():
        try:
            numeric = float(value)
        except (TypeError, ValueError) as exc:
            raise CabinetDesignError(f"Dimension {label} invalide.") from exc
        if numeric < 100:
            raise CabinetDesignError("Chaque dimension globale doit être d'au moins 100 mm.")
        dimensions[label] = numeric

    cabinet = Cabinet(
        name=(name or "Nouveau meuble").strip()[:150],
        width=dimensions["width"],
        height=dimensions["height"],
        depth=dimensions["depth"],
        material_carcase=material,
        material_back=material_back,
        **options,
    )
    try:
        cabinet.full_clean()
    except ValidationError as exc:
        messages = exc.messages or ["Données du caisson invalides."]
        raise CabinetDesignError(" ".join(messages)) from exc
    cabinet.save()
    service = CabinetDesignService(cabinet)
    service.rebuild()
    if cabinet.plinth_height >= 20:
        service.set_plinth(cabinet.plinth_height, cabinet.plinth_setback)
    return cabinet
