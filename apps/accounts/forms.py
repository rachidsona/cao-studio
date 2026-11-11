from django import forms
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm

from .throttle import WAIT_MESSAGE, blocked


class ThrottledAuthenticationForm(AuthenticationForm):
    """The login form: after too many failures for this name or from this address, it says to wait (throttle.py)."""

    def clean(self):
        if blocked(self.request, self.cleaned_data.get("username") or ""):
            raise forms.ValidationError(WAIT_MESSAGE, code="throttled")
        return super().clean()


class SignupForm(UserCreationForm):
    """Account creation form (username + password twice)."""

    class Meta(UserCreationForm.Meta):
        fields = ("username",)
