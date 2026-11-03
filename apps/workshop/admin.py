from django.contrib import admin

from .models import CutList, CutListItem


class CutListItemInline(admin.TabularInline):
    model = CutListItem
    extra = 0
    readonly_fields = ["panel"]
    fields = ["panel", "sheet_group", "placed", "priority"]


@admin.register(CutList)
class CutListAdmin(admin.ModelAdmin):
    list_display = ["cabinet", "optimized", "updated_at"]
    list_filter = ["optimized"]
    inlines = [CutListItemInline]
