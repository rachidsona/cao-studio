"""HTML pages: the home page (a dashboard of the jobs: a new 3D project, kitchen or dressing; the projects by where they
stand), the sheet of a project (its client, its status, its quote), the 3D editor shell."""
import uuid

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.clickjacking import xframe_options_sameorigin
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods, require_POST

from . import quotas, services
from .documents import example_document, project_document
from .forms import ProjectCreateForm, ProjectInfoForm
from .models import Project


@login_required
@require_http_methods(["GET", "POST"])
def project_list(request):
    if request.method == "POST" and (problem := quotas.project_problem(request.user)):
        messages.error(request, problem)
        return redirect("projects:list")
    if request.method == "POST" and "example" in request.POST:
        # The example project: a cabinet to explore (cut list, cutting layout, drawings).
        project, _ = services.create_project(request.user, "Caisson exemple", example_document())
        return redirect("projects:editor", project_id=project.id)
    if request.method == "POST":
        form = ProjectCreateForm(request.POST)
        if form.is_valid():
            # A kitchen or a dressing: a project of its space, opened there, its plan at the right.
            space = request.POST.get("space")
            space = space if space in ("kitchen", "dressing") else "design"
            project, _ = services.create_project(request.user, form.cleaned_data["name"], project_document(space), space=space)
            url = reverse("projects:editor", kwargs={"project_id": project.id})
            return redirect(f"{url}?onglet={space}" if space != "design" else url)
    else:
        form = ProjectCreateForm()
    mine = Project.objects.filter(owner=request.user)
    # The dashboard: how many jobs at each stage, and what is in the quotes sent and accepted.
    counts = dict(mine.values_list("status").annotate(n=Count("id")))
    statuses = [{"key": key, "label": label, "count": counts.get(key, 0)} for key, label in Project.STATUS_CHOICES]
    amounts = {key: mine.filter(status=key).aggregate(total=Sum("price"))["total"] or 0 for key in ("quoted", "accepted", "production")}
    # The list: one stage, a search on the name or the client.
    status = request.GET.get("statut", "")
    query = request.GET.get("q", "").strip()
    projects = mine.order_by("-updated_at")
    if status in counts or status in dict(Project.STATUS_CHOICES):
        projects = projects.filter(status=status)
    else:
        status = ""
    if query:
        projects = projects.filter(Q(name__icontains=query) | Q(client_name__icontains=query))
    return render(
        request,
        "projects/project_list.html",
        {"projects": projects, "form": form, "statuses": statuses, "amounts": amounts, "status": status, "query": query, "total": mine.count()},
    )


@login_required
@require_http_methods(["GET", "POST"])
def project_sheet(request, project_id):
    """The sheet of a project: its client, where the job stands, the date of fitting, notes; its quote and its links."""
    project = get_object_or_404(Project, pk=project_id, owner=request.user)
    form = ProjectInfoForm(request.POST or None, instance=project)
    if request.method == "POST" and form.is_valid():
        form.save()
        messages.success(request, "Fiche du projet enregistrée.")
        return redirect("projects:sheet", project_id=project.id)
    links = project.share_links.order_by("-created_at")
    return render(request, "projects/project_sheet.html", {"project": project, "form": form, "links": links})


@login_required
@require_POST
def project_delete(request, project_id):
    project = get_object_or_404(Project, pk=project_id, owner=request.user)
    name = project.name
    project.delete()
    messages.success(request, f"Projet « {name} » supprimé.")
    return redirect("projects:list")


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


@login_required
@require_POST
def projects_delete(request):
    """Delete the projects ticked on the home page; only the user's own."""
    ids = [value for value in request.POST.getlist("ids") if _is_uuid(value)]
    projects = Project.objects.filter(owner=request.user, pk__in=ids)
    count = projects.count()
    projects.delete()
    if count:
        plural = "s" if count > 1 else ""
        messages.success(request, f"{count} projet{plural} supprimé{plural}.")
    return redirect("projects:list")


@login_required
@require_http_methods(["GET"])
@ensure_csrf_cookie  # the editor reads the csrftoken cookie for X-CSRFToken
@xframe_options_sameorigin  # each tab of projects is an editor in a frame of this site
def editor(request, project_id):
    project = get_object_or_404(Project, pk=project_id, owner=request.user)
    editor_config = {
        "projectId": str(project.id),
        "projectName": project.name,
        "space": project.space,
        "apiUrl": reverse("api-project", kwargs={"project_id": project.id}),
        "projectsUrl": reverse("projects:list"),
        "catalogUrl": reverse("api-catalog"),
    }
    return render(
        request, "editor/editor.html", {"project": project, "editor_config": editor_config}
    )
