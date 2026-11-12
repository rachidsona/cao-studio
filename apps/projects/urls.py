from django.urls import path

from . import folders, thumbnails, views

app_name = "projects"

urlpatterns = [
    path("", views.project_list, name="list"),
    path("supprimer/", views.projects_delete, name="delete_many"),
    path("ranger/", folders.projects_move, name="move_many"),
    path("dossiers/", folders.folder_create, name="folder_create"),
    path("dossiers/<int:folder_id>/renommer/", folders.folder_rename, name="folder_rename"),
    path("dossiers/<int:folder_id>/supprimer/", folders.folder_delete, name="folder_delete"),
    path("<uuid:project_id>/editor/", views.editor, name="editor"),
    path("<uuid:project_id>/fiche/", views.project_sheet, name="sheet"),
    path("<uuid:project_id>/apercu.jpg", thumbnails.project_preview, name="preview"),
    path("<uuid:project_id>/supprimer/", views.project_delete, name="delete"),
]
