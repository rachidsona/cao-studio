"""Le catalogue de départ, repris de poly_3D : 23 matières (caisson, fonds, plans de travail en marbre, quartz,
granit, inox, verre, bois, stratifiés, laqués) et 9 règles de quincaillerie (5 automatiques), et le profil."""
from django.db import migrations

MATERIALS = [
    # (nom, épaisseur, prix/m², couleur, famille, largeur plaque, longueur plaque, par défaut)
    ("Aggloméré blanc 19 mm", 19, 42, "#efe6d8", "melamine", 2800, 2070, True),
    ("MDF laqué 19 mm", 19, 65, "#cfd8dc", "solid", 2800, 2070, False),
    ("Chêne clair 19 mm", 19, 78, "#c89f6d", "wood", 2800, 2070, False),
    ("Fond HDF 3 mm", 3, 12, "#b08968", "solid", 2800, 2070, False),
    ("Latté chêne mélaminé 18 mm", 18, 290, "#e9dcc3", "wood", 2500, 1220, False),
    ("Marbre de Carrare", 20, 320, "#f2f1ec", "marble", 2800, 2070, False),
    ("Marbre noir", 20, 380, "#1b1b1d", "marble", 2800, 2070, False),
    ("Marbre vert Alpi", 20, 360, "#2e4a3a", "marble", 2800, 2070, False),
    ("Quartz blanc", 20, 260, "#f5f2ec", "stone", 2800, 2070, False),
    ("Granit noir Zimbabwe", 20, 300, "#2a2a2c", "stone", 2800, 2070, False),
    ("Inox brossé", 12, 220, "#c6cbd1", "metal", 2800, 2070, False),
    ("Aluminium laqué", 8, 190, "#aeb4ba", "metal", 2800, 2070, False),
    ("Verre transparent", 6, 150, "#d7e4e8", "glass", 2800, 2070, False),
    ("Verre fumé", 6, 160, "#7f878c", "glass", 2800, 2070, False),
    ("Noyer américain", 19, 210, "#5a3a24", "wood", 2800, 2070, False),
    ("Hêtre naturel", 19, 120, "#d8b98a", "wood", 2800, 2070, False),
    ("Chêne doré", 19, 140, "#c89f6d", "wood", 2800, 2070, False),
    ("Béton ciré", 19, 95, "#b6b2a9", "laminate", 2800, 2070, False),
    ("Terrazzo clair", 19, 130, "#e7e1d6", "laminate", 2800, 2070, False),
    ("Blanc laqué brillant", 19, 110, "#ffffff", "solid", 2800, 2070, False),
    ("Noir mat", 19, 120, "#202224", "solid", 2800, 2070, False),
    ("Bleu canard laqué", 19, 150, "#1f4e5f", "solid", 2800, 2070, False),
    ("Vert sauge mat", 19, 130, "#8a9a84", "solid", 2800, 2070, False),
]

HARDWARE = [
    # (nom, description, unité, prix, quantité par défaut, mode automatique, quantité par unité)
    ("Charnière à clipser", "Charnière européenne 35 mm, réglable 3D.", "u", 2.5, 4, "", 1),
    ("Coulisse à billes 450 mm", "Coulisse télescopique, charge 35 kg.", "paire", 18, 1, "", 1),
    ("Poignée aluminium", "Entraxe 128 mm.", "u", 4.2, 2, "", 1),
    ("Pied réglable", "Pied à visser, réglage ±15 mm.", "u", 3.4, 4, "", 1),
    ("Charnière à clip 35 mm", "Charnières comptées selon la hauteur des portes.", "u", 1.2, 1, "door_hinge", 1),
    ("Tige d'étagère", "4 tiges par étagère.", "u", 0.08, 1, "shelf", 4),
    ("Poignée de façade", "", "u", 4.5, 1, "door", 1),
    ("Excentrique minifix", "8 excentriques par côté ou cloison.", "u", 0.15, 1, "side", 8),
    ("Visserie et chevilles (lot par caisson)", "", "lot", 2, 1, "cabinet", 1),
]


def seed(apps, schema_editor):
    Material = apps.get_model("catalog", "Material")
    HardwareRule = apps.get_model("catalog", "HardwareRule")
    CompanyProfile = apps.get_model("catalog", "CompanyProfile")
    for name, thickness, price, color, category, width, length, default in MATERIALS:
        Material.objects.get_or_create(
            name=name,
            defaults={"thickness": thickness, "price_per_m2": price, "color": color, "category": category, "sheet_width": width, "sheet_length": length, "is_default": default},
        )
    for name, description, unit, price, quantity, mode, per_unit in HARDWARE:
        HardwareRule.objects.get_or_create(
            name=name,
            defaults={"description": description, "unit": unit, "unit_price": price, "default_quantity": quantity, "auto_mode": mode, "auto_per_unit": per_unit},
        )
    CompanyProfile.objects.get_or_create(pk=1, defaults={"name": "Mon atelier"})


def unseed(apps, schema_editor):
    apps.get_model("catalog", "Material").objects.filter(name__in=[m[0] for m in MATERIALS]).delete()
    apps.get_model("catalog", "HardwareRule").objects.filter(name__in=[h[0] for h in HARDWARE]).delete()


class Migration(migrations.Migration):
    dependencies = [("catalog", "0001_initial")]
    operations = [migrations.RunPython(seed, unseed)]
