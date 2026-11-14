"""What one keeps for all one's projects, kept by the server (session auth + CSRF, owner-only, JSON errors like api.py).

« Mes caissons », « Mes modules », « Mes découpes », « Mes murs », the dressing styles, the suppliers, the quote's
rates, the workshop's standards, the label, the G-code and DXF settings, the parts' tags, the render materials: each a
text the editor keeps under its key (frontend/src/persistence/kept-data.ts). Only these keys.

- GET /api/kept/        → {"data": {key: text}}
- PUT /api/kept/<key>/  → {key, updated_at} (JSON {value: text}; null takes it away)
"""
from __future__ import annotations

from django.http import JsonResponse

from .api import _iso
from .http import ApiError, api_view, read_json_body
from .models import KeptData

KEYS = frozenset({
    "cao.kitchen-own-units",
    "cao.my-dressing-modules",
    "cao.my-cutouts",
    "cao.my-walls",
    "cao.dressing-styles",
    "cao.suppliers",
    "cao.quote-rates",
    "cao.workshop-standards",
    "cao.label-template",
    "cao.gcode",
    "cao.dxf-layers",
    "cao.part-tags",
    "cao.render-materials",
})
VALUE_MAX = 2_000_000


@api_view(("GET",))
def kept_collection(request):
    return JsonResponse({"data": {k.key: k.value for k in KeptData.objects.filter(owner=request.user)}})


@api_view(("PUT",))
def kept_detail(request, key):
    if key not in KEYS:
        raise ApiError(404, "Donnée inconnue.")
    body = read_json_body(request)
    if not isinstance(body, dict) or "value" not in body:
        raise ApiError(400, "Corps invalide.", ["Le corps doit être un objet JSON {value: texte ou null}."])
    value = body["value"]
    if value is None:
        KeptData.objects.filter(owner=request.user, key=key).delete()
        return JsonResponse({"key": key, "updated_at": None})
    if not isinstance(value, str) or len(value) > VALUE_MAX:
        raise ApiError(400, "Valeur invalide.", [f"« value » doit être un texte de {VALUE_MAX} caractères au plus, ou null."])
    kept, _ = KeptData.objects.update_or_create(owner=request.user, key=key, defaults={"value": value})
    return JsonResponse({"key": key, "updated_at": _iso(kept.updated_at)})
