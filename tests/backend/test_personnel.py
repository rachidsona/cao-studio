"""La commande « personnel » : met un compte dans le personnel de l'atelier (il modifie le catalogue), ou l'en retire."""
from io import StringIO

import pytest
from django.core.management import CommandError, call_command


def run(*args) -> str:
    out = StringIO()
    call_command("personnel", *args, stdout=out)
    return out.getvalue()


@pytest.mark.django_db
def test_a_staff_member_added_listed_then_removed(user):
    assert "Personne" in run()
    assert "mis dans le personnel" in run("alice")
    user.refresh_from_db()
    assert user.is_staff and run().strip() == "alice"
    assert "retiré du personnel" in run("alice", "--retirer")
    user.refresh_from_db()
    assert not user.is_staff


@pytest.mark.django_db
def test_an_unknown_account():
    with pytest.raises(CommandError, match="Aucun compte"):
        run("personne")
