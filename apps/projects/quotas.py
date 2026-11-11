"""Ce qu'un compte peut garder sur le serveur (audit de sécurité du 10/11/2026, constat 4 et M7).

L'inscription est libre : sans plafond, un seul compte remplirait le disque. Les plafonds sont loin au-dessus d'un usage
réel (le 11/11/2026 : 15 projets et 12 Mo pour le plus gros compte ; le modèle 3D d'une cuisine complète fait 0,8 Mo) :

- MAX_PROJECTS projets par compte ;
- MAX_STORAGE octets par compte : toutes les versions de ses projets, ses modèles de liens clients (variantes comprises)
  et ses modules de bibliothèque ;
- MAX_ACTIVE_LINKS liens clients non révoqués par compte, et MAX_LINK_BYTES par lien (son modèle et ses variantes) ;
- MAX_PROGRESS pièces suivies à l'atelier par projet.

Rien n'est jamais effacé pour faire de la place : ce qui dépasse est refusé, avec ce qu'il faut faire.
"""
from __future__ import annotations

from django.db.models import Sum
from django.db.models.functions import Coalesce, Length

from .http import ApiError
from .models import LibraryModule, PartProgress, Project, ProjectVersion, ShareLink, ShareVariant

MAX_PROJECTS = 500
MAX_STORAGE = 2 * 1024**3
MAX_ACTIVE_LINKS = 50
MAX_LINK_BYTES = 40 * 1024 * 1024
MAX_PROGRESS = 5000

FULL = "Espace de stockage plein (2 Go) : supprimez d'anciens projets ou révoquez d'anciens liens clients."


def storage_used(user) -> int:
    """The bytes this account keeps: versions, link models and variants, library modules."""
    versions = ProjectVersion.objects.filter(project__owner=user).aggregate(n=Coalesce(Sum("size_bytes"), 0))["n"]
    links = ShareLink.objects.filter(project__owner=user).aggregate(n=Coalesce(Sum("model_size"), 0))["n"]
    variants = ShareVariant.objects.filter(link__project__owner=user).aggregate(n=Coalesce(Sum("model_size"), 0))["n"]
    library = LibraryModule.objects.filter(owner=user).aggregate(n=Coalesce(Sum(Length("thumbnail")), 0))["n"]
    return versions + links + variants + library


def check_storage(user, adding: int) -> None:
    """ApiError 413 when `adding` more bytes would go past MAX_STORAGE."""
    if storage_used(user) + adding > MAX_STORAGE:
        raise ApiError(413, FULL)


def project_problem(user, adding: int = 0) -> str | None:
    """Why this account cannot make one more project now, or None."""
    if Project.objects.filter(owner=user).count() >= MAX_PROJECTS:
        return f"{MAX_PROJECTS} projets au plus : supprimez-en avant d'en créer un autre."
    if storage_used(user) + adding > MAX_STORAGE:
        return FULL
    return None


def check_new_project(user, adding: int = 0) -> None:
    problem = project_problem(user, adding)
    if problem:
        raise ApiError(413 if problem == FULL else 400, problem)


def check_new_link(user, size: int) -> None:
    """One more client link of `size` bytes (its model and variants)."""
    if size > MAX_LINK_BYTES:
        raise ApiError(400, "Modèle trop lourd.", [f"Le modèle et ses variantes ne doivent pas dépasser {MAX_LINK_BYTES // (1024 * 1024)} Mo ensemble."])
    if ShareLink.objects.filter(project__owner=user, revoked_at__isnull=True).count() >= MAX_ACTIVE_LINKS:
        raise ApiError(400, f"{MAX_ACTIVE_LINKS} liens clients actifs au plus : révoquez-en d'anciens avant d'en créer un.")
    check_storage(user, size)


def check_new_progress(project: Project, part: str) -> None:
    if not PartProgress.objects.filter(project=project, part=part).exists() and PartProgress.objects.filter(project=project).count() >= MAX_PROGRESS:
        raise ApiError(400, f"{MAX_PROGRESS} pièces suivies au plus par projet.")
