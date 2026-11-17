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
