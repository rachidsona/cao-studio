"""Undo and redo of the room editor (workshop /poly/): every change of a room can be undone, then redone."""
import json

import pytest
from django.urls import reverse

from apps.furniture.models import Project, RoomHistory
from apps.furniture.room import ensure_room
from apps.furniture.room_history import HISTORY_LIMIT


@pytest.fixture
def room(db):
    project = Project.objects.create(name="Cuisine test", client_name="Client", placement_mode=Project.PLACEMENT_ROOM)
    ensure_room(project)
    return project


def post(client, name, project, *args, data=None):
    response = client.post(reverse(f"poly:{name}", args=[project.pk, *args]), json.dumps(data or {}), content_type="application/json")
    body = response.json()
    assert body.get("ok"), body
    return body["payload"]


@pytest.mark.django_db
def test_a_cabinet_removed_comes_back_and_goes_again(client_logged, room):
    payload = post(client_logged, "api_project_item_add", room, data={"preset_key": "kitchen-base-600"})
    assert len(payload["items"]) == 1 and payload["history"] == {"undo": 1, "redo": 0}
    item = payload["items"][0]
    payload = post(client_logged, "api_project_item_delete", room, item["id"])
    assert payload["items"] == [] and payload["history"] == {"undo": 2, "redo": 0}
    payload = post(client_logged, "api_project_room_undo", room)
    assert [i["cabinet_id"] for i in payload["items"]] == [item["cabinet_id"]]
    assert payload["history"] == {"undo": 1, "redo": 1}
    payload = post(client_logged, "api_project_room_redo", room)
    assert payload["items"] == [] and payload["history"] == {"undo": 2, "redo": 0}


@pytest.mark.django_db
def test_a_move_and_a_window_are_undone(client_logged, room):
    payload = post(client_logged, "api_project_item_add", room, data={"preset_key": "kitchen-base-600"})
    item = payload["items"][0]
    post(client_logged, "api_project_item_update", room, item["id"], data={"pos_x": item["pos_x"] + 500})
    payload = post(client_logged, "api_project_room_undo", room)
    assert payload["items"][0]["pos_x"] == pytest.approx(item["pos_x"])
    wall = payload["walls"][0]
    payload = post(client_logged, "api_project_opening_create", room, data={"wall_id": wall["id"], "kind": "window", "offset": 200, "width": 900})
    assert len(payload["openings"]) == 1
    payload = post(client_logged, "api_project_room_undo", room)
    assert payload["openings"] == []


@pytest.mark.django_db
def test_worktops_placed_by_hand_are_kept_by_undo(client_logged, room):
    payload = post(client_logged, "api_project_worktop_add", room)
    worktop = next(w for w in payload["worktops"] if w.get("explicit", True))
    assert payload["history"]["undo"] == 1
    post(client_logged, "api_project_room_update", room, data={"room_width": 4200})
    payload = post(client_logged, "api_project_room_undo", room)
    assert len([w for w in payload["worktops"] if w.get("id")]) >= 1
    assert payload["project"]["room_width"] == pytest.approx(4000)
    assert worktop


@pytest.mark.django_db
def test_a_new_change_clears_redo_and_the_history_is_bounded(client_logged, room):
    post(client_logged, "api_project_item_add", room, data={"preset_key": "kitchen-base-600"})
    post(client_logged, "api_project_room_undo", room)
    payload = post(client_logged, "api_project_item_add", room, data={"preset_key": "kitchen-base-800"})
    assert payload["history"] == {"undo": 1, "redo": 0}
    for _ in range(HISTORY_LIMIT + 5):
        post(client_logged, "api_project_room_update", room, data={"room_height": 2500})
    assert RoomHistory.objects.filter(project=room, direction="undo").count() == HISTORY_LIMIT


@pytest.mark.django_db
def test_nothing_to_undo_says_so(client_logged, room):
    response = client_logged.post(reverse("poly:api_project_room_undo", args=[room.pk]))
    assert response.json()["message"] == "Rien à annuler."
