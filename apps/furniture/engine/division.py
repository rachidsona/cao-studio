"""
Décomposition volumétrique d'un caisson.

Convention de repère (coordonnées locales du caisson, en millimètres) :
    X : gauche -> droite
    Y : bas -> haut
    Z : fond -> avant

Un volume est un pavé droit (AABB). Une division consomme l'épaisseur du
séparateur : les deux baies filles ne se chevauchent jamais avec le panneau.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import uuid


class GeometryError(ValueError):
    """Erreur de contrainte géométrique (message destiné à l'utilisateur)."""


@dataclass
class Vec3:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


@dataclass
class AABB:
    """Pavé axis-aligned exprimé par son coin min et sa taille."""

    pos: Vec3
    size: Vec3  # width (X), height (Y), depth (Z)

    @property
    def x0(self) -> float:
        return self.pos.x

    @property
    def y0(self) -> float:
        return self.pos.y

    @property
    def z0(self) -> float:
        return self.pos.z

    @property
    def x1(self) -> float:
        return self.pos.x + self.size.x

    @property
    def y1(self) -> float:
        return self.pos.y + self.size.y

    @property
    def z1(self) -> float:
        return self.pos.z + self.size.z

    @property
    def width(self) -> float:
        return self.size.x

    @property
    def height(self) -> float:
        return self.size.y

    @property
    def depth(self) -> float:
        return self.size.z

    @property
    def center(self) -> Vec3:
        return Vec3(self.x0 + self.width / 2, self.y0 + self.height / 2, self.z0 + self.depth / 2)

    def translated(self, dx: float = 0, dy: float = 0, dz: float = 0) -> "AABB":
        return AABB(Vec3(self.x0 + dx, self.y0 + dy, self.z0 + dz), Vec3(self.width, self.height, self.depth))

    def intersects(self, other: "AABB", tolerance: float = 1e-6) -> bool:
        """Vrai si les volumes se pénètrent (un simple contact n'est pas une collision)."""
        return not (
            self.x1 <= other.x0 + tolerance
            or other.x1 <= self.x0 + tolerance
            or self.y1 <= other.y0 + tolerance
            or other.y1 <= self.y0 + tolerance
            or self.z1 <= other.z0 + tolerance
            or other.z1 <= self.z0 + tolerance
        )

    def contains(self, other: "AABB", tolerance: float = 1e-6) -> bool:
        return (
            other.x0 >= self.x0 - tolerance
            and other.x1 <= self.x1 + tolerance
            and other.y0 >= self.y0 - tolerance
            and other.y1 <= self.y1 + tolerance
            and other.z0 >= self.z0 - tolerance
            and other.z1 <= self.z1 + tolerance
        )

    def as_dict(self) -> Dict[str, float]:
        return {
            "x": round(self.x0, 2),
            "y": round(self.y0, 2),
            "z": round(self.z0, 2),
            "w": round(self.width, 2),
            "h": round(self.height, 2),
            "d": round(self.depth, 2),
        }


@dataclass
class PanelDef:
    """Panneau de fabrication généré par un outil (séparateur, étagère...)."""

    name: str
    material_id: Any
    length: float
    width: float
    thickness: float
    qty: int = 1
    edge_banding: str = ""
    origin: str = "component"  # caisson | divider | shelf | external | door
    notes: str = ""


@dataclass
class VolumeNode:
    """Nœud de volume manipulé par le moteur (indépendant de Django)."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    cabinet_id: str = ""
    parent_id: Optional[str] = None
    bbox: Optional[AABB] = None
    is_leaf: bool = True
    locked: bool = False
    meta: Dict[str, Any] = field(default_factory=dict)

    def child(self, bbox: AABB) -> "VolumeNode":
        return VolumeNode(cabinet_id=self.cabinet_id, parent_id=self.id, bbox=bbox, meta=dict(self.meta))


@dataclass
class DivisionResult:
    parent_id: str
    direction: str  # vertical | horizontal
    divider_bbox: AABB
    children: List[VolumeNode] = field(default_factory=list)
    panels: List[PanelDef] = field(default_factory=list)
    offset: float = 0.0
    warnings: List[str] = field(default_factory=list)


class VolumetricDivider:
    """Divise un volume parent en deux baies + un séparateur.

    ``offset`` est la position du **centre** du séparateur, mesurée depuis le
    bord gauche (division verticale) ou le bas (division horizontale) du volume
    parent. Ce choix rend le déplacement du séparateur intuitif dans l'IHM.
    """

    def __init__(self, panel_thickness: float = 19.0, min_bay: float = 50.0, min_clearance: float = 5.0):
        if panel_thickness <= 0:
            raise GeometryError("L'épaisseur du panneau doit être positive.")
        self.t = float(panel_thickness)
        self.min_bay = float(min_bay)
        self.min_clearance = float(min_clearance)

    def _resolve_offset(self, size: float, offset: float) -> float:
        min_offset = self.t / 2 + self.min_bay
        max_offset = size - self.t / 2 - self.min_bay
        if max_offset < min_offset:
            raise GeometryError(
                f"Volume trop petit pour être divisé : {size:.1f} mm "
                f"(minimum {2 * self.min_bay + self.t:.1f} mm)."
            )
        if offset < min_offset - 0.01 or offset > max_offset + 0.01:
            raise GeometryError(
                f"Position de la séparation hors limites : {offset:.1f} mm "
                f"(autorisé entre {min_offset:.1f} et {max_offset:.1f} mm)."
            )
        return min(max(offset, min_offset), max_offset)

    def split_vertical(self, parent: VolumeNode, offset_from_left: float) -> DivisionResult:
        """Séparation verticale : le séparateur est un panneau dans le plan YZ."""
        parent = self._check_parent(parent)
        b = parent.bbox
        offset = self._resolve_offset(b.width, float(offset_from_left))
        divider_bbox = AABB(
            Vec3(b.x0 + offset - self.t / 2, b.y0, b.z0),
            Vec3(self.t, b.height, b.depth),
        )
        left_bbox = AABB(Vec3(b.x0, b.y0, b.z0), Vec3(offset - self.t / 2, b.height, b.depth))
        right_bbox = AABB(
            Vec3(b.x0 + offset + self.t / 2, b.y0, b.z0),
            Vec3(b.width - offset - self.t / 2, b.height, b.depth),
        )
        panel = PanelDef(
            name="Séparation",
            material_id=parent.meta.get("material_carcase_id"),
            length=b.height,
            width=b.depth,
            thickness=self.t,
            qty=1,
            edge_banding="Chant avant",
            origin="divider",
        )
        return DivisionResult(
            parent_id=parent.id,
            direction="vertical",
            divider_bbox=divider_bbox,
            children=[parent.child(left_bbox), parent.child(right_bbox)],
            panels=[panel],
            offset=offset,
            warnings=[],
        )

    def split_horizontal(self, parent: VolumeNode, offset_from_bottom: float) -> DivisionResult:
        """Séparation horizontale : le séparateur est un panneau dans le plan XZ."""
        parent = self._check_parent(parent)
        b = parent.bbox
        offset = self._resolve_offset(b.height, float(offset_from_bottom))
        divider_bbox = AABB(
            Vec3(b.x0, b.y0 + offset - self.t / 2, b.z0),
            Vec3(b.width, self.t, b.depth),
        )
        bottom_bbox = AABB(Vec3(b.x0, b.y0, b.z0), Vec3(b.width, offset - self.t / 2, b.depth))
        top_bbox = AABB(
            Vec3(b.x0, b.y0 + offset + self.t / 2, b.z0),
            Vec3(b.width, b.height - offset - self.t / 2, b.depth),
        )
        panel = PanelDef(
            name="Étagère",
            material_id=parent.meta.get("material_carcase_id"),
            length=b.width,
            width=b.depth,
            thickness=self.t,
            qty=1,
            edge_banding="Chant avant",
            origin="divider",
        )
        return DivisionResult(
            parent_id=parent.id,
            direction="horizontal",
            divider_bbox=divider_bbox,
            children=[parent.child(bottom_bbox), parent.child(top_bbox)],
            panels=[panel],
            offset=offset,
            warnings=[],
        )

    def _check_parent(self, parent: VolumeNode) -> VolumeNode:
        if parent.bbox is None:
            raise GeometryError("Volume sans géométrie (bbox manquante).")
        if parent.locked:
            raise GeometryError("Ce volume est verrouillé : déverrouillez-le avant de le diviser.")
        if not parent.is_leaf:
            raise GeometryError("Ce volume contient déjà une division.")
        return parent

    def bounds_for(self, size: float) -> Dict[str, float]:
        """Bornes utilisables pour l'IHM (position du centre du séparateur)."""
        return {
            "min": round(self.t / 2 + self.min_bay, 2),
            "max": round(size - self.t / 2 - self.min_bay, 2),
            "min_bay": self.min_bay,
            "thickness": self.t,
        }
