"""Assemblages multi-caissons (affaires / projets).

Un projet positionne plusieurs caissons côte à côte (ordre des items,
largeurs cumulées + jeu). Les exports combinés (croquis, débit,
optimisation, devis) s'appuient sur les mêmes générateurs que l'éditeur.
"""
from __future__ import annotations

from typing import Dict, List, Tuple

from .models import Cabinet, Project, ProjectItem
from .scene import _cabinet_boxes, _volume_boxes


def project_layout(project: Project) -> List[Dict]:
    """Positions cumulées des caissons.

    En mode linéaire, normalise et persiste ``slot`` / ``offset_x``.
    En mode pièce, les caissons sont positionnés librement : on calcule un
    ordre d'affichage sans jamais réécrire leurs placements en base.
    """
    items = list(project.items.select_related("cabinet", "cabinet__material_carcase").all())
    items.sort(key=lambda item: (item.slot, item.id))
    entries: List[Dict] = []
    offset = 0.0
    for index, item in enumerate(items):
        entries.append(
            {
                "item": item,
                "cabinet": item.cabinet,
                "slot": index,
                "offset_x": offset,
            }
        )
        offset += float(item.cabinet.width) + float(project.gap)

    if project.placement_mode == Project.PLACEMENT_ROOM:
        return entries

    for entry in entries:
        item = entry["item"]
        if item.slot != entry["slot"] or abs(item.offset_x - entry["offset_x"]) > 0.01:
            item.slot = entry["slot"]
            item.offset_x = entry["offset_x"]
            item.save(update_fields=["slot", "offset_x"])
    return entries


def project_stats(project: Project) -> Dict:
    entries = project_layout(project)
    if not entries:
        return {
            "cabinet_count": 0,
            "total_width": 0.0,
            "max_height": 0.0,
            "max_depth": 0.0,
        }
    total_width = entries[-1]["offset_x"] + float(entries[-1]["cabinet"].width)
    return {
        "cabinet_count": len(entries),
        "total_width": total_width,
        "max_height": max(float(entry["cabinet"].height) for entry in entries),
        "max_depth": max(float(entry["cabinet"].depth) for entry in entries),
    }


def cabinet_boxes(cabinet: Cabinet) -> List[dict]:
    """Boxes d'un caisson (voir scene._cabinet_boxes / _volume_boxes)."""
    volumes = list(cabinet.internal_volumes.select_related("parent").all())
    components = list(
        cabinet.components.select_related("material", "volume").all()
    )
    return _cabinet_boxes(cabinet) + _volume_boxes(volumes, components, cabinet)


def project_boxes(project: Project) -> Tuple[List[dict], Dict]:
    """Boxes de tous les caissons, décalées en x (sol commun y = 0)."""
    entries = project_layout(project)
    boxes: List[dict] = []
    for entry in entries:
        offset = entry["offset_x"]
        for box in cabinet_boxes(entry["cabinet"]):
            shifted = dict(box)
            shifted["x"] = box["x"] + offset
            boxes.append(shifted)
    return boxes, project_stats(project)


def project_cabinets(project: Project) -> List[Cabinet]:
    return [entry["cabinet"] for entry in project_layout(project)]
