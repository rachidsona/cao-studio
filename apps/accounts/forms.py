from django.contrib.auth.forms import UserCreationForm


class SignupForm(UserCreationForm):
    """Account creation form (username + password twice)."""

    class Meta(UserCreationForm.Meta):
        fields = ("username",)
