"""Le catalogue de l'atelier dans l'application (/poly/catalogue/) : matériaux, quincaillerie, bibliothèque et
profil s'y gèrent sans l'administration."""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from apps.catalog.models import CompanyProfile, HardwareRule, Material
from apps.furniture.models import CabinetTemplate
from apps.furniture.services import create_cabinet

BASE = "/poly/catalogue/"

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
@pytest.mark.parametrize("path", ["materiaux/", "materiaux/nouveau/", "quincaillerie/", "quincaillerie/nouveau/", "bibliotheque/", "atelier/"])
def test_pages_render(client_logged, path):
    response = client_logged.get(BASE + path)
    assert response.status_code == 200
    assert "/admin/" not in response.content.decode()


@pytest.mark.django_db
def test_index_goes_to_materials(client_logged):
    assert client_logged.get(BASE)["Location"] == f"{BASE}materiaux/"


@pytest.mark.django_db
def test_lists_show_the_catalog(client_logged):
    assert "Noyer américain" in client_logged.get(f"{BASE}materiaux/").content.decode()
    assert "Charnière à clip 35 mm" in client_logged.get(f"{BASE}quincaillerie/").content.decode()


@pytest.mark.django_db
def test_add_edit_and_delete_a_material(client_logged):
    response = client_logged.post(f"{BASE}materiaux/nouveau/", MATERIAL)
    assert response.status_code == 302 and response["Location"] == f"{BASE}materiaux/"
    oak = Material.objects.get(name="Chêne massif 22 mm")
    assert (oak.thickness, oak.price_per_m2, oak.category, oak.sheet_width) == (22, 95, "wood", 2500)

    client_logged.post(f"{BASE}materiaux/{oak.pk}/", {**MATERIAL, "price_per_m2": "120"})
    oak.refresh_from_db()
    assert oak.price_per_m2 == 120

    client_logged.post(f"{BASE}materiaux/{oak.pk}/supprimer/")
    assert not Material.objects.filter(pk=oak.pk).exists()


@pytest.mark.django_db
def test_invalid_material_shows_the_errors(client_logged):
    response = client_logged.post(f"{BASE}materiaux/nouveau/", {**MATERIAL, "thickness": "0"})
    assert response.status_code == 200
    assert "field-error" in response.content.decode()
    assert not Material.objects.filter(name=MATERIAL["name"]).exists()


@pytest.mark.django_db
def test_one_default_material(client_logged):
    client_logged.post(f"{BASE}materiaux/nouveau/", {**MATERIAL, "is_default": "on"})
    assert list(Material.objects.filter(is_default=True).values_list("name", flat=True)) == ["Chêne massif 22 mm"]


@pytest.mark.django_db
def test_material_in_use_is_kept(client_logged):
    material = Material.objects.get(name="Aggloméré blanc 19 mm")
    create_cabinet(name="Bas", width=600, height=720, depth=560, material=material)
    response = client_logged.post(f"{BASE}materiaux/{material.pk}/supprimer/", follow=True)
    assert Material.objects.filter(pk=material.pk).exists()
    assert "est utilisé par des caissons" in response.content.decode()


@pytest.mark.django_db
def test_add_and_edit_hardware(client_logged):
    client_logged.post(
        f"{BASE}quincaillerie/nouveau/",
        {"name": "Vérin", "description": "", "unit": "u", "unit_price": "4.5", "default_quantity": "1", "auto_mode": "door", "auto_per_unit": "2"},
    )
    rule = HardwareRule.objects.get(name="Vérin")
    assert (rule.auto_mode, rule.auto_per_unit, rule.unit_price) == ("door", 2, 4.5)
    client_logged.post(f"{BASE}quincaillerie/{rule.pk}/supprimer/")
    assert not HardwareRule.objects.filter(name="Vérin").exists()


@pytest.mark.django_db
def test_library_renames_and_deletes_a_template(client_logged):
    template = CabinetTemplate.objects.create(name="Bas 60", payload={"cabinet": {"width": 600, "height": 720, "depth": 560}})
    page = client_logged.get(f"{BASE}bibliotheque/").content.decode()
    assert "600 × 720 × 560 mm" in page
    assert f'action="/poly/caisson/modele/{template.pk}/instancier/"' in page
    client_logged.post(f"{BASE}bibliotheque/{template.pk}/", {"name": "Bas 60 évier", "description": "Sous l'évier"})
    template.refresh_from_db()
    assert (template.name, template.description) == ("Bas 60 évier", "Sous l'évier")
    client_logged.post(f"{BASE}bibliotheque/{template.pk}/supprimer/")
    assert not CabinetTemplate.objects.exists()


@pytest.mark.django_db
def test_company_profile_with_a_logo(client_logged):
    logo = SimpleUploadedFile("logo.png", b"\x89PNG\r\n\x1a\n", content_type="image/png")
    response = client_logged.post(
        f"{BASE}atelier/",
        {"name": "Atelier Sona", "slogan": "", "address": "1 rue du Bois", "phone": "", "email": "", "website": "", "logo_file": logo},
    )
    assert response.status_code == 302
    profile = CompanyProfile.load()
    assert profile.name == "Atelier Sona" and profile.logo.startswith("data:image/png;base64,")
    assert 'alt="Logo de l\'atelier"' in client_logged.get(f"{BASE}atelier/").content.decode()


@pytest.mark.django_db
def test_workshop_links_to_the_catalog_not_the_admin(client_logged):
    content = client_logged.get("/poly/").content.decode()
    assert "/admin/" not in content
    # The dashboard keeps the new cabinet, the materials and the recent cabinets only.
    assert "Nouveau caisson" in content and "Caissons récents" in content
    assert "Vos caissons paramétriques" not in content and "Affaires (multi-caissons)" not in content and "Modèles de caissons" not in content
    assert f"{BASE}materiaux/" in content and f"{BASE}quincaillerie/" in content and f"{BASE}bibliotheque/" in content


@pytest.mark.django_db
def test_cabinet_editor_links_to_the_catalog_not_the_admin(client_logged):
    cabinet = create_cabinet(name="Bas", width=600, height=720, depth=560, material=Material.objects.get(name="Aggloméré blanc 19 mm"))
    content = client_logged.get(f"/poly/cabinet/{cabinet.pk}/").content.decode()
    assert "/admin/" not in content
    assert f"{BASE}atelier/" in content and f"{BASE}bibliotheque/" in content
