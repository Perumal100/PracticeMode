from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.identity import LEARNER, role_for
from accounts.permissions import HasRole

from . import services
from .serializers import AssistanceRequestSerializer, CreateRequestSerializer, LearnerListFilterSerializer


class AssistanceView(APIView):
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = (LEARNER,)


class AssistanceRequestListView(AssistanceView):
    def post(self, request):
        """API-11: a learner asks for help with one of their attempts."""
        data = CreateRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        created = services.create_request(
            request.user, data.validated_data["attemptId"], data.validated_data["requestedSlot"], data.validated_data["note"].strip(),
        )
        return Response(AssistanceRequestSerializer(created).data, status=201)

    def get(self, request):
        """A learner's own requests, so they can see each one's current status."""
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
