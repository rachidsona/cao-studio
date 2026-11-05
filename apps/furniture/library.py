"""Bibliothèque de caissons cuisine et dressing (phase 1).

Les presets sont volontairement simples et paramétriques : ils créent un
caisson réel via ``create_cabinet`` puis ajoutent une série d'étagères. Ils
servent de point de départ ; chaque caisson reste ensuite éditable dans
l'éditeur paramétrique existant.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .models import Cabinet, Material
from .services import CabinetDesignService, create_cabinet

CATEGORY_KITCHEN = "kitchen"
CATEGORY_DRESSING = "dressing"

CATEGORY_LABELS = {
    CATEGORY_KITCHEN: "Cuisine",
    CATEGORY_DRESSING: "Dressing",
}

PRESETS: List[Dict] = [
    # --- Cuisine -----------------------------------------------------
    {
        "key": "kitchen-base-600",
        "category": CATEGORY_KITCHEN,
        "name": "Meuble bas 600",
        "description": "Carcasse 600 mm, façades, plinthe, une étagère.",
        "width": 600,
        "height": 720,
        "depth": 560,
        "has_doors": True,
        "plinth_height": 100,
        "default_elevation": 0,
        "shelves": 1,
        "badge": "Bas",
    },
    {
        "key": "kitchen-base-800",
        "category": CATEGORY_KITCHEN,
        "name": "Meuble bas 800",
        "description": "Carcasse 800 mm, façades, plinthe, une étagère.",
        "width": 800,
        "height": 720,
        "depth": 560,
        "has_doors": True,
        "plinth_height": 100,
        "default_elevation": 0,
        "shelves": 1,
        "badge": "Bas",
    },
    {
        "key": "kitchen-drawers-600",
        "category": CATEGORY_KITCHEN,
        "name": "Meuble bas tiroirs 600",
        "description": "Carcasse 600 mm avec façades, prête pour les tiroirs.",
        "width": 600,
        "height": 720,
        "depth": 560,
        "has_doors": False,
        "has_drawers": True,
        "drawer_count": 3,
        "drawer_height": 160,
        "plinth_height": 100,
        "default_elevation": 0,
        "shelves": 0,
        "badge": "Tiroirs",
    },
    {
        "key": "kitchen-sink-800",
        "category": CATEGORY_KITCHEN,
        "name": "Meuble évier 800",
        "description": "Carcasse ouverte sous évier, sans façade.",
        "width": 800,
        "height": 720,
        "depth": 560,
        "has_doors": False,
        "plinth_height": 100,
        "default_elevation": 0,
        "shelves": 0,
        "badge": "Évier",
    },
    {
        "key": "kitchen-wall-600",
        "category": CATEGORY_KITCHEN,
        "name": "Meuble haut 600",
        "description": "Meuble haut 600 × 720 × 350, deux étagères.",
        "width": 600,
        "height": 720,
        "depth": 350,
        "has_doors": True,
        "plinth_height": 0,
        "default_elevation": 1400,
        "shelves": 2,
        "badge": "Haut",
    },
    {
        "key": "kitchen-wall-800",
        "category": CATEGORY_KITCHEN,
        "name": "Meuble haut 800",
        "description": "Meuble haut 800 × 720 × 350, deux étagères.",
        "width": 800,
        "height": 720,
        "depth": 350,
        "has_doors": True,
        "plinth_height": 0,
        "default_elevation": 1400,
        "shelves": 2,
        "badge": "Haut",
    },
    {
        "key": "kitchen-tall-600",
        "category": CATEGORY_KITCHEN,
        "name": "Colonne 600",
        "description": "Colonne 600 × 2200 × 560, trois étagères.",
        "width": 600,
        "height": 2200,
        "depth": 560,
        "has_doors": True,
        "plinth_height": 100,
        "default_elevation": 0,
        "shelves": 3,
        "badge": "Colonne",
    },
    {
        "key": "kitchen-oven-600",
        "category": CATEGORY_KITCHEN,
        "name": "Colonne four 600",
        "description": "Colonne 600 × 2200 × 560, deux étagères.",
        "width": 600,
        "height": 2200,
        "depth": 560,
        "has_doors": True,
        "plinth_height": 100,
        "default_elevation": 0,
        "shelves": 2,
        "badge": "Four",
    },
    # --- Dressing ----------------------------------------------------
    {
        "key": "dressing-wardrobe-1000",
        "category": CATEGORY_DRESSING,
        "name": "Penderie 1000",
        "description": "Penderie 1000 × 2200 × 600, une étagère haute.",
        "width": 1000,
        "height": 2200,
        "depth": 600,
        "has_doors": True,
        "has_hanging_rail": True,
        "hanging_rail_height": 1800,
        "plinth_height": 0,
        "default_elevation": 0,
        "shelves": 1,
        "badge": "Penderie",
    },
    {
        "key": "dressing-wardrobe-1500",
        "category": CATEGORY_DRESSING,
        "name": "Penderie 1500",
        "description": "Penderie 1500 × 2200 × 600, une étagère haute.",
        "width": 1500,
        "height": 2200,
        "depth": 600,
        "has_doors": True,
        "has_hanging_rail": True,
        "hanging_rail_height": 1800,
        "plinth_height": 0,
        "default_elevation": 0,
        "shelves": 1,
        "badge": "Penderie",
    },
    {
        "key": "dressing-column-500",
        "category": CATEGORY_DRESSING,
        "name": "Colonne dressing 500",
        "description": "Colonne 500 × 2200 × 600, quatre étagères.",
        "width": 500,
        "height": 2200,
        "depth": 600,
        "has_doors": True,
        "plinth_height": 0,
        "default_elevation": 0,
        "shelves": 4,
        "badge": "Colonne",
    },
    {
        "key": "dressing-shoe-800",
        "category": CATEGORY_DRESSING,
        "name": "Meuble chaussures 800",
        "description": "Meuble 800 × 1200 × 350, quatre étagères.",
        "width": 800,
        "height": 1200,
        "depth": 350,
        "has_doors": True,
        "plinth_height": 0,
        "default_elevation": 0,
        "shelves": 4,
        "badge": "Chaussures",
    },
    {
        "key": "dressing-island-1200",
        "category": CATEGORY_DRESSING,
        "name": "Îlot dressing 1200",
        "description": "Îlot 1200 × 900 × 600 avec façades.",
        "width": 1200,
        "height": 900,
        "depth": 600,
        "has_doors": True,
        "plinth_height": 100,
        "default_elevation": 0,
        "shelves": 1,
        "badge": "Îlot",
    },
    {
        "key": "dressing-low-1000",
        "category": CATEGORY_DRESSING,
        "name": "Meuble bas dressing 1000",
        "description": "Meuble bas 1000 × 1000 × 600, deux étagères.",
        "width": 1000,
        "height": 1000,
        "depth": 600,
        "has_doors": True,
        "plinth_height": 100,
        "default_elevation": 0,
        "shelves": 2,
        "badge": "Bas",
    },
]

PRESETS_BY_KEY = {preset["key"]: preset for preset in PRESETS}

APPLIANCE_CATEGORY = "appliance"

APPLIANCE_PRESETS: List[Dict] = [
    {
        "key": "appliance-sink-600",
        "category": APPLIANCE_CATEGORY,
        "kind": "sink",
        "name": "Évier 600",
        "description": "Évier simple bac 600 mm, à poser sur le plan de travail.",
        "width": 600,
        "depth": 500,
        "height": 30,
        "default_elevation": None,
        "price": 240,
        "badge": "Évier",
    },
    {
        "key": "appliance-sink-800",
        "category": APPLIANCE_CATEGORY,
        "kind": "sink",
        "name": "Évier 800",
        "description": "Évier double bac 800 mm, à poser sur le plan de travail.",
        "width": 800,
        "depth": 500,
        "height": 30,
        "default_elevation": None,
        "price": 290,
        "badge": "Évier",
    },
    {
        "key": "appliance-hob-600",
        "category": APPLIANCE_CATEGORY,
        "kind": "hob",
        "name": "Plaque 600",
        "description": "Plaque de cuisson 600 mm, quatre foyers.",
        "width": 600,
        "depth": 520,
        "height": 60,
        "default_elevation": None,
        "price": 350,
        "badge": "Plaque",
    },
    {
        "key": "appliance-hob-800",
        "category": APPLIANCE_CATEGORY,
        "kind": "hob",
        "name": "Plaque 800",
        "description": "Plaque de cuisson 800 mm, cinq foyers.",
        "width": 800,
        "depth": 520,
        "height": 60,
        "default_elevation": None,
        "price": 450,
        "badge": "Plaque",
    },
    {
        "key": "appliance-hood-600",
        "category": APPLIANCE_CATEGORY,
        "kind": "hood",
        "name": "Hotte 600",
        "description": "Hotte murale 600 mm, à poser au-dessus de la plaque.",
        "width": 600,
        "depth": 500,
        "height": 120,
        "default_elevation": 1500,
        "price": 420,
        "badge": "Hotte",
    },
    {
        "key": "appliance-hood-900",
        "category": APPLIANCE_CATEGORY,
        "kind": "hood",
        "name": "Hotte 900",
        "description": "Hotte murale 900 mm, à poser au-dessus de la plaque.",
        "width": 900,
        "depth": 500,
        "height": 120,
        "default_elevation": 1500,
        "price": 620,
        "badge": "Hotte",
    },
    {
        "key": "appliance-oven-600",
        "category": APPLIANCE_CATEGORY,
        "kind": "oven",
        "name": "Four encastré 600",
        "description": "Four encastré 600 mm, à hauteur de colonne.",
        "width": 600,
        "depth": 560,
        "height": 600,
        "default_elevation": 800,
        "price": 550,
        "badge": "Four",
    },
    {
        "key": "appliance-fridge-600",
        "category": APPLIANCE_CATEGORY,
        "kind": "fridge",
        "name": "Réfrigérateur 600",
        "description": "Réfrigérateur combiné 600 mm, pose libre.",
        "width": 600,
        "depth": 650,
        "height": 1850,
        "default_elevation": 0,
        "price": 900,
        "badge": "Froid",
    },
    {
        "key": "appliance-fridge-700",
        "category": APPLIANCE_CATEGORY,
        "kind": "fridge",
        "name": "Réfrigérateur 700",
        "description": "Réfrigérateur combiné 700 mm, pose libre.",
        "width": 700,
        "depth": 700,
        "height": 1850,
        "default_elevation": 0,
        "price": 1100,
        "badge": "Froid",
    },
    {
        "key": "appliance-dishwasher-600",
        "category": APPLIANCE_CATEGORY,
        "kind": "dishwasher",
        "name": "Lave-vaisselle 600",
        "description": "Lave-vaisselle 600 mm, pose libre sous plan.",
        "width": 600,
        "depth": 560,
        "height": 820,
        "default_elevation": 0,
        "price": 650,
        "badge": "Lavage",
    },
    {
        "key": "appliance-microwave-500",
        "category": APPLIANCE_CATEGORY,
        "kind": "microwave",
        "name": "Micro-ondes 500",
        "description": "Micro-ondes 500 mm, à poser en hauteur.",
        "width": 500,
        "depth": 350,
        "height": 300,
        "default_elevation": 1400,
        "price": 200,
        "badge": "Micro-ondes",
    },
    {
        "key": "appliance-washing-machine-600",
        "category": APPLIANCE_CATEGORY,
        "kind": "washing_machine",
        "name": "Lave-linge 600",
        "description": "Lave-linge 600 mm, pose libre.",
        "width": 600,
        "depth": 600,
        "height": 850,
        "default_elevation": 0,
        "price": 700,
        "badge": "Lavage",
    },
]

APPLIANCE_PRESETS_BY_KEY = {
    preset["key"]: preset for preset in APPLIANCE_PRESETS
}


def get_preset(key: str) -> Optional[Dict]:
    return PRESETS_BY_KEY.get(key)


def get_appliance_preset(key: str) -> Optional[Dict]:
    return APPLIANCE_PRESETS_BY_KEY.get(key)


def preset_payload() -> List[Dict]:
    """Copie sérialisable des presets pour l'interface."""
    return [dict(preset) for preset in PRESETS]


def preset_groups() -> List[Dict]:
    """Les types de caissons par catégorie : Cuisine, puis Dressing."""
    return [
        {"label": label, "presets": [p for p in PRESETS if p["category"] == category]}
        for category, label in CATEGORY_LABELS.items()
    ]


def appliance_preset_payload() -> List[Dict]:
    """Copie sérialisable des appareils pour l'interface."""
    return [dict(preset) for preset in APPLIANCE_PRESETS]



def _default_materials() -> tuple[Material, Optional[Material]]:
    material = (
        Material.objects.filter(is_default=True).first()
        or Material.objects.order_by("thickness").first()
    )
    if material is None:
        raise ValueError("Aucun matériau disponible pour la bibliothèque.")
    back = (
        Material.objects.exclude(pk=material.pk)
        .filter(thickness__lte=6)
        .order_by("thickness")
        .first()
    )
    return material, back


def create_cabinet_from_preset(
    preset: Dict,
    name: Optional[str] = None,
    materials: Optional[tuple[Material, Optional[Material]]] = None,
) -> Cabinet:
    """Crée un caisson réel à partir d'un preset de la bibliothèque (matières données, ou celles par défaut)."""
    material, back = materials or _default_materials()
    cabinet = create_cabinet(
        name=name or preset["name"],
        width=float(preset["width"]),
        height=float(preset["height"]),
        depth=float(preset["depth"]),
        material=material,
        material_back=back,
        has_doors=bool(preset.get("has_doors")),
        has_hanging_rail=bool(preset.get("has_hanging_rail")),
        hanging_rail_height=float(preset.get("hanging_rail_height") or 1800),
        has_drawers=bool(preset.get("has_drawers")),
        drawer_count=int(preset.get("drawer_count") or 2),
        drawer_height=float(preset.get("drawer_height") or 200),
        plinth_height=float(preset.get("plinth_height") or 0),
        bottom_setback=float(preset.get("bottom_setback") or 0),
    )
    shelf_count = int(preset.get("shelves") or 0)
    if shelf_count > 0:
        root = cabinet.root_volume
        if root is not None:
            CabinetDesignService(cabinet).add_shelf_series(
                volume_id=root.pk, count=shelf_count
            )
    return cabinet
