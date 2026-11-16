from django.db import DatabaseError, IntegrityError, transaction

from attempts.models import Attempt

from .errors import AssistanceError
from .models import AssistanceRequest

Status = AssistanceRequest.Status


def _requests():
    return AssistanceRequest.objects.select_related("attempt__practice_form", "learner", "instructor")


def _locked(request_id):
    try:
        return _requests().select_for_update(of=("self",)).get(pk=request_id)
    except AssistanceRequest.DoesNotExist:
        raise AssistanceError("REQUEST_NOT_FOUND", "The assistance request does not exist.", 404) from None


def _forbidden():
    return AssistanceError("REQUEST_FORBIDDEN", "You cannot access this assistance request.", 403)


def create_request(learner, attempt_id, requested_slot, note):
    try:
        with transaction.atomic():
            try:
                attempt = Attempt.objects.select_for_update().get(pk=attempt_id)
            except Attempt.DoesNotExist:
                raise AssistanceError("ATTEMPT_NOT_FOUND", "The attempt does not exist.", 404) from None
            if attempt.learner_id != learner.pk:
                raise AssistanceError("ATTEMPT_FORBIDDEN", "This attempt belongs to another learner.", 403)
            if attempt.assistance_requests.filter(status__in=AssistanceRequest.OPEN).exists():
                raise AssistanceError("REQUEST_ALREADY_OPEN", "This attempt already has an open assistance request.", 409)
            created = AssistanceRequest.objects.create(attempt=attempt, learner=learner, requested_slot=requested_slot, note=note)
        return _requests().get(pk=created.pk)
    except IntegrityError:
        raise AssistanceError("REQUEST_ALREADY_OPEN", "This attempt already has an open assistance request.", 409) from None
    except DatabaseError:
        raise AssistanceError("REQUEST_SAVE_FAILED", "Your request could not be saved. Please retry.", 503) from None


def learner_requests(learner, attempt_id=None):
    requests = _requests().filter(learner=learner)
    return requests.filter(attempt_id=attempt_id) if attempt_id else requests


def get_request(user, role, request_id):
    try:
        request = _requests().get(pk=request_id)
    except AssistanceRequest.DoesNotExist:
        raise AssistanceError("REQUEST_NOT_FOUND", "The assistance request does not exist.", 404) from None
    if not can_read(user, role, request):
        raise _forbidden()
    return request


def can_read(user, role, request):
    return role == "LEARNER" and request.learner_id == user.pk


def cancel_request(user, role, request_id):
    with transaction.atomic():
        request = _locked(request_id)
        if not can_read(user, role, request):
            raise _forbidden()
        if request.status not in AssistanceRequest.OPEN:
            raise AssistanceError("REQUEST_CLOSED", "This request is already closed.", 409)
        request.status = Status.CANCELLED
        request.save(update_fields=["status", "updated_at"])
    return request
