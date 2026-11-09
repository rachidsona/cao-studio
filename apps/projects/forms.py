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


FIELD = (
    "block min-h-10 w-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-sky-500 "
    "focus:outline-2 focus:outline-sky-500/40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
)


class ProjectInfoForm(forms.ModelForm):
    """The project's sheet: its name, its client, where the job stands, the date of fitting, notes."""

    class Meta:
        model = Project
        fields = ("name", "client_name", "client_phone", "client_email", "client_address", "status", "install_date", "notes")
        widgets = {
            "client_address": forms.Textarea(attrs={"rows": 2}),
            "notes": forms.Textarea(attrs={"rows": 4, "placeholder": "Ce qu'il faut retenir : mesures prises, choix du client, rendez-vous…"}),
            "install_date": forms.DateInput(attrs={"type": "date"}, format="%Y-%m-%d"),
        }
        error_messages = {"name": {"required": "Donnez un nom à votre projet."}}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.widget.attrs.setdefault("class", FIELD)
