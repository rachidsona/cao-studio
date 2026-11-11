"""L'authentification des comptes : celle de Django, sauf pour un nom ou une adresse qui a trop échoué (throttle.py).

Le refus passe par PermissionDenied : Django arrête alors l'authentification, sur la page de connexion comme sur celle
de l'administration (/admin/), et le signale (user_login_failed, journalisé)."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.core.exceptions import PermissionDenied

from .throttle import blocked


class ThrottledModelBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        name = username if username is not None else kwargs.get(get_user_model().USERNAME_FIELD, "")
        if blocked(request, name or ""):
            raise PermissionDenied
        return super().authenticate(request, username=username, password=password, **kwargs)
