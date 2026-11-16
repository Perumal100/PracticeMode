import uuid

from django.conf import settings
from django.db import models


class FormRequest(models.Model):
    """A learner asks for a real form to be turned into a practice copy (US-15)."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Received"
        LINKED = "LINKED", "Linked to a form"
        DECLINED = "DECLINED", "Declined"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    learner = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="form_requests", on_delete=models.CASCADE)
    url = models.URLField(max_length=2048)
    source_key = models.CharField(max_length=2048, db_index=True)
    note = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    # Kept when the form is replaced by a revision; cleared if a reviewer deletes it.
    form = models.ForeignKey("reviewer.PracticeForm", null=True, blank=True, related_name="learner_requests", on_delete=models.SET_NULL)
    decline_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
