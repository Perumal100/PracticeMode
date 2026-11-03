from django.db import transaction
from django.db.models import Count
from rest_framework import status
from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FormField, FormStatus, PracticeForm, ReviewDecision, ReviewNotification
from .permissions import IsFormReviewer
from .serializers import (
    DecisionRequestSerializer,
    ExtractionRequestSerializer,
    NotificationSerializer,
    PracticeFormDetailSerializer,
    PracticeFormQueueSerializer,
    PracticeFormUpdateSerializer,
    FieldOrderSerializer,
    validate_field_edit,
)


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "REVIEW_STATE_CONFLICT"
    default_detail = "This form has already been reviewed or is not awaiting review."


class ReviewFormListView(APIView):
    permission_classes = [IsFormReviewer]

    def get(self, request):
        requested_status = request.query_params.get("status", FormStatus.AWAITING_REVIEW)
        allowed_statuses = set(FormStatus.values)
        if requested_status not in allowed_statuses:
            return Response({"error": "INVALID_STATUS", "message": "Unknown review status."}, status=status.HTTP_400_BAD_REQUEST)
        forms = PracticeForm.objects.filter(status=requested_status).annotate(field_count=Count("fields"))
        return Response(PracticeFormQueueSerializer(forms, many=True).data)


class ReviewFormDetailView(APIView):
    permission_classes = [IsFormReviewer]

    def get(self, request, form_id):
        try:
            practice_form = PracticeForm.objects.prefetch_related("fields").select_related("review_decision__reviewer").get(id=form_id)
        except PracticeForm.DoesNotExist:
            return Response({"error": "FORM_NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
        return Response(PracticeFormDetailSerializer(practice_form).data)


    def patch(self, request, form_id):
        serializer = PracticeFormUpdateSerializer(
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            try:
                practice_form = PracticeForm.objects.select_for_update().get(
                    id=form_id
                )
            except PracticeForm.DoesNotExist:
                return Response(
                    {"error": "FORM_NOT_FOUND"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            # Only pending forms may be edited; reviewed versions stay unchanged.
            if practice_form.status != FormStatus.AWAITING_REVIEW:
                raise Conflict(
                    detail="Only forms awaiting review can be edited."
                )

            for field, value in serializer.validated_data.items():
                setattr(practice_form, field, value)

            practice_form.save(
                update_fields=[*serializer.validated_data, "updated_at"]
            )

            return Response(
                PracticeFormDetailSerializer(practice_form).data
            )



class ReviewDecisionView(APIView):
    permission_classes = [IsFormReviewer]

    def post(self, request, form_id):
        request_data = DecisionRequestSerializer(data=request.data)
        request_data.is_valid(raise_exception=True)
        with transaction.atomic():
            try:
                practice_form = PracticeForm.objects.select_for_update().get(id=form_id)
            except PracticeForm.DoesNotExist:
                return Response({"error": "FORM_NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
            if practice_form.status != FormStatus.AWAITING_REVIEW:
                raise Conflict()

            decision = request_data.validated_data["decision"]
            is_approved = decision == "APPROVE"
            ReviewDecision.objects.create(
                practice_form=practice_form,
                reviewer=request.user,
                outcome=ReviewDecision.Outcome.APPROVED if is_approved else ReviewDecision.Outcome.REJECTED,
                rejection_reason="" if is_approved else request_data.validated_data["rejection_reason"].strip(),
            )
            practice_form.status = FormStatus.APPROVED if is_approved else FormStatus.REJECTED
            practice_form.save(update_fields=["status", "updated_at"])
            ReviewNotification.objects.filter(practice_form=practice_form).update(is_read=True)

        response_form = PracticeForm.objects.prefetch_related("fields").select_related("review_decision__reviewer").get(id=form_id)
        return Response(PracticeFormDetailSerializer(response_form).data)


class ReviewNotificationListView(APIView):
    permission_classes = [IsFormReviewer]

    def get(self, request):
        notifications = ReviewNotification.objects.select_related("practice_form").filter(practice_form__status=FormStatus.AWAITING_REVIEW)
        return Response(NotificationSerializer(notifications, many=True).data)


class FormExtractionView(APIView):
    permission_classes = [IsFormReviewer]

    def post(self, request):
        serializer = ExtractionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        # API-15: one pending copy per source, so a form is not reviewed twice.
        if PracticeForm.objects.filter(source_url=payload["source_url"], status=FormStatus.AWAITING_REVIEW).exists():
            return Response({
                "error": "DUPLICATE_PENDING_IMPORT",
                "message": "A form from this source is already awaiting review.",
            }, status=status.HTTP_409_CONFLICT)
        with transaction.atomic():
            practice_form = PracticeForm.objects.create(
                title=payload["title"],
                source_url=payload["source_url"],
                source_available=payload["source_available"],
                # Save validated form categories.
                categories=payload["categories"],
            )
            FormField.objects.bulk_create([
                FormField(
                    practice_form=practice_form,
                    position=field["position"],
                    label=field["label"],
                    input_type=field["input_type"],
                    required=field["required"],
                    validation=field["validation"],
                )
                for field in payload["fields"]
            ])
            ReviewNotification.objects.create(practice_form=practice_form)
        practice_form = PracticeForm.objects.prefetch_related("fields").get(id=practice_form.id)
        return Response(PracticeFormDetailSerializer(practice_form).data, status=status.HTTP_201_CREATED)


def _locked_pending_form(form_id):
    """The form, locked for the current transaction, if it may still be edited."""
    try:
        practice_form = PracticeForm.objects.select_for_update().get(id=form_id)
    except PracticeForm.DoesNotExist:
        raise NotFound({"error": "FORM_NOT_FOUND"}) from None
    if practice_form.status != FormStatus.AWAITING_REVIEW:
        raise Conflict(detail="Only forms awaiting review can be edited.")
    return practice_form


def _renumber(practice_form, ordered_ids):
    """Give fields positions 1..n in the given order. Positions are unique per
    form, so every field first moves past the current range."""
    fields = {field.id: field for field in practice_form.fields.all()}
    offset = max([field.position for field in fields.values()], default=0) + len(fields) + 1
    for index, field_id in enumerate(ordered_ids):
        FormField.objects.filter(id=field_id).update(position=offset + index)
    for index, field_id in enumerate(ordered_ids, start=1):
        FormField.objects.filter(id=field_id).update(position=index)


def _form_response(form_id, status_code=status.HTTP_200_OK):
    practice_form = PracticeForm.objects.prefetch_related("fields").select_related("review_decision__reviewer").get(id=form_id)
    return Response(PracticeFormDetailSerializer(practice_form).data, status=status_code)


class ReviewFieldListView(APIView):
    """Add a field the extraction missed (US-04, US-10)."""

    permission_classes = [IsFormReviewer]

    def post(self, request, form_id):
        with transaction.atomic():
            practice_form = _locked_pending_form(form_id)
            data = validate_field_edit(request.data)
            last = practice_form.fields.order_by("-position").first()
            FormField.objects.create(practice_form=practice_form, position=(last.position + 1) if last else 1, **data)
            practice_form.save(update_fields=["updated_at"])
        return _form_response(form_id, status.HTTP_201_CREATED)


class ReviewFieldDetailView(APIView):
    """Correct or remove one extracted field before the decision."""

    permission_classes = [IsFormReviewer]

    def _field(self, practice_form, field_id):
        try:
            return practice_form.fields.get(id=field_id)
        except FormField.DoesNotExist:
            raise NotFound({"error": "FIELD_NOT_FOUND"}) from None

    def patch(self, request, form_id, field_id):
        with transaction.atomic():
            practice_form = _locked_pending_form(form_id)
            field = self._field(practice_form, field_id)
            for name, value in validate_field_edit(request.data, current=field).items():
                setattr(field, name, value)
            field.save(update_fields=["label", "input_type", "required", "validation"])
            practice_form.save(update_fields=["updated_at"])
        return _form_response(form_id)

    def delete(self, request, form_id, field_id):
        with transaction.atomic():
            practice_form = _locked_pending_form(form_id)
            field = self._field(practice_form, field_id)
            if practice_form.fields.count() == 1:
                raise ValidationError({"error": "FORM_NEEDS_A_FIELD", "message": "A form must keep at least one field."})
            field.delete()
            _renumber(practice_form, list(practice_form.fields.order_by("position").values_list("id", flat=True)))
            practice_form.save(update_fields=["updated_at"])
        return _form_response(form_id)


class ReviewFieldOrderView(APIView):
    """Put the fields in the order the source page shows them."""

    permission_classes = [IsFormReviewer]

    def put(self, request, form_id):
        order = FieldOrderSerializer(data=request.data)
        order.is_valid(raise_exception=True)
        ordered_ids = order.validated_data["fieldIds"]
        with transaction.atomic():
            practice_form = _locked_pending_form(form_id)
            current = set(practice_form.fields.values_list("id", flat=True))
            if len(ordered_ids) != len(set(ordered_ids)) or set(ordered_ids) != current:
                raise ValidationError({"fieldIds": "List every field of this form exactly once."})
            _renumber(practice_form, ordered_ids)
            practice_form.save(update_fields=["updated_at"])
        return _form_response(form_id)
