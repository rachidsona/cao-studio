from django.contrib import admin

from .models import Comment, LibraryModule, PartProgress, Project, ProjectVersion, ShareLink


class ProjectVersionInline(admin.TabularInline):
    model = ProjectVersion
    fields = ("number", "checksum", "size_bytes", "message", "created_by", "created_at")
    readonly_fields = fields
    extra = 0
    can_delete = False
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "current_version", "updated_at", "created_at")
    list_filter = ("updated_at",)
    search_fields = ("name", "owner__username")
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = [ProjectVersionInline]


@admin.register(ProjectVersion)
class ProjectVersionAdmin(admin.ModelAdmin):
    list_display = ("project", "number", "size_bytes", "created_by", "created_at")
    list_select_related = ("project", "created_by")
    search_fields = ("project__name", "checksum", "message")

    # Versions are immutable history (the checksum must match the document).
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(ShareLink)
class ShareLinkAdmin(admin.ModelAdmin):
    list_display = ("title", "project", "model_size", "allow_comments", "created_at", "revoked_at")
    list_select_related = ("project",)
    exclude = ("model",)
    readonly_fields = ("token", "model_size", "created_at")


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("author", "project", "from_owner", "resolved", "created_at")
    list_filter = ("resolved", "from_owner")
    list_select_related = ("project",)
    search_fields = ("author", "body")


@admin.register(LibraryModule)
class LibraryModuleAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "created_at")
    search_fields = ("name",)
    exclude = ("document", "thumbnail")


@admin.register(PartProgress)
class PartProgressAdmin(admin.ModelAdmin):
    list_display = ("part", "project", "step", "updated_at", "updated_by")
    list_filter = ("step",)
    list_select_related = ("project",)
