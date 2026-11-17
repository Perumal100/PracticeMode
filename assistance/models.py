import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class AssistanceRequest(models.Model):
    """A learner's request for a live session about one practice attempt (STM-03)."""

    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        SCHEDULED = "SCHEDULED", "Scheduled"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    OPEN = (Status.REQUESTED, Status.SCHEDULED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # The form is reached through the attempt, so the two can never disagree.
    attempt = models.ForeignKey("attempts.Attempt", related_name="assistance_requests", on_delete=models.CASCADE)
    learner = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="assistance_requests", on_delete=models.CASCADE)
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, related_name="assigned_assistance_requests", on_delete=models.PROTECT,
    )
    requested_slot = models.DateTimeField()
    note = models.TextField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.REQUESTED)
    meeting_details = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["attempt"], condition=Q(status__in=["REQUESTED", "SCHEDULED"]), name="one_open_assistance_request_per_attempt",
            ),
            models.CheckConstraint(
                condition=~Q(status="SCHEDULED") | (Q(instructor__isnull=False) & ~Q(meeting_details="")),
                name="scheduled_request_has_instructor_and_meeting_details",
            ),
            models.CheckConstraint(
                condition=~Q(status="REQUESTED") | Q(instructor__isnull=True), name="requested_request_is_unassigned",
            ),
        ]
