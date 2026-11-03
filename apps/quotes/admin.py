from django.contrib import admin

from .models import Quote, QuoteLine


class QuoteLineInline(admin.TabularInline):
    model = QuoteLine
    extra = 0
    readonly_fields = ["total"]
    fields = ["description", "material", "quantity", "unit", "unit_price", "is_material", "is_hardware", "total"]


@admin.register(Quote)
class QuoteAdmin(admin.ModelAdmin):
    list_display = ["id", "client_name", "cabinet", "status", "margin_percent", "tax_rate", "updated_at"]
    list_filter = ["status"]
    search_fields = ["client_name", "cabinet__name"]
    inlines = [QuoteLineInline]
