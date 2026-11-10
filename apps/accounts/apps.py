from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
    label = "accounts"
    verbose_name = "Comptes"

    def ready(self) -> None:
        # The refused logins go to the log (apps.security).
        from . import signals  # noqa: F401
