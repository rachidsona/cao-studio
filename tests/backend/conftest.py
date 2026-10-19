import json

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from apps.projects.documents import default_document
from apps.projects.services import create_project


@pytest.fixture(autouse=True)
def _fast_password_hasher(settings):
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(username="alice", password="motdepasse-solide-42")


@pytest.fixture
def other_user(db):
    return get_user_model().objects.create_user(username="bob", password="motdepasse-solide-42")


@pytest.fixture
def client_logged(user):
    client = Client()
    client.force_login(user)
    return client


@pytest.fixture
def project(user):
    project, _ = create_project(user, "Plaque", default_document())
    return project


@pytest.fixture
def api():
    """Small helper to send JSON bodies."""

    class Api:
        @staticmethod
        def post(client, url, data, **extra):
            return client.post(url, json.dumps(data), content_type="application/json", **extra)

        @staticmethod
        def put(client, url, data, **extra):
            return client.put(url, json.dumps(data), content_type="application/json", **extra)

    return Api
