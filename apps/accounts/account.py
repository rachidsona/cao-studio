"""« Mon compte » (audit de sécurité du 10/11/2026, constat L10) : changer son mot de passe, emporter toutes ses
données (export.py), supprimer son compte.

La suppression demande le mot de passe et compte ses échecs avec ceux de la connexion (throttle.py) ; elle efface
le compte et tout ce qu'il possède. Un compte du personnel ne se supprime pas ici : il tient le catalogue de
l'atelier, on le retire d'abord du personnel (manage.py personnel <nom> --retirer).
"""
from __future__ import annotations

import logging

from django import forms
from django.contrib import messages
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import PasswordChangeForm
from django.contrib.auth.views import PasswordChangeView
from django.core.cache import cache
from django.http import FileResponse, HttpResponse
from django.shortcuts import redirect, render
from django.urls import reverse_lazy
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods

from apps.projects import quotas
from apps.projects.models import LibraryModule, Project, ShareLink

from . import throttle
from .export import account_zip

log = logging.getLogger("apps.security")

EXPORTS_LIMIT = 5
EXPORTS_WINDOW = 10 * 60


class DeleteAccountForm(forms.Form):
    password = forms.CharField(label="Votre mot de passe", widget=forms.PasswordInput(attrs={"autocomplete": "current-password"}))
    confirm = forms.BooleanField(label="Je comprends que mes projets, liens clients, modules et chutes seront effacés pour toujours.")

    def __init__(self, user, request, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user, self.request = user, request

    def clean_password(self):
        password = self.cleaned_data["password"]
        name = self.user.get_username()
        if throttle.blocked(self.request, name):
            raise forms.ValidationError(throttle.WAIT_MESSAGE, code="throttled")
        if not self.user.check_password(password):
            throttle.record_failure(self.request, name)
            raise forms.ValidationError("Mot de passe incorrect.", code="password")
        return password


def _page(request, delete_form=None, status=200):
    user = request.user
    used = quotas.storage_used(user)
    return render(request, "registration/account.html", {
        "projects": Project.objects.filter(owner=user).count(),
        "links": ShareLink.objects.filter(project__owner=user, revoked_at__isnull=True).count(),
        "modules": LibraryModule.objects.filter(owner=user).count(),
        "used_mb": round(used / (1024 * 1024), 1),
        "max_gb": quotas.MAX_STORAGE // 1024**3,
        "delete_form": delete_form or DeleteAccountForm(user, request),
    }, status=status)


@login_required
@require_GET
def account(request):
    return _page(request)


class ThrottledPasswordChangeForm(PasswordChangeForm):
    """Django's, with its wrong old passwords counted as failed logins (throttle.py): an open session left on a
    shared computer cannot try passwords without end."""

    request = None

    def clean_old_password(self):
        name = self.user.get_username()
        if self.request is not None and throttle.blocked(self.request, name):
            raise forms.ValidationError(throttle.WAIT_MESSAGE, code="throttled")
        try:
            return super().clean_old_password()
        except forms.ValidationError:
            throttle.record_failure(self.request, name)
            raise


class AccountPasswordChangeView(PasswordChangeView):
    """Django's: the old password, the new one twice and validated; the session stays open (its hash is updated)."""

    template_name = "registration/password_change.html"
    form_class = ThrottledPasswordChangeForm

    def get_form(self, form_class=None):
        form = super().get_form(form_class)
        form.request = self.request
        return form
    success_url = reverse_lazy("account")

    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(self.request, "Mot de passe changé.")
        return response


def _too_many_exports(user) -> bool:
    key = f"account-export:{user.pk}"
    if cache.add(key, 1, EXPORTS_WINDOW):
        return False
    try:
        return cache.incr(key) > EXPORTS_LIMIT
    except ValueError:
        return False


@login_required
@require_GET
def export(request):
    if _too_many_exports(request.user):
        return HttpResponse("Trop d'exports : réessayez dans 10 minutes.", status=429, content_type="text/plain; charset=utf-8")
    name = f"cao-studio-{timezone.localdate():%Y-%m-%d}.zip"
    return FileResponse(account_zip(request.user), as_attachment=True, filename=name, content_type="application/zip")


@login_required
@require_http_methods(["POST"])
def delete(request):
    user = request.user
    if user.is_staff or user.is_superuser:
        messages.error(request, "Un compte du personnel ne se supprime pas ici : retirez-le d'abord du personnel (manage.py personnel <nom> --retirer).")
        return redirect("account")
    form = DeleteAccountForm(user, request, request.POST)
    if not form.is_valid():
        return _page(request, form, status=400)
    name = user.get_username()
    logout(request)
    user.delete()  # its projects (versions, links, comments, progress), library, offcuts and batch go with it
    log.warning("account deleted by its owner: %s", name.replace("\r", " ").replace("\n", " "))
    messages.success(request, "Votre compte et toutes ses données ont été supprimés.")
    return redirect("login")
