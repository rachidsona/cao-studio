"""Administration du catalogue : matières, règles de quincaillerie, profil de l'atelier (avec son logo téléversé)."""
import base64

from django import forms
from django.contrib import admin
from django.shortcuts import redirect
from django.urls import reverse

from .models import CompanyProfile, HardwareRule, Material

LOGO_MAX_BYTES = 200_000


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    list_display = ("name", "thickness", "category", "price_per_m2", "sheet_width", "sheet_length", "is_default")
    list_filter = ("category",)
    search_fields = ("name",)


@admin.register(HardwareRule)
class HardwareRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "unit", "unit_price", "auto_mode", "auto_per_unit", "default_quantity")
    list_filter = ("auto_mode",)
    search_fields = ("name",)


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


@admin.register(CompanyProfile)
class CompanyProfileAdmin(admin.ModelAdmin):
    form = CompanyProfileForm
    fields = ("name", "slogan", "address", "phone", "email", "website", "logo_file", "remove_logo")

    def has_add_permission(self, request):
        return not CompanyProfile.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        # One profile only: the list goes straight to it.
        return redirect(reverse("admin:catalog_companyprofile_change", args=[CompanyProfile.load().pk]))
