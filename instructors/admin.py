from django.contrib import admin

from .models import FormChangeRequest, InstructorProfile


@admin.register(InstructorProfile)
class InstructorProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "status", "meeting_link", "created_at")
    list_filter = ("status",)


@admin.register(FormChangeRequest)
class FormChangeRequestAdmin(admin.ModelAdmin):
    list_display = ("practice_form", "field_label", "status", "created_at")
    list_filter = ("status",)
