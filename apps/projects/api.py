"""JSON API for projects (session auth + CSRF; owner-only access).

Contract (all errors are ``{"error": str, "details"?: list[str], ...}``):
- GET  /api/projects/                    → {"projects": [{id, name, space, current_version, updated_at}]}
- POST /api/projects/  {name, space?, …}  → 201 {id, name, space, version, document, checksum, updated_at}
- GET  /api/projects/<uuid>/             → {id, name, version, document, checksum, updated_at}
- PUT  /api/projects/<uuid>/             → same as GET (new version), 409 on stale base_version
- GET  /api/projects/<uuid>/versions/    → {"versions": [{number, checksum, size_bytes, message, created_at}]}
- GET  /api/projects/<uuid>/versions/<n>/ → {number, document, checksum}
- POST /api/projects/<uuid>/price/       {price: number | null} → {price}: the quote's total, as the editor computes it
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.http import JsonResponse

from . import quotas, services
from .documents import project_document
from .http import ApiError, api_view, json_error, read_json_body
from .models import Project, ProjectVersion
from .validation import canonical_json, validate_document

NAME_MAX_LENGTH = Project._meta.get_field("name").max_length
MESSAGE_MAX_LENGTH = ProjectVersion._meta.get_field("message").max_length


def _iso(value) -> str:
    return value.isoformat()


def _project_payload(project: Project, version: ProjectVersion) -> dict[str, Any]:
    return {
        "id": str(project.id),
        "name": project.name,
        "space": project.space,
        "version": version.number,
        "document": version.document,
        "checksum": version.checksum,
        "updated_at": _iso(project.updated_at),
    }


def _get_owned_project(request, project_id) -> Project:
    try:
        return Project.objects.get(pk=project_id, owner=request.user)
    except Project.DoesNotExist:
        raise ApiError(404, "Projet introuvable.") from None


def _clean_name(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ApiError(400, "Nom de projet invalide.", ["« name » doit être une chaîne non vide."])
    name = value.strip()
    if len(name) > NAME_MAX_LENGTH:
        raise ApiError(
            400, "Nom de projet invalide.", [f"« name » ne doit pas dépasser {NAME_MAX_LENGTH} caractères."]
        )
    return name


def _clean_message(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str) or len(value) > MESSAGE_MAX_LENGTH:
        raise ApiError(
            400, "Message invalide.", [f"« message » doit être une chaîne de {MESSAGE_MAX_LENGTH} caractères maximum."]
        )
    return value.strip()


def _clean_document(value: Any) -> dict[str, Any]:
    errors = validate_document(value)
    if errors:
        raise ApiError(400, "Document invalide.", errors)
    return value


@api_view(("GET", "POST"))
def project_collection(request):
    if request.method == "GET":
        rows = Project.objects.filter(owner=request.user).order_by("-updated_at")
        projects = [
            {
                "id": str(p.id),
                "name": p.name,
                "space": p.space,
                "current_version": p.current_version,
                "updated_at": _iso(p.updated_at),
            }
            for p in rows.only("id", "name", "space", "current_version", "updated_at")
        ]
        return JsonResponse({"projects": projects})

    data = read_json_body(request)
    name = _clean_name(data.get("name"))
    space = data.get("space", "design")
    if space not in dict(Project.SPACE_CHOICES):
        raise ApiError(400, "Espace invalide.", ["« space » : design, kitchen ou dressing."])
    document = data.get("document")
    document = project_document(space) if document is None else _clean_document(document)
    message = _clean_message(data.get("message"))
    quotas.check_new_project(request.user, len(canonical_json(document).encode("utf-8")))
    project, version = services.create_project(request.user, name, document, message, space)
    return JsonResponse(_project_payload(project, version), status=201)


@api_view(("GET", "PUT"))
def project_detail(request, project_id):
    if request.method == "GET":
        project = _get_owned_project(request, project_id)
        return JsonResponse(_project_payload(project, services.get_current_version(project)))

    data = read_json_body(request)
    base_version = data.get("base_version")
    if type(base_version) is not int or base_version < 0:
        raise ApiError(400, "Version de base invalide.", ["« base_version » doit être un entier positif."])
    if "document" not in data:
        raise ApiError(400, "Document invalide.", ["« document » est obligatoire."])
    document = _clean_document(data["document"])
    name = _clean_name(data["name"]) if data.get("name") is not None else None
    message = _clean_message(data.get("message"))
    # Each version is kept whole: the account's space must hold one more.
    quotas.check_storage(request.user, len(canonical_json(document).encode("utf-8")))
    try:
        project, version = services.save_new_version(
            project_id=project_id,
            owner=request.user,
            document=document,
            base_version=base_version,
            name=name,
            message=message,
        )
    except Project.DoesNotExist:
        raise ApiError(404, "Projet introuvable.") from None
    except services.VersionConflict as conflict:
        return json_error(
            409,
            "Le projet a été modifié entre-temps. Rechargez la dernière version.",
            current_version=conflict.current_version,
        )
    return JsonResponse(_project_payload(project, version))


@api_view(("GET",))
def version_list(request, project_id):
    project = _get_owned_project(request, project_id)
    rows = project.versions.order_by("-number").values(
        "number", "checksum", "size_bytes", "message", "created_at"
    )
    versions = [{**row, "created_at": _iso(row["created_at"])} for row in rows]
    return JsonResponse({"versions": versions})


@api_view(("GET",))
def version_detail(request, project_id, number):
    project = _get_owned_project(request, project_id)
    try:
        version = project.versions.get(number=number)
    except ProjectVersion.DoesNotExist:
        raise ApiError(404, "Version introuvable.") from None
    return JsonResponse(
        {"number": version.number, "document": version.document, "checksum": version.checksum}
    )


# A quote's total beyond this is a mistake (euros).
PRICE_MAX = 100_000_000


@api_view(("POST",))
def project_price(request, project_id):
    """The quote's total of a project, sent by the editor when it changes: the dashboard and the sheet show it."""
    project = _get_owned_project(request, project_id)
    data = read_json_body(request)
    price = data.get("price") if isinstance(data, dict) else None
    if price is not None and (type(price) not in (int, float) or not 0 <= price <= PRICE_MAX):
        raise ApiError(400, "Montant invalide.", ["« price » doit être un nombre positif, ou null."])
    value = None if price is None else Decimal(str(round(price, 2)))
    # Not a change of the design: « modifié le » stays.
    Project.objects.filter(pk=project.pk).update(price=value)
    return JsonResponse({"price": None if value is None else float(value)})


def not_found(request, *args, **kwargs):
    return json_error(404, "Ressource introuvable.")
