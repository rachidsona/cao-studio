import json

import pytest
from django.test import Client

from apps.projects.documents import default_document
from apps.projects.models import Project, ProjectVersion
from apps.projects.validation import compute_checksum

LIST_URL = "/api/projects/"


def detail_url(project_id):
    return f"/api/projects/{project_id}/"


def float_document():
    doc = default_document()
    doc["features"][0]["points"][2]["x"] = 40.125
    doc["features"][0]["constraints"][5]["value"] = 80.25
    doc["features"][1]["distance"] = 12.5
    doc["features"][2]["diameter"] = 6.6
    doc["parameters"] = {"epaisseur": 0.1, "petit": 1e-7, "grand": 123456789.123, "nom": "Pièce é"}
    return doc


# --- authentication / authorisation -----------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize("url", [LIST_URL, "/api/projects/00000000-0000-0000-0000-000000000000/"])
def test_anonymous_gets_401_json(url):
    response = Client().get(url)
    assert response.status_code == 401
    assert response["Content-Type"] == "application/json"
    assert response.json() == {"error": "Authentification requise."}


@pytest.mark.django_db
def test_anonymous_post_401(api):
    response = api.post(Client(), LIST_URL, {"name": "x"})
    assert response.status_code == 401


def test_other_owner_gets_404(project, other_user, api):
    client = Client()
    client.force_login(other_user)
    assert client.get(detail_url(project.id)).status_code == 404
    assert client.get(detail_url(project.id) + "versions/").status_code == 404
    assert client.get(detail_url(project.id) + "versions/1/").status_code == 404
    response = api.put(client, detail_url(project.id), {"document": default_document(), "base_version": 1})
    assert response.status_code == 404
    assert response.json()["error"] == "Projet introuvable."
    assert client.get(LIST_URL).json() == {"projects": []}
    project.refresh_from_db()
    assert project.current_version == 1


def test_unknown_api_route_is_json_404(client_logged):
    response = client_logged.get("/api/nope/")
    assert response.status_code == 404
    assert "error" in response.json()


def test_method_not_allowed_json(client_logged, project):
    response = client_logged.patch(detail_url(project.id))
    assert response.status_code == 405
    assert "error" in response.json()


# --- CSRF ---------------------------------------------------------------------


def test_csrf_enforced_on_post_and_put(user, project):
    client = Client(enforce_csrf_checks=True)
    client.force_login(user)
    body = json.dumps({"name": "Sans jeton"})
    response = client.post(LIST_URL, body, content_type="application/json")
    assert response.status_code == 403
    assert response.json()["error"] == "Jeton CSRF manquant ou invalide."
    body = json.dumps({"document": default_document(), "base_version": 1})
    assert client.put(detail_url(project.id), body, content_type="application/json").status_code == 403
    assert Project.objects.count() == 1


def test_csrf_token_header_accepted(user):
    client = Client(enforce_csrf_checks=True)
    client.force_login(user)
    client.get("/projects/")  # sets the csrftoken cookie
    token = client.cookies["csrftoken"].value
    response = client.post(
        LIST_URL, json.dumps({"name": "Avec jeton"}), content_type="application/json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert response.status_code == 201


def test_get_does_not_require_csrf(user, project):
    client = Client(enforce_csrf_checks=True)
    client.force_login(user)
    assert client.get(LIST_URL).status_code == 200


# --- create / read ---------------------------------------------------------------


def test_create_with_default_document(client_logged, api, user):
    response = api.post(client_logged, LIST_URL, {"name": "  Ma pièce  "})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Ma pièce"
    assert data["version"] == 1
    assert data["document"] == default_document()
    assert data["checksum"] == compute_checksum(default_document())
    project = Project.objects.get(pk=data["id"])
    assert project.owner == user and project.current_version == 1
    version = project.versions.get()
    assert version.number == 1 and version.created_by == user
    assert version.size_bytes > 0


def test_create_with_custom_document(client_logged, api):
    doc = float_document()
    response = api.post(client_logged, LIST_URL, {"name": "Flottants", "document": doc})
    assert response.status_code == 201
    assert response.json()["document"] == doc


@pytest.mark.parametrize("body", [{}, {"name": ""}, {"name": "   "}, {"name": 12}, {"name": "x" * 121}])
def test_create_invalid_name(client_logged, api, body):
    response = api.post(client_logged, LIST_URL, body)
    assert response.status_code == 400
    assert response.json()["error"] == "Nom de projet invalide."


def test_create_invalid_document(client_logged, api):
    doc = default_document()
    doc["format"] = "step"
    response = api.post(client_logged, LIST_URL, {"name": "x", "document": doc})
    assert response.status_code == 400
    data = response.json()
    assert data["error"] == "Document invalide."
    assert data["details"] and "format" in data["details"][0]
    assert Project.objects.count() == 0


@pytest.mark.parametrize("raw", ["{pas du json", '{"name": "x", "document": {"a": NaN}}', "[1, 2]", ""])
def test_invalid_json_body(client_logged, raw):
    response = client_logged.post(LIST_URL, raw, content_type="application/json")
    assert response.status_code == 400
    data = response.json()
    assert "error" in data and isinstance(data["details"], list)


def test_body_too_large_is_413(client_logged):
    raw = json.dumps({"name": "x", "pad": "x" * (6 * 1024 * 1024)})
    response = client_logged.post(LIST_URL, raw, content_type="application/json")
    assert response.status_code == 413
    assert "error" in response.json()


def test_list_projects(client_logged, project, other_user):
    from apps.projects.services import create_project

    create_project(other_user, "Pas à moi", default_document())
    data = client_logged.get(LIST_URL).json()
    assert [p["name"] for p in data["projects"]] == ["Plaque"]
    item = data["projects"][0]
    assert set(item) == {"id", "name", "space", "current_version", "updated_at"}
    assert item["id"] == str(project.id) and item["current_version"] == 1


def test_get_project(client_logged, project):
    data = client_logged.get(detail_url(project.id)).json()
    assert set(data) == {"id", "name", "space", "version", "document", "checksum", "updated_at"}
    assert data["version"] == 1
    assert data["document"] == default_document()


# --- update / concurrency ----------------------------------------------------------


def test_update_creates_new_version(client_logged, api, project):
    doc = float_document()
    response = api.put(
        client_logged, detail_url(project.id),
        {"document": doc, "base_version": 1, "name": "Plaque v2", "message": "Cotes"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["version"] == 2 and data["name"] == "Plaque v2"
    # The document is not sent back: the editor holds it; its checksum says what was kept.
    assert "document" not in data and data["checksum"] == compute_checksum(doc)
    project.refresh_from_db()
    assert project.current_version == 2 and project.name == "Plaque v2"
    assert project.versions.count() == 2
    assert project.versions.get(number=2).message == "Cotes"


def test_update_conflict_409(client_logged, api, project):
    # A real change makes version 2 (the same document again would make none).
    assert api.put(client_logged, detail_url(project.id), {"document": float_document(), "base_version": 1}).status_code == 200
    response = api.put(client_logged, detail_url(project.id), {"document": default_document(), "base_version": 1})
    assert response.status_code == 409
    data = response.json()
    assert data["current_version"] == 2 and data["error"]
    assert ProjectVersion.objects.filter(project=project).count() == 2


@pytest.mark.parametrize("body", [
    {"document": None, "base_version": 1},
    {"base_version": 1},
    {"document": {"format": "cao-studio"}, "base_version": 1},
    {"document": "texte", "base_version": 1},
])
def test_update_invalid_document(client_logged, api, project, body):
    response = api.put(client_logged, detail_url(project.id), body)
    assert response.status_code == 400
    assert response.json()["details"]


@pytest.mark.parametrize("base", [None, "1", 1.0, True, -1])
def test_update_invalid_base_version(client_logged, api, project, base):
    body = {"document": default_document(), "base_version": base}
    response = api.put(client_logged, detail_url(project.id), body)
    assert response.status_code == 400


def test_update_message_too_long(client_logged, api, project):
    body = {"document": default_document(), "base_version": 1, "message": "m" * 201}
    assert api.put(client_logged, detail_url(project.id), body).status_code == 400


# --- versions & round trip -----------------------------------------------------


def test_versions_list_and_detail(client_logged, api, project):
    api.put(client_logged, detail_url(project.id), {"document": float_document(), "base_version": 1, "message": "v2"})
    data = client_logged.get(detail_url(project.id) + "versions/").json()
    assert [v["number"] for v in data["versions"]] == [2, 1]
    assert set(data["versions"][0]) == {"number", "checksum", "size_bytes", "message", "created_at"}
    assert data["versions"][0]["message"] == "v2"

    v1 = client_logged.get(detail_url(project.id) + "versions/1/").json()
    assert v1 == {"number": 1, "document": default_document(), "checksum": compute_checksum(default_document())}
    assert client_logged.get(detail_url(project.id) + "versions/9/").status_code == 404


def test_round_trip_preserves_document_and_checksum(client_logged, api):
    doc = float_document()
    created = api.post(client_logged, LIST_URL, {"name": "RT", "document": doc}).json()
    url = detail_url(created["id"])
    loaded = client_logged.get(url).json()
    assert loaded["document"] == doc
    assert loaded["document"]["features"][0]["constraints"][5]["value"] == 80.25
    assert isinstance(loaded["document"]["features"][0]["points"][2]["x"], float)
    assert loaded["checksum"] == created["checksum"] == compute_checksum(doc)
    assert compute_checksum(loaded["document"]) == loaded["checksum"]

    # Saving the reloaded document again keeps the checksum stable — and makes no new version (nothing changed).
    saved = api.put(client_logged, url, {"document": loaded["document"], "base_version": 1}).json()
    assert saved["version"] == 1 and saved["checksum"] == created["checksum"]
    assert ProjectVersion.objects.filter(project_id=created["id"]).count() == 1
    reloaded = client_logged.get(url).json()
    assert reloaded["document"] == doc and reloaded["checksum"] == created["checksum"]

    stored = ProjectVersion.objects.get(project_id=created["id"], number=1)
    stored.refresh_from_db()
    assert stored.document == doc


def test_round_trip_v2_default_document(client_logged, api):
    doc = default_document()
    assert doc["schemaVersion"] == 2
    created = api.post(client_logged, LIST_URL, {"name": "V2", "document": doc})
    assert created.status_code == 201
    created = created.json()
    checksum = compute_checksum(doc)
    assert created["document"] == doc and created["checksum"] == checksum
    url = detail_url(created["id"])

    loaded = client_logged.get(url).json()
    assert loaded["document"] == doc and loaded["checksum"] == checksum

    saved = api.put(client_logged, url, {"document": loaded["document"], "base_version": 1})
    assert saved.status_code == 200
    # Nothing changed: no new version, the same checksum.
    assert saved.json()["version"] == 1 and saved.json()["checksum"] == checksum

    reloaded = client_logged.get(url).json()
    assert reloaded["version"] == 1
    assert reloaded["document"] == doc == default_document()
    assert reloaded["checksum"] == checksum == compute_checksum(reloaded["document"])


def test_create_rejects_invalid_v2_sketch(client_logged, api):
    doc = default_document()
    doc["features"][0]["curves"][0]["p2"] = "p9"
    response = api.post(client_logged, LIST_URL, {"name": "x", "document": doc})
    assert response.status_code == 400
    assert response.json()["details"] == ["Opération 1 (sk1) : point « p9 » introuvable."]
    assert Project.objects.count() == 0


def test_saving_the_same_document_again_makes_no_version_but_renames(client_logged, api, project):
    """Audit of 11/11/2026: autosaves of an unchanged document filled the history with copies."""
    url = detail_url(project.id)
    same = client_logged.get(url).json()["document"]
    response = api.put(client_logged, url, {"document": same, "base_version": 1, "name": "Plaque renommée"})
    assert response.status_code == 200 and response.json()["version"] == 1
    project.refresh_from_db()
    assert project.versions.count() == 1 and project.name == "Plaque renommée"
