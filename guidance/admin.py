from django.contrib import admin

from .models import ChecklistItem, Hint, Translation


@admin.register(Hint)
class HintAdmin(admin.ModelAdmin):
    list_display = ("field", "language_code", "text")
    list_filter = ("language_code",)


@admin.register(Translation)
class TranslationAdmin(admin.ModelAdmin):
    list_display = ("field", "language_code", "translated_label")
    list_filter = ("language_code",)


@admin.register(ChecklistItem)
class ChecklistItemAdmin(admin.ModelAdmin):
    list_display = ("practice_form", "position", "description", "fictional_example")
