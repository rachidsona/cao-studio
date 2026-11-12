"""Catalogue de l'atelier, géré dans l'administration : les matières (famille, format de plaque,
prix au m²), les règles de quincaillerie à quantité automatique, et le profil de l'atelier (l'en-tête des documents
imprimés). L'éditeur le lit en JSON (api.py) et le mêle à ses matières intégrées."""
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Material(models.Model):
    """Une matière du catalogue : panneau, fond ou façade."""

    CATEGORIES = (
        ("melamine", "Mélaminé"),
        ("wood", "Bois"),
        ("glass", "Vitre / verre"),
        ("marble", "Marbre"),
        ("stone", "Pierre / quartz"),
        ("metal", "Métal / inox"),
        ("laminate", "Stratifié"),
        ("solid", "Uni / laqué"),
    )

    name = models.CharField("nom", max_length=100, unique=True)
    thickness = models.FloatField("épaisseur (mm)", validators=[MinValueValidator(0.1)])
    price_per_m2 = models.FloatField("prix au m² (MAD HT)", validators=[MinValueValidator(0)], default=0)
    color = models.CharField("couleur d'affichage", max_length=20, default="#ffffff", help_text="Hexadécimal, par exemple #c89f6d.")
    category = models.CharField("famille", max_length=20, choices=CATEGORIES, default="solid")
    sheet_width = models.FloatField("largeur de plaque (mm)", validators=[MinValueValidator(100)], default=2800)
    sheet_length = models.FloatField("longueur de plaque (mm)", validators=[MinValueValidator(100)], default=2070)
    is_default = models.BooleanField("matière par défaut", default=False)

    class Meta:
        ordering = ["name"]
        verbose_name = "matière"
        verbose_name_plural = "matières"

    def __str__(self):
        return f"{self.name} ({self.thickness:g} mm)"


class HardwareRule(models.Model):
    """Un article de quincaillerie et la règle qui en compte la quantité d'après le meuble."""

    AUTO_MODES = (
        ("", "Manuelle (prix seulement)"),
        ("cabinet", "Par caisson"),
        ("door", "Par porte"),
        ("door_hinge", "Charnières par porte (selon sa hauteur)"),
        ("shelf", "Par étagère"),
        ("niche", "Par niche"),
        ("side", "Par côté ou cloison"),
    )

    name = models.CharField("nom", max_length=100, unique=True)
    description = models.TextField("description", blank=True)
    unit = models.CharField("unité", max_length=30, default="u")
    unit_price = models.FloatField("prix unitaire (MAD HT)", validators=[MinValueValidator(0)], default=0)
    default_quantity = models.FloatField("quantité par défaut", validators=[MinValueValidator(0)], default=1)
    auto_mode = models.CharField("quantité automatique", max_length=20, blank=True, default="", choices=AUTO_MODES)
    auto_per_unit = models.FloatField(
        "quantité par unité", validators=[MinValueValidator(0)], default=1, help_text="Par caisson, porte, étagère, niche ou côté."
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "règle de quincaillerie"
        verbose_name_plural = "règles de quincaillerie"

    def __str__(self):
        return self.name


class CompanyProfile(models.Model):
    """Le profil de l'atelier (un seul) : l'en-tête des documents imprimés (devis, liste de débit, calepinage…) et les
    tarifs du devis (chutes, chant, découpe, montage, taux horaire, marge, TVA)."""

    name = models.CharField("nom", max_length=150, default="Mon atelier")
    slogan = models.CharField("slogan", max_length=200, blank=True, default="")
    address = models.CharField("adresse", max_length=250, blank=True, default="")
    phone = models.CharField("téléphone", max_length=50, blank=True, default="")
    email = models.EmailField("e-mail", blank=True, default="")
    website = models.CharField("site web", max_length=150, blank=True, default="")
    logo = models.TextField("logo", blank=True, default="", help_text="Image PNG ou JPEG en data URL (200 ko au plus).")
    # The rates of the quote, the same on every computer (the boards and the hardware: their own prices), in dirhams (MAD).
    waste = models.FloatField("chutes (%)", default=15, validators=[MinValueValidator(0), MaxValueValidator(90)], help_text="Part des plaques perdue en chutes.")
    band = models.FloatField("chant collé (MAD HT le mètre)", default=16.2, validators=[MinValueValidator(0)])
    cut_per_part = models.FloatField("découpe et perçage (MAD HT la pièce)", default=43.2, validators=[MinValueValidator(0)])
    hours_per_part = models.FloatField("montage (heures par pièce)", default=0.25, validators=[MinValueValidator(0)])
    hourly = models.FloatField("taux horaire (MAD HT)", default=486, validators=[MinValueValidator(0)])
    per_hole = models.FloatField("trou percé (MAD HT, 0 : compris dans la découpe)", default=0, validators=[MinValueValidator(0)])
    margin = models.FloatField("marge (%)", default=30, validators=[MinValueValidator(0), MaxValueValidator(500)])
    vat = models.FloatField("TVA (%)", default=20, validators=[MinValueValidator(0), MaxValueValidator(100)])
    updated_at = models.DateTimeField("mis à jour le", auto_now=True)

    #: The rates, by the editor's names (document/quote.ts, QuoteRates).
    RATES = {"waste": "waste", "band": "band", "cut_per_part": "cutPerPart", "hours_per_part": "hoursPerPart", "hourly": "hourly", "per_hole": "perHole", "margin": "margin", "vat": "vat"}

    class Meta:
        verbose_name = "profil de l'atelier"
        verbose_name_plural = "profil de l'atelier"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "CompanyProfile":
        profile, _ = cls.objects.get_or_create(pk=1)
        return profile
