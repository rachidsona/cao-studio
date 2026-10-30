from django.urls import path, re_path

from . import api, assistant, monitoring, sharing

urlpatterns = [
    path("client-errors/", monitoring.client_error, name="api-client-errors"),
    path("projects/", api.project_collection, name="api-projects"),
    path("projects/<uuid:project_id>/", api.project_detail, name="api-project"),
    path("projects/<uuid:project_id>/versions/", api.version_list, name="api-project-versions"),
    path(
        "projects/<uuid:project_id>/versions/<int:number>/",
        api.version_detail,
        name="api-project-version",
    ),
    path("projects/<uuid:project_id>/shares/", sharing.share_collection, name="api-project-shares"),
    path("projects/<uuid:project_id>/shares/<str:token>/", sharing.share_detail, name="api-project-share"),
    path("projects/<uuid:project_id>/comments/", sharing.comment_collection, name="api-project-comments"),
    path("projects/<uuid:project_id>/comments/<int:comment_id>/", sharing.comment_detail, name="api-project-comment"),
    path("projects/<uuid:project_id>/assistant/", assistant.assistant, name="api-project-assistant"),
    # Any other /api/ URL answers with a JSON 404 instead of an HTML page.
    re_path(r"^.*$", api.not_found),
]
