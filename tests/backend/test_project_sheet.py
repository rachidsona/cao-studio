"""La fiche d'un projet (client, statut, pose, notes, montant du devis) et le tableau de bord de l'accueil."""
import json
from decimal import Decimal

import pytest
from django.test import Client

from apps.projects.documents import default_document
from apps.projects.models import Project
from apps.projects.services import create_project

from test_sharing import accept_url, make_link, post_json


def price_url(project):
    return f"/api/projects/{project.id}/price/"


@pytest.mark.django_db
def test_the_sheet_keeps_the_client_the_status_and_the_notes(client_logged, project):
    page = client_logged.get(f"/projects/{project.id}/fiche/")
    assert page.status_code == 200 and "Fiche du projet" in page.content.decode()
    response = client_logged.post(
        f"/projects/{project.id}/fiche/",
        {"name": "Cuisine Dupont", "space": "kitchen", "client_name": "M. Dupont", "client_phone": "06 12 34 56 78", "client_email": "dupont@example.com",
         "client_address": "3 rue des Lilas", "status": "accepted", "install_date": "2026-12-15", "notes": "Plinthe inox."},
    )
    assert response.status_code == 302 and response["Location"] == f"/projects/{project.id}/fiche/"
    project.refresh_from_db()
    assert (project.name, project.client_name, project.status, str(project.install_date), project.notes) == ("Cuisine Dupont", "M. Dupont", "accepted", "2026-12-15", "Plinthe inox.")
    # A bad e-mail or no name: the errors, nothing kept.
    bad = client_logged.post(f"/projects/{project.id}/fiche/", {"name": "", "space": "design", "client_email": "pas-un-mail", "status": "draft"})
    assert bad.status_code == 200 and bad.content.decode().count("field-error") >= 2


@pytest.mark.django_db
def test_only_the_owner_sees_the_sheet(project, other_user):
    other = Client()
    other.force_login(other_user)
    assert other.get(f"/projects/{project.id}/fiche/").status_code == 404
    assert Client().get(f"/projects/{project.id}/fiche/").status_code == 302


@pytest.mark.django_db
def test_the_editor_sends_the_quote_s_total(client_logged, project, other_user):
    before = Project.objects.get(pk=project.pk).updated_at
    response = client_logged.post(price_url(project), json.dumps({"price": 4321.567}), content_type="application/json")
    assert response.status_code == 200 and response.json() == {"price": 4321.57}
    project.refresh_from_db()
    assert project.price == Decimal("4321.57")
    # Not a change of the design.
    assert project.updated_at == before
    assert client_logged.post(price_url(project), json.dumps({"price": -1}), content_type="application/json").status_code == 400
    assert client_logged.post(price_url(project), json.dumps({"price": "cher"}), content_type="application/json").status_code == 400
    assert client_logged.post(price_url(project), json.dumps({"price": None}), content_type="application/json").json() == {"price": None}
    other = Client()
    other.force_login(other_user)
    assert other.post(price_url(project), json.dumps({"price": 1}), content_type="application/json").status_code == 404


@pytest.mark.django_db
def test_a_link_sent_makes_it_quoted_and_the_client_s_yes_accepted(client_logged, project):
    made = make_link(client_logged, project, allow_accept="1", summary=json.dumps({"price": 3200.0}))
    project.refresh_from_db()
    assert project.status == "quoted"
    assert post_json(Client(), accept_url(made), {"name": "Mme Martin"}).status_code == 200
    project.refresh_from_db()
    assert project.status == "accepted"
    sheet = client_logged.get(f"/projects/{project.id}/fiche/").content.decode()
    assert "Accepté le" in sheet and "Mme Martin" in sheet


@pytest.mark.django_db
def test_a_job_further_on_keeps_its_status(client_logged, project):
    Project.objects.filter(pk=project.pk).update(status="production")
    make_link(client_logged, project)
    project.refresh_from_db()
    assert project.status == "production"


@pytest.mark.django_db
def test_the_home_page_filters_and_searches(client_logged, user, other_user):
    a, _ = create_project(user, "Cuisine Dupont", default_document())
    b, _ = create_project(user, "Dressing Martin", default_document())
    c, _ = create_project(user, "Buffet", default_document())
    create_project(other_user, "Pas à moi", default_document())
    Project.objects.filter(pk=a.pk).update(status="quoted", price=Decimal("1000"), client_name="M. Dupont")
    Project.objects.filter(pk=b.pk).update(status="quoted", price=Decimal("2500"))
    Project.objects.filter(pk=c.pk).update(status="accepted", price=Decimal("800"))
    page = client_logged.get("/projects/")
    content = page.content.decode()
    # No status tiles any more (taken away on 12/11/2026): each card says where its job stands.
    assert "data-dashboard" not in content and "Pas à moi" not in content
    assert 'data-status="quoted"' in content and "M. Dupont" in content
    quoted = client_logged.get("/projects/?statut=quoted").context["projects"]
    assert {p.name for p in quoted} == {"Cuisine Dupont", "Dressing Martin"}
    assert [p.name for p in client_logged.get("/projects/?q=dupont").context["projects"]] == ["Cuisine Dupont"]
    # An unknown stage: all of them.
    assert len(client_logged.get("/projects/?statut=nimporte").context["projects"]) == 3


@pytest.mark.django_db
def test_each_project_has_its_space(client_logged, user):
    from importlib import import_module

    client_logged.post("/projects/", {"name": "Cuisine A", "space": "kitchen"})
    client_logged.post("/projects/", {"name": "Placard", "space": "dressing"})
    client_logged.post("/projects/", {"name": "Meuble"})
    assert {p.name: p.space for p in Project.objects.filter(owner=user)} == {"Cuisine A": "kitchen", "Placard": "dressing", "Meuble": "design"}
    # The editor knows it; the home page shows it.
    kitchen = Project.objects.get(name="Cuisine A")
    assert 'data-space="kitchen"' in client_logged.get(f"/projects/{kitchen.id}/editor/").content.decode()
    assert 'data-space="dressing">Dressing</span>' in client_logged.get("/projects/").content.decode()
    # The API lists it and makes a project of a space.
    listed = {p["name"]: p["space"] for p in client_logged.get("/api/projects/").json()["projects"]}
    assert listed["Placard"] == "dressing"
    made = client_logged.post("/api/projects/", json.dumps({"name": "Entrée", "space": "dressing"}), content_type="application/json")
    assert made.status_code == 201 and made.json()["space"] == "dressing"
    assert client_logged.post("/api/projects/", json.dumps({"name": "X", "space": "garage"}), content_type="application/json").status_code == 400
    # The sheet changes it.
    client_logged.post(f"/projects/{kitchen.id}/fiche/", {"name": "Cuisine A", "space": "design", "status": "draft"})
    kitchen.refresh_from_db()
    assert kitchen.space == "design"
    # Projects made before the spaces: a kitchen, a dressing or a placard, else a 3D design.
    space_of = import_module("apps.projects.migrations.0008_project_space").space_of
    assert space_of("Plan", {"features": [{"type": "sketch", "kitchenPlan": {}}]}) == "kitchen"
    assert space_of("Four", {"features": [{"type": "appliance"}]}) == "kitchen"
    assert space_of("placard nada sous sol", {"features": [{"type": "extrude"}]}) == "dressing"
    assert space_of("Bibliothèque", {"features": [{"type": "niche"}]}) == "dressing"
    assert space_of("Caisson exemple", {"features": [{"type": "cabinet"}]}) == "design"


@pytest.mark.django_db
def test_a_kitchen_or_a_dressing_starts_empty(client_logged, user):
    client_logged.post("/projects/", {"name": "Cuisine vide", "space": "kitchen"})
    client_logged.post("/projects/", {"name": "Meuble"})
    made = client_logged.post("/api/projects/", json.dumps({"name": "Placard", "space": "dressing"}), content_type="application/json").json()
    assert Project.objects.get(name="Cuisine vide").versions.get().document["features"] == []
    assert made["document"]["features"] == []
    # A 3D design: the reference plate, as always.
    assert Project.objects.get(name="Meuble").versions.get().document == default_document()
