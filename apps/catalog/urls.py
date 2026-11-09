from django.urls import path

from . import views

app_name = "catalog"

urlpatterns = [
    path("", views.index, name="index"),
    path("materiaux/", views.materials, name="materials"),
    path("materiaux/nouveau/", views.edit, {"section": "materials"}, name="material_add"),
    path("materiaux/<int:pk>/", views.edit, {"section": "materials"}, name="material_edit"),
    path("materiaux/<int:pk>/supprimer/", views.delete, {"section": "materials"}, name="material_delete"),
    path("quincaillerie/", views.hardware, name="hardware"),
    path("quincaillerie/nouveau/", views.edit, {"section": "hardware"}, name="hardware_add"),
    path("quincaillerie/<int:pk>/", views.edit, {"section": "hardware"}, name="hardware_edit"),
    path("quincaillerie/<int:pk>/supprimer/", views.delete, {"section": "hardware"}, name="hardware_delete"),
    path("atelier/", views.company, name="company"),
]
