"""Moteur de conception paramétrique poly_3D."""
from .division import (
    AABB,
    DivisionResult,
    GeometryError,
    PanelDef,
    Vec3,
    VolumeNode,
    VolumetricDivider,
)
from .external_zones import ExternalZoneBuilder, FootDef, PlinthDef
from .parametric import InternalMetrics, ParametricSolver
from .shelf import ShelfInstance, ShelfPlacement, ShelfTool
from .validation import ValidationEngine

__all__ = [
    "AABB",
    "DivisionResult",
    "GeometryError",
    "PanelDef",
    "Vec3",
    "VolumeNode",
    "VolumetricDivider",
    "ExternalZoneBuilder",
    "FootDef",
    "PlinthDef",
    "InternalMetrics",
    "ParametricSolver",
    "ShelfInstance",
    "ShelfPlacement",
    "ShelfTool",
    "ValidationEngine",
]
