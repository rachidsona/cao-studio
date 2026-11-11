from django.contrib.auth import views as auth_views
from django.urls import path

from . import account, views
from .forms import ThrottledAuthenticationForm

urlpatterns = [
    path(
        "login/",
        auth_views.LoginView.as_view(redirect_authenticated_user=True, authentication_form=ThrottledAuthenticationForm),
        name="login",
    ),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("signup/", views.signup, name="signup"),
    path("", account.account, name="account"),
    path("mot-de-passe/", account.AccountPasswordChangeView.as_view(), name="password_change"),
    path("export/", account.export, name="account_export"),
    path("supprimer/", account.delete, name="account_delete"),
]
