from django.contrib import admin

from .models import Hint, Translation


@admin.register(Hint)
class HintAdmin(admin.ModelAdmin):
    list_display = ("field", "language_code", "text")
    list_filter = ("language_code",)


@admin.register(Translation)
class TranslationAdmin(admin.ModelAdmin):
    list_display = ("field", "language_code", "translated_label")
    list_filter = ("language_code",)
