"""What one keeps for all one's projects (« Mes caissons », suppliers, rates…), kept by the server, owner-only."""
import json

import pytest
from django.test import Client

from apps.projects.models import KeptData


def put(client, key, value):
    return client.put(f"/api/kept/{key}/", json.dumps({"value": value}), content_type="application/json")


@pytest.mark.django_db
def test_kept_data_follows_the_account_and_only_it(client_logged, user, other_user):
    assert client_logged.get("/api/kept/").json() == {"data": {}}
    units = json.dumps([{"name": "Mon caisson rangement"}])
    assert put(client_logged, "cao.kitchen-own-units", units).status_code == 200
    assert put(client_logged, "cao.suppliers", "[]").status_code == 200
    assert client_logged.get("/api/kept/").json() == {"data": {"cao.kitchen-own-units": units, "cao.suppliers": "[]"}}
    # Changed in place, one row per key.
    put(client_logged, "cao.suppliers", '[{"name": "Panneaux du Sud"}]')
    assert KeptData.objects.filter(owner=user, key="cao.suppliers").count() == 1
    # Taken away.
    assert put(client_logged, "cao.suppliers", None).status_code == 200
    assert "cao.suppliers" not in client_logged.get("/api/kept/").json()["data"]
    # Someone else sees none of it.
    other = Client()
    other.force_login(other_user)
    assert other.get("/api/kept/").json() == {"data": {}}


@pytest.mark.django_db
def test_the_interface_layout_follows_the_account(client_logged):
    columns = json.dumps({"columns": [["data-action:extrude"]], "folded": [False], "names": ["meubles"]})
    for key in ("cao.tool-columns", "cao.side-tools", "cao.ribbon-hidden.model", "cao.shortcuts"):
        assert put(client_logged, key, columns).status_code == 200
    assert client_logged.get("/api/kept/").json()["data"]["cao.tool-columns"] == columns


@pytest.mark.django_db
def test_kept_data_takes_known_keys_and_texts_only(client_logged):
    assert put(client_logged, "cao.anything", "x").status_code == 404
    assert put(client_logged, "cao.suppliers", 12).status_code == 400
    assert put(client_logged, "cao.suppliers", "x" * 2_000_001).status_code == 400
    bad = client_logged.put("/api/kept/cao.suppliers/", json.dumps([1]), content_type="application/json")
    assert bad.status_code == 400
    assert Client().get("/api/kept/").status_code == 401
