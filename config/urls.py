"""Root URL configuration for CAO Studio."""
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView

from apps.projects.monitoring import healthz

urlpatterns = [
    path("", RedirectView.as_view(url="/projects/", permanent=False), name="home"),
    path("healthz", healthz, name="healthz"),
    path("admin/", admin.site.urls),
    path("accounts/", include("apps.accounts.urls")),
    path("projects/", include("apps.projects.urls")),
    path("api/", include("apps.projects.api_urls")),
]
