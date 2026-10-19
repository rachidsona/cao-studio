import json
import re

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from apps.projects.documents import default_document
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
    assert "Mes projets" in content
    assert "Plaque" in content
    assert f"/projects/{project.id}/editor/" in content


def test_create_project_from_form(client_logged, user):
    response = client_logged.post("/projects/", {"name": "Équerre"})
    project = Project.objects.get(name="Équerre")
    assert response.status_code == 302
    assert response["Location"] == f"/projects/{project.id}/editor/"
    assert project.owner == user and project.current_version == 1
    assert project.versions.get().document == default_document()


def test_create_project_form_errors(client_logged):
    response = client_logged.post("/projects/", {"name": ""})
    assert response.status_code == 200
    assert "Donnez un nom à votre projet." in response.content.decode()
    assert Project.objects.count() == 0


def test_editor_renders_config(client_logged, project):
    response = client_logged.get(f"/projects/{project.id}/editor/")
    assert response.status_code == 200
    content = response.content.decode()
    assert '<div id="editor"' in content
    assert 'data-ref="viewport"' in content
    assert '<script type="module" src="/static/js/editor.js"></script>' in content
    match = re.search(r'<script id="editor-config" type="application/json">(.*?)</script>', content, re.S)
    assert match
    assert json.loads(match.group(1)) == {
        "projectId": str(project.id),
        "projectName": "Plaque",
        "apiUrl": f"/api/projects/{project.id}/",
        "projectsUrl": "/projects/",
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
def test_signup_creates_user_and_logs_in():
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
def test_signup_rejects_mismatched_passwords():
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
