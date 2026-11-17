import uuid

from django.core.exceptions import ValidationError
from django.db import models

from .languages import LANGUAGES, ORIGINAL


def _check_language(code):
    if code not in LANGUAGES:
        raise ValidationError({"language_code": "This language is not supported."})


class Hint(models.Model):
    """What a field expects, written by a person. A field with no hint has no row."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    field = models.ForeignKey("reviewer.FormField", related_name="hints", on_delete=models.CASCADE)
    language_code = models.CharField(max_length=16, default=ORIGINAL)
    text = models.TextField()

    class Meta:
        ordering = ["language_code"]
        constraints = [models.UniqueConstraint(fields=["field", "language_code"], name="unique_hint_per_field_language")]

    def clean(self):
        super().clean()
        _check_language(self.language_code)
        if not self.text.strip():
            raise ValidationError({"text": "A hint needs text."})


class Translation(models.Model):
    """A field's label and step-by-step guidance in another language. The original label is never replaced."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    field = models.ForeignKey("reviewer.FormField", related_name="translations", on_delete=models.CASCADE)
    language_code = models.CharField(max_length=16)
    translated_label = models.CharField(max_length=300, blank=True)
    guidance_text = models.TextField(blank=True)

    class Meta:
        ordering = ["language_code"]
        constraints = [models.UniqueConstraint(fields=["field", "language_code"], name="unique_translation_per_field_language")]

    def clean(self):
        super().clean()
        _check_language(self.language_code)
        if self.language_code == ORIGINAL:
            raise ValidationError({"language_code": "A translation is into a language other than the original."})
        if not self.translated_label.strip() and not self.guidance_text.strip():
            raise ValidationError("A translation needs a label, guidance text, or both.")


class ChecklistItem(models.Model):
    """One thing to have ready before starting a form. Examples are always fictional."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    practice_form = models.ForeignKey("reviewer.PracticeForm", related_name="checklist_items", on_delete=models.CASCADE)
    position = models.PositiveIntegerField()
    description = models.CharField(max_length=300)
    fictional_example = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(fields=["practice_form", "position"], name="unique_checklist_position_per_form"),
            models.CheckConstraint(condition=models.Q(position__gte=1), name="checklist_position_positive"),
        ]

    def clean(self):
        super().clean()
        if not self.description.strip():
            raise ValidationError({"description": "A checklist item needs a description."})
