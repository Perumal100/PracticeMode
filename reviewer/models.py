import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class FormStatus(models.TextChoices):
    AWAITING_REVIEW = "AWAITING_REVIEW", "Awaiting review"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    FAILED = "FAILED", "Failed"


class PracticeForm(models.Model):
    """An extracted practice copy. Only approved forms may be published later."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    source_url = models.URLField(max_length=2048)
    source_available = models.BooleanField(default=True)
    categories = models.JSONField(default=list, blank=True)
    failure_reason = models.TextField(blank=True)
    status = models.CharField(max_length=32, choices=FormStatus.choices, default=FormStatus.AWAITING_REVIEW)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title

    def clean(self):
        super().clean()
        errors = {}

        if not isinstance(self.categories, list):
            errors["categories"] = "Categories must be a list."
        elif any(
            not isinstance(category, str) or not category.strip()
            for category in self.categories
        ):
            errors["categories"] = "Categories must contain non-blank text."
        elif len({category.strip().casefold() for category in self.categories}) != len(self.categories):
            errors["categories"] = "Categories must not contain duplicates."

        if self.status == FormStatus.FAILED and not self.failure_reason.strip():
            errors["failure_reason"] = "A failure reason is required."

        if errors:
            raise ValidationError(errors)    


class FormField(models.Model):
    """Supported extracted field metadata; no learner answer value is stored here."""

    INPUT_TYPES = [
        ("text", "Text"), ("email", "Email"), ("tel", "Telephone"),
        ("number", "Number"), ("date", "Date"), ("select", "Select"),
        ("checkbox", "Checkbox"), ("textarea", "Text area"), ("url", "Link"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    practice_form = models.ForeignKey(PracticeForm, related_name="fields", on_delete=models.PROTECT)
    position = models.PositiveIntegerField()
    label = models.CharField(max_length=300)
    input_type = models.CharField(max_length=32, choices=INPUT_TYPES)
    required = models.BooleanField(default=False)
    validation = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["position"]
        constraints = [models.UniqueConstraint(fields=["practice_form", "position"], name="unique_field_position_per_form")]


class ReviewDecision(models.Model):
    class Outcome(models.TextChoices):
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    practice_form = models.OneToOneField(PracticeForm, related_name="review_decision", on_delete=models.PROTECT)
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="form_review_decisions", on_delete=models.PROTECT)
    outcome = models.CharField(max_length=16, choices=Outcome.choices)
    rejection_reason = models.TextField(blank=True)
    decided_at = models.DateTimeField(auto_now_add=True)

    def clean(self) -> None:
        if self.outcome == self.Outcome.REJECTED and not self.rejection_reason.strip():
            raise ValidationError({"rejection_reason": "A rejection reason is required."})
        if self.outcome == self.Outcome.APPROVED and self.rejection_reason:
            raise ValidationError({"rejection_reason": "An approval cannot include a rejection reason."})


class ReviewNotification(models.Model):
    """A queue notification created when a supported extraction awaits review."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    practice_form = models.ForeignKey(PracticeForm, related_name="review_notifications", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
