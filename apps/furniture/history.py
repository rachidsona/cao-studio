"""Historique Annuler / Rétablir pour un caisson.

Chaque mutation enregistre un instantané complet des données éditables avant
l'action. Annuler restaure cet instantané, puis reconstruit les panneaux, la
liste de débit et le devis via ``CabinetDesignService.rebuild()``.
"""
from __future__ import annotations

import json
from functools import wraps
from typing import Any, Dict, List, Optional

from django.db import transaction
from django.http import JsonResponse

from .models import (
    Cabinet,
    CabinetHistory,
    CarcassPanel,
    Component,
    ExternalZone,
    InternalVolume,
    Panel,
)

HISTORY_LIMIT = 40

CABINET_FIELDS = (
    "name",
    "width",
    "height",
    "depth",
    "material_carcase_id",
    "material_back_id",
    "back_thickness_override",
    "back_in_groove",
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
    "notes",
)

VOLUME_FIELDS = (
    "id",
    "parent_id",
    "slot",
    "pos_x",
    "pos_y",
    "pos_z",
    "width",
    "height",
    "depth",
    "is_root",
    "locked",
    "split_direction",
    "split_mode",
    "split_ratio",
    "split_offset",
    "split_shelf",
    "split_side",
)

COMPONENT_FIELDS = (
    "id",
    "volume_id",
    "component_type",
    "material_id",
    "partition_lower_shelf_id",
    "partition_upper_shelf_id",
    "shelf_left_partition_id",
    "shelf_right_partition_id",
    "position_from_bottom",
    "position_from_left",
    "offset_mode",
    "ratio",
    "depth_clearance_front",
    "width",
    "height",
    "depth",
    "edge_banding",
    "fixed",
)

COMPONENT_SELF_FIELDS = (
    "partition_lower_shelf_id",
    "partition_upper_shelf_id",
    "shelf_left_partition_id",
    "shelf_right_partition_id",
)

EXTERNAL_ZONE_FIELDS = (
    "id",
    "zone_type",
    "pos_x",
    "pos_y",
    "pos_z",
    "width",
    "height",
    "depth",
    "material_id",
)


def capture_cabinet(cabinet: Cabinet) -> Dict[str, Any]:
    """Capture toutes les données nécessaires pour reconstruire le caisson."""
    return {
        "cabinet": {field: getattr(cabinet, field) for field in CABINET_FIELDS},
        "volumes": list(
            cabinet.internal_volumes.values(*VOLUME_FIELDS).order_by("id")
        ),
        "components": list(
            cabinet.components.values(*COMPONENT_FIELDS).order_by("id")
        ),
        "carcass_panels": list(
            cabinet.carcass_panels.values(
                "side", "material_id", "thickness", "position"
            ).order_by("side")
        ),
        "external_zones": list(
            cabinet.external_zones.values(*EXTERNAL_ZONE_FIELDS).order_by("id")
        ),
    }


def record_history(
    cabinet: Cabinet,
    payload: Dict[str, Any],
    message: str = "",
    action: str = "",
    params: Optional[Dict[str, Any]] = None,
) -> None:
    """Empile un instantané et efface la pile Rétablir."""
    CabinetHistory.objects.filter(cabinet=cabinet, direction="redo").delete()
    CabinetHistory.objects.create(
        cabinet=cabinet,
        direction="undo",
        payload=payload,
        message=(message or "")[:150],
        action=(action or "")[:50],
        params=params or {},
    )
    ids = list(
        CabinetHistory.objects.filter(cabinet=cabinet, direction="undo")
        .order_by("-id")
        .values_list("id", flat=True)
    )
    if len(ids) > HISTORY_LIMIT:
        CabinetHistory.objects.filter(id__in=ids[HISTORY_LIMIT:]).delete()


def _delete_cabinet_state(cabinet: Cabinet) -> None:
    Panel.objects.filter(cabinet=cabinet).delete()
    Component.objects.filter(cabinet=cabinet).delete()
    InternalVolume.objects.filter(cabinet=cabinet).delete()
    CarcassPanel.objects.filter(cabinet=cabinet).delete()
    ExternalZone.objects.filter(cabinet=cabinet).delete()


@transaction.atomic
def clone_cabinet_from_payload(cabinet: Cabinet, payload: Dict[str, Any]) -> List[str]:
    """Copie un instantané dans un NOUVEAU caisson (ids remappés).

    Contrairement à ``restore_cabinet`` (annuler/rétablir sur le même
    caisson), les identifiants d'origine ne sont pas réutilisés.
    """
    from .services import CabinetDesignService

    cabinet_data = payload.get("cabinet") or {}
    for field, value in cabinet_data.items():
        if field in CABINET_FIELDS:
            setattr(cabinet, field, value)
    cabinet.save()
    cabinet.refresh_from_db()

    _delete_cabinet_state(cabinet)

    # --- volumes : ids remappés -----------------------------------
    volume_rows = payload.get("volumes") or []
    volume_map: Dict[int, Optional[int]] = {}
    for row in volume_rows:
        values = {key: row[key] for key in VOLUME_FIELDS if key in row and key not in ("id", "parent_id")}
        volume = InternalVolume.objects.create(cabinet=cabinet, **values)
        volume_map[row["id"]] = volume.pk
    for row in volume_rows:
        parent_id = row.get("parent_id")
        if parent_id:
            InternalVolume.objects.filter(pk=volume_map[row["id"]]).update(
                parent_id=volume_map.get(parent_id)
            )

    # --- composants : références remappées ------------------------
    component_rows = payload.get("components") or []
    component_map: Dict[int, Optional[int]] = {}
    for row in component_rows:
        values = {
            key: row[key]
            for key in COMPONENT_FIELDS
            if key in row and key not in ("id", "volume_id") + COMPONENT_SELF_FIELDS
        }
        values["volume_id"] = volume_map.get(row.get("volume_id"))
        component = Component.objects.create(cabinet=cabinet, **values)
        component_map[row["id"]] = component.pk
    for row in component_rows:
        updates = {
            field: component_map.get(row[field])
            for field in COMPONENT_SELF_FIELDS
            if row.get(field)
        }
        if updates:
            Component.objects.filter(pk=component_map[row["id"]]).update(**updates)

    # --- panneaux de structure et zones externes ------------------
    carcass_rows = payload.get("carcass_panels") or []
    CarcassPanel.objects.bulk_create([CarcassPanel(cabinet=cabinet, **row) for row in carcass_rows])

    zone_rows = payload.get("external_zones") or []
    ExternalZone.objects.bulk_create(
        [
            ExternalZone(
                cabinet=cabinet,
                **{
                    key: row[key]
                    for key in EXTERNAL_ZONE_FIELDS
                    if key not in ("id",)
                },
            )
            for row in zone_rows
        ]
    )

    return CabinetDesignService(cabinet).rebuild()


def restore_cabinet(cabinet: Cabinet, payload: Dict[str, Any]) -> List[str]:
    """Restaure un instantané et reconstruit les données dérivées."""
    from .services import CabinetDesignService

    cabinet_data = payload.get("cabinet") or {}
    for field, value in cabinet_data.items():
        if field in CABINET_FIELDS:
            setattr(cabinet, field, value)
    cabinet.save()
    cabinet.refresh_from_db()

    _delete_cabinet_state(cabinet)

    volume_rows = payload.get("volumes") or []
    volumes = []
    for row in volume_rows:
        values = {key: row[key] for key in VOLUME_FIELDS if key in row}
        values["parent_id"] = None
        volumes.append(InternalVolume(cabinet=cabinet, **values))
    InternalVolume.objects.bulk_create(volumes)
    for row in volume_rows:
        parent_id = row.get("parent_id")
        if parent_id:
            InternalVolume.objects.filter(pk=row["id"]).update(parent_id=parent_id)

    component_rows = payload.get("components") or []
    components = []
    for row in component_rows:
        values = {
            key: (None if key in COMPONENT_SELF_FIELDS else row[key])
            for key in COMPONENT_FIELDS
            if key in row
        }
        components.append(Component(cabinet=cabinet, **values))
    Component.objects.bulk_create(components)
    for row in component_rows:
        updates = {
            key: row[key]
            for key in COMPONENT_SELF_FIELDS
            if row.get(key)
        }
        if updates:
            Component.objects.filter(pk=row["id"]).update(**updates)

    carcass_rows = payload.get("carcass_panels") or []
    CarcassPanel.objects.bulk_create(
        [CarcassPanel(cabinet=cabinet, **row) for row in carcass_rows]
    )

    zone_rows = payload.get("external_zones") or []
    ExternalZone.objects.bulk_create(
        [
            ExternalZone(
                cabinet=cabinet,
                **{key: row[key] for key in EXTERNAL_ZONE_FIELDS if key in row},
            )
            for row in zone_rows
        ]
    )

    return CabinetDesignService(cabinet).rebuild()


def history_state(cabinet: Cabinet) -> Dict[str, Any]:
    last_undo = (
        CabinetHistory.objects.filter(cabinet=cabinet, direction="undo")
        .order_by("-id")
        .only("message")
        .first()
    )
    last_redo = (
        CabinetHistory.objects.filter(cabinet=cabinet, direction="redo")
        .order_by("-id")
        .only("message")
        .first()
    )
    return {
        "can_undo": last_undo is not None,
        "can_redo": last_redo is not None,
        "undo_label": last_undo.message if last_undo else "",
        "redo_label": last_redo.message if last_redo else "",
    }


@transaction.atomic
def undo_cabinet(cabinet: Cabinet) -> Dict[str, Any]:
    from .services import CabinetDesignError, CabinetDesignService

    entry = (
        CabinetHistory.objects.filter(cabinet=cabinet, direction="undo")
        .order_by("-id")
        .first()
    )
    if entry is None:
        raise CabinetDesignError("Rien à annuler.")
    current = capture_cabinet(cabinet)
    warnings = restore_cabinet(cabinet, entry.payload)
    CabinetHistory.objects.create(
        cabinet=cabinet,
        direction="redo",
        payload=current,
        message=entry.message,
        action=entry.action,
        params=entry.params,
    )
    CabinetHistory.objects.filter(pk=entry.pk).delete()
    label = f"Annulé : {entry.message}" if entry.message else "Action annulée."
    return {"scene": CabinetDesignService(cabinet).scene(warnings), "message": label}


@transaction.atomic
def redo_cabinet(cabinet: Cabinet) -> Dict[str, Any]:
    from .services import CabinetDesignError, CabinetDesignService

    entry = (
        CabinetHistory.objects.filter(cabinet=cabinet, direction="redo")
        .order_by("-id")
        .first()
    )
    if entry is None:
        raise CabinetDesignError("Rien à rétablir.")
    current = capture_cabinet(cabinet)
    warnings = restore_cabinet(cabinet, entry.payload)
    CabinetHistory.objects.create(
        cabinet=cabinet,
        direction="undo",
        payload=current,
        message=entry.message,
        action=entry.action,
        params=entry.params,
    )
    CabinetHistory.objects.filter(pk=entry.pk).delete()
    label = f"Rétabli : {entry.message}" if entry.message else "Action rétablie."
    return {"scene": CabinetDesignService(cabinet).scene(warnings), "message": label}


def history_entries(cabinet: Cabinet) -> List[Dict[str, Any]]:
    entries = CabinetHistory.objects.filter(cabinet=cabinet, direction="undo").order_by("id")
    result = []
    for index, entry in enumerate(entries, start=1):
        result.append(
            {
                "id": entry.pk,
                "step": index,
                "action": entry.action,
                "message": entry.message,
                "params": entry.params,
                "created_at": entry.created_at.isoformat(),
            }
        )
    return result


@transaction.atomic
def rollback_history(cabinet: Cabinet, entry_id: int) -> Dict[str, Any]:
    """Revient juste avant une opération et permet de la refaire autrement."""
    from .services import CabinetDesignError, CabinetDesignService

    entry = (
        CabinetHistory.objects.filter(
            cabinet=cabinet, direction="undo", pk=int(entry_id)
        )
        .first()
    )
    if entry is None:
        raise CabinetDesignError("Opération introuvable dans l'historique.")
    current = capture_cabinet(cabinet)
    warnings = restore_cabinet(cabinet, entry.payload)
    CabinetHistory.objects.filter(
        cabinet=cabinet, direction="undo", id__gte=entry.pk
    ).delete()
    CabinetHistory.objects.create(
        cabinet=cabinet,
        direction="redo",
        payload=current,
        message="Rétablir les opérations suivantes.",
        action="rollback",
        params={"entry_id": entry.pk},
    )
    label = (
        f"Retour avant : {entry.message}"
        if entry.message
        else "Retour à l'état précédent."
    )
    return {
        "scene": CabinetDesignService(cabinet).scene(warnings),
        "message": label,
        "entry": {
            "id": entry.pk,
            "action": entry.action,
            "message": entry.message,
            "params": entry.params,
        },
    }


def record_history_view(view_func):
    """Décorateur : enregistre l'état avant une mutation réussie."""

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        cabinet_id = kwargs.get("cabinet_id")
        cabinet = Cabinet.objects.filter(pk=cabinet_id).first() if cabinet_id else None
        snapshot = capture_cabinet(cabinet) if cabinet is not None else None
        action = request.resolver_match.url_name if request.resolver_match else ""
        params: Dict[str, Any] = {}
        if request.body:
            try:
                parsed = json.loads(request.body.decode("utf-8"))
                if isinstance(parsed, dict):
                    params = parsed
            except (ValueError, UnicodeDecodeError):
                params = {}
        response = view_func(request, *args, **kwargs)
        if cabinet is not None and snapshot is not None and response.status_code == 200:
            try:
                payload = json.loads(response.content.decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                payload = {}
            if payload.get("ok"):
                record_history(
                    cabinet,
                    snapshot,
                    payload.get("message", ""),
                    action=action,
                    params=params,
                )
                scene = payload.get("scene")
                if isinstance(scene, dict):
                    scene["history"] = history_state(cabinet)
                return JsonResponse(payload, status=response.status_code)
        return response

    return wrapper
