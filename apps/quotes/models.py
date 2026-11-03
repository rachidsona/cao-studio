from django.db import models

from apps.furniture.models import Cabinet, Material


class Quote(models.Model):
    """Devis synchronisé avec la liste de débit du caisson."""

    STATUS_CHOICES = (
        ("draft", "Brouillon"),
        ("sent", "Envoyé"),
        ("accepted", "Accepté"),
        ("rejected", "Refusé"),
    )

    cabinet = models.OneToOneField(Cabinet, on_delete=models.CASCADE, related_name="quote")
    client_name = models.CharField(max_length=200, default="Client")
    client_email = models.EmailField(blank=True)
    client_phone = models.CharField(max_length=50, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    margin_percent = models.FloatField(default=30, help_text="Marge en %")
    tax_rate = models.FloatField(default=20, help_text="TVA en %")

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"Devis {self.id} – {self.client_name}"

    @property
    def subtotal_materials(self):
        return sum(line.total for line in self.lines.filter(is_material=True))

    @property
    def subtotal_hardware(self):
        return sum(line.total for line in self.lines.filter(is_hardware=True))

    @property
    def total_ht(self):
        return self.subtotal_materials + self.subtotal_hardware

    @property
    def margin_amount(self):
        return self.total_ht * self.margin_percent / 100.0

    @property
    def total_before_tax(self):
        return self.total_ht + self.margin_amount

    @property
    def tax_amount(self):
        return self.total_before_tax * self.tax_rate / 100.0

    @property
    def total_ttc(self):
        return self.total_before_tax + self.tax_amount


class QuoteLine(models.Model):
    """Ligne de devis (matière ou quincaillerie)."""

    quote = models.ForeignKey(Quote, on_delete=models.CASCADE, related_name="lines")
    description = models.CharField(max_length=200)
    material = models.ForeignKey(Material, on_delete=models.PROTECT, null=True, blank=True)

    quantity = models.FloatField(default=1)
    unit = models.CharField(max_length=20, default="u")
    unit_price = models.FloatField(default=0)

    is_material = models.BooleanField(default=True)
    is_hardware = models.BooleanField(default=False)

    class Meta:
        ordering = ["is_hardware", "pk"]

    def __str__(self):
        return f"{self.description} × {self.quantity:g}"

    @property
    def total(self):
        return self.quantity * self.unit_price
