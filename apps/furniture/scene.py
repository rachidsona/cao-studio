"""
Sérialisation du Scene Graph et construction des données d'affichage.

La hiérarchie affichée est exactement celle de la base :

    Caisson
    └── Volume racine
        ├── Séparation
        ├── Étagère(s)
        └── Volume enfant A / B
            ├── ...
            └── Étagère(s)

Les ``boxes`` sont les volumes prêts à être rendus par Three.js (coordonnées
caisson en mm, Y vers le haut, Z vers l'avant).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .engine import PanelDef
from .engine.cutlist import build_cutlist
from .history import history_state
from .models import Cabinet, CarcassPanel, Component, InternalVolume, Material, Panel


def _color(material, fallback="#ffffff") -> str:
    return getattr(material, "color", None) or fallback


def _box(kind: str, x, y, z, w, h, d, color, *, opacity=1.0, volume_id=None, component_id=None, carcass_id=None, side=None, label=None):
    return {
        "kind": kind,
        "x": round(float(x), 2),
        "y": round(float(y), 2),
        "z": round(float(z), 2),
        "w": round(float(max(w, 0.1)), 2),
        "h": round(float(max(h, 0.1)), 2),
        "d": round(float(max(d, 0.1)), 2),
        "color": color,
        "opacity": opacity,
        "volume_id": volume_id,
        "component_id": component_id,
        "carcass_id": carcass_id,
        "side": side,
        "label": label or kind,
    }


def _full_height_divider_positions(cabinet: Cabinet) -> List[tuple]:
    root = cabinet.root_volume
    if root is None:
        return []
    positions: List[tuple] = []
    for volume in cabinet.internal_volumes.filter(split_direction="vertical"):
        bottom_ok = abs(volume.pos_y - root.pos_y) < 0.01
        top_ok = abs((volume.pos_y + volume.height) - (root.pos_y + root.height)) < 0.01
        if bottom_ok and top_ok:
            dividers = list(
                volume.components.filter(component_type="divider_v")
            )
            thickness = sum(float(item.width) for item in dividers)
            if thickness <= 0:
                thickness = cabinet.thickness
            positions.append((volume.pos_x + volume.split_offset, thickness))
    return sorted(positions, key=lambda item: item[0])


def _split_segments(
    left: float, right: float, positions: List[tuple], t: float
) -> List[tuple]:
    if not positions:
        return [(left, right - left)]
    edges = [left]
    for position, thickness in positions:
        edges.append(position - thickness / 2)
        edges.append(position + thickness / 2)
    edges.append(right)
    segments: List[tuple] = []
    for index in range(0, len(edges) - 1, 2):
        width = edges[index + 1] - edges[index]
        if width > 0.01:
            segments.append((edges[index], width))
    return segments


def _cabinet_boxes(cabinet: Cabinet) -> List[dict]:
    t = cabinet.thickness
    W, H, D = cabinet.width, cabinet.height, cabinet.depth
    back_t = cabinet.back_thickness
    back_color = _color(cabinet.material_back, "#a88964")
    boxes: List[dict] = []

    cp = {panel.side: panel for panel in cabinet.carcass_panels.all()}
    left = cp.get("left")
    right = cp.get("right")
    bottom = cp.get("bottom")
    top = cp.get("top")
    left_t = float(left.effective_thickness) if left else float(t)
    right_t = float(right.effective_thickness) if right else float(t)
    bottom_t = float(bottom.effective_thickness) if bottom else float(t)
    top_t = float(top.effective_thickness) if top else float(t)
    bottom_pos = float(bottom.position) if bottom else 0.0
    top_pos = float(top.position) if top else 0.0
    left_color = _color(left.effective_material) if left else _color(cabinet.material_carcase)
    right_color = _color(right.effective_material) if right else _color(cabinet.material_carcase)
    bottom_color = _color(bottom.effective_material) if bottom else _color(cabinet.material_carcase)
    top_color = _color(top.effective_material) if top else _color(cabinet.material_carcase)

    # Panneaux de structure
    boxes.append(_box("carcass", 0, 0, 0, left_t, H, D, left_color, carcass_id=left.pk if left else None, side="left", label="Côté gauche"))
    boxes.append(_box("carcass", W - right_t, 0, 0, right_t, H, D, right_color, carcass_id=right.pk if right else None, side="right", label="Côté droit"))

    divider_positions = _full_height_divider_positions(cabinet)
    bottom_left = left_t
    bottom_right = W - right_t
    for seg_x, seg_w in _split_segments(bottom_left, bottom_right, divider_positions, t):
        boxes.append(_box("carcass", seg_x, bottom_pos, 0, seg_w, bottom_t, D, bottom_color, carcass_id=bottom.pk if bottom else None, side="bottom", label="Dessous"))
    for seg_x, seg_w in _split_segments(bottom_left, bottom_right, divider_positions, t):
        boxes.append(_box("carcass", seg_x, H - top_t - top_pos, 0, seg_w, top_t, D, top_color, carcass_id=top.pk if top else None, side="top", label="Dessus"))
    if back_t > 0:
        boxes.append(
            _box(
                "back",
                left_t,
                bottom_t + bottom_pos,
                0,
                max(0.1, W - left_t - right_t),
                max(0.1, H - bottom_t - top_t - bottom_pos - top_pos),
                min(back_t, D),
                back_color,
                label="Fond",
            )
        )

    # Façades (translucides pour laisser voir l'intérieur)
    if cabinet.has_doors:
        gap = max(0.0, cabinet.door_gap)
        door_t = max(1.0, cabinet.door_thickness)
        count = 2 if W >= 600 else 1
        panel_w = max(1.0, (W - gap * (count + 1)) / count)
        x = gap
        for index in range(count):
            boxes.append(
                _box(
                    "door",
                    x,
                    gap,
                    D,
                    panel_w,
                    max(1.0, H - 2 * gap),
                    door_t,
                    _color(cabinet.material_carcase),
                    opacity=0.16,
                    label=f"Façade {index + 1}",
                )
            )
            x += panel_w + gap

    # Façades tiroirs (empilées depuis le bas, translucides).
    if cabinet.has_drawers:
        gap = max(0.0, cabinet.door_gap)
        count = max(1, min(int(cabinet.drawer_count), 10))
        drawer_t = max(1.0, cabinet.door_thickness)
        usable = max(20.0, H - 2 * gap)
        drawer_h = max(20.0, min(float(cabinet.drawer_height), usable))
        if count * drawer_h + (count + 1) * gap > usable:
            drawer_h = max(
                20.0, (usable - (count + 1) * gap) / max(1, count)
            )
        y = gap
        for index in range(count):
            boxes.append(
                _box(
                    "drawer",
                    gap,
                    y,
                    D,
                    max(1.0, W - 2 * gap),
                    drawer_h,
                    drawer_t,
                    _color(cabinet.material_carcase),
                    opacity=0.16,
                    label=f"Tiroir {index + 1}",
                )
            )
            y += drawer_h + gap

    # Tringle de penderie : barre fine sous le dessus du caisson.
    if cabinet.has_hanging_rail:
        rail_y = min(
            max(float(cabinet.hanging_rail_height), 50.0),
            max(50.0, H - 50.0),
        )
        rail_d = min(30.0, max(10.0, D * 0.08))
        boxes.append(
            _box(
                "rail",
                left_t,
                rail_y - 15.0,
                max(0.0, (D - rail_d) / 2.0),
                max(10.0, W - left_t - right_t),
                30.0,
                rail_d,
                "#94a3b8",
                label="Tringle",
            )
        )

    # Zones externes
    for zone in cabinet.external_zones.all():
        boxes.append(
            _box(
                zone.zone_type,
                zone.pos_x,
                zone.pos_y,
                zone.pos_z,
                zone.width,
                zone.height,
                zone.depth,
                _color(zone.material, "#b08d57"),
                label=zone.get_zone_type_display(),
            )
        )
    return boxes


def _volume_boxes(volumes: List[InternalVolume], components: List[Component], cabinet: Cabinet) -> List[dict]:
    boxes: List[dict] = []
    by_volume: Dict[int, List[Component]] = {}
    for component in components:
        by_volume.setdefault(component.volume_id, []).append(component)

    for volume in volumes:
        if volume.is_leaf:
            boxes.append(
                _box(
                    "volume",
                    volume.pos_x,
                    volume.pos_y,
                    volume.pos_z,
                    volume.width,
                    volume.height,
                    volume.depth,
                    "#38bdf8",
                    opacity=0.09,
                    volume_id=volume.pk,
                    label=f"Volume {volume.pk}",
                )
            )

        for component in by_volume.get(volume.pk, []):
            color = _color(component.material)
            if component.component_type == "divider_v":
                center = float(component.position_from_left)
                if center <= 0:
                    center = volume.split_offset
                x = volume.pos_x + center - component.width / 2
                is_side = bool(volume.split_side)
                boxes.append(
                    _box(
                        "divider",
                        x,
                        0 if is_side else volume.pos_y,
                        0 if is_side else volume.pos_z,
                        component.width,
                        cabinet.height if is_side else volume.height,
                        cabinet.depth if is_side else volume.depth,
                        color,
                        volume_id=volume.pk,
                        component_id=component.pk,
                        label="Côté" if is_side else "Séparation",
                    )
                )
            elif component.component_type == "divider_h":
                offset = volume.split_offset
                y = volume.pos_y + offset - component.height / 2
                is_shelf = bool(volume.split_shelf)
                boxes.append(
                    _box(
                        "shelf" if is_shelf else "divider",
                        volume.pos_x,
                        y,
                        volume.pos_z,
                        volume.width,
                        component.height,
                        component.depth,
                        color,
                        volume_id=volume.pk,
                        component_id=component.pk,
                        label="Étagère",
                    )
                )
            elif component.component_type == "shelf":
                x = volume.pos_x + component.position_from_left
                boxes.append(
                    _box(
                        "shelf",
                        x,
                        volume.pos_y + component.position_from_bottom,
                        volume.pos_z,
                        component.width,
                        component.height,
                        component.depth,
                        color,
                        volume_id=volume.pk,
                        component_id=component.pk,
                        label="Étagère",
                    )
                )
            elif component.component_type == "partition_v":
                x = volume.pos_x + component.position_from_left - component.width / 2
                boxes.append(
                    _box(
                        "divider",
                        x,
                        volume.pos_y + component.position_from_bottom,
                        volume.pos_z,
                        component.width,
                        component.height,
                        component.depth,
                        color,
                        volume_id=volume.pk,
                        component_id=component.pk,
                        label="Séparation",
                    )
                )
    return boxes


def _cm_text(value: float) -> str:
    """Mesure en centimètres, sans décimale inutile."""
    text = f"{float(value) / 10:.1f}"
    return text[:-2] if text.endswith(".0") else text


def _dims_text(width: float, height: float, depth: float) -> str:
    return f"{_cm_text(width)} × {_cm_text(height)} × {_cm_text(depth)} cm"


def _component_dims(component: Component, cabinet: Cabinet) -> str:
    """Dimensions réelles du panneau, identiques à la boîte 3D."""
    volume = component.volume
    if component.component_type == "divider_v":
        if volume.split_side:
            # Côté collé : deux panneaux pleine hauteur et pleine profondeur.
            return _dims_text(component.width, cabinet.height, cabinet.depth)
        return _dims_text(component.width, volume.height, volume.depth)
    if component.component_type == "divider_h":
        return _dims_text(volume.width, component.height, volume.depth)
    return _dims_text(component.width, component.height, component.depth)


def _exterior_tree_nodes(cabinet: Cabinet) -> List[dict]:
    """Plinthes et façades : éléments extérieurs affichés dans le Scene Graph."""
    nodes: List[dict] = []
    for zone in cabinet.external_zones.filter(zone_type="plinth").order_by("pk"):
        nodes.append(
            {
                "id": f"plinth-{zone.pk}",
                "kind": "plinth",
                "label": zone.get_zone_type_display(),
                "dimensions": _dims_text(zone.width, zone.height, zone.depth),
                "children": [],
            }
        )
    if cabinet.has_doors:
        gap = max(0.0, cabinet.door_gap)
        door_t = max(1.0, cabinet.door_thickness)
        count = 2 if cabinet.width >= 600 else 1
        panel_w = max(1.0, (cabinet.width - gap * (count + 1)) / count)
        panel_h = max(1.0, cabinet.height - 2 * gap)
        dims = _dims_text(panel_w, panel_h, door_t)
        nodes.extend(
            {
                "id": f"door-{index + 1}",
                "kind": "door",
                "label": f"Façade {index + 1}",
                "dimensions": dims,
                "children": [],
            }
            for index in range(count)
        )
    if cabinet.has_drawers:
        gap = max(0.0, cabinet.door_gap)
        count = max(1, min(int(cabinet.drawer_count), 10))
        usable = max(20.0, cabinet.height - 2 * gap)
        drawer_h = max(20.0, min(float(cabinet.drawer_height), usable))
        if count * drawer_h + (count + 1) * gap > usable:
            drawer_h = max(20.0, (usable - (count + 1) * gap) / max(1, count))
        drawer_t = max(1.0, cabinet.door_thickness)
        dims = _dims_text(
            max(1.0, cabinet.width - 2 * gap), drawer_h, drawer_t
        )
        nodes.extend(
            {
                "id": f"drawer-{index + 1}",
                "kind": "drawer",
                "label": f"Tiroir {index + 1}",
                "dimensions": dims,
                "children": [],
            }
            for index in range(count)
        )
    if cabinet.has_hanging_rail:
        rail_d = min(30.0, max(10.0, cabinet.depth * 0.08))
        nodes.append(
            {
                "id": "rail-1",
                "kind": "rail",
                "label": "Tringle",
                "dimensions": _dims_text(
                    max(10.0, cabinet.internal_width), 30.0, rail_d
                ),
                "children": [],
            }
        )
    return nodes


def _tree(cabinet: Cabinet, volumes: List[InternalVolume], components: List[Component], warnings: List[str]) -> dict:
    by_parent: Dict[Optional[int], List[InternalVolume]] = {}
    for volume in volumes:
        by_parent.setdefault(volume.parent_id, []).append(volume)
    by_volume: Dict[int, List[Component]] = {}
    for component in components:
        by_volume.setdefault(component.volume_id, []).append(component)

    def component_node(component: Component, volume: InternalVolume) -> dict:
        if component.component_type == "divider_v":
            is_side = bool(volume.split_side)
            label = "Côté" if is_side else "Séparation"
            kind = "divider"
        elif component.component_type == "divider_h":
            label = "Étagère"
            kind = "shelf" if volume.split_shelf else "divider"
        elif component.component_type == "partition_v":
            label = "Séparation"
            kind = "divider"
        else:
            label = "Étagère"
            kind = "shelf"
        return {
            "id": f"component-{component.pk}",
            "kind": kind,
            "label": label,
            "component_id": component.pk,
            "volume_id": volume.pk,
            "dimensions": _component_dims(component, cabinet),
            "children": [],
        }

    def volume_components(volume: InternalVolume) -> List[dict]:
        """Panneaux de la niche, puis ceux de ses sous-niches.

        Les niches elles-mêmes ne sont plus des nœuds du Scene Graph : seuls
        les panneaux (côtés, séparations, étagères) y sont affichés.
        """
        nodes = [component_node(component, volume) for component in by_volume.get(volume.pk, [])]
        for child in by_parent.get(volume.pk, []):
            nodes.extend(volume_components(child))
        return nodes

    roots = [v for v in volumes if v.is_root]
    component_nodes: List[dict] = []
    for root in roots:
        component_nodes.extend(volume_components(root))

    carcass_panels = list(cabinet.carcass_panels.all())
    cp = {panel.side: panel for panel in carcass_panels}
    carcass_nodes = [
        {
            "id": f"carcass-{panel.pk}",
            "kind": "carcass",
            "label": panel.get_side_display(),
            "carcass_id": panel.pk,
            "side": panel.side,
            "dimensions": (
                _dims_text(panel.effective_thickness, cabinet.height, cabinet.depth)
                if panel.side in ("left", "right")
                else None
            ),
            "children": [],
        }
        for panel in carcass_panels
    ]

    back_nodes: List[dict] = []
    back_t = float(cabinet.back_thickness)
    if back_t > 0:
        left_t = float(cp["left"].effective_thickness) if "left" in cp else float(cabinet.thickness)
        right_t = float(cp["right"].effective_thickness) if "right" in cp else float(cabinet.thickness)
        bottom = cp.get("bottom")
        top = cp.get("top")
        bottom_t = float(bottom.effective_thickness) if bottom else float(cabinet.thickness)
        top_t = float(top.effective_thickness) if top else float(cabinet.thickness)
        bottom_pos = float(bottom.position) if bottom else 0.0
        top_pos = float(top.position) if top else 0.0
        back_w = max(0.1, cabinet.width - left_t - right_t)
        back_h = max(0.1, cabinet.height - bottom_t - top_t - bottom_pos - top_pos)
        back_nodes.append(
            {
                "id": "back",
                "kind": "back",
                "label": "Fond",
                "side": "back",
                "dimensions": _dims_text(back_w, back_h, back_t),
                "children": [],
            }
        )

    children = carcass_nodes + back_nodes + _exterior_tree_nodes(cabinet) + component_nodes
    return {
        "id": f"cabinet-{cabinet.pk}",
        "kind": "cabinet",
        "label": cabinet.name,
        "cabinet_id": cabinet.pk,
        "warnings": warnings,
        "children": children,
    }


def _panels_as_defs(cabinet: Cabinet) -> List[PanelDef]:
    defs = []
    for panel in cabinet.panels.select_related("material"):
        defs.append(
            PanelDef(
                name=panel.name,
                material_id=panel.material_id,
                length=panel.length,
                width=panel.width,
                thickness=panel.thickness,
                qty=panel.quantity,
                edge_banding=panel.edge_banding,
                origin=panel.category,
            )
        )
    return defs


def build_scene(cabinet: Cabinet, warnings: Optional[List[str]] = None) -> Dict[str, Any]:
    volumes = list(cabinet.internal_volumes.select_related("parent").all())
    components = list(
        cabinet.components.select_related(
            "material", "volume", "partition_lower_shelf", "partition_upper_shelf"
        ).all()
    )
    warnings = warnings or []

    material_prices = {}
    material_names = {}
    for panel in cabinet.panels.select_related("material"):
        material_prices[str(panel.material_id)] = panel.material.price_per_m2
        material_names[str(panel.material_id)] = panel.material.name
    for material in Material.objects.all():
        material_prices.setdefault(str(material.pk), material.price_per_m2)
        material_names.setdefault(str(material.pk), material.name)

    cutlist = build_cutlist(_panels_as_defs(cabinet), material_prices, material_names, cabinet.waste_percent)

    quote = getattr(cabinet, "quote", None)
    quote_data = None
    if quote:
        quote_data = {
            "id": quote.pk,
            "client_name": quote.client_name,
            "status": quote.get_status_display(),
            "status_code": quote.status,
            "margin_percent": quote.margin_percent,
            "tax_rate": quote.tax_rate,
            "subtotal_materials": round(quote.subtotal_materials, 2),
            "subtotal_hardware": round(quote.subtotal_hardware, 2),
            "total_ht": round(quote.total_ht, 2),
            "margin_amount": round(quote.margin_amount, 2),
            "total_before_tax": round(quote.total_before_tax, 2),
            "tax_amount": round(quote.tax_amount, 2),
            "total_ttc": round(quote.total_ttc, 2),
            "lines": [
                {
                    "id": line.pk,
                    "description": line.description,
                    "quantity": line.quantity,
                    "unit": line.unit,
                    "unit_price": round(line.unit_price, 2),
                    "total": round(line.total, 2),
                    "is_material": line.is_material,
                    "is_hardware": line.is_hardware,
                }
                for line in quote.lines.select_related("material").all()
            ],
        }

    return {
        "cabinet": {
            "id": cabinet.pk,
            "name": cabinet.name,
            "width": round(cabinet.width, 1),
            "height": round(cabinet.height, 1),
            "depth": round(cabinet.depth, 1),
            "internal_width": round(cabinet.internal_width, 1),
            "internal_height": round(cabinet.internal_height, 1),
            "internal_depth": round(cabinet.internal_depth, 1),
            "thickness": round(cabinet.thickness, 1),
            "back_thickness": round(cabinet.back_thickness, 1),
            "back_in_groove": cabinet.back_in_groove,
            "bottom_setback": cabinet.bottom_setback,
            "shelf_side_clearance": cabinet.shelf_side_clearance,
            "waste_percent": cabinet.waste_percent,
            "has_doors": cabinet.has_doors,
            "door_thickness": cabinet.door_thickness,
            "door_gap": cabinet.door_gap,
            "has_hanging_rail": cabinet.has_hanging_rail,
            "hanging_rail_height": round(cabinet.hanging_rail_height, 1),
            "has_drawers": cabinet.has_drawers,
            "drawer_count": cabinet.drawer_count,
            "drawer_height": round(cabinet.drawer_height, 1),
            "plinth_height": cabinet.plinth_height,
            "plinth_setback": cabinet.plinth_setback,
            "has_plinth": cabinet.has_plinth,
            "material_id": cabinet.material_carcase_id,
            "material_name": cabinet.material_carcase.name,
            "material_color": _color(cabinet.material_carcase),
            "material_category": cabinet.material_carcase.category or "solid",
            "material_back_id": cabinet.material_back_id,
            "updated_at": cabinet.updated_at.isoformat(),
        },
        "volumes": [volume.as_dict() for volume in volumes],
        "components": [
            {
                "id": component.pk,
                "type": component.component_type,
                "volume_id": component.volume_id,
                "material": component.material.name,
                "material_id": component.material_id,
                "color": _color(component.material),
                "position_from_bottom": round(component.position_from_bottom, 1),
                "position_from_left": round(component.position_from_left, 1),
                "offset_mode": component.offset_mode,
                "ratio": round(component.ratio, 4),
                "depth_clearance_front": round(component.depth_clearance_front, 1),
                "width": round(component.width, 1),
                "height": round(component.height, 1),
                "depth": round(component.depth, 1),
                "thickness": round(
                    component.width
                    if component.component_type in ("divider_v", "partition_v")
                    else component.height,
                    1,
                ),
                "edge_banding": component.edge_banding,
                "shelf_left_partition_id": component.shelf_left_partition_id,
                "shelf_right_partition_id": component.shelf_right_partition_id,
                "fixed": component.fixed,
            }
            for component in components
        ],
        "materials": [
            {
                "id": material.pk,
                "name": material.name,
                "thickness": material.thickness,
                "price_per_m2": material.price_per_m2,
                "color": material.color,
                "is_default": material.is_default,
            }
            for material in Material.objects.all()
        ],
        "external_zones": [zone.as_dict() for zone in cabinet.external_zones.all()],
        "carcass_panels": [panel.as_dict() for panel in cabinet.carcass_panels.all()],
        "boxes": _cabinet_boxes(cabinet) + _volume_boxes(volumes, components, cabinet),
        "tree": _tree(cabinet, volumes, components, warnings),
        "panels": [panel.as_dict() for panel in cabinet.panels.select_related("material").all()],
        "cutlist": cutlist,
        "quote": quote_data,
        "warnings": warnings,
        "stats": {
            "volume_count": len(volumes),
            "leaf_count": sum(1 for v in volumes if v.is_leaf),
            "shelf_count": sum(
                1
                for c in components
                if c.is_shelf or c.component_type == "divider_h"
            ),
            "divider_count": sum(
                1
                for c in components
                if c.is_divider
                and not (c.component_type == "divider_h" and c.volume.split_shelf)
            ),
            "separation_count": sum(
                1
                for c in components
                if c.is_partition
                or (
                    c.component_type == "divider_v"
                    and not c.volume.split_side
                )
            ),
            "partition_count": sum(1 for c in components if c.is_partition),
            "panel_count": len(list(cabinet.panels.all())),
        },
        "history": history_state(cabinet),
    }
