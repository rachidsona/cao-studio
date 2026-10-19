"""Reference documents shared with the TypeScript editor."""
from __future__ import annotations

from typing import Any


def default_document() -> dict[str, Any]:
    """Return a fresh copy of the reference part: an 80×50×10 mm plate with a Ø10 hole."""
    return {
        "format": "cao-studio",
        "schemaVersion": 1,
        "units": "mm",
        "parameters": {},
        "features": [
            {
                "id": "sk1",
                "type": "sketch",
                "name": "Esquisse 1",
                "plane": "XY",
                "offset": 0,
                "entities": [
                    {
                        "id": "r1",
                        "kind": "rectangle",
                        "cx": 0,
                        "cy": 0,
                        "width": 80,
                        "height": 50,
                    }
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
