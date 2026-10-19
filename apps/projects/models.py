import uuid

from django.conf import settings
from django.db import models


class Project(models.Model):
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
