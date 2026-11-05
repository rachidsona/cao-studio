"""Le catalogue de l'atelier dans l'application (/poly/catalogue/, connexion requise comme tout /poly/) : les
matières, la quincaillerie, la bibliothèque des modèles de caissons et le profil de l'atelier, sans passer par
l'administration."""
from django.contrib import messages
from django.db.models import ProtectedError
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from apps.furniture.library import preset_groups
from apps.furniture.models import CabinetTemplate

from .forms import CabinetTemplateForm, CompanyProfileForm, HardwareRuleForm, MaterialForm
from .models import CompanyProfile, HardwareRule, Material

# Each section: its model, its form, its list page and the words of its pages.
SECTIONS = {
    "materials": {
        "model": Material,
        "form": MaterialForm,
        "list": "catalog:materials",
        "new": "Nouveau matériau",
        "edit": "Modifier le matériau",
        "noun": "Matériau",
    },
    "hardware": {
        "model": HardwareRule,
        "form": HardwareRuleForm,
        "list": "catalog:hardware",
        "new": "Nouvel article de quincaillerie",
        "edit": "Modifier l'article",
        "noun": "Article",
    },
    "library": {
        "model": CabinetTemplate,
        "form": CabinetTemplateForm,
        "list": "catalog:library",
        "new": "",
        "edit": "Modifier le modèle",
        "noun": "Modèle",
    },
}


def index(request):
    return redirect("catalog:materials")


def materials(request):
    return render(request, "catalog/materials.html", {"section": "materials", "materials": Material.objects.all()})


def hardware(request):
    return render(request, "catalog/hardware.html", {"section": "hardware", "rules": HardwareRule.objects.all()})


def library(request):
    return render(
        request,
        "catalog/library.html",
        {"section": "library", "preset_groups": preset_groups(), "templates": CabinetTemplate.objects.all()},
    )


def edit(request, section: str, pk: int | None = None):
    """Create (pk None) or modify one row of a section."""
    conf = SECTIONS[section]
    instance = get_object_or_404(conf["model"], pk=pk) if pk else None
    form = conf["form"](request.POST or None, instance=instance)
    if request.method == "POST" and form.is_valid():
        row = form.save()
        messages.success(request, f"{conf['noun']} « {row.name} » enregistré.")
        return redirect(conf["list"])
    title = conf["edit"] if instance else conf["new"]
    return render(request, "catalog/form.html", {"section": section, "form": form, "title": title, "back": conf["list"], "instance": instance})


@require_POST
def delete(request, section: str, pk: int):
    conf = SECTIONS[section]
    row = get_object_or_404(conf["model"], pk=pk)
    try:
        row.delete()
    except ProtectedError:
        messages.error(request, f"« {row.name} » est utilisé par des caissons : changez-le d'abord dans ces caissons.")
    else:
        messages.success(request, f"{conf['noun']} « {row.name} » supprimé.")
    return redirect(conf["list"])


def company(request):
    profile = CompanyProfile.load()
    form = CompanyProfileForm(request.POST or None, request.FILES or None, instance=profile)
    if request.method == "POST" and form.is_valid():
        form.save()
        messages.success(request, "Profil de l'atelier enregistré.")
        return redirect("catalog:company")
    return render(request, "catalog/form.html", {"section": "company", "form": form, "title": "Profil de l'atelier", "profile": profile, "multipart": True})
