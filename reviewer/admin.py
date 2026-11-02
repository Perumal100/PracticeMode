from django.contrib import admin

from .models import FormField, PracticeForm, ReviewDecision, ReviewNotification


class FormFieldInline(admin.TabularInline):
    model = FormField
    extra = 0


@admin.register(PracticeForm)
class PracticeFormAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "source_available", "created_at")
    list_filter = ("status", "source_available")
    inlines = [FormFieldInline]


admin.site.register(ReviewDecision)
admin.site.register(ReviewNotification)
