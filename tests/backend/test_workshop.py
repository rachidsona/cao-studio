"""Workshop tracking: the API of the editor and the page a label's QR code opens, owner only."""
import pytest
from django.test import Client

from apps.projects.models import PartProgress


def api_url(project):
    return f"/api/projects/{project.id}/workshop/"


def page_url(project, piece=""):
    return f"/atelier/{project.id}/" + (f"?piece={piece}" if piece else "")


@pytest.mark.django_db
def test_the_editor_sets_and_reads_the_steps(client_logged, project, api):
    assert client_logged.get(api_url(project)).json()["parts"] == {}
    made = api.post(client_logged, api_url(project), {"part": "Côté 1", "step": "cut"})
    assert made.status_code == 200 and made.json()["step"] == "cut"
    api.post(client_logged, api_url(project), {"part": "Côté 1", "step": "drilled"})
    data = client_logged.get(api_url(project)).json()
    assert data["parts"]["Côté 1"]["step"] == "drilled"
    assert [s[0] for s in data["steps"]] == ["cut", "banded", "drilled", "assembled"]
    assert api.post(client_logged, api_url(project), {"part": "Côté 1", "step": ""}).json()["step"] == ""
    assert not PartProgress.objects.exists()
    assert api.post(client_logged, api_url(project), {"part": "Côté 1", "step": "brûlée"}).status_code == 400
    assert api.post(client_logged, api_url(project), {"part": "", "step": "cut"}).status_code == 400


@pytest.mark.django_db
def test_the_qr_page_shows_the_piece_and_moves_it_on(client_logged, project):
    page = client_logged.get(page_url(project, "Côté%201"))
    assert page.status_code == 200 and "Côté 1" in page.content.decode() and "Pas encore commencée" in page.content.decode()
    moved = client_logged.post(page_url(project), {"piece": "Côté 1", "step": "banded"})
    assert moved.status_code == 302 and "piece=C%C3%B4t%C3%A9+1" in moved["Location"]
    assert PartProgress.objects.get(part="Côté 1").step == "banded"
    assert "Chantée" in client_logged.get(page_url(project, "Côté%201")).content.decode()


@pytest.mark.django_db
def test_only_the_owner_follows_the_workshop(project, other_user):
    other = Client()
    other.force_login(other_user)
    assert other.get(page_url(project, "X")).status_code == 404
    assert other.get(api_url(project)).status_code == 404
    assert Client().get(page_url(project, "X")).status_code == 302  # to the login page
