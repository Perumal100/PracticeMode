from django.contrib import admin

from .models import Hint


@admin.register(Hint)
class HintAdmin(admin.ModelAdmin):
    list_display = ("field", "language_code", "text")
    list_filter = ("language_code",)
