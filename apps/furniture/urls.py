"""The workshop of the former poly_3D (cabinets and rooms), mounted under /poly/ (config/urls.py)."""
from django.urls import path

from . import views

app_name = "poly"

urlpatterns = [
    # Pages
    path("", views.index, name="home"),
    path("cabinet/<int:cabinet_id>/", views.editor, name="editor"),
    path("cabinet/<int:cabinet_id>/supprimer/", views.cabinet_delete, name="cabinet_delete"),
    path("cabinet/<int:cabinet_id>/devis/", views.quote_page, name="quote_page"),
    path("projet/creer/", views.project_create, name="project_create"),
    path("cabinet/<int:cabinet_id>/modele/creer/", views.template_create, name="template_create"),
    path("caisson/modele/<int:template_id>/instancier/", views.template_instantiate, name="template_instantiate"),
    path("caisson/modele/<int:template_id>/supprimer/", views.template_delete, name="template_delete"),
    path("projet/<int:project_id>/", views.project_detail, name="project_detail"),
    path("projet/<int:project_id>/piece/", views.project_room, name="project_room"),
    path("projet/<int:project_id>/croquis.pdf", views.project_croquis_pdf, name="project_croquis_pdf"),
    path("projet/<int:project_id>/liste-debit.pdf", views.project_cutlist_pdf, name="project_cutlist_pdf"),
    path("projet/<int:project_id>/optimisation.pdf", views.project_nesting_pdf, name="project_nesting_pdf"),
    path("projet/<int:project_id>/devis.pdf", views.project_quote_pdf, name="project_quote_pdf"),
    path("cabinet/<int:cabinet_id>/liste-debit.csv", views.cutlist_csv, name="cutlist_csv"),
    path("cabinet/<int:cabinet_id>/croquis.pdf", views.croquis_pdf, name="croquis_pdf"),
    path("cabinet/<int:cabinet_id>/liste-debit.pdf", views.cutlist_pdf, name="cutlist_pdf"),
    path("cabinet/<int:cabinet_id>/optimisation.pdf", views.nesting_pdf, name="nesting_pdf"),
    path("api/cabinets/<int:cabinet_id>/hardware/", views.api_update_hardware, name="api_update_hardware"),
    path("api/cabinets/<int:cabinet_id>/nesting/", views.api_nesting, name="api_nesting"),
    # API caissons
    path("api/cabinets/", views.api_create_cabinet, name="api_create_cabinet"),
    path("api/cabinets/<int:cabinet_id>/scene/", views.api_scene, name="api_scene"),
    path("api/cabinets/<int:cabinet_id>/undo/", views.api_undo, name="api_undo"),
    path("api/cabinets/<int:cabinet_id>/redo/", views.api_redo, name="api_redo"),
    path("api/cabinets/<int:cabinet_id>/history/", views.api_history, name="api_history"),
    path(
        "api/cabinets/<int:cabinet_id>/history/<int:entry_id>/rollback/",
        views.api_history_rollback,
        name="api_history_rollback",
    ),
    path("api/cabinets/<int:cabinet_id>/", views.api_update_cabinet, name="api_update_cabinet"),
    path("api/cabinets/<int:cabinet_id>/delete/", views.api_delete_cabinet, name="api_delete_cabinet"),
    # API pièce / affaire (cuisine et dressing)
    path("api/projects/<int:project_id>/room/", views.api_project_room, name="api_project_room"),
    path("api/projects/<int:project_id>/room/undo/", views.api_project_room_undo, name="api_project_room_undo"),
    path("api/projects/<int:project_id>/room/redo/", views.api_project_room_redo, name="api_project_room_redo"),
    path(
        "api/projects/<int:project_id>/room/update/",
        views.api_project_room_update,
        name="api_project_room_update",
    ),
    path(
        "api/projects/<int:project_id>/room/walls/",
        views.api_project_room_walls,
        name="api_project_room_walls",
    ),
    path(
        "api/projects/<int:project_id>/room/openings/",
        views.api_project_opening_create,
        name="api_project_opening_create",
    ),
    path(
        "api/projects/<int:project_id>/room/openings/<int:opening_id>/",
        views.api_project_opening_update,
        name="api_project_opening_update",
    ),
    path(
        "api/projects/<int:project_id>/room/openings/<int:opening_id>/delete/",
        views.api_project_opening_delete,
        name="api_project_opening_delete",
    ),
    path(
        "api/projects/<int:project_id>/room/items/",
        views.api_project_item_add,
        name="api_project_item_add",
    ),
    path(
        "api/projects/<int:project_id>/room/items/<int:item_id>/",
        views.api_project_item_update,
        name="api_project_item_update",
    ),
    path(
        "api/projects/<int:project_id>/room/items/<int:item_id>/delete/",
        views.api_project_item_delete,
        name="api_project_item_delete",
    ),
    path(
        "api/projects/<int:project_id>/room/appliances/",
        views.api_project_appliance_add,
        name="api_project_appliance_add",
    ),
    path(
        "api/projects/<int:project_id>/room/appliances/<int:appliance_id>/",
        views.api_project_appliance_update,
        name="api_project_appliance_update",
    ),
    path(
        "api/projects/<int:project_id>/room/appliances/<int:appliance_id>/delete/",
        views.api_project_appliance_delete,
        name="api_project_appliance_delete",
    ),
    path(
        "api/projects/<int:project_id>/room/worktops/",
        views.api_project_worktop_add,
        name="api_project_worktop_add",
    ),
    path(
        "api/projects/<int:project_id>/room/worktops/<int:worktop_id>/",
        views.api_project_worktop_update,
        name="api_project_worktop_update",
    ),
    path(
        "api/projects/<int:project_id>/room/worktops/<int:worktop_id>/delete/",
        views.api_project_worktop_delete,
        name="api_project_worktop_delete",
    ),
    path(
        "api/projects/<int:project_id>/room/versions/",
        views.api_project_version_create,
        name="api_project_version_create",
    ),
    path(
        "api/projects/<int:project_id>/room/versions/<int:version_id>/restore/",
        views.api_project_version_restore,
        name="api_project_version_restore",
    ),
    path(
        "api/projects/<int:project_id>/room/duplicate/",
        views.api_project_duplicate,
        name="api_project_duplicate",
    ),
    # API décomposition
    path("api/cabinets/<int:cabinet_id>/split/", views.api_split, name="api_split"),
    path(
        "api/cabinets/<int:cabinet_id>/compartments/",
        views.api_compartment_grid,
        name="api_compartment_grid",
    ),
    path(
        "api/cabinets/<int:cabinet_id>/volumes/<int:volume_id>/split/",
        views.api_update_split,
        name="api_update_split",
    ),
    path(
        "api/cabinets/<int:cabinet_id>/volumes/<int:volume_id>/split/delete/",
        views.api_delete_split,
        name="api_delete_split",
    ),
    path(
        "api/cabinets/<int:cabinet_id>/sides/series/",
        views.api_side_series,
        name="api_side_series",
    ),
    path("api/cabinets/<int:cabinet_id>/shelves/", views.api_shelf, name="api_shelf"),
    path(
        "api/cabinets/<int:cabinet_id>/shelves/series/",
        views.api_shelf_series,
        name="api_shelf_series",
    ),
    path(
        "api/cabinets/<int:cabinet_id>/move/",
        views.api_move_element,
        name="api_move_element",
    ),
    path("api/cabinets/<int:cabinet_id>/partitions/", views.api_partition, name="api_partition"),
    path(
        "api/cabinets/<int:cabinet_id>/components/delete/",
        views.api_delete_components,
        name="api_delete_components",
    ),
    path(
        "api/cabinets/<int:cabinet_id>/components/<int:component_id>/",
        views.api_delete_component,
        name="api_delete_component",
    ),
    path(
        "api/cabinets/<int:cabinet_id>/components/<int:component_id>/update/",
        views.api_update_component,
        name="api_update_component",
    ),
    path(
        "api/cabinets/<int:cabinet_id>/carcass/<str:side>/",
        views.api_update_carcass_panel,
        name="api_update_carcass_panel",
    ),
    path("api/cabinets/<int:cabinet_id>/plinth/", views.api_plinth, name="api_plinth"),
    path(
        "api/cabinets/<int:cabinet_id>/plinth/delete/",
        views.api_delete_plinth,
        name="api_delete_plinth",
    ),
    # API fabrication / devis
    path("api/cabinets/<int:cabinet_id>/cutlist/", views.api_cutlist, name="api_cutlist"),
    path("api/cabinets/<int:cabinet_id>/quote/", views.api_quote, name="api_quote"),
    path(
        "api/cabinets/<int:cabinet_id>/quote/update/",
        views.api_update_quote,
        name="api_update_quote",
    ),
    path("api/materials/", views.api_materials, name="api_materials"),
]
