"""« Mon compte » (audit de sécurité du 10/11/2026, constat L10) : mot de passe, export de toutes les données,
suppression. Tests de non-régression de sécurité (skill secure-application-guardian), lancés par security.yml."""
import io
import json
import zipfile

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import Client

from apps.projects.documents import default_document
from apps.projects.models import Comment, LibraryModule, Offcut, Project, ShareLink
from apps.projects.services import create_project

PASSWORD = "motdepasse-solide-42"


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def filled(user, other_user):
    """alice's project (a client, a link, a comment), module and offcut; and bob's project, which is not hers."""
    project, _ = create_project(user, "../Cuisine Dupont", default_document(), space="kitchen")
    project.client_name = "M. Dupont"
    project.save()
    link = ShareLink.objects.create(project=project, title="Devis", model=b"glb", model_size=3)
    Comment.objects.create(project=project, link=link, author="Dupont", body="Plus de tiroirs ?")
    LibraryModule.objects.create(owner=user, name="Colonne four", document=default_document())
    Offcut.objects.create(owner=user, material="Chêne", thickness=19, length=800, width=300)
    create_project(other_user, "Projet de Bob", default_document())
    return project, link


def test_the_account_page_needs_a_login_and_the_header_links_to_it(client_logged):
    assert Client().get("/accounts/").status_code == 302
    page = client_logged.get("/accounts/").content.decode()
    assert "Mon compte" in page and 'href="/accounts/"' in page and "Supprimer définitivement" in page


def test_the_password_changes_with_the_old_one_and_the_session_stays(client_logged, user):
    new = "Nouveau-Mdp-Solide-77"
    response = client_logged.post("/accounts/mot-de-passe/", {"old_password": PASSWORD, "new_password1": new, "new_password2": new})
    assert response.status_code == 302 and response["Location"] == "/accounts/"
    assert client_logged.get("/projects/").status_code == 200  # still logged in
    assert Client().login(username="alice", password=new)


def test_wrong_old_passwords_count_as_failed_logins(client_logged):
    new = "Nouveau-Mdp-Solide-77"
    for _ in range(5):
        response = client_logged.post("/accounts/mot-de-passe/", {"old_password": "faux", "new_password1": new, "new_password2": new})
        assert response.status_code == 200
    response = client_logged.post("/accounts/mot-de-passe/", {"old_password": PASSWORD, "new_password1": new, "new_password2": new})
    assert "Trop de tentatives" in response.content.decode()
    assert not Client().login(username="alice", password=new)


def test_the_export_holds_everything_of_the_account_and_nothing_else(client_logged, filled):
    project, link = filled
    response = client_logged.get("/accounts/export/")
    assert response.status_code == 200 and response["Content-Type"] == "application/zip"
    assert "attachment" in response["Content-Disposition"]
    archive = zipfile.ZipFile(io.BytesIO(b"".join(response.streaming_content)))
    names = archive.namelist()
    # Every path stays in its folder, whatever the name typed.
    assert all(not n.startswith("/") and ".." not in n for n in names)
    assert f"projets/cuisine-dupont-{project.id}.cao.json" in names
    assert json.loads(archive.read(f"projets/cuisine-dupont-{project.id}.cao.json")) == default_document()
    assert any(n.startswith("bibliotheque/colonne-four-") for n in names)
    summary = json.loads(archive.read("projets.json"))
    assert [p["nom"] for p in summary] == ["../Cuisine Dupont"]
    assert summary[0]["client"]["nom"] == "M. Dupont" and summary[0]["commentaires"][0]["message"] == "Plus de tiroirs ?"
    everything = b"".join(archive.read(n) for n in names)
    assert link.token.encode() not in everything  # a lost ZIP does not open the live links
    assert b"Projet de Bob" not in everything
    assert json.loads(archive.read("chutes.json"))[0]["matière"] == "Chêne"


def test_the_export_is_limited(client_logged):
    for _ in range(5):
        assert client_logged.get("/accounts/export/").status_code == 200
    assert client_logged.get("/accounts/export/").status_code == 429
    assert Client().get("/accounts/export/").status_code == 302


def test_the_account_is_deleted_with_its_password_and_everything_it_owns(client_logged, user, filled):
    project, link = filled
    # A GET deletes nothing; a wrong password or no confirmation neither.
    assert client_logged.get("/accounts/supprimer/").status_code == 405
    assert client_logged.post("/accounts/supprimer/", {"password": "faux", "confirm": "on"}).status_code == 400
    assert client_logged.post("/accounts/supprimer/", {"password": PASSWORD}).status_code == 400
    assert get_user_model().objects.filter(username="alice").exists()
    response = client_logged.post("/accounts/supprimer/", {"password": PASSWORD, "confirm": "on"})
    assert response.status_code == 302 and response["Location"] == "/accounts/login/"
    assert not get_user_model().objects.filter(username="alice").exists()
    assert not Project.objects.filter(id=project.id).exists()
    assert not LibraryModule.objects.exists() and not Offcut.objects.exists()
    assert Client().get(f"/s/{link.token}/").status_code == 404
    assert Project.objects.filter(name="Projet de Bob").exists()
    assert client_logged.get("/projects/").status_code == 302  # logged out


def test_the_deletion_password_attempts_are_limited(client_logged):
    for _ in range(5):
        client_logged.post("/accounts/supprimer/", {"password": "faux", "confirm": "on"})
    response = client_logged.post("/accounts/supprimer/", {"password": PASSWORD, "confirm": "on"})
    assert response.status_code == 400 and "Trop de tentatives" in response.content.decode()
    assert get_user_model().objects.filter(username="alice").exists()


def test_a_staff_account_is_not_deleted_here(client_staff):
    response = client_staff.post("/accounts/supprimer/", {"password": PASSWORD, "confirm": "on"})
    assert response.status_code == 302 and response["Location"] == "/accounts/"
    assert get_user_model().objects.filter(username="chef").exists()
