"""Démonstration en ligne de commande du moteur (sans base de données)."""
from django.core.management.base import BaseCommand

from apps.furniture.engine import (
    AABB,
    ParametricSolver,
    ShelfPlacement,
    ShelfTool,
    Vec3,
    VolumeNode,
    VolumetricDivider,
)
from apps.furniture.engine.cutlist import build_cutlist


class Command(BaseCommand):
    help = "Démonstration de la décomposition volumétrique et de la cut-list"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("=== poly_3D — moteur paramétrique ===\n"))
        solver = ParametricSolver(panel_thickness=19)
        metrics = solver.recompute_cabinet(
            {"width": 1000, "height": 720, "depth": 350, "thickness": 19, "back_thickness": 3}
        )
        self.stdout.write(
            f"Volume interne : {metrics['internal_width']} × {metrics['internal_height']} "
            f"× {metrics['internal_depth']} mm\n"
        )

        root = VolumeNode(
            cabinet_id="demo",
            bbox=AABB(
                Vec3(19, 19, 3),
                Vec3(metrics["internal_width"], metrics["internal_height"], metrics["internal_depth"]),
            ),
            meta={"material_carcase_id": "1"},
        )
        divider = VolumetricDivider(panel_thickness=19, min_bay=100)
        division = divider.split_vertical(root, 520)
        self.stdout.write(
            self.style.SUCCESS(
                f"Division verticale : séparateur à {division.offset:.1f} mm, "
                f"baies {division.children[0].bbox.width:.1f} / {division.children[1].bbox.width:.1f} mm"
            )
        )

        shelf_tool = ShelfTool(panel_thickness=19)
        shelf, _ = shelf_tool.place_shelf(
            division.children[0],
            ShelfPlacement(volume_id=division.children[0].id, height_from_bottom=250),
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Étagère : {shelf.bbox.width:.1f} × {shelf.bbox.depth:.1f} × {shelf.bbox.height:.1f} mm "
                "(longueur automatique)"
            )
        )

        cutlist = build_cutlist(
            division.panels + [shelf_tool.panel_for(shelf, "1")],
            {"1": 42.0},
            {"1": "Aggloméré blanc 19 mm"},
            waste_percent=10,
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Cut-list : {len(cutlist['items'])} éléments, "
                f"{cutlist['total_area_m2']} m², {cutlist['total_cost']} €"
            )
        )
        self.stdout.write(self.style.SUCCESS("\n=== Fin de la démonstration ==="))
