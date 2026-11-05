from django.urls import path

from . import views

app_name = "projects"

urlpatterns = [
    path("", views.project_list, name="list"),
    path("supprimer/", views.projects_delete, name="delete_many"),
    path("<uuid:project_id>/editor/", views.editor, name="editor"),
    path("<uuid:project_id>/supprimer/", views.project_delete, name="delete"),
]
