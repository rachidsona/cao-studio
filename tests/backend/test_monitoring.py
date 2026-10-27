import logging

import pytest
from django.test import Client

URL = "/api/client-errors/"


@pytest.mark.django_db
def test_healthz_answers_without_login():
    response = Client().get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.django_db
def test_healthz_only_get():
    assert Client().post("/healthz").status_code == 405


@pytest.mark.django_db
def test_client_error_needs_login(api):
    assert api.post(Client(), URL, {"message": "boum"}).status_code == 401


def test_client_error_is_logged_and_cut(client_logged, api, caplog):
    with caplog.at_level(logging.ERROR, logger="apps.client"):
        response = api.post(client_logged, URL, {"message": "x" * 2000, "stack": "at f()", "url": "/projects/1/editor/"})
    assert response.status_code == 204
    record = next(r for r in caplog.records if r.name == "apps.client")
    assert len(record.args[1]) == 500
    assert record.stack == "at f()"
    assert record.page == "/projects/1/editor/"


def test_client_error_requires_a_message(client_logged, api):
    response = api.post(client_logged, URL, {"message": 3})
    assert response.status_code == 400
    assert response.json()["error"] == "Rapport d'erreur invalide."
