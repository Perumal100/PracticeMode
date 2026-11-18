import uuid

from django.conf import settings
from django.db import models


class InstructorProfile(models.Model):
    """An instructor's account details. Only ACTIVE instructors hold the INSTRUCTOR role."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Waiting for approval"
        ACTIVE = "ACTIVE", "Active"
        DECLINED = "DECLINED", "Declined"
        REMOVED = "REMOVED", "Removed"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, related_name="instructor_profile", on_delete=models.CASCADE)
    # Sent to learners when this instructor accepts their request; changeable per session.
    meeting_link = models.URLField(max_length=500, blank=True)
    organisation = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="+", on_delete=models.SET_NULL)
    decision_note = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]


class FormChangeRequest(models.Model):
    """An instructor reports a mistake in a published form; a Form Reviewer answers it."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        RESOLVED = "RESOLVED", "Resolved"
        DECLINED = "DECLINED", "Declined"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    practice_form = models.ForeignKey("reviewer.PracticeForm", related_name="change_requests", on_delete=models.CASCADE)
    # The question it is about, if any. Kept as text too, in case a revision removes the field.
    field = models.ForeignKey("reviewer.FormField", null=True, blank=True, related_name="change_requests", on_delete=models.SET_NULL)
    field_label = models.CharField(max_length=300, blank=True)
    instructor = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="form_change_requests", on_delete=models.CASCADE)
    description = models.TextField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    response = models.TextField(blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="+", on_delete=models.SET_NULL)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
