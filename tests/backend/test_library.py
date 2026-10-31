"""The library of one's own modules: saved, listed, read and deleted by their owner only, validated."""
import pytest
from django.test import Client

from apps.projects.documents import default_document
from apps.projects.models import LibraryModule

URL = "/api/library/"
THUMB = "data:image/jpeg;base64,/9j/4AAQ"


@pytest.mark.django_db
def test_owner_saves_lists_reads_and_deletes_a_module(client_logged, api):
    made = api.post(client_logged, URL, {"name": "  Caisson bas 600 ", "document": default_document(), "thumbnail": THUMB})
    assert made.status_code == 201, made.content
    module = made.json()
    assert module["name"] == "Caisson bas 600" and module["thumbnail"] == THUMB
    listed = client_logged.get(URL).json()["modules"]
    assert [m["name"] for m in listed] == ["Caisson bas 600"]
    assert "document" not in listed[0]
    read = client_logged.get(f"{URL}{module['id']}/").json()
    assert read["document"]["features"] == default_document()["features"]
    assert client_logged.delete(f"{URL}{module['id']}/").status_code == 204
    assert not LibraryModule.objects.exists()


@pytest.mark.django_db
def test_a_module_is_validated(client_logged, api):
    bad = api.post(client_logged, URL, {"name": "X", "document": {"format": "autre"}})
    assert bad.status_code == 400
    empty = api.post(client_logged, URL, {"name": "X", "document": {**default_document(), "features": []}})
    assert empty.status_code == 400 and empty.json()["error"] == "Module vide."
    assert api.post(client_logged, URL, {"name": "", "document": default_document()}).status_code == 400
    thumb = api.post(client_logged, URL, {"name": "X", "document": default_document(), "thumbnail": "javascript:alert(1)"})
    assert thumb.status_code == 400


@pytest.mark.django_db
def test_modules_are_private(client_logged, other_user, api):
    module = api.post(client_logged, URL, {"name": "Tiroir", "document": default_document()}).json()
    other = Client()
    other.force_login(other_user)
    assert other.get(URL).json()["modules"] == []
    assert other.get(f"{URL}{module['id']}/").status_code == 404
    assert other.delete(f"{URL}{module['id']}/").status_code == 404
    assert Client().get(URL).status_code == 401
