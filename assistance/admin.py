from django.contrib import admin

from .models import AssistanceRequest


@admin.register(AssistanceRequest)
class AssistanceRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "status", "learner", "instructor", "requested_slot")
    list_filter = ("status",)
