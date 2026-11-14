import uuid

from django.conf import settings
from django.db import models


class ProjectFolder(models.Model):
    """A folder of the home page, to sort one's projects (a client, a year, a kind of job): a project is in one or none."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="project_folders",
        verbose_name="propriétaire",
    )
    name = models.CharField("nom", max_length=80)
    created_at = models.DateTimeField("créé le", auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "dossier de projets"
        verbose_name_plural = "dossiers de projets"
        constraints = [models.UniqueConstraint(fields=["owner", "name"], name="unique_folder_name_per_owner")]

    def __str__(self) -> str:
        return self.name


class Project(models.Model):
    """A project of the editor, and its business: the client, where the job stands, its quote."""

    # Where the job stands, in order, then the one put aside.
    STATUS_CHOICES = [
        ("draft", "Esquisse"),
        ("quoted", "Devis envoyé"),
        ("accepted", "Accepté"),
        ("production", "En fabrication"),
        ("installed", "Posé"),
        ("lost", "Sans suite"),
    ]

    # The editor's space a project belongs to: it opens there; the other spaces open their own projects.
    SPACE_CHOICES = [("design", "Conception 3D"), ("kitchen", "Cuisine"), ("dressing", "Dressing")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cad_projects",
        verbose_name="propriétaire",
    )
    name = models.CharField("nom", max_length=120)
    created_at = models.DateTimeField("créé le", auto_now_add=True)
    updated_at = models.DateTimeField("modifié le", auto_now=True)
    current_version = models.PositiveIntegerField("version courante", default=0)
    space = models.CharField("espace", max_length=20, choices=SPACE_CHOICES, default="design")
    client_name = models.CharField("client", max_length=120, blank=True)
    client_phone = models.CharField("téléphone", max_length=40, blank=True)
    client_email = models.EmailField("e-mail", blank=True)
    client_address = models.TextField("adresse du chantier", blank=True)
    status = models.CharField("statut", max_length=20, choices=STATUS_CHOICES, default="draft")
    # The quote's total, as the editor last computed it (TTC); none before the first.
    price = models.DecimalField("montant TTC", max_digits=12, decimal_places=2, null=True, blank=True)
    install_date = models.DateField("pose prévue", null=True, blank=True)
    notes = models.TextField("notes", blank=True)
    # The folder of the home page it is sorted in; none by default, and none again when its folder is deleted.
    folder = models.ForeignKey(
        ProjectFolder, on_delete=models.SET_NULL, null=True, blank=True, related_name="projects", verbose_name="dossier"
    )
    # A small picture of the model (JPEG data URL), taken by the editor after a save: its card on the home page.
    thumbnail = models.TextField("aperçu", blank=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "projet"
        verbose_name_plural = "projets"
        indexes = [models.Index(fields=["owner", "-updated_at"])]

    def __str__(self) -> str:
        return self.name


class ProjectVersion(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="versions", verbose_name="projet"
    )
    number = models.PositiveIntegerField("numéro")
    document = models.JSONField("document")
    checksum = models.CharField("empreinte SHA-256", max_length=64)
    size_bytes = models.PositiveIntegerField("taille (octets)")
    message = models.CharField("message", max_length=200, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cad_project_versions",
        verbose_name="auteur",
    )
    created_at = models.DateTimeField("créée le", auto_now_add=True)

    class Meta:
        ordering = ["-number"]
        unique_together = [("project", "number")]
        verbose_name = "version de projet"
        verbose_name_plural = "versions de projet"

    def __str__(self) -> str:
        return f"{self.project} v{self.number}"


def _share_token() -> str:
    import secrets

    return secrets.token_urlsafe(18)


class ShareLink(models.Model):
    """A read-only link for a client: a 3D snapshot (GLB) of the model, its summary, and comments."""

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="share_links", verbose_name="projet"
    )
    token = models.CharField("jeton", max_length=40, unique=True, default=_share_token, editable=False)
    title = models.CharField("titre", max_length=120)
    summary = models.JSONField("résumé", default=dict, blank=True)
    model = models.BinaryField("modèle GLB")
    model_size = models.PositiveIntegerField("taille du modèle (octets)")
    allow_comments = models.BooleanField("commentaires permis", default=True)
    created_at = models.DateTimeField("créé le", auto_now_add=True)
    revoked_at = models.DateTimeField("révoqué le", null=True, blank=True)
    allow_accept = models.BooleanField("validation en ligne permise", default=False)
    accepted_at = models.DateTimeField("accepté le", null=True, blank=True)
    accepted_by = models.CharField("accepté par", max_length=80, blank=True)
    accepted_variant = models.CharField("variante acceptée", max_length=120, blank=True)
    accepted_price = models.FloatField("prix accepté", null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "lien client"
        verbose_name_plural = "liens client"

    def __str__(self) -> str:
        return f"{self.project} — {self.title}"


class Comment(models.Model):
    """A comment on a project, from a client on a share link or from the owner, optionally at a point of the model."""

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="comments", verbose_name="projet"
    )
    link = models.ForeignKey(
        ShareLink, on_delete=models.SET_NULL, null=True, blank=True, related_name="comments", verbose_name="lien"
    )
    author = models.CharField("auteur", max_length=80)
    body = models.TextField("message", max_length=2000)
    position = models.JSONField("point du modèle (mm)", null=True, blank=True)
    from_owner = models.BooleanField("du propriétaire", default=False)
    resolved = models.BooleanField("traité", default=False)
    created_at = models.DateTimeField("écrit le", auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "commentaire"
        verbose_name_plural = "commentaires"

    def __str__(self) -> str:
        return f"{self.author} : {self.body[:40]}"


class LibraryModule(models.Model):
    """A piece of furniture of one's own (a cabinet, a drawer, a column…), kept to be put again in any project.

    ``document`` is a whole valid document holding only the module's features (and the parameters, names and
    materials they use); ``thumbnail`` a small JPEG data URL taken in the view.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cad_library",
        verbose_name="propriétaire",
    )
    name = models.CharField("nom", max_length=120)
    document = models.JSONField("document")
    thumbnail = models.TextField("vignette", blank=True)
    created_at = models.DateTimeField("créé le", auto_now_add=True)

    class Meta:
        ordering = ["name", "-created_at"]
        verbose_name = "module de bibliothèque"
        verbose_name_plural = "modules de bibliothèque"

    def __str__(self) -> str:
        return self.name


class PartProgress(models.Model):
    """Where a piece of a project stands in the workshop (cut, edge-banded, drilled, assembled), set by scanning
    its label's QR code or in the editor; the piece is known by its name."""

    STEPS = [("cut", "Débitée"), ("banded", "Chantée"), ("drilled", "Percée"), ("assembled", "Montée")]

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="progress", verbose_name="projet"
    )
    part = models.CharField("pièce", max_length=200)
    step = models.CharField("étape", max_length=12, choices=STEPS)
    updated_at = models.DateTimeField("mis à jour le", auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="par",
    )

    class Meta:
        ordering = ["part"]
        unique_together = [("project", "part")]
        verbose_name = "avancement d'une pièce"
        verbose_name_plural = "avancement des pièces"

    def __str__(self) -> str:
        return f"{self.part} : {self.get_step_display()}"


class Offcut(models.Model):
    """A reusable offcut of the workshop's stock: placed first by the sheet layout, before new sheets."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cad_offcuts",
        verbose_name="propriétaire",
    )
    material = models.CharField("matière", max_length=80)
    thickness = models.FloatField("épaisseur (mm)")
    length = models.FloatField("longueur (mm)")
    width = models.FloatField("largeur (mm)")
    quantity = models.PositiveIntegerField("quantité", default=1)
    note = models.CharField("note", max_length=120, blank=True)
    created_at = models.DateTimeField("rangée le", auto_now_add=True)

    class Meta:
        ordering = ["material", "-thickness", "-length"]
        verbose_name = "chute"
        verbose_name_plural = "chutes"

    def __str__(self) -> str:
        return f"{self.material} {self.thickness:g} — {self.length:g} × {self.width:g}"


class BatchItem(models.Model):
    """A project put in the grouped production (as Polyboard's catalogue mode): its cut list and hardware as they were
    when it was added, made ``quantity`` times with the others."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cad_batch",
        verbose_name="propriétaire",
    )
    project = models.ForeignKey(
        Project, on_delete=models.SET_NULL, null=True, blank=True, related_name="+", verbose_name="projet"
    )
    name = models.CharField("nom", max_length=120)
    quantity = models.PositiveIntegerField("quantité", default=1)
    rows = models.JSONField("liste de débit")
    hardware = models.JSONField("quincaillerie", default=list, blank=True)
    updated_at = models.DateTimeField("mis à jour le", auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "projet en fabrication groupée"
        verbose_name_plural = "fabrication groupée"

    def __str__(self) -> str:
        return f"{self.name} × {self.quantity}"


class ShareVariant(models.Model):
    """A variant a client may choose on a share link (a configuration of the model): its own 3D model and price."""

    link = models.ForeignKey(ShareLink, on_delete=models.CASCADE, related_name="variants", verbose_name="lien")
    position = models.PositiveIntegerField("rang")
    name = models.CharField("nom", max_length=120)
    price = models.FloatField("prix TTC", null=True, blank=True)
    summary = models.JSONField("résumé", default=dict, blank=True)
    model = models.BinaryField("modèle GLB")
    model_size = models.PositiveIntegerField("taille du modèle (octets)")

    class Meta:
        ordering = ["position"]
        unique_together = [("link", "position")]
        verbose_name = "variante proposée"
        verbose_name_plural = "variantes proposées"

    def __str__(self) -> str:
        return f"{self.link} — {self.name}"


class KeptData(models.Model):
    """What one keeps for all one's projects (« Mes caissons », suppliers, rates…): kept by the server rather than
    by one browser only, so it follows the account to another computer (apps/projects/kept.py)."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cad_kept_data",
        verbose_name="propriétaire",
    )
    key = models.CharField("clé", max_length=60)
    value = models.TextField("valeur")
    updated_at = models.DateTimeField("modifiée le", auto_now=True)

    class Meta:
        ordering = ["key"]
        constraints = [models.UniqueConstraint(fields=["owner", "key"], name="kept_data_owner_key")]
        verbose_name = "donnée gardée"
        verbose_name_plural = "données gardées"

    def __str__(self) -> str:
        return f"{self.owner} — {self.key}"
