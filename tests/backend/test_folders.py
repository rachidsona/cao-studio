"""Les dossiers de la page d'accueil : en créer, y ranger des projets, filtrer, renommer, supprimer (les projets
restent) ; chaque compte n'a que les siens."""
import pytest
from django.test import Client

from apps.projects.documents import default_document
from apps.projects.models import Project, ProjectFolder
from apps.projects.services import create_project

LIST = "/projects/"


@pytest.fixture
def projects(user):
    return [create_project(user, name, default_document())[0] for name in ("Cuisine Dupont", "Dressing Martin", "Meuble télé")]


def test_a_folder_is_made_and_projects_are_sorted_into_it(client_logged, user, projects):
    response = client_logged.post("/projects/dossiers/", {"name": "  Clients   2026 "})
    folder = ProjectFolder.objects.get(owner=user)
    assert folder.name == "Clients 2026" and response["Location"] == f"{LIST}?dossier={folder.pk}"
    moved = client_logged.post("/projects/ranger/", {"ids": [str(projects[0].pk), str(projects[1].pk)], "folder": str(folder.pk)})
    assert moved.status_code == 302
    assert set(Project.objects.filter(folder=folder).values_list("name", flat=True)) == {"Cuisine Dupont", "Dressing Martin"}
    # The list of the folder shows only its projects; « Sans dossier » the others.
    page = client_logged.get(f"{LIST}?dossier={folder.pk}").content.decode()
    assert "Cuisine Dupont" in page and "Meuble télé" not in page
    unfiled = client_logged.get(f"{LIST}?dossier=aucun").content.decode()
    assert "Meuble télé" in unfiled and "Dressing Martin" not in unfiled
    # Out of any folder again.
    client_logged.post("/projects/ranger/", {"ids": [str(projects[0].pk)], "folder": "aucun"})
    projects[0].refresh_from_db()
    assert projects[0].folder is None


def test_a_folder_is_renamed_and_deleted_without_its_projects(client_logged, user, projects):
    folder = ProjectFolder.objects.create(owner=user, name="Atelier")
    Project.objects.filter(pk=projects[0].pk).update(folder=folder)
    client_logged.post(f"/projects/dossiers/{folder.pk}/renommer/", {"name": "Atelier Sud"})
    folder.refresh_from_db()
    assert folder.name == "Atelier Sud"
    client_logged.post(f"/projects/dossiers/{folder.pk}/supprimer/")
    assert not ProjectFolder.objects.exists()
    projects[0].refresh_from_db()
    assert projects[0].folder is None and Project.objects.count() == 3


def test_names_are_checked_and_not_doubled(client_logged, user):
    client_logged.post("/projects/dossiers/", {"name": "Clients"})
    client_logged.post("/projects/dossiers/", {"name": "Clients"})
    client_logged.post("/projects/dossiers/", {"name": "   "})
    client_logged.post("/projects/dossiers/", {"name": "x" * 81})
    assert list(ProjectFolder.objects.values_list("name", flat=True)) == ["Clients"]


def test_another_accounts_folders_and_projects_are_out_of_reach(client_logged, user, other_user, projects):
    theirs = ProjectFolder.objects.create(owner=other_user, name="À eux")
    their_project, _ = create_project(other_user, "Leur projet", default_document())
    # Their folder: not found, whatever is asked of it.
    assert client_logged.post(f"/projects/dossiers/{theirs.pk}/renommer/", {"name": "Pris"}).status_code == 404
    assert client_logged.post(f"/projects/dossiers/{theirs.pk}/supprimer/").status_code == 404
    assert client_logged.post("/projects/ranger/", {"ids": [str(projects[0].pk)], "folder": str(theirs.pk)}).status_code == 404
    # Their project is not moved into my folder.
    mine = ProjectFolder.objects.create(owner=user, name="À moi")
    client_logged.post("/projects/ranger/", {"ids": [str(their_project.pk)], "folder": str(mine.pk)})
    their_project.refresh_from_db()
    assert their_project.folder is None
    # Their folder is not listed on my page, nor shown by its number.
    page = client_logged.get(f"{LIST}?dossier={theirs.pk}").content.decode()
    assert "À eux" not in page


def test_the_pages_need_a_login_and_a_post():
    assert Client().post("/projects/dossiers/", {"name": "x"}).status_code == 302
    assert Client().get("/projects/ranger/").status_code in (302, 405)
