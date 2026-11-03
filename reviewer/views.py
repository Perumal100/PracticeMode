from django.db import transaction
from django.db.models import Count
from rest_framework import status
from rest_framework.exceptions import APIException
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
