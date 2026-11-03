"""Undo and redo for the room editor (cuisine, dressing) of the workshop.

Before every change of a room that succeeds, the room as it was is kept (`snapshot_project`); « Annuler » puts the
last one back and keeps the present state for « Rétablir ». A new change clears what could be redone. Forty steps per
room at most. The cabinets themselves are not part of it: their own history is the cabinet editor's.
"""
from __future__ import annotations

import json
from functools import wraps
from typing import Dict, Optional

from django.http import JsonResponse

HISTORY_LIMIT = 40


def room_history_counts(project) -> Dict[str, int]:
    from .models import RoomHistory

    rows = RoomHistory.objects.filter(project=project)
    return {"undo": rows.filter(direction="undo").count(), "redo": rows.filter(direction="redo").count()}


def _push(project, direction: str, payload: Dict, label: str) -> None:
    from .models import RoomHistory

    RoomHistory.objects.create(project=project, direction=direction, payload=payload, label=label[:200])
    extra = RoomHistory.objects.filter(project=project, direction=direction).values_list("pk", flat=True)[HISTORY_LIMIT:]
    RoomHistory.objects.filter(pk__in=list(extra)).delete()


def record_room_change(project, before: Dict, label: str) -> None:
    from .models import RoomHistory

    _push(project, "undo", before, label)
    RoomHistory.objects.filter(project=project, direction="redo").delete()


def step_room(project, direction: str) -> Optional[str]:
    """Undoes (direction « undo ») or redoes the last step; returns its label, or None when there is none."""
    from .models import RoomHistory
    from .room import restore_snapshot, snapshot_project

    entry = RoomHistory.objects.filter(project=project, direction=direction).first()
    if entry is None:
        return None
    _push(project, "redo" if direction == "undo" else "undo", snapshot_project(project), entry.label)
    restore_snapshot(project, entry.payload)
    entry.delete()
    return entry.label or "modification"


def record_room_history_view(view_func):
    """Decorator of the room API's changes: the room before it is kept when the change succeeds."""

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        from .models import Project
        from .room import snapshot_project
        counts = room_history_counts

        project = Project.objects.filter(pk=kwargs.get("project_id")).first()
        before = snapshot_project(project) if project is not None else None
        response = view_func(request, *args, **kwargs)
        if project is None or before is None or response.status_code not in (200, 201):
            return response
        try:
            body = json.loads(response.content.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return response
        if not body.get("ok"):
            return response
        record_room_change(project, before, str(body.get("message") or ""))
        if isinstance(body.get("payload"), dict):
            body["payload"]["history"] = counts(project)
        return JsonResponse(body, status=response.status_code)

    return wrapper
