"""Sauvegarde de la base : une copie datée, faite sans arrêter le serveur, et les plus anciennes effacées.

Tout est dans la base (les projets, leurs versions, leurs images et modèles 3D, les comptes, le catalogue) : une copie
de la base suffit. SQLite est copiée par son API de sauvegarde (une copie cohérente même pendant une écriture) ;
PostgreSQL par `pg_dump`. Les copies vont dans BACKUP_DIR (DJANGO_BACKUP_DIR : un dossier synchronisé, iCloud Drive
ou autre, les met hors de cet ordinateur), nommées `cao-AAAA-MM-JJ-HHMMSS.sqlite3` (ou `.sql`) ; on en garde
BACKUP_KEEP. `maybe_backup` en fait une si la dernière a plus d'un jour : le middleware l'appelle, en arrière-plan.
"""
from __future__ import annotations

import logging
import os
import re
import sqlite3
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path

from django.conf import settings

log = logging.getLogger(__name__)

NAME = re.compile(r"^cao-\d{4}-\d{2}-\d{2}-\d{6}\.(sqlite3|sql)$")
DAY = 24 * 3600


def database(alias: str = "default") -> dict:
    """The settings of the database copied."""
    return settings.DATABASES[alias]


def backup_dir() -> Path:
    return Path(settings.BACKUP_DIR)


def backups(folder: Path | None = None) -> list[Path]:
    """The copies made, the oldest first."""
    folder = folder or backup_dir()
    if not folder.is_dir():
        return []
    return sorted(p for p in folder.iterdir() if p.is_file() and NAME.match(p.name))


def backup_database(folder: Path | None = None, keep: int | None = None, alias: str = "default") -> Path:
    """A dated copy of the database in `folder`; the oldest beyond `keep` deleted. Returns the copy."""
    folder = folder or backup_dir()
    keep = settings.BACKUP_KEEP if keep is None else keep
    folder.mkdir(parents=True, exist_ok=True)
    db = database(alias)
    stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    if db["ENGINE"].endswith("sqlite3"):
        target = folder / f"cao-{stamp}.sqlite3"
        partial = target.with_suffix(".partiel")
        source = sqlite3.connect(f"file:{db['NAME']}?mode=ro", uri=True)
        try:
            copy = sqlite3.connect(partial)
            try:
                source.backup(copy)
            finally:
                copy.close()
        finally:
            source.close()
    elif db["ENGINE"].endswith("postgresql"):
        target = folder / f"cao-{stamp}.sql"
        partial = target.with_suffix(".partiel")
        env = {**os.environ, "PGPASSWORD": db.get("PASSWORD", "")}
        args = ["pg_dump", "--no-owner", "-h", db.get("HOST") or "localhost", "-p", str(db.get("PORT") or 5432), "-U", db.get("USER", ""), "-f", str(partial), db["NAME"]]
        subprocess.run(args, env=env, check=True, capture_output=True, timeout=600)
    else:
        raise ValueError(f"Base non prise en charge : {db['ENGINE']}")
    # Named only once whole: a copy cut short is never taken for a good one.
    partial.rename(target)
    for old in backups(folder)[: max(0, len(backups(folder)) - max(1, keep))]:
        old.unlink()
    return target


_lock = threading.Lock()
_checked = 0.0


def due(folder: Path | None = None, now: float | None = None) -> bool:
    """Whether the last copy is more than a day old (or there is none)."""
    made = backups(folder)
    return not made or (now or time.time()) - made[-1].stat().st_mtime > DAY


def maybe_backup() -> bool:
    """A copy in the background if one is due; looked at once an hour at most. Whether one was started."""
    global _checked
    if not settings.BACKUP_AUTO or time.time() - _checked < 3600 or not _lock.acquire(blocking=False):
        return False
    _checked = time.time()
    if not due():
        _lock.release()
        return False

    def run():
        try:
            log.info("Sauvegarde de la base : %s", backup_database())
        except Exception:  # noqa: BLE001 - a failed copy is logged, the site goes on
            log.exception("La sauvegarde de la base a échoué")
        finally:
            _lock.release()

    threading.Thread(target=run, name="sauvegarde", daemon=True).start()
    return True


class DailyBackupMiddleware:
    """Starts the day's copy of the database, in the background, on the first request after it is due."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        maybe_backup()
        return self.get_response(request)
