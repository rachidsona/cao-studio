"""L'inscription libre fermée (audit de sécurité du 10/11/2026, constat M8) et la commande qui crée les comptes.

Tests de non-régression de sécurité (skill secure-application-guardian), lancés par security.yml."""
import pytest
from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.test import Client

PASSWORD = "Tr3s-Solide-Mdp!"


def _post_signup(client):
    return client.post("/accounts/signup/", {"username": "intrus", "password1": PASSWORD, "password2": PASSWORD})


@pytest.mark.django_db
def test_signup_is_closed_by_default(settings):
    assert settings.SIGNUP_OPEN is False
    client = Client()
    page = client.get("/accounts/signup/")
    assert page.status_code == 403
    assert "L'inscription est fermée" in page.content.decode() and 'name="password1"' not in page.content.decode()
    assert _post_signup(client).status_code == 403
    assert not get_user_model().objects.filter(username="intrus").exists()
    # The pages no longer link to it.
    login = client.get("/accounts/login/").content.decode()
    assert "/accounts/signup/" not in login and "Demandez-le à l'atelier" in login


@pytest.mark.django_db
def test_signup_opens_with_its_setting(settings):
    settings.SIGNUP_OPEN = True
    client = Client()
    assert "/accounts/signup/" in client.get("/accounts/login/").content.decode()
    assert _post_signup(client).status_code == 302
    assert get_user_model().objects.filter(username="intrus").exists()


def _passwords(monkeypatch, *typed):
    answers = iter(typed)
    monkeypatch.setattr("apps.accounts.management.commands.compte.getpass", lambda prompt="": next(answers))


@pytest.mark.django_db
def test_the_staff_creates_an_account_that_can_log_in(monkeypatch):
    _passwords(monkeypatch, PASSWORD, PASSWORD)
    call_command("compte", "claire")
    user = get_user_model().objects.get(username="claire")
    assert not user.is_staff and not user.is_superuser and user.is_active
    assert Client().login(username="claire", password=PASSWORD)


@pytest.mark.django_db
def test_the_account_command_refuses_a_weak_or_mistyped_password_and_an_existing_name(monkeypatch, user):
    _passwords(monkeypatch, "123", "123")
    with pytest.raises(CommandError):
        call_command("compte", "bob")
    _passwords(monkeypatch, PASSWORD, "autre-chose-99")
    with pytest.raises(CommandError, match="diffèrent"):
        call_command("compte", "bob")
    assert not get_user_model().objects.filter(username="bob").exists()
    with pytest.raises(CommandError, match="existe déjà"):
        call_command("compte", user.username)
    with pytest.raises(CommandError):
        call_command("compte", "pas de blanc ni /")


@pytest.mark.django_db
def test_the_account_command_changes_a_password(monkeypatch, user):
    _passwords(monkeypatch, PASSWORD, PASSWORD)
    call_command("compte", user.username, "--mot-de-passe")
    assert Client().login(username=user.username, password=PASSWORD)
    with pytest.raises(CommandError, match="Aucun compte"):
        call_command("compte", "personne", "--mot-de-passe")
