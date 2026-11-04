"""Tests of the workshop of the former poly_3D (apps/furniture, quotes, workshop), mounted under /poly/."""
import json

from django.contrib.auth import get_user_model
from django.test import Client
from django.test import TestCase as DjangoTestCase
from django.urls import reverse

from apps.quotes.models import Quote
from apps.workshop.models import CutList

from apps.furniture.engine import (
    AABB,
    GeometryError,
    ParametricSolver,
    ShelfPlacement,
    ShelfTool,
    Vec3,
    VolumeNode,
    VolumetricDivider,
)
from apps.furniture.history import (
    capture_cabinet,
    record_history,
    redo_cabinet,
    undo_cabinet,
)
from apps.furniture.models import (
    Cabinet,
    Component,
    HardwareRule,
    Material,
    Panel,
    Project,
    ProjectItem,
    ProjectVersion,
    RoomAppliance,
    RoomOpening,
    RoomWall,
    RoomWorktop,
)
from apps.furniture.room import (
    add_appliance_to_room,
    add_cabinet_to_room,
    compute_worktops,
    create_opening,
    create_version,
    dressing_stats,
    duplicate_project,
    ensure_room,
    item_bbox,
    project_price_summary,
    project_warnings,
    restore_version,
    room_payload,
    update_appliance,
    update_item,
    update_walls,
    wall_length,
    worktop_surface_height,
)
from apps.furniture.scene import build_scene
from apps.furniture.services import CabinetDesignError, CabinetDesignService, create_cabinet


class LoggedClient(Client):
    """A client logged in as a workshop account before its first request (/poly/ needs an account)."""

    def request(self, **request):
        if "_auth_user_id" not in self.session:
            user, _ = get_user_model().objects.get_or_create(username="atelier-tests")
            self.force_login(user)
        return super().request(**request)


class TestCase(DjangoTestCase):
    client_class = LoggedClient


class EngineDivisionTests(TestCase):
    def setUp(self):
        self.divider = VolumetricDivider(panel_thickness=19, min_bay=50)
        self.parent = VolumeNode(
            id="root",
            cabinet_id="1",
            bbox=AABB(Vec3(19, 19, 3), Vec3(600, 500, 300)),
            meta={"material_carcase_id": "1"},
        )

    def test_vertical_split_consumes_panel_thickness(self):
        result = self.divider.split_vertical(self.parent, 250)
        left, right = result.children
        self.assertAlmostEqual(left.bbox.width, 240.5)
        self.assertAlmostEqual(right.bbox.width, 340.5)
        self.assertAlmostEqual(result.divider_bbox.width, 19)
        self.assertAlmostEqual(left.bbox.x1, result.divider_bbox.x0)
        self.assertAlmostEqual(result.divider_bbox.x1, right.bbox.x0)
        self.assertEqual(len(result.panels), 1)
        self.assertEqual(result.panels[0].origin, "divider")

    def test_horizontal_split_consumes_panel_thickness(self):
        result = self.divider.split_horizontal(self.parent, 260)
        bottom, top = result.children
        self.assertAlmostEqual(bottom.bbox.height, 250.5)
        self.assertAlmostEqual(top.bbox.height, 230.5)
        self.assertAlmostEqual(bottom.bbox.y1, result.divider_bbox.y0)
        self.assertAlmostEqual(result.divider_bbox.y1, top.bbox.y0)

    def test_split_too_close_to_edge_is_rejected(self):
        with self.assertRaises(GeometryError):
            self.divider.split_vertical(self.parent, 10)
        with self.assertRaises(GeometryError):
            self.divider.split_vertical(self.parent, 595)

    def test_volume_too_small_is_rejected(self):
        small = VolumeNode(id="small", bbox=AABB(Vec3(0, 0, 0), Vec3(100, 100, 100)))
        with self.assertRaises(GeometryError):
            self.divider.split_vertical(small, 50)


class EngineShelfTests(TestCase):
    def setUp(self):
        self.tool = ShelfTool(panel_thickness=19, side_clearance=0.5)
        self.volume = VolumeNode(
            id="bay",
            cabinet_id="1",
            bbox=AABB(Vec3(19, 19, 3), Vec3(400, 600, 300)),
        )

    def test_shelf_length_follows_volume_width(self):
        shelf, panel = self.tool.place_shelf(
            self.volume, ShelfPlacement(volume_id="bay", height_from_bottom=200)
        )
        self.assertAlmostEqual(shelf.bbox.width, 399.0)
        self.assertAlmostEqual(shelf.bbox.depth, 300.0)
        self.assertAlmostEqual(panel.length, 399.0)
        self.assertAlmostEqual(panel.width, 300.0)

    def test_shelf_position_validation(self):
        with self.assertRaises(GeometryError):
            self.tool.place_shelf(self.volume, ShelfPlacement(volume_id="bay", height_from_bottom=2))
        with self.assertRaises(GeometryError):
            self.tool.place_shelf(self.volume, ShelfPlacement(volume_id="bay", height_from_bottom=595))

    def test_shelf_recalculates_on_resize(self):
        shelf, _ = self.tool.place_shelf(
            self.volume, ShelfPlacement(volume_id="bay", height_from_bottom=200)
        )
        resized = VolumeNode(
            id="bay",
            cabinet_id="1",
            bbox=AABB(Vec3(19, 19, 3), Vec3(700, 800, 350)),
        )
        bbox, position, _ = self.tool.recalc(resized, shelf.height_from_bottom)
        self.assertAlmostEqual(bbox.width, 699.0)
        self.assertAlmostEqual(bbox.depth, 350.0)
        self.assertAlmostEqual(position, 200)


class ParametricTests(TestCase):
    def test_internal_dimensions(self):
        solver = ParametricSolver(19)
        result = solver.recompute_cabinet(
            {"width": 1000, "height": 720, "depth": 350, "thickness": 19, "back_thickness": 3}
        )
        self.assertAlmostEqual(result["internal_width"], 962)
        self.assertAlmostEqual(result["internal_height"], 682)
        self.assertAlmostEqual(result["internal_depth"], 347)
        self.assertEqual(result["carcase"]["sides"]["qty"], 2)


class CabinetServiceTests(TestCase):
    def setUp(self):
        self.material = Material.objects.create(
            name="Agglo test", thickness=19, price_per_m2=40, is_default=True
        )
        self.back = Material.objects.create(name="Fond test", thickness=3, price_per_m2=10)
        self.cabinet = create_cabinet(
            name="Test",
            width=1000,
            height=720,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        self.service = CabinetDesignService(self.cabinet)
        self.root = self.cabinet.root_volume

    def test_creation_builds_root_panels_cutlist_and_quote(self):
        self.assertIsNotNone(self.root)
        self.assertAlmostEqual(self.root.width, 962)
        self.assertAlmostEqual(self.root.height, 682)
        self.assertAlmostEqual(self.root.depth, 347)
        self.assertTrue(self.cabinet.panels.exists())
        self.assertTrue(self.cabinet.external_zones.filter(zone_type="plinth").exists())
        self.assertTrue(self.cabinet.panels.filter(category="plinthe").exists())
        self.assertTrue(CutList.objects.filter(cabinet=self.cabinet).exists())
        quote = Quote.objects.get(cabinet=self.cabinet)
        self.assertGreater(quote.total_ttc, 0)
        self.assertEqual(quote.lines.filter(is_material=True).count(), self.cabinet.panels.count())

    def test_scene_tree_hides_volumes_and_dims_only_on_panels(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.filter(parent=self.root, slot="a").first()
        self.service.add_shelf(left.pk, 180, "absolute")
        self.cabinet.has_doors = True
        self.cabinet.save(update_fields=["has_doors"])
        self.service.rebuild()

        tree = self.service.scene()["tree"]

        def walk(node):
            yield node
            for child in node.get("children", []):
                yield from walk(child)

        nodes = list(walk(tree))
        self.assertFalse([node for node in nodes if node["kind"] == "volume"])

        for label in ("Côté gauche", "Côté droit"):
            side = next(node for node in nodes if node["label"] == label)
            self.assertTrue(side["dimensions"], label)
        shelf = next(node for node in nodes if node["kind"] == "shelf")
        self.assertTrue(shelf["dimensions"])
        separation = next(node for node in nodes if node["label"] == "Séparation")
        self.assertTrue(separation["dimensions"])
        facade = next(node for node in nodes if node["kind"] == "door")
        self.assertTrue(facade["dimensions"])
        plinth = next(node for node in nodes if node["kind"] == "plinth")
        self.assertTrue(plinth["dimensions"])

    def test_split_creates_children_divider_and_panels(self):
        result = self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        self.assertEqual(result["scene"]["stats"]["divider_count"], 1)
        children = self.cabinet.internal_volumes.filter(parent=self.root).order_by("slot")
        self.assertEqual(children.count(), 2)
        self.assertAlmostEqual(sum(child.width for child in children) + 19, self.root.width, places=1)
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_v").count(), 1
        )
        self.assertEqual(
            self.cabinet.panels.filter(category="separation").count(), 1
        )

    def test_shelf_splits_bay_into_two_bays(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.filter(parent=self.root, slot="a").first()
        self.service.add_shelf(left.pk, 180, "absolute")
        left.refresh_from_db()
        self.assertEqual(left.split_direction, "horizontal")
        self.assertTrue(left.split_shelf)

        children = list(
            self.cabinet.internal_volumes.filter(parent=left).order_by("slot")
        )
        self.assertEqual(len(children), 2)
        self.assertAlmostEqual(children[0].height, 180, places=1)
        self.assertAlmostEqual(children[1].height, left.height - 180 - 19, places=1)

        # Redimensionnement paramétrique : la division suit la baie.
        self.service.update_cabinet({"width": 1400, "height": 720, "depth": 350})
        left.refresh_from_db()
        divider = left.components.get(component_type="divider_h")
        self.assertTrue(divider.volume.split_shelf)
        self.assertEqual(
            self.cabinet.panels.filter(category="etagere").count(), 1
        )
        self.assertEqual(
            CutList.objects.get(cabinet=self.cabinet).items.count(),
            self.cabinet.panels.count(),
        )

    def test_ratio_split_follows_resize(self):
        self.service.split_volume(self.root.pk, "vertical", 0.4, "ratio")
        self.service.update_cabinet({"width": 1400})
        root = self.cabinet.root_volume
        root.refresh_from_db()
        self.assertAlmostEqual(root.split_ratio, 0.4, places=3)
        self.assertAlmostEqual(root.split_offset, root.width * 0.4, places=1)

    def test_split_with_existing_shelf_is_rejected(self):
        self.service.add_shelf(self.root.pk, 180, "absolute")
        with self.assertRaises(CabinetDesignError):
            self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")

    def test_compartment_grid_with_top_row(self):
        result = self.service.add_compartment_grid(
            volume_id=self.root.pk,
            columns=4,
            rows=2,
            top_row_height=200,
        )
        self.root.refresh_from_db()
        self.assertEqual(self.root.split_direction, "horizontal")
        self.assertAlmostEqual(
            self.root.split_offset, self.root.height - 200 - 19 / 2, places=1
        )

        top = self.root.children.get(slot="b")
        bottom = self.root.children.get(slot="a")
        self.assertTrue(top.is_leaf)
        self.assertAlmostEqual(top.width, self.root.width, places=1)
        self.assertAlmostEqual(top.height, 200, places=1)
        self.assertEqual(bottom.split_direction, "vertical")
        self.assertAlmostEqual(bottom.height, self.root.height - 200 - 19, places=1)

        leaves = list(
            self.cabinet.internal_volumes.filter(split_direction="").order_by("pos_x", "pos_y")
        )
        self.assertEqual(len(leaves), 9)
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_v").count(), 3
        )
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_h").count(), 5
        )
        self.assertEqual(result["scene"]["stats"]["leaf_count"], 9)
        self.assertEqual(result["scene"]["stats"]["divider_count"], 8)
        self.assertFalse(result["scene"]["warnings"])

        lower_leaves = [volume for volume in leaves if volume.pk != top.pk]
        column_positions = sorted({round(volume.pos_x, 1) for volume in lower_leaves})
        self.assertEqual(len(column_positions), 4)
        step = (self.root.width - 3 * 19) / 4
        for index, position in enumerate(column_positions):
            self.assertAlmostEqual(
                position, self.root.pos_x + index * (step + 19), delta=0.1
            )
        for volume in lower_leaves:
            self.assertAlmostEqual(volume.width, step, delta=0.1)
        lower_heights = {round(volume.height, 1) for volume in lower_leaves}
        self.assertEqual(len(lower_heights), 1)
        self.assertAlmostEqual(lower_heights.pop(), (bottom.height - 19) / 2, places=1)
        self.assertEqual(
            CutList.objects.get(cabinet=self.cabinet).items.count(),
            self.cabinet.panels.count(),
        )

    def test_compartment_grid_without_top_row_and_custom_widths(self):
        result = self.service.add_compartment_grid(
            volume_id=self.root.pk,
            columns=3,
            rows=2,
            column_widths=[50, 30, 20],
        )
        self.root.refresh_from_db()
        self.assertEqual(self.root.split_direction, "vertical")

        leaves = list(
            self.cabinet.internal_volumes.filter(split_direction="").order_by("pos_x", "pos_y")
        )
        self.assertEqual(len(leaves), 6)
        widths = sorted({round(volume.width, 1) for volume in leaves})
        available = self.root.width - 2 * 19
        expected = [available * 0.2, available * 0.3, available * 0.5]
        self.assertEqual(len(widths), 3)
        for actual, target in zip(widths, expected):
            self.assertAlmostEqual(actual, target, delta=0.1)
        heights = {round(volume.height, 1) for volume in leaves}
        self.assertEqual(len(heights), 1)
        self.assertAlmostEqual(heights.pop(), (self.root.height - 19) / 2, places=1)
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_v").count(), 2
        )
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_h").count(), 3
        )
        self.assertEqual(result["scene"]["stats"]["leaf_count"], 6)
        self.assertEqual(result["scene"]["stats"]["divider_count"], 5)
        self.assertFalse(result["scene"]["warnings"])

    def test_compartment_grid_rejects_volume_with_components(self):
        self.service.add_partition(
            volume_id=self.root.pk,
            lower_shelf_id=None,
            upper_shelf_id=None,
            position=0.5,
            mode="ratio",
        )
        with self.assertRaises(CabinetDesignError) as context:
            self.service.add_compartment_grid(
                volume_id=self.root.pk, columns=4, rows=2
            )
        self.assertIn("étagères ou des séparations", str(context.exception))
        self.root.refresh_from_db()
        self.assertEqual(self.root.split_direction, "")

    def test_compartment_grid_rejects_invalid_settings(self):
        with self.assertRaises(CabinetDesignError):
            self.service.add_compartment_grid(
                volume_id=self.root.pk, columns=1, rows=2
            )
        with self.assertRaises(CabinetDesignError):
            self.service.add_compartment_grid(
                volume_id=self.root.pk, columns=9, rows=2
            )
        with self.assertRaises(CabinetDesignError):
            self.service.add_compartment_grid(
                volume_id=self.root.pk, columns=4, rows=0
            )
        with self.assertRaises(CabinetDesignError):
            self.service.add_compartment_grid(
                volume_id=self.root.pk, columns=4, rows=9
            )
        with self.assertRaises(CabinetDesignError):
            self.service.add_compartment_grid(
                volume_id=self.root.pk,
                columns=3,
                rows=2,
                column_widths=[50, 50],
            )
        with self.assertRaises(CabinetDesignError):
            self.service.add_compartment_grid(
                volume_id=self.root.pk,
                columns=3,
                rows=2,
                column_widths=[50, 0, 50],
            )
        with self.assertRaises(CabinetDesignError):
            self.service.add_compartment_grid(
                volume_id=self.root.pk,
                columns=4,
                rows=2,
                top_row_height=self.root.height,
            )
        with self.assertRaises(CabinetDesignError):
            self.service.add_compartment_grid(
                volume_id=self.root.pk,
                columns=8,
                rows=2,
                column_widths=[1, 1, 1, 1, 1, 1, 1, 0.001],
            )
        self.root.refresh_from_db()
        self.assertEqual(self.root.split_direction, "")
        self.assertFalse(self.root.children.exists())

    def test_compartment_grid_rolls_back_on_error(self):
        from unittest.mock import patch

        original = self.service._split_once
        calls = {"count": 0}

        def failing_split(volume, direction, offset):
            calls["count"] += 1
            result = original(volume, direction, offset)
            if calls["count"] == 2:
                raise CabinetDesignError("Erreur simulée")
            return result

        with patch.object(self.service, "_split_once", side_effect=failing_split):
            with self.assertRaises(CabinetDesignError):
                self.service.add_compartment_grid(
                    volume_id=self.root.pk, columns=2, rows=2
                )
        self.root.refresh_from_db()
        self.assertEqual(self.root.split_direction, "")
        self.assertFalse(self.root.children.exists())
        self.assertFalse(
            self.cabinet.components.filter(
                component_type__in=("divider_v", "divider_h")
            ).exists()
        )

    def test_duplicate_shelf_is_rejected(self):
        self.service.add_shelf(self.root.pk, 180, "absolute")
        with self.assertRaises(CabinetDesignError):
            self.service.add_shelf(self.root.pk, 185, "absolute")

    def test_shelf_in_small_niche_follows_the_minimum_gap(self):
        # Une niche de 30 cm : 7 % (2,1 cm du bas) est refusé avec un message en cm, 20 % passe.
        self.service.add_shelf(self.root.pk, 300, "absolute")
        lower = self.cabinet.internal_volumes.filter(parent=self.root, slot="a").first()
        self.assertAlmostEqual(lower.height, 300)
        with self.assertRaisesMessage(CabinetDesignError, "doit rester à 5,0 cm au moins"):
            self.service.add_shelf(lower.pk, 0.07, "ratio")
        self.service.add_shelf(lower.pk, 0.2, "ratio")
        lower.refresh_from_db()
        self.assertTrue(lower.split_shelf)

    def test_shelf_in_too_low_niche_says_so(self):
        self.service.add_shelf(self.root.pk, 100, "absolute")
        lower = self.cabinet.internal_volumes.filter(parent=self.root, slot="a").first()
        with self.assertRaisesMessage(CabinetDesignError, "Niche trop basse pour une étagère"):
            self.service.add_shelf(lower.pk, 0.5, "ratio")

    def test_shelf_series_between_bottom_and_top(self):
        result = self.service.add_shelf_series(volume_id=self.root.pk, count=5)
        self.root.refresh_from_db()
        # 5 étagères (divisions) → 6 baies de hauteur égale.
        leaves = list(
            self.cabinet.internal_volumes.filter(split_direction="").order_by("pos_y")
        )
        self.assertEqual(len(leaves), 6)
        expected_height = (self.root.height - 5 * 19) / 6
        for leaf in leaves:
            self.assertAlmostEqual(leaf.height, expected_height, places=1)
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_h").count(), 5
        )
        self.assertTrue(
            all(
                volume.split_shelf
                for volume in self.cabinet.internal_volumes.filter(
                    split_direction="horizontal"
                )
            )
        )
        self.assertEqual(result["scene"]["stats"]["shelf_count"], 5)
        self.assertEqual(self.cabinet.panels.filter(category="etagere").count(), 5)
        self.assertEqual(
            CutList.objects.get(cabinet=self.cabinet).items.count(),
            self.cabinet.panels.count(),
        )

    def test_shelf_series_rejects_insufficient_space(self):
        with self.assertRaises(CabinetDesignError):
            self.service.add_shelf_series(volume_id=self.root.pk, count=20)
        with self.assertRaises(CabinetDesignError):
            self.service.add_shelf_series(volume_id=self.root.pk, count=0)
        self.root.refresh_from_db()
        self.assertEqual(self.root.split_direction, "")

    def test_side_series_creates_even_compartments(self):
        result = self.service.add_side_series(volume_id=self.root.pk, count=2)
        leaves = list(
            self.cabinet.internal_volumes.filter(split_direction="").order_by("pos_x")
        )
        self.assertEqual(len(leaves), 3)
        # Chaque côté = deux panneaux collés, donc 2 × 2 × 19 mm de séparation.
        expected_width = (self.root.width - 4 * 19) / 3
        for leaf in leaves:
            self.assertAlmostEqual(leaf.width, expected_width, places=1)
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_v").count(), 4
        )
        self.assertEqual(
            self.cabinet.internal_volumes.filter(
                split_direction="vertical", split_side=True
            ).count(),
            2,
        )
        side_panels = self.cabinet.panels.filter(name="Côté")
        self.assertEqual(side_panels.count(), 4)
        for panel in side_panels:
            self.assertAlmostEqual(panel.length, self.cabinet.height, places=1)
            self.assertAlmostEqual(panel.width, self.cabinet.depth, places=1)
        self.assertFalse(result["scene"]["warnings"])

    def test_side_series_rejects_invalid_count(self):
        with self.assertRaises(CabinetDesignError):
            self.service.add_side_series(volume_id=self.root.pk, count=0)
        with self.assertRaises(CabinetDesignError):
            self.service.add_side_series(volume_id=self.root.pk, count=9)
        self.root.refresh_from_db()
        self.assertEqual(self.root.split_direction, "")

    def test_move_shelf_series_between_niches(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        self.service.add_shelf_series(volume_id=left.pk, count=3)
        result = self.service.move_element(
            source_volume_id=left.pk, target_volume_id=right.pk, copy=False
        )
        left.refresh_from_db()
        right.refresh_from_db()
        self.assertEqual(left.split_direction, "")
        self.assertFalse(right.is_leaf)
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_h").count(), 3
        )
        self.assertEqual(
            self.cabinet.internal_volumes.filter(
                split_direction="horizontal", split_shelf=True
            ).count(),
            3,
        )
        self.assertFalse(result["scene"]["warnings"])

    def test_copy_shelf_series_between_niches(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        self.service.add_shelf_series(volume_id=left.pk, count=3)
        self.service.move_element(
            source_volume_id=left.pk, target_volume_id=right.pk, copy=True
        )
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_h").count(), 6
        )

    def test_move_single_shelf_between_niches(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        self.service.add_shelf_series(volume_id=left.pk, count=3)
        shelf = self.cabinet.components.filter(component_type="divider_h").order_by(
            "position_from_bottom"
        )[1]
        shelf.refresh_from_db()
        source_position = (
            shelf.volume.pos_y + shelf.volume.split_offset - left.pos_y
        )
        self.service.move_element(
            source_volume_id=left.pk,
            target_volume_id=right.pk,
            source_component_id=shelf.pk,
            copy=False,
        )
        right.refresh_from_db()
        self.assertFalse(right.is_leaf)
        self.assertAlmostEqual(right.split_offset, source_position, places=1)
        # 2 étagères restent dans la niche source, 1 arrive dans la destination.
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_h").count(), 3
        )
        self.assertEqual(
            self.cabinet.internal_volumes.filter(
                split_direction="horizontal", split_shelf=True
            ).count(),
            3,
        )

    def _shelf_positions(self, root):
        positions = []
        for component in self.cabinet.components.filter(component_type="divider_h"):
            current = component.volume
            inside = False
            while current is not None:
                if current.pk == root.pk:
                    inside = True
                    break
                current = current.parent
            if inside:
                positions.append(
                    round(
                        component.volume.pos_y
                        + component.volume.split_offset
                        - root.pos_y,
                        1,
                    )
                )
        return sorted(positions)

    def test_copy_shelf_series_preserves_positions(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        self.service.add_shelf_series(volume_id=left.pk, count=3)
        # Décale la première étagère pour obtenir un espacement irrégulier.
        self.service.update_split(left.pk, 250, "absolute")
        left.refresh_from_db()
        source_positions = self._shelf_positions(left)
        self.service.move_element(
            source_volume_id=left.pk, target_volume_id=right.pk, copy=True
        )
        right.refresh_from_db()
        self.assertEqual(self._shelf_positions(right), source_positions)

    def _uneven_shelf_niches(self):
        """Prépare une niche source de 413 mm et une cible de 682 mm."""
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        self.service.split_volume(left.pk, "horizontal", 250, "absolute")
        left_top = self.cabinet.internal_volumes.get(parent=left, slot="b")
        self.service.add_shelf(left_top.pk, 200, "absolute")
        return left_top, right

    def test_copy_shelf_preserves_absolute_level_between_different_niches(self):
        source, target = self._uneven_shelf_niches()
        source_positions = self._shelf_positions(source)
        self.service.move_element(
            source_volume_id=source.pk,
            target_volume_id=target.pk,
            copy=True,
        )
        target.refresh_from_db()
        # La niche cible démarre plus bas : l'étagère conserve son niveau
        # absolu dans le caisson, pas sa hauteur relative à la niche.
        expected = [
            position + source.pos_y - target.pos_y for position in source_positions
        ]
        self.assertEqual(self._shelf_positions(target), expected)

    def test_move_shelf_preserves_absolute_level_between_different_niches(self):
        source, target = self._uneven_shelf_niches()
        source_positions = self._shelf_positions(source)
        self.service.move_element(
            source_volume_id=source.pk,
            target_volume_id=target.pk,
            copy=False,
        )
        target.refresh_from_db()
        source.refresh_from_db()
        expected = [
            position + source.pos_y - target.pos_y for position in source_positions
        ]
        self.assertEqual(self._shelf_positions(target), expected)
        self.assertTrue(source.is_leaf)

    def test_copy_shelf_below_target_is_placed_at_bottom(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        self.service.split_volume(left.pk, "horizontal", 250, "absolute")
        left_top = self.cabinet.internal_volumes.get(parent=left, slot="b")
        self.service.add_shelf(right.pk, 200, "absolute")
        result = self.service.move_element(
            source_volume_id=right.pk,
            target_volume_id=left_top.pk,
            copy=True,
        )
        left_top.refresh_from_db()
        # Le niveau d'origine est sous la niche cible : on remonte au plus près,
        # c'est-à-dire au bas de la niche.
        self.assertEqual(self._shelf_positions(left_top), [59.5])
        self.assertIn("hauteur minimale", result["message"])

    def test_move_shelf_too_high_is_placed_at_max_height(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        self.service.split_volume(left.pk, "horizontal", 250, "absolute")
        left_bottom = self.cabinet.internal_volumes.get(parent=left, slot="a")
        self.service.add_shelf(right.pk, 400, "absolute")
        result = self.service.move_element(
            source_volume_id=right.pk,
            target_volume_id=left_bottom.pk,
            copy=False,
        )
        left_bottom.refresh_from_db()
        self.assertFalse(left_bottom.is_leaf)
        self.assertEqual(self._shelf_positions(left_bottom), [181.0])
        self.assertIn("placée à 18.1 cm", result["message"])
        # L'étagère a bien quitté la niche source.
        self.assertTrue(right.is_leaf)

    def test_copy_shelf_too_high_is_placed_at_max_height(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        self.service.split_volume(left.pk, "horizontal", 250, "absolute")
        left_bottom = self.cabinet.internal_volumes.get(parent=left, slot="a")
        self.service.add_shelf(right.pk, 400, "absolute")
        source_positions = self._shelf_positions(right)
        result = self.service.move_element(
            source_volume_id=right.pk,
            target_volume_id=left_bottom.pk,
            copy=True,
        )
        left_bottom.refresh_from_db()
        right.refresh_from_db()
        self.assertEqual(self._shelf_positions(left_bottom), [181.0])
        self.assertEqual(self._shelf_positions(right), source_positions)
        self.assertIn("placée à 18.1 cm", result["message"])

    def test_move_shelf_series_too_high_is_scaled_to_fit(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        self.service.split_volume(left.pk, "horizontal", 250, "absolute")
        left_top = self.cabinet.internal_volumes.get(parent=left, slot="b")
        self.service.add_shelf_series(volume_id=right.pk, count=3)
        result = self.service.move_element(
            source_volume_id=right.pk,
            target_volume_id=left_top.pk,
            copy=False,
        )
        left_top.refresh_from_db()
        positions = self._shelf_positions(left_top)
        self.assertEqual(len(positions), 3)
        self.assertLessEqual(max(positions), 363.0)
        self.assertGreaterEqual(min(positions), 59.5)
        # Les espacements d'origine restent proportionnels.
        self.assertAlmostEqual(positions[1] - positions[0], positions[2] - positions[1], places=0)
        self.assertIn("proportionnellement", result["message"])

    def test_move_shelf_series_too_high_is_distributed_when_gaps_too_tight(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        self.service.split_volume(left.pk, "horizontal", 328.5, "absolute")
        left_bottom = self.cabinet.internal_volumes.get(parent=left, slot="a")
        self.service.add_shelf_series(volume_id=right.pk, count=3)
        # Rapproche la deuxième étagère de la première pour créer des
        # espacements irréguliers : la compression proportionnelle rendrait
        # le premier écart trop faible, la répartition uniforme le corrige.
        top_after_first = self.cabinet.internal_volumes.get(parent=right, slot="b")
        self.service.update_split(top_after_first.pk, 59.5, "absolute")
        result = self.service.move_element(
            source_volume_id=right.pk,
            target_volume_id=left_bottom.pk,
            copy=False,
        )
        left_bottom.refresh_from_db()
        self.assertEqual(
            self._shelf_positions(left_bottom),
            [59.5, 159.5, 259.5],
        )
        self.assertIn("uniformément", result["message"])

    def test_move_shelf_series_impossible_for_target_is_rejected(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        self.service.split_volume(left.pk, "horizontal", 250, "absolute")
        left_bottom = self.cabinet.internal_volumes.get(parent=left, slot="a")
        self.service.add_shelf_series(volume_id=right.pk, count=6)
        with self.assertRaisesMessage(CabinetDesignError, "trop basse"):
            self.service.move_element(
                source_volume_id=right.pk,
                target_volume_id=left_bottom.pk,
                copy=False,
            )
        # La transaction est annulée : les 6 étagères sources sont toujours là.
        self.assertEqual(len(self._shelf_positions(right)), 6)
        self.assertTrue(left_bottom.is_leaf)

    def test_remove_multiple_shelves_preserves_remaining(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        self.service.add_shelf_series(volume_id=left.pk, count=5)
        before = self._shelf_positions(left)
        shelves = sorted(
            self.cabinet.components.filter(component_type="divider_h"),
            key=lambda component: component.volume.pos_y
            + component.volume.split_offset,
        )
        removed = {shelves[1].pk, shelves[3].pk}
        removed_positions = {before[1], before[3]}
        self.service.remove_components(list(removed))
        left.refresh_from_db()
        self.assertEqual(len(self._shelf_positions(left)), 3)
        self.assertEqual(
            self._shelf_positions(left),
            [position for position in before if position not in removed_positions],
        )

    def test_move_multiple_selected_shelves(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        self.service.add_shelf_series(volume_id=left.pk, count=5)
        before = self._shelf_positions(left)
        shelves = sorted(
            self.cabinet.components.filter(component_type="divider_h"),
            key=lambda component: component.volume.pos_y
            + component.volume.split_offset,
        )
        selected = [shelves[1], shelves[3]]
        selected_positions = [before[1], before[3]]
        remaining_positions = [
            position for position in before if position not in selected_positions
        ]
        self.service.move_element(
            source_volume_id=left.pk,
            target_volume_id=right.pk,
            source_component_ids=[shelf.pk for shelf in selected],
            copy=False,
        )
        left.refresh_from_db()
        right.refresh_from_db()
        self.assertEqual(self._shelf_positions(left), remaining_positions)
        self.assertEqual(self._shelf_positions(right), selected_positions)

    def test_move_element_rejects_source_without_shelves(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        with self.assertRaises(CabinetDesignError):
            self.service.move_element(
                source_volume_id=left.pk, target_volume_id=right.pk, copy=False
            )

    def test_update_carcass_panel_material_and_thickness(self):
        other = Material.objects.create(name="Bois clair", thickness=25, price_per_m2=60)
        result = self.service.update_carcass_panel("top", {"material_id": other.pk, "thickness": 25})
        panel = self.cabinet.carcass_panels.get(side="top")
        self.assertEqual(panel.material_id, other.pk)
        self.assertAlmostEqual(panel.thickness, 25, places=1)
        top_panel = self.cabinet.panels.filter(name="Dessus").first()
        self.assertEqual(top_panel.material_id, other.pk)
        self.assertAlmostEqual(top_panel.thickness, 25, places=1)
        self.assertFalse(result["scene"]["warnings"])
        self.assertEqual(len(result["scene"]["carcass_panels"]), 4)

    def test_scene_tree_includes_back_panel_with_dimensions(self):
        scene = self.service.scene([])

        def walk(node):
            yield node
            for child in node.get("children", []):
                yield from walk(child)

        nodes = list(walk(scene["tree"]))
        back = next(node for node in nodes if node["kind"] == "back")
        self.assertEqual(back["label"], "Fond")
        self.assertEqual(back["side"], "back")
        self.assertIn("0.3 cm", back["dimensions"])

        back_box = next(box for box in scene["boxes"] if box["kind"] == "back")
        self.assertAlmostEqual(back_box["w"], 962, places=1)
        self.assertAlmostEqual(back_box["h"], 682, places=1)
        self.assertAlmostEqual(back_box["d"], 3, places=1)

    def test_back_thickness_override_updates_cutlist_and_scene(self):
        result = self.service.update_cabinet({"back_thickness": 8})
        self.cabinet.refresh_from_db()
        self.assertAlmostEqual(self.cabinet.back_thickness_override, 8, places=1)
        self.assertAlmostEqual(self.cabinet.back_thickness, 8, places=1)

        back_panel = self.cabinet.panels.filter(name="Fond").first()
        self.assertAlmostEqual(back_panel.thickness, 8, places=1)

        scene = result["scene"]
        self.assertAlmostEqual(scene["cabinet"]["back_thickness"], 8, places=1)
        back_box = next(box for box in scene["boxes"] if box["kind"] == "back")
        self.assertAlmostEqual(back_box["d"], 8, places=1)

        def walk(node):
            yield node
            for child in node.get("children", []):
                yield from walk(child)

        back_node = next(
            node for node in walk(scene["tree"]) if node["kind"] == "back"
        )
        self.assertIn("0.8 cm", back_node["dimensions"])

    def test_removing_back_material_removes_back_panel(self):
        result = self.service.update_cabinet(
            {"material_back_id": None, "back_thickness": None}
        )
        self.cabinet.refresh_from_db()
        self.assertIsNone(self.cabinet.material_back_id)
        self.assertIsNone(self.cabinet.back_thickness_override)
        self.assertEqual(self.cabinet.back_thickness, 0)
        self.assertFalse(self.cabinet.panels.filter(name="Fond").exists())
        scene = result["scene"]
        self.assertFalse([box for box in scene["boxes"] if box["kind"] == "back"])

        def walk(node):
            yield node
            for child in node.get("children", []):
                yield from walk(child)

        self.assertFalse(
            [node for node in walk(scene["tree"]) if node["kind"] == "back"]
        )

    def test_a_separation_divides_the_niche_only(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        # Séparer divise la niche : le dessous et le dessus restent d'une pièce, la séparation va de l'un à l'autre.
        self.assertEqual(self.cabinet.panels.filter(name="Dessous").count(), 1)
        self.assertEqual(self.cabinet.panels.filter(name="Dessus").count(), 1)
        separation = self.cabinet.panels.get(name="Séparation")
        self.assertAlmostEqual(separation.length, self.root.height)
        scene = self.service.scene([])
        self.assertEqual(len([b for b in scene["boxes"] if b["side"] == "bottom"]), 1)
        self.assertEqual(len([b for b in scene["boxes"] if b["side"] == "top"]), 1)

    def test_a_double_side_still_runs_through_the_bottom_and_the_top(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio", side=True)
        # Côté (côté double, jonction de deux modules) passe du sol au dessus : il coupe le dessous et le dessus.
        self.assertEqual(self.cabinet.panels.filter(name="Dessous").count(), 2)
        self.assertEqual(self.cabinet.panels.filter(name="Dessus").count(), 2)

    def test_split_side_creates_full_side_panels(self):
        result = self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio", side=True)
        self.root.refresh_from_db()
        self.assertTrue(self.root.split_side)
        self.assertEqual(self.root.split_direction, "vertical")
        side_panels = self.cabinet.panels.filter(name="Côté")
        self.assertEqual(side_panels.count(), 2)
        for side_panel in side_panels:
            self.assertAlmostEqual(side_panel.length, self.cabinet.height, places=1)
            self.assertAlmostEqual(side_panel.width, self.cabinet.depth, places=1)
        self.assertFalse(result["scene"]["warnings"])
        side_boxes = [
            b for b in result["scene"]["boxes"]
            if b["label"] == "Côté" and b["component_id"]
        ]
        self.assertEqual(len(side_boxes), 2)
        for box in side_boxes:
            self.assertAlmostEqual(box["h"], self.cabinet.height, places=1)
        # Les deux panneaux sont collés : leurs plages se touchent sans se
        # chevaucher.
        ordered = sorted(side_boxes, key=lambda box: box["x"])
        self.assertAlmostEqual(
            ordered[0]["x"] + ordered[0]["w"], ordered[1]["x"], places=1
        )

    def test_update_carcass_panel_position(self):
        result = self.service.update_carcass_panel("bottom", {"position": 50})
        panel = self.cabinet.carcass_panels.get(side="bottom")
        self.assertAlmostEqual(panel.position, 50, places=1)
        root = self.cabinet.root_volume
        self.assertAlmostEqual(root.pos_y, 19 + 50, places=1)
        self.assertAlmostEqual(root.height, self.cabinet.height - 19 - 19 - 50, places=1)
        self.assertFalse(result["scene"]["warnings"])

    def test_update_component_material_and_thickness(self):
        self.service.add_shelf(self.root.pk, 180, "absolute")
        divider = self.cabinet.components.get(component_type="divider_h")
        other = Material.objects.create(name="Agglo épais", thickness=25, price_per_m2=50)
        result = self.service.update_component(
            divider.pk, {"material_id": other.pk, "thickness": 25}
        )
        divider.refresh_from_db()
        self.assertEqual(divider.material_id, other.pk)
        self.assertAlmostEqual(divider.height, 25, places=1)
        children = list(
            self.cabinet.internal_volumes.filter(parent=self.root).order_by("slot")
        )
        self.assertAlmostEqual(
            children[0].height + children[1].height + 25, self.root.height, places=1
        )
        panel = self.cabinet.panels.filter(category="etagere").first()
        self.assertEqual(panel.material_id, other.pk)
        self.assertFalse(result["scene"]["warnings"])

    def test_update_split_moves_divider_and_preserves_geometry(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        self.service.update_split(self.root.pk, 0.65, "ratio")
        root = self.cabinet.root_volume
        root.refresh_from_db()
        self.assertAlmostEqual(root.split_ratio, 0.65, places=3)
        self.assertAlmostEqual(root.split_offset, root.width * 0.65, places=1)
        children = list(self.cabinet.internal_volumes.filter(parent=root).order_by("slot"))
        self.assertAlmostEqual(children[0].width + children[1].width + 19, root.width, places=1)

        absolute = 300.0
        self.service.update_split(self.root.pk, absolute, "absolute")
        root.refresh_from_db()
        self.assertAlmostEqual(root.split_offset, absolute, places=1)

    def test_remove_split_removes_children_and_divider(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        self.service.remove_split(self.root.pk)
        self.assertEqual(self.cabinet.internal_volumes.filter(parent=self.root).count(), 0)
        self.assertEqual(self.cabinet.components.filter(component_type="divider_v").count(), 0)
        self.assertTrue(self.cabinet.root_volume.is_leaf)

    def test_door_clearance_warning(self):
        self.service.add_shelf(self.root.pk, 180, "absolute")
        self.service.update_cabinet({"has_doors": True, "door_gap": 2})
        scene = self.service.scene()
        self.assertTrue(any("façade" in warning.lower() for warning in scene["warnings"]))

    def test_too_small_resize_is_rolled_back(self):
        original_width = self.cabinet.width
        with self.assertRaises((CabinetDesignError, GeometryError, ValueError)):
            self.service.update_cabinet({"height": 100})
        self.cabinet.refresh_from_db()
        self.assertEqual(self.cabinet.width, original_width)

    def test_plinth_is_external_and_generates_panels(self):
        self.service.set_plinth(100, 20)
        zone = self.cabinet.external_zones.get(zone_type="plinth")
        self.assertLess(zone.pos_y, 0)
        self.assertTrue(self.cabinet.panels.filter(category="plinthe").exists())
        self.assertGreaterEqual(self.cabinet.panels.filter(category="plinthe").count(), 2)

    def test_scene_contains_tree_and_boxes(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.filter(parent=self.root, slot="a").first()
        self.service.add_shelf(left.pk, 180, "absolute")
        scene = self.service.scene()
        self.assertEqual(scene["tree"]["kind"], "cabinet")
        self.assertTrue(scene["tree"]["children"])
        kinds = {box["kind"] for box in scene["boxes"]}
        self.assertIn("carcass", kinds)
        self.assertIn("volume", kinds)
        self.assertIn("divider", kinds)
        labels = {box["label"] for box in scene["boxes"]}
        self.assertIn("Étagère", labels)
        self.assertGreater(scene["cutlist"]["total_cost"], 0)


class HistoryTests(TestCase):
    def setUp(self):
        self.material = Material.objects.create(
            name="Agglo historique", thickness=19, price_per_m2=40, is_default=True
        )
        self.back = Material.objects.create(
            name="Fond historique", thickness=3, price_per_m2=10
        )
        self.cabinet = create_cabinet(
            name="Historique",
            width=1000,
            height=720,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        self.service = CabinetDesignService(self.cabinet)
        self.root = self.cabinet.root_volume

    def test_undo_and_redo_restore_shelves(self):
        before = capture_cabinet(self.cabinet)
        self.service.add_shelf_series(volume_id=self.root.pk, count=3)
        record_history(self.cabinet, before, "3 étagères ajoutées.")
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_h").count(), 3
        )

        undone = undo_cabinet(self.cabinet)
        self.root.refresh_from_db()
        self.assertEqual(self.root.split_direction, "")
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_h").count(), 0
        )
        self.assertTrue(undone["scene"]["history"]["can_redo"])
        self.assertFalse(undone["scene"]["history"]["can_undo"])

        redo_cabinet(self.cabinet)
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_h").count(), 3
        )

    def test_undo_restores_positions_after_move(self):
        self.service.split_volume(self.root.pk, "vertical", 0.5, "ratio")
        left = self.cabinet.internal_volumes.get(parent=self.root, slot="a")
        right = self.cabinet.internal_volumes.get(parent=self.root, slot="b")
        self.service.add_shelf_series(volume_id=left.pk, count=3)

        def positions(volume):
            result = []
            for component in self.cabinet.components.filter(
                component_type="divider_h"
            ):
                current = component.volume
                inside = False
                while current is not None:
                    if current.pk == volume.pk:
                        inside = True
                        break
                    current = current.parent
                if inside:
                    result.append(
                        round(
                            component.volume.pos_y
                            + component.volume.split_offset
                            - volume.pos_y,
                            1,
                        )
                    )
            return sorted(result)

        before_positions = positions(left)
        before = capture_cabinet(self.cabinet)
        self.service.move_element(
            source_volume_id=left.pk, target_volume_id=right.pk, copy=False
        )
        record_history(self.cabinet, before, "Étagères déplacées.")
        self.assertEqual(positions(left), [])

        undo_cabinet(self.cabinet)
        left = self.cabinet.internal_volumes.get(pk=left.pk)
        right = self.cabinet.internal_volumes.get(pk=right.pk)
        self.assertEqual(positions(left), before_positions)
        self.assertTrue(right.is_leaf)

    def test_api_undo_and_redo(self):
        response = self.client.post(
            reverse("poly:api_shelf_series", args=[self.cabinet.pk]),
            data='{"volume_id":%d,"count":3}' % self.root.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["scene"]["history"]["can_undo"])
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_h").count(), 3
        )

        undo = self.client.post(reverse("poly:api_undo", args=[self.cabinet.pk]))
        self.assertEqual(undo.status_code, 200)
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_h").count(), 0
        )
        self.assertTrue(undo.json()["scene"]["history"]["can_redo"])

        redo = self.client.post(reverse("poly:api_redo", args=[self.cabinet.pk]))
        self.assertEqual(redo.status_code, 200)
        self.assertEqual(
            self.cabinet.components.filter(component_type="divider_h").count(), 3
        )
        self.assertTrue(redo.json()["scene"]["history"]["can_undo"])

    def test_history_list_and_rollback(self):
        response = self.client.post(
            reverse("poly:api_compartment_grid", args=[self.cabinet.pk]),
            data='{"volume_id":%d,"columns":3,"rows":1}' % self.root.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        entries = self.client.get(
            reverse("poly:api_history", args=[self.cabinet.pk])
        ).json()["entries"]
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["action"], "api_compartment_grid")
        self.assertEqual(entries[0]["params"]["columns"], 3)

        rollback = self.client.post(
            reverse("poly:api_history_rollback",
                args=[self.cabinet.pk, entries[0]["id"]],
            )
        )
        self.assertEqual(rollback.status_code, 200)
        self.root.refresh_from_db()
        self.assertEqual(self.root.split_direction, "")
        self.assertEqual(self.cabinet.internal_volumes.count(), 1)

        redo = self.client.post(reverse("poly:api_redo", args=[self.cabinet.pk]))
        self.assertEqual(redo.status_code, 200)
        self.assertEqual(
            self.cabinet.internal_volumes.filter(
                split_direction="vertical"
            ).count(),
            2,
        )

    def test_new_action_clears_redo_stack(self):
        before = capture_cabinet(self.cabinet)
        self.service.add_shelf_series(volume_id=self.root.pk, count=3)
        record_history(self.cabinet, before, "3 étagères ajoutées.")
        undo_cabinet(self.cabinet)
        self.assertTrue(
            self.cabinet.history_entries.filter(direction="redo").exists()
        )

        before = capture_cabinet(self.cabinet)
        self.service.add_shelf_series(volume_id=self.root.pk, count=2)
        record_history(self.cabinet, before, "2 étagères ajoutées.")
        self.assertFalse(
            self.cabinet.history_entries.filter(direction="redo").exists()
        )


class ViewsTests(TestCase):
    def setUp(self):
        self.material = Material.objects.create(name="Agglo UI", thickness=19, price_per_m2=42, is_default=True)
        self.back = Material.objects.create(name="Fond UI", thickness=3, price_per_m2=9)

    def test_dashboard_and_creation(self):
        response = self.client.get(reverse("poly:home"))
        self.assertEqual(response.status_code, 200)
        response = self.client.post(
            reverse("poly:home"),
            {
                "name": "Caisson UI",
                "width": 900,
                "height": 700,
                "depth": 350,
                "material_id": self.material.pk,
                "material_back_id": self.back.pk,
                "bottom_setback": 0,
                "plinth_height": 100,
            },
        )
        self.assertEqual(response.status_code, 302)
        cabinet = Cabinet.objects.get(name="Caisson UI")
        self.assertTrue(cabinet.root_volume)

        editor = self.client.get(reverse("poly:editor", args=[cabinet.pk]))
        self.assertEqual(editor.status_code, 200)
        self.assertContains(editor, "Navigateur")
        self.assertContains(editor, "initial-scene")
        self.assertContains(editor, 'id="display-popover"')
        self.assertContains(editor, 'id="viewport-hidden-note"')
        self.assertContains(editor, 'id="vis-carcass"')
        self.assertContains(editor, "Vue de travail")
        # The « Séparation » tool is no longer offered (Séparer divides a niche); its panel stays, hidden.
        self.assertNotContains(editor, 'data-tool="partition"')
        self.assertNotContains(editor, 'data-toolbar-tool="partition"')
        self.assertContains(editor, 'id="btn-partition"')
        self.assertContains(editor, 'data-partition-edge="bottom"')
        self.assertContains(editor, 'data-partition-edge="top"')
        self.assertContains(editor, "Séparation")

    def test_api_workflow(self):
        create = self.client.post(
            reverse("poly:api_create_cabinet"),
            data='{"name":"API","width":1000,"height":720,"depth":350,"material_id":%d}'
            % self.material.pk,
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 201)
        scene = create.json()["scene"]
        cabinet_id = scene["cabinet"]["id"]
        self.assertTrue(scene["cabinet"]["has_plinth"])
        root_id = next(v["id"] for v in scene["volumes"] if v["is_root"])

        split = self.client.post(
            reverse("poly:api_split", args=[cabinet_id]),
            data='{"volume_id":%d,"direction":"vertical","position":0.5,"mode":"ratio"}' % root_id,
            content_type="application/json",
        )
        self.assertEqual(split.status_code, 200)
        split_scene = split.json()["scene"]
        left = next(v for v in split_scene["volumes"] if v["parent_id"] == root_id and v["slot"] == "a")

        shelf = self.client.post(
            reverse("poly:api_shelf", args=[cabinet_id]),
            data='{"volume_id":%d,"position":180,"mode":"absolute"}' % left["id"],
            content_type="application/json",
        )
        self.assertEqual(shelf.status_code, 200)
        self.assertEqual(shelf.json()["scene"]["stats"]["shelf_count"], 1)

        resize = self.client.patch(
            reverse("poly:api_update_cabinet", args=[cabinet_id]),
            data='{"width":1300}',
            content_type="application/json",
        )
        self.assertEqual(resize.status_code, 200)
        self.assertEqual(resize.json()["scene"]["cabinet"]["width"], 1300)

        cutlist = self.client.get(reverse("poly:api_cutlist", args=[cabinet_id]))
        self.assertEqual(cutlist.status_code, 200)
        self.assertGreater(cutlist.json()["cutlist"]["total_cost"], 0)

        csv_response = self.client.get(reverse("poly:cutlist_csv", args=[cabinet_id]))
        self.assertEqual(csv_response.status_code, 200)
        self.assertIn("text/csv", csv_response["Content-Type"])

        quote = self.client.get(reverse("poly:quote_page", args=[cabinet_id]))
        self.assertEqual(quote.status_code, 200)
        self.assertContains(quote, "Total TTC")

        quote_update = self.client.patch(
            reverse("poly:api_update_quote", args=[cabinet_id]),
            data='{"client_name":"Dupont","margin_percent":25,"tax_rate":20,"status":"sent"}',
            content_type="application/json",
        )
        self.assertEqual(quote_update.status_code, 200)
        self.assertEqual(quote_update.json()["scene"]["quote"]["client_name"], "Dupont")

    def test_api_shelf_series(self):
        cabinet = create_cabinet(
            name="Série API",
            width=1000,
            height=720,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        root = cabinet.root_volume
        response = self.client.post(
            reverse("poly:api_shelf_series", args=[cabinet.pk]),
            data='{"volume_id":%d,"count":5}' % root.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["scene"]["stats"]["shelf_count"], 5)
        self.assertEqual(
            cabinet.components.filter(component_type="divider_h").count(), 5
        )

        bad = self.client.post(
            reverse("poly:api_shelf_series", args=[cabinet.pk]),
            data='{"volume_id":%d,"count":0}' % root.pk,
            content_type="application/json",
        )
        self.assertEqual(bad.status_code, 400)
        self.assertFalse(bad.json()["ok"])

    def test_api_side_series(self):
        cabinet = create_cabinet(
            name="Série côtés API",
            width=1000,
            height=720,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        root = cabinet.root_volume
        response = self.client.post(
            reverse("poly:api_side_series", args=[cabinet.pk]),
            data='{"volume_id":%d,"count":2}' % root.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(
            cabinet.components.filter(component_type="divider_v").count(), 4
        )
        self.assertEqual(cabinet.panels.filter(name="Côté").count(), 4)

        bad = self.client.post(
            reverse("poly:api_side_series", args=[cabinet.pk]),
            data='{"volume_id":%d,"count":0}' % root.pk,
            content_type="application/json",
        )
        self.assertEqual(bad.status_code, 400)
        self.assertFalse(bad.json()["ok"])

    def test_api_move_element(self):
        cabinet = create_cabinet(
            name="Déplacement API",
            width=1000,
            height=720,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        service = CabinetDesignService(cabinet)
        root = cabinet.root_volume
        service.split_volume(root.pk, "vertical", 0.5, "ratio")
        left = cabinet.internal_volumes.get(parent=root, slot="a")
        right = cabinet.internal_volumes.get(parent=root, slot="b")
        service.add_shelf_series(volume_id=left.pk, count=3)
        response = self.client.post(
            reverse("poly:api_move_element", args=[cabinet.pk]),
            data='{"source_volume_id":%d,"target_volume_id":%d,"copy":true}'
            % (left.pk, right.pk),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(
            cabinet.components.filter(component_type="divider_h").count(), 6
        )

        bad = self.client.post(
            reverse("poly:api_move_element", args=[cabinet.pk]),
            data='{"source_volume_id":%d,"target_volume_id":%d}' % (left.pk, left.pk),
            content_type="application/json",
        )
        self.assertEqual(bad.status_code, 400)
        self.assertFalse(bad.json()["ok"])

    def test_api_delete_components(self):
        cabinet = create_cabinet(
            name="Suppression multiple API",
            width=1000,
            height=720,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        service = CabinetDesignService(cabinet)
        root = cabinet.root_volume
        service.add_shelf_series(volume_id=root.pk, count=3)
        ids = list(
            cabinet.components.filter(component_type="divider_h").values_list(
                "pk", flat=True
            )
        )[:2]
        response = self.client.post(
            reverse("poly:api_delete_components", args=[cabinet.pk]),
            data='{"component_ids":[%s]}' % ",".join(str(pk) for pk in ids),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])
        self.assertEqual(
            cabinet.components.filter(component_type="divider_h").count(), 1
        )

    def test_api_update_component(self):
        cabinet = create_cabinet(
            name="Modif composant API",
            width=1000,
            height=720,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        service = CabinetDesignService(cabinet)
        root = cabinet.root_volume
        service.add_shelf(root.pk, 180, "absolute")
        divider = cabinet.components.get(component_type="divider_h")
        other = Material.objects.create(name="Matière B", thickness=25, price_per_m2=55)
        response = self.client.patch(
            reverse("poly:api_update_component", args=[cabinet.pk, divider.pk]),
            data='{"material_id":%d,"thickness":25}' % other.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])
        divider.refresh_from_db()
        self.assertEqual(divider.material_id, other.pk)
        self.assertAlmostEqual(divider.height, 25, places=1)

    def test_api_compartment_grid(self):
        cabinet = create_cabinet(
            name="Grille API",
            width=1000,
            height=720,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        root = cabinet.root_volume
        response = self.client.post(
            reverse("poly:api_compartment_grid", args=[cabinet.pk]),
            data=(
                '{"volume_id":%d,"columns":4,"rows":2,'
                '"column_widths":[33,32,16,19],"row_heights":[50,50],'
                '"top_row_height":200}'
            )
            % root.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["scene"]["stats"]["leaf_count"], 9)
        self.assertEqual(payload["scene"]["stats"]["divider_count"], 8)
        self.assertEqual(
            cabinet.internal_volumes.filter(split_direction="").count(), 9
        )

        bad = self.client.post(
            reverse("poly:api_compartment_grid", args=[cabinet.pk]),
            data='{"volume_id":%d,"columns":1,"rows":2}' % root.pk,
            content_type="application/json",
        )
        self.assertEqual(bad.status_code, 400)
        self.assertFalse(bad.json()["ok"])

    def test_api_validation_error_returns_json(self):
        cabinet = create_cabinet(
            name="Erreur",
            width=800,
            height=700,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        root = cabinet.root_volume
        response = self.client.post(
            reverse("poly:api_split", args=[cabinet.pk]),
            data='{"volume_id":%d,"direction":"vertical","position":10,"mode":"absolute"}' % root.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()["ok"])

    def test_invalid_back_material_returns_json_error(self):
        cabinet = create_cabinet(
            name="Fond invalide",
            width=800,
            height=700,
            depth=350,
            material=self.material,
        )
        response = self.client.patch(
            reverse("poly:api_update_cabinet", args=[cabinet.pk]),
            data='{"material_back_id":999999}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("fond", response.json()["error"].lower())

    def test_too_small_creation_is_rejected(self):
        response = self.client.post(
            reverse("poly:api_create_cabinet"),
            data='{"name":"Trop petit","width":50,"height":500,"depth":300,"material_id":%d}'
            % self.material.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Cabinet.objects.filter(name="Trop petit").exists())


class PdfExportTests(TestCase):
    def setUp(self):
        self.material = Material.objects.create(
            name="Agglo PDF", thickness=19, price_per_m2=40, is_default=True
        )
        self.back = Material.objects.create(name="Fond PDF", thickness=3, price_per_m2=10)
        self.cabinet = create_cabinet(
            name="Caisson PDF",
            width=1000,
            height=720,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        service = CabinetDesignService(self.cabinet)
        service.split_volume(self.cabinet.root_volume.pk, "vertical", 0.5, "ratio")
        child = self.cabinet.root_volume.children.first()
        service.split_volume(child.pk, "horizontal", 0.5, "ratio")

    def _assert_pdf(self, response, filename):
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn(filename, response["Content-Disposition"])
        content = b"".join(chunk for chunk in response)
        self.assertTrue(content.startswith(b"%PDF"))

    def test_croquis_pdf(self):
        response = self.client.get(reverse("poly:croquis_pdf", args=[self.cabinet.pk]))
        self._assert_pdf(response, f"croquis-{self.cabinet.pk}.pdf")
        self.assertGreater(len(response.content), 2000)

    def test_cutlist_pdf(self):
        response = self.client.get(reverse("poly:cutlist_pdf", args=[self.cabinet.pk]))
        self._assert_pdf(response, f"liste-debit-{self.cabinet.pk}.pdf")
        self.assertGreater(len(response.content), 3000)

    def test_cutlist_pdf_mentions_centimeters(self):
        """Les cotes du PDF de débit sont en cm, virgule décimale française."""
        from apps.furniture.pdf_export import _cm

        self.assertEqual(_cm(228), "22,8")
        self.assertEqual(_cm(1800, digits=0), "180")
        self.assertEqual(_cm(35), "3,5")

    def test_croquis_pdf_with_doors(self):
        CabinetDesignService(self.cabinet).update_cabinet({"has_doors": True})
        response = self.client.get(reverse("poly:croquis_pdf", args=[self.cabinet.pk]))
        self._assert_pdf(response, f"croquis-{self.cabinet.pk}.pdf")


class NestingTests(TestCase):
    def setUp(self):
        self.material = Material.objects.create(
            name="Agglo optim", thickness=19, price_per_m2=40, is_default=True,
            sheet_width=2100, sheet_length=1000,
        )
        self.back = Material.objects.create(
            name="Fond optim", thickness=3, price_per_m2=10,
            sheet_width=2800, sheet_length=2070,
        )
        self.cabinet = create_cabinet(
            name="Caisson optim",
            width=1000,
            height=720,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        self.service = CabinetDesignService(self.cabinet)

    def test_pieces_fit_within_sheet_with_kerf(self):
        from apps.furniture.engine.nesting import NestingPiece, pack_group

        pieces = [NestingPiece(f"P{i}", "P", 700, 500) for i in range(5)]
        sheets = pack_group(pieces, 2100, 1000, kerf=4)
        placed = sum(len(sheet) for sheet in sheets)
        self.assertEqual(placed, 5)
        for sheet in sheets:
            boxes = [(p.x, p.y, p.x + p.w, p.y + p.h) for p in sheet]
            for box in boxes:
                self.assertLessEqual(box[2], 2100 + 1e-6)
                self.assertLessEqual(box[3], 1000 + 1e-6)
            for i in range(len(boxes)):
                for j in range(i + 1, len(boxes)):
                    a, b = boxes[i], boxes[j]
                    overlap = (a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3])
                    self.assertFalse(overlap, "deux pièces se chevauchent")

    def test_rotation_is_used_when_needed(self):
        from apps.furniture.engine.nesting import NestingPiece, pack_group

        # une pièce 800×400 : sur une feuille 400×900 elle doit être tournée
        pieces = [NestingPiece("A", "A", 800, 400)]
        sheets = pack_group(pieces, 400, 900, kerf=4)
        self.assertEqual(len(sheets), 1)
        self.assertTrue(sheets[0][0].rotated)
        self.assertEqual(sheets[0][0].w, 400)
        self.assertEqual(sheets[0][0].h, 800)

    def test_oversized_piece_is_rejected(self):
        from apps.furniture.engine.nesting import NestingPiece, pack_group

        with self.assertRaises(AssertionError):
            pack_group([NestingPiece("XXL", "X", 3000, 500)], 2100, 1000, kerf=4)

    def test_build_nesting_groups_by_material_and_thickness(self):
        from apps.furniture.engine.nesting import build_nesting

        self.service.split_volume(self.cabinet.root_volume.pk, "vertical", 0.5, "ratio")
        data = build_nesting(self.cabinet)
        self.assertTrue(data["ok"])
        self.assertGreaterEqual(len(data["groups"]), 2)  # carcasse + fond
        for group in data["groups"]:
            self.assertGreater(group["sheet_count"], 0)
            self.assertEqual(
                group["piece_count"],
                sum(len(s["placements"]) for s in group["sheets"]),
            )
            self.assertGreater(group["utilization"], 0)
            self.assertLessEqual(group["utilization"], 1)
        self.assertEqual(data["total_sheets"], sum(g["sheet_count"] for g in data["groups"]))
        self.assertGreater(data["total_cost"], 0)

    def test_api_nesting_returns_layout(self):
        response = self.client.get(reverse("poly:api_nesting", args=[self.cabinet.pk]))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["ok"])
        self.assertIn("groups", data)
        self.assertIn("total_sheets", data)
        self.assertIn("total_cost", data)

    def test_nesting_pdf(self):
        response = self.client.get(reverse("poly:nesting_pdf", args=[self.cabinet.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))


class ProjectTests(TestCase):
    def setUp(self):
        self.material = Material.objects.create(
            name="Agglo projet", thickness=19, price_per_m2=40, is_default=True
        )
        self.back = Material.objects.create(name="Fond projet", thickness=3, price_per_m2=9)
        self.cabinet = create_cabinet(
            name="Colonne A", width=600, height=720, depth=350,
            material=self.material, material_back=self.back,
        )
        self.cabinet2 = create_cabinet(
            name="Colonne B", width=400, height=720, depth=350,
            material=self.material, material_back=self.back,
        )
        self.project = Project.objects.create(
            name="Cuisine test", client_name="Mme Test", gap=2,
            margin_percent=30, tax_rate=20,
        )
        ProjectItem.objects.create(project=self.project, cabinet=self.cabinet, slot=0)
        ProjectItem.objects.create(project=self.project, cabinet=self.cabinet2, slot=1)

    def test_layout_places_cabinets_side_by_side(self):
        from apps.furniture.project import project_layout, project_stats

        entries = project_layout(self.project)
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]["offset_x"], 0.0)
        self.assertAlmostEqual(entries[1]["offset_x"], 602.0)
        stats = project_stats(self.project)
        self.assertAlmostEqual(stats["total_width"], 1002.0)
        self.assertEqual(stats["cabinet_count"], 2)

    def test_project_boxes_are_shifted(self):
        from apps.furniture.project import project_boxes

        boxes, stats = project_boxes(self.project)
        self.assertEqual(stats["cabinet_count"], 2)
        max_x = max(box["x"] + box["w"] for box in boxes)
        self.assertAlmostEqual(max_x, 1002.0, places=0)

    def test_project_detail_page(self):
        response = self.client.get(reverse("poly:project_detail", args=[self.project.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Cuisine test")
        self.assertContains(response, "Colonne A")

    def test_project_add_and_remove_cabinet(self):
        cabinet3 = create_cabinet(
            name="Colonne C", width=300, height=720, depth=350,
            material=self.material, material_back=self.back,
        )
        self.client.post(
            reverse("poly:project_detail", args=[self.project.pk]),
            {"action": "add", "cabinet_id": cabinet3.pk},
        )
        self.assertEqual(self.project.items.count(), 3)
        item = self.project.items.get(cabinet=cabinet3)
        self.client.post(
            reverse("poly:project_detail", args=[self.project.pk]),
            {"action": "remove", "item_id": item.pk},
        )
        self.assertEqual(self.project.items.count(), 2)

    def test_project_pdfs(self):
        for url_name, filename in [
            ("project_croquis_pdf", f"croquis-projet-{self.project.pk}.pdf"),
            ("project_cutlist_pdf", f"liste-debit-projet-{self.project.pk}.pdf"),
            ("project_nesting_pdf", f"optimisation-projet-{self.project.pk}.pdf"),
            ("project_quote_pdf", f"devis-projet-{self.project.pk}.pdf"),
        ]:
            response = self.client.get(reverse(f"poly:{url_name}", args=[self.project.pk]))
            self.assertEqual(response.status_code, 200, url_name)
            self.assertEqual(response["Content-Type"], "application/pdf", url_name)
            self.assertIn(filename, response["Content-Disposition"], url_name)
            self.assertTrue(response.content.startswith(b"%PDF"), url_name)

    def test_project_create_from_dashboard(self):
        response = self.client.post(
            reverse("poly:project_create"), {"name": "Affaire X", "client_name": "M. Y"}
        )
        self.assertEqual(response.status_code, 302)
        self.assertTrue(Project.objects.filter(name="Affaire X").exists())


class RoomPhase1Tests(TestCase):
    """Phase 1 : pièce, murs, ouvertures, placements, versions et duplication."""

    def setUp(self):
        self.material = Material.objects.create(
            name="Agglo pièce", thickness=19, price_per_m2=40, is_default=True
        )
        self.back = Material.objects.create(
            name="Fond pièce", thickness=3, price_per_m2=9
        )
        self.project = Project.objects.create(
            name="Cuisine pièce",
            client_name="Mme Pièce",
            placement_mode=Project.PLACEMENT_ROOM,
            room_width=4000,
            room_depth=3000,
            room_height=2500,
        )
        ensure_room(self.project)
        self.cabinet = create_cabinet(
            name="Bas 600",
            width=600,
            height=720,
            depth=560,
            material=self.material,
            material_back=self.back,
        )

    def post_json(self, name, data, args):
        return self.client.post(
            reverse(f"poly:{name}", args=args),
            data=json.dumps(data),
            content_type="application/json",
        )

    # --- pièce et murs ------------------------------------------------
    def test_ensure_room_creates_closed_rectangle_once(self):
        walls = list(self.project.walls.all())
        self.assertEqual(len(walls), 4)
        self.assertEqual([wall.name for wall in walls], ["Nord", "Est", "Sud", "Ouest"])
        self.assertAlmostEqual(wall_length(walls[0]), 4000)
        self.assertAlmostEqual(wall_length(walls[1]), 3000)
        self.assertEqual(len(ensure_room(self.project)), 4)
        self.assertEqual(self.project.walls.count(), 4)

    def test_project_create_creates_room_and_redirects_to_editor(self):
        response = self.client.post(
            reverse("poly:project_create"),
            {"name": "Nouvelle cuisine", "client_name": "M. X"},
        )
        project = Project.objects.get(name="Nouvelle cuisine")
        self.assertEqual(project.placement_mode, Project.PLACEMENT_ROOM)
        self.assertEqual(project.walls.count(), 4)
        self.assertRedirects(
            response,
            reverse("poly:project_room", args=[project.pk]),
            fetch_redirect_response=False,
        )

    def test_legacy_linear_project_stays_out_of_room_editor(self):
        legacy = Project.objects.create(
            name="Ancienne affaire",
            placement_mode=Project.PLACEMENT_LINEAR,
        )
        response = self.client.get(reverse("poly:project_room", args=[legacy.pk]))
        self.assertRedirects(
            response,
            reverse("poly:project_detail", args=[legacy.pk]),
            fetch_redirect_response=False,
        )
        self.assertEqual(legacy.walls.count(), 0)

        dashboard = self.client.get(reverse("poly:home"))
        self.assertContains(
            dashboard, reverse("poly:project_room", args=[self.project.pk])
        )
        self.assertNotContains(
            dashboard, reverse("poly:project_room", args=[legacy.pk])
        )
        detail = self.client.get(reverse("poly:project_detail", args=[legacy.pk]))
        self.assertNotContains(detail, "Éditeur de pièce 2D/3D")

        room_detail = self.client.get(
            reverse("poly:project_detail", args=[self.project.pk])
        )
        self.assertContains(room_detail, "Éditeur de pièce 2D/3D")

    def test_room_page_and_api_payload(self):
        response = self.client.get(reverse("poly:project_room", args=[self.project.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Éditeur de pièce")
        self.assertContains(response, "room-presentation-bar")
        self.assertContains(response, "Présentation")
        self.assertContains(response, "Plein écran")

        api_response = self.client.get(
            reverse("poly:api_project_room", args=[self.project.pk])
        )
        self.assertEqual(api_response.status_code, 200)
        payload = api_response.json()["payload"]
        self.assertEqual(len(payload["walls"]), 4)
        self.assertEqual(len(payload["presets"]), 14)
        self.assertEqual(payload["project"]["placement_mode"], "room")
        self.assertIn("summary", payload)
        self.assertIn("warnings", payload)

    def test_project_layout_does_not_rewrite_room_offsets(self):
        from apps.furniture.project import project_layout

        item = add_cabinet_to_room(self.project, self.cabinet)
        ProjectItem.objects.filter(pk=item.pk).update(slot=7, offset_x=999)
        entries = project_layout(self.project)
        self.assertEqual(len(entries), 1)
        item.refresh_from_db()
        self.assertEqual(item.slot, 7)
        self.assertAlmostEqual(item.offset_x, 999)

    def test_project_detail_header_uses_room_dimensions(self):
        add_cabinet_to_room(self.project, self.cabinet)
        response = self.client.get(
            reverse("poly:project_detail", args=[self.project.pk])
        )
        self.assertContains(response, "400 × 300 × 250 cm")
        self.assertContains(response, "12,00 m²")
        self.assertContains(response, "4 mur(s) · 0 ouverture(s)")

    def test_project_detail_move_is_ignored_in_room_mode(self):
        item = add_cabinet_to_room(self.project, self.cabinet)
        ProjectItem.objects.filter(pk=item.pk).update(slot=3)
        self.client.post(
            reverse("poly:project_detail", args=[self.project.pk]),
            {"action": "move", "item_id": item.pk, "direction": "up"},
        )
        item.refresh_from_db()
        self.assertEqual(item.slot, 3)

    def test_room_croquis_pdf_is_a_plan(self):
        add_cabinet_to_room(self.project, self.cabinet)
        create_opening(
            self.project,
            {"wall_id": self.project.walls.get(index=0).pk, "kind": "door"},
        )
        response = self.client.get(
            reverse("poly:project_croquis_pdf", args=[self.project.pk])
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertIn("plan-piece-projet", response["Content-Disposition"])

    def test_room_croquis_pdf_handles_empty_room(self):
        response = self.client.get(
            reverse("poly:project_croquis_pdf", args=[self.project.pk])
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_linear_croquis_pdf_still_works(self):
        legacy = Project.objects.create(
            name="Ancienne cuisine",
            placement_mode=Project.PLACEMENT_LINEAR,
        )
        ProjectItem.objects.create(
            project=legacy, cabinet=self.cabinet, slot=0
        )
        response = self.client.get(
            reverse("poly:project_croquis_pdf", args=[legacy.pk])
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("croquis-projet", response["Content-Disposition"])

    def test_wall_vertex_update_keeps_room_closed(self):
        north = self.project.walls.get(index=0)
        east = self.project.walls.get(index=1)
        response = self.post_json(
            "api_project_room_walls",
            {"walls": [{"id": north.pk, "x1": 0, "y1": 0, "x2": 4500, "y2": 0}]},
            [self.project.pk],
        )
        self.assertEqual(response.status_code, 200)
        north.refresh_from_db()
        east.refresh_from_db()
        self.assertAlmostEqual(north.x2, 4500)
        self.assertAlmostEqual(east.x1, 4500)
        self.assertAlmostEqual(east.y1, 0)

    def test_room_update_rescales_walls(self):
        response = self.post_json(
            "api_project_room_update",
            {
                "room_width": 5000,
                "room_depth": 3000,
                "room_height": 2500,
                "wall_thickness": 100,
            },
            [self.project.pk],
        )
        self.assertEqual(response.status_code, 200)
        north = self.project.walls.get(index=0)
        east = self.project.walls.get(index=1)
        self.assertAlmostEqual(wall_length(north), 5000)
        self.assertAlmostEqual(wall_length(east), 3000)

    # --- placements ---------------------------------------------------
    def test_auto_placement_keeps_cabinets_inside_and_separate(self):
        second = create_cabinet(
            name="Bas 800",
            width=800,
            height=720,
            depth=560,
            material=self.material,
            material_back=self.back,
        )
        item1 = add_cabinet_to_room(self.project, self.cabinet)
        item2 = add_cabinet_to_room(self.project, second)
        self.assertEqual((item1.slot, item2.slot), (0, 1))
        for item in (item1, item2):
            x0, y0, x1, y1 = item_bbox(item)
            self.assertGreaterEqual(x0, -1)
            self.assertGreaterEqual(y0, -1)
            self.assertLessEqual(x1, self.project.room_width + 1)
            self.assertLessEqual(y1, self.project.room_depth + 1)
        messages = [warning["message"] for warning in project_warnings(self.project)]
        self.assertFalse(any("chevauchent" in message for message in messages))

    def test_wall_cabinet_can_stack_above_base_cabinet(self):
        base = add_cabinet_to_room(self.project, self.cabinet, elevation=0)
        wall_cabinet = create_cabinet(
            name="Haut 600",
            width=600,
            height=720,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        upper = add_cabinet_to_room(
            self.project, wall_cabinet, elevation=1400
        )
        self.assertAlmostEqual(upper.pos_x, base.pos_x)
        self.assertAlmostEqual(upper.pos_y, base.pos_y)
        self.assertAlmostEqual(upper.elevation, 1400)
        messages = [warning["message"] for warning in project_warnings(self.project)]
        self.assertFalse(any("chevauchent" in message for message in messages))

    def test_overlap_warning_uses_vertical_ranges(self):
        base = add_cabinet_to_room(self.project, self.cabinet, elevation=0)
        wall_cabinet = create_cabinet(
            name="Haut 600",
            width=600,
            height=720,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        upper = add_cabinet_to_room(
            self.project, wall_cabinet, elevation=1400
        )
        update_item(
            upper,
            {
                "pos_x": base.pos_x,
                "pos_y": base.pos_y,
                "rotation": base.rotation,
                "elevation": 1400,
            },
        )
        messages = [warning["message"] for warning in project_warnings(self.project)]
        self.assertFalse(any("chevauchent" in message for message in messages))

        update_item(
            upper,
            {
                "pos_x": base.pos_x,
                "pos_y": base.pos_y,
                "rotation": base.rotation,
                "elevation": 0,
            },
        )
        upper.refresh_from_db()
        messages = [warning["message"] for warning in project_warnings(self.project)]
        # Le chevauchement est résolu côté serveur : plus d'alerte, et le
        # caisson a été repoussé hors de l'emprise du caisson bas.
        self.assertFalse(any("chevauchent" in message for message in messages))
        self.assertNotEqual(
            (round(upper.pos_x), round(upper.pos_y)),
            (round(base.pos_x), round(base.pos_y)),
        )

    def test_add_preset_api_returns_item_id(self):
        response = self.post_json(
            "api_project_item_add",
            {"preset_key": "kitchen-base-600"},
            [self.project.pk],
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertIn("item_id", body)
        self.assertEqual(self.project.items.count(), 1)
        item = self.project.items.get(pk=body["item_id"])
        self.assertAlmostEqual(item.cabinet.width, 600)
        self.assertGreaterEqual(item.pos_x, 0)
        self.assertGreaterEqual(item.pos_y, 0)

    def test_item_api_update_rotate_and_delete(self):
        item = add_cabinet_to_room(self.project, self.cabinet)
        response = self.post_json(
            "api_project_item_update",
            {"pos_x": 1200, "pos_y": 300, "rotation": 90, "elevation": 1400},
            [self.project.pk, item.pk],
        )
        self.assertEqual(response.status_code, 200)
        item.refresh_from_db()
        self.assertAlmostEqual(item.pos_x, 1200)
        self.assertAlmostEqual(item.pos_y, 300)
        self.assertAlmostEqual(item.rotation, 90)
        self.assertAlmostEqual(item.elevation, 1400)

        response = self.post_json(
            "api_project_item_delete", {}, [self.project.pk, item.pk]
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.project.items.count(), 0)
        self.assertTrue(Cabinet.objects.filter(pk=self.cabinet.pk).exists())

    def test_item_outside_room_warning(self):
        item = add_cabinet_to_room(self.project, self.cabinet)
        update_item(
            item,
            {"pos_x": -2000, "pos_y": -2000, "rotation": 0, "elevation": 0},
        )
        warnings = project_warnings(self.project)
        self.assertTrue(
            any("sort de la pièce" in warning["message"] for warning in warnings)
        )

    def test_outside_check_follows_edited_walls(self):
        north = self.project.walls.get(index=0)
        south = self.project.walls.get(index=2)
        update_walls(
            self.project,
            [
                {"id": north.pk, "x1": 0, "y1": 0, "x2": 4500, "y2": 0},
                {"id": south.pk, "x1": 4500, "y1": 3000, "x2": 0, "y2": 3000},
            ],
        )
        self.project.refresh_from_db()
        self.assertAlmostEqual(self.project.room_width, 4500)
        self.assertAlmostEqual(self.project.room_depth, 3000)
        item = add_cabinet_to_room(self.project, self.cabinet)
        update_item(
            item,
            {"pos_x": 3800, "pos_y": 100, "rotation": 0, "elevation": 0},
        )
        warnings = project_warnings(self.project)
        self.assertFalse(
            any("sort de la pièce" in warning["message"] for warning in warnings)
        )

        update_item(
            item,
            {"pos_x": 4600, "pos_y": 100, "rotation": 0, "elevation": 0},
        )
        warnings = project_warnings(self.project)
        self.assertTrue(
            any("sort de la pièce" in warning["message"] for warning in warnings)
        )

    # --- ouvertures ---------------------------------------------------
    def test_opening_crud_and_overflow_warning(self):
        wall = self.project.walls.get(index=0)
        response = self.post_json(
            "api_project_opening_create",
            {"wall_id": wall.pk, "kind": "door"},
            [self.project.pk],
        )
        self.assertEqual(response.status_code, 201)
        opening = RoomOpening.objects.get(project=self.project)
        self.assertEqual(opening.kind, RoomOpening.KIND_DOOR)
        self.assertEqual(opening.sill, 0)
        self.assertEqual(opening.height, 2100)

        response = self.post_json(
            "api_project_opening_update",
            {"offset": 3900, "width": 900, "height": 2100, "sill": 0},
            [self.project.pk, opening.pk],
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()["payload"]
        self.assertTrue(
            any("dépasse du mur" in warning["message"] for warning in payload["warnings"])
        )

        response = self.post_json(
            "api_project_opening_delete", {}, [self.project.pk, opening.pk]
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.project.openings.count(), 0)

    # --- versions -----------------------------------------------------
    def test_version_create_and_restore(self):
        item = add_cabinet_to_room(self.project, self.cabinet)
        original = (item.pos_x, item.pos_y, item.rotation)
        version = create_version(self.project, "Proposition A")
        self.assertEqual(version.payload["items"][0]["pos_x"], original[0])

        update_item(
            item,
            {"pos_x": 2000, "pos_y": 1000, "rotation": 180, "elevation": 0},
        )
        create_opening(
            self.project,
            {"wall_id": self.project.walls.get(index=0).pk, "kind": "window"},
        )
        self.assertEqual(self.project.openings.count(), 1)

        result = restore_version(self.project, version)
        self.assertEqual(result["missing_cabinets"], 0)
        restored = self.project.items.get()
        self.assertAlmostEqual(restored.pos_x, original[0])
        self.assertAlmostEqual(restored.pos_y, original[1])
        self.assertAlmostEqual(restored.rotation, original[2])
        self.assertEqual(self.project.openings.count(), 0)
        self.assertEqual(self.project.walls.count(), 4)

    def test_version_restore_reports_missing_cabinet(self):
        item = add_cabinet_to_room(self.project, self.cabinet)
        version = create_version(self.project, "Avant suppression")
        Cabinet.objects.filter(pk=item.cabinet_id).delete()
        result = restore_version(self.project, version)
        self.assertEqual(result["missing_cabinets"], 1)
        self.assertEqual(self.project.items.count(), 0)

    # --- duplication --------------------------------------------------
    def test_duplicate_project_deep_clones_cabinets(self):
        item = add_cabinet_to_room(self.project, self.cabinet)
        create_opening(
            self.project,
            {"wall_id": self.project.walls.get(index=0).pk, "kind": "window"},
        )
        clone = duplicate_project(self.project, "Cuisine copie")
        self.assertNotEqual(clone.pk, self.project.pk)
        self.assertEqual(clone.walls.count(), 4)
        self.assertEqual(clone.openings.count(), 1)
        cloned_item = clone.items.get()
        self.assertNotEqual(cloned_item.cabinet_id, item.cabinet_id)
        self.assertAlmostEqual(cloned_item.pos_x, item.pos_x)
        self.assertAlmostEqual(cloned_item.pos_y, item.pos_y)
        self.assertAlmostEqual(cloned_item.rotation, item.rotation)
        self.assertAlmostEqual(cloned_item.cabinet.width, self.cabinet.width)
        self.assertEqual(
            cloned_item.cabinet.panels.count(), self.cabinet.panels.count()
        )
        self.assertTrue(cloned_item.cabinet.name.endswith("(copie)"))

        second_clone = duplicate_project(clone)
        self.assertNotIn("(copie) (copie)", second_clone.name)
        self.assertNotIn(
            "(copie) (copie)", second_clone.items.get().cabinet.name
        )

    def test_duplicate_api_returns_new_project_url(self):
        response = self.post_json(
            "api_project_duplicate", {"name": "Copie API"}, [self.project.pk]
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        clone = Project.objects.get(pk=body["project_id"])
        self.assertEqual(clone.name, "Copie API")
        self.assertEqual(body["url"], f"/poly/projet/{clone.pk}/piece/")

    # --- prix et bibliothèque -----------------------------------------
    def test_price_summary_matches_quote_lines(self):
        add_cabinet_to_room(self.project, self.cabinet)
        summary = project_price_summary(self.project)
        quote = self.cabinet.quote
        expected_cost = float(quote.subtotal_materials) + float(
            quote.subtotal_hardware
        )
        expected_ht = expected_cost * 1.3
        self.assertAlmostEqual(summary["cost"], expected_cost, places=1)
        self.assertAlmostEqual(summary["total_ht"], expected_ht, places=1)
        self.assertAlmostEqual(summary["total_ttc"], expected_ht * 1.2, places=1)

    def test_library_presets_and_creation(self):
        from apps.furniture.library import PRESETS, create_cabinet_from_preset, get_preset

        self.assertEqual(len(PRESETS), 14)
        self.assertEqual(len({preset["key"] for preset in PRESETS}), 14)
        preset = get_preset("kitchen-wall-600")
        self.assertEqual(preset["default_elevation"], 1400)
        cabinet = create_cabinet_from_preset(preset)
        self.assertEqual(cabinet.name, "Meuble haut 600")
        self.assertAlmostEqual(cabinet.width, 600)
        self.assertAlmostEqual(cabinet.depth, 350)
        self.assertTrue(cabinet.has_doors)
        self.assertTrue(hasattr(cabinet, "quote"))

    def test_room_payload_includes_available_cabinets(self):
        payload = room_payload(self.project)
        ids = [cabinet["id"] for cabinet in payload["available_cabinets"]]
        self.assertIn(self.cabinet.pk, ids)
        add_cabinet_to_room(self.project, self.cabinet)
        payload = room_payload(self.project)
        ids = [cabinet["id"] for cabinet in payload["available_cabinets"]]
        self.assertNotIn(self.cabinet.pk, ids)


class RoomPhase2Tests(TestCase):
    """Phase 2 : appareils, plans de travail, ergonomie, versions et exports."""

    def setUp(self):
        self.material = Material.objects.create(
            name="Agglo phase 2", thickness=19, price_per_m2=40, is_default=True
        )
        self.back = Material.objects.create(
            name="Fond phase 2", thickness=3, price_per_m2=9
        )
        self.project = Project.objects.create(
            name="Cuisine phase 2",
            client_name="Mme Appareil",
            placement_mode=Project.PLACEMENT_ROOM,
            room_width=4000,
            room_depth=3000,
            room_height=2500,
        )
        ensure_room(self.project)
        self.cabinet = create_cabinet(
            name="Bas 600",
            width=600,
            height=720,
            depth=560,
            material=self.material,
            material_back=self.back,
        )
        self.base = add_cabinet_to_room(self.project, self.cabinet)

    def post_json(self, name, data, args):
        return self.client.post(
            reverse(f"poly:{name}", args=args),
            data=json.dumps(data),
            content_type="application/json",
        )

    def add_appliance(self, key):
        from apps.furniture.library import get_appliance_preset

        preset = get_appliance_preset(key)
        self.assertIsNotNone(preset)
        return add_appliance_to_room(self.project, preset)

    # --- plans de travail ---------------------------------------------
    def test_worktop_is_derived_from_base_cabinets(self):
        worktops = compute_worktops(self.project)
        self.assertEqual(len(worktops), 1)
        worktop = worktops[0]
        self.assertAlmostEqual(worktop["height"], 720)
        self.assertAlmostEqual(worktop["thickness"], 38)
        self.assertAlmostEqual(worktop["surface"], 758)
        self.assertAlmostEqual(worktop_surface_height(self.project), 758)
        xs = [point[0] for point in worktop["corners"]]
        ys = [point[1] for point in worktop["corners"]]
        self.assertLess(min(xs), float(self.base.pos_x))
        self.assertGreater(max(xs), float(self.base.pos_x) + 600)

    def test_worktop_merges_contiguous_base_cabinets(self):
        second = create_cabinet(
            name="Bas 600 bis",
            width=600,
            height=720,
            depth=560,
            material=self.material,
            material_back=self.back,
        )
        add_cabinet_to_room(self.project, second)
        worktops = compute_worktops(self.project)
        self.assertEqual(len(worktops), 1)
        xs = [point[0] for point in worktops[0]["corners"]]
        self.assertGreater(max(xs) - min(xs), 1200)

    def test_wall_cabinet_does_not_create_worktop(self):
        wall_cabinet = create_cabinet(
            name="Haut 600",
            width=600,
            height=720,
            depth=350,
            material=self.material,
            material_back=self.back,
        )
        add_cabinet_to_room(self.project, wall_cabinet, elevation=1400)
        worktops = compute_worktops(self.project)
        self.assertEqual(len(worktops), 1)
        self.assertAlmostEqual(worktops[0]["height"], 720)

    def test_worktop_settings_are_editable_through_room_api(self):
        response = self.post_json(
            "api_project_room_update",
            {
                "worktop_thickness": 50,
                "worktop_overhang": 30,
                "worktop_color": "#112233",
            },
            [self.project.pk],
        )
        self.assertEqual(response.status_code, 200)
        self.project.refresh_from_db()
        self.assertAlmostEqual(self.project.worktop_thickness, 50)
        self.assertAlmostEqual(self.project.worktop_overhang, 30)
        self.assertEqual(self.project.worktop_color, "#112233")
        worktop = compute_worktops(self.project)[0]
        self.assertAlmostEqual(worktop["thickness"], 50)
        self.assertAlmostEqual(worktop["surface"], 770)

    def test_worktop_thickness_change_keeps_appliances_flush(self):
        sink = self.add_appliance("appliance-sink-600")
        fridge = self.add_appliance("appliance-fridge-600")
        self.assertAlmostEqual(float(sink.elevation), 758)
        self.assertAlmostEqual(float(fridge.elevation), 0)

        response = self.post_json(
            "api_project_room_update",
            {"worktop_thickness": 50},
            [self.project.pk],
        )
        self.assertEqual(response.status_code, 200)
        sink.refresh_from_db()
        fridge.refresh_from_db()
        self.assertAlmostEqual(float(sink.elevation), 770)
        self.assertAlmostEqual(float(fridge.elevation), 0)

    # --- appareils ----------------------------------------------------
    def test_appliance_presets_are_available(self):
        from apps.furniture.library import APPLIANCE_PRESETS, get_appliance_preset

        self.assertEqual(len(APPLIANCE_PRESETS), 12)
        self.assertEqual(
            len({preset["key"] for preset in APPLIANCE_PRESETS}), 12
        )
        sink = get_appliance_preset("appliance-sink-600")
        self.assertEqual(sink["kind"], RoomAppliance.KIND_SINK)
        self.assertIsNone(sink["default_elevation"])

    def test_sink_is_centered_on_base_cabinet_and_on_worktop(self):
        sink = self.add_appliance("appliance-sink-600")
        self.assertEqual(sink.kind, RoomAppliance.KIND_SINK)
        self.assertAlmostEqual(sink.elevation, 758)
        self.assertAlmostEqual(sink.pos_x, float(self.base.pos_x))
        center_x = float(sink.pos_x) + float(sink.width) / 2.0
        self.assertAlmostEqual(center_x, float(self.base.pos_x) + 300)
        worktop = compute_worktops(self.project)[0]
        xs = [point[0] for point in worktop["corners"]]
        ys = [point[1] for point in worktop["corners"]]
        center_y = float(sink.pos_y) + float(sink.depth) / 2.0
        self.assertGreaterEqual(center_x, min(xs))
        self.assertLessEqual(center_x, max(xs))
        self.assertGreaterEqual(center_y, min(ys))
        self.assertLessEqual(center_y, max(ys))
        messages = [
            warning["message"] for warning in project_warnings(self.project)
        ]
        self.assertFalse(
            any("n'est pas posé sur un plan de travail" in message
                for message in messages)
        )

    def test_appliance_attaches_to_selected_cabinet(self):
        from apps.furniture.library import get_appliance_preset

        sink = add_appliance_to_room(
            self.project,
            get_appliance_preset("appliance-sink-600"),
            cabinet_id=self.base.pk,
        )
        # Centré sur le caisson bas sélectionné, posé sur le plan de travail.
        self.assertAlmostEqual(float(sink.pos_x), float(self.base.pos_x))
        self.assertAlmostEqual(
            float(sink.pos_y), float(self.base.pos_y) + 30.0
        )
        self.assertAlmostEqual(float(sink.elevation), worktop_surface_height(self.project))

        # Un four encastré se centre dans la hauteur de la colonne.
        tall = create_cabinet(
            name="Colonne four",
            width=600,
            height=2200,
            depth=560,
            material=self.material,
            material_back=self.back,
        )
        tall_item = add_cabinet_to_room(self.project, tall)
        oven = add_appliance_to_room(
            self.project,
            get_appliance_preset("appliance-oven-600"),
            cabinet_id=tall_item.pk,
        )
        self.assertAlmostEqual(float(oven.pos_x), float(tall_item.pos_x))
        self.assertAlmostEqual(
            float(oven.elevation), (2200.0 - float(oven.height)) / 2.0
        )

    def test_hood_is_centered_above_hob_with_clearance(self):
        hob = self.add_appliance("appliance-hob-600")
        hood = self.add_appliance("appliance-hood-600")
        self.assertAlmostEqual(
            float(hob.pos_x) + float(hob.width) / 2.0,
            float(hood.pos_x) + float(hood.width) / 2.0,
            places=1,
        )
        self.assertAlmostEqual(
            float(hob.pos_y) + float(hob.depth) / 2.0,
            float(hood.pos_y) + float(hood.depth) / 2.0,
            places=1,
        )
        self.assertAlmostEqual(hood.elevation, 1500)
        messages = [
            warning["message"] for warning in project_warnings(self.project)
        ]
        self.assertFalse(any("trop basse" in message for message in messages))
        self.assertFalse(any("n'est au-dessus" in message for message in messages))

    def test_hood_too_low_raises_ergonomic_warning(self):
        self.add_appliance("appliance-hob-600")
        hood = self.add_appliance("appliance-hood-600")
        update_appliance(hood, {"elevation": 850})
        messages = [
            warning["message"] for warning in project_warnings(self.project)
        ]
        self.assertTrue(any("trop basse" in message for message in messages))

    def test_sink_and_hob_must_be_sixty_centimeters_apart(self):
        second = create_cabinet(
            name="Bas 600 bis",
            width=600,
            height=720,
            depth=560,
            material=self.material,
            material_back=self.back,
        )
        add_cabinet_to_room(self.project, second)
        self.add_appliance("appliance-sink-600")
        self.add_appliance("appliance-hob-600")
        messages = [
            warning["message"] for warning in project_warnings(self.project)
        ]
        self.assertTrue(any("trop proche de l'évier" in message for message in messages))

    def test_appliance_outside_room_warning(self):
        sink = self.add_appliance("appliance-sink-600")
        update_appliance(sink, {"pos_x": -2000, "pos_y": -2000})
        messages = [
            warning["message"] for warning in project_warnings(self.project)
        ]
        self.assertTrue(any("sort de la pièce" in message for message in messages))

    def test_appliance_api_add_update_and_delete(self):
        response = self.post_json(
            "api_project_appliance_add",
            {"preset_key": "appliance-fridge-600"},
            [self.project.pk],
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertIn("appliance_id", body)
        self.assertEqual(self.project.appliances.count(), 1)
        appliance = self.project.appliances.get(pk=body["appliance_id"])
        self.assertEqual(appliance.kind, RoomAppliance.KIND_FRIDGE)

        response = self.post_json(
            "api_project_appliance_update",
            {
                "pos_x": 1800,
                "pos_y": 400,
                "rotation": 90,
                "elevation": 0,
                "price": 990,
            },
            [self.project.pk, appliance.pk],
        )
        self.assertEqual(response.status_code, 200)
        appliance.refresh_from_db()
        self.assertAlmostEqual(appliance.pos_x, 1800)
        self.assertAlmostEqual(appliance.pos_y, 400)
        self.assertAlmostEqual(appliance.rotation, 90)
        self.assertAlmostEqual(appliance.price, 990)

        response = self.post_json(
            "api_project_appliance_delete", {}, [self.project.pk, appliance.pk]
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.project.appliances.count(), 0)

    # --- payload, devis et versions -----------------------------------
    def test_room_payload_includes_appliances_and_worktops(self):
        self.add_appliance("appliance-sink-600")
        payload = room_payload(self.project)
        self.assertEqual(len(payload["appliances"]), 1)
        self.assertEqual(len(payload["worktops"]), 1)
        self.assertEqual(len(payload["appliance_presets"]), 12)
        self.assertEqual(payload["stats"]["appliance_count"], 1)
        self.assertAlmostEqual(payload["worktop"]["surface_height"], 758)
        self.assertEqual(payload["appliances"][0]["kind"], "sink")
        self.assertIn("appliance_lines", payload["summary"])

    def test_price_summary_includes_appliances(self):
        sink = self.add_appliance("appliance-sink-600")
        summary = project_price_summary(self.project)
        quote = self.cabinet.quote
        expected_cost = (
            float(quote.subtotal_materials)
            + float(quote.subtotal_hardware)
            + float(sink.price)
        )
        self.assertEqual(summary["appliance_count"], 1)
        self.assertAlmostEqual(summary["appliances"], float(sink.price))
        self.assertAlmostEqual(summary["cost"], expected_cost, places=1)
        self.assertEqual(len(summary["appliance_lines"]), 1)
        self.assertEqual(
            summary["appliance_lines"][0]["kind_label"], "Évier"
        )

    def test_version_round_trip_includes_appliances_and_worktops(self):
        sink = self.add_appliance("appliance-sink-600")
        original = (float(sink.pos_x), float(sink.pos_y), float(sink.elevation))
        version = create_version(self.project, "Avec évier")
        self.assertEqual(len(version.payload["appliances"]), 1)

        update_appliance(
            sink, {"pos_x": 2200, "pos_y": 900, "elevation": 900}
        )
        self.project.worktop_thickness = 50
        self.project.worktop_color = "#abcdef"
        self.project.save(update_fields=["worktop_thickness", "worktop_color"])

        result = restore_version(self.project, version)
        self.assertEqual(result["missing_cabinets"], 0)
        restored = self.project.appliances.get()
        self.assertAlmostEqual(float(restored.pos_x), original[0])
        self.assertAlmostEqual(float(restored.pos_y), original[1])
        self.assertAlmostEqual(float(restored.elevation), original[2])
        self.project.refresh_from_db()
        self.assertAlmostEqual(self.project.worktop_thickness, 38)
        self.assertEqual(self.project.worktop_color, "#d9d2c5")

    def test_duplicate_clones_appliances_and_worktop_settings(self):
        sink = self.add_appliance("appliance-sink-600")
        self.project.worktop_overhang = 35
        self.project.save(update_fields=["worktop_overhang"])
        clone = duplicate_project(self.project, "Cuisine copie phase 2")
        self.assertEqual(clone.appliances.count(), 1)
        cloned = clone.appliances.get()
        self.assertNotEqual(cloned.pk, sink.pk)
        self.assertEqual(cloned.kind, sink.kind)
        self.assertAlmostEqual(float(cloned.pos_x), float(sink.pos_x))
        self.assertAlmostEqual(float(cloned.elevation), float(sink.elevation))
        self.assertAlmostEqual(float(cloned.price), float(sink.price))
        self.assertAlmostEqual(clone.worktop_overhang, 35)
        self.assertEqual(clone.worktop_color, self.project.worktop_color)

    # --- exports PDF ---------------------------------------------------
    def test_room_sketch_pdf_draws_appliances_on_a_second_page(self):
        from apps.furniture.pdf_export import build_room_sketch_pdf

        self.add_appliance("appliance-sink-600")
        self.add_appliance("appliance-hob-600")
        response = build_room_sketch_pdf(self.project)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertGreaterEqual(response.content.count(b"/Type /Page"), 3)

    def test_quote_pdf_accepts_project_with_only_appliances(self):
        from apps.furniture.pdf_export import build_project_quote_pdf

        project = Project.objects.create(
            name="Appareils seuls",
            client_name="M. Frigo",
            placement_mode=Project.PLACEMENT_ROOM,
            room_width=3000,
            room_depth=2500,
            room_height=2500,
        )
        ensure_room(project)
        RoomAppliance.objects.create(
            project=project,
            kind=RoomAppliance.KIND_FRIDGE,
            name="Réfrigérateur seul",
            width=600,
            depth=650,
            height=1850,
            price=900,
        )
        response = build_project_quote_pdf(project)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")


class DressingPhase2Tests(TestCase):
    """Dressing : tringles, linéaire de penderie et alertes."""

    def setUp(self):
        self.material = Material.objects.create(
            name="Agglo dressing", thickness=19, price_per_m2=40, is_default=True
        )
        self.back = Material.objects.create(
            name="Fond dressing", thickness=3, price_per_m2=9
        )
        self.project = Project.objects.create(
            name="Dressing phase 2",
            client_name="M. Penderie",
            placement_mode=Project.PLACEMENT_ROOM,
            room_type=Project.ROOM_DRESSING,
            room_width=4000,
            room_depth=3000,
            room_height=2500,
        )
        ensure_room(self.project)

    def test_wardrobe_preset_creates_a_hanging_rail(self):
        from apps.furniture.library import create_cabinet_from_preset, get_preset

        cabinet = create_cabinet_from_preset(get_preset("dressing-wardrobe-1000"))
        self.assertTrue(cabinet.has_hanging_rail)
        self.assertAlmostEqual(float(cabinet.hanging_rail_height), 1800)
        boxes = build_scene(cabinet)["boxes"]
        rail = next(box for box in boxes if box["kind"] == "rail")
        self.assertEqual(rail["label"], "Tringle")
        self.assertAlmostEqual(rail["y"], 1785)

    def test_hanging_rail_is_editable_and_undoable(self):
        cabinet = create_cabinet(
            name="Penderie éditable",
            width=1000,
            height=2200,
            depth=600,
            material=self.material,
            material_back=self.back,
        )
        service = CabinetDesignService(cabinet)
        before = capture_cabinet(cabinet)
        service.update_cabinet(
            {"has_hanging_rail": True, "hanging_rail_height": 1750}
        )
        cabinet.refresh_from_db()
        self.assertTrue(cabinet.has_hanging_rail)
        self.assertAlmostEqual(float(cabinet.hanging_rail_height), 1750)
        record_history(cabinet, before, "Tringle ajoutée")
        undo_cabinet(cabinet)
        cabinet.refresh_from_db()
        self.assertFalse(cabinet.has_hanging_rail)

    def test_dressing_stats_and_missing_rail_warning(self):
        cabinet = create_cabinet(
            name="Armoire haute",
            width=1200,
            height=2200,
            depth=600,
            material=self.material,
            material_back=self.back,
        )
        add_cabinet_to_room(self.project, cabinet)
        warnings = [warning["message"] for warning in project_warnings(self.project)]
        self.assertTrue(any("Aucune tringle" in message for message in warnings))

        cabinet.has_hanging_rail = True
        cabinet.hanging_rail_height = 1800
        cabinet.save(update_fields=["has_hanging_rail", "hanging_rail_height"])
        stats = dressing_stats(self.project)
        self.assertEqual(stats["rail_count"], 1)
        self.assertAlmostEqual(stats["rail_length_m"], 1.2)
        self.assertAlmostEqual(stats["rail_height_min"], 1800)
        warnings = [warning["message"] for warning in project_warnings(self.project)]
        self.assertFalse(any("Aucune tringle" in message for message in warnings))

    def test_rail_height_outside_recommended_range_warns(self):
        cabinet = create_cabinet(
            name="Penderie basse",
            width=1000,
            height=2200,
            depth=600,
            material=self.material,
            material_back=self.back,
            has_hanging_rail=True,
            hanging_rail_height=1600,
        )
        add_cabinet_to_room(self.project, cabinet)
        warnings = [warning["message"] for warning in project_warnings(self.project)]
        self.assertTrue(
            any("hauteur recommandée entre 170 et 190 cm" in message for message in warnings)
        )


class DrawerCabinetTests(TestCase):
    """Tiroirs : façades empilées, réglages et undo/redo."""

    def setUp(self):
        self.material = Material.objects.create(
            name="Agglo tiroirs", thickness=19, price_per_m2=40, is_default=True
        )
        self.back = Material.objects.create(
            name="Fond tiroirs", thickness=3, price_per_m2=9
        )

    def test_drawer_preset_creates_stacked_fronts(self):
        from apps.furniture.library import create_cabinet_from_preset, get_preset

        cabinet = create_cabinet_from_preset(get_preset("kitchen-drawers-600"))
        self.assertTrue(cabinet.has_drawers)
        self.assertFalse(cabinet.has_doors)
        self.assertEqual(cabinet.drawer_count, 3)
        boxes = build_scene(cabinet)["boxes"]
        drawers = [box for box in boxes if box["kind"] == "drawer"]
        self.assertEqual(len(drawers), 3)
        self.assertEqual(drawers[0]["label"], "Tiroir 1")
        self.assertLess(drawers[0]["y"], drawers[1]["y"])

    def test_drawers_are_editable_and_undoable(self):
        cabinet = create_cabinet(
            name="Caisson tiroirs",
            width=600,
            height=720,
            depth=560,
            material=self.material,
            material_back=self.back,
        )
        service = CabinetDesignService(cabinet)
        before = capture_cabinet(cabinet)
        service.update_cabinet(
            {
                "has_drawers": True,
                "drawer_count": 4,
                "drawer_height": 150,
            }
        )
        cabinet.refresh_from_db()
        self.assertTrue(cabinet.has_drawers)
        self.assertEqual(cabinet.drawer_count, 4)
        self.assertAlmostEqual(float(cabinet.drawer_height), 150)
        record_history(cabinet, before, "Tiroirs ajoutés")
        undo_cabinet(cabinet)
        cabinet.refresh_from_db()
        self.assertFalse(cabinet.has_drawers)


class WorktopPhase2Tests(TestCase):
    """Plans de travail indépendants : création, édition, surface et API."""

    def setUp(self):
        self.material = Material.objects.create(
            name="Agglo plan", thickness=19, price_per_m2=40, is_default=True
        )
        self.project = Project.objects.create(
            name="Cuisine plan",
            client_name="M. Plan",
            placement_mode=Project.PLACEMENT_ROOM,
            room_width=4000,
            room_depth=3000,
            room_height=2500,
        )
        ensure_room(self.project)

    def post_json(self, name, data, args):
        return self.client.post(
            reverse(f"poly:{name}", args=args),
            data=json.dumps(data),
            content_type="application/json",
        )

    def test_explicit_worktop_overrides_derived(self):
        from apps.furniture.room import add_worktop_to_room

        worktop = add_worktop_to_room(
            self.project,
            {"width": 2400, "depth": 650, "thickness": 40, "elevation": 920},
        )
        worktops = compute_worktops(self.project)
        self.assertEqual(len(worktops), 1)
        self.assertTrue(worktops[0]["explicit"])
        self.assertAlmostEqual(worktops[0]["width"], 2400)
        self.assertAlmostEqual(worktops[0]["surface"], 920)
        self.assertAlmostEqual(worktop_surface_height(self.project), 920)

    def test_worktop_api_add_update_delete(self):
        response = self.post_json(
            "api_project_worktop_add",
            {"width": 2000, "depth": 600, "thickness": 38},
            [self.project.pk],
        )
        self.assertEqual(response.status_code, 201)
        worktop_id = response.json()["worktop_id"]

        response = self.post_json(
            "api_project_worktop_update",
            {"width": 2600, "depth": 700, "thickness": 50},
            [self.project.pk, worktop_id],
        )
        self.assertEqual(response.status_code, 200)
        worktop = RoomWorktop.objects.get(pk=worktop_id)
        self.assertAlmostEqual(float(worktop.width), 2600)
        self.assertAlmostEqual(float(worktop.depth), 700)
        self.assertAlmostEqual(float(worktop.thickness), 50)

        response = self.post_json(
            "api_project_worktop_delete", {}, [self.project.pk, worktop_id]
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(RoomWorktop.objects.filter(pk=worktop_id).count(), 0)


class HardwareBomTests(TestCase):
    def setUp(self):
        self.material = Material.objects.create(
            name="Agglo quin", thickness=19, price_per_m2=40, is_default=True
        )
        self.back = Material.objects.create(name="Fond quin", thickness=3, price_per_m2=9)
        self.cabinet = create_cabinet(
            name="Caisson quin", width=1000, height=720, depth=350,
            material=self.material, material_back=self.back,
        )
        self.service = CabinetDesignService(self.cabinet)
        self.hinge = HardwareRule.objects.filter(auto_mode="door_hinge").first()
        self.pins = HardwareRule.objects.filter(auto_mode="shelf").first()
        self.handle = HardwareRule.objects.filter(auto_mode="door").first()

    def test_auto_rules_catalog_seeded(self):
        self.assertTrue(HardwareRule.objects.filter(auto_mode="door_hinge").exists())
        self.assertTrue(HardwareRule.objects.filter(auto_mode="shelf").exists())
        self.assertTrue(HardwareRule.objects.filter(auto_mode="door").exists())
        self.assertTrue(HardwareRule.objects.filter(auto_mode="side").exists())
        self.assertTrue(HardwareRule.objects.filter(auto_mode="cabinet").exists())

    def test_hinge_quantity_follows_geometry(self):
        service = CabinetDesignService(self.cabinet)
        # pas de façades → aucune charnière
        self.assertEqual(service._hardware_quantity(self.hinge), 0.0)
        # façades activées : 2 portes × 2 charnières (hauteur 720 ≤ 900)
        service.update_cabinet({"has_doors": True})
        self.assertEqual(service._hardware_counts()["doors"], 2)
        self.assertEqual(service._hardware_quantity(self.hinge), 4.0)

    def test_shelf_pins_follow_shelf_count(self):
        from apps.furniture.models import InternalVolume
        self.service.split_volume(self.cabinet.root_volume.pk, "vertical", 0.5, "ratio")
        leaf = next(
            volume
            for volume in InternalVolume.objects.filter(cabinet=self.cabinet)
            if volume.is_leaf and not volume.is_root
        )
        self.service.add_shelf_series(volume_id=leaf.pk, count=3)
        counts = self.service._hardware_counts()
        self.assertEqual(counts["shelves"], 3)
        self.assertEqual(self.service._hardware_quantity(self.pins), 12.0)  # 4 tiges/étagère

    def test_hardware_lines_in_quote(self):
        self.service.update_cabinet({"has_doors": True})
        self.cabinet.hardware_rules.add(self.hinge, self.handle)
        from apps.quotes.models import QuoteLine
        self.service.rebuild()
        lines = QuoteLine.objects.filter(quote__cabinet=self.cabinet, is_hardware=True)
        # charnières (4) + poignées (2) ; pas d'étagère → pas de tiges
        self.assertEqual(lines.count(), 2)
        hinge_line = lines.get(description=self.hinge.name)
        self.assertEqual(hinge_line.quantity, 4)
        handle_line = lines.get(description=self.handle.name)
        self.assertEqual(handle_line.quantity, 2)

    def test_api_update_hardware(self):
        response = self.client.patch(
            reverse("poly:api_update_hardware", args=[self.cabinet.pk]),
            data='{"rule_ids": [%d]}' % self.hinge.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])
        self.assertEqual(self.cabinet.hardware_rules.count(), 1)


class BrandingTests(TestCase):
    def setUp(self):
        self.material = Material.objects.create(
            name="Agglo marque", thickness=19, price_per_m2=40, is_default=True
        )
        self.cabinet = create_cabinet(
            name="Caisson marque", width=900, height=700, depth=350,
            material=self.material,
        )

    def test_profile_is_singleton(self):
        from apps.furniture.models import CompanyProfile
        first = CompanyProfile.load()
        first.name = "Atelier A"
        first.save()
        again = CompanyProfile.load()
        self.assertEqual(first.pk, again.pk)
        self.assertEqual(again.name, "Atelier A")

    def test_branding_appears_in_pdfs(self):
        from apps.furniture.models import CompanyProfile
        from apps.furniture.pdf_export import build_cutlist_pdf
        import re, zlib, base64

        profile = CompanyProfile.load()
        profile.name = "Atelier Test PDF"
        profile.phone = "01 23 45 67 89"
        profile.save()

        response = build_cutlist_pdf(self.cabinet)
        self.assertTrue(response.content.startswith(b"%PDF"))
        data = response.content
        chunks = []
        for m in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
            raw = m.group(1).strip()
            try:
                if raw.endswith(b"~>"):
                    raw = base64.a85decode(raw, adobe=True)
                chunks.append(zlib.decompress(raw))
            except Exception:
                pass
        full = b"\n".join(chunks)
        self.assertIn(b"Atelier Test PDF", full)
        self.assertIn(b"01 23 45 67 89", full)

    def test_logo_of_the_catalogue_goes_in_the_pdf(self):
        import base64
        import io

        from PIL import Image

        from apps.furniture.models import CompanyProfile
        from apps.furniture.pdf_export import build_cutlist_pdf

        png = io.BytesIO()
        Image.new("RGB", (40, 20), (200, 30, 30)).save(png, format="PNG")
        profile = CompanyProfile.load()
        profile.name = "Atelier logo"
        profile.logo = "data:image/png;base64," + base64.b64encode(png.getvalue()).decode("ascii")
        profile.save()
        response = build_cutlist_pdf(self.cabinet)
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertIn(b"/Subtype /Image", response.content)


class CabinetTemplateTests(TestCase):
    def setUp(self):
        self.material = Material.objects.create(
            name="Agglo modele", thickness=19, price_per_m2=40, is_default=True
        )
        self.cabinet = create_cabinet(
            name="Caisson modele", width=1000, height=720, depth=350,
            material=self.material,
        )
        self.service = CabinetDesignService(self.cabinet)
        self.service.split_volume(self.cabinet.root_volume.pk, "vertical", 0.5, "ratio")
        from apps.furniture.models import InternalVolume
        leaf = next(
            v for v in InternalVolume.objects.filter(cabinet=self.cabinet)
            if v.is_leaf and not v.is_root
        )
        self.service.add_shelf_series(volume_id=leaf.pk, count=3)

    def _capture(self):
        from apps.furniture.history import capture_cabinet
        from apps.furniture.models import CabinetTemplate
        return CabinetTemplate.objects.create(
            name="Colonne 3 étagères",
            payload=capture_cabinet(self.cabinet),
            source_cabinet=self.cabinet,
        )

    def test_template_roundtrip_preserves_structure(self):
        template = self._capture()
        response = self.client.post(
            reverse("poly:template_instantiate", args=[template.pk]),
            {"name": "Copie test"},
        )
        self.assertEqual(response.status_code, 302)
        copy = Cabinet.objects.get(name="Copie test")
        self.assertEqual(
            copy.internal_volumes.count(), self.cabinet.internal_volumes.count()
        )
        self.assertEqual(
            copy.components.count(), self.cabinet.components.count()
        )
        self.assertEqual(float(copy.width), 1000.0)
        self.assertTrue(copy.panels.exists())
        self.assertTrue(Quote.objects.filter(cabinet=copy).exists())

    def test_template_instantiate_with_resize(self):
        template = self._capture()
        response = self.client.post(
            reverse("poly:template_instantiate", args=[template.pk]),
            {"name": "Copie large", "width": 1400, "height": 900},
        )
        self.assertEqual(response.status_code, 302)
        copy = Cabinet.objects.get(name="Copie large")
        self.assertEqual(float(copy.width), 1400.0)
        self.assertEqual(float(copy.height), 900.0)
        self.assertTrue(copy.panels.exists())

    def test_template_create_from_editor(self):
        response = self.client.post(
            reverse("poly:template_create", args=[self.cabinet.pk]),
            {"template_name": "Modèle éditeur", "template_description": "Test"},
        )
        self.assertEqual(response.status_code, 302)
        from apps.furniture.models import CabinetTemplate
        template = CabinetTemplate.objects.get(name="Modèle éditeur")
        self.assertIn("volumes", template.payload)

    def test_template_delete(self):
        template = self._capture()
        response = self.client.post(reverse("poly:template_delete", args=[template.pk]))
        self.assertEqual(response.status_code, 302)
        from apps.furniture.models import CabinetTemplate
        self.assertFalse(CabinetTemplate.objects.filter(pk=template.pk).exists())
        # le caisson source reste intact
        self.assertTrue(Cabinet.objects.filter(pk=self.cabinet.pk).exists())


class AuthTests(DjangoTestCase):
    """The workshop needs an account of poly_3D: pages send to its login page, the API answers 401 in JSON."""

    def setUp(self):
        self.user = get_user_model().objects.create_user("atelier", password="motdepasse123")

    def test_anonymous_is_sent_to_login(self):
        response = self.client.get(reverse("poly:home"))
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response["Location"].startswith("/accounts/login/?next=/poly/"))
        response = self.client.get("/poly/api/cabinets/999/scene/", HTTP_ACCEPT="application/json")
        self.assertEqual(response.status_code, 401)
        self.assertFalse(response.json()["ok"])

    def test_logged_in_user_gets_the_workshop(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse("poly:home"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "poly_3D")
        self.assertContains(response, "/projects/")

    def test_rest_of_the_site_is_unchanged(self):
        self.assertEqual(self.client.get("/accounts/login/").status_code, 200)
