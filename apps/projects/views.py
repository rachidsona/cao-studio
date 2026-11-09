"""HTML pages: the home page (a 3D project, or a kitchen or a dressing opened on its tab), the 3D editor shell."""
import uuid

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.clickjacking import xframe_options_sameorigin
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods, require_POST

from . import services
from .documents import default_document, example_document
from .forms import ProjectCreateForm
from .models import Project


@login_required
@require_http_methods(["GET", "POST"])
def project_list(request):
    if request.method == "POST" and "example" in request.POST:
        # The example project: a cabinet to explore (cut list, cutting layout, drawings).
        project, _ = services.create_project(request.user, "Caisson exemple", example_document())
        return redirect("projects:editor", project_id=project.id)
    if request.method == "POST":
        form = ProjectCreateForm(request.POST)
        if form.is_valid():
            project, _ = services.create_project(
                request.user, form.cleaned_data["name"], default_document()
            )
            url = reverse("projects:editor", kwargs={"project_id": project.id})
            # A kitchen or a dressing: the editor opens on its tab, its plan at the right.
            space = request.POST.get("space")
            return redirect(f"{url}?onglet={space}" if space in ("kitchen", "dressing") else url)
    else:
        form = ProjectCreateForm()
    projects = Project.objects.filter(owner=request.user).order_by("-updated_at")
    return render(request, "projects/project_list.html", {"projects": projects, "form": form})


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
        "apiUrl": reverse("api-project", kwargs={"project_id": project.id}),
        "projectsUrl": reverse("projects:list"),
        "catalogUrl": reverse("api-catalog"),
    }
    return render(
        request, "editor/editor.html", {"project": project, "editor_config": editor_config}
    )
