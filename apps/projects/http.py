"""JSON helpers for the API: uniform French error responses and body parsing."""
from __future__ import annotations

from functools import wraps
from typing import Any

from django.core.exceptions import RequestDataTooBig
from django.http import JsonResponse
from django.views.csrf import csrf_failure as html_csrf_failure

from .validation import DocumentParseError, parse_json_strict

MAX_BODY_BYTES = 6 * 1024 * 1024


class ApiError(Exception):
    def __init__(self, status: int, message: str, details: list[str] | None = None, **extra: Any):
        super().__init__(message)
        self.status = status
        self.message = message
        self.details = details
        self.extra = extra

    def response(self) -> JsonResponse:
        return json_error(self.status, self.message, self.details, **self.extra)


def json_error(status: int, message: str, details: list[str] | None = None, **extra: Any) -> JsonResponse:
    payload: dict[str, Any] = {"error": message}
    if details is not None:
        payload["details"] = details
    payload.update(extra)
    return JsonResponse(payload, status=status)


def api_view(methods: tuple[str, ...]):
    """Decorator: allowed methods (405 JSON), auth (401 JSON), ApiError → JSON."""

    def decorator(view):
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            if request.method not in methods:
                response = json_error(405, "Méthode non autorisée.")
                response["Allow"] = ", ".join(methods)
                return response
            if not request.user.is_authenticated:
                return json_error(401, "Authentification requise.")
            try:
                return view(request, *args, **kwargs)
            except ApiError as exc:
                return exc.response()

        return wrapper

    return decorator


def read_json_body(request) -> Any:
    """Read and strictly parse the request body, enforcing the 6 MB limit."""
    try:
        declared = int(request.META.get("CONTENT_LENGTH") or 0)
    except ValueError:
        declared = 0
    if declared > MAX_BODY_BYTES:
        raise ApiError(413, "Requête trop volumineuse (6 Mo maximum).")
    try:
        body = request.body
    except RequestDataTooBig:
        raise ApiError(413, "Requête trop volumineuse (6 Mo maximum).") from None
    if len(body) > MAX_BODY_BYTES:
        raise ApiError(413, "Requête trop volumineuse (6 Mo maximum).")
    if not body:
        raise ApiError(400, "Le corps de la requête est vide.", [])
    try:
        data = parse_json_strict(body)
    except DocumentParseError as exc:
        raise ApiError(400, "JSON invalide.", [str(exc)]) from None
    if not isinstance(data, dict):
        raise ApiError(400, "Le corps de la requête doit être un objet JSON.", [])
    return data


def csrf_failure(request, reason: str = ""):
    """CSRF_FAILURE_VIEW: JSON for the API, Django's HTML page elsewhere."""
    if request.path.startswith("/api/"):
        return json_error(403, "Jeton CSRF manquant ou invalide.", [reason] if reason else [])
    return html_csrf_failure(request, reason=reason)
