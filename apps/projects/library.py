"""The library of one's own modules (session auth + CSRF, owner-only, JSON errors like api.py).

- GET    /api/library/        → {"modules": [{id, name, thumbnail, created_at}]}
- POST   /api/library/        → 201 {id, name, thumbnail, created_at, document} (JSON {name, document, thumbnail?})
- GET    /api/library/<id>/   → {id, name, thumbnail, created_at, document}
- DELETE /api/library/<id>/   → 204
"""
from __future__ import annotations

from typing import Any

from django.http import HttpResponse, JsonResponse

from .api import _clean_document, _iso
from . import quotas
from .http import ApiError, api_view, read_json_body
from .validation import canonical_json
from .models import LibraryModule

NAME_MAX = LibraryModule._meta.get_field("name").max_length
THUMBNAIL_MAX = 200_000
MODULES_MAX = 500


def _payload(module: LibraryModule, document: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": module.pk,
        "name": module.name,
        "thumbnail": module.thumbnail,
        "created_at": _iso(module.created_at),
    }
    if document:
        data["document"] = module.document
    return data


def _clean_thumbnail(value: Any) -> str:
    if value in (None, ""):
        return ""
    if not isinstance(value, str) or len(value) > THUMBNAIL_MAX or not value.startswith(("data:image/jpeg;base64,", "data:image/png;base64,")):
        raise ApiError(400, "Vignette invalide.", ["« thumbnail » doit être une image JPEG ou PNG en data URL de 200 ko au plus."])
    return value


@api_view(("GET", "POST"))
def library_collection(request):
    if request.method == "GET":
        rows = LibraryModule.objects.filter(owner=request.user).only("id", "name", "thumbnail", "created_at")
        return JsonResponse({"modules": [_payload(m) for m in rows]})

    data = read_json_body(request)
    name = data.get("name")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > NAME_MAX:
        raise ApiError(400, "Nom de module invalide.", [f"« name » doit être une chaîne non vide de {NAME_MAX} caractères au plus."])
    document = _clean_document(data.get("document"))
    if not document.get("features"):
        raise ApiError(400, "Module vide.", ["Le module doit contenir au moins une fonction."])
    if LibraryModule.objects.filter(owner=request.user).count() >= MODULES_MAX:
        raise ApiError(400, "Bibliothèque pleine.", [f"{MODULES_MAX} modules au plus : supprimez-en avant d'en ajouter."])
    thumbnail = _clean_thumbnail(data.get("thumbnail"))
    quotas.check_storage(request.user, len(canonical_json(document).encode("utf-8")) + len(thumbnail))
    module = LibraryModule.objects.create(
        owner=request.user, name=name.strip(), document=document, thumbnail=thumbnail
    )
    return JsonResponse(_payload(module, document=True), status=201)


@api_view(("GET", "DELETE"))
def library_detail(request, module_id):
    try:
        module = LibraryModule.objects.get(pk=module_id, owner=request.user)
    except LibraryModule.DoesNotExist:
        raise ApiError(404, "Module introuvable.") from None
    if request.method == "DELETE":
        module.delete()
        return HttpResponse(status=204)
    return JsonResponse(_payload(module, document=True))
