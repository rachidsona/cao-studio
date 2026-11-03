"""Root URL configuration for poly_3D."""
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView

from apps.projects import sharing, workshop
from apps.projects.monitoring import healthz

urlpatterns = [
    path("", RedirectView.as_view(url="/projects/", permanent=False), name="home"),
    path("healthz", healthz, name="healthz"),
    path("admin/", admin.site.urls),
    path("accounts/", include("apps.accounts.urls")),
    path("projects/", include("apps.projects.urls")),
    path("api/", include("apps.projects.api_urls")),
    # The workshop of the former poly_3D: cabinets edited by volumes, kitchen and dressing rooms in 2D/3D.
    path("poly/", include("apps.furniture.urls")),
    # Client links: public, by token.
    path("s/<str:token>/", sharing.share_page, name="share-page"),
    path("atelier/<uuid:project_id>/", workshop.piece_page, name="workshop-piece"),
    path("s/<str:token>/model.glb", sharing.share_model, name="share-model"),
    path("s/<str:token>/variants/<int:position>.glb", sharing.share_variant, name="share-variant"),
    path("s/<str:token>/comments/", sharing.share_comments, name="share-comments"),
]
