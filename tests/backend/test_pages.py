import json
import re

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from apps.projects.documents import default_document, example_document
from apps.projects.validation import validate_document
from apps.projects.models import Project


@pytest.mark.django_db
def test_root_redirects_to_projects():
    response = Client().get("/")
    assert response.status_code == 302
    assert response["Location"] == "/projects/"


@pytest.mark.django_db
def test_projects_requires_login():
    response = Client().get("/projects/")
    assert response.status_code == 302
    assert response["Location"].startswith("/accounts/login/?next=/projects/")


@pytest.mark.django_db
def test_login_page_renders():
    response = Client().get("/accounts/login/")
    assert response.status_code == 200
    content = response.content.decode()
    assert "Connexion" in content
    assert "/static/css/app.css" in content
    assert 'localStorage.getItem("theme")' in content  # theme bootstrap script


def test_login_works(user):
    client = Client()
    response = client.post("/accounts/login/", {"username": "alice", "password": "motdepasse-solide-42"})
    assert response.status_code == 302 and response["Location"] == "/projects/"


def test_projects_list_renders(client_logged, project):
    response = client_logged.get("/projects/")
    assert response.status_code == 200
    content = response.content.decode()
    assert "Conception 3D" in content and "Cuisine &amp; Dressing" in content
    # Each project is a card that opens it; the home page has no pictures any more, its spaces are drawn.
    assert "Plaque" in content and 'data-project-row="' in content
    assert f"/projects/{project.id}/editor/" in content
    assert "/static/img/accueil/" not in content


def test_home_makes_a_kitchen_or_a_dressing_opened_on_its_tab(client_logged, user):
    content = client_logged.get("/projects/").content.decode()
    assert 'name="space" value="kitchen"' in content and 'name="space" value="dressing"' in content
    assert "/poly/" not in content and "poly_3D" not in content
    response = client_logged.post("/projects/", {"name": "Cuisine Dupont", "space": "kitchen"})
    project = Project.objects.get(name="Cuisine Dupont")
    assert response["Location"] == f"/projects/{project.id}/editor/?onglet=kitchen"
    response = client_logged.post("/projects/", {"name": "Dressing Martin", "space": "dressing"})
    assert response["Location"].endswith("?onglet=dressing")
    # Anything else: the editor as usual.
    response = client_logged.post("/projects/", {"name": "Autre", "space": "ailleurs"})
    assert response["Location"] == f"/projects/{Project.objects.get(name='Autre').id}/editor/"


def test_create_project_from_form(client_logged, user):
    response = client_logged.post("/projects/", {"name": "Équerre"})
    project = Project.objects.get(name="Équerre")
    assert response.status_code == 302
    assert response["Location"] == f"/projects/{project.id}/editor/"
    assert project.owner == user and project.current_version == 1
    assert project.versions.get().document == default_document()


def test_create_example_project(client_logged, user):
    response = client_logged.post("/projects/", {"example": "1"})
    project = Project.objects.get(name="Caisson exemple")
    assert response["Location"] == f"/projects/{project.id}/editor/"
    assert project.owner == user
    assert project.versions.get().document == example_document()
    assert validate_document(example_document()) == []


def test_create_project_form_errors(client_logged):
    response = client_logged.post("/projects/", {"name": ""})
    assert response.status_code == 200
    assert "Donnez un nom à votre projet." in response.content.decode()
    assert Project.objects.count() == 0


def test_editor_opens_in_a_tab_of_this_site_only(client_logged, project):
    response = client_logged.get(f"/projects/{project.id}/editor/")
    assert response.headers["X-Frame-Options"] == "SAMEORIGIN"


def test_editor_renders_config(client_logged, project):
    response = client_logged.get(f"/projects/{project.id}/editor/")
    assert response.status_code == 200
    content = response.content.decode()
    assert '<div id="editor"' in content
    assert 'data-ref="viewport"' in content
    assert re.search(r'<script type="module" src="/static/js/editor\.js(\?v=\d+)?"></script>', content)
    match = re.search(r'<script id="editor-config" type="application/json">(.*?)</script>', content, re.S)
    assert match
    assert json.loads(match.group(1)) == {
        "projectId": str(project.id),
        "projectName": "Plaque",
        "space": "design",
        "apiUrl": f"/api/projects/{project.id}/",
        "projectsUrl": "/projects/",
        "catalogUrl": "/api/catalog/",
    }
    assert "csrftoken" in response.cookies


def test_editor_other_owner_404(project, other_user):
    client = Client()
    client.force_login(other_user)
    assert client.get(f"/projects/{project.id}/editor/").status_code == 404


@pytest.mark.django_db
def test_editor_requires_login(project):
    response = Client().get(f"/projects/{project.id}/editor/")
    assert response.status_code == 302


@pytest.mark.django_db
def test_signup_creates_user_and_logs_in(settings):
    settings.SIGNUP_OPEN = True  # closed by default: tests/backend/test_signup.py
    client = Client()
    assert client.get("/accounts/signup/").status_code == 200
    response = client.post(
        "/accounts/signup/",
        {"username": "claire", "password1": "Tr3s-Solide-Mdp!", "password2": "Tr3s-Solide-Mdp!"},
    )
    assert response.status_code == 302 and response["Location"] == "/projects/"
    assert get_user_model().objects.filter(username="claire").exists()
    assert client.get("/projects/").status_code == 200


@pytest.mark.django_db
def test_signup_rejects_mismatched_passwords(settings):
    settings.SIGNUP_OPEN = True
    response = Client().post(
        "/accounts/signup/",
        {"username": "dan", "password1": "Tr3s-Solide-Mdp!", "password2": "autre-chose-99"},
    )
    assert response.status_code == 200
    assert not get_user_model().objects.filter(username="dan").exists()


def test_logout_post(client_logged):
    response = client_logged.post("/accounts/logout/")
    assert response.status_code == 302
    assert client_logged.get("/projects/").status_code == 302


def test_admin_registered(admin_client, project):
    assert admin_client.get("/admin/projects/project/").status_code == 200
    assert admin_client.get(f"/admin/projects/project/{project.id}/change/").status_code == 200
    assert admin_client.get("/admin/projects/projectversion/").status_code == 200


@pytest.mark.django_db
def test_home_deletes_a_3d_project(client_logged, project):
    content = client_logged.get("/projects/").content.decode()
    assert f'action="/projects/{project.id}/supprimer/"' in content
    assert client_logged.get(f"/projects/{project.id}/supprimer/").status_code == 405
    assert Project.objects.filter(pk=project.id).exists()
    response = client_logged.post(f"/projects/{project.id}/supprimer/", follow=True)
    assert response.status_code == 200 and "Projet « Plaque » supprimé." in response.content.decode()
    assert not Project.objects.filter(pk=project.id).exists()


@pytest.mark.django_db
def test_home_cannot_delete_someone_elses_project(project):
    stranger = get_user_model().objects.create_user(username="inconnu", password="motdepasse-solide-42")
    client = Client()
    client.force_login(stranger)
    assert client.post(f"/projects/{project.id}/supprimer/").status_code == 404
    assert Project.objects.filter(pk=project.id).exists()


@pytest.mark.django_db
def test_home_deletes_the_ticked_3d_projects_and_only_the_users_own(client_logged, user):
    from apps.projects.services import create_project

    stranger = get_user_model().objects.create_user(username="inconnu", password="motdepasse-solide-42")
    first, _ = create_project(user, "Un", default_document())
    second, _ = create_project(user, "Deux", default_document())
    kept, _ = create_project(user, "Trois", default_document())
    other, _ = create_project(stranger, "À quelqu'un d'autre", default_document())
    content = client_logged.get("/projects/").content.decode()
    assert 'action="/projects/supprimer/"' in content and f'value="{first.id}" form="bulk-projects"' in content
    assert client_logged.get("/projects/supprimer/").status_code == 405

    response = client_logged.post("/projects/supprimer/", {"ids": [str(first.id), str(second.id), str(other.id), "pas-un-uuid"]}, follow=True)
    assert "2 projets supprimés." in response.content.decode()
    assert set(Project.objects.filter(pk__in=[first.id, second.id, kept.id, other.id])) == {kept, other}


@pytest.mark.django_db
def test_home_deleting_nothing_changes_nothing(client_logged, project):
    response = client_logged.post("/projects/supprimer/", {}, follow=True)
    assert response.status_code == 200 and not list(response.context["messages"])
    assert Project.objects.filter(pk=project.id).exists()


@pytest.mark.django_db
def test_projects_page_is_cao_studio_and_links_to_the_catalogue(client_logged):
    content = client_logged.get("/projects/").content.decode()
    assert "CAO Studio" in content and "poly_3D" not in content
    assert 'href="/catalogue/"' in content
    assert client_logged.get("/poly/").status_code == 404


@pytest.mark.django_db
def test_the_guide_shows_each_step_with_its_picture(client):
    from pathlib import Path

    from django.conf import settings

    page = client.get("/guide/")
    assert page.status_code == 200
    content = page.content.decode()
    assert "Guide de CAO Studio" in content
    pictures = re.findall(r'src="/static/(guide/[^"]+\.png)"', content)
    assert len(pictures) == 10
    for picture in pictures:
        assert (Path(settings.BASE_DIR) / "static" / picture).is_file(), picture
