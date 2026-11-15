"""Réglages des tests (pytest, pytest.ini) : ceux de config/settings.py, en mode développement comme manage.py.

DEBUG est faux par défaut dans config/settings.py (un déploiement qui oublie DJANGO_DEBUG reste sûr) ; pytest-django
lit les réglages avant tout conftest.py, d'où ce module. Les tests de production (tests/backend/
test_security_regressions.py) relisent config.settings dans un processus à part, avec leurs propres variables.
"""
import os

os.environ.setdefault("DJANGO_DEBUG", "1")

from .settings import *  # noqa: E402,F403

# No copy of the database behind the tests' back (tests/backend/test_backup.py makes its own).
BACKUP_AUTO = False
