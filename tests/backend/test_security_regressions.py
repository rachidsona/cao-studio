"""Tests de non-régression de sécurité (skill secure-application-guardian) : chaque faille corrigée, chaque protection
dont dépend la sécurité, testée ici pour ne pas revenir. Lancés à chaque pull request (workflow security.yml).

Ajouter un test pour chaque faille corrigée ; ne jamais en affaiblir ni en retirer un sans l'accord de l'utilisateur."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from apps.catalog.models import CompanyProfile, HardwareRule
from apps.projects import http, sharing
from apps.projects.documents import default_document
from apps.projects.models import LibraryModule, Offcut, ShareLink

ROOT = Path(__file__).resolve().parents[2]
GLB = b"glTF" + b"\x02\x00\x00\x00" + b"\x00" * 64


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()


def client_of(user) -> Client:
    client = Client()
    client.force_login(user)
    return client


def make_link(client, project, title="Buffet") -> dict:
    data = {"model": SimpleUploadedFile("m.glb", GLB, "model/gltf-binary"), "title": title, "summary": "{}"}
    response = client.post(f"/api/projects/{project.id}/shares/", data)
    assert response.status_code == 201, response.content
    return response.json()


# ---- A01 : contrôle d'accès --------------------------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize(
    "method, path",
    [
        ("get", "/api/projects/"),
        ("get", "/api/library/"),
        ("get", "/api/offcuts/"),
        ("get", "/api/batch/"),
        ("get", "/api/catalog/"),
        ("post", "/api/catalog/rates/"),
        ("post", "/api/client-errors/"),
    ],
)
def test_the_api_needs_an_account(method, path):
    response = getattr(Client(), method)(path)
    assert response.status_code == 401 and response["Content-Type"].startswith("application/json")


@pytest.mark.django_db
def test_other_accounts_projects_are_not_found(project, other_user):
    """Un objet d'un autre compte répond 404 (jamais 403 : on ne dit pas qu'il existe), par toutes les entrées."""
    bob = client_of(other_user)
    base = f"/api/projects/{project.id}"
    body = json.dumps({"message": "x", "part": "Côté", "step": "cut", "price": 1, "body": "x"})
    for method, path in [
        ("get", f"{base}/"),
        ("put", f"{base}/"),
        ("get", f"{base}/versions/"),
        ("get", f"{base}/versions/1/"),
        ("post", f"{base}/price/"),
        ("get", f"{base}/shares/"),
        ("get", f"{base}/comments/"),
        ("post", f"{base}/comments/"),
        ("get", f"{base}/workshop/"),
        ("post", f"{base}/workshop/"),
        ("post", f"{base}/assistant/"),
    ]:
        if method == "put":
            # A valid body (a malformed one is refused first, 400, whoever owns the project: nothing told).
            response = bob.put(path, json.dumps({"base_version": 1, "document": default_document()}), content_type="application/json")
        else:
            response = getattr(bob, method)(path, body, content_type="application/json") if method != "get" else bob.get(path)
        assert response.status_code == 404, (method, path, response.status_code)
    for path in (f"/projects/{project.id}/editor/", f"/projects/{project.id}/fiche/", f"/atelier/{project.id}/"):
        assert bob.get(path).status_code == 404, path
    assert bob.post(f"/projects/{project.id}/supprimer/").status_code == 404
    # Deleting « all the ticked projects » deletes only one's own.
    bob.post("/projects/supprimer/", {"ids": [str(project.id)]})
    project.refresh_from_db()  # Still there.
    assert project.current_version == 1


@pytest.mark.django_db
def test_other_accounts_library_and_offcuts_are_not_found(user, other_user):
    module = LibraryModule.objects.create(owner=user, name="Module", document={"features": []})
    offcut = Offcut.objects.create(owner=user, material="MDF", thickness=19, length=500, width=300)
    bob = client_of(other_user)
    assert bob.get(f"/api/library/{module.pk}/").status_code == 404
    assert bob.delete(f"/api/library/{module.pk}/").status_code == 404
    assert bob.delete(f"/api/offcuts/{offcut.pk}/").status_code == 404
    assert LibraryModule.objects.filter(pk=module.pk).exists() and Offcut.objects.filter(pk=offcut.pk).exists()
    assert bob.get("/api/library/").json()["modules"] == [] and bob.get("/api/offcuts/").json()["offcuts"] == []


@pytest.mark.django_db
def test_shared_catalogue_is_written_by_the_staff_only(client_logged):
    """Audit du 10/11/2026, constat 2 : le catalogue, les tarifs et le profil sont communs ; seul le personnel les écrit."""
    rule = HardwareRule.objects.first()
    unit = "<img src=x onerror=alert(1)>"
    assert client_logged.post(f"/catalogue/quincaillerie/{rule.pk}/", {"name": rule.name, "unit": unit, "unit_price": "1", "default_quantity": "1", "auto_mode": "cabinet", "auto_per_unit": "1"}).status_code == 302
    rule.refresh_from_db()
    assert rule.unit != unit
    assert client_logged.post("/api/catalog/rates/", json.dumps({"vat": 0}), content_type="application/json").status_code == 403
    client_logged.post("/catalogue/atelier/", {"name": "Escroc", "email": "pirate@example.com"})
    assert CompanyProfile.load().name != "Escroc" and CompanyProfile.load().vat == 20


@pytest.mark.django_db
def test_a_revoked_link_stops_working(client_logged, project):
    token = make_link(client_logged, project)["token"]
    assert client_logged.delete(f"/api/projects/{project.id}/shares/{token}/").status_code == 200
    for path in (f"/s/{token}/", f"/s/{token}/model.glb", f"/s/{token}/comments/"):
        assert Client().get(path).status_code == 404, path


@pytest.mark.django_db
def test_public_comments_hide_the_owner_s_links(client_logged, project):
    first = make_link(client_logged, project, "Pour M. Martin")["token"]
    other = make_link(client_logged, project, "Pour Mme Durand")["token"]
    client_logged.post(f"/api/projects/{project.id}/comments/", json.dumps({"body": "Réponse", "token": other}), content_type="application/json")
    comments = Client().get(f"/s/{first}/comments/").json()["comments"]
    assert all("token" not in c and "link" not in c for c in comments)
    assert other not in json.dumps(comments) and "Durand" not in json.dumps(comments)


@pytest.mark.django_db
def test_share_tokens_are_long_and_random(client_logged, project):
    tokens = {make_link(client_logged, project)["token"] for _ in range(3)}
    assert len(tokens) == 3 and all(len(t) >= 24 and re.fullmatch(r"[A-Za-z0-9_-]+", t) for t in tokens)


# ---- A03 : injection -----------------------------------------------------------------------------------------------------


@pytest.mark.django_db
def test_share_page_escapes_the_title(client_logged, project):
    token = make_link(client_logged, project, "</script><script>alert(1)</script>")["token"]
    content = Client().get(f"/s/{token}/").content.decode()
    assert "<script>alert(1)</script>" not in content


def test_templates_do_not_turn_off_escaping():
    """Seul le help_text écrit dans le code passe par |safe (templates/registration/_field.html)."""
    allowed = {ROOT / "templates/registration/_field.html"}
    found = [
        str(p.relative_to(ROOT))
        for p in [*ROOT.glob("templates/**/*.html"), *ROOT.glob("apps/*/templates/**/*.html")]
        if p not in allowed and re.search(r"\|\s*safe\b|\{%\s*autoescape\s+off", p.read_text(encoding="utf-8"))
    ]
    assert found == []


def test_no_csrf_exempt_mark_safe_or_raw_sql_in_the_server_code():
    pattern = re.compile(r"csrf_exempt|mark_safe\(|\.raw\(|\.extra\(|RawSQL|pickle\.|yaml\.load\(|\beval\(|\bexec\(")
    found = [
        f"{p.relative_to(ROOT)}:{n}"
        for p in [*ROOT.glob("apps/**/*.py"), *ROOT.glob("config/*.py")]
        if "migrations" not in p.parts
        for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1)
        if pattern.search(line)
    ]
    assert found == []


# ---- A04 / A05 : entrées, envois et réglages -----------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize("raw", [b'{"name": NaN}', b"[" * 5000 + b"]" * 5000, b'"pas un objet"', b"\xff\xfe"])
def test_hostile_json_bodies_are_refused(client_logged, raw):
    response = client_logged.post("/api/projects/", raw, content_type="application/json")
    assert response.status_code == 400 and "error" in response.json()


@pytest.mark.django_db
def test_a_body_over_the_limit_is_413(client_logged, monkeypatch):
    monkeypatch.setattr(http, "MAX_BODY_BYTES", 100)
    response = client_logged.post("/api/projects/", json.dumps({"name": "x" * 200}), content_type="application/json")
    assert response.status_code == 413


@pytest.mark.django_db
def test_an_upload_must_be_a_glb_of_bounded_size(client_logged, project, monkeypatch):
    url = f"/api/projects/{project.id}/shares/"
    fake = SimpleUploadedFile("m.glb", b"<html><script>alert(1)</script></html>", "model/gltf-binary")
    assert client_logged.post(url, {"model": fake, "title": "x"}).status_code == 400
    monkeypatch.setattr(sharing, "MAX_MODEL_BYTES", 16)
    assert client_logged.post(url, {"model": SimpleUploadedFile("m.glb", GLB, "model/gltf-binary"), "title": "x"}).status_code == 400
    assert not ShareLink.objects.filter(project=project).exists()


@pytest.mark.django_db
def test_the_csrf_token_is_required(user):
    client = Client(enforce_csrf_checks=True)
    client.force_login(user)
    response = client.post("/api/projects/", json.dumps({"name": "x"}), content_type="application/json")
    assert response.status_code == 403 and "CSRF" in response.json()["error"]


@pytest.mark.django_db
def test_security_headers_are_sent(client_logged, project):
    page = Client().get("/accounts/login/")
    assert page["X-Frame-Options"] == "DENY"
    assert page["X-Content-Type-Options"] == "nosniff"
    assert page["Referrer-Policy"] == "same-origin"
    assert page["Cross-Origin-Opener-Policy"] == "same-origin"
    # The editor is framed by the projects' tabs, of this site only.
    assert client_logged.get(f"/projects/{project.id}/editor/")["X-Frame-Options"] == "SAMEORIGIN"


def _settings_with(env: dict) -> subprocess.CompletedProcess:
    code = (
        "import json, django; django.setup(); from django.conf import settings as s; "
        "print(json.dumps({k: getattr(s, k) for k in ('DEBUG', 'SESSION_COOKIE_SECURE', 'CSRF_COOKIE_SECURE', "
        "'SECURE_SSL_REDIRECT', 'SECURE_HSTS_SECONDS', 'SESSION_COOKIE_HTTPONLY', 'X_FRAME_OPTIONS')}))"
    )
    base = {k: v for k, v in os.environ.items() if not k.startswith(("DJANGO_", "POSTGRES_"))}
    return subprocess.run(
        [sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True, timeout=60,
        env={**base, "DJANGO_SETTINGS_MODULE": "config.settings", **env},
    )


def test_production_settings_are_hardened():
    run = _settings_with({"DJANGO_DEBUG": "0", "DJANGO_SECRET_KEY": "test-" + "k" * 60, "DJANGO_ALLOWED_HOSTS": "example.com"})
    assert run.returncode == 0, run.stderr
    values = json.loads(run.stdout.strip().splitlines()[-1])
    assert values["DEBUG"] is False
    assert values["SESSION_COOKIE_SECURE"] and values["CSRF_COOKIE_SECURE"] and values["SECURE_SSL_REDIRECT"]
    assert values["SECURE_HSTS_SECONDS"] >= 31_536_000
    assert values["SESSION_COOKIE_HTTPONLY"] and values["X_FRAME_OPTIONS"] == "DENY"


def test_production_refuses_to_start_without_a_secret_key():
    run = _settings_with({"DJANGO_DEBUG": "0", "DJANGO_ALLOWED_HOSTS": "example.com"})
    assert run.returncode != 0 and "DJANGO_SECRET_KEY" in run.stderr
