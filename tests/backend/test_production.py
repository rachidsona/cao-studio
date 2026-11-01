"""The workshop's offcuts and grouped production (owner-only), and the variants a client chooses on a share link."""
import json

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from apps.projects.models import BatchItem, Offcut

GLB = b"glTF" + b"\x02\x00\x00\x00" + b"\x00" * 64
ROW = {"names": ["Côté gauche", "Côté droit"], "quantity": 2, "length": 720, "width": 557, "thickness": 18, "material": "Mélaminé blanc", "grain": "length", "edges": {"length1": True}, "band": 1, "cutLength": 720, "cutWidth": 556}


def post(client, url, data):
    return client.post(url, json.dumps(data), content_type="application/json")


@pytest.mark.django_db
def test_offcuts_are_kept_used_and_removed(client_logged, user, other_user):
    made = post(client_logged, "/api/offcuts/", {"offcuts": [{"material": "Mélaminé blanc", "thickness": 19, "length": 400, "width": 900, "quantity": 2}]})
    assert made.status_code == 201
    [piece] = made.json()["offcuts"]
    # Kept as length ≥ width.
    assert (piece["length"], piece["width"], piece["quantity"]) == (900, 400, 2)
    patched = client_logged.patch(f"/api/offcuts/{piece['id']}/", json.dumps({"quantity": 1}), content_type="application/json")
    assert patched.json()["quantity"] == 1
    # Someone else neither sees nor touches it.
    other = Client()
    other.force_login(other_user)
    assert other.get("/api/offcuts/").json()["offcuts"] == []
    assert other.delete(f"/api/offcuts/{piece['id']}/").status_code == 404
    # Used up: gone.
    assert client_logged.patch(f"/api/offcuts/{piece['id']}/", json.dumps({"quantity": 0}), content_type="application/json").status_code == 204
    assert not Offcut.objects.filter(owner=user).exists()


@pytest.mark.django_db
def test_offcuts_are_checked(client_logged):
    assert post(client_logged, "/api/offcuts/", {"offcuts": []}).status_code == 400
    assert post(client_logged, "/api/offcuts/", {"offcuts": [{"material": "", "thickness": 19, "length": 1, "width": 1}]}).status_code == 400
    assert post(client_logged, "/api/offcuts/", {"offcuts": [{"material": "MDF", "thickness": -1, "length": 1, "width": 1}]}).status_code == 400
    assert Client().get("/api/offcuts/").status_code == 401


@pytest.mark.django_db
def test_a_project_goes_in_the_batch_once_with_its_quantity(client_logged, project, user):
    first = post(client_logged, "/api/batch/", {"project": str(project.id), "name": "Plaque", "rows": [ROW], "hardware": [{"name": "Pied réglable", "quantity": 4}]})
    assert first.status_code == 201
    item = first.json()
    assert item["rows"][0]["cutWidth"] == 556 and item["hardware"] == [{"name": "Pied réglable", "quantity": 4.0}]
    # Added again: replaced, not doubled.
    again = post(client_logged, "/api/batch/", {"project": str(project.id), "name": "Plaque", "rows": [ROW, ROW]})
    assert again.json()["id"] == item["id"] and len(again.json()["rows"]) == 2
    assert BatchItem.objects.filter(owner=user).count() == 1
    assert client_logged.patch(f"/api/batch/{item['id']}/", json.dumps({"quantity": 5}), content_type="application/json").json()["quantity"] == 5
    assert post(client_logged, "/api/batch/", {"name": "x", "rows": [{**ROW, "length": "long"}]}).status_code == 400
    assert client_logged.delete(f"/api/batch/{item['id']}/").status_code == 204
    assert client_logged.get("/api/batch/").json()["items"] == []


@pytest.mark.django_db
def test_someone_elses_project_cannot_go_in_the_batch(project, other_user):
    other = Client()
    other.force_login(other_user)
    assert post(other, "/api/batch/", {"project": str(project.id), "name": "x", "rows": [ROW]}).status_code == 404


@pytest.mark.django_db
def test_a_link_offers_variants_with_their_models_and_prices(client_logged, project):
    cache.clear()
    summary = {"size": [600, 560, 720], "variants": [{"name": "Petit 600", "price": 480.5, "size": [600, 560, 720]}, {"name": "Grand 900", "price": 690}]}
    data = {
        "model": SimpleUploadedFile("m.glb", GLB),
        "variant_0": SimpleUploadedFile("v0.glb", GLB + b"0"),
        "variant_1": SimpleUploadedFile("v1.glb", GLB + b"1"),
        "title": "Buffet",
        "summary": json.dumps(summary),
    }
    made = client_logged.post(f"/api/projects/{project.id}/shares/", data)
    assert made.status_code == 201, made.content
    token = made.json()["token"]
    page = Client().get(f"/s/{token}/")
    payload = json.loads(page.content.decode().split('id="share-data" type="application/json">')[1].split("</script>")[0])
    assert [(v["name"], v["price"]) for v in payload["variants"]] == [("Petit 600", 480.5), ("Grand 900", 690.0)]
    model = Client().get(payload["variants"][1]["modelUrl"])
    assert model.status_code == 200 and model.content == GLB + b"1"
    assert Client().get(f"/s/{token}/variants/9.glb").status_code == 404
    # A variant without its model is refused.
    missing = client_logged.post(f"/api/projects/{project.id}/shares/", {"model": SimpleUploadedFile("m.glb", GLB), "summary": json.dumps({"variants": [{"name": "A"}]})})
    assert missing.status_code == 400
