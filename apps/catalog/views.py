"""Les paramètres de l'atelier dans l'application (/catalogue/, connexion requise) : les matières, la quincaillerie,
les tarifs du devis et le profil de l'atelier, qui font les prix et l'en-tête du devis, sans passer par
l'administration."""
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import IntegrityError
from django.db.models import ProtectedError
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from .forms import CompanyProfileForm, HardwareRuleForm, MaterialForm, RatesForm
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
}


@login_required
def index(request):
    return redirect("catalog:materials")


@login_required
def materials(request):
    return render(request, "catalog/materials.html", {"section": "materials", "materials": Material.objects.all()})


@login_required
def hardware(request):
    return render(request, "catalog/hardware.html", {"section": "hardware", "rules": HardwareRule.objects.all()})


@login_required
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


@login_required
@require_POST
def delete(request, section: str, pk: int):
    conf = SECTIONS[section]
    row = get_object_or_404(conf["model"], pk=pk)
    try:
        row.delete()
    except (ProtectedError, IntegrityError):
        messages.error(request, f"« {row.name} » est encore utilisé : il ne peut pas être supprimé.")
    else:
        messages.success(request, f"{conf['noun']} « {row.name} » supprimé.")
    return redirect(conf["list"])


@login_required
def company(request):
    profile = CompanyProfile.load()
    form = CompanyProfileForm(request.POST or None, request.FILES or None, instance=profile)
    if request.method == "POST" and form.is_valid():
        form.save()
        messages.success(request, "Profil de l'atelier enregistré.")
        return redirect("catalog:company")
    return render(request, "catalog/form.html", {"section": "company", "form": form, "title": "Profil de l'atelier", "profile": profile, "multipart": True})


@login_required
def rates(request):
    """The quote's rates (offcuts, edge band, cutting, assembly, hourly rate, margin, VAT), for every computer."""
    profile = CompanyProfile.load()
    form = RatesForm(request.POST or None, instance=profile)
    if request.method == "POST" and form.is_valid():
        form.save()
        messages.success(request, "Tarifs du devis enregistrés.")
        return redirect("catalog:rates")
    return render(request, "catalog/form.html", {"section": "rates", "form": form, "title": "Tarifs du devis", "intro": "Ce qui fait le prix du devis, le même sur tous les ordinateurs ; les changer dans le devis de l'éditeur les change ici aussi. Les matières et la quincaillerie ont leur prix dans leurs onglets ; les standards de construction se règlent dans l'éditeur (Atelier → Standard de construction)."})
