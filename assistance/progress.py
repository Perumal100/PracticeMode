"""US-22 (API-14): progress of the learners an instructor is helping.

DD-02 scopes this to learners with a request assigned to the caller. A
learner who never asked this instructor for help is never returned, and no
answer value leaves this module.
"""
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.identity import INSTRUCTOR
from accounts.permissions import HasRole
from attempts.models import Attempt

from .errors import AssistanceError
from .models import AssistanceRequest
from .serializers import RequestBodySerializer, display_name, learner_code

ASSIGNED = (AssistanceRequest.Status.SCHEDULED, AssistanceRequest.Status.COMPLETED)


class ProgressFilterSerializer(RequestBodySerializer):
    incomplete = serializers.BooleanField(required=False)
    minErrors = serializers.IntegerField(required=False, min_value=0)
    minHints = serializers.IntegerField(required=False, min_value=0)
    formId = serializers.UUIDField(required=False)
    learnerCode = serializers.RegexField(r"^[A-Za-z0-9]{1,32}$", required=False)


class ProgressRowSerializer(serializers.ModelSerializer):
    attemptId = serializers.UUIDField(source="id")
    learnerName = serializers.SerializerMethodField()
    learnerCode = serializers.SerializerMethodField()
    formId = serializers.UUIDField(source="practice_form_id")
    formTitle = serializers.CharField(source="practice_form.title")
    validationErrorCount = serializers.IntegerField(source="progress.validation_error_count")
    hintViewCount = serializers.IntegerField(source="progress.hint_view_count")
    startedAt = serializers.DateTimeField(source="started_at")
    lastSavedAt = serializers.DateTimeField(source="last_saved_at")

    class Meta:
        model = Attempt
        fields = ("attemptId", "learnerName", "learnerCode", "formId", "formTitle", "status",
                  "validationErrorCount", "hintViewCount", "startedAt", "lastSavedAt")

    def get_learnerName(self, attempt):
        return display_name(attempt.learner)

    def get_learnerCode(self, attempt):
        return learner_code(attempt.learner)


def assigned_learner_ids(instructor):
    return AssistanceRequest.objects.filter(instructor=instructor, status__in=ASSIGNED).values("learner_id")


class ProgressView(APIView):
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = (INSTRUCTOR,)

    def get(self, request):
        filters = ProgressFilterSerializer(data=request.query_params.dict())
        filters.is_valid(raise_exception=True)
        wanted = filters.validated_data
        attempts = (
            Attempt.objects.filter(learner_id__in=assigned_learner_ids(request.user), progress__isnull=False)
            .select_related("learner", "practice_form", "progress")
            .order_by("-started_at", "id")
        )
        if code := wanted.get("learnerCode"):
            attempts = attempts.filter(learner__username__endswith=f"-{code}")
            # AC-03: a learner outside the caller's scope is refused, whether or not they exist.
            if not attempts.exists():
                raise AssistanceError("PROGRESS_FORBIDDEN", "You can only see progress for learners whose request you accepted.", 403)
        if wanted.get("incomplete"):
            attempts = attempts.filter(status=Attempt.Status.IN_PROGRESS)
        if "minErrors" in wanted:
            attempts = attempts.filter(progress__validation_error_count__gte=wanted["minErrors"])
        if "minHints" in wanted:
            attempts = attempts.filter(progress__hint_view_count__gte=wanted["minHints"])
        if "formId" in wanted:
            attempts = attempts.filter(practice_form_id=wanted["formId"])
        return Response(ProgressRowSerializer(attempts, many=True).data)
