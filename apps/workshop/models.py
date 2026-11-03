from django.db import models

from apps.furniture.models import Cabinet, Panel


class CutList(models.Model):
    """Liste de débit synchronisée avec les panneaux du caisson."""

    cabinet = models.OneToOneField(Cabinet, on_delete=models.CASCADE, related_name="cut_list")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    optimized = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"Liste de débit – {self.cabinet.name}"


class CutListItem(models.Model):
    """Ligne de liste de débit rattachée à un panneau généré."""

    cut_list = models.ForeignKey(CutList, on_delete=models.CASCADE, related_name="items")
    panel = models.ForeignKey(Panel, on_delete=models.CASCADE, related_name="cutlist_items")

    sheet_group = models.CharField(max_length=50, blank=True)
    placed = models.BooleanField(default=False)
    priority = models.IntegerField(default=0)

    class Meta:
        ordering = ["panel__category", "panel__name"]

    def __str__(self):
        return self.panel.name
