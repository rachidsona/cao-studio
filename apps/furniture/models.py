from django.core.validators import MinValueValidator
from django.db import models

# The catalogue is shared with the editor (apps/catalog): materials, hardware rules, the workshop's profile.
from apps.catalog.models import CompanyProfile, HardwareRule, Material  # noqa: F401


class Cabinet(models.Model):
    """Caisson paramétrique : la racine du Scene Graph."""

    name = models.CharField(max_length=150)
    width = models.FloatField(validators=[MinValueValidator(50)], help_text="Largeur globale en mm")
    height = models.FloatField(validators=[MinValueValidator(50)], help_text="Hauteur globale en mm")
    depth = models.FloatField(validators=[MinValueValidator(50)], help_text="Profondeur globale en mm")

    material_carcase = models.ForeignKey(
        Material, on_delete=models.PROTECT, related_name="cabinets_carcase"
    )
    material_back = models.ForeignKey(
        Material,
        on_delete=models.PROTECT,
        related_name="cabinets_back",
        null=True,
        blank=True,
    )
    back_thickness_override = models.FloatField(
        null=True,
        blank=True,
        help_text="Épaisseur du fond en mm (vide = épaisseur de la matière)",
    )

    # Règles de fabrication
    back_in_groove = models.BooleanField(default=True)
    bottom_setback = models.FloatField(default=0, help_text="Jeu arrière en mm")
    shelf_side_clearance = models.FloatField(default=0.5, help_text="Jeu latéral des étagères en mm")
    waste_percent = models.FloatField(default=10, help_text="Chutes / débit en %")

    # Façades
    has_doors = models.BooleanField(default=False)
    door_thickness = models.FloatField(default=19, help_text="Épaisseur de façade en mm")
    door_gap = models.FloatField(default=2, help_text="Jeu de façade en mm")

    # Dressing
    has_hanging_rail = models.BooleanField(
        default=False, help_text="Tringle de penderie"
    )
    hanging_rail_height = models.FloatField(
        default=1800,
        validators=[MinValueValidator(0)],
        help_text="Hauteur de la tringle depuis le bas en mm",
    )

    # Tiroirs
    has_drawers = models.BooleanField(default=False, help_text="Façades tiroirs")
    drawer_count = models.PositiveIntegerField(
        default=2,
        validators=[MinValueValidator(1)],
        help_text="Nombre de tiroirs",
    )
    drawer_height = models.FloatField(
        default=200,
        validators=[MinValueValidator(20)],
        help_text="Hauteur d'une façade de tiroir en mm",
    )

    # Zones externes
    plinth_height = models.FloatField(default=100, help_text="Hauteur de plinthe par défaut")
    plinth_setback = models.FloatField(default=40, help_text="Retrait de plinthe (mm)")

    hardware_rules = models.ManyToManyField(HardwareRule, blank=True, related_name="cabinets")
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "name"]

    def __str__(self):
        return f"{self.name} ({self.width:g} × {self.height:g} × {self.depth:g} mm)"

    @property
    def thickness(self):
        return self.material_carcase.thickness

    @property
    def back_thickness(self):
        if not self.material_back:
            return 0.0
        if self.back_thickness_override is not None:
            return max(0.0, self.back_thickness_override)
        return self.material_back.thickness

    @property
    def internal_width(self):
        return max(0.0, self.width - 2 * self.thickness)

    @property
    def internal_height(self):
        return max(0.0, self.height - 2 * self.thickness)

    @property
    def internal_depth(self):
        return max(0.0, self.depth - self.back_thickness - self.bottom_setback)

    @property
    def root_volume(self):
        return self.internal_volumes.filter(is_root=True).first()

    @property
    def has_plinth(self):
        return self.external_zones.filter(zone_type="plinth").exists()


class InternalVolume(models.Model):
    """Volume interne. L'arbre des volumes EST le Scene Graph du caisson.

    Une division est portée par le volume parent :
      - ``split_direction`` : '' (feuille) | vertical | horizontal
      - ``split_mode`` : ratio (suit le redimensionnement) | absolute
      - ``split_ratio`` : position relative du centre du séparateur (0..1)
      - ``split_offset`` : position courante en mm depuis la gauche/le bas

    Les deux baies filles portent ``slot='a'`` et ``slot='b'``.
    """

    SPLIT_DIRECTIONS = (("vertical", "Verticale"), ("horizontal", "Horizontale"))
    SPLIT_MODES = (("ratio", "Proportionnelle"), ("absolute", "Cote fixe"))

    cabinet = models.ForeignKey(Cabinet, on_delete=models.CASCADE, related_name="internal_volumes")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    slot = models.CharField(max_length=1, blank=True, default="")

    # Coordonnées locales au caisson (mm)
    pos_x = models.FloatField(default=0)
    pos_y = models.FloatField(default=0)
    pos_z = models.FloatField(default=0)
    width = models.FloatField(validators=[MinValueValidator(1)])
    height = models.FloatField(validators=[MinValueValidator(1)])
    depth = models.FloatField(validators=[MinValueValidator(1)])

    is_root = models.BooleanField(default=False)
    locked = models.BooleanField(default=False)

    # Paramètres de division (uniquement sur le parent d'une séparation)
    split_direction = models.CharField(max_length=12, choices=SPLIT_DIRECTIONS, blank=True, default="")
    split_mode = models.CharField(max_length=10, choices=SPLIT_MODES, default="ratio")
    split_ratio = models.FloatField(default=0.5)
    split_offset = models.FloatField(default=0)
    # Une division horizontale peut être une étagère (qui découpe la baie en
    # deux baies) au lieu d'un simple séparateur horizontal.
    split_shelf = models.BooleanField(default=False)
    # Une division verticale peut être un « côté » : un panneau pleine hauteur
    # et pleine profondeur, aux mêmes cotes que les côtés gauche et droit.
    split_side = models.BooleanField(default=False)

    class Meta:
        ordering = ["parent_id", "slot", "id"]

    def __str__(self):
        suffix = "racine" if self.is_root else f"volume {self.pk}"
        return f"{suffix} {self.width:g}×{self.height:g}×{self.depth:g}"

    @property
    def is_leaf(self):
        return not self.split_direction or not self.children.exists()

    @property
    def split_axis_size(self):
        if self.split_direction == "vertical":
            return self.width
        if self.split_direction == "horizontal":
            return self.height
        return 0.0

    def as_dict(self):
        return {
            "id": self.pk,
            "parent_id": self.parent_id,
            "slot": self.slot,
            "x": round(self.pos_x, 2),
            "y": round(self.pos_y, 2),
            "z": round(self.pos_z, 2),
            "w": round(self.width, 2),
            "h": round(self.height, 2),
            "d": round(self.depth, 2),
            "is_root": self.is_root,
            "is_leaf": self.is_leaf,
            "locked": self.locked,
            "split": {
                "direction": self.split_direction,
                "shelf": self.split_shelf,
                "side": self.split_side,
                "mode": self.split_mode,
                "ratio": round(self.split_ratio, 4),
                "offset": round(self.split_offset, 2),
            }
            if self.split_direction
            else None,
        }


class Component(models.Model):
    """Composant interne : séparateur ou étagère.

    Un séparateur appartient au volume parent et matérialise sa division.
    Une étagère appartient à une baie feuille.
    """

    COMPONENT_TYPES = (
        ("divider_v", "Séparation"),
        ("divider_h", "Étagère"),
        ("shelf", "Étagère"),
        ("partition_v", "Séparation"),
    )
    OFFSET_MODES = (("absolute", "Cote depuis le bas"), ("ratio", "Proportionnel"))

    cabinet = models.ForeignKey(Cabinet, on_delete=models.CASCADE, related_name="components")
    volume = models.ForeignKey(InternalVolume, on_delete=models.CASCADE, related_name="components")
    component_type = models.CharField(max_length=20, choices=COMPONENT_TYPES)
    material = models.ForeignKey(Material, on_delete=models.PROTECT)

    # Une cloison partielle est bornée par deux étagères de la même baie.
    # Si l'une des étagères est supprimée, la cloison l'est aussi.
    partition_lower_shelf = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="partitions_above",
    )
    partition_upper_shelf = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="partitions_below",
    )

    # Une étagère de colonne est bornée par deux cloisons verticales.
    # None à gauche = côté gauche de la baie ; None à droite = côté droit.
    # Si une cloison limite est supprimée, l'étagère qui en dépend l'est aussi.
    shelf_left_partition = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="shelves_right_of",
        help_text="Cloison à gauche de l'étagère (null = côté gauche de la baie)",
    )
    shelf_right_partition = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="shelves_left_of",
        help_text="Cloison à droite de l'étagère (null = côté droit de la baie)",
    )

    # Placement exprimé en contraintes, pas en coordonnées absolues
    position_from_bottom = models.FloatField(default=0, help_text="Hauteur depuis le bas du volume (mm)")
    position_from_left = models.FloatField(default=0, help_text="Position depuis la gauche du volume (mm)")
    offset_mode = models.CharField(max_length=10, choices=OFFSET_MODES, default="absolute")
    ratio = models.FloatField(default=0.0, help_text="Position relative 0..1")
    depth_clearance_front = models.FloatField(default=0, help_text="Jeu avant (mm)")

    # Dimensions calculées (recalculées à chaque rebuild)
    width = models.FloatField(default=0)
    height = models.FloatField(default=0)
    depth = models.FloatField(default=0)

    edge_banding = models.CharField(max_length=100, blank=True, default="")
    fixed = models.BooleanField(default=False, help_text="Ne pas déplacer lors du recalcul")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["component_type", "position_from_bottom", "pk"]

    def __str__(self):
        return f"{self.get_component_type_display()} – {self.cabinet.name}"

    @property
    def is_shelf(self):
        return self.component_type == "shelf"

    @property
    def is_divider(self):
        return self.component_type in ("divider_v", "divider_h")

    @property
    def is_partition(self):
        return self.component_type == "partition_v"


class ExternalZone(models.Model):
    """Zone externe (plinthe, pied, socle) hors subdivision interne."""

    ZONE_TYPES = (
        ("plinth", "Plinthe"),
        ("foot", "Pied"),
        ("base", "Socle"),
        ("skirt", "Jupe"),
    )

    cabinet = models.ForeignKey(Cabinet, on_delete=models.CASCADE, related_name="external_zones")
    zone_type = models.CharField(max_length=20, choices=ZONE_TYPES)

    pos_x = models.FloatField(default=0)
    pos_y = models.FloatField(default=0)
    pos_z = models.FloatField(default=0)

    width = models.FloatField()
    height = models.FloatField()
    depth = models.FloatField()

    material = models.ForeignKey(Material, on_delete=models.PROTECT, null=True, blank=True)

    class Meta:
        ordering = ["zone_type", "pk"]

    def __str__(self):
        return f"{self.get_zone_type_display()} – {self.cabinet.name}"

    def as_dict(self):
        return {
            "id": self.pk,
            "type": self.zone_type,
            "x": round(self.pos_x, 2),
            "y": round(self.pos_y, 2),
            "z": round(self.pos_z, 2),
            "w": round(self.width, 2),
            "h": round(self.height, 2),
            "d": round(self.depth, 2),
        }


class Panel(models.Model):
    """Panneau unitaire de la liste de débit (généré, jamais saisi à la main)."""

    cabinet = models.ForeignKey(Cabinet, on_delete=models.CASCADE, related_name="panels")
    component = models.ForeignKey(
        Component,
        on_delete=models.CASCADE,
        related_name="panels",
        null=True,
        blank=True,
    )
    external_zone = models.ForeignKey(
        ExternalZone,
        on_delete=models.CASCADE,
        related_name="panels",
        null=True,
        blank=True,
    )

    name = models.CharField(max_length=100)
    material = models.ForeignKey(Material, on_delete=models.PROTECT)
    category = models.CharField(max_length=30, default="caisson")

    length = models.FloatField(help_text="Longueur en mm")
    width = models.FloatField(help_text="Largeur en mm")
    thickness = models.FloatField(help_text="Épaisseur en mm")

    edge_banding = models.CharField(max_length=150, blank=True, default="")
    quantity = models.IntegerField(default=1)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["category", "name", "length", "width"]

    def __str__(self):
        return f"{self.name} – {self.length:g}×{self.width:g}×{self.thickness:g}"

    @property
    def area_m2(self):
        return (self.length * self.width / 1_000_000.0) * self.quantity

    @property
    def unit_area_m2(self):
        return self.length * self.width / 1_000_000.0

    @property
    def cost(self):
        return self.area_m2 * self.material.price_per_m2

    def as_dict(self):
        return {
            "id": self.pk,
            "name": self.name,
            "material": self.material.name,
            "material_id": self.material_id,
            "category": self.category,
            "length": round(self.length, 1),
            "width": round(self.width, 1),
            "thickness": round(self.thickness, 1),
            "quantity": self.quantity,
            "area_m2": round(self.area_m2, 4),
            "cost": round(self.cost, 2),
            "edge_banding": self.edge_banding,
        }


class CarcassPanel(models.Model):
    """Panneau structurel du caisson (côté, dessous, dessus).

    Chaque panneau peut recevoir une matière et une épaisseur propres ; à
    défaut, il utilise la matière et l'épaisseur de carcasse du caisson.
    """

    SIDES = (
        ("left", "Côté gauche"),
        ("right", "Côté droit"),
        ("bottom", "Dessous"),
        ("top", "Dessus"),
    )

    cabinet = models.ForeignKey(Cabinet, on_delete=models.CASCADE, related_name="carcass_panels")
    side = models.CharField(max_length=10, choices=SIDES)
    material = models.ForeignKey(Material, on_delete=models.PROTECT, null=True, blank=True)
    thickness = models.FloatField(null=True, blank=True, help_text="Épaisseur en mm (vide = carcasse)")
    position = models.FloatField(default=0, help_text="Décalage vertical en mm (dessous/dessus)")

    class Meta:
        ordering = ["side"]
        unique_together = ("cabinet", "side")

    def __str__(self):
        return f"{self.get_side_display()} – {self.cabinet.name}"

    @property
    def effective_material(self):
        return self.material or self.cabinet.material_carcase

    @property
    def effective_thickness(self):
        return self.thickness if self.thickness is not None else self.cabinet.thickness

    def as_dict(self):
        return {
            "id": self.pk,
            "side": self.side,
            "name": self.get_side_display(),
            "material_id": self.effective_material.pk,
            "material": self.effective_material.name,
            "thickness": round(self.effective_thickness, 1),
            "position": round(self.position, 1),
        }


class CabinetHistory(models.Model):
    """Instantané d'un caisson pour les fonctions Annuler / Rétablir."""

    DIRECTIONS = (("undo", "Annuler"), ("redo", "Rétablir"))

    cabinet = models.ForeignKey(
        Cabinet, on_delete=models.CASCADE, related_name="history_entries"
    )
    direction = models.CharField(max_length=6, choices=DIRECTIONS)
    payload = models.JSONField()
    message = models.CharField(max_length=150, blank=True, default="")
    action = models.CharField(max_length=50, blank=True, default="")
    params = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.get_direction_display()} – {self.cabinet.name}"



class Project(models.Model):
    """Affaire : pièce (cuisine, dressing…) et caissons qui l'occupent.

    Le mode ``linear`` conserve l'ancien assemblage côte à côte (slot +
    offset_x). Le mode ``room`` utilise les coordonnées de placement des
    ``ProjectItem`` dans le plan de la pièce.
    """

    ROOM_KITCHEN = "kitchen"
    ROOM_DRESSING = "dressing"
    ROOM_OTHER = "other"
    ROOM_TYPE_CHOICES = (
        (ROOM_KITCHEN, "Cuisine"),
        (ROOM_DRESSING, "Dressing"),
        (ROOM_OTHER, "Autre pièce"),
    )
    PLACEMENT_LINEAR = "linear"
    PLACEMENT_ROOM = "room"
    PLACEMENT_CHOICES = (
        (PLACEMENT_LINEAR, "Linéaire (ancien mode)"),
        (PLACEMENT_ROOM, "Pièce 2D/3D"),
    )

    name = models.CharField(max_length=150)
    client_name = models.CharField(max_length=150, blank=True, default="Client")
    gap = models.FloatField(
        validators=[MinValueValidator(0)],
        default=0,
        help_text="Jeu entre les caissons en mm",
    )
    margin_percent = models.FloatField(default=30, help_text="Marge en %")
    tax_rate = models.FloatField(default=20, help_text="TVA en %")
    notes = models.TextField(blank=True)

    # --- Pièce (phase 1 cuisine / dressing) -------------------------
    room_type = models.CharField(
        max_length=20, choices=ROOM_TYPE_CHOICES, default=ROOM_KITCHEN
    )
    room_width = models.FloatField(
        validators=[MinValueValidator(500)],
        default=4000,
        help_text="Largeur de la pièce en mm",
    )
    room_depth = models.FloatField(
        validators=[MinValueValidator(500)],
        default=3000,
        help_text="Profondeur de la pièce en mm",
    )
    room_height = models.FloatField(
        validators=[MinValueValidator(500)],
        default=2500,
        help_text="Hauteur sous plafond en mm",
    )
    wall_thickness = models.FloatField(
        validators=[MinValueValidator(10)],
        default=100,
        help_text="Épaisseur par défaut des murs en mm",
    )
    worktop_thickness = models.FloatField(
        validators=[MinValueValidator(10)],
        default=38,
        help_text="Épaisseur du plan de travail en mm",
    )
    worktop_overhang = models.FloatField(
        validators=[MinValueValidator(0)],
        default=20,
        help_text="Débord du plan de travail devant et sur les côtés en mm",
    )
    worktop_color = models.CharField(
        max_length=20,
        default="#d9d2c5",
        help_text="Couleur d'affichage du plan de travail",
    )
    placement_mode = models.CharField(
        max_length=10, choices=PLACEMENT_CHOICES, default=PLACEMENT_LINEAR
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name



class RoomHistory(models.Model):
    """A step of the undo history of a room (the room as it was before a change, or before an undo)."""

    DIRECTIONS = (("undo", "Annuler"), ("redo", "Rétablir"))

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="room_history")
    direction = models.CharField(max_length=4, choices=DIRECTIONS, default="undo")
    label = models.CharField(max_length=200, blank=True, default="")
    payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

class ProjectItem(models.Model):
    """Un caisson positionné dans une affaire.

    ``slot`` / ``offset_x`` restent la source de vérité du mode linéaire.
    ``pos_x`` / ``pos_y`` / ``rotation`` / ``elevation`` servent au mode pièce.
    """

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="items"
    )
    cabinet = models.ForeignKey(
        Cabinet, on_delete=models.CASCADE, related_name="project_items"
    )
    slot = models.PositiveIntegerField(default=0)
    offset_x = models.FloatField(default=0, help_text="Position cumulée en mm")

    # --- Placement dans la pièce (mm et degrés) ---------------------
    pos_x = models.FloatField(default=0, help_text="Position X dans la pièce en mm")
    pos_y = models.FloatField(default=0, help_text="Position Y dans la pièce en mm")
    rotation = models.FloatField(default=0, help_text="Rotation dans le plan en degrés")
    elevation = models.FloatField(default=0, help_text="Élévation au-dessus du sol en mm")

    class Meta:
        ordering = ["slot", "id"]
        unique_together = [("project", "slot")]

    def __str__(self):
        return f"{self.project.name} · {self.cabinet.name}"


class RoomWall(models.Model):
    """Mur de la pièce, exprimé par son segment au sol (mm)."""

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="walls"
    )
    index = models.PositiveIntegerField(default=0)
    name = models.CharField(max_length=50, blank=True, default="")
    x1 = models.FloatField(default=0)
    y1 = models.FloatField(default=0)
    x2 = models.FloatField(default=0)
    y2 = models.FloatField(default=0)
    height = models.FloatField(validators=[MinValueValidator(100)], default=2500)
    thickness = models.FloatField(validators=[MinValueValidator(10)], default=100)

    class Meta:
        ordering = ["index", "id"]

    def __str__(self):
        return self.name or f"Mur {self.index + 1}"

    @property
    def length(self) -> float:
        return ((self.x2 - self.x1) ** 2 + (self.y2 - self.y1) ** 2) ** 0.5


class RoomOpening(models.Model):
    """Ouverture (porte, fenêtre, passage) percée dans un mur."""

    KIND_DOOR = "door"
    KIND_WINDOW = "window"
    KIND_PASSAGE = "passage"
    KIND_CHOICES = (
        (KIND_DOOR, "Porte"),
        (KIND_WINDOW, "Fenêtre"),
        (KIND_PASSAGE, "Passage"),
    )

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="openings"
    )
    wall = models.ForeignKey(
        RoomWall, on_delete=models.CASCADE, related_name="openings"
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_WINDOW)
    name = models.CharField(max_length=80, blank=True, default="")
    offset = models.FloatField(
        validators=[MinValueValidator(0)],
        default=0,
        help_text="Distance depuis le début du mur en mm",
    )
    width = models.FloatField(validators=[MinValueValidator(50)], default=900)
    height = models.FloatField(validators=[MinValueValidator(50)], default=1200)
    sill = models.FloatField(
        validators=[MinValueValidator(0)],
        default=900,
        help_text="Hauteur d'allège en mm",
    )

    class Meta:
        ordering = ["wall__index", "offset", "id"]

    def __str__(self):
        return self.name or f"{self.get_kind_display()} {self.width:g} mm"


class RoomAppliance(models.Model):
    """Appareil électroménager posé ou encastré dans la pièce.

    Les appareils sont des objets de premier ordre : ils participent au plan
    2D, à la 3D, aux contrôles ergonomiques et au devis, sans être des
    caissons. ``elevation`` permet de poser un évier ou une plaque sur le
    plan de travail, ou une hotte au-dessus de la plaque.
    """

    KIND_SINK = "sink"
    KIND_HOB = "hob"
    KIND_HOOD = "hood"
    KIND_OVEN = "oven"
    KIND_FRIDGE = "fridge"
    KIND_DISHWASHER = "dishwasher"
    KIND_MICROWAVE = "microwave"
    KIND_WASHING_MACHINE = "washing_machine"
    KIND_OTHER = "other"
    KIND_CHOICES = (
        (KIND_SINK, "Évier"),
        (KIND_HOB, "Plaque de cuisson"),
        (KIND_HOOD, "Hotte"),
        (KIND_OVEN, "Four"),
        (KIND_FRIDGE, "Réfrigérateur"),
        (KIND_DISHWASHER, "Lave-vaisselle"),
        (KIND_MICROWAVE, "Micro-ondes"),
        (KIND_WASHING_MACHINE, "Lave-linge"),
        (KIND_OTHER, "Autre appareil"),
    )
    # Appareils dont l'accès frontal doit rester dégagé.
    ACCESS_KINDS = (
        KIND_OVEN,
        KIND_FRIDGE,
        KIND_DISHWASHER,
        KIND_WASHING_MACHINE,
    )
    # Appareils qui se posent normalement sur le plan de travail.
    WORKTOP_KINDS = (KIND_SINK, KIND_HOB)

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="appliances"
    )
    kind = models.CharField(
        max_length=30, choices=KIND_CHOICES, default=KIND_OTHER
    )
    name = models.CharField(max_length=80, blank=True, default="")
    width = models.FloatField(validators=[MinValueValidator(50)], default=600)
    depth = models.FloatField(validators=[MinValueValidator(50)], default=560)
    height = models.FloatField(validators=[MinValueValidator(10)], default=600)

    pos_x = models.FloatField(default=0, help_text="Position X dans la pièce en mm")
    pos_y = models.FloatField(default=0, help_text="Position Y dans la pièce en mm")
    rotation = models.FloatField(default=0, help_text="Rotation dans le plan en degrés")
    elevation = models.FloatField(
        validators=[MinValueValidator(0)],
        default=0,
        help_text="Élévation au-dessus du sol en mm",
    )

    price = models.FloatField(validators=[MinValueValidator(0)], default=0)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["elevation", "id"]

    def __str__(self):
        return self.name or self.get_kind_display()


class RoomWorktop(models.Model):
    """Plan de travail indépendant, posé librement dans la pièce.

    Contrairement au plan déduit des caissons bas, un ``RoomWorktop`` ne suit
    pas les caissons : il est créé, déplacé et redimensionné manuellement
    (longueur, profondeur, épaisseur).
    """

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="worktops"
    )
    name = models.CharField(max_length=80, blank=True, default="Plan de travail")
    pos_x = models.FloatField(default=0, help_text="Position X dans la pièce en mm")
    pos_y = models.FloatField(default=0, help_text="Position Y dans la pièce en mm")
    width = models.FloatField(
        validators=[MinValueValidator(50)], default=1000, help_text="Longueur en mm"
    )
    depth = models.FloatField(
        validators=[MinValueValidator(50)], default=600, help_text="Profondeur en mm"
    )
    thickness = models.FloatField(
        validators=[MinValueValidator(10)], default=38, help_text="Épaisseur en mm"
    )
    rotation = models.FloatField(default=0, help_text="Rotation dans le plan en degrés")
    elevation = models.FloatField(
        validators=[MinValueValidator(0)], default=900, help_text="Hauteur du dessus en mm"
    )
    color = models.CharField(max_length=20, default="#d9d2c5")

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.name} ({self.width:g} × {self.depth:g} mm)"


class ProjectVersion(models.Model):
    """Instantané versionné d'une affaire (structure et placements)."""
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="versions"
    )
    name = models.CharField(max_length=150)
    note = models.CharField(max_length=250, blank=True, default="")
    payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.project.name} · {self.name}"


class CabinetTemplate(models.Model):
    """Modèle de caisson réutilisable (instantané + instanciation paramétrique)."""

    name = models.CharField(max_length=150)
    description = models.CharField(max_length=250, blank=True, default="")
    payload = models.JSONField()
    source_cabinet = models.ForeignKey(
        Cabinet,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"Modèle {self.name}"
