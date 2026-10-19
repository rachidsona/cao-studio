from django.urls import path, re_path

from . import api

urlpatterns = [
    path("projects/", api.project_collection, name="api-projects"),
    path("projects/<uuid:project_id>/", api.project_detail, name="api-project"),
    path("projects/<uuid:project_id>/versions/", api.version_list, name="api-project-versions"),
    path(
        "projects/<uuid:project_id>/versions/<int:number>/",
        api.version_detail,
        name="api-project-version",
    ),
    # Any other /api/ URL answers with a JSON 404 instead of an HTML page.
    re_path(r"^.*$", api.not_found),
]
