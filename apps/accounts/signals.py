"""Ce qui se journalise des comptes : chaque connexion refusée (nom essayé et adresse), pour voir des essais de mots de
passe répétés (audit de sécurité du 10/11/2026, L8). Le mot de passe n'est jamais écrit."""
from __future__ import annotations

import logging
import re

from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.dispatch import receiver

from .throttle import record_failure, record_success

logger = logging.getLogger("apps.security")


def _one_line(text: object, limit: int = 150) -> str:
    """A text sent by anyone, on one line of the log and cut."""
    return re.sub(r"[\x00-\x1f\x7f  ]", " ", str(text))[:limit]


@receiver(user_login_failed)
def login_failed(sender, credentials: dict, request=None, **kwargs) -> None:
    address = request.META.get("REMOTE_ADDR", "") if request is not None else ""
    username = str(credentials.get("username", ""))
    logger.warning("Connexion refusée pour « %s » depuis %s.", _one_line(username), _one_line(address, 64))
    # Counted, for the limit of attempts (throttle.py).
    record_failure(request, username)


@receiver(user_logged_in)
def logged_in(sender, request, user, **kwargs) -> None:
    record_success(user.get_username())
