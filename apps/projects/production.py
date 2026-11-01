"""The workshop's stock of offcuts and its grouped production (session auth + CSRF, owner-only, JSON errors like api.py).

Offcuts (reusable pieces of panel, placed first by the sheet layout):
- GET    /api/offcuts/          → {"offcuts": [{id, material, thickness, length, width, quantity, note, created_at}]}
- POST   /api/offcuts/          → 201 {"offcuts": [...]} (JSON {offcuts: [{material, thickness, length, width, quantity?, note?}]})
- PATCH  /api/offcuts/<id>/     → offcut (JSON {quantity}: 0 deletes it, as when it is used up)
- DELETE /api/offcuts/<id>/     → 204

Grouped production (projects made together, as Polyboard's catalogue mode):
- GET    /api/batch/            → {"items": [{id, project, name, quantity, rows, hardware, updated_at}]}
- POST   /api/batch/            → 201 item (JSON {project, name, rows, hardware?, quantity?}): a project already there is replaced
- PATCH  /api/batch/<id>/       → item (JSON {quantity})
- DELETE /api/batch/<id>/       → 204
"""
from __future__ import annotations

import math
from typing import Any

from django.http import HttpResponse, JsonResponse

from .api import _iso
from .http import ApiError, api_view, read_json_body
from .models import BatchItem, Offcut, Project

OFFCUTS_MAX = 2000
BATCH_MAX = 100
ROWS_MAX = 2000
NAME_MAX = BatchItem._meta.get_field("name").max_length
MATERIAL_MAX = Offcut._meta.get_field("material").max_length
NOTE_MAX = Offcut._meta.get_field("note").max_length


def _number(value: Any, field: str, low: float = 0.0, high: float = 100_000.0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low < value <= high:
        raise ApiError(400, "Nombre invalide.", [f"« {field} » doit être un nombre entre {low:g} (exclu) et {high:g}."])
    return float(value)


def _count(value: Any, field: str, low: int = 1, high: int = 999) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise ApiError(400, "Quantité invalide.", [f"« {field} » doit être un entier de {low} à {high}."])
    return value


def _text(value: Any, field: str, limit: int, required: bool = True) -> str:
    if value is None and not required:
        return ""
    if not isinstance(value, str) or (required and not value.strip()) or len(value.strip()) > limit:
        raise ApiError(400, "Texte invalide.", [f"« {field} » doit être une chaîne{' non vide' if required else ''} de {limit} caractères au plus."])
    return value.strip()


def _offcut_payload(o: Offcut) -> dict[str, Any]:
    return {
        "id": o.pk,
        "material": o.material,
        "thickness": o.thickness,
        "length": o.length,
        "width": o.width,
        "quantity": o.quantity,
        "note": o.note,
        "created_at": _iso(o.created_at),
    }


@api_view(("GET", "POST"))
def offcut_collection(request):
    mine = Offcut.objects.filter(owner=request.user)
    if request.method == "GET":
        return JsonResponse({"offcuts": [_offcut_payload(o) for o in mine]})
    data = read_json_body(request)
    entries = data.get("offcuts") if isinstance(data, dict) else None
    if not isinstance(entries, list) or not 1 <= len(entries) <= 200:
        raise ApiError(400, "Chutes invalides.", ["« offcuts » doit être une liste de 1 à 200 chutes."])
    if mine.count() + len(entries) > OFFCUTS_MAX:
        raise ApiError(400, "Stock plein.", [f"{OFFCUTS_MAX} chutes au plus : retirez celles qui sont parties."])
    made = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ApiError(400, "Chute invalide.", ["Chaque chute doit être un objet."])
        length = _number(entry.get("length"), "length")
        width = _number(entry.get("width"), "width")
        made.append(
            Offcut(
                owner=request.user,
                material=_text(entry.get("material"), "material", MATERIAL_MAX),
                thickness=_number(entry.get("thickness"), "thickness", high=500),
                # Kept as length ≥ width.
                length=max(length, width),
                width=min(length, width),
                quantity=_count(entry.get("quantity", 1), "quantity"),
                note=_text(entry.get("note"), "note", NOTE_MAX, required=False),
            )
        )
    Offcut.objects.bulk_create(made)
    return JsonResponse({"offcuts": [_offcut_payload(o) for o in mine]}, status=201)


@api_view(("PATCH", "DELETE"))
def offcut_detail(request, offcut_id):
    try:
        offcut = Offcut.objects.get(pk=offcut_id, owner=request.user)
    except Offcut.DoesNotExist:
        raise ApiError(404, "Chute introuvable.") from None
    if request.method == "DELETE":
        offcut.delete()
        return HttpResponse(status=204)
    data = read_json_body(request)
    quantity = _count(data.get("quantity") if isinstance(data, dict) else None, "quantity", low=0)
    if quantity == 0:
        offcut.delete()
        return HttpResponse(status=204)
    offcut.quantity = quantity
    offcut.save(update_fields=["quantity"])
    return JsonResponse(_offcut_payload(offcut))


def _batch_payload(item: BatchItem) -> dict[str, Any]:
    return {
        "id": item.pk,
        "project": str(item.project_id) if item.project_id else None,
        "name": item.name,
        "quantity": item.quantity,
        "rows": item.rows,
        "hardware": item.hardware,
        "updated_at": _iso(item.updated_at),
    }


def _clean_rows(value: Any) -> list[dict[str, Any]]:
    """Rows of a cut list (document/cut-list.ts): what the sheet layout and the purchase list need."""
    if not isinstance(value, list) or not 1 <= len(value) <= ROWS_MAX:
        raise ApiError(400, "Liste de débit invalide.", [f"« rows » doit être une liste de 1 à {ROWS_MAX} lignes."])
    rows = []
    for row in value:
        if not isinstance(row, dict):
            raise ApiError(400, "Ligne de débit invalide.", ["Chaque ligne doit être un objet."])
        names = row.get("names")
        if not isinstance(names, list) or not names or not all(isinstance(n, str) and len(n) <= 200 for n in names):
            raise ApiError(400, "Ligne de débit invalide.", ["« names » doit être une liste de noms de pièces."])
        clean = {
            "names": names[:200],
            "quantity": _count(row.get("quantity"), "quantity", high=10_000),
            "material": _text(row.get("material"), "material", MATERIAL_MAX),
            "grain": row.get("grain") if row.get("grain") in ("length", "width", "none") else "length",
        }
        for key in ("length", "width", "thickness", "cutLength", "cutWidth"):
            clean[key] = _number(row.get(key), key)
        for key in ("roughLength", "roughWidth"):
            if row.get(key) is not None:
                clean[key] = _number(row.get(key), key)
        band = row.get("band", 0)
        clean["band"] = float(band) if isinstance(band, (int, float)) and not isinstance(band, bool) and 0 <= band <= 10 else 0.0
        edges = row.get("edges")
        clean["edges"] = (
            {k: bool(edges.get(k)) for k in ("length1", "length2", "width1", "width2")} if isinstance(edges, dict) else {}
        )
        rows.append(clean)
    return rows


def _clean_hardware(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 500:
        raise ApiError(400, "Quincaillerie invalide.", ["« hardware » doit être une liste."])
    out = []
    for h in value:
        if not isinstance(h, dict):
            raise ApiError(400, "Quincaillerie invalide.", ["Chaque article doit être un objet."])
        entry = {"name": _text(h.get("name"), "name", 120), "quantity": _number(h.get("quantity"), "quantity", high=1_000_000)}
        if isinstance(h.get("unit"), str) and len(h["unit"]) <= 20:
            entry["unit"] = h["unit"]
        out.append(entry)
    return out


@api_view(("GET", "POST"))
def batch_collection(request):
    mine = BatchItem.objects.filter(owner=request.user)
    if request.method == "GET":
        return JsonResponse({"items": [_batch_payload(i) for i in mine]})
    data = read_json_body(request)
    if not isinstance(data, dict):
        raise ApiError(400, "Requête invalide.")
    project = None
    if data.get("project") is not None:
        try:
            project = Project.objects.get(pk=data.get("project"), owner=request.user)
        except (Project.DoesNotExist, ValueError, TypeError):
            raise ApiError(404, "Projet introuvable.") from None
    fields = {
        "name": _text(data.get("name"), "name", NAME_MAX),
        "rows": _clean_rows(data.get("rows")),
        "hardware": _clean_hardware(data.get("hardware")),
        "quantity": _count(data.get("quantity", 1), "quantity"),
    }
    existing = mine.filter(project=project).first() if project else None
    if existing:
        for key, value in fields.items():
            setattr(existing, key, value)
        existing.save()
        return JsonResponse(_batch_payload(existing), status=201)
    if mine.count() >= BATCH_MAX:
        raise ApiError(400, "Fabrication groupée pleine.", [f"{BATCH_MAX} projets au plus."])
    item = BatchItem.objects.create(owner=request.user, project=project, **fields)
    return JsonResponse(_batch_payload(item), status=201)


@api_view(("PATCH", "DELETE"))
def batch_detail(request, item_id):
    try:
        item = BatchItem.objects.get(pk=item_id, owner=request.user)
    except BatchItem.DoesNotExist:
        raise ApiError(404, "Projet introuvable dans la fabrication groupée.") from None
    if request.method == "DELETE":
        item.delete()
        return HttpResponse(status=204)
    data = read_json_body(request)
    item.quantity = _count(data.get("quantity") if isinstance(data, dict) else None, "quantity")
    item.save(update_fields=["quantity", "updated_at"])
    return JsonResponse(_batch_payload(item))
