"""Django settings for CAO Studio.

Configuration is read from environment variables:
- DJANGO_DEBUG ("1"/"true"/"yes" → debug; default FALSE: a deployment that forgets it is safe. manage.py — the
  development commands — sets it to true unless it is set: wsgi.py and asgi.py, which serve production, do not)
- DJANGO_SECRET_KEY (required when DJANGO_DEBUG is false)
- DJANGO_ALLOWED_HOSTS (comma separated)
- DJANGO_CSRF_TRUSTED_ORIGINS (comma separated, optional)
- POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_HOST / POSTGRES_PORT
- DJANGO_ADMINS (e-mail addresses that receive server errors, optional) / DJANGO_SERVER_EMAIL
"""
import mimetypes
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from django.utils.csp import CSP

BASE_DIR = Path(__file__).resolve().parent.parent

# The OpenCascade WebAssembly binary must be served with the right MIME type,
# otherwise WebAssembly.instantiateStreaming() refuses it.
mimetypes.add_type("application/wasm", ".wasm")


def env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if DEBUG:
        # Insecure fallback, accepted ONLY in debug/local development.
        SECRET_KEY = "django-insecure-dev-only-cao-studio-do-not-use-in-production"
    else:
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY doit être défini lorsque DJANGO_DEBUG est faux."
        )

ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]" if DEBUG else ""
)
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "apps.accounts",
    "apps.projects",
    "apps.catalog",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # The Content-Security-Policy header (SECURE_CSP below) and the nonce of the inline scripts.
    "django.middleware.csp.ContentSecurityPolicyMiddleware",
    # Serves the static files in production, compressed (gzip/brotli) and cached (see STORAGES below).
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "django.template.context_processors.csp",
                "apps.accounts.context_processors.signup",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

if os.environ.get("POSTGRES_DB"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ["POSTGRES_DB"],
            "USER": os.environ.get("POSTGRES_USER", ""),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
            "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": 60,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            # The end-to-end tests use a database of their own (DJANGO_SQLITE_PATH).
            "NAME": os.environ.get("DJANGO_SQLITE_PATH") or BASE_DIR / "db.sqlite3",
        }
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Django's authentication, with the attempts limited (apps/accounts/throttle.py: 5 failures for a name, 30 from an
# address, in 15 minutes), on the login page and the admin's.
AUTHENTICATION_BACKENDS = ["apps.accounts.backends.ThrottledModelBackend"]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Europe/Paris"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"

# collectstatic writes a gzip and a brotli copy of each file (the 23 MB OpenCascade kernel shrinks to a few MB).
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}


def immutable_static(path: str, url: str) -> bool:
    """Files the bundler named after their content (js/chunks/…, js/assets/…) never change: cached for a year."""
    return "/static/js/chunks/" in url or "/static/js/assets/" in url


WHITENOISE_IMMUTABLE_FILE_TEST = immutable_static

LOGIN_URL = "/accounts/login/"
LOGIN_REDIRECT_URL = "/projects/"
LOGOUT_REDIRECT_URL = "/accounts/login/"

# Account creation by anyone (/accounts/signup/) is closed by default (security audit of 10/11/2026, M8): the staff
# makes the accounts (python manage.py compte <nom>). DJANGO_SIGNUP_OPEN=1 opens it (the end-to-end tests' server).
SIGNUP_OPEN = env_bool("DJANGO_SIGNUP_OPEN", False)

# Upload/body limits: the API enforces its own 6 MB limit (→ 413 JSON); this
# Django-level cap is slightly above so the API check runs first.
DATA_UPLOAD_MAX_MEMORY_SIZE = 7 * 1024 * 1024

# The frontend reads the csrftoken cookie and sends it as X-CSRFToken.
CSRF_COOKIE_HTTPONLY = False
# CSRF failures under /api/ are answered in JSON (HTML elsewhere).
CSRF_FAILURE_VIEW = "apps.projects.http.csrf_failure"
SESSION_COOKIE_HTTPONLY = True
X_FRAME_OPTIONS = "DENY"

# Content-Security-Policy (audit of 10/11/2026, constat 7): only this site's scripts — and the inline ones of
# base.html, by their nonce — run; WebAssembly (OpenCascade, planegcs) is allowed to compile. Styles stay
# 'unsafe-inline' (style attributes everywhere), Inter comes from Google Fonts. Images, fetches and workers: this site,
# data: and blob: (thumbnails, renders, textures, the model of a link). No plugin, no other base, no form elsewhere.
# The frames keep X-Frame-Options (DENY, the editor SAMEORIGIN). DJANGO_CSP_REPORT_ONLY=1: the same policy, reported
# by the browsers but not applied (to try it on a deployment first).
CONTENT_SECURITY_POLICY = {
    "default-src": [CSP.SELF],
    "script-src": [CSP.SELF, CSP.NONCE, CSP.WASM_UNSAFE_EVAL],
    "style-src": [CSP.SELF, CSP.UNSAFE_INLINE, "https://fonts.googleapis.com"],
    "font-src": [CSP.SELF, "data:", "https://fonts.gstatic.com"],
    "img-src": [CSP.SELF, "data:", "blob:"],
    "media-src": [CSP.SELF, "data:", "blob:"],
    "connect-src": [CSP.SELF, "data:", "blob:"],
    "worker-src": [CSP.SELF, "blob:"],
    "frame-src": [CSP.SELF],
    "object-src": [CSP.NONE],
    "base-uri": [CSP.SELF],
    "form-action": [CSP.SELF],
}
if env_bool("DJANGO_CSP_REPORT_ONLY", False):
    SECURE_CSP_REPORT_ONLY = CONTENT_SECURITY_POLICY
else:
    SECURE_CSP = CONTENT_SECURITY_POLICY
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"

if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
    if env_bool("DJANGO_TRUST_X_FORWARDED_PROTO", False):
        # Only enable behind a reverse proxy that sets/strips this header.
        SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"

# Server errors (500) and the editor's errors reported by browsers ("apps.client") go to the console, which the
# host collects; with DJANGO_ADMINS (e-mail addresses, comma separated) and Django's mailer configured, server
# errors are also mailed.
ADMINS = env_list("DJANGO_ADMINS")
SERVER_EMAIL = os.environ.get("DJANGO_SERVER_EMAIL", "root@localhost")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "{asctime} {levelname} {name} : {message}", "style": "{"}},
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "plain"},
        "mail_admins": {"class": "django.utils.log.AdminEmailHandler", "level": "ERROR"},
    },
    "loggers": {
        "apps": {"handlers": ["console"], "level": "INFO"},
        # Django's security events (CSRF refused, a Host not allowed, a suspicious operation): written in production
        # too — by default Django writes them only in debug (audit of 10/11/2026, L8). The refused logins: apps.security.
        "django.security": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.request": {"handlers": ["console", *(["mail_admins"] if ADMINS and not DEBUG else [])], "level": "ERROR", "propagate": False},
    },
}
