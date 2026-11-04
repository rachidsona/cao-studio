"""Administration du catalogue : matières, règles de quincaillerie, profil de l'atelier (avec son logo téléversé)."""
from django.contrib import admin
from django.shortcuts import redirect
from django.urls import reverse

from .forms import CompanyProfileForm
from .models import CompanyProfile, HardwareRule, Material


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
