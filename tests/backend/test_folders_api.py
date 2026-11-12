"""Les dossiers vus de l'éditeur (colonne « Projets ») : la liste, créer, renommer, supprimer, ranger un projet ; les
mêmes règles que la page d'accueil, et chaque compte n'a que les siens."""
import json

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from apps.projects.documents import default_document
from apps.projects.models import Project, ProjectFolder
from apps.projects.services import create_project

FOLDERS = "/api/folders/"


def send(client, method: str, url: str, data) -> object:
    return getattr(client, method)(url, data=json.dumps(data), content_type="application/json")


@pytest.fixture
def projects(user):
    return [create_project(user, name, default_document())[0] for name in ("Meuble télé", "Cuisine Dupont")]


def test_the_list_gives_folders_and_projects_with_their_folder(client_logged, user, projects):
    folder = ProjectFolder.objects.create(owner=user, name="Clients")
    Project.objects.filter(pk=projects[0].pk).update(folder=folder)
    body = client_logged.get(FOLDERS).json()
    assert body["folders"] == [{"id": folder.pk, "name": "Clients"}]
    assert [(p["name"], p["folder"]) for p in body["projects"]] == [("Cuisine Dupont", None), ("Meuble télé", folder.pk)]


def test_a_folder_is_made_renamed_and_deleted_without_its_projects(client_logged, user, projects):
    made = send(client_logged, "post", FOLDERS, {"name": "  Atelier   Sud "})
    assert made.status_code == 201 and made.json()["name"] == "Atelier Sud"
    folder_id = made.json()["id"]
    moved = send(client_logged, "put", f"/api/projects/{projects[1].pk}/folder/", {"folder": folder_id})
    assert moved.json() == {"folder": folder_id}
    before = Project.objects.get(pk=projects[1].pk).updated_at
    renamed = send(client_logged, "patch", f"{FOLDERS}{folder_id}/", {"name": "Atelier Nord"})
    assert renamed.json() == {"id": folder_id, "name": "Atelier Nord"}
    assert client_logged.delete(f"{FOLDERS}{folder_id}/").status_code == 204
    project = Project.objects.get(pk=projects[1].pk)
    # The project stays, out of any folder; its « modifié le » did not move.
    assert project.folder is None and project.updated_at == before and Project.objects.count() == 2


def test_out_of_a_folder_with_null(client_logged, user, projects):
    folder = ProjectFolder.objects.create(owner=user, name="Clients")
    Project.objects.filter(pk=projects[0].pk).update(folder=folder)
    assert send(client_logged, "put", f"/api/projects/{projects[0].pk}/folder/", {"folder": None}).json() == {"folder": None}
    assert Project.objects.get(pk=projects[0].pk).folder is None


@pytest.mark.parametrize("name", ["", "   ", "x" * 81, 12, None])
def test_bad_names_are_refused(client_logged, name):
    response = send(client_logged, "post", FOLDERS, {"name": name})
    assert response.status_code == 400 and not ProjectFolder.objects.exists()


def test_a_name_taken_is_refused(client_logged, user):
    ProjectFolder.objects.create(owner=user, name="Clients")
    other = ProjectFolder.objects.create(owner=user, name="Atelier")
    assert send(client_logged, "post", FOLDERS, {"name": "Clients"}).status_code == 400
    assert send(client_logged, "patch", f"{FOLDERS}{other.pk}/", {"name": "Clients"}).status_code == 400
    assert ProjectFolder.objects.get(pk=other.pk).name == "Atelier"


@pytest.mark.parametrize("folder", ["1", True, 1.5, [1]])
def test_a_bad_folder_value_is_refused(client_logged, projects, folder):
    response = send(client_logged, "put", f"/api/projects/{projects[0].pk}/folder/", {"folder": folder})
    assert response.status_code == 400


def test_another_accounts_folders_and_projects_do_not_exist(client_logged, user, projects):
    stranger = get_user_model().objects.create_user("voisin", password="Copeau-voisin-Chene-42")
    theirs = ProjectFolder.objects.create(owner=stranger, name="Secret")
    their_project = create_project(stranger, "Leur projet", default_document())[0]
    assert client_logged.get(FOLDERS).json()["folders"] == []
    assert all(p["name"] != "Leur projet" for p in client_logged.get(FOLDERS).json()["projects"])
    assert send(client_logged, "patch", f"{FOLDERS}{theirs.pk}/", {"name": "À moi"}).status_code == 404
    assert client_logged.delete(f"{FOLDERS}{theirs.pk}/").status_code == 404
    # Neither my project into their folder, nor their project into mine.
    assert send(client_logged, "put", f"/api/projects/{projects[0].pk}/folder/", {"folder": theirs.pk}).status_code == 404
    mine = ProjectFolder.objects.create(owner=user, name="Clients")
    assert send(client_logged, "put", f"/api/projects/{their_project.pk}/folder/", {"folder": mine.pk}).status_code == 404
    assert ProjectFolder.objects.get(pk=theirs.pk).name == "Secret" and Project.objects.get(pk=their_project.pk).folder is None


def test_anonymous_gets_401():
    assert Client().get(FOLDERS).status_code == 401
