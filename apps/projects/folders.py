"""Les dossiers de la page d'accueil, pour ranger ses projets : en créer un, le renommer, le supprimer (ses projets
restent, sans dossier), y ranger les projets cochés. Chaque compte a les siens ; un dossier d'un autre compte n'existe
pas (404)."""
from __future__ import annotations

import uuid

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.views.decorators.http import require_POST

from .models import Project, ProjectFolder

MAX_FOLDERS = 200
NAME_MAX = ProjectFolder._meta.get_field("name").max_length


def _name(request) -> str | None:
    """The name typed, trimmed; None (said) when it is empty or too long."""
    name = " ".join(str(request.POST.get("name", "")).split())
    if not name:
        messages.error(request, "Donnez un nom au dossier.")
        return None
    if len(name) > NAME_MAX:
        messages.error(request, f"Un nom de dossier a {NAME_MAX} caractères au plus.")
        return None
    return name


def _in_folder(folder: ProjectFolder | None) -> str:
    url = reverse("projects:list")
    return f"{url}?dossier={folder.pk}" if folder else url


@login_required
@require_POST
def folder_create(request):
    name = _name(request)
    if name is None:
        return redirect("projects:list")
    if ProjectFolder.objects.filter(owner=request.user).count() >= MAX_FOLDERS:
        messages.error(request, f"{MAX_FOLDERS} dossiers au plus : supprimez-en avant d'en créer un autre.")
        return redirect("projects:list")
    try:
        # Its own savepoint: a name taken (two clicks at once) leaves the request's transaction usable.
        with transaction.atomic():
            folder = ProjectFolder.objects.create(owner=request.user, name=name)
    except IntegrityError:
        messages.error(request, f"Un dossier « {name} » existe déjà.")
        return redirect("projects:list")
    return redirect(_in_folder(folder))


@login_required
@require_POST
def folder_rename(request, folder_id: int):
    folder = get_object_or_404(ProjectFolder, pk=folder_id, owner=request.user)
    name = _name(request)
    if name is not None and name != folder.name:
        if ProjectFolder.objects.filter(owner=request.user, name=name).exists():
            messages.error(request, f"Un dossier « {name} » existe déjà.")
        else:
            folder.name = name
            folder.save(update_fields=["name"])
    return redirect(_in_folder(folder))


@login_required
@require_POST
def folder_delete(request, folder_id: int):
    folder = get_object_or_404(ProjectFolder, pk=folder_id, owner=request.user)
    count = folder.projects.count()
    folder.delete()  # its projects stay, without a folder (SET_NULL)
    messages.success(request, f"Dossier « {folder.name} » supprimé" + (f" ; ses {count} projets restent, sans dossier." if count > 1 else " ; son projet reste, sans dossier." if count else "."))
    return redirect("projects:list")


@login_required
@require_POST
def projects_move(request):
    """The projects ticked, put in the folder chosen (« none »: out of any folder)."""
    ids = []
    for value in request.POST.getlist("ids"):
        try:
            ids.append(uuid.UUID(value))
        except ValueError:
            continue
    target = request.POST.get("folder", "")
    folder = None
    if target and target != "aucun":
        if not target.isdigit():
            messages.error(request, "Choisissez un dossier.")
            return redirect("projects:list")
        folder = get_object_or_404(ProjectFolder, pk=int(target), owner=request.user)
    count = Project.objects.filter(owner=request.user, pk__in=ids).update(folder=folder)
    if count:
        plural = "s" if count > 1 else ""
        messages.success(request, f"{count} projet{plural} rangé{plural} dans « {folder.name} »." if folder else f"{count} projet{plural} sorti{plural} de leur dossier.")
    return redirect(_in_folder(folder))
