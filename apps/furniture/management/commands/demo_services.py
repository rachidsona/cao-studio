"""Crée un caisson de démonstration via le service applicatif."""
from django.core.management.base import BaseCommand

from apps.furniture.models import Cabinet, Material
from apps.furniture.services import CabinetDesignService, create_cabinet


class Command(BaseCommand):
    help = "Crée un caisson de démonstration (base de données)"

    def handle(self, *args, **options):
        material = Material.objects.filter(is_default=True).first() or Material.objects.first()
        if material is None:
            self.stderr.write(self.style.ERROR("Aucun matériau. Lancez les migrations."))
            return
        back = (
            Material.objects.filter(thickness__lte=6).first()
            or Material.objects.filter(name__icontains="fond").first()
        )
        Cabinet.objects.filter(name="Meuble TV Démo").delete()
        cabinet = create_cabinet(
            name="Meuble TV Démo",
            width=1600,
            height=500,
            depth=400,
            material=material,
            material_back=back,
            bottom_setback=0,
        )
        service = CabinetDesignService(cabinet)
        root = cabinet.root_volume
        result = service.split_volume(root.pk, "vertical", 0.56, "ratio")
        children = list(cabinet.internal_volumes.filter(parent=root).order_by("slot"))
        if len(children) == 2:
            service.add_shelf(children[0].pk, 180, "absolute")
            service.add_shelf(children[1].pk, 180, "absolute")
            service.add_shelf(children[1].pk, 330, "absolute")
        self.stdout.write(
            self.style.SUCCESS(
                f"Caisson « {cabinet.name} » créé : {cabinet.panels.count()} panneaux, "
                f"{cabinet.components.count()} composants, devis {cabinet.quote.total_ttc:.2f} € TTC."
            )
        )
