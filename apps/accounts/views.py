from django.conf import settings
from django.contrib.auth import login
from django.shortcuts import redirect, render
from django.views.decorators.http import require_http_methods

from .forms import SignupForm


@require_http_methods(["GET", "POST"])
def signup(request):
    """Create an account, log the user in and send them to their projects.

    Closed unless settings.SIGNUP_OPEN (audit of 10/11/2026, M8): the page then says so, with a 403, and makes nothing;
    the staff creates the accounts (python manage.py compte <nom>).
    """
    if request.user.is_authenticated:
        return redirect(settings.LOGIN_REDIRECT_URL)
    if not settings.SIGNUP_OPEN:
        return render(request, "registration/signup.html", {"closed": True}, status=403)
    if request.method == "POST":
        form = SignupForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user, backend="apps.accounts.backends.ThrottledModelBackend")
            return redirect(settings.LOGIN_REDIRECT_URL)
    else:
        form = SignupForm()
    return render(request, "registration/signup.html", {"form": form})
