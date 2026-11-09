"""Les formulaires du catalogue, partagés par ses pages (views.py) et par l'administration."""
import base64

from django import forms

from .models import CompanyProfile, HardwareRule, Material

LOGO_MAX_BYTES = 200_000


class MaterialForm(forms.ModelForm):
    class Meta:
        model = Material
        fields = ("name", "category", "thickness", "price_per_m2", "color", "sheet_width", "sheet_length", "is_default")
        widgets = {"color": forms.TextInput(attrs={"type": "color"})}
        help_texts = {"color": ""}

    def save(self, commit=True):
        material = super().save(commit=commit)
        # One default material: the one just ticked.
        if commit and material.is_default:
            Material.objects.exclude(pk=material.pk).filter(is_default=True).update(is_default=False)
        return material


class HardwareRuleForm(forms.ModelForm):
    class Meta:
        model = HardwareRule
        fields = ("name", "description", "unit", "unit_price", "default_quantity", "auto_mode", "auto_per_unit")
        widgets = {"description": forms.Textarea(attrs={"rows": 3})}


class RatesForm(forms.ModelForm):
    """The quote's rates of the workshop, the same on every computer."""

    class Meta:
        model = CompanyProfile
        fields = tuple(CompanyProfile.RATES)


class CompanyProfileForm(forms.ModelForm):
    logo_file = forms.FileField(label="Logo (fichier PNG ou JPEG)", required=False)
    remove_logo = forms.BooleanField(label="Retirer le logo", required=False)

    class Meta:
        model = CompanyProfile
        fields = ("name", "slogan", "address", "phone", "email", "website")

    def clean_logo_file(self):
        upload = self.cleaned_data.get("logo_file")
        if not upload:
            return None
        if upload.size > LOGO_MAX_BYTES:
            raise forms.ValidationError("Le logo doit peser 200 ko au plus.")
        if upload.content_type not in ("image/png", "image/jpeg"):
            raise forms.ValidationError("Le logo doit être une image PNG ou JPEG.")
        return upload

    def save(self, commit=True):
        profile = super().save(commit=False)
        upload = self.cleaned_data.get("logo_file")
        if self.cleaned_data.get("remove_logo"):
            profile.logo = ""
        elif upload:
            profile.logo = f"data:{upload.content_type};base64,{base64.b64encode(upload.read()).decode('ascii')}"
        if commit:
            profile.save()
        return profile
