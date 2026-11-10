"""Le catalogue de l'atelier dans l'application (/catalogue/) : matériaux, quincaillerie et profil s'y gèrent sans
l'administration, par le personnel de l'atelier ; les autres comptes les lisent sans pouvoir les changer."""
import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from apps.catalog.models import CompanyProfile, HardwareRule, Material

BASE = "/catalogue/"

MATERIAL = {
    "name": "Chêne massif 22 mm",
    "category": "wood",
    "thickness": "22",
    "price_per_m2": "95",
    "color": "#b08850",
    "sheet_width": "2500",
    "sheet_length": "1250",
}


@pytest.mark.django_db
def test_pages_need_login():
    response = Client().get(f"{BASE}materiaux/")
    assert response.status_code == 302 and "/accounts/login/" in response["Location"]


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["materiaux/", "materiaux/nouveau/", "quincaillerie/", "quincaillerie/nouveau/", "tarifs/", "atelier/"])
def test_pages_render(client_staff, path):
    response = client_staff.get(BASE + path)
    assert response.status_code == 200
    assert "/admin/" not in response.content.decode()


@pytest.mark.django_db
def test_index_goes_to_materials(client_staff):
    assert client_staff.get(BASE)["Location"] == f"{BASE}materiaux/"


@pytest.mark.django_db
def test_lists_show_the_catalog(client_staff):
    assert "Noyer américain" in client_staff.get(f"{BASE}materiaux/").content.decode()
    assert "Charnière à clip 35 mm" in client_staff.get(f"{BASE}quincaillerie/").content.decode()


@pytest.mark.django_db
def test_add_edit_and_delete_a_material(client_staff):
    response = client_staff.post(f"{BASE}materiaux/nouveau/", MATERIAL)
    assert response.status_code == 302 and response["Location"] == f"{BASE}materiaux/"
    oak = Material.objects.get(name="Chêne massif 22 mm")
    assert (oak.thickness, oak.price_per_m2, oak.category, oak.sheet_width) == (22, 95, "wood", 2500)

    client_staff.post(f"{BASE}materiaux/{oak.pk}/", {**MATERIAL, "price_per_m2": "120"})
    oak.refresh_from_db()
    assert oak.price_per_m2 == 120

    client_staff.post(f"{BASE}materiaux/{oak.pk}/supprimer/")
    assert not Material.objects.filter(pk=oak.pk).exists()


@pytest.mark.django_db
def test_invalid_material_shows_the_errors(client_staff):
    response = client_staff.post(f"{BASE}materiaux/nouveau/", {**MATERIAL, "thickness": "0"})
    assert response.status_code == 200
    assert "field-error" in response.content.decode()
    assert not Material.objects.filter(name=MATERIAL["name"]).exists()


@pytest.mark.django_db
def test_one_default_material(client_staff):
    client_staff.post(f"{BASE}materiaux/nouveau/", {**MATERIAL, "is_default": "on"})
    assert list(Material.objects.filter(is_default=True).values_list("name", flat=True)) == ["Chêne massif 22 mm"]


@pytest.mark.django_db
def test_add_and_edit_hardware(client_staff):
    client_staff.post(
        f"{BASE}quincaillerie/nouveau/",
        {"name": "Vérin", "description": "", "unit": "u", "unit_price": "4.5", "default_quantity": "1", "auto_mode": "door", "auto_per_unit": "2"},
    )
    rule = HardwareRule.objects.get(name="Vérin")
    assert (rule.auto_mode, rule.auto_per_unit, rule.unit_price) == ("door", 2, 4.5)
    client_staff.post(f"{BASE}quincaillerie/{rule.pk}/supprimer/")
    assert not HardwareRule.objects.filter(name="Vérin").exists()


@pytest.mark.django_db
def test_company_profile_with_a_logo(client_staff):
    logo = SimpleUploadedFile("logo.png", b"\x89PNG\r\n\x1a\n", content_type="image/png")
    response = client_staff.post(
        f"{BASE}atelier/",
        {"name": "Atelier Sona", "slogan": "", "address": "1 rue du Bois", "phone": "", "email": "", "website": "", "logo_file": logo},
    )
    assert response.status_code == 302
    profile = CompanyProfile.load()
    assert profile.name == "Atelier Sona" and profile.logo.startswith("data:image/png;base64,")
    assert 'alt="Logo de l\'atelier"' in client_staff.get(f"{BASE}atelier/").content.decode()


@pytest.mark.django_db
def test_the_catalogue_is_cao_studio_s_own(client_staff):
    content = client_staff.get(f"{BASE}materiaux/").content.decode()
    assert "CAO Studio" in content and "poly" not in content.lower().replace("polypropyl", "")
    assert f"{BASE}materiaux/" in content and f"{BASE}quincaillerie/" in content and f"{BASE}atelier/" in content
    assert "bibliotheque" not in content
    # Deleting asks first, in the page.
    assert 'data-confirm="Supprimer le matériau' in content and 'id="confirm-dialog"' in content


@pytest.mark.django_db
def test_the_quote_s_rates_are_the_workshop_s(client_staff):
    page = client_staff.get(f"{BASE}tarifs/")
    assert page.status_code == 200 and "Tarifs du devis" in page.content.decode()
    rates = {"waste": "12", "band": "2", "cut_per_part": "5", "hours_per_part": "0.3", "hourly": "50", "per_hole": "0.5", "margin": "35", "vat": "20"}
    response = client_staff.post(f"{BASE}tarifs/", rates)
    assert response.status_code == 302 and response["Location"] == f"{BASE}tarifs/"
    profile = CompanyProfile.load()
    assert (profile.waste, profile.hourly, profile.margin) == (12, 50, 35)
    # The editor gets them with the catalogue.
    assert client_staff.get("/api/catalog/").json()["rates"] == {"waste": 12, "band": 2, "cutPerPart": 5, "hoursPerPart": 0.3, "hourly": 50, "perHole": 0.5, "margin": 35, "vat": 20}
    # A VAT over 100 %: refused, nothing kept.
    bad = client_staff.post(f"{BASE}tarifs/", {**rates, "vat": "150"})
    assert bad.status_code == 200 and "field-error" in bad.content.decode()


@pytest.mark.django_db
def test_the_editor_s_quote_changes_the_rates(client_staff):
    url = "/api/catalog/rates/"
    response = client_staff.post(url, json.dumps({"margin": 40, "hourly": 55.5}), content_type="application/json")
    assert response.status_code == 200 and response.json()["rates"]["margin"] == 40
    assert (CompanyProfile.load().margin, CompanyProfile.load().hourly) == (40, 55.5)
    assert client_staff.post(url, json.dumps({"vat": -1}), content_type="application/json").status_code == 400
    assert client_staff.post(url, json.dumps({"vat": 300}), content_type="application/json").status_code == 400
    assert client_staff.post(url, json.dumps({"margin": "beaucoup"}), content_type="application/json").status_code == 400
    assert CompanyProfile.load().vat == 20
    assert Client().post(url, json.dumps({"margin": 1}), content_type="application/json").status_code == 401


# ---- the other accounts: they read, they do not change ---------------------------------------------------------------


@pytest.mark.django_db
def test_an_account_not_of_the_staff_reads_the_catalogue(client_logged):
    for path in ("materiaux/", "quincaillerie/"):
        content = client_logged.get(BASE + path).content.decode()
        assert "data-staff-only" in content and "Modifier</a>" not in content and "/supprimer/" not in content and "/nouveau/" not in content
    for path in ("tarifs/", "atelier/"):
        content = client_logged.get(BASE + path).content.decode()
        assert "data-staff-only" in content and "disabled" in content and ">Enregistrer</button>" not in content


@pytest.mark.django_db
def test_an_account_not_of_the_staff_cannot_change_the_catalogue(client_logged):
    oak = Material.objects.get(name="Noyer américain")
    rule = HardwareRule.objects.first()
    for path, data in (
        ("materiaux/nouveau/", MATERIAL),
        (f"materiaux/{oak.pk}/", {**MATERIAL, "name": "Pirate"}),
        (f"materiaux/{oak.pk}/supprimer/", {}),
        ("quincaillerie/nouveau/", {"name": "Piège", "unit": "<img src=x onerror=alert(1)>", "unit_price": "1", "default_quantity": "1", "auto_mode": "cabinet", "auto_per_unit": "1"}),
        (f"quincaillerie/{rule.pk}/supprimer/", {}),
    ):
        response = client_logged.post(BASE + path, data)
        assert response.status_code == 302, path
    assert client_logged.get(f"{BASE}materiaux/nouveau/").status_code == 302
    assert Material.objects.filter(pk=oak.pk, name="Noyer américain").exists()
    assert HardwareRule.objects.filter(pk=rule.pk).exists() and not HardwareRule.objects.filter(name="Piège").exists()
    # The rates and the profile: refused, told why.
    response = client_logged.post(f"{BASE}tarifs/", {"waste": "1", "band": "1", "cut_per_part": "1", "hours_per_part": "1", "hourly": "1", "per_hole": "0", "margin": "1", "vat": "1"}, follow=True)
    assert "Seul le personnel" in response.content.decode()
    client_logged.post(f"{BASE}atelier/", {"name": "Escroc", "email": "pirate@example.com"})
    profile = CompanyProfile.load()
    assert (profile.margin, profile.name) == (30, "Mon atelier")


@pytest.mark.django_db
def test_the_editor_s_quote_cannot_change_the_rates_of_an_account_not_of_the_staff(client_logged, client_staff):
    url = "/api/catalog/rates/"
    response = client_logged.post(url, json.dumps({"margin": 1}), content_type="application/json")
    assert response.status_code == 403 and "personnel" in response.json()["error"]
    assert CompanyProfile.load().margin == 30
    assert client_logged.get("/api/catalog/").json()["canEdit"] is False
    assert client_staff.get("/api/catalog/").json()["canEdit"] is True
