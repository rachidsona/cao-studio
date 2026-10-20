"""Reference documents shared with the TypeScript editor."""
from __future__ import annotations

from typing import Any


def _line(line_id: str, p1: str, p2: str) -> dict[str, Any]:
    return {"id": line_id, "kind": "line", "p1": p1, "p2": p2}


def default_document() -> dict[str, Any]:
    """Return a fresh copy of the reference part (schema v2).

    An 80×50×10 mm plate with a Ø10 through hole: a fully constrained
    rectangle sketch centred on the origin, extruded by 10 mm.
    """
    return {
        "format": "cao-studio",
        "schemaVersion": 2,
        # Display unit of new projects (lengths are always stored in mm).
        "units": "cm",
        "parameters": {},
        "features": [
            {
                "id": "sk1",
                "type": "sketch",
                "name": "Esquisse 1",
                "plane": "XY",
                "offset": 0,
                "points": [
                    {"id": "p1", "x": -40, "y": -25},
                    {"id": "p2", "x": 40, "y": -25},
                    {"id": "p3", "x": 40, "y": 25},
                    {"id": "p4", "x": -40, "y": 25},
                ],
                "curves": [
                    _line("l1", "p1", "p2"),
                    _line("l2", "p2", "p3"),
                    _line("l3", "p3", "p4"),
                    _line("l4", "p4", "p1"),
                ],
                "constraints": [
                    {"id": "c1", "kind": "horizontal", "line": "l1"},
                    {"id": "c2", "kind": "horizontal", "line": "l3"},
                    {"id": "c3", "kind": "vertical", "line": "l2"},
                    {"id": "c4", "kind": "vertical", "line": "l4"},
                    {"id": "c5", "kind": "symmetric", "a": "p1", "b": "p3", "axis": "origin"},
                    {"id": "d1", "kind": "length", "line": "l1", "value": 80, "label": "Longueur"},
                    {"id": "d2", "kind": "length", "line": "l2", "value": 50, "label": "Largeur"},
                ],
            },
            {
                "id": "ex1",
                "type": "extrude",
                "name": "Extrusion 1",
                "sketch": "sk1",
                "distance": 10,
                "operation": "new",
            },
            {
                "id": "h1",
                "type": "hole",
                "name": "Perçage 1",
                "target": "ex1",
                "x": 0,
                "y": 0,
                "diameter": 10,
                "depth": "through",
            },
        ],
    }
