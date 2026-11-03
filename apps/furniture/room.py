"""Couche « pièce » des affaires : murs, ouvertures, placements et versions.

Le serveur reste la source de vérité : ce module calcule les payloads envoyés
à l'éditeur 2D/3D, les résumés de prix, les avertissements de faisabilité et
les instantanés versionnés. Three.js n'est qu'une vue de ces données.
"""
from __future__ import annotations

import math
from typing import Dict, Iterable, List, Optional, Tuple

from django.db import transaction

from .history import capture_cabinet, clone_cabinet_from_payload
from .library import PRESETS, appliance_preset_payload, preset_payload
from .room_history import room_history_counts
from .models import (
    Cabinet,
    Project,
    ProjectItem,
    ProjectVersion,
    RoomAppliance,
    RoomOpening,
    RoomWall,
    RoomWorktop,
)
from .services import create_cabinet


# ----------------------------------------------------------------------
# Géométrie
# ----------------------------------------------------------------------
def wall_length(wall: RoomWall) -> float:
    return math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1)


def wall_angle(wall: RoomWall) -> float:
    """Angle du mur dans le plan, en degrés (0 = est, 90 = sud)."""
    return math.degrees(math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1)) % 360.0


def _rotate(x: float, y: float, degrees: float) -> Tuple[float, float]:
    radians = math.radians(degrees)
    cos_a, sin_a = math.cos(radians), math.sin(radians)
    return x * cos_a - y * sin_a, x * sin_a + y * cos_a


def item_corners(item: ProjectItem) -> List[Tuple[float, float]]:
    """Les 4 coins de l'emprise du caisson dans le plan (mm)."""
    return _rect_corners(
        float(item.pos_x),
        float(item.pos_y),
        float(item.cabinet.width),
        float(item.cabinet.depth),
        float(item.rotation),
    )


def _rect_corners(
    x: float, y: float, width: float, depth: float, rotation: float
) -> List[Tuple[float, float]]:
    local = [(0.0, 0.0), (width, 0.0), (width, depth), (0.0, depth)]
    corners = []
    for lx, ly in local:
        rx, ry = _rotate(lx, ly, rotation)
        corners.append((x + rx, y + ry))
    return corners


def appliance_corners(appliance: RoomAppliance) -> List[Tuple[float, float]]:
    """Les 4 coins de l'emprise de l'appareil dans le plan (mm)."""
    return _rect_corners(
        float(appliance.pos_x),
        float(appliance.pos_y),
        float(appliance.width),
        float(appliance.depth),
        float(appliance.rotation),
    )


def _bbox_from_corners(corners: List[Tuple[float, float]]) -> Tuple[float, float, float, float]:
    xs = [point[0] for point in corners]
    ys = [point[1] for point in corners]
    return min(xs), min(ys), max(xs), max(ys)


def item_bbox(item: ProjectItem) -> Tuple[float, float, float, float]:
    return _bbox_from_corners(item_corners(item))


def appliance_bbox(
    appliance: RoomAppliance,
) -> Tuple[float, float, float, float]:
    return _bbox_from_corners(appliance_corners(appliance))


def _bbox_overlap(a, b, gap: float = 0.0) -> bool:
    return not (
        a[2] + gap <= b[0]
        or b[2] + gap <= a[0]
        or a[3] + gap <= b[1]
        or b[3] + gap <= a[1]
    )


def _point_in_polygon(
    x: float, y: float, polygon: List[Tuple[float, float]], tolerance: float = 1.0
) -> bool:
    """Teste l'appartenance d'un point à un polygone simple (bord inclus)."""
    inside = False
    count = len(polygon)
    for index in range(count):
        x1, y1 = polygon[index]
        x2, y2 = polygon[(index + 1) % count]
        length = math.hypot(x2 - x1, y2 - y1)
        if length < 1e-9:
            continue
        cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
        if (
            abs(cross) <= tolerance * length
            and min(x1, x2) - tolerance <= x <= max(x1, x2) + tolerance
            and min(y1, y2) - tolerance <= y <= max(y1, y2) + tolerance
        ):
            return True
        if (y1 > y) != (y2 > y):
            intersection_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < intersection_x:
                inside = not inside
    return inside


def room_polygon(project: Project) -> List[Tuple[float, float]]:
    walls = list(project.walls.all())
    if not walls:
        return []
    return [(float(wall.x1), float(wall.y1)) for wall in walls]


def room_area_m2(project: Project) -> float:
    polygon = room_polygon(project)
    if len(polygon) < 3:
        return 0.0
    area = 0.0
    for index, (x1, y1) in enumerate(polygon):
        x2, y2 = polygon[(index + 1) % len(polygon)]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0 / 1_000_000.0


def room_project_summary(project: Project) -> Dict:
    """Résumé léger d'une affaire en mode pièce pour la fiche Affaire."""
    items = list(project.items.select_related("cabinet").all())
    return {
        "cabinet_count": len(items),
        "room_width": float(project.room_width),
        "room_depth": float(project.room_depth),
        "room_height": float(project.room_height),
        "area_m2": round(room_area_m2(project), 2),
        "opening_count": project.openings.count(),
        "wall_count": project.walls.count(),
    }


def ensure_room(project: Project) -> List[RoomWall]:
    """Crée la pièce rectangulaire par défaut si aucun mur n'existe."""
    walls = list(project.walls.all())
    if walls:
        return walls
    width = float(project.room_width)
    depth = float(project.room_depth)
    height = float(project.room_height)
    thickness = float(project.wall_thickness)
    definitions = [
        ("Nord", 0, 0, width, 0),
        ("Est", width, 0, width, depth),
        ("Sud", width, depth, 0, depth),
        ("Ouest", 0, depth, 0, 0),
    ]
    return [
        RoomWall.objects.create(
            project=project,
            index=index,
            name=name,
            x1=x1,
            y1=y1,
            x2=x2,
            y2=y2,
            height=height,
            thickness=thickness,
        )
        for index, (name, x1, y1, x2, y2) in enumerate(definitions)
    ]


# ----------------------------------------------------------------------
# Placement automatique
# ----------------------------------------------------------------------
def _candidate_bbox(
    x: float, y: float, width: float, depth: float, rotation: float
) -> Tuple[float, float, float, float]:
    local = [(0.0, 0.0), (width, 0.0), (width, depth), (0.0, depth)]
    points = []
    for lx, ly in local:
        rx, ry = _rotate(lx, ly, rotation)
        points.append((x + rx, y + ry))
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def _vertical_range_values(elevation: float, height: float) -> Tuple[float, float]:
    bottom = float(elevation)
    return bottom, bottom + float(height)


def _vertical_range(item: ProjectItem) -> Tuple[float, float]:
    return _vertical_range_values(item.elevation, item.cabinet.height)


def _appliance_vertical_range(appliance: RoomAppliance) -> Tuple[float, float]:
    return _vertical_range_values(appliance.elevation, appliance.height)


#: Appliances made to go inside a cabinet (an oven or a microwave in a column, an integrated fridge).
BUILT_IN_KINDS = (RoomAppliance.KIND_OVEN, RoomAppliance.KIND_MICROWAVE, RoomAppliance.KIND_FRIDGE)
#: How far a built-in appliance may stand out of its cabinet (mm): its front, a rounding of the positions.
BUILT_IN_TOLERANCE = 30.0


def is_built_in(appliance: RoomAppliance, item: ProjectItem) -> bool:
    """True when the appliance is of a kind that is built in and stands inside the cabinet, seen from above and in height."""
    if appliance.kind not in BUILT_IN_KINDS:
        return False
    a, c = appliance_bbox(appliance), item_bbox(item)
    t = BUILT_IN_TOLERANCE
    inside_plan = a[0] >= c[0] - t and a[1] >= c[1] - t and a[2] <= c[2] + t and a[3] <= c[3] + t
    low, high = _appliance_vertical_range(appliance)
    bottom, top = _vertical_range(item)
    return inside_plan and low >= bottom - t and high <= top + t


def _built_in_item_id(appliance: RoomAppliance, items) -> Optional[int]:
    """The placed cabinet the appliance is built into, if any (the 3D view opens its doors there)."""
    return next((item.pk for item in items if is_built_in(appliance, item)), None)


def _vertical_overlap(
    first: Tuple[float, float], second: Tuple[float, float]
) -> bool:
    return not (first[1] <= second[0] or second[1] <= first[0])


def _rect_offsets(
    width: float, depth: float, rotation: float
) -> Tuple[float, float, float, float]:
    """Offsets (gauche, droite, haut, bas) de la boîte englobante alignée sur les axes."""
    radians = math.radians(float(rotation) % 360.0)
    cos, sin = math.cos(radians), math.sin(radians)
    points = []
    for lx, ly in ((0.0, 0.0), (width, 0.0), (width, depth), (0.0, depth)):
        points.append((lx * cos - ly * sin, lx * sin + ly * cos))
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), max(xs), min(ys), max(ys)


def _resolve_plan_position(
    project: Project,
    pos_x: float,
    pos_y: float,
    width: float,
    depth: float,
    rotation: float,
    elevation: float,
    height: float,
    exclude_item: Optional[int] = None,
    exclude_appliance: Optional[int] = None,
) -> Tuple[float, float]:
    """Pousse une position hors des chevauchements horizontaux.

    Ne repousse que les objets qui partagent la même plage verticale : un meuble
    haut au-dessus d'un meuble bas n'est pas considéré comme un chevauchement.
    """
    left, right, top, bottom = _rect_offsets(width, depth, rotation)
    x = float(pos_x)
    y = float(pos_y)
    for _ in range(3):
        moved = False
        for other in project.items.select_related("cabinet").all():
            if other.pk == exclude_item:
                continue
            if not _vertical_overlap(
                _vertical_range_values(elevation, height), _vertical_range(other)
            ):
                continue
            o_left, o_right, o_top, o_bottom = _rect_offsets(
                float(other.cabinet.width),
                float(other.cabinet.depth),
                float(other.rotation),
            )
            tx1 = float(other.pos_x) + o_left
            tx2 = float(other.pos_x) + o_right
            ty1 = float(other.pos_y) + o_top
            ty2 = float(other.pos_y) + o_bottom
            overlap_x = min(x + right, tx2) - max(x + left, tx1)
            overlap_y = min(y + bottom, ty2) - max(y + top, ty1)
            if overlap_x <= 0 or overlap_y <= 0:
                continue
            if overlap_x < overlap_y:
                push_left = (x + right) - tx1
                push_right = tx2 - (x + left)
                x += -push_left if push_left < push_right else push_right
            else:
                push_up = (y + bottom) - ty1
                push_down = ty2 - (y + top)
                y += -push_up if push_up < push_down else push_down
            moved = True
        for appliance in project.appliances.all():
            if appliance.pk == exclude_appliance:
                continue
            a_bottom = float(appliance.elevation) + float(appliance.height)
            if elevation >= a_bottom or elevation + height <= float(appliance.elevation):
                continue
            o_left, o_right, o_top, o_bottom = _rect_offsets(
                float(appliance.width),
                float(appliance.depth),
                float(appliance.rotation),
            )
            tx1 = float(appliance.pos_x) + o_left
            tx2 = float(appliance.pos_x) + o_right
            ty1 = float(appliance.pos_y) + o_top
            ty2 = float(appliance.pos_y) + o_bottom
            overlap_x = min(x + right, tx2) - max(x + left, tx1)
            overlap_y = min(y + bottom, ty2) - max(y + top, ty1)
            if overlap_x <= 0 or overlap_y <= 0:
                continue
            if overlap_x < overlap_y:
                push_left = (x + right) - tx1
                push_right = tx2 - (x + left)
                x += -push_left if push_left < push_right else push_right
            else:
                push_up = (y + bottom) - ty1
                push_down = ty2 - (y + top)
                y += -push_up if push_up < push_down else push_down
            moved = True
        if not moved:
            break
    return x, y


def _is_base_cabinet(item: ProjectItem) -> bool:
    """Caisson bas susceptible de porter un plan de travail."""
    cabinet = item.cabinet
    return (
        float(item.elevation) <= 5.0
        and 500.0 <= float(cabinet.height) <= 1000.0
        and float(cabinet.depth) >= 300.0
    )


def _occupied_bboxes(
    project: Project, elevation: float, height: float
) -> List[Tuple[float, float, float, float]]:
    """Emprises déjà occupées à une plage verticale donnée."""
    candidate_range = _vertical_range_values(elevation, height)
    bboxes: List[Tuple[float, float, float, float]] = []
    for item in project.items.select_related("cabinet").all():
        if not height or _vertical_overlap(candidate_range, _vertical_range(item)):
            bboxes.append(item_bbox(item))
    for appliance in project.appliances.all():
        if not height or _vertical_overlap(
            candidate_range, _appliance_vertical_range(appliance)
        ):
            bboxes.append(appliance_bbox(appliance))
    return bboxes


def auto_place_object(
    project: Project,
    width: float,
    depth: float,
    height: float = 0.0,
    elevation: float = 0.0,
) -> Tuple[float, float, float]:
    """Cherche une place libre le long des murs, puis au centre de la pièce.

    Les objets ne bloquent la recherche que si leurs plages verticales se
    recouvrent : un meuble haut peut ainsi se poser au-dessus d'un meuble bas.
    Les appareils participent aux collisions au même titre que les caissons.
    """
    walls = ensure_room(project)
    existing = _occupied_bboxes(project, elevation, height)
    gap = max(float(project.gap), 0.0) + 20.0

    for wall in walls:
        length = wall_length(wall)
        if length < width + 100:
            continue
        angle = wall_angle(wall)
        direction = (
            (wall.x2 - wall.x1) / length,
            (wall.y2 - wall.y1) / length,
        )
        position = 100.0
        while position + width <= length - 50:
            x = wall.x1 + direction[0] * position
            y = wall.y1 + direction[1] * position
            candidate = _candidate_bbox(x, y, width, depth, angle)
            if not any(_bbox_overlap(candidate, bbox, gap) for bbox in existing):
                return x, y, angle
            position += 50.0

    # Repli : grille au centre de la pièce, orientation 0.
    step = 300.0
    y = 100.0
    while y + depth <= float(project.room_depth) - 100:
        x = 100.0
        while x + width <= float(project.room_width) - 100:
            candidate = _candidate_bbox(x, y, width, depth, 0.0)
            if not any(_bbox_overlap(candidate, bbox, gap) for bbox in existing):
                return x, y, 0.0
            x += step
        y += step
    return 100.0, 100.0, 0.0


def auto_place_cabinet(
    project: Project,
    width: float,
    depth: float,
    height: float = 0.0,
    elevation: float = 0.0,
) -> Tuple[float, float, float]:
    return auto_place_object(project, width, depth, height, elevation)


# ----------------------------------------------------------------------
# Plans de travail et appareils
# ----------------------------------------------------------------------
def worktop_surface_height(project: Project) -> float:
    """Hauteur de la face supérieure du plan de travail (mm)."""
    explicit = list(project.worktops.all())
    if explicit:
        return max(float(worktop.elevation) for worktop in explicit)
    bases = [
        item
        for item in project.items.select_related("cabinet").all()
        if _is_base_cabinet(item)
    ]
    if not bases:
        return 900.0
    return max(float(item.cabinet.height) for item in bases) + max(
        10.0, float(project.worktop_thickness)
    )


def dressing_stats(project: Project) -> Dict:
    """Linéaire de penderie et hauteurs de tringles d'une affaire."""
    cabinets = [
        item.cabinet
        for item in project.items.select_related("cabinet").all()
    ]
    rail_cabinets = [cabinet for cabinet in cabinets if cabinet.has_hanging_rail]
    heights = [float(cabinet.hanging_rail_height) for cabinet in rail_cabinets]
    return {
        "cabinet_count": len(cabinets),
        "rail_count": len(rail_cabinets),
        "rail_length_m": round(
            sum(float(cabinet.width) for cabinet in rail_cabinets) / 1000.0, 2
        ),
        "rail_height_min": round(min(heights), 0) if heights else 0,
        "rail_height_max": round(max(heights), 0) if heights else 0,
    }


def _worktop_payload(worktop: RoomWorktop) -> Dict:
    width = float(worktop.width)
    depth = float(worktop.depth)
    rotation = float(worktop.rotation)
    elevation = float(worktop.elevation)
    thickness = float(worktop.thickness)
    corners = _rect_corners(
        float(worktop.pos_x), float(worktop.pos_y), width, depth, rotation
    )
    return {
        "id": worktop.pk,
        "name": worktop.name or "Plan de travail",
        "rotation": round(rotation, 2),
        "pos_x": round(float(worktop.pos_x), 2),
        "pos_y": round(float(worktop.pos_y), 2),
        "width": round(width, 2),
        "depth": round(depth, 2),
        "height": round(elevation - thickness, 2),
        "surface": round(elevation, 2),
        "elevation": round(elevation, 2),
        "thickness": round(thickness, 2),
        "color": worktop.color or "#d9d2c5",
        "explicit": True,
        "corners": [[round(x, 2), round(y, 2)] for x, y in corners],
    }


def compute_worktops(project: Project) -> List[Dict]:
    """Plans de travail : explicites (``RoomWorktop``) sinon déduits des caissons bas.

    Un plan de travail explicite ne suit pas les caissons : il reste seul et se
    redimensionne librement (longueur, profondeur, épaisseur). À défaut, le plan
    est déduit des caissons bas (élévation nulle, hauteur 500 à 1000 mm),
    fusionnés par rangée pour éviter les joints artificiels.
    """
    explicit = list(project.worktops.all())
    if explicit:
        return [_worktop_payload(worktop) for worktop in explicit]

    bases = [
        item
        for item in project.items.select_related("cabinet").all()
        if _is_base_cabinet(item)
    ]
    if not bases:
        return []

    overhang = max(0.0, float(project.worktop_overhang))
    thickness = max(10.0, float(project.worktop_thickness))
    groups: Dict[float, List[ProjectItem]] = {}
    for item in bases:
        key = round(float(item.rotation) % 360.0, 1)
        groups.setdefault(key, []).append(item)

    worktops: List[Dict] = []
    for rotation in sorted(groups):
        radians = math.radians(rotation)
        ux, uy = math.cos(radians), math.sin(radians)
        nx, ny = -uy, ux
        rectangles: List[Dict] = []
        for item in groups[rotation]:
            local_x = float(item.pos_x) * ux + float(item.pos_y) * uy
            local_y = float(item.pos_x) * nx + float(item.pos_y) * ny
            rectangles.append(
                {
                    "x0": local_x - overhang,
                    "x1": local_x + float(item.cabinet.width) + overhang,
                    "y0": local_y,
                    "y1": local_y + float(item.cabinet.depth) + overhang,
                    "height": float(item.cabinet.height),
                }
            )

        rectangles.sort(key=lambda row: (row["y0"], row["x0"]))
        merged: List[Dict] = []
        for rectangle in rectangles:
            target = None
            for candidate in merged:
                if (
                    abs(candidate["y0"] - rectangle["y0"]) <= 30.0
                    and abs(candidate["y1"] - rectangle["y1"]) <= 30.0
                    and rectangle["x0"] <= candidate["x1"] + 50.0
                    and rectangle["x1"] >= candidate["x0"] - 50.0
                ):
                    target = candidate
                    break
            if target is None:
                merged.append(dict(rectangle))
                continue
            target["x0"] = min(target["x0"], rectangle["x0"])
            target["x1"] = max(target["x1"], rectangle["x1"])
            target["y0"] = min(target["y0"], rectangle["y0"])
            target["y1"] = max(target["y1"], rectangle["y1"])
            target["height"] = max(target["height"], rectangle["height"])

        for index, rectangle in enumerate(merged):
            corners = []
            for lx, ly in (
                (rectangle["x0"], rectangle["y0"]),
                (rectangle["x1"], rectangle["y0"]),
                (rectangle["x1"], rectangle["y1"]),
                (rectangle["x0"], rectangle["y1"]),
            ):
                corners.append((lx * ux + ly * nx, lx * uy + ly * ny))
            worktops.append(
                {
                    "id": f"worktop-{rotation:g}-{index}",
                    "name": "Plan de travail",
                    "rotation": round(rotation, 2),
                    "height": round(rectangle["height"], 2),
                    "surface": round(rectangle["height"] + thickness, 2),
                    "thickness": round(thickness, 2),
                    "color": project.worktop_color or "#d9d2c5",
                    "corners": [
                        [round(x, 2), round(y, 2)] for x, y in corners
                    ],
                }
            )
    return worktops


def _worktop_appliance_position(
    project: Project,
    width: float,
    depth: float,
    height: float,
    elevation: float,
) -> Optional[Tuple[float, float, float]]:
    """Pose un évier ou une plaque au centre d'un caisson bas libre."""
    overhang = max(0.0, float(project.worktop_overhang))
    for item in project.items.select_related("cabinet").order_by("slot", "id"):
        if not _is_base_cabinet(item):
            continue
        cabinet = item.cabinet
        if (
            float(cabinet.width) + 2.0 * overhang < width
            or float(cabinet.depth) + overhang < depth
        ):
            continue
        rotation = float(item.rotation) % 360.0
        radians = math.radians(rotation)
        ux, uy = math.cos(radians), math.sin(radians)
        nx, ny = -uy, ux
        offset_x = max(0.0, (float(cabinet.width) - width) / 2.0)
        offset_y = max(0.0, float(cabinet.depth) - depth - 50.0)
        x = float(item.pos_x) + ux * offset_x + nx * offset_y
        y = float(item.pos_y) + uy * offset_x + ny * offset_y
        candidate = _candidate_bbox(x, y, width, depth, rotation)
        occupied = _occupied_bboxes(project, elevation, height)
        if not any(_bbox_overlap(candidate, bbox, 0.0) for bbox in occupied):
            return x, y, rotation
    return None


def _hood_position(
    project: Project,
    width: float,
    depth: float,
    height: float,
    elevation: float,
) -> Optional[Tuple[float, float, float]]:
    """Centre une hotte au-dessus d'une plaque existante."""
    for hob in project.appliances.filter(
        kind=RoomAppliance.KIND_HOB
    ).order_by("id"):
        if width + 50.0 < float(hob.width) or depth + 50.0 < float(hob.depth):
            continue
        rotation = float(hob.rotation) % 360.0
        radians = math.radians(rotation)
        ux, uy = math.cos(radians), math.sin(radians)
        nx, ny = -uy, ux
        center_x = (
            float(hob.pos_x)
            + ux * float(hob.width) / 2.0
            + nx * float(hob.depth) / 2.0
        )
        center_y = (
            float(hob.pos_y)
            + uy * float(hob.width) / 2.0
            + ny * float(hob.depth) / 2.0
        )
        x = center_x - ux * width / 2.0 - nx * depth / 2.0
        y = center_y - uy * width / 2.0 - ny * depth / 2.0
        candidate = _candidate_bbox(x, y, width, depth, rotation)
        occupied = _occupied_bboxes(project, elevation, height)
        if not any(_bbox_overlap(candidate, bbox, 0.0) for bbox in occupied):
            return x, y, rotation
    return None


def _attach_appliance_to_item(
    project: Project,
    item: ProjectItem,
    width: float,
    depth: float,
    height: float,
    kind: str,
) -> Tuple[float, float, float, float]:
    """Centre un appareil sur un caisson sélectionné (évier, four, micro-ondes…).

    Renvoie ``(x, y, rotation, elevation)``. Un évier/plaque se pose sur le plan
    de travail ; un four ou micro-ondes se centre dans la hauteur du caisson.
    """
    cabinet = item.cabinet
    rotation = float(item.rotation) % 360.0
    radians = math.radians(rotation)
    ux, uy = math.cos(radians), math.sin(radians)
    nx, ny = -uy, ux
    center_x = (
        float(item.pos_x)
        + ux * float(cabinet.width) / 2.0
        + nx * float(cabinet.depth) / 2.0
    )
    center_y = (
        float(item.pos_y)
        + uy * float(cabinet.width) / 2.0
        + ny * float(cabinet.depth) / 2.0
    )
    x = center_x - ux * width / 2.0 - nx * depth / 2.0
    y = center_y - uy * width / 2.0 - ny * depth / 2.0
    if kind in RoomAppliance.WORKTOP_KINDS:
        elevation = worktop_surface_height(project)
    else:
        elevation = max(
            0.0,
            float(item.elevation) + max(0.0, (float(cabinet.height) - height) / 2.0),
        )
    return x, y, rotation, elevation


def add_appliance_to_room(
    project: Project, preset: Dict, cabinet_id: Optional[int] = None
) -> RoomAppliance:
    """Crée un appareil à partir d'un preset et le pose dans la pièce."""
    ensure_room(project)
    kind = (
        preset.get("kind")
        if preset.get("kind") in dict(RoomAppliance.KIND_CHOICES)
        else RoomAppliance.KIND_OTHER
    )
    width = max(50.0, float(preset.get("width") or 600))
    depth = max(50.0, float(preset.get("depth") or 560))
    height = max(10.0, float(preset.get("height") or 600))
    default_elevation = preset.get("default_elevation")
    if default_elevation is None:
        elevation = (
            worktop_surface_height(project)
            if kind in RoomAppliance.WORKTOP_KINDS
            else 0.0
        )
    else:
        elevation = max(0.0, float(default_elevation))

    position = None
    if cabinet_id:
        item = (
            project.items.filter(pk=cabinet_id)
            .select_related("cabinet")
            .first()
        )
        if item is not None:
            x, y, rotation, elevation = _attach_appliance_to_item(
                project, item, width, depth, height, kind
            )
            position = (x, y, rotation)

    if position is None:
        if kind == RoomAppliance.KIND_HOOD:
            position = _hood_position(project, width, depth, height, elevation)
        elif kind in RoomAppliance.WORKTOP_KINDS:
            position = _worktop_appliance_position(
                project, width, depth, height, elevation
            )
    if position is None:
        position = auto_place_object(project, width, depth, height, elevation)
    x, y, rotation = position
    return RoomAppliance.objects.create(
        project=project,
        kind=kind,
        name=str(preset.get("name") or "")[:80],
        width=width,
        depth=depth,
        height=height,
        pos_x=x,
        pos_y=y,
        rotation=rotation,
        elevation=elevation,
        price=max(0.0, float(preset.get("price") or 0)),
    )


def update_appliance(appliance: RoomAppliance, data: Dict) -> RoomAppliance:
    if "name" in data:
        appliance.name = str(data.get("name") or "")[:80]
    appliance.pos_x = _number(data, "pos_x", appliance.pos_x, -100_000)
    appliance.pos_y = _number(data, "pos_y", appliance.pos_y, -100_000)
    appliance.rotation = _number(data, "rotation", appliance.rotation, -3600) % 360.0
    appliance.elevation = _number(data, "elevation", appliance.elevation, 0)
    appliance.width = _number(data, "width", appliance.width, 50)
    appliance.depth = _number(data, "depth", appliance.depth, 50)
    appliance.height = _number(data, "height", appliance.height, 10)
    appliance.price = _number(data, "price", appliance.price, 0)
    appliance.pos_x, appliance.pos_y = _resolve_plan_position(
        appliance.project,
        appliance.pos_x,
        appliance.pos_y,
        float(appliance.width),
        float(appliance.depth),
        float(appliance.rotation),
        float(appliance.elevation),
        float(appliance.height),
        exclude_appliance=appliance.pk,
    )
    appliance.save()
    return appliance


def next_slot(project: Project) -> int:
    current = project.items.order_by("-slot").values_list("slot", flat=True).first()
    return (current or 0) + 1 if project.items.exists() else 0


def add_cabinet_to_room(
    project: Project, cabinet: Cabinet, elevation: float = 0.0
) -> ProjectItem:
    ensure_room(project)
    x, y, rotation = auto_place_cabinet(
        project,
        float(cabinet.width),
        float(cabinet.depth),
        height=float(cabinet.height),
        elevation=max(0.0, float(elevation)),
    )
    x, y = _resolve_plan_position(
        project,
        x,
        y,
        float(cabinet.width),
        float(cabinet.depth),
        float(rotation),
        max(0.0, float(elevation)),
        float(cabinet.height),
    )
    return ProjectItem.objects.create(
        project=project,
        cabinet=cabinet,
        slot=next_slot(project),
        offset_x=0,
        pos_x=x,
        pos_y=y,
        rotation=rotation,
        elevation=max(0.0, float(elevation)),
    )


# ----------------------------------------------------------------------
# Prix
# ----------------------------------------------------------------------
def project_price_summary(project: Project) -> Dict:
    """Résumé de prix cohérent avec le devis PDF d'affaire."""
    items = list(
        project.items.select_related(
            "cabinet", "cabinet__material_carcase"
        ).order_by("slot", "id")
    )
    lines = []
    materials_total = 0.0
    hardware_total = 0.0
    for item in items:
        cabinet = item.cabinet
        quote = getattr(cabinet, "quote", None)
        if quote is not None:
            materials = float(quote.subtotal_materials)
            hardware = float(quote.subtotal_hardware)
        else:
            materials = sum(float(panel.cost) for panel in cabinet.panels.all())
            hardware = 0.0
        subtotal = materials + hardware
        materials_total += materials
        hardware_total += hardware
        lines.append(
            {
                "item_id": item.pk,
                "cabinet_id": cabinet.pk,
                "name": cabinet.name,
                "materials": round(materials, 2),
                "hardware": round(hardware, 2),
                "total": round(subtotal, 2),
            }
        )
    cost = materials_total + hardware_total
    appliances = list(project.appliances.all())
    appliance_lines = [
        {
            "id": appliance.pk,
            "kind": appliance.kind,
            "kind_label": appliance.get_kind_display(),
            "name": str(appliance),
            "price": round(float(appliance.price), 2),
        }
        for appliance in appliances
    ]
    appliances_total = sum(float(appliance.price) for appliance in appliances)
    cost += appliances_total
    margin = cost * float(project.margin_percent) / 100.0
    total_ht = cost + margin
    tax = total_ht * float(project.tax_rate) / 100.0
    return {
        "lines": lines,
        "appliance_lines": appliance_lines,
        "materials": round(materials_total, 2),
        "hardware": round(hardware_total, 2),
        "appliances": round(appliances_total, 2),
        "cost": round(cost, 2),
        "margin_percent": float(project.margin_percent),
        "margin": round(margin, 2),
        "total_ht": round(total_ht, 2),
        "tax_rate": float(project.tax_rate),
        "tax": round(tax, 2),
        "total_ttc": round(total_ht + tax, 2),
        "cabinet_count": len(items),
        "appliance_count": len(appliances),
    }


# ----------------------------------------------------------------------
# Payload
# ----------------------------------------------------------------------
def _wall_payload(wall: RoomWall) -> Dict:
    return {
        "id": wall.pk,
        "index": wall.index,
        "name": wall.name or f"Mur {wall.index + 1}",
        "x1": round(float(wall.x1), 2),
        "y1": round(float(wall.y1), 2),
        "x2": round(float(wall.x2), 2),
        "y2": round(float(wall.y2), 2),
        "height": round(float(wall.height), 2),
        "thickness": round(float(wall.thickness), 2),
        "length": round(wall_length(wall), 2),
        "angle": round(wall_angle(wall), 2),
    }


def _opening_payload(opening: RoomOpening) -> Dict:
    return {
        "id": opening.pk,
        "wall_id": opening.wall_id,
        "kind": opening.kind,
        "kind_label": opening.get_kind_display(),
        "name": opening.name or opening.get_kind_display(),
        "offset": round(float(opening.offset), 2),
        "width": round(float(opening.width), 2),
        "height": round(float(opening.height), 2),
        "sill": round(float(opening.sill), 2),
    }


def _item_payload(item: ProjectItem) -> Dict:
    cabinet = item.cabinet
    quote = getattr(cabinet, "quote", None)
    if quote is not None:
        # Même base que les lignes du résumé d'affaire : matières + quincaillerie.
        price = float(quote.subtotal_materials) + float(quote.subtotal_hardware)
    else:
        price = sum(float(panel.cost) for panel in cabinet.panels.all())
    return {
        "id": item.pk,
        "cabinet_id": cabinet.pk,
        "name": cabinet.name,
        "width": round(float(cabinet.width), 2),
        "height": round(float(cabinet.height), 2),
        "depth": round(float(cabinet.depth), 2),
        "pos_x": round(float(item.pos_x), 2),
        "pos_y": round(float(item.pos_y), 2),
        "rotation": round(float(item.rotation) % 360.0, 2),
        "elevation": round(float(item.elevation), 2),
        "has_doors": bool(cabinet.has_doors),
        "door_thickness": round(float(cabinet.door_thickness), 2),
        "door_gap": round(float(cabinet.door_gap), 2),
        "has_drawers": bool(cabinet.has_drawers),
        "drawer_count": int(cabinet.drawer_count),
        "drawer_height": round(float(cabinet.drawer_height), 2),
        "has_hanging_rail": bool(cabinet.has_hanging_rail),
        "hanging_rail_height": round(float(cabinet.hanging_rail_height), 2),
        "plinth_height": round(float(cabinet.plinth_height), 2),
        "color": cabinet.material_carcase.color or "#ffffff",
        "material": cabinet.material_carcase.name,
        "material_category": cabinet.material_carcase.category or "solid",
        "price": round(price, 2),
        "corners": [
            [round(x, 2), round(y, 2)] for x, y in item_corners(item)
        ],
    }


APPLIANCE_COLORS = {
    RoomAppliance.KIND_SINK: "#cbd5e1",
    RoomAppliance.KIND_HOB: "#1f2937",
    RoomAppliance.KIND_HOOD: "#94a3b8",
    RoomAppliance.KIND_OVEN: "#475569",
    RoomAppliance.KIND_FRIDGE: "#e2e8f0",
    RoomAppliance.KIND_DISHWASHER: "#cbd5e1",
    RoomAppliance.KIND_MICROWAVE: "#64748b",
    RoomAppliance.KIND_WASHING_MACHINE: "#e2e8f0",
    RoomAppliance.KIND_OTHER: "#d1d5db",
}


def _appliance_payload(appliance: RoomAppliance) -> Dict:
    return {
        "id": appliance.pk,
        "kind": appliance.kind,
        "kind_label": appliance.get_kind_display(),
        "name": str(appliance),
        "width": round(float(appliance.width), 2),
        "depth": round(float(appliance.depth), 2),
        "height": round(float(appliance.height), 2),
        "pos_x": round(float(appliance.pos_x), 2),
        "pos_y": round(float(appliance.pos_y), 2),
        "rotation": round(float(appliance.rotation) % 360.0, 2),
        "elevation": round(float(appliance.elevation), 2),
        "price": round(float(appliance.price), 2),
        "color": APPLIANCE_COLORS.get(
            appliance.kind, APPLIANCE_COLORS[RoomAppliance.KIND_OTHER]
        ),
        "corners": [
            [round(x, 2), round(y, 2)]
            for x, y in appliance_corners(appliance)
        ],
    }


def _version_payload(version: ProjectVersion) -> Dict:
    return {
        "id": version.pk,
        "name": version.name,
        "note": version.note,
        "created_at": version.created_at.isoformat(),
        "created_label": version.created_at.strftime("%d/%m/%Y à %H:%M"),
        "item_count": len((version.payload or {}).get("items") or []),
    }


def _bbox_distance(
    a: Tuple[float, float, float, float],
    b: Tuple[float, float, float, float],
) -> float:
    dx = max(0.0, b[0] - a[2], a[0] - b[2])
    dy = max(0.0, b[1] - a[3], a[1] - b[3])
    return math.hypot(dx, dy)


def _front_clearance_bbox(
    appliance: RoomAppliance, clearance: float
) -> Tuple[float, float, float, float]:
    rotation = float(appliance.rotation)
    radians = math.radians(rotation)
    ux, uy = math.cos(radians), math.sin(radians)
    nx, ny = -uy, ux
    depth = float(appliance.depth)
    width = float(appliance.width)
    local = [
        (0.0, depth),
        (width, depth),
        (width, depth + clearance),
        (0.0, depth + clearance),
    ]
    points = [
        (
            float(appliance.pos_x) + lx * ux + ly * nx,
            float(appliance.pos_y) + lx * uy + ly * ny,
        )
        for lx, ly in local
    ]
    return _bbox_from_corners(points)


def _worktop_contains(
    worktops: List[Dict], x: float, y: float
) -> bool:
    for worktop in worktops:
        polygon = [(float(px), float(py)) for px, py in worktop["corners"]]
        if _point_in_polygon(x, y, polygon):
            return True
    return False


def _cm_value(value: float) -> str:
    centimeters = float(value) / 10.0
    if abs(centimeters - round(centimeters)) < 0.05:
        return f"{centimeters:.0f}"
    return f"{centimeters:.1f}".replace(".", ",")


def project_warnings(project: Project) -> List[Dict]:
    warnings: List[Dict] = []
    walls = {wall.pk: wall for wall in project.walls.all()}
    for opening in project.openings.select_related("wall").all():
        wall = walls.get(opening.wall_id)
        if wall is None:
            continue
        length = wall_length(wall)
        if float(opening.offset) + float(opening.width) > length + 1:
            warnings.append(
                {
                    "level": "warning",
                    "message": (
                        f"L'ouverture « {opening} » dépasse du mur "
                        f"{wall.name or wall.index + 1}."
                    ),
                }
            )
        if float(opening.sill) + float(opening.height) > float(wall.height) + 1:
            warnings.append(
                {
                    "level": "warning",
                    "message": (
                        f"L'ouverture « {opening} » dépasse la hauteur du mur "
                        f"{wall.name or wall.index + 1}."
                    ),
                }
            )

    items = list(project.items.select_related("cabinet").all())
    appliances = list(project.appliances.all())
    worktops = compute_worktops(project)
    polygon = room_polygon(project)
    for item in items:
        if polygon:
            outside = any(
                not _point_in_polygon(x, y, polygon)
                for x, y in item_corners(item)
            )
        else:
            bbox = item_bbox(item)
            outside = (
                bbox[0] < -1
                or bbox[1] < -1
                or bbox[2] > float(project.room_width) + 1
                or bbox[3] > float(project.room_depth) + 1
            )
        if outside:
            warnings.append(
                {
                    "level": "warning",
                    "message": f"Le caisson « {item.cabinet.name} » sort de la pièce.",
                }
            )
    for index, item in enumerate(items):
        bbox = item_bbox(item)
        item_range = _vertical_range(item)
        for other in items[index + 1 :]:
            if _bbox_overlap(bbox, item_bbox(other), 0.0) and _vertical_overlap(
                item_range, _vertical_range(other)
            ):
                warnings.append(
                    {
                        "level": "warning",
                        "message": (
                            f"Les caissons « {item.cabinet.name} » et "
                            f"« {other.cabinet.name} » se chevauchent."
                        ),
                    }
                )

    # --- Appareils ----------------------------------------------------
    for appliance in appliances:
        if polygon:
            outside = any(
                not _point_in_polygon(x, y, polygon)
                for x, y in appliance_corners(appliance)
            )
        else:
            bbox = appliance_bbox(appliance)
            outside = (
                bbox[0] < -1
                or bbox[1] < -1
                or bbox[2] > float(project.room_width) + 1
                or bbox[3] > float(project.room_depth) + 1
            )
        if outside:
            warnings.append(
                {
                    "level": "warning",
                    "message": f"L'appareil « {appliance} » sort de la pièce.",
                }
            )

    for appliance in appliances:
        appliance_box = appliance_bbox(appliance)
        appliance_range = _appliance_vertical_range(appliance)
        for item in items:
            # An oven, a microwave or a fridge inside a cabinet is built in (a column for the oven), not in its way.
            if is_built_in(appliance, item):
                continue
            if _bbox_overlap(
                appliance_box, item_bbox(item), 0.0
            ) and _vertical_overlap(appliance_range, _vertical_range(item)):
                warnings.append(
                    {
                        "level": "warning",
                        "message": (
                            f"L'appareil « {appliance} » chevauche le caisson "
                            f"« {item.cabinet.name} »."
                        ),
                    }
                )
                break

    for index, appliance in enumerate(appliances):
        appliance_box = appliance_bbox(appliance)
        appliance_range = _appliance_vertical_range(appliance)
        for other in appliances[index + 1 :]:
            if _bbox_overlap(
                appliance_box, appliance_bbox(other), 0.0
            ) and _vertical_overlap(
                appliance_range, _appliance_vertical_range(other)
            ):
                warnings.append(
                    {
                        "level": "warning",
                        "message": (
                            f"Les appareils « {appliance} » et « {other} » "
                            "se chevauchent."
                        ),
                    }
                )

    hobs = [
        appliance
        for appliance in appliances
        if appliance.kind == RoomAppliance.KIND_HOB
    ]
    hoods = [
        appliance
        for appliance in appliances
        if appliance.kind == RoomAppliance.KIND_HOOD
    ]
    sinks = [
        appliance
        for appliance in appliances
        if appliance.kind == RoomAppliance.KIND_SINK
    ]

    # Un évier ou une plaque doit reposer sur un plan de travail.
    for appliance in appliances:
        if appliance.kind not in RoomAppliance.WORKTOP_KINDS:
            continue
        bbox = appliance_bbox(appliance)
        center_x = (bbox[0] + bbox[2]) / 2.0
        center_y = (bbox[1] + bbox[3]) / 2.0
        if not _worktop_contains(worktops, center_x, center_y):
            warnings.append(
                {
                    "level": "warning",
                    "message": (
                        f"L'appareil « {appliance} » n'est pas posé sur un "
                        "plan de travail."
                    ),
                }
            )

    # Hauteur de hotte : 60 cm minimum, 65 à 75 cm recommandés.
    for hood in hoods:
        hood_box = appliance_bbox(hood)
        candidates = [
            hob
            for hob in hobs
            if _bbox_overlap(hood_box, appliance_bbox(hob), 0.0)
        ]
        if not candidates:
            warnings.append(
                {
                    "level": "warning",
                    "message": (
                        f"La hotte « {hood} » n'est au-dessus d'aucune "
                        "plaque de cuisson."
                    ),
                }
            )
            continue
        hob = candidates[0]
        clearance = float(hood.elevation) - (
            float(hob.elevation) + float(hob.height)
        )
        if clearance < 600.0:
            warnings.append(
                {
                    "level": "warning",
                    "message": (
                        f"La hotte « {hood} » est trop basse au-dessus de la "
                        f"plaque ({_cm_value(clearance)} cm, minimum 60 cm)."
                    ),
                }
            )
        elif clearance > 800.0:
            warnings.append(
                {
                    "level": "warning",
                    "message": (
                        f"La hotte « {hood} » est trop haute au-dessus de la "
                        f"plaque ({_cm_value(clearance)} cm, recommandé 65 à "
                        "75 cm)."
                    ),
                }
            )

    # Distance minimale entre l'évier et la plaque.
    for hob in hobs:
        for sink in sinks:
            distance = _bbox_distance(
                appliance_bbox(hob), appliance_bbox(sink)
            )
            if distance < 600.0:
                warnings.append(
                    {
                        "level": "warning",
                        "message": (
                            f"La plaque « {hob} » est trop proche de l'évier "
                            f"« {sink} » ({_cm_value(distance)} cm, minimum "
                            "60 cm)."
                        ),
                    }
                )

    # Dégagement frontal des appareils qui s'ouvrent.
    for appliance in appliances:
        if appliance.kind not in RoomAppliance.ACCESS_KINDS:
            continue
        zone = _front_clearance_bbox(appliance, 800.0)
        blocked = False
        for item in items:
            if _bbox_overlap(
                zone, item_bbox(item), 0.0
            ) and _vertical_overlap(
                _appliance_vertical_range(appliance), _vertical_range(item)
            ):
                blocked = True
                break
        if not blocked:
            for other in appliances:
                if other.pk == appliance.pk:
                    continue
                if _bbox_overlap(
                    zone, appliance_bbox(other), 0.0
                ) and _vertical_overlap(
                    _appliance_vertical_range(appliance),
                    _appliance_vertical_range(other),
                ):
                    blocked = True
                    break
        if blocked:
            warnings.append(
                {
                    "level": "warning",
                    "message": (
                        f"Le dégagement devant « {appliance} » est inférieur "
                        "à 80 cm."
                    ),
                }
            )

    # Un meuble haut ne doit pas descendre trop près d'une plaque.
    for hob in hobs:
        hob_top = float(hob.elevation) + float(hob.height)
        hob_box = appliance_bbox(hob)
        for item in items:
            if float(item.elevation) <= 0.5:
                continue
            if not _bbox_overlap(hob_box, item_bbox(item), 0.0):
                continue
            clearance = float(item.elevation) - hob_top
            if 0.0 <= clearance < 450.0:
                warnings.append(
                    {
                        "level": "warning",
                        "message": (
                            f"Le meuble haut « {item.cabinet.name} » est trop "
                            f"bas au-dessus de la plaque ({_cm_value(clearance)}"
                            " cm, minimum 45 cm)."
                        ),
                    }
                )

    # --- Dressing -----------------------------------------------------
    if project.room_type == Project.ROOM_DRESSING:
        tall_cabinets = [
            item for item in items if float(item.cabinet.height) >= 1800
        ]
        rail_items = [
            item for item in tall_cabinets if item.cabinet.has_hanging_rail
        ]
        if tall_cabinets and not rail_items:
            warnings.append(
                {
                    "level": "warning",
                    "message": (
                        "Aucune tringle de penderie : les armoires hautes "
                        "n'offrent pas de linéaire suspendu."
                    ),
                }
            )
        for item in rail_items:
            cabinet = item.cabinet
            rail_height = float(cabinet.hanging_rail_height)
            if rail_height < 1700 or rail_height > 1900:
                warnings.append(
                    {
                        "level": "warning",
                        "message": (
                            f"La tringle de « {cabinet.name} » est à "
                            f"{_cm_value(rail_height)} cm ; hauteur "
                            "recommandée entre 170 et 190 cm."
                        ),
                    }
                )
            if rail_height > float(cabinet.height) - 50:
                warnings.append(
                    {
                        "level": "warning",
                        "message": (
                            f"La tringle de « {cabinet.name} » dépasse la "
                            "hauteur utile du caisson."
                        ),
                    }
                )
    return warnings


def room_payload(project: Project) -> Dict:
    ensure_room(project)
    walls = list(project.walls.all())
    openings = list(
        project.openings.select_related("wall").order_by("wall__index", "offset", "id")
    )
    items = list(
        project.items.select_related(
            "cabinet", "cabinet__material_carcase"
        ).order_by("slot", "id")
    )
    appliances = list(project.appliances.all())
    versions = list(project.versions.all()[:20])
    used_ids = {item.cabinet_id for item in items}
    available = [
        {
            "id": cabinet.pk,
            "name": cabinet.name,
            "width": round(float(cabinet.width), 2),
            "height": round(float(cabinet.height), 2),
            "depth": round(float(cabinet.depth), 2),
        }
        for cabinet in Cabinet.objects.exclude(pk__in=used_ids).order_by("name")
    ]
    worktops = compute_worktops(project)
    return {
        "project": {
            "id": project.pk,
            "name": project.name,
            "client_name": project.client_name,
            "room_type": project.room_type,
            "room_type_label": project.get_room_type_display(),
            "room_width": round(float(project.room_width), 2),
            "room_depth": round(float(project.room_depth), 2),
            "room_height": round(float(project.room_height), 2),
            "wall_thickness": round(float(project.wall_thickness), 2),
            "worktop_thickness": round(float(project.worktop_thickness), 2),
            "worktop_overhang": round(float(project.worktop_overhang), 2),
            "worktop_color": project.worktop_color or "#d9d2c5",
            "gap": round(float(project.gap), 2),
            "margin_percent": round(float(project.margin_percent), 2),
            "tax_rate": round(float(project.tax_rate), 2),
            "placement_mode": project.placement_mode,
            "updated_at": project.updated_at.isoformat(),
        },
        "walls": [_wall_payload(wall) for wall in walls],
        "openings": [_opening_payload(opening) for opening in openings],
        "items": [_item_payload(item) for item in items],
        "appliances": [
            {**_appliance_payload(appliance), "built_in_item_id": _built_in_item_id(appliance, items)}
            for appliance in appliances
        ],
        "dressing": dressing_stats(project),
        "worktops": worktops,
        "worktop": {
            "thickness": round(float(project.worktop_thickness), 2),
            "overhang": round(float(project.worktop_overhang), 2),
            "color": project.worktop_color or "#d9d2c5",
            "surface_height": round(worktop_surface_height(project), 2),
        },
        "presets": preset_payload(),
        "appliance_presets": appliance_preset_payload(),
        "available_cabinets": available,
        "summary": project_price_summary(project),
        "history": room_history_counts(project),
        "versions": [_version_payload(version) for version in versions],
        "warnings": project_warnings(project),
        "stats": {
            "area_m2": round(room_area_m2(project), 2),
            "wall_length": round(sum(wall_length(wall) for wall in walls), 0),
            "cabinet_count": len(items),
            "appliance_count": len(appliances),
            "opening_count": len(openings),
        },
    }


# ----------------------------------------------------------------------
# Murs / ouvertures
# ----------------------------------------------------------------------
def _number(data: Dict, key: str, default: float, minimum: float = 0.0) -> float:
    raw = data.get(key, default)
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Valeur invalide pour « {key} ».") from exc
    if not math.isfinite(value) or value < minimum:
        raise ValueError(f"Valeur invalide pour « {key} ».")
    return value


def _valid_hex_color(value: Optional[str]) -> bool:
    if not value or len(value) != 7 or not value.startswith("#"):
        return False
    return all(char in "0123456789abcdefABCDEF" for char in value[1:])


def add_worktop_to_room(project: Project, data: Dict) -> RoomWorktop:
    """Crée un plan de travail indépendant."""
    ensure_room(project)
    width = max(50.0, float(data.get("width") or 1000))
    depth = max(50.0, float(data.get("depth") or 600))
    thickness = max(
        10.0, float(data.get("thickness") or project.worktop_thickness)
    )
    elevation = max(
        0.0,
        float(data.get("elevation") or worktop_surface_height(project)),
    )
    pos_x = _number(
        data, "pos_x", (float(project.room_width) - width) / 2.0, -100_000
    )
    pos_y = _number(
        data, "pos_y", (float(project.room_depth) - depth) / 2.0, -100_000
    )
    rotation = _number(data, "rotation", 0.0, -3600) % 360.0
    color = str(data.get("color") or project.worktop_color or "#d9d2c5")
    if not _valid_hex_color(color):
        color = "#d9d2c5"
    return RoomWorktop.objects.create(
        project=project,
        name=str(data.get("name") or "Plan de travail")[:80],
        pos_x=pos_x,
        pos_y=pos_y,
        width=width,
        depth=depth,
        thickness=thickness,
        rotation=rotation,
        elevation=elevation,
        color=color,
    )


def update_worktop(worktop: RoomWorktop, data: Dict) -> RoomWorktop:
    """Met à jour un plan de travail indépendant."""
    if "name" in data:
        worktop.name = str(data.get("name") or "")[:80]
    worktop.pos_x = _number(data, "pos_x", worktop.pos_x, -100_000)
    worktop.pos_y = _number(data, "pos_y", worktop.pos_y, -100_000)
    worktop.width = _number(data, "width", worktop.width, 50)
    worktop.depth = _number(data, "depth", worktop.depth, 50)
    worktop.thickness = _number(data, "thickness", worktop.thickness, 10)
    worktop.rotation = _number(data, "rotation", worktop.rotation, -3600) % 360.0
    worktop.elevation = _number(data, "elevation", worktop.elevation, 0)
    if "color" in data and _valid_hex_color(str(data.get("color"))):
        worktop.color = str(data.get("color"))
    worktop.save()
    return worktop


def update_room(project: Project, data: Dict) -> Project:
    """Met à jour l'enveloppe de la pièce et redimensionne les murs."""
    old_width = float(project.room_width)
    old_depth = float(project.room_depth)
    old_height = float(project.room_height)
    old_thickness = float(project.wall_thickness)
    old_worktop_thickness = float(project.worktop_thickness)
    old_worktop_overhang = float(project.worktop_overhang)
    old_worktop_color = project.worktop_color or "#d9d2c5"
    old_worktop_surface = worktop_surface_height(project)

    if "room_type" in data and data["room_type"] in dict(Project.ROOM_TYPE_CHOICES):
        project.room_type = data["room_type"]
    width = _number(data, "room_width", old_width, 500)
    depth = _number(data, "room_depth", old_depth, 500)
    height = _number(data, "room_height", old_height, 500)
    thickness = _number(data, "wall_thickness", old_thickness, 10)
    worktop_thickness = _number(
        data, "worktop_thickness", old_worktop_thickness, 10
    )
    worktop_overhang = _number(
        data, "worktop_overhang", old_worktop_overhang, 0
    )
    worktop_color = str(data.get("worktop_color") or old_worktop_color)
    if (
        len(worktop_color) != 7
        or not worktop_color.startswith("#")
        or any(char not in "0123456789abcdefABCDEF" for char in worktop_color[1:])
    ):
        worktop_color = old_worktop_color
    project.room_width = width
    project.room_depth = depth
    project.room_height = height
    project.wall_thickness = thickness
    project.worktop_thickness = worktop_thickness
    project.worktop_overhang = worktop_overhang
    project.worktop_color = worktop_color
    project.placement_mode = Project.PLACEMENT_ROOM
    project.save(
        update_fields=[
            "room_type",
            "room_width",
            "room_depth",
            "room_height",
            "wall_thickness",
            "worktop_thickness",
            "worktop_overhang",
            "worktop_color",
            "placement_mode",
            "updated_at",
        ]
    )

    # Un évier ou une plaque posé sur le plan de travail suit la variation
    # d'épaisseur : il reste affleurant au lieu de s'enfoncer dans le plan.
    if abs(worktop_thickness - old_worktop_thickness) > 0.01:
        new_worktop_surface = worktop_surface_height(project)
        for appliance in project.appliances.filter(
            kind__in=RoomAppliance.WORKTOP_KINDS
        ):
            if abs(float(appliance.elevation) - old_worktop_surface) <= 1.0:
                appliance.elevation = new_worktop_surface
                appliance.save(update_fields=["elevation"])

    if data.get("reset_walls"):
        project.walls.all().delete()
        ensure_room(project)
        return project

    walls = list(project.walls.all())
    if not walls:
        ensure_room(project)
        return project

    scale_x = width / old_width if old_width else 1.0
    scale_y = depth / old_depth if old_depth else 1.0
    for wall in walls:
        wall.x1 *= scale_x
        wall.x2 *= scale_x
        wall.y1 *= scale_y
        wall.y2 *= scale_y
        if abs(float(wall.height) - old_height) < 0.01:
            wall.height = height
        if abs(float(wall.thickness) - old_thickness) < 0.01:
            wall.thickness = thickness
        wall.save()
    return project


def update_walls(project: Project, walls_data: Iterable[Dict]) -> None:
    """Met à jour les murs et recoud les sommets partagés.

    Quand une extrémité est déplacée, l'extrémité correspondante du mur
    voisin est déplacée aussi : le contour de la pièce reste fermé.
    """
    walls = list(project.walls.all())
    by_id = {wall.pk: wall for wall in walls}
    originals = {
        wall.pk: (float(wall.x1), float(wall.y1), float(wall.x2), float(wall.y2))
        for wall in walls
    }
    updated_ids = set()
    for row in walls_data:
        try:
            wall = by_id[int(row["id"])]
        except (KeyError, TypeError, ValueError):
            continue
        wall.x1 = _number(row, "x1", wall.x1, -100_000)
        wall.y1 = _number(row, "y1", wall.y1, -100_000)
        wall.x2 = _number(row, "x2", wall.x2, -100_000)
        wall.y2 = _number(row, "y2", wall.y2, -100_000)
        if "height" in row:
            wall.height = _number(row, "height", wall.height, 100)
        if "thickness" in row:
            wall.thickness = _number(row, "thickness", wall.thickness, 10)
        if wall_length(wall) < 100:
            raise ValueError(f"Le mur {wall.name or wall.index + 1} est trop court.")
        updated_ids.add(wall.pk)

    def same_point(ax, ay, bx, by):
        return abs(ax - bx) < 1.0 and abs(ay - by) < 1.0

    for wall in walls:
        if wall.pk not in updated_ids:
            continue
        old_x1, old_y1, old_x2, old_y2 = originals[wall.pk]
        for other in walls:
            if other.pk == wall.pk or other.pk in updated_ids:
                continue
            ox1, oy1, ox2, oy2 = originals[other.pk]
            changed = False
            if same_point(ox1, oy1, old_x1, old_y1):
                other.x1, other.y1 = wall.x1, wall.y1
                changed = True
            if same_point(ox2, oy2, old_x1, old_y1):
                other.x2, other.y2 = wall.x1, wall.y1
                changed = True
            if same_point(ox1, oy1, old_x2, old_y2):
                other.x1, other.y1 = wall.x2, wall.y2
                changed = True
            if same_point(ox2, oy2, old_x2, old_y2):
                other.x2, other.y2 = wall.x2, wall.y2
                changed = True
            if changed:
                other.save(update_fields=["x1", "y1", "x2", "y2"])
        wall.save()

    if not updated_ids:
        return

    # Garde les dimensions nominales alignées sur l'enveloppe réelle : les
    # champs « Largeur / Profondeur » de l'éditeur et l'en-tête d'affaire
    # restent ainsi cohérents après un déplacement de mur.
    xs = [float(value) for wall in walls for value in (wall.x1, wall.x2)]
    ys = [float(value) for wall in walls for value in (wall.y1, wall.y2)]
    if xs and ys:
        width = max(xs) - min(xs)
        depth = max(ys) - min(ys)
        if (
            abs(float(project.room_width) - width) > 0.5
            or abs(float(project.room_depth) - depth) > 0.5
        ):
            project.room_width = width
            project.room_depth = depth
            project.save(
                update_fields=["room_width", "room_depth", "updated_at"]
            )


def create_opening(project: Project, data: Dict) -> RoomOpening:
    wall = project.walls.filter(pk=data.get("wall_id")).first()
    if wall is None:
        raise ValueError("Mur introuvable.")
    kind = data.get("kind") if data.get("kind") in dict(RoomOpening.KIND_CHOICES) else RoomOpening.KIND_WINDOW
    default_sill = 0.0 if kind in (RoomOpening.KIND_DOOR, RoomOpening.KIND_PASSAGE) else 900.0
    default_height = 2100.0 if kind in (RoomOpening.KIND_DOOR, RoomOpening.KIND_PASSAGE) else 1200.0
    width = min(_number(data, "width", 900, 50), wall_length(wall))
    offset = min(_number(data, "offset", 0, 0), max(wall_length(wall) - width, 0))
    height = _number(data, "height", default_height, 50)
    sill = _number(data, "sill", default_sill, 0)
    return RoomOpening.objects.create(
        project=project,
        wall=wall,
        kind=kind,
        name=str(data.get("name") or "")[:80],
        offset=offset,
        width=width,
        height=height,
        sill=sill,
    )


def update_opening(opening: RoomOpening, data: Dict) -> RoomOpening:
    if data.get("kind") in dict(RoomOpening.KIND_CHOICES):
        opening.kind = data["kind"]
    if "name" in data:
        opening.name = str(data.get("name") or "")[:80]
    opening.offset = _number(data, "offset", opening.offset, 0)
    opening.width = _number(data, "width", opening.width, 50)
    opening.height = _number(data, "height", opening.height, 50)
    opening.sill = _number(data, "sill", opening.sill, 0)
    opening.save()
    return opening


def update_item(item: ProjectItem, data: Dict) -> ProjectItem:
    item.pos_x = _number(data, "pos_x", item.pos_x, -100_000)
    item.pos_y = _number(data, "pos_y", item.pos_y, -100_000)
    item.rotation = _number(data, "rotation", item.rotation, -3600) % 360.0
    item.elevation = _number(data, "elevation", item.elevation, 0)
    item.pos_x, item.pos_y = _resolve_plan_position(
        item.project,
        item.pos_x,
        item.pos_y,
        float(item.cabinet.width),
        float(item.cabinet.depth),
        float(item.rotation),
        float(item.elevation),
        float(item.cabinet.height),
        exclude_item=item.pk,
    )
    item.save(update_fields=["pos_x", "pos_y", "rotation", "elevation"])
    return item


# ----------------------------------------------------------------------
# Versions
# ----------------------------------------------------------------------
def snapshot_project(project: Project) -> Dict:
    return {
        "format": 1,
        "project": {
            "name": project.name,
            "client_name": project.client_name,
            "gap": float(project.gap),
            "margin_percent": float(project.margin_percent),
            "tax_rate": float(project.tax_rate),
            "notes": project.notes,
            "room_type": project.room_type,
            "room_width": float(project.room_width),
            "room_depth": float(project.room_depth),
            "room_height": float(project.room_height),
            "wall_thickness": float(project.wall_thickness),
            "worktop_thickness": float(project.worktop_thickness),
            "worktop_overhang": float(project.worktop_overhang),
            "worktop_color": project.worktop_color,
            "placement_mode": project.placement_mode,
        },
        "walls": [
            {
                "id": wall.pk,
                "index": wall.index,
                "name": wall.name,
                "x1": float(wall.x1),
                "y1": float(wall.y1),
                "x2": float(wall.x2),
                "y2": float(wall.y2),
                "height": float(wall.height),
                "thickness": float(wall.thickness),
            }
            for wall in project.walls.all()
        ],
        "openings": [
            {
                "wall_id": opening.wall_id,
                "kind": opening.kind,
                "name": opening.name,
                "offset": float(opening.offset),
                "width": float(opening.width),
                "height": float(opening.height),
                "sill": float(opening.sill),
            }
            for opening in project.openings.all()
        ],
        "items": [
            {
                "cabinet_id": item.cabinet_id,
                "cabinet_name": item.cabinet.name,
                "slot": item.slot,
                "offset_x": float(item.offset_x),
                "pos_x": float(item.pos_x),
                "pos_y": float(item.pos_y),
                "rotation": float(item.rotation),
                "elevation": float(item.elevation),
            }
            for item in project.items.select_related("cabinet").all()
        ],
        "appliances": [
            {
                "kind": appliance.kind,
                "name": appliance.name,
                "width": float(appliance.width),
                "depth": float(appliance.depth),
                "height": float(appliance.height),
                "pos_x": float(appliance.pos_x),
                "pos_y": float(appliance.pos_y),
                "rotation": float(appliance.rotation),
                "elevation": float(appliance.elevation),
                "price": float(appliance.price),
                "notes": appliance.notes,
            }
            for appliance in project.appliances.all()
        ],
        "worktops": [
            {
                "name": worktop.name,
                "pos_x": float(worktop.pos_x),
                "pos_y": float(worktop.pos_y),
                "width": float(worktop.width),
                "depth": float(worktop.depth),
                "thickness": float(worktop.thickness),
                "rotation": float(worktop.rotation),
                "elevation": float(worktop.elevation),
                "color": worktop.color,
            }
            for worktop in project.worktops.all()
        ],
    }


@transaction.atomic
def create_version(project: Project, name: str = "", note: str = "") -> ProjectVersion:
    name = (name or "").strip()
    if not name:
        count = project.versions.count() + 1
        name = f"Version {count}"
    return ProjectVersion.objects.create(
        project=project,
        name=name[:150],
        note=(note or "")[:250],
        payload=snapshot_project(project),
    )


@transaction.atomic
def restore_version(project: Project, version: ProjectVersion) -> Dict:
    return restore_snapshot(project, version.payload or {})


@transaction.atomic
def restore_snapshot(project: Project, payload: Dict) -> Dict:
    """Puts the room back as `snapshot_project` read it (a version, or a step of the undo history)."""
    data = payload.get("project") or {}
    for field in (
        "name",
        "client_name",
        "gap",
        "margin_percent",
        "tax_rate",
        "notes",
        "room_type",
        "room_width",
        "room_depth",
        "room_height",
        "wall_thickness",
        "worktop_thickness",
        "worktop_overhang",
        "worktop_color",
        "placement_mode",
    ):
        if field in data:
            setattr(project, field, data[field])
    project.save()

    project.walls.all().delete()
    wall_map: Dict[int, RoomWall] = {}
    for row in payload.get("walls") or []:
        wall = RoomWall.objects.create(
            project=project,
            index=int(row.get("index") or 0),
            name=str(row.get("name") or "")[:50],
            x1=float(row.get("x1") or 0),
            y1=float(row.get("y1") or 0),
            x2=float(row.get("x2") or 0),
            y2=float(row.get("y2") or 0),
            height=float(row.get("height") or project.room_height),
            thickness=float(row.get("thickness") or project.wall_thickness),
        )
        wall_map[int(row.get("id") or 0)] = wall
    for row in payload.get("openings") or []:
        wall = wall_map.get(int(row.get("wall_id") or 0))
        if wall is None:
            continue
        RoomOpening.objects.create(
            project=project,
            wall=wall,
            kind=row.get("kind") or RoomOpening.KIND_WINDOW,
            name=str(row.get("name") or "")[:80],
            offset=float(row.get("offset") or 0),
            width=float(row.get("width") or 900),
            height=float(row.get("height") or 1200),
            sill=float(row.get("sill") or 0),
        )

    project.items.all().delete()
    missing = 0
    for index, row in enumerate(payload.get("items") or []):
        cabinet = Cabinet.objects.filter(pk=row.get("cabinet_id")).first()
        if cabinet is None:
            missing += 1
            continue
        ProjectItem.objects.create(
            project=project,
            cabinet=cabinet,
            slot=index,
            offset_x=float(row.get("offset_x") or 0),
            pos_x=float(row.get("pos_x") or 0),
            pos_y=float(row.get("pos_y") or 0),
            rotation=float(row.get("rotation") or 0) % 360.0,
            elevation=max(0.0, float(row.get("elevation") or 0)),
        )

    project.appliances.all().delete()
    for row in payload.get("appliances") or []:
        kind = (
            row.get("kind")
            if row.get("kind") in dict(RoomAppliance.KIND_CHOICES)
            else RoomAppliance.KIND_OTHER
        )
        RoomAppliance.objects.create(
            project=project,
            kind=kind,
            name=str(row.get("name") or "")[:80],
            width=max(50.0, float(row.get("width") or 600)),
            depth=max(50.0, float(row.get("depth") or 560)),
            height=max(10.0, float(row.get("height") or 600)),
            pos_x=float(row.get("pos_x") or 0),
            pos_y=float(row.get("pos_y") or 0),
            rotation=float(row.get("rotation") or 0) % 360.0,
            elevation=max(0.0, float(row.get("elevation") or 0)),
            price=max(0.0, float(row.get("price") or 0)),
            notes=str(row.get("notes") or ""),
        )
    # Worktops placed by hand (older snapshots have none: the ones there are kept).
    if "worktops" in payload:
        project.worktops.all().delete()
        for row in payload.get("worktops") or []:
            RoomWorktop.objects.create(
                project=project,
                name=str(row.get("name") or "Plan de travail")[:80],
                pos_x=float(row.get("pos_x") or 0),
                pos_y=float(row.get("pos_y") or 0),
                width=max(50.0, float(row.get("width") or 600)),
                depth=max(50.0, float(row.get("depth") or 600)),
                thickness=max(5.0, float(row.get("thickness") or 38)),
                rotation=float(row.get("rotation") or 0) % 360.0,
                elevation=max(0.0, float(row.get("elevation") or 900)),
                color=str(row.get("color") or "#d9d2c5")[:20],
            )
    ensure_room(project)
    return {"missing_cabinets": missing}


# ----------------------------------------------------------------------
# Duplication
# ----------------------------------------------------------------------
def _copy_label(name: str) -> str:
    """Ajoute « (copie) » sans empiler les suffixes sur une copie de copie."""
    suffix = " (copie)"
    base = (name or "").strip()
    while base.endswith(suffix):
        base = base[: -len(suffix)].rstrip()
    return f"{base or 'Sans nom'}{suffix}"[:150]


@transaction.atomic
def duplicate_project(project: Project, name: str = "") -> Project:
    """Duplique l'affaire et clone profondément ses caissons."""
    new_name = (name or _copy_label(project.name)).strip()[:150]
    clone = Project.objects.create(
        name=new_name,
        client_name=project.client_name,
        gap=project.gap,
        margin_percent=project.margin_percent,
        tax_rate=project.tax_rate,
        notes=project.notes,
        room_type=project.room_type,
        room_width=project.room_width,
        room_depth=project.room_depth,
        room_height=project.room_height,
        wall_thickness=project.wall_thickness,
        worktop_thickness=project.worktop_thickness,
        worktop_overhang=project.worktop_overhang,
        worktop_color=project.worktop_color,
        placement_mode=Project.PLACEMENT_ROOM,
    )
    ensure_room(project)
    wall_map: Dict[int, RoomWall] = {}
    for wall in project.walls.all():
        wall_map[wall.pk] = RoomWall.objects.create(
            project=clone,
            index=wall.index,
            name=wall.name,
            x1=wall.x1,
            y1=wall.y1,
            x2=wall.x2,
            y2=wall.y2,
            height=wall.height,
            thickness=wall.thickness,
        )
    for opening in project.openings.all():
        wall = wall_map.get(opening.wall_id)
        if wall is None:
            continue
        RoomOpening.objects.create(
            project=clone,
            wall=wall,
            kind=opening.kind,
            name=opening.name,
            offset=opening.offset,
            width=opening.width,
            height=opening.height,
            sill=opening.sill,
        )

    for appliance in project.appliances.all():
        RoomAppliance.objects.create(
            project=clone,
            kind=appliance.kind,
            name=appliance.name,
            width=appliance.width,
            depth=appliance.depth,
            height=appliance.height,
            pos_x=appliance.pos_x,
            pos_y=appliance.pos_y,
            rotation=appliance.rotation,
            elevation=appliance.elevation,
            price=appliance.price,
            notes=appliance.notes,
        )

    for index, item in enumerate(
        project.items.select_related("cabinet").order_by("slot", "id")
    ):
        source = item.cabinet
        payload = capture_cabinet(source)
        cabinet_name = _copy_label(source.name)
        cabinet = create_cabinet(
            name=cabinet_name,
            width=source.width,
            height=source.height,
            depth=source.depth,
            material=source.material_carcase,
            material_back=source.material_back,
            has_doors=source.has_doors,
            plinth_height=source.plinth_height,
        )
        clone_cabinet_from_payload(cabinet, payload)
        cabinet.name = cabinet_name
        cabinet.save(update_fields=["name"])
        ProjectItem.objects.create(
            project=clone,
            cabinet=cabinet,
            slot=index,
            offset_x=item.offset_x,
            pos_x=item.pos_x,
            pos_y=item.pos_y,
            rotation=item.rotation,
            elevation=item.elevation,
        )
    return clone
