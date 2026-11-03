from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.identity import LEARNER
from accounts.permissions import HasRole
from reviewer.models import FormStatus, PracticeForm

from .serializers import CatalogFilterSerializer, FormDetailSerializer, FormSummarySerializer


class FormListView(APIView):
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = (LEARNER,)

    def get(self, request):
        filters = CatalogFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        forms = PracticeForm.objects.filter(status=FormStatus.APPROVED)
        if keyword := filters.validated_data.get("keyword"):
            forms = forms.filter(title__icontains=keyword)
        forms = forms.order_by("-created_at", "id")
        return Response(FormSummarySerializer(forms, many=True).data)


class FormDetailView(APIView):
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = (LEARNER,)

    def get(self, request, form_id):
        if request.query_params:
            raise ValidationError({"filters": "Form detail does not support filters."})
        try:
            form = PracticeForm.objects.get(pk=form_id)
        except PracticeForm.DoesNotExist:
            return Response({"error": "FORM_NOT_FOUND"}, status=404)
        if form.status != FormStatus.APPROVED:
            return Response({
                "error": "FORM_NOT_APPROVED",
                "message": "This form is not available for practice yet.",
            }, status=403)
        return Response(FormDetailSerializer(form).data)
