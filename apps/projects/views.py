"""HTML pages: project list/creation and the 3D editor shell."""
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

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
            return redirect("projects:editor", project_id=project.id)
    else:
        form = ProjectCreateForm()
    projects = Project.objects.filter(owner=request.user).order_by("-updated_at")
    return render(request, "projects/project_list.html", {"projects": projects, "form": form})


@login_required
@require_http_methods(["GET"])
@ensure_csrf_cookie  # the editor reads the csrftoken cookie for X-CSRFToken
def editor(request, project_id):
    project = get_object_or_404(Project, pk=project_id, owner=request.user)
    editor_config = {
        "projectId": str(project.id),
        "projectName": project.name,
        "apiUrl": reverse("api-project", kwargs={"project_id": project.id}),
        "projectsUrl": reverse("projects:list"),
    }
    return render(
        request, "editor/editor.html", {"project": project, "editor_config": editor_config}
    )
