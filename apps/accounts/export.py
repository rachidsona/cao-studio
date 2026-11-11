"""Toutes les données d'un compte, dans un fichier ZIP (audit de sécurité du 10/11/2026, constat L10).

    compte.json                      le compte et la date de l'export
    projets.json                     chaque projet : fiche, client, versions (sans leur contenu), commentaires, pièces
                                     suivies à l'atelier, liens clients (sans jeton ni modèle 3D)
    projets/<nom>-<id>.cao.json      la dernière version de chaque projet, à rouvrir par « Importer › Projet natif »
    bibliotheque/<nom>-<id>.cao.json chaque module de la bibliothèque
    chutes.json, fabrication.json    le stock de chutes et la fabrication groupée

Les jetons des liens clients n'y sont pas : un ZIP égaré ne doit pas ouvrir les liens encore actifs.
"""
from __future__ import annotations

import json
import tempfile
import zipfile

from django.utils import timezone
from django.utils.text import slugify

from django.db.models import Prefetch

from apps.projects.models import BatchItem, LibraryModule, Offcut, Project, ProjectVersion


def _when(value) -> str | None:
    return value.isoformat() if value else None


def _file_name(name: str, key) -> str:
    # The names are typed by the user: a slug (no « / », no « .. ») and the id keep every path inside its folder.
    return f"{slugify(name)[:60] or 'sans-nom'}-{key}.cao.json"


def _project(project: Project) -> dict:
    return {
        "id": str(project.id),
        "nom": project.name,
        "espace": project.get_space_display(),
        "statut": project.get_status_display(),
        "créé le": _when(project.created_at),
        "modifié le": _when(project.updated_at),
        "montant TTC": str(project.price) if project.price is not None else None,
        "pose prévue": _when(project.install_date),
        "notes": project.notes,
        "client": {
            "nom": project.client_name,
            "téléphone": project.client_phone,
            "e-mail": project.client_email,
            "adresse": project.client_address,
        },
        "versions": [
            {"numéro": v.number, "le": _when(v.created_at), "message": v.message, "octets": v.size_bytes}
            for v in project.versions.all()
        ],
        "commentaires": [
            {
                "auteur": c.author, "message": c.body, "le": _when(c.created_at), "du propriétaire": c.from_owner,
                "traité": c.resolved, "point (mm)": c.position,
            }
            for c in project.comments.all()
        ],
        "atelier": [{"pièce": p.part, "étape": p.get_step_display(), "le": _when(p.updated_at)} for p in project.progress.all()],
        "liens clients": [
            {
                "titre": link.title, "créé le": _when(link.created_at), "révoqué le": _when(link.revoked_at),
                "accepté le": _when(link.accepted_at), "accepté par": link.accepted_by,
                "variante acceptée": link.accepted_variant, "prix accepté": link.accepted_price,
                "variantes": [{"nom": v.name, "prix TTC": v.price} for v in link.variants.all()],
            }
            for link in project.share_links.defer("model").all()
        ],
    }


def _json(data) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def account_zip(user):
    """A temporary file holding the ZIP of everything this account keeps, read from its start."""
    out = tempfile.TemporaryFile()
    # The history without its documents (up to 2 GB for an account): only the newest one is read, project by project.
    history = Prefetch("versions", queryset=ProjectVersion.objects.defer("document"))
    projects = Project.objects.filter(owner=user).prefetch_related(history, "comments", "progress")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("compte.json", _json({
            "nom": user.get_username(), "inscrit le": _when(user.date_joined), "exporté le": _when(timezone.now()),
        }))
        summaries = []
        for project in projects:
            summaries.append(_project(project))
            latest = ProjectVersion.objects.filter(project=project).order_by("-number").values_list("document", flat=True).first()
            if latest is not None:
                archive.writestr(f"projets/{_file_name(project.name, project.id)}", _json(latest))
        archive.writestr("projets.json", _json(summaries))
        for module in LibraryModule.objects.filter(owner=user):
            archive.writestr(f"bibliotheque/{_file_name(module.name, module.id)}", _json(module.document))
        archive.writestr("chutes.json", _json([
            {"matière": o.material, "épaisseur (mm)": o.thickness, "longueur (mm)": o.length, "largeur (mm)": o.width,
             "quantité": o.quantity, "note": o.note}
            for o in Offcut.objects.filter(owner=user)
        ]))
        archive.writestr("fabrication.json", _json([
            {"nom": b.name, "quantité": b.quantity, "liste de débit": b.rows, "quincaillerie": b.hardware}
            for b in BatchItem.objects.filter(owner=user)
        ]))
    out.seek(0)
    return out
