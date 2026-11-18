from django.db import DatabaseError, IntegrityError, transaction
from django.db.models import Q

from attempts.models import Attempt

from .errors import AssistanceError
from .models import AssistanceEvent, AssistanceRequest

Status = AssistanceRequest.Status


def _requests():
    return AssistanceRequest.objects.select_related("attempt__practice_form", "learner", "instructor").prefetch_related("events__actor")


def _log(request, action, actor=None, detail=""):
    AssistanceEvent.objects.create(request=request, action=action, actor=actor, detail=detail[:500])


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
            _log(created, AssistanceEvent.Action.REQUESTED, learner)
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
    """DD-02: the owning learner, the assigned instructor, or any instructor while nobody has accepted."""
    if role == "LEARNER":
        return request.learner_id == user.pk
    if role == "INSTRUCTOR":
        return request.instructor_id == user.pk or request.status == Status.REQUESTED
    return False


def instructor_requests(instructor, status=None):
    """API-12: every request still waiting for an instructor, plus this instructor's own."""
    requests = _requests().filter(Q(status=Status.REQUESTED) | Q(instructor=instructor)).order_by("requested_slot", "created_at")
    return requests.filter(status=status) if status else requests


def cancel_request(user, role, request_id):
    with transaction.atomic():
        request = _locked(request_id)
        # An instructor may cancel only a session they accepted, never an unassigned request.
        allowed = request.instructor_id == user.pk if role == "INSTRUCTOR" else can_read(user, role, request)
        if not allowed:
            raise _forbidden()
        if request.status not in AssistanceRequest.OPEN:
            raise AssistanceError("REQUEST_CLOSED", "This request is already closed.", 409)
        request.status = Status.CANCELLED
        request.save(update_fields=["status", "updated_at"])
        _log(request, AssistanceEvent.Action.CANCELLED, user, "by the instructor" if role == "INSTRUCTOR" else "by the learner")
    return _requests().get(pk=request.pk)


def schedule_request(instructor, request_id, meeting_link, meeting_details=""):
    """API-17: accept a waiting request, or change the meeting of one's own session."""
    with transaction.atomic():
        request = _locked(request_id)
        if request.status == Status.SCHEDULED and request.instructor_id != instructor.pk:
            raise AssistanceError("REQUEST_ALREADY_SCHEDULED", "Another instructor has already accepted this request.", 409)
        if request.status not in AssistanceRequest.OPEN:
            if request.instructor_id != instructor.pk:
                raise _forbidden()
            raise AssistanceError("REQUEST_CLOSED", "This request is already closed.", 409)
        accepting = request.status == Status.REQUESTED
        changed = (request.meeting_link, request.meeting_details) != (meeting_link, meeting_details)
        request.instructor = instructor
        request.meeting_link = meeting_link
        request.meeting_details = meeting_details
        request.status = Status.SCHEDULED
        request.save(update_fields=["instructor", "meeting_link", "meeting_details", "status", "updated_at"])
        if accepting:
            _log(request, AssistanceEvent.Action.SCHEDULED, instructor, meeting_link)
        elif changed:
            _log(request, AssistanceEvent.Action.UPDATED, instructor, meeting_link)
    return _requests().get(pk=request.pk)


def complete_request(instructor, request_id):
    with transaction.atomic():
        request = _locked(request_id)
        if request.instructor_id != instructor.pk:
            if request.status == Status.REQUESTED:
                raise AssistanceError("REQUEST_NOT_SCHEDULED", "Accept the request before marking it as completed.", 409)
            raise _forbidden()
        if request.status != Status.SCHEDULED:
            raise AssistanceError("REQUEST_CLOSED", "This request is already closed.", 409)
        request.status = Status.COMPLETED
        request.save(update_fields=["status", "updated_at"])
        _log(request, AssistanceEvent.Action.COMPLETED, instructor)
    return _requests().get(pk=request.pk)


def release_instructor_sessions(instructor, by):
    """A removed instructor's booked sessions go back to the queue for another instructor."""
    for request in AssistanceRequest.objects.select_for_update().filter(instructor=instructor, status=Status.SCHEDULED):
        request.status, request.instructor, request.meeting_link, request.meeting_details = Status.REQUESTED, None, "", ""
        request.save(update_fields=["status", "instructor", "meeting_link", "meeting_details", "updated_at"])
        _log(request, AssistanceEvent.Action.RELEASED, by, "The instructor is no longer available.")
