"""Jeu de données de démonstration poly_3D.

Utilisation :
    python manage.py seed_demo --reset

``--reset`` supprime tous les caissons existants (les matériaux et la
quincaillerie sont conservés).
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.furniture.models import Cabinet, HardwareRule, Material
from apps.furniture.services import CabinetDesignService, create_cabinet


class Command(BaseCommand):
    help = "Crée trois caissons de démonstration paramétriques"

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Supprime d'abord tous les caissons")

    def handle(self, *args, **options):
        material = Material.objects.filter(is_default=True).first() or Material.objects.first()
        if material is None:
            self.stderr.write(self.style.ERROR("Aucun matériau : lancez d'abord les migrations."))
            return
        back = (
            Material.objects.filter(thickness__lte=6).order_by("thickness").first()
            or Material.objects.filter(name__icontains="fond").first()
        )
        if options["reset"]:
            count = Cabinet.objects.count()
            Cabinet.objects.all().delete()
            self.stdout.write(f"{count} caisson(s) supprimé(s).")

        names = ["Bibliothèque atelier", "Meuble TV salon", "Meuble bas cuisine"]
        Cabinet.objects.filter(name__in=names).delete()

        bibliotheque = self._bibliotheque(material, back)
        tv = self._meuble_tv(material, back)
        cuisine = self._cuisine(material, back)

        for cabinet in (bibliotheque, tv, cuisine):
            self.stdout.write(
                self.style.SUCCESS(
                    f"✓ {cabinet.name} : {cabinet.internal_volumes.count()} volumes, "
                    f"{cabinet.components.filter(component_type='shelf').count()} étagères, "
                    f"{cabinet.panels.count()} panneaux, devis {cabinet.quote.total_ttc:.2f} € TTC."
                )
            )

    # ------------------------------------------------------------------
    def _bibliotheque(self, material, back):
        cabinet = create_cabinet(
            name="Bibliothèque atelier",
            width=1000,
            height=2000,
            depth=350,
            material=material,
            material_back=back,
            bottom_setback=0,
            plinth_height=100,
        )
        service = CabinetDesignService(cabinet)
        root = cabinet.root_volume
        service.split_volume(root.pk, "horizontal", 0.30, "ratio")
        bottom, top = list(cabinet.internal_volumes.filter(parent=root).order_by("slot"))
        service.add_shelf(bottom.pk, 250, "absolute")
        service.split_volume(top.pk, "vertical", 0.52, "ratio")
        top_left, top_right = list(cabinet.internal_volumes.filter(parent=top).order_by("slot"))
        for bay in (top_left, top_right):
            for height in (320, 700, 1080):
                service.add_shelf(bay.pk, height, "absolute")
        service.set_plinth(100, 15)
        service.update_cabinet({"waste_percent": 12})
        return cabinet

    def _meuble_tv(self, material, back):
        cabinet = create_cabinet(
            name="Meuble TV salon",
            width=1600,
            height=500,
            depth=400,
            material=material,
            material_back=back,
            bottom_setback=0,
            plinth_height=80,
        )
        service = CabinetDesignService(cabinet)
        root = cabinet.root_volume
        service.split_volume(root.pk, "vertical", 0.58, "ratio")
        left, right = list(cabinet.internal_volumes.filter(parent=root).order_by("slot"))
        service.split_volume(right.pk, "horizontal", 0.55, "ratio")
        right_bottom, right_top = list(cabinet.internal_volumes.filter(parent=right).order_by("slot"))
        service.add_shelf(left.pk, 180, "absolute")
        service.add_shelf(right_bottom.pk, 120, "absolute")
        service.add_shelf(right_top.pk, 120, "absolute")
        service.set_plinth(80, 20)
        service.update_cabinet({"waste_percent": 10})
        return cabinet

    def _cuisine(self, material, back):
        cabinet = create_cabinet(
            name="Meuble bas cuisine",
            width=800,
            height=720,
            depth=600,
            material=material,
            material_back=back,
            bottom_setback=0,
            plinth_height=100,
        )
        service = CabinetDesignService(cabinet)
        root = cabinet.root_volume
        service.split_volume(root.pk, "vertical", 0.5, "ratio")
        left, right = list(cabinet.internal_volumes.filter(parent=root).order_by("slot"))
        service.add_shelf(left.pk, 280, "absolute", depth_clearance_front=20)
        service.add_shelf(right.pk, 280, "absolute", depth_clearance_front=20)
        service.set_plinth(100, 10)
        service.update_cabinet({"has_doors": True, "door_gap": 2, "door_thickness": 19, "waste_percent": 10})
        hinge = HardwareRule.objects.filter(name__icontains="Charnière").first()
        handle = HardwareRule.objects.filter(name__icontains="Poignée").first()
        rules = [rule for rule in (hinge, handle) if rule]
        if rules:
            cabinet.hardware_rules.set(rules)
            service.rebuild()
        return cabinet
