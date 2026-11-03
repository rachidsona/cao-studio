"""Room checks (workshop /poly/): an oven, a microwave or a fridge inside a cabinet is built in, not in its way."""
import pytest

from apps.furniture.library import PRESETS, create_cabinet_from_preset
from apps.furniture.models import Project, ProjectItem, RoomAppliance
from apps.furniture.room import ensure_room, is_built_in, project_warnings


@pytest.fixture
def column(db):
    project = Project.objects.create(name="Cuisine", client_name="Client", placement_mode=Project.PLACEMENT_ROOM)
    ensure_room(project)
    cabinet = create_cabinet_from_preset(next(p for p in PRESETS if p["key"] == "kitchen-tall-600"))
    item = ProjectItem.objects.create(project=project, cabinet=cabinet, slot=0, pos_x=1250, pos_y=50, rotation=0, elevation=0)
    return project, item


def appliance(project, kind, x, y, elevation, width=600, depth=560, height=600):
    return RoomAppliance.objects.create(project=project, kind=kind, name=f"{kind} test", width=width, depth=depth, height=height, pos_x=x, pos_y=y, rotation=0, elevation=elevation)


def overlaps(project):
    return [w["message"] for w in project_warnings(project) if "chevauche" in w["message"]]


def test_an_oven_inside_its_column_is_built_in(column):
    project, item = column
    oven = appliance(project, RoomAppliance.KIND_OVEN, 1250, 50, 800)
    assert is_built_in(oven, item)
    assert overlaps(project) == []


def test_an_oven_standing_out_of_the_column_is_still_a_clash(column):
    project, item = column
    oven = appliance(project, RoomAppliance.KIND_OVEN, 1550, 50, 800)
    assert not is_built_in(oven, item)
    assert overlaps(project) == ["L'appareil « oven test » chevauche le caisson « " + item.cabinet.name + " »."]


def test_a_dishwasher_inside_a_cabinet_is_still_a_clash(column):
    project, item = column
    appliance(project, RoomAppliance.KIND_DISHWASHER, 1250, 50, 0, height=820)
    assert len(overlaps(project)) == 1


def test_the_room_payload_says_which_cabinet_an_appliance_is_built_into(column):
    from apps.furniture.room import room_payload

    project, item = column
    appliance(project, RoomAppliance.KIND_OVEN, 1250, 50, 800)
    appliance(project, RoomAppliance.KIND_OVEN, 2400, 50, 800)
    built = [a["built_in_item_id"] for a in room_payload(project)["appliances"]]
    assert built == [item.pk, None]
