"""Workshop tracking: where each piece of a project stands (cut, edge-banded, drilled, assembled).

- GET  /api/projects/<uuid>/workshop/        → {"steps": [[key, label]], "parts": {name: {step, updated_at}}}
- POST /api/projects/<uuid>/workshop/        → {part, step, updated_at} (JSON {part, step}; step "" forgets the piece)
- GET/POST /atelier/<uuid>/?piece=<name>     → the page a label's QR code opens on a phone: the piece, its step, a
  big button per step (POST, CSRF), and the project's other pieces. Owner only (login required).
"""
from __future__ import annotations

from typing import Any

from django.contrib.auth.decorators import login_required
from django.http import Http404, JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.http import urlencode
from django.views.decorators.http import require_http_methods

from .api import _get_owned_project, _iso
from . import quotas
from .http import ApiError, api_view, read_json_body
from .models import PartProgress, Project

STEP_KEYS = [key for key, _ in PartProgress.STEPS]
PART_MAX = PartProgress._meta.get_field("part").max_length


def _clean_part(value: Any) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > PART_MAX:
        raise ApiError(400, "Pièce invalide.", [f"« part » doit être un nom de pièce de {PART_MAX} caractères au plus."])
    return value.strip()


def _set_step(project: Project, part: str, step: str, user) -> PartProgress | None:
    if step == "":
        PartProgress.objects.filter(project=project, part=part).delete()
        return None
    quotas.check_new_progress(project, part)
    progress, _ = PartProgress.objects.update_or_create(project=project, part=part, defaults={"step": step, "updated_by": user})
    return progress


@api_view(("GET", "POST"))
def progress_api(request, project_id):
    project = _get_owned_project(request, project_id)
    if request.method == "GET":
        parts = {p.part: {"step": p.step, "updated_at": _iso(p.updated_at)} for p in project.progress.all()}
        return JsonResponse({"steps": PartProgress.STEPS, "parts": parts})
    data = read_json_body(request)
    part = _clean_part(data.get("part"))
    step = data.get("step")
    if step not in ("", *STEP_KEYS):
        raise ApiError(400, "Étape invalide.", [f"« step » doit être l'une de : {', '.join(STEP_KEYS)} (ou vide)."])
    progress = _set_step(project, part, step, request.user)
    return JsonResponse({"part": part, "step": progress.step if progress else "", "updated_at": _iso(progress.updated_at) if progress else None})


@login_required
@require_http_methods(["GET", "POST"])
def piece_page(request, project_id):
    try:
        project = Project.objects.get(pk=project_id, owner=request.user)
    except Project.DoesNotExist:
        raise Http404("Projet introuvable.") from None
    piece = (request.POST.get("piece") or request.GET.get("piece") or "").strip()[:PART_MAX]
    if request.method == "POST":
        step = request.POST.get("step", "")
        if piece and step in ("", *STEP_KEYS):
            try:
                _set_step(project, piece, step, request.user)
            except ApiError:  # the project follows too many pieces already: nothing changes
                pass
        return redirect(f"{reverse('workshop-piece', kwargs={'project_id': project.id})}?{urlencode({'piece': piece})}")
    progress = {p.part: p for p in project.progress.all()}
    current = progress.get(piece)
    counts = {key: sum(1 for p in progress.values() if STEP_KEYS.index(p.step) >= STEP_KEYS.index(key)) for key in STEP_KEYS}
    return render(
        request,
        "workshop/piece.html",
        {
            "project": project,
            "piece": piece,
            "current": current.step if current else "",
            "steps": PartProgress.STEPS,
            "pieces": sorted(progress.values(), key=lambda p: p.part),
            "counts": [(label, counts[key]) for key, label in PartProgress.STEPS],
        },
    )
