from django.db import DatabaseError, transaction
from django.db.models import prefetch_related_objects
from django.utils import timezone

from reviewer.models import FormField, FormStatus, PracticeForm

from .errors import AttemptError
from .models import Answer, Attempt, ProgressCounter
from .validation import check_schema, validate_draft, validation_feedback


def _owned_attempt(learner, attempt_id, lock=False):
    attempts = Attempt.objects.select_for_update() if lock else Attempt.objects.all()
    try:
        attempt = attempts.get(pk=attempt_id)
    except Attempt.DoesNotExist:
        raise AttemptError("ATTEMPT_NOT_FOUND", "The attempt does not exist.", 404) from None
    if attempt.learner_id != learner.pk:
        raise AttemptError("ATTEMPT_FORBIDDEN", "This attempt belongs to another learner.", 403)
    return attempt


def create_attempt(learner, form_id):
    try:
        with transaction.atomic():
            try:
                form = PracticeForm.objects.select_for_update().get(pk=form_id)
            except PracticeForm.DoesNotExist:
                raise AttemptError("FORM_NOT_FOUND", "The form does not exist.", 404) from None
            if form.status != FormStatus.APPROVED:
                raise AttemptError("FORM_NOT_APPROVED", "This form is not available for practice yet.", 403)
            check_schema(list(form.fields.all()))
            attempt = Attempt.objects.create(learner=learner, practice_form=form)
            ProgressCounter.objects.create(attempt=attempt)
            prefetch_related_objects([attempt], "answers")
        return attempt
    except DatabaseError:
        raise AttemptError("ATTEMPT_CREATE_FAILED", "The attempt could not be created. Please retry.", 503) from None


def get_attempt(learner, attempt_id):
    try:
        attempt = _owned_attempt(learner, attempt_id)
        # Materialize inside the error boundary, including response data.
        prefetch_related_objects([attempt], "answers")
        return attempt
    except DatabaseError:
        raise AttemptError("ATTEMPT_UNAVAILABLE", "The attempt could not be retrieved. Please retry.", 503) from None


def save_answer(learner, attempt_id, field_id, value):
    try:
        with transaction.atomic():
            attempt = _owned_attempt(learner, attempt_id, lock=True)
            if attempt.status == Attempt.Status.COMPLETED:
                raise AttemptError("ATTEMPT_COMPLETED", "Completed attempts cannot be edited.", 409)
            try:
                field = FormField.objects.get(pk=field_id)
            except FormField.DoesNotExist:
                raise AttemptError("FIELD_NOT_FOUND", "The field does not exist.", 404) from None
            if field.practice_form_id != attempt.practice_form_id:
                raise AttemptError("FIELD_FORM_MISMATCH", "The field does not belong to this attempt's form.", 400)
            check_schema([field])
            validate_draft(field, value)
            answer, _ = Answer.objects.update_or_create(attempt=attempt, field=field, defaults={"value": value})
            attempt.last_saved_at = answer.updated_at
            attempt.save(update_fields=["last_saved_at"])
        return answer
    except DatabaseError:
        raise AttemptError("SAVE_FAILED", "Your answer could not be saved. Please retry.", 503) from None


def complete_attempt(learner, attempt_id):
    try:
        with transaction.atomic():
            attempt = _owned_attempt(learner, attempt_id, lock=True)
            if attempt.status == Attempt.Status.COMPLETED:
                return attempt, False
            fields = list(attempt.practice_form.fields.all())
            answers = dict(attempt.answers.values_list("field_id", "value"))
            attempt.validation_feedback = validation_feedback(fields, answers)
            attempt.completed_at = timezone.now()
            attempt.status = Attempt.Status.COMPLETED
            attempt.save(update_fields=["status", "completed_at", "validation_feedback"])
            progress = ProgressCounter.objects.select_for_update().get(attempt=attempt)
            progress.validation_error_count = len(attempt.validation_feedback)
            progress.save(update_fields=["validation_error_count", "updated_at"])
        return attempt, True
    except (DatabaseError, ProgressCounter.DoesNotExist):
        raise AttemptError("COMPLETION_FAILED", "The completion result could not be saved. Please retry.", 503) from None
