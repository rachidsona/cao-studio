"""Sauvegarde de la base : une copie lisible et complète, les plus anciennes effacées, et la copie du jour en
arrière-plan seulement quand elle est due."""
import os
import sqlite3
import time

import pytest
from django.core.management import call_command

from apps.projects import backup


@pytest.fixture
def source(tmp_path, settings, monkeypatch):
    db = tmp_path / "base.sqlite3"
    con = sqlite3.connect(db)
    con.execute("create table projet (nom text)")
    con.executemany("insert into projet values (?)", [("dressing",), ("cuisine",)])
    con.commit()
    con.close()
    monkeypatch.setattr(backup, "database", lambda alias="default": {"ENGINE": "django.db.backends.sqlite3", "NAME": str(db)})
    settings.BACKUP_DIR = tmp_path / "copies"
    settings.BACKUP_KEEP = 3
    return db


def test_une_copie_complete_et_lisible(source, settings):
    target = backup.backup_database()
    assert target.parent == settings.BACKUP_DIR and backup.NAME.match(target.name)
    con = sqlite3.connect(target)
    assert [r[0] for r in con.execute("select nom from projet order by nom")] == ["cuisine", "dressing"]
    con.close()
    # No half-made copy left behind.
    assert not list(settings.BACKUP_DIR.glob("*.partiel"))


def test_on_garde_les_dernieres(source, settings):
    folder = settings.BACKUP_DIR
    folder.mkdir()
    for day in range(1, 6):
        (folder / f"cao-2026-01-0{day}-120000.sqlite3").write_bytes(b"x")
    (folder / "a-garder.txt").write_text("pas une copie")
    backup.backup_database()
    names = [p.name for p in backup.backups()]
    assert len(names) == 3
    assert names[0] == "cao-2026-01-04-120000.sqlite3"
    assert (folder / "a-garder.txt").exists()


def test_due_apres_un_jour(source, settings):
    assert backup.due()
    target = backup.backup_database()
    assert not backup.due()
    old = time.time() - 2 * backup.DAY
    os.utime(target, (old, old))
    assert backup.due()


def test_la_copie_du_jour_en_arriere_plan(source, settings, monkeypatch):
    settings.BACKUP_AUTO = True
    monkeypatch.setattr(backup, "_checked", 0.0)
    assert backup.maybe_backup()
    for _ in range(100):
        if backup.backups():
            break
        time.sleep(0.05)
    assert len(backup.backups()) == 1
    # Looked at once an hour at most, and not again the same day.
    with backup._lock:
        pass
    assert not backup.maybe_backup()
    monkeypatch.setattr(backup, "_checked", 0.0)
    assert not backup.maybe_backup()


def test_pas_de_copie_si_desactivee(source, settings, monkeypatch):
    settings.BACKUP_AUTO = False
    monkeypatch.setattr(backup, "_checked", 0.0)
    assert not backup.maybe_backup()
    assert backup.backups() == []


def test_la_commande(source, settings, capsys):
    call_command("sauvegarde")
    call_command("sauvegarde", "--liste")
    out = capsys.readouterr().out
    assert "Base copiée" in out and "1 copie(s)" in out
