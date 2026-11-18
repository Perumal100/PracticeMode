from django.db import transaction

from reviewer.models import FormStatus, PracticeForm

from .models import FormRequest
from .sources import source_key

Status = FormRequest.Status


class RequestError(Exception):
    def __init__(self, code, message, status_code, **extra):
        super().__init__(message)
        self.code, self.message, self.status_code, self.extra = code, message, status_code, extra


def _forms_for(key):
    return [form for form in PracticeForm.objects.exclude(status=FormStatus.FAILED) if source_key(form.source_url) == key]


def published_version(form):
    """The approved version learners can practise now, following revisions."""
    if form is None:
        return None
    return form if form.status == FormStatus.APPROVED else form.current_version()


def learner_view(request):
    """US-15: the request's state in the learner's terms, derived from the linked form."""
    if request.status == Status.OPEN:
        return {"state": "RECEIVED", "message": "A Form Reviewer will look at this link.", "formId": None}
    if request.status == Status.DECLINED:
        return {"state": "NOT_AVAILABLE", "message": request.decline_reason, "formId": None}
    form = request.form
    removed = {"state": "NOT_AVAILABLE", "message": "The practice copy of this form was removed.", "formId": None}
    if form is None:
        return removed
    if form.status == FormStatus.AWAITING_REVIEW:
        return {"state": "AWAITING_REVIEW", "message": "A practice copy was made and is waiting for a Form Reviewer to check it.", "formId": None}
    current = published_version(form)
    if current is not None:
        return {"state": "AVAILABLE", "message": "Ready to practise.", "formId": str(current.pk)}
    if form.status in (FormStatus.REJECTED, FormStatus.FAILED):
        reason = getattr(getattr(form, "review_decision", None), "rejection_reason", "") or form.failure_reason
        return {"state": "NOT_AVAILABLE", "message": reason or "A Form Reviewer could not publish this form.", "formId": None}
    return removed


def create_request(learner, url, note):
    key = source_key(url)
    with transaction.atomic():
        published = next((published_version(form) for form in _forms_for(key) if published_version(form)), None)
        if published is not None:
            raise RequestError("FORM_ALREADY_AVAILABLE", "This form is already available for practice.", 409, formId=str(published.pk))
        mine = FormRequest.objects.select_for_update().filter(learner=learner, source_key=key)
        if any(learner_view(existing)["state"] in ("RECEIVED", "AWAITING_REVIEW") for existing in mine):
            raise RequestError("REQUEST_ALREADY_OPEN", "You have already requested this form.", 409)
        pending = next((form for form in _forms_for(key) if form.status == FormStatus.AWAITING_REVIEW), None)
        return FormRequest.objects.create(
            learner=learner, url=url, source_key=key, note=note,
            status=Status.LINKED if pending else Status.OPEN, form=pending,
        )


def link_open_requests(form):
    """Called when a form is imported: open requests for the same page now follow it."""
    return FormRequest.objects.filter(status=Status.OPEN, source_key=source_key(form.source_url)).update(status=Status.LINKED, form=form)


def _open_group(request_id):
    try:
        request = FormRequest.objects.select_for_update().get(pk=request_id)
    except FormRequest.DoesNotExist:
        raise RequestError("REQUEST_NOT_FOUND", "The request does not exist.", 404) from None
    if request.status != Status.OPEN:
        raise RequestError("REQUEST_CLOSED", "This request has already been handled.", 409)
    return FormRequest.objects.filter(status=Status.OPEN, source_key=request.source_key)


def link_request(request_id, form_id):
    """A reviewer points every open request for this page at a form."""
    with transaction.atomic():
        group = _open_group(request_id)
        try:
            form = PracticeForm.objects.get(pk=form_id)
        except PracticeForm.DoesNotExist:
            raise RequestError("FORM_NOT_FOUND", "The form does not exist.", 404) from None
        if form.status not in (FormStatus.AWAITING_REVIEW, FormStatus.APPROVED):
            raise RequestError("FORM_NOT_LINKABLE", "Link a form that is awaiting review or approved.", 409)
        return group.update(status=Status.LINKED, form=form)


def decline_request(request_id, reason):
    with transaction.atomic():
        return _open_group(request_id).update(status=Status.DECLINED, decline_reason=reason)
