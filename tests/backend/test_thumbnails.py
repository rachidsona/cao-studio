"""L'aperçu d'un projet pour sa carte de l'accueil : envoyé par l'éditeur (une image JPEG en data URL de 200 ko au
plus), montré au seul propriétaire, sans changer la date de modification du projet."""
import base64

import pytest
from django.test import Client

from apps.projects.models import Project

JPEG = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 100 + b"\xff\xd9").decode()


def url(project):
    return f"/api/projects/{project.id}/thumbnail/"


def test_the_owner_sends_a_preview_and_sees_it_on_the_home_page(client_logged, project, api):
    before = Project.objects.get(pk=project.pk).updated_at
    assert api.post(client_logged, url(project), {"thumbnail": JPEG}).status_code == 204
    project.refresh_from_db()
    assert project.thumbnail == JPEG and project.updated_at == before
    image = client_logged.get(f"/projects/{project.id}/apercu.jpg")
    assert image.status_code == 200 and image["Content-Type"] == "image/jpeg" and image.content.startswith(b"\xff\xd8\xff")
    assert "private" in image["Cache-Control"]
    page = client_logged.get("/projects/").content.decode()
    assert f"/projects/{project.id}/apercu.jpg?v=" in page and "data-preview" in page


@pytest.mark.parametrize("value", [
    "data:image/png;base64,iVBORw0KGgo=",
    "data:image/jpeg;base64,PGh0bWw+",          # not JPEG bytes
    "data:image/jpeg;base64,***",               # not base64
    "data:image/jpeg;base64," + "A" * 200_001,  # too big
    "https://exemple.net/image.jpg",
    None,
])
def test_anything_else_is_refused(client_logged, project, api, value):
    assert api.post(client_logged, url(project), {"thumbnail": value}).status_code == 400
    project.refresh_from_db()
    assert project.thumbnail == ""


def test_another_account_neither_sends_nor_sees_it(project, other_user, api):
    Project.objects.filter(pk=project.pk).update(thumbnail=JPEG)
    other = Client()
    other.force_login(other_user)
    assert api.post(other, url(project), {"thumbnail": JPEG}).status_code == 404
    assert other.get(f"/projects/{project.id}/apercu.jpg").status_code == 404
    assert Client().get(f"/projects/{project.id}/apercu.jpg").status_code == 302


def test_a_project_without_preview_has_its_drawing_and_no_image(client_logged, project):
    assert client_logged.get(f"/projects/{project.id}/apercu.jpg").status_code == 404
    assert "data-preview" not in client_logged.get("/projects/").content.decode()
