import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class Attempt(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        COMPLETED = "COMPLETED", "Completed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    learner = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="practice_attempts", on_delete=models.PROTECT)
    practice_form = models.ForeignKey("reviewer.PracticeForm", related_name="attempts", on_delete=models.PROTECT)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.IN_PROGRESS)
    started_at = models.DateTimeField(default=timezone.now, editable=False)
    last_saved_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    validation_feedback = models.JSONField(default=list, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(status__in=["IN_PROGRESS", "COMPLETED"]), name="attempt_valid_status"),
            models.CheckConstraint(
                condition=(Q(status="IN_PROGRESS", completed_at__isnull=True)
                           | Q(status="COMPLETED", completed_at__isnull=False)),
                name="attempt_completion_timestamp_matches_status",
            ),
            models.CheckConstraint(
                condition=Q(last_saved_at__isnull=True) | Q(last_saved_at__gte=F("started_at")),
                name="attempt_save_not_before_start",
            ),
            models.CheckConstraint(
                condition=Q(completed_at__isnull=True) | Q(completed_at__gte=F("started_at")),
                name="attempt_completion_not_before_start",
            ),
        ]


class Answer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    attempt = models.ForeignKey(Attempt, related_name="answers", on_delete=models.CASCADE)
    field = models.ForeignKey("reviewer.FormField", related_name="practice_answers", on_delete=models.PROTECT)
    value = models.JSONField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["field__position", "field_id"]
        constraints = [models.UniqueConstraint(fields=["attempt", "field"], name="unique_answer_per_attempt_field")]


class ProgressCounter(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    attempt = models.OneToOneField(Attempt, related_name="progress", on_delete=models.CASCADE)
    validation_error_count = models.PositiveIntegerField(default=0)
    hint_view_count = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
