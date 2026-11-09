from django.urls import path, re_path

from apps.catalog import api as catalog_api

from . import api, assistant, library, monitoring, production, sharing, workshop

urlpatterns = [
    path("client-errors/", monitoring.client_error, name="api-client-errors"),
    path("catalog/", catalog_api.catalog, name="api-catalog"),
    path("projects/", api.project_collection, name="api-projects"),
    path("library/", library.library_collection, name="api-library"),
    path("library/<int:module_id>/", library.library_detail, name="api-library-module"),
    path("offcuts/", production.offcut_collection, name="api-offcuts"),
    path("offcuts/<int:offcut_id>/", production.offcut_detail, name="api-offcut"),
    path("batch/", production.batch_collection, name="api-batch"),
    path("batch/<int:item_id>/", production.batch_detail, name="api-batch-item"),
    path("projects/<uuid:project_id>/", api.project_detail, name="api-project"),
    path("projects/<uuid:project_id>/price/", api.project_price, name="api-project-price"),
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
    path("projects/<uuid:project_id>/workshop/", workshop.progress_api, name="api-project-workshop"),
    # Any other /api/ URL answers with a JSON 404 instead of an HTML page.
    re_path(r"^.*$", api.not_found),
]
