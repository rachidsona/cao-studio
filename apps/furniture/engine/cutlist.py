"""Agrégation de la liste de débit et valorisation matière."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List

from .division import PanelDef


@dataclass
class CutListItem:
    name: str
    material: str
    length: float
    width: float
    thickness: float
    qty: int
    area_m2: float
    unit_price_m2: float
    line_total: float
    origin: str
    edge_banding: str = ""

    def as_dict(self):
        return {
            "name": self.name,
            "material": self.material,
            "length": round(self.length, 1),
            "width": round(self.width, 1),
            "thickness": round(self.thickness, 1),
            "qty": self.qty,
            "area_m2": round(self.area_m2, 4),
            "unit_price_m2": round(self.unit_price_m2, 2),
            "line_total": round(self.line_total, 2),
            "origin": self.origin,
            "edge_banding": self.edge_banding,
        }


def build_cutlist(panels: Iterable[PanelDef], material_prices: dict, material_names: dict, waste_percent: float = 0.0):
    items: List[CutListItem] = []
    total_area = 0.0
    total_cost = 0.0
    for panel in panels:
        key = str(panel.material_id)
        area = (panel.length * panel.width / 1_000_000.0) * panel.qty
        price = float(material_prices.get(key, 0.0))
        cost = area * price * (1 + waste_percent / 100.0)
        items.append(
            CutListItem(
                name=panel.name,
                material=material_names.get(key, "—"),
                length=panel.length,
                width=panel.width,
                thickness=panel.thickness,
                qty=panel.qty,
                area_m2=area,
                unit_price_m2=price,
                line_total=cost,
                origin=panel.origin,
                edge_banding=panel.edge_banding,
            )
        )
        total_area += area
        total_cost += cost
    return {
        "items": [item.as_dict() for item in items],
        "total_area_m2": round(total_area, 4),
        "total_cost": round(total_cost, 2),
    }
