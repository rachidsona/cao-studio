"""Client links: owner API (create, list, revoke), public page and model, comments (rate-limited), replies."""
import json

import pytest
from glb_files import glb
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from apps.projects.models import Comment, ShareLink

GLB = glb()


def shares_url(project):
    return f"/api/projects/{project.id}/shares/"


def make_link(client, project, **fields):
    data = {"model": SimpleUploadedFile("m.glb", GLB, "model/gltf-binary"), "title": "Buffet", "summary": json.dumps({"size": [1200, 450, 900], "price": 980.5}), **fields}
    response = client.post(shares_url(project), data)
    assert response.status_code == 201, response.content
    return response.json()


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()


@pytest.mark.django_db
def test_owner_creates_lists_and_revokes_a_link(client_logged, project):
    made = make_link(client_logged, project)
    assert made["url"].endswith(f"/s/{made['token']}/")
    assert len(made["token"]) >= 20
    listed = client_logged.get(shares_url(project)).json()["shares"]
    assert [s["title"] for s in listed] == ["Buffet"]
    page = Client().get(f"/s/{made['token']}/")
    assert page.status_code == 200
    assert b"share-data" in page.content and page["X-Robots-Tag"] == "noindex"
    model = Client().get(f"/s/{made['token']}/model.glb")
    assert model.status_code == 200 and model["Content-Type"] == "model/gltf-binary" and model.content == GLB
    revoked = client_logged.delete(f"{shares_url(project)}{made['token']}/").json()
    assert revoked["revoked"] is True
    assert Client().get(f"/s/{made['token']}/").status_code == 404
    assert Client().get(f"/s/{made['token']}/model.glb").status_code == 404


@pytest.mark.django_db
def test_upload_is_checked(client_logged, project):
    bad = client_logged.post(shares_url(project), {"model": SimpleUploadedFile("m.glb", b"nope", "model/gltf-binary")})
    assert bad.status_code == 400
    assert client_logged.post(shares_url(project), {}).status_code == 400
    summary = client_logged.post(shares_url(project), {"model": SimpleUploadedFile("m.glb", GLB), "summary": "[1]"})
    assert summary.status_code == 400


@pytest.mark.django_db
def test_only_the_owner_manages_links(project, other_user):
    other = Client()
    other.force_login(other_user)
    assert other.get(shares_url(project)).status_code == 404
    assert Client().get(shares_url(project)).status_code == 401


@pytest.mark.django_db
def test_client_comments_with_a_point_and_the_owner_replies(client_logged, project, api):
    made = make_link(client_logged, project)
    visitor = Client(enforce_csrf_checks=True)
    visitor.get(f"/s/{made['token']}/")
    token = visitor.cookies["csrftoken"].value
    url = f"/s/{made['token']}/comments/"
    posted = visitor.post(url, json.dumps({"author": "Mme Durand", "body": "Plus haut ici ?", "position": [300, -20, 850]}), content_type="application/json", HTTP_X_CSRFTOKEN=token)
    assert posted.status_code == 201, posted.content
    assert "token" not in posted.json() and posted.json()["position"] == [300.0, -20.0, 850.0]
    without_csrf = Client(enforce_csrf_checks=True).post(url, json.dumps({"author": "x", "body": "y"}), content_type="application/json")
    assert without_csrf.status_code == 403
    owner = client_logged.get(f"/api/projects/{project.id}/comments/").json()["comments"]
    assert owner[0]["author"] == "Mme Durand" and owner[0]["token"] == made["token"]
    reply = api.post(client_logged, f"/api/projects/{project.id}/comments/", {"body": "Oui, 900 mm.", "token": made["token"]})
    assert reply.status_code == 201 and reply.json()["from_owner"] is True
    public = Client().get(url).json()["comments"]
    assert [c["body"] for c in public] == ["Plus haut ici ?", "Oui, 900 mm."]
    done = client_logged.patch(f"/api/projects/{project.id}/comments/{owner[0]['id']}/", json.dumps({"resolved": True}), content_type="application/json")
    assert done.json()["resolved"] is True


@pytest.mark.django_db
def test_comments_are_validated_closed_and_rate_limited(client_logged, project):
    made = make_link(client_logged, project)
    url = f"/s/{made['token']}/comments/"
    visitor = Client()
    post = lambda data: visitor.post(url, json.dumps(data), content_type="application/json")  # noqa: E731
    assert post({"author": "", "body": "x"}).status_code == 400
    assert post({"author": "A", "body": "x" * 2001}).status_code == 400
    assert post({"author": "A", "body": "x", "position": [1, 2]}).status_code == 400
    for _ in range(10):
        assert post({"author": "A", "body": "ok"}).status_code == 201
    assert post({"author": "A", "body": "encore"}).status_code == 429
    closed = make_link(client_logged, project, allow_comments="0")
    assert Client().post(f"/s/{closed['token']}/comments/", json.dumps({"author": "A", "body": "x"}), content_type="application/json").status_code == 403
    assert Comment.objects.count() == 10
    assert ShareLink.objects.count() == 2


def accept_url(made):
    return f"/s/{made['token']}/accept/"


def post_json(client, url, data):
    return client.post(url, json.dumps(data), content_type="application/json")


@pytest.mark.django_db
def test_client_accepts_once_and_the_workshop_sees_it(client_logged, project):
    made = make_link(client_logged, project, allow_accept="1", summary=json.dumps({"price": 3200.0}))
    public = Client()
    response = post_json(public, accept_url(made), {"name": "Mme Martin"})
    assert response.status_code == 200, response.content
    assert response.json()["accepted"]["by"] == "Mme Martin"
    assert response.json()["accepted"]["price"] == 3200.0
    assert post_json(public, accept_url(made), {"name": "Autre"}).status_code == 409
    listed = client_logged.get(shares_url(project)).json()["shares"][0]
    assert listed["accepted"]["by"] == "Mme Martin"
    assert Comment.objects.filter(project=project, author="Mme Martin", body__startswith="Projet accepté").exists()
    assert b"Mme Martin" in public.get(f"/s/{made['token']}/").content


@pytest.mark.django_db
def test_accepting_needs_the_option_a_name_and_a_live_link(client_logged, project):
    closed = make_link(client_logged, project)
    public = Client()
    assert post_json(public, accept_url(closed), {"name": "A"}).status_code == 403
    made = make_link(client_logged, project, allow_accept="1")
    assert post_json(public, accept_url(made), {"name": " "}).status_code == 400
    client_logged.delete(f"{shares_url(project)}{made['token']}/")
    assert post_json(public, accept_url(made), {"name": "A"}).status_code == 404


@pytest.mark.django_db
def test_accepting_a_link_with_variants_names_the_variant(client_logged, project):
    summary = {"variants": [{"name": "Essentiel", "price": 2000}, {"name": "Prestige", "price": 4000}]}
    made = make_link(
        client_logged,
        project,
        allow_accept="1",
        summary=json.dumps(summary),
        variant_0=SimpleUploadedFile("a.glb", GLB, "model/gltf-binary"),
        variant_1=SimpleUploadedFile("b.glb", GLB, "model/gltf-binary"),
    )
    public = Client()
    assert post_json(public, accept_url(made), {"name": "A"}).status_code == 400
    assert post_json(public, accept_url(made), {"name": "A", "variant": 9}).status_code == 400
    accepted = post_json(public, accept_url(made), {"name": "A", "variant": 1}).json()["accepted"]
    assert accepted["variant"] == "Prestige" and accepted["price"] == 4000
    link = ShareLink.objects.get(token=made["token"])
    assert link.accepted_at is not None
