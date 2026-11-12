"""Les dossiers de projets vus de l'éditeur, pour sa colonne « Projets » (frontend/src/app/project-organizer.ts) : les
mêmes que ceux de la page d'accueil (folders.py), avec les mêmes règles. Chaque compte n'a que les siens ; un dossier ou
un projet d'un autre compte n'existe pas (404).

- GET    /api/folders/                          → {folders: [{id, name}], projects: [{id, name, space, folder, updated_at}]}
- POST   /api/folders/             {name}       → 201 {id, name}
- PATCH  /api/folders/<id>/        {name}       → {id, name}
- DELETE /api/folders/<id>/                     → 204 (ses projets restent, sans dossier)
- PUT    /api/projects/<uuid>/folder/ {folder: id | null} → {folder}
"""
from __future__ import annotations

from django.db import IntegrityError, transaction
from django.http import HttpResponse, JsonResponse

from .api import _get_owned_project
from .folders import MAX_FOLDERS, clean_name
from .http import ApiError, api_view, read_json_body
from .models import Project, ProjectFolder


def _payload(folder: ProjectFolder) -> dict[str, object]:
    return {"id": folder.pk, "name": folder.name}


def _name_of(request) -> str:
    data = read_json_body(request)
    raw = data.get("name") if isinstance(data, dict) else None
    if not isinstance(raw, str):
        raise ApiError(400, "Nom de dossier invalide.", ["« name » doit être une chaîne."])
    try:
        return clean_name(raw)
    except ValueError as error:
        raise ApiError(400, str(error)) from None


def _owned_folder(request, folder_id) -> ProjectFolder:
    try:
        return ProjectFolder.objects.get(pk=folder_id, owner=request.user)
    except ProjectFolder.DoesNotExist:
        raise ApiError(404, "Dossier introuvable.") from None


@api_view(("GET", "POST"))
def folder_collection(request):
    if request.method == "GET":
        folders = [_payload(f) for f in ProjectFolder.objects.filter(owner=request.user)]
        rows = Project.objects.filter(owner=request.user).order_by("name").only("id", "name", "space", "folder_id", "updated_at")
        projects = [
            {"id": str(p.id), "name": p.name, "space": p.space, "folder": p.folder_id, "updated_at": p.updated_at.isoformat()}
            for p in rows
        ]
        return JsonResponse({"folders": folders, "projects": projects})
    name = _name_of(request)
    if ProjectFolder.objects.filter(owner=request.user).count() >= MAX_FOLDERS:
        raise ApiError(400, f"{MAX_FOLDERS} dossiers au plus : supprimez-en avant d'en créer un autre.")
    try:
        # Its own savepoint: a name taken (two clicks at once) leaves the request's transaction usable.
        with transaction.atomic():
            folder = ProjectFolder.objects.create(owner=request.user, name=name)
    except IntegrityError:
        raise ApiError(400, f"Un dossier « {name} » existe déjà.") from None
    return JsonResponse(_payload(folder), status=201)


@api_view(("PATCH", "DELETE"))
def folder_detail(request, folder_id: int):
    folder = _owned_folder(request, folder_id)
    if request.method == "DELETE":
        folder.delete()  # its projects stay, without a folder (SET_NULL)
        return HttpResponse(status=204)
    name = _name_of(request)
    if name != folder.name:
        if ProjectFolder.objects.filter(owner=request.user, name=name).exists():
            raise ApiError(400, f"Un dossier « {name} » existe déjà.")
        folder.name = name
        folder.save(update_fields=["name"])
    return JsonResponse(_payload(folder))


@api_view(("PUT",))
def project_folder(request, project_id):
    project = _get_owned_project(request, project_id)
    data = read_json_body(request)
    target = data.get("folder") if isinstance(data, dict) else None
    if target is not None and (isinstance(target, bool) or not isinstance(target, int)):
        raise ApiError(400, "Dossier invalide.", ["« folder » : le numéro d'un dossier, ou null."])
    folder = None if target is None else _owned_folder(request, target)
    # Not a change of the design: « modifié le » stays.
    Project.objects.filter(pk=project.pk).update(folder=folder)
    return JsonResponse({"folder": folder.pk if folder else None})
