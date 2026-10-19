from django import forms

from .models import Project


class ProjectCreateForm(forms.Form):
    name = forms.CharField(
        label="Nom du projet",
        max_length=Project._meta.get_field("name").max_length,
        strip=True,
        widget=forms.TextInput(attrs={"placeholder": "Ex. : Support moteur", "autocomplete": "off"}),
        error_messages={"required": "Donnez un nom à votre projet."},
    )
