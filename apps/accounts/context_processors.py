from django.conf import settings


def signup(request):
    """Whether the pages link to /accounts/signup/ (closed by default, config/settings.py SIGNUP_OPEN)."""
    return {"signup_open": settings.SIGNUP_OPEN}
