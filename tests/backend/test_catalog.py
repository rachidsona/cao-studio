"""Le catalogue de l'atelier : seeds, API JSON pour l'éditeur, profil unique, administration."""
import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from apps.catalog.models import CompanyProfile, HardwareRule, Material

URL = "/api/catalog/"


@pytest.mark.django_db
def test_seeds_are_there():
    assert Material.objects.count() == 23
    assert Material.objects.get(name="Aggloméré blanc 19 mm").is_default
    assert Material.objects.get(name="Marbre de Carrare").category == "marble"
    assert HardwareRule.objects.count() == 9
    assert HardwareRule.objects.get(name="Tige d'étagère").auto_mode == "shelf"
    assert HardwareRule.objects.get(name="Tige d'étagère").auto_per_unit == 4
    assert CompanyProfile.load().name == "Mon atelier"


@pytest.mark.django_db
def test_api_gives_the_catalog_to_the_editor(client_logged):
    data = client_logged.get(URL).json()
    assert len(data["materials"]) == 23
    walnut = next(m for m in data["materials"] if m["name"] == "Noyer américain")
    assert walnut == {"id": f"catalog-{Material.objects.get(name='Noyer américain').pk}", "name": "Noyer américain", "thickness": 19, "price": 2268.0, "color": "#5a3a24", "category": "wood", "sheet": [2800, 2070], "default": False}
    hinges = next(h for h in data["hardware"] if h["name"] == "Charnière à clip 35 mm")
    assert hinges["mode"] == "door_hinge" and hinges["price"] == 12.96 and hinges["unit"] == "u"
    assert data["company"]["name"] == "Mon atelier" and data["company"]["logo"] == ""


@pytest.mark.django_db
def test_prices_are_in_dirhams():
    # The seeds were in euros: in dirhams (MAD) at 10,8 the euro, the workshop's rates too.
    assert Material.objects.get(name="Noyer américain").price_per_m2 == 2268
    profile = CompanyProfile.load()
    assert (profile.band, profile.cut_per_part, profile.hourly, profile.per_hole) == (16.2, 43.2, 486, 0)


@pytest.mark.django_db
def test_api_requires_login():
    assert Client().get(URL).status_code == 401


@pytest.mark.django_db
def test_company_profile_is_one_row():
    profile = CompanyProfile.load()
    profile.name = "Atelier Sona"
    profile.save()
    other = CompanyProfile(name="Autre")
    other.save()
    assert CompanyProfile.objects.count() == 1
    assert CompanyProfile.load().name == "Autre"


@pytest.mark.django_db
def test_editor_page_gives_the_catalog_url(client_logged, project):
    response = client_logged.get(f"/projects/{project.id}/editor/")
    assert response.status_code == 200
    assert b'"catalogUrl": "/api/catalog/"' in response.content


@pytest.mark.django_db
def test_admin_edits_the_profile_with_a_logo():
    admin = get_user_model().objects.create_superuser(username="root", password="motdepasse-solide-42")
    client = Client()
    client.force_login(admin)
    assert client.get("/admin/catalog/companyprofile/").status_code == 302
    page = client.get("/admin/catalog/companyprofile/1/change/")
    assert page.status_code == 200
    from django.core.files.uploadedfile import SimpleUploadedFile

    logo = SimpleUploadedFile("logo.png", b"\x89PNG\r\n\x1a\n", content_type="image/png")
    response = client.post(
        "/admin/catalog/companyprofile/1/change/",
        {"name": "Atelier Sona", "slogan": "", "address": "1 rue du Bois", "phone": "", "email": "", "website": "", "logo_file": logo, "_save": "1"},
    )
    assert response.status_code == 302, response.content
    profile = CompanyProfile.load()
    assert profile.name == "Atelier Sona"
    assert profile.logo.startswith("data:image/png;base64,")
    assert client.get("/admin/catalog/material/").status_code == 200
    assert client.get("/admin/catalog/hardwarerule/").status_code == 200
