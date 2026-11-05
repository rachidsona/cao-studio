import csv
import json
from typing import Dict, Optional

from django.contrib import messages
from django.http import HttpResponse, JsonResponse
from django.urls import reverse

from .room_history import record_room_history_view, step_room
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from apps.quotes.models import Quote

from .engine import GeometryError
from .history import (
    history_entries,
    history_state,
    record_history_view,
    redo_cabinet,
    rollback_history,
    undo_cabinet,
)
from .models import (
    Cabinet,
    CabinetTemplate,
    HardwareRule,
    Material,
    Project,
    ProjectItem,
    ProjectVersion,
    RoomAppliance,
    RoomOpening,
    RoomWall,
    RoomWorktop,
)
from .pdf_export import build_cutlist_pdf, build_sketch_pdf
from .services import CabinetDesignError, CabinetDesignService, create_cabinet



# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _body(request) -> dict:
    if not request.body:
        return {}
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError as exc:
        raise CabinetDesignError("Corps JSON invalide.") from exc
    if not isinstance(data, dict):
        raise CabinetDesignError("Le corps de la requête doit être un objet JSON.")
    return data


def _error(message, status=400):
    return JsonResponse({"ok": False, "error": str(message)}, status=status)


def _scene_response(scene, message="", status=200):
    return JsonResponse({"ok": True, "message": message, "scene": scene}, status=status)


def _cabinet_or_404(cabinet_id: int) -> Cabinet:
    return get_object_or_404(
        Cabinet.objects.select_related("material_carcase", "material_back"), pk=cabinet_id
    )


# ----------------------------------------------------------------------
# Pages
# ----------------------------------------------------------------------
def index(request):
    """Tableau de bord : la liste des caissons (recherche et filtre dans la page) + création dans une fenêtre."""
    if request.method == "POST":
        try:
            name = (request.POST.get("name") or "Nouveau meuble").strip()
            width = float(request.POST.get("width") or 1000)
            height = float(request.POST.get("height") or 720)
            depth = float(request.POST.get("depth") or 350)
            material = Material.objects.get(pk=request.POST.get("material_id"))
            back_id = request.POST.get("material_back_id")
            material_back = Material.objects.filter(pk=back_id).first() if back_id else None
            cabinet = create_cabinet(
                name=name,
                width=width,
                height=height,
                depth=depth,
                material=material,
                material_back=material_back,
                bottom_setback=float(request.POST.get("bottom_setback") or 0),
                has_doors=request.POST.get("has_doors") == "on",
                plinth_height=float(request.POST.get("plinth_height") or 100),
            )
            messages.success(request, f"Caisson « {cabinet.name} » créé.")
            return redirect("poly:editor", cabinet_id=cabinet.pk)
        except (CabinetDesignError, GeometryError, ValueError, Material.DoesNotExist) as exc:
            messages.error(request, f"Impossible de créer le caisson : {exc}")

    cabinets = list(Cabinet.objects.prefetch_related("project_items__project").order_by("-updated_at"))
    for cabinet in cabinets:
        # A cabinet placed twice in an affair is listed once.
        cabinet.affairs = list({item.project_id: item.project for item in cabinet.project_items.all()}.values())
    materials = Material.objects.all()
    default_back = materials.filter(thickness__lte=6).order_by("thickness").first()
    return render(
        request,
        "poly/dashboard.html",
        {
            "section": "cabinets",
            "cabinets": cabinets,
            "affairs": Project.objects.filter(items__isnull=False).distinct().order_by("name"),
            "materials": materials,
            "default_back": default_back,
        },
    )


@never_cache
def editor(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    service = CabinetDesignService(cabinet)
    try:
        scene = service.scene_safe()
        error = None
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        scene = service.scene([])
        error = str(exc)
    related_projects = list(
        Project.objects.filter(items__cabinet=cabinet)
        .distinct()
        .order_by("-updated_at")
    )
    return render(
        request,
        "poly/editor.html",
        {
            "cabinet": cabinet,
            "scene": scene,
            "scene_error": error,
            "materials": Material.objects.all(),
            "hardware_rules": HardwareRule.objects.all(),
            "attached_hardware_ids": list(
                cabinet.hardware_rules.values_list("pk", flat=True)
            ),
            "related_projects": related_projects,
        },
    )


def quote_page(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    service = CabinetDesignService(cabinet)
    try:
        service.rebuild()
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        messages.error(request, f"Le devis n'a pas pu être recalculé : {exc}")
    quote = Quote.objects.filter(cabinet=cabinet).first()
    return render(request, "poly/quote.html", {"cabinet": cabinet, "quote": quote})


@require_POST
def project_delete(request, project_id: int):
    """Supprime une affaire et sa pièce ; ses caissons restent dans l'atelier, « Sans affaire »."""
    project = _project_or_404(project_id)
    name = project.name
    project.delete()
    messages.success(request, f"Projet « {name} » supprimé. Ses caissons restent dans l'atelier.")
    return redirect("projects:list")


@require_POST
def projects_delete(request):
    """Supprime les affaires cochées sur la page d'accueil ; leurs caissons restent dans l'atelier."""
    ids = [value for value in request.POST.getlist("ids") if value.isdecimal()]
    projects = Project.objects.filter(pk__in=ids)
    count = projects.count()
    projects.delete()
    if count:
        plural = "s" if count > 1 else ""
        messages.success(request, f"{count} projet{plural} supprimé{plural}. Les caissons restent dans l'atelier.")
    return redirect("projects:list")


@require_POST
def cabinet_delete(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    name = cabinet.name
    cabinet.delete()
    messages.success(request, f"Caisson « {name} » supprimé.")
    return redirect("poly:home")


# ----------------------------------------------------------------------
# Projets / affaires (multi-caissons)
# ----------------------------------------------------------------------
def _project_or_404(project_id: int) -> Project:
    return get_object_or_404(Project, pk=project_id)


def project_detail(request, project_id: int):
    from .project import project_layout, project_stats

    project = _project_or_404(project_id)
    if request.method == "POST":
        action = request.POST.get("action")
        try:
            if action == "add":
                cabinet = Cabinet.objects.get(pk=request.POST.get("cabinet_id"))
                if project.items.filter(cabinet=cabinet).exists():
                    messages.error(request, "Ce caisson est déjà dans l'affaire.")
                else:
                    if project.placement_mode == Project.PLACEMENT_ROOM:
                        from .room import add_cabinet_to_room

                        add_cabinet_to_room(project, cabinet)
                    else:
                        slot = project.items.count()
                        ProjectItem.objects.create(project=project, cabinet=cabinet, slot=slot)
                    messages.success(request, f"Caisson « {cabinet.name} » ajouté à l'affaire.")
            elif action == "remove":
                item = project.items.get(pk=request.POST.get("item_id"))
                item.delete()
                messages.success(request, "Caisson retiré de l'affaire.")
            elif action == "move":
                if project.placement_mode == Project.PLACEMENT_ROOM:
                    messages.info(
                        request,
                        "Le réordonnancement linéaire ne s'applique pas au mode "
                        "pièce : utilisez l'éditeur 2D/3D pour déplacer les caissons.",
                    )
                else:
                    item = project.items.get(pk=request.POST.get("item_id"))
                    direction = -1 if request.POST.get("direction") == "up" else 1
                    target = (item.slot + direction) % max(project.items.count(), 1)
                    other = project.items.filter(slot=target).first()
                    if other and other != item:
                        other.slot = item.slot
                        other.save(update_fields=["slot"])
                    item.slot = target
                    item.save(update_fields=["slot"])
            elif action == "update":
                project.name = (request.POST.get("name") or project.name).strip()
                project.client_name = (request.POST.get("client_name") or "Client").strip()
                project.gap = max(0.0, float(request.POST.get("gap") or 0))
                project.margin_percent = max(0.0, float(request.POST.get("margin_percent") or 0))
                project.tax_rate = max(0.0, float(request.POST.get("tax_rate") or 0))
                project.notes = request.POST.get("notes") or ""
                project.save()
                messages.success(request, "Affaire mise à jour.")
            elif action == "delete":
                project.delete()
                messages.success(request, "Affaire supprimée.")
                return redirect("poly:home")
        except (Cabinet.DoesNotExist, ProjectItem.DoesNotExist, ValueError) as exc:
            messages.error(request, f"Action impossible : {exc}")
        return redirect("poly:project_detail", project_id=project.pk)

    entries = project_layout(project)
    if project.placement_mode == Project.PLACEMENT_ROOM:
        from .room import room_project_summary

        stats = room_project_summary(project)
    else:
        stats = project_stats(project)
    cabinets = Cabinet.objects.exclude(project_items__project=project).order_by("name")
    return render(
        request,
        "poly/project_detail.html",
        {
            "project": project,
            "entries": entries,
            "stats": stats,
            "available_cabinets": cabinets,
        },
    )


@require_POST
def project_create(request):
    name = (request.POST.get("name") or "").strip()
    if not name:
        messages.error(request, "Le nom de l'affaire est obligatoire.")
        return redirect("poly:home")
    project = Project.objects.create(
        name=name,
        client_name=(request.POST.get("client_name") or "Client").strip(),
        placement_mode=Project.PLACEMENT_ROOM,
    )
    from .room import ensure_room

    ensure_room(project)
    messages.success(
        request,
        f"Affaire « {project.name} » créée. Dessinez la pièce puis posez les caissons.",
    )
    return redirect("poly:project_room", project_id=project.pk)


# ----------------------------------------------------------------------
# Éditeur de pièce (cuisine / dressing)
# ----------------------------------------------------------------------
def project_room(request, project_id: int):
    """Éditeur 2D/3D de la pièce et des caissons d'une affaire."""
    from .room import ensure_room, room_payload

    project = _project_or_404(project_id)
    if project.placement_mode != Project.PLACEMENT_ROOM:
        messages.info(
            request,
            "Cette affaire utilise l'ancien mode linéaire : ouvrez la fiche "
            "Affaire pour la consulter. L'éditeur de pièce est réservé aux "
            "nouvelles affaires.",
        )
        return redirect("poly:project_detail", project_id=project.pk)
    ensure_room(project)
    payload = room_payload(project)
    return render(
        request,
        "poly/room_editor.html",
        {
            "project": project,
            "payload": payload,
            "presets": payload["presets"],
        },
    )


def _room_payload_response(
    project: Project,
    message: str = "",
    status: int = 200,
    extra: Optional[Dict] = None,
):
    from .room import room_payload

    body = {"ok": True, "message": message, "payload": room_payload(project)}
    if extra:
        body.update(extra)
    return JsonResponse(body, status=status)


@require_GET
def api_project_room(request, project_id: int):
    project = _project_or_404(project_id)
    try:
        return _room_payload_response(project)
    except (ValueError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_room_history_view
def api_project_room_update(request, project_id: int):
    from .room import update_room

    project = _project_or_404(project_id)
    try:
        update_room(project, _body(request))
        return _room_payload_response(project, "Pièce mise à jour.")
    except (ValueError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_room_history_view
def api_project_room_walls(request, project_id: int):
    from .room import update_walls

    project = _project_or_404(project_id)
    try:
        data = _body(request)
        update_walls(project, data.get("walls") or [])
        return _room_payload_response(project, "Murs mis à jour.")
    except (ValueError, TypeError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_room_history_view
def api_project_opening_create(request, project_id: int):
    from .room import create_opening

    project = _project_or_404(project_id)
    try:
        opening = create_opening(project, _body(request))
        return _room_payload_response(
            project, f"Ouverture « {opening} » ajoutée.", status=201
        )
    except (ValueError, TypeError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_room_history_view
def api_project_opening_update(request, project_id: int, opening_id: int):
    from .room import update_opening

    project = _project_or_404(project_id)
    opening = get_object_or_404(RoomOpening, pk=opening_id, project=project)
    try:
        update_opening(opening, _body(request))
        return _room_payload_response(project, "Ouverture mise à jour.")
    except (ValueError, TypeError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_room_history_view
def api_project_opening_delete(request, project_id: int, opening_id: int):
    project = _project_or_404(project_id)
    opening = get_object_or_404(RoomOpening, pk=opening_id, project=project)
    name = str(opening)
    opening.delete()
    return _room_payload_response(project, f"Ouverture « {name} » supprimée.")


@require_POST
@record_room_history_view
def api_project_item_add(request, project_id: int):
    from .library import create_cabinet_from_preset, get_preset
    from .room import add_cabinet_to_room

    project = _project_or_404(project_id)
    try:
        data = _body(request)
        preset_key = data.get("preset_key")
        created_cabinet = None
        elevation = 0.0
        if preset_key:
            preset = get_preset(str(preset_key))
            if preset is None:
                raise ValueError("Modèle de caisson introuvable.")
            created_cabinet = create_cabinet_from_preset(preset)
            elevation = float(preset.get("default_elevation") or 0)
            cabinet = created_cabinet
        else:
            cabinet = Cabinet.objects.filter(pk=data.get("cabinet_id")).first()
            if cabinet is None:
                raise ValueError("Caisson introuvable.")
        if project.items.filter(cabinet=cabinet).exists():
            raise ValueError("Ce caisson est déjà dans l'affaire.")
        item = add_cabinet_to_room(project, cabinet, elevation=elevation)
        return _room_payload_response(
            project,
            f"Caisson « {cabinet.name} » posé dans la pièce.",
            status=201,
            extra={"item_id": item.pk},
        )
    except (ValueError, TypeError, CabinetDesignError, GeometryError) as exc:
        if "created_cabinet" in locals() and created_cabinet is not None:
            created_cabinet.delete()
        return _error(exc)


@require_POST
@record_room_history_view
def api_project_item_update(request, project_id: int, item_id: int):
    from .room import update_item

    project = _project_or_404(project_id)
    item = get_object_or_404(ProjectItem, pk=item_id, project=project)
    try:
        update_item(item, _body(request))
        return _room_payload_response(project, "Placement mis à jour.")
    except (ValueError, TypeError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_room_history_view
def api_project_item_delete(request, project_id: int, item_id: int):
    project = _project_or_404(project_id)
    item = get_object_or_404(ProjectItem, pk=item_id, project=project)
    name = item.cabinet.name
    item.delete()
    return _room_payload_response(project, f"Caisson « {name} » retiré de la pièce.")


@require_POST
@record_room_history_view
def api_project_appliance_add(request, project_id: int):
    from .library import get_appliance_preset
    from .room import add_appliance_to_room

    project = _project_or_404(project_id)
    try:
        data = _body(request)
        preset = get_appliance_preset(str(data.get("preset_key") or ""))
        if preset is None:
            raise ValueError("Modèle d'appareil introuvable.")
        cabinet_id = data.get("cabinet_id")
        appliance = add_appliance_to_room(
            project, preset, cabinet_id=int(cabinet_id) if cabinet_id else None
        )
        return _room_payload_response(
            project,
            f"Appareil « {appliance} » posé dans la pièce.",
            status=201,
            extra={"appliance_id": appliance.pk},
        )
    except (ValueError, TypeError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_room_history_view
def api_project_appliance_update(request, project_id: int, appliance_id: int):
    from .room import update_appliance

    project = _project_or_404(project_id)
    appliance = get_object_or_404(
        RoomAppliance, pk=appliance_id, project=project
    )
    try:
        update_appliance(appliance, _body(request))
        return _room_payload_response(project, "Appareil mis à jour.")
    except (ValueError, TypeError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_room_history_view
def api_project_appliance_delete(request, project_id: int, appliance_id: int):
    project = _project_or_404(project_id)
    appliance = get_object_or_404(
        RoomAppliance, pk=appliance_id, project=project
    )
    name = str(appliance)
    appliance.delete()
    return _room_payload_response(
        project, f"Appareil « {name} » retiré de la pièce."
    )


@require_POST
@record_room_history_view
def api_project_worktop_add(request, project_id: int):
    from .room import add_worktop_to_room

    project = _project_or_404(project_id)
    try:
        worktop = add_worktop_to_room(project, _body(request))
        return _room_payload_response(
            project,
            f"Plan de travail « {worktop} » ajouté.",
            status=201,
            extra={"worktop_id": worktop.pk},
        )
    except (ValueError, TypeError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_room_history_view
def api_project_worktop_update(request, project_id: int, worktop_id: int):
    from .room import update_worktop

    project = _project_or_404(project_id)
    worktop = get_object_or_404(RoomWorktop, pk=worktop_id, project=project)
    try:
        update_worktop(worktop, _body(request))
        return _room_payload_response(project, "Plan de travail mis à jour.")
    except (ValueError, TypeError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_room_history_view
def api_project_worktop_delete(request, project_id: int, worktop_id: int):
    project = _project_or_404(project_id)
    worktop = get_object_or_404(RoomWorktop, pk=worktop_id, project=project)
    name = str(worktop)
    worktop.delete()
    return _room_payload_response(
        project, f"Plan de travail « {name} » supprimé."
    )


@require_POST
def api_project_version_create(request, project_id: int):
    from .room import create_version

    project = _project_or_404(project_id)
    try:
        data = _body(request)
        version = create_version(
            project, data.get("name") or "", data.get("note") or ""
        )
        return _room_payload_response(
            project, f"Version « {version.name} » enregistrée.", status=201
        )
    except (ValueError, TypeError) as exc:
        return _error(exc)


@require_POST
@record_room_history_view
def api_project_version_restore(request, project_id: int, version_id: int):
    from .room import restore_version

    project = _project_or_404(project_id)
    version = get_object_or_404(ProjectVersion, pk=version_id, project=project)
    try:
        result = restore_version(project, version)
        message = f"Version « {version.name} » restaurée."
        if result.get("missing_cabinets"):
            message += (
                f" {result['missing_cabinets']} caisson(s) supprimé(s) "
                "entre-temps n'ont pas pu être restaurés."
            )
        return _room_payload_response(project, message)
    except (ValueError, TypeError) as exc:
        return _error(exc)


@require_POST
def api_project_room_undo(request, project_id: int):
    project = _project_or_404(project_id)
    label = step_room(project, "undo")
    return _room_payload_response(project, f"Annulé : {label}" if label else "Rien à annuler.")


@require_POST
def api_project_room_redo(request, project_id: int):
    project = _project_or_404(project_id)
    label = step_room(project, "redo")
    return _room_payload_response(project, f"Rétabli : {label}" if label else "Rien à rétablir.")


@require_POST
def api_project_duplicate(request, project_id: int):
    from .room import duplicate_project

    project = _project_or_404(project_id)
    try:
        data = _body(request)
        clone = duplicate_project(project, data.get("name") or "")
        return JsonResponse(
            {
                "ok": True,
                "message": f"Affaire dupliquée : « {clone.name} ».",
                "project_id": clone.pk,
                "url": reverse("poly:project_room", args=[clone.pk]),
            },
            status=201,
        )
    except (ValueError, TypeError) as exc:
        return _error(exc)


# ----------------------------------------------------------------------
# Modèles de caissons (gabarits paramétriques)
# ----------------------------------------------------------------------
@require_POST
def template_create(request, cabinet_id: int):
    """Enregistre le caisson courant comme modèle réutilisable."""
    from .history import capture_cabinet

    cabinet = _cabinet_or_404(cabinet_id)
    name = (request.POST.get("template_name") or f"Modèle {cabinet.name}").strip()
    description = (request.POST.get("template_description") or "").strip()
    template = CabinetTemplate.objects.create(
        name=name,
        description=description,
        payload=capture_cabinet(cabinet),
        source_cabinet=cabinet,
    )
    messages.success(request, f"Modèle « {template.name} » enregistré.")
    return redirect("poly:editor", cabinet_id=cabinet.pk)


@require_POST
def template_instantiate(request, template_id: int):
    """Crée un nouveau caisson à partir d'un modèle (dimensions surchargées)."""
    from .history import clone_cabinet_from_payload

    template = get_object_or_404(CabinetTemplate, pk=template_id)
    payload = template.payload
    source = payload.get("cabinet") or {}
    name = (request.POST.get("name") or f"{template.name} (copie)").strip()

    def _dim(field, fallback):
        raw = request.POST.get(field)
        try:
            value = float(raw) if raw else None
        except (TypeError, ValueError):
            value = None
        return value if value and value >= 50 else fallback

    width = _dim("width", float(source.get("width") or 1000))
    height = _dim("height", float(source.get("height") or 720))
    depth = _dim("depth", float(source.get("depth") or 350))

    material = Material.objects.filter(
        pk=source.get("material_carcase_id")
    ).first() or Material.objects.filter(is_default=True).first() or Material.objects.first()
    if material is None:
        messages.error(request, "Aucun matériau disponible pour instancier le modèle.")
        return redirect("poly:home")
    back = Material.objects.filter(pk=source.get("material_back_id")).first()

    cabinet = create_cabinet(
        name=name,
        width=width,
        height=height,
        depth=depth,
        material=material,
        material_back=back,
    )
    try:
        clone_cabinet_from_payload(cabinet, payload)
        # la copie remplace tous les champs du caisson : on ré-applique
        # le nom et les dimensions demandés, puis on relance le solveur
        if (
            cabinet.name != name
            or abs(float(cabinet.width) - width) > 0.01
            or abs(float(cabinet.height) - height) > 0.01
            or abs(float(cabinet.depth) - depth) > 0.01
        ):
            cabinet.name = name
            cabinet.width, cabinet.height, cabinet.depth = width, height, depth
            cabinet.save()
            CabinetDesignService(cabinet).rebuild()
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        cabinet.delete()
        messages.error(request, f"Instanciation impossible : {exc}")
        return redirect("poly:home")
    messages.success(request, f"Caisson « {name} » créé à partir du modèle.")
    return redirect("poly:editor", cabinet_id=cabinet.pk)


@require_POST
def template_delete(request, template_id: int):
    template = get_object_or_404(CabinetTemplate, pk=template_id)
    name = template.name
    template.delete()
    messages.success(request, f"Modèle « {name} » supprimé.")
    return redirect("poly:home")


@require_GET
def project_croquis_pdf(request, project_id: int):
    from .pdf_export import build_project_sketch_pdf, build_room_sketch_pdf

    project = _project_or_404(project_id)
    try:
        if project.placement_mode == Project.PLACEMENT_ROOM:
            return build_room_sketch_pdf(project)
        return build_project_sketch_pdf(project)
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return HttpResponse(
            f"Impossible de générer le croquis : {exc}",
            status=400,
            content_type="text/plain; charset=utf-8",
        )


@require_GET
def project_cutlist_pdf(request, project_id: int):
    from .pdf_export import build_project_cutlist_pdf

    project = _project_or_404(project_id)
    try:
        return build_project_cutlist_pdf(project)
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return HttpResponse(
            f"Impossible de générer la liste de débit : {exc}",
            status=400,
            content_type="text/plain; charset=utf-8",
        )


@require_GET
def project_nesting_pdf(request, project_id: int):
    from .pdf_export import build_project_nesting_pdf

    project = _project_or_404(project_id)
    try:
        return build_project_nesting_pdf(project)
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return HttpResponse(
            f"Impossible de générer l'optimisation : {exc}",
            status=400,
            content_type="text/plain; charset=utf-8",
        )


@require_GET
def project_quote_pdf(request, project_id: int):
    from .pdf_export import build_project_quote_pdf

    project = _project_or_404(project_id)
    try:
        return build_project_quote_pdf(project)
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return HttpResponse(
            f"Impossible de générer le devis : {exc}",
            status=400,
            content_type="text/plain; charset=utf-8",
        )


# ----------------------------------------------------------------------
# API caissons
# ----------------------------------------------------------------------
@require_http_methods(["POST"])
def api_create_cabinet(request):
    try:
        data = _body(request)
        material = Material.objects.filter(pk=data.get("material_id")).first()
        if material is None:
            raise CabinetDesignError("Matériau de carcasse introuvable.")
        back = None
        if data.get("material_back_id"):
            back = Material.objects.filter(pk=data["material_back_id"]).first()
            if back is None:
                raise CabinetDesignError("Matériau de fond introuvable.")
        else:
            back = (
                Material.objects.exclude(pk=material.pk)
                .filter(thickness__lte=6)
                .order_by("thickness")
                .first()
            )
        cabinet = create_cabinet(
            name=str(data.get("name") or "Nouveau meuble")[:150],
            width=float(data.get("width", 1000)),
            height=float(data.get("height", 720)),
            depth=float(data.get("depth", 350)),
            material=material,
            material_back=back,
            bottom_setback=float(data.get("bottom_setback", 0) or 0),
            has_doors=bool(data.get("has_doors", False)),
            has_hanging_rail=bool(data.get("has_hanging_rail", False)),
            hanging_rail_height=float(
                data.get("hanging_rail_height", 1800) or 1800
            ),
            plinth_height=float(data.get("plinth_height", 100) or 0),
        )
        service = CabinetDesignService(cabinet)
        scene = service.scene()
        return _scene_response(scene, "Caisson créé.", status=201)
    except (CabinetDesignError, GeometryError, ValueError, TypeError) as exc:
        return _error(exc)


@require_GET
def api_scene(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        scene = CabinetDesignService(cabinet).scene_safe()
        return _scene_response(scene)
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)


@require_POST
def api_undo(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        result = undo_cabinet(cabinet)
        return _scene_response(result["scene"], result["message"])
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)


@require_POST
def api_redo(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        result = redo_cabinet(cabinet)
        return _scene_response(result["scene"], result["message"])
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)


@require_GET
def api_history(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    return JsonResponse(
        {
            "ok": True,
            "entries": history_entries(cabinet),
            "history": history_state(cabinet),
        }
    )


@require_POST
def api_history_rollback(request, cabinet_id: int, entry_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        result = rollback_history(cabinet, entry_id)
        return _scene_response(result["scene"], result["message"])
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)


@require_http_methods(["PATCH", "PUT"])
@record_history_view
def api_update_cabinet(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        result = CabinetDesignService(cabinet).update_cabinet(_body(request))
        return _scene_response(result["scene"], result["message"])
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)


@require_POST
def api_delete_cabinet(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    cabinet.delete()
    return JsonResponse({"ok": True, "message": "Caisson supprimé."})


# ----------------------------------------------------------------------
# API décomposition
# ----------------------------------------------------------------------
@require_POST
@record_history_view
def api_split(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        data = _body(request)
        result = CabinetDesignService(cabinet).split_volume(
            volume_id=int(data["volume_id"]),
            direction=data.get("direction", "vertical"),
            position=float(data["position"]),
            mode=data.get("mode", "absolute"),
            side=data.get("side", False),
        )
        return _scene_response(result["scene"], result["message"])
    except (KeyError, TypeError, ValueError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_history_view
def api_compartment_grid(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        data = _body(request)
        result = CabinetDesignService(cabinet).add_compartment_grid(
            volume_id=int(data["volume_id"]),
            columns=data.get("columns", 4),
            rows=data.get("rows", 2),
            column_widths=data.get("column_widths"),
            row_heights=data.get("row_heights"),
            top_row_height=data.get("top_row_height"),
        )
        return _scene_response(result["scene"], result["message"])
    except (KeyError, TypeError, ValueError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_http_methods(["PATCH", "PUT"])
@record_history_view
def api_update_split(request, cabinet_id: int, volume_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        data = _body(request)
        result = CabinetDesignService(cabinet).update_split(
            volume_id=volume_id,
            position=float(data["position"]),
            mode=data.get("mode", "absolute"),
        )
        return _scene_response(result["scene"], result["message"])
    except (KeyError, TypeError, ValueError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_http_methods(["DELETE"])
@record_history_view
def api_delete_split(request, cabinet_id: int, volume_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        result = CabinetDesignService(cabinet).remove_split(volume_id)
        return _scene_response(result["scene"], result["message"])
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)


@require_POST
@record_history_view
def api_shelf(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        data = _body(request)
        left_partition_id = data.get("left_partition_id")
        right_partition_id = data.get("right_partition_id")
        result = CabinetDesignService(cabinet).add_shelf(
            volume_id=int(data["volume_id"]),
            position=float(data["position"]),
            mode=data.get("mode", "absolute"),
            depth_clearance_front=float(data.get("depth_clearance_front", 0) or 0),
            material_id=data.get("material_id"),
            left_partition_id=(
                int(left_partition_id) if left_partition_id is not None else None
            ),
            right_partition_id=(
                int(right_partition_id) if right_partition_id is not None else None
            ),
        )
        return _scene_response(result["scene"], result["message"])
    except (KeyError, TypeError, ValueError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_history_view
def api_shelf_series(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        data = _body(request)
        lower_shelf_id = data.get("lower_shelf_id")
        upper_shelf_id = data.get("upper_shelf_id")
        left_partition_id = data.get("left_partition_id")
        right_partition_id = data.get("right_partition_id")
        volume_id = data.get("volume_id")
        result = CabinetDesignService(cabinet).add_shelf_series(
            volume_id=int(volume_id) if volume_id is not None else None,
            count=data.get("count", 5),
            lower_shelf_id=(
                int(lower_shelf_id) if lower_shelf_id is not None else None
            ),
            upper_shelf_id=(
                int(upper_shelf_id) if upper_shelf_id is not None else None
            ),
            depth_clearance_front=float(data.get("depth_clearance_front", 0) or 0),
            material_id=data.get("material_id"),
            left_partition_id=(
                int(left_partition_id) if left_partition_id is not None else None
            ),
            right_partition_id=(
                int(right_partition_id) if right_partition_id is not None else None
            ),
        )
        return _scene_response(result["scene"], result["message"])
    except (KeyError, TypeError, ValueError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_history_view
def api_side_series(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        data = _body(request)
        volume_id = data.get("volume_id")
        result = CabinetDesignService(cabinet).add_side_series(
            volume_id=int(volume_id) if volume_id is not None else None,
            count=data.get("count", 2),
        )
        return _scene_response(result["scene"], result["message"])
    except (KeyError, TypeError, ValueError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_history_view
def api_move_element(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        data = _body(request)
        source_component_id = data.get("source_component_id")
        source_component_ids = data.get("source_component_ids")
        result = CabinetDesignService(cabinet).move_element(
            source_volume_id=int(data["source_volume_id"]),
            target_volume_id=int(data["target_volume_id"]),
            source_component_id=(
                int(source_component_id)
                if source_component_id is not None
                else None
            ),
            source_component_ids=(
                [int(component_id) for component_id in source_component_ids]
                if isinstance(source_component_ids, list)
                else None
            ),
            copy=bool(data.get("copy", False)),
        )
        return _scene_response(result["scene"], result["message"])
    except (KeyError, TypeError, ValueError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_POST
@record_history_view
def api_partition(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        data = _body(request)
        service = CabinetDesignService(cabinet)
        shelf_ids = data.get("shelf_ids")
        if shelf_ids is not None:
            if not isinstance(shelf_ids, list):
                raise CabinetDesignError("Sélectionnez deux étagères.")
            result = service.add_partition_between_shelves(
                shelf_ids=shelf_ids,
                position=float(data["position"]),
                mode=data.get("mode", "ratio"),
            )
        else:
            volume_id = data.get("volume_id")
            lower_shelf_id = data.get("lower_shelf_id")
            upper_shelf_id = data.get("upper_shelf_id")
            result = service.add_partition(
                volume_id=int(volume_id) if volume_id is not None else None,
                lower_shelf_id=int(lower_shelf_id) if lower_shelf_id is not None else None,
                upper_shelf_id=int(upper_shelf_id) if upper_shelf_id is not None else None,
                position=float(data["position"]),
                mode=data.get("mode", "ratio"),
            )
        return _scene_response(result["scene"], result["message"])
    except (KeyError, TypeError, ValueError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_http_methods(["DELETE"])
@record_history_view
def api_delete_component(request, cabinet_id: int, component_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        result = CabinetDesignService(cabinet).remove_component(component_id)
        return _scene_response(result["scene"], result["message"])
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)


@require_POST
@record_history_view
def api_delete_components(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        data = _body(request)
        component_ids = data.get("component_ids")
        if not isinstance(component_ids, list) or not component_ids:
            raise CabinetDesignError("Sélectionnez les éléments à supprimer.")
        result = CabinetDesignService(cabinet).remove_components(
            [int(component_id) for component_id in component_ids]
        )
        return _scene_response(result["scene"], result["message"])
    except (KeyError, TypeError, ValueError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_http_methods(["PATCH", "PUT"])
@record_history_view
def api_update_component(request, cabinet_id: int, component_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        data = _body(request)
        result = CabinetDesignService(cabinet).update_component(component_id, data)
        return _scene_response(result["scene"], result["message"])
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)


@require_http_methods(["PATCH", "PUT"])
@record_history_view
def api_update_carcass_panel(request, cabinet_id: int, side: str):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        data = _body(request)
        result = CabinetDesignService(cabinet).update_carcass_panel(side, data)
        return _scene_response(result["scene"], result["message"])
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)


@require_POST
@record_history_view
def api_plinth(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        data = _body(request)
        result = CabinetDesignService(cabinet).set_plinth(
            height=data.get("height"),
            setback=data.get("setback"),
        )
        return _scene_response(result["scene"], result["message"])
    except (TypeError, ValueError, CabinetDesignError, GeometryError) as exc:
        return _error(exc)


@require_http_methods(["DELETE"])
@record_history_view
def api_delete_plinth(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        result = CabinetDesignService(cabinet).remove_plinth()
        return _scene_response(result["scene"], result["message"])
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)


# ----------------------------------------------------------------------
# API cut-list / devis
# ----------------------------------------------------------------------
@require_GET
def api_cutlist(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        scene = CabinetDesignService(cabinet).scene_safe()
        return JsonResponse(
            {
                "ok": True,
                "cutlist": scene["cutlist"],
                "summary": {
                    "panel_count": scene["stats"]["panel_count"],
                    "shelf_count": scene["stats"]["shelf_count"],
                    "divider_count": scene["stats"]["divider_count"],
                },
            }
        )
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)


@require_GET
def cutlist_csv(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        CabinetDesignService(cabinet).rebuild()
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return HttpResponse(
            f"Impossible de générer la liste de débit : {exc}",
            status=400,
            content_type="text/plain; charset=utf-8",
        )
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="liste-debit-{cabinet.pk}.csv"'
    response.write("\ufeff")
    writer = csv.writer(response, delimiter=";")
    writer.writerow(
        [
            "Référence",
            "Catégorie",
            "Matériau",
            "Longueur (mm)",
            "Largeur (mm)",
            "Épaisseur (mm)",
            "Quantité",
            "Surface (m²)",
            "Chant",
            "Coût (€)",
        ]
    )
    total = 0.0
    for panel in cabinet.panels.select_related("material"):
        total += panel.cost
        writer.writerow(
            [
                panel.name,
                panel.get_category_display() if hasattr(panel, "get_category_display") else panel.category,
                panel.material.name,
                f"{panel.length:.1f}".replace(".", ","),
                f"{panel.width:.1f}".replace(".", ","),
                f"{panel.thickness:.1f}".replace(".", ","),
                panel.quantity,
                f"{panel.area_m2:.4f}".replace(".", ","),
                panel.edge_banding,
                f"{panel.cost:.2f}".replace(".", ","),
            ]
        )
    writer.writerow([])
    writer.writerow(["", "", "", "", "", "", "", "", "TOTAL", f"{total:.2f}".replace(".", ",")])
    return response


@require_GET
def croquis_pdf(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        return build_sketch_pdf(cabinet)
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return HttpResponse(
            f"Impossible de générer le croquis : {exc}",
            status=400,
            content_type="text/plain; charset=utf-8",
        )


@require_GET
def cutlist_pdf(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        CabinetDesignService(cabinet).rebuild()
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return HttpResponse(
            f"Impossible de générer la liste de débit : {exc}",
            status=400,
            content_type="text/plain; charset=utf-8",
        )
    try:
        return build_cutlist_pdf(cabinet)
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return HttpResponse(
            f"Impossible de générer la liste de débit : {exc}",
            status=400,
            content_type="text/plain; charset=utf-8",
        )


@require_http_methods(["PATCH", "PUT"])
@record_history_view
def api_update_hardware(request, cabinet_id: int):
    """Attache / détache des règles de quincaillerie au caisson."""
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        data = _body(request)
        rule_ids = data.get("rule_ids")
        if not isinstance(rule_ids, list):
            raise CabinetDesignError("rule_ids doit être une liste d'identifiants.")
        rules = HardwareRule.objects.filter(pk__in=rule_ids)
        cabinet.hardware_rules.set(rules)
        service = CabinetDesignService(cabinet)
        service.rebuild()
        return _scene_response(
            service.scene_safe(),
            f"Quincaillerie mise à jour ({len(rules)} règle(s) active(s)).",
        )
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)


@require_GET
def api_nesting(request, cabinet_id: int):
    """Optimisation de découpe : JSON consommé par l'onglet Optimisation."""
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        CabinetDesignService(cabinet).rebuild()
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)
    from .engine.nesting import build_nesting

    kerf = request.GET.get("kerf")
    try:
        kerf_value = float(kerf) if kerf is not None else None
    except (TypeError, ValueError):
        return _error("Trait de scie invalide.")
    try:
        data = (
            build_nesting(cabinet, kerf=kerf_value)
            if kerf_value is not None
            else build_nesting(cabinet)
        )
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)
    return JsonResponse(data)


@require_GET
def nesting_pdf(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        CabinetDesignService(cabinet).rebuild()
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return HttpResponse(
            f"Impossible de générer l'optimisation : {exc}",
            status=400,
            content_type="text/plain; charset=utf-8",
        )
    from .pdf_export import build_nesting_pdf

    try:
        return build_nesting_pdf(cabinet)
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return HttpResponse(
            f"Impossible de générer l'optimisation : {exc}",
            status=400,
            content_type="text/plain; charset=utf-8",
        )


@require_GET
def api_quote(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        scene = CabinetDesignService(cabinet).scene_safe()
        if not scene["quote"]:
            return _error("Aucun devis pour ce caisson.", status=404)
        return JsonResponse({"ok": True, "quote": scene["quote"]})
    except (CabinetDesignError, GeometryError, ValueError) as exc:
        return _error(exc)


@require_http_methods(["PATCH", "PUT"])
def api_update_quote(request, cabinet_id: int):
    cabinet = _cabinet_or_404(cabinet_id)
    try:
        quote = Quote.objects.filter(cabinet=cabinet).first()
        if quote is None:
            raise CabinetDesignError("Aucun devis pour ce caisson.")
        data = _body(request)
        if "client_name" in data:
            name = str(data["client_name"]).strip()
            if not name:
                raise CabinetDesignError("Le nom du client est obligatoire.")
            quote.client_name = name[:200]
        for field in ("client_email", "client_phone", "notes"):
            if field in data:
                setattr(quote, field, str(data[field])[:500])
        if "status" in data:
            if data["status"] not in dict(Quote.STATUS_CHOICES):
                raise CabinetDesignError("Statut de devis invalide.")
            quote.status = data["status"]
        if "margin_percent" in data:
            margin = float(data["margin_percent"])
            if margin < 0 or margin > 300:
                raise CabinetDesignError("La marge doit être comprise entre 0 et 300 %.")
            quote.margin_percent = margin
        if "tax_rate" in data:
            tax = float(data["tax_rate"])
            if tax < 0 or tax > 100:
                raise CabinetDesignError("La TVA doit être comprise entre 0 et 100 %.")
            quote.tax_rate = tax
        quote.save()
        scene = CabinetDesignService(cabinet).scene()
        return _scene_response(scene, "Devis mis à jour.")
    except (CabinetDesignError, GeometryError, ValueError, TypeError) as exc:
        return _error(exc)


# ----------------------------------------------------------------------
# API matériaux
# ----------------------------------------------------------------------
@require_GET
def api_materials(request):
    return JsonResponse(
        {
            "ok": True,
            "materials": [
                {
                    "id": material.pk,
                    "name": material.name,
                    "thickness": material.thickness,
                    "price_per_m2": material.price_per_m2,
                    "color": material.color,
                    "is_default": material.is_default,
                }
                for material in Material.objects.all()
            ],
        }
    )
