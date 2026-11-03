from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.identity import LEARNER
from accounts.permissions import HasRole

from . import services
from .serializers import (
    AnswerSerializer, AttemptSerializer, CompletionRequestSerializer,
    CompletionSerializer, CreateAttemptSerializer, SaveAnswerSerializer,
)


class LearnerAttemptView(APIView):
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = (LEARNER,)

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.query_params:
            raise ValidationError({"filters": "Attempt endpoints do not support filters."})


class AttemptCreateView(LearnerAttemptView):
    def post(self, request):
        data = CreateAttemptSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        attempt = services.create_attempt(request.user, data.validated_data["formId"])
        return Response(AttemptSerializer(attempt).data, status=201)


class AttemptDetailView(LearnerAttemptView):
    def get(self, request, attempt_id):
        attempt = services.get_attempt(request.user, attempt_id)
        return Response(AttemptSerializer(attempt).data)


class AnswerSaveView(LearnerAttemptView):
    def patch(self, request, attempt_id, field_id):
        data = SaveAnswerSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        answer = services.save_answer(request.user, attempt_id, field_id, data.validated_data["value"])
        return Response(AnswerSerializer(answer).data)


class AttemptCompletionView(LearnerAttemptView):
    def post(self, request, attempt_id):
        data = CompletionRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        attempt, first_completion = services.complete_attempt(request.user, attempt_id)
        return Response(CompletionSerializer(attempt).data, status=200 if first_completion else 409)
