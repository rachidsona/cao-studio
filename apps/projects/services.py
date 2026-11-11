"""Domain operations on projects, shared by the JSON API and the HTML pages.

Callers must pass documents that already passed ``validate_document``.
"""
from __future__ import annotations

from typing import Any

from django.db import transaction

from .models import Project, ProjectVersion
from .validation import canonical_json, compute_checksum


class VersionConflict(Exception):
    """The client edited an outdated version of the project."""

    def __init__(self, current_version: int):
        super().__init__(current_version)
        self.current_version = current_version


def _build_version(project, number, document, user, message) -> ProjectVersion:
    canonical = canonical_json(document)
    return ProjectVersion(
        project=project,
        number=number,
        document=document,
        checksum=compute_checksum(document),
        size_bytes=len(canonical.encode("utf-8")),
        message=message,
        created_by=user,
    )


@transaction.atomic
def create_project(owner, name: str, document: dict[str, Any], message: str = "", space: str = "design") -> tuple[Project, ProjectVersion]:
    project = Project.objects.create(owner=owner, name=name, current_version=1, space=space)
    version = _build_version(project, 1, document, owner, message or "Création")
    version.save()
    return project, version


def save_new_version(
    *,
    project_id,
    owner,
    document: dict[str, Any],
    base_version: int,
    name: str | None = None,
    message: str = "",
) -> tuple[Project, ProjectVersion]:
    """Append version N+1 with optimistic concurrency control.

    Raises ``Project.DoesNotExist`` if the project is missing or not owned by
    ``owner`` and ``VersionConflict`` if ``base_version`` is outdated.
    """
    with transaction.atomic():
        project = Project.objects.select_for_update().get(pk=project_id, owner=owner)
        if base_version != project.current_version:
            raise VersionConflict(project.current_version)
        # The same document as the last version (an autosave with nothing changed, a restored copy): no new version,
        # the history keeps only real changes (audit of 11/11/2026, 121 such copies measured).
        current = project.versions.filter(number=project.current_version).only("number", "checksum").first()
        if current is not None and current.checksum == compute_checksum(document):
            if name is not None and name != project.name:
                project.name = name
                project.save(update_fields=["name", "updated_at"])
            return project, project.versions.get(number=project.current_version)
        number = project.current_version + 1
        version = _build_version(project, number, document, owner, message)
        version.save()
        project.current_version = number
        update_fields = ["current_version", "updated_at"]
        if name is not None:
            project.name = name
            update_fields.append("name")
        project.save(update_fields=update_fields)
    return project, version


def get_current_version(project: Project) -> ProjectVersion:
    return project.versions.get(number=project.current_version)
