from django.contrib import admin

from .models import (
    Cabinet,
    CabinetHistory,
    CabinetTemplate,
    Component,
    ExternalZone,
    InternalVolume,
    Panel,
    Project,
    ProjectItem,
    ProjectVersion,
    RoomAppliance,
    RoomOpening,
    RoomWall,
    RoomWorktop,
)


@admin.register(CabinetTemplate)
class CabinetTemplateAdmin(admin.ModelAdmin):
    list_display = ["name", "description", "source_cabinet", "updated_at"]
    search_fields = ["name"]


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "client_name",
        "room_type",
        "placement_mode",
        "gap",
        "margin_percent",
        "tax_rate",
        "created_at",
    ]
    list_filter = ["room_type", "placement_mode"]
    search_fields = ["name", "client_name"]


@admin.register(ProjectItem)
class ProjectItemAdmin(admin.ModelAdmin):
    list_display = ["project", "cabinet", "slot", "offset_x", "pos_x", "pos_y", "rotation"]
    list_filter = ["project"]


@admin.register(RoomWall)
class RoomWallAdmin(admin.ModelAdmin):
    list_display = ["project", "index", "name", "x1", "y1", "x2", "y2", "height"]
    list_filter = ["project"]


@admin.register(RoomOpening)
class RoomOpeningAdmin(admin.ModelAdmin):
    list_display = ["project", "wall", "kind", "offset", "width", "height", "sill"]
    list_filter = ["project", "kind"]


@admin.register(RoomAppliance)
class RoomApplianceAdmin(admin.ModelAdmin):
    list_display = [
        "project",
        "kind",
        "name",
        "width",
        "height",
        "depth",
        "elevation",
        "price",
    ]
    list_filter = ["project", "kind"]
    search_fields = ["name"]


@admin.register(RoomWorktop)
class RoomWorktopAdmin(admin.ModelAdmin):
    list_display = ["project", "name", "width", "depth", "thickness", "elevation", "color"]
    list_filter = ["project"]


@admin.register(ProjectVersion)
class ProjectVersionAdmin(admin.ModelAdmin):
    list_display = ["project", "name", "note", "created_at"]
    list_filter = ["project"]
    search_fields = ["name", "note"]


class InternalVolumeInline(admin.TabularInline):
    model = InternalVolume
    extra = 0
    fields = ["parent", "slot", "pos_x", "pos_y", "pos_z", "width", "height", "depth", "is_root", "split_direction"]
    readonly_fields = ["split_direction"]


@admin.register(Cabinet)
class CabinetAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "width",
        "height",
        "depth",
        "material_carcase",
        "has_doors",
        "has_hanging_rail",
        "updated_at",
    ]
    list_filter = ["has_doors", "has_hanging_rail", "material_carcase"]
    search_fields = ["name"]
    filter_horizontal = ["hardware_rules"]
    inlines = [InternalVolumeInline]


@admin.register(InternalVolume)
class InternalVolumeAdmin(admin.ModelAdmin):
    list_display = ["id", "cabinet", "parent", "slot", "width", "height", "depth", "split_direction", "is_root"]
    list_filter = ["is_root", "split_direction"]
    readonly_fields = ["split_offset", "split_ratio"]


@admin.register(Component)
class ComponentAdmin(admin.ModelAdmin):
    list_display = ["id", "cabinet", "component_type", "volume", "position_from_bottom", "width", "depth"]
    list_filter = ["component_type"]
    readonly_fields = ["width", "height", "depth"]


@admin.register(ExternalZone)
class ExternalZoneAdmin(admin.ModelAdmin):
    list_display = ["cabinet", "zone_type", "width", "height", "depth"]


@admin.register(Panel)
class PanelAdmin(admin.ModelAdmin):
    list_display = ["name", "cabinet", "category", "material", "length", "width", "thickness", "quantity"]
    list_filter = ["category", "material"]
    search_fields = ["name", "cabinet__name"]
    readonly_fields = ["component", "external_zone"]
