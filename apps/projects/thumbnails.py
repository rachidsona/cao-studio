"""L'aperçu d'un projet : une petite image du modèle, prise par l'éditeur après un enregistrement, montrée sur sa carte
de la page d'accueil.

- POST /api/projects/<uuid>/thumbnail/  {thumbnail: data URL JPEG}  → 204   (le propriétaire seulement)
- GET  /projects/<uuid>/apercu.jpg                                  → l'image (le propriétaire seulement)

Comme les vignettes de la bibliothèque : une image JPEG en data URL de 200 ko au plus, dont les octets commencent bien
par ceux d'un JPEG ; elle compte dans l'espace du compte (quotas.py).
"""
from __future__ import annotations

import base64
import binascii

from django.contrib.auth.decorators import login_required
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET

from . import quotas
from .api import _get_owned_project
from .http import ApiError, api_view, read_json_body
from .models import Project

PREFIX = "data:image/jpeg;base64,"
THUMBNAIL_MAX = 200_000
JPEG_MAGIC = b"\xff\xd8\xff"


def _jpeg(value: object) -> bytes:
    """The bytes of the JPEG sent, or ApiError 400."""
    if not isinstance(value, str) or len(value) > THUMBNAIL_MAX or not value.startswith(PREFIX):
        raise ApiError(400, "Aperçu invalide.", ["« thumbnail » doit être une image JPEG en data URL de 200 ko au plus."])
    try:
        data = base64.b64decode(value[len(PREFIX):], validate=True)
    except (binascii.Error, ValueError):
        raise ApiError(400, "Aperçu invalide.", ["L'image n'est pas lisible."]) from None
    if not data.startswith(JPEG_MAGIC):
        raise ApiError(400, "Aperçu invalide.", ["L'image n'est pas un JPEG."])
    return data


@api_view(("POST",))
def project_thumbnail(request, project_id):
    project = _get_owned_project(request, project_id)
    data = read_json_body(request)
    value = data.get("thumbnail") if isinstance(data, dict) else None
    _jpeg(value)
    quotas.check_storage(request.user, max(0, len(value) - len(project.thumbnail)))
    # Not a change of the design: « modifié le » stays.
    Project.objects.filter(pk=project.pk).update(thumbnail=value)
    return HttpResponse(status=204)


@login_required
@require_GET
def project_preview(request, project_id):
    thumbnail = get_object_or_404(Project.objects.only("thumbnail"), pk=project_id, owner=request.user).thumbnail
    if not thumbnail:
        raise Http404("Pas d'aperçu.")
    response = HttpResponse(base64.b64decode(thumbnail[len(PREFIX):]), content_type="image/jpeg")
    # The address carries the version (?v=…): kept by this browser, never by a shared cache.
    response["Cache-Control"] = "private, max-age=31536000, immutable"
    response["X-Content-Type-Options"] = "nosniff"
    return response
