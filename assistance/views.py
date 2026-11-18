from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.identity import INSTRUCTOR, LEARNER, role_for
from accounts.permissions import HasRole

from . import services
from .serializers import (
    AssistanceRequestSerializer, CreateRequestSerializer, InstructorListFilterSerializer,
    LearnerListFilterSerializer, ScheduleSerializer,
)


class AssistanceView(APIView):
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = (LEARNER, INSTRUCTOR)

    def require(self, request, role):
        if role_for(request.user) != role:
            raise PermissionDenied(HasRole.message)


class AssistanceRequestListView(AssistanceView):
    def post(self, request):
        """API-11: a learner asks for help with one of their attempts."""
        self.require(request, LEARNER)
        data = CreateRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        created = services.create_request(
            request.user, data.validated_data["attemptId"], data.validated_data["requestedSlot"], data.validated_data["note"].strip(),
        )
        return Response(AssistanceRequestSerializer(created).data, status=201)

    def get(self, request):
        """API-12 for instructors; for learners, their own requests and each one's status."""
        if role_for(request.user) == INSTRUCTOR:
            filters = InstructorListFilterSerializer(data=request.query_params.dict())
            filters.is_valid(raise_exception=True)
            requests = services.instructor_requests(request.user, filters.validated_data.get("status"))
        else:
            filters = LearnerListFilterSerializer(data=request.query_params.dict())
            filters.is_valid(raise_exception=True)
            requests = services.learner_requests(request.user, filters.validated_data.get("attemptId"))
        return Response(AssistanceRequestSerializer(requests, many=True).data)


class AssistanceRequestDetailView(AssistanceView):
    def get(self, request, request_id):
        """API-13."""
        found = services.get_request(request.user, role_for(request.user), request_id)
        return Response(AssistanceRequestSerializer(found).data)


class AssistanceRequestCancelView(AssistanceView):
    def post(self, request, request_id):
        cancelled = services.cancel_request(request.user, role_for(request.user), request_id)
        return Response(AssistanceRequestSerializer(cancelled).data)


class AssistanceRequestScheduleView(AssistanceView):
    allowed_roles = (INSTRUCTOR,)

    def patch(self, request, request_id):
        """API-17."""
        data = ScheduleSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        scheduled = services.schedule_request(request.user, request_id, data.validated_data["meetingDetails"].strip())
        return Response(AssistanceRequestSerializer(scheduled).data)


class AssistanceRequestCompleteView(AssistanceView):
    allowed_roles = (INSTRUCTOR,)

    def post(self, request, request_id):
        completed = services.complete_request(request.user, request_id)
        return Response(AssistanceRequestSerializer(completed).data)
