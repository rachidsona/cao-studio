"""Les tentatives de connexion limitées (audit de sécurité du 10/11/2026, constat 3).

Chaque connexion refusée compte, pour le nom essayé et pour l'adresse d'où elle vient : au-delà de MAX_PER_USERNAME
échecs sur un même nom, ou de MAX_PER_ADDRESS depuis une même adresse, en WINDOW secondes, toute nouvelle tentative est
refusée jusqu'à la fin de la fenêtre, même avec le bon mot de passe — que ce soit sur /accounts/login/ (un message dit
d'attendre) ou sur /admin/. Une connexion réussie remet à zéro le compte de son nom.

Les compteurs sont dans le cache de Django : `cache.add` puis `cache.incr`, atomiques. Sans cache partagé (CACHES), chaque
processus du serveur compte de son côté : la limite est multipliée par le nombre de processus (constat 5, à régler avec
un cache partagé). Derrière un proxy, l'adresse est celle du proxy : la limite par adresse vaut alors pour tous.
"""
from __future__ import annotations

import hashlib

from django.core.cache import cache

MAX_PER_USERNAME = 5
MAX_PER_ADDRESS = 30
WINDOW = 15 * 60

WAIT_MESSAGE = "Trop de tentatives de connexion : par sécurité, réessayez dans 15 minutes."


def _digest(text: str) -> str:
    # A name typed by anyone: any character, any length; its digest makes a key every cache accepts.
    return hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()


def _username_key(username: str) -> str:
    # Case-insensitive: « Alice » and « alice » are the same attempts.
    return f"login-fail:user:{_digest(username.strip().casefold())}"


def _address_key(request) -> str | None:
    address = request.META.get("REMOTE_ADDR", "") if request is not None else ""
    return f"login-fail:addr:{_digest(address)}" if address else None


def _count(key: str) -> int:
    return cache.get(key, 0)


def _bump(key: str) -> None:
    # The window starts at the first failure: add() sets it only if absent, incr() is atomic in the cache.
    if not cache.add(key, 1, WINDOW):
        try:
            cache.incr(key)
        except ValueError:  # expired between the two calls
            cache.add(key, 1, WINDOW)


def blocked(request, username: str) -> bool:
    """Whether a login for this name, from this address, must wait."""
    if username and _count(_username_key(username)) >= MAX_PER_USERNAME:
        return True
    key = _address_key(request)
    return key is not None and _count(key) >= MAX_PER_ADDRESS


def record_failure(request, username: str) -> None:
    if username:
        _bump(_username_key(username))
    key = _address_key(request)
    if key:
        _bump(key)


def record_success(username: str) -> None:
    cache.delete(_username_key(username))
