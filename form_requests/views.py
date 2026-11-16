from django.db.models import Count
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.identity import LEARNER
from accounts.permissions import HasRole
from reviewer.permissions import IsFormReviewer

from . import services
from .models import FormRequest
from .serializers import (
    CreateFormRequestSerializer, DeclineSerializer, LearnerFormRequestSerializer, LinkSerializer,
    ReviewFilterSerializer, ReviewFormRequestSerializer,
)
from .sources import clean_url


def _error(error):
    return Response({"error": error.code, "message": error.message, **error.extra}, status=error.status_code)


class LearnerFormRequestView(APIView):
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = (LEARNER,)

    def get(self, request):
        requests = FormRequest.objects.filter(learner=request.user).select_related("form__review_decision")
        return Response(LearnerFormRequestSerializer(requests, many=True).data)

    def post(self, request):
        data = CreateFormRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            created = services.create_request(request.user, clean_url(data.validated_data["url"]), data.validated_data["note"].strip())
        except services.RequestError as error:
            return _error(error)
        return Response(LearnerFormRequestSerializer(created).data, status=201)


class ReviewFormRequestListView(APIView):
    permission_classes = [IsFormReviewer]

    def get(self, request):
        filters = ReviewFilterSerializer(data=request.query_params.dict())
        filters.is_valid(raise_exception=True)
        requests = FormRequest.objects.select_related("form").order_by("created_at")
        if status := filters.validated_data.get("status"):
            requests = requests.filter(status=status)
        counts = {
            (row["source_key"], row["status"]): row["total"]
            for row in FormRequest.objects.values("source_key", "status").annotate(total=Count("id"))
        }
        return Response(ReviewFormRequestSerializer(requests, many=True, context={"counts": counts}).data)


class ReviewFormRequestLinkView(APIView):
    permission_classes = [IsFormReviewer]

    def post(self, request, request_id):
        data = LinkSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            updated = services.link_request(request_id, data.validated_data["formId"])
        except services.RequestError as error:
            return _error(error)
        return Response({"updated": updated})


class ReviewFormRequestDeclineView(APIView):
    permission_classes = [IsFormReviewer]

    def post(self, request, request_id):
        data = DeclineSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            updated = services.decline_request(request_id, data.validated_data["reason"].strip())
        except services.RequestError as error:
            return _error(error)
        return Response({"updated": updated})
