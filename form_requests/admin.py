from django.contrib import admin

from .models import FormRequest


@admin.register(FormRequest)
class FormRequestAdmin(admin.ModelAdmin):
    list_display = ("url", "status", "form", "created_at")
    list_filter = ("status",)
