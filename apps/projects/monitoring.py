"""Operations endpoints: a health check for the host, and the errors of the editor reported by the browser.

- GET  /healthz             → 200 {"status": "ok"} (503 when the database does not answer); no login needed
- POST /api/client-errors/  → 204; {message, source?, stack?, url?} is written to the "apps.client" log
"""
from __future__ import annotations

import logging
import re
from typing import Any

from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_GET

from .http import ApiError, api_view, read_json_body

logger = logging.getLogger("apps.client")

# Lengths kept from a report: enough to find the bug, not a way to fill the logs.
FIELD_LIMITS = {"message": 500, "source": 300, "stack": 4000, "url": 500}


@require_GET
def healthz(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:  # noqa: BLE001 — any database failure means "not healthy"
        logger.exception("Health check: database unavailable")
        return JsonResponse({"status": "error", "database": "unavailable"}, status=503)
    return JsonResponse({"status": "ok"})


def _clean(data: dict[str, Any], field: str) -> str:
    """A field of the report, cut, and on one line: a line break would let a browser write false lines in the log
    (audit of 10/11/2026, constat 8)."""
    value = data.get(field, "")
    if not isinstance(value, str):
        return ""
    return re.sub(r"[\x00-\x1f\x7f\u2028\u2029]", " ⏎ " if field == "stack" else " ", value[: FIELD_LIMITS[field]])


@api_view(("POST",))
def client_error(request):
    data = read_json_body(request)
    message = _clean(data, "message")
    if not message:
        raise ApiError(400, "Rapport d'erreur invalide.", ["« message » doit être une chaîne non vide."])
    logger.error(
        "Erreur dans l'éditeur (utilisateur %s) : %s",
        request.user.pk,
        message,
        extra={"source": _clean(data, "source"), "stack": _clean(data, "stack"), "page": _clean(data, "url")},
    )
    return HttpResponse(status=204)
