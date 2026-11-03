"""The workshop of the former poly_3D (/poly/) needs an account of poly_3D, like the rest of the application.

Pages send to the login page; its API answers 401 in JSON (the editors show the message).
"""
from __future__ import annotations

from django.conf import settings
from django.contrib.auth.views import redirect_to_login
from django.http import JsonResponse

PREFIX = "/poly/"


class PolyLoginRequiredMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        if path.startswith(PREFIX) and not request.user.is_authenticated:
            if path.startswith(f"{PREFIX}api/"):
                return JsonResponse({"ok": False, "error": "Connexion requise. Rechargez la page et connectez-vous."}, status=401)
            return redirect_to_login(request.get_full_path(), settings.LOGIN_URL)
        return self.get_response(request)
