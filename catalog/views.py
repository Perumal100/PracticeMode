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
        if wanted := {value.casefold() for value in filters.validated_data.get("category", [])}:
            # A form matches when it has any selected category, ignoring case as
            # the reviewer-side duplicate check does. SQLite has no JSON
            # containment lookup, so the approved rows are filtered here.
            forms = [form for form in forms if wanted & {c.casefold() for c in form.categories}]
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
        if form.status == FormStatus.SUPERSEDED:
            current = form.current_version()
            return Response({
                "error": "FORM_REPLACED",
                "message": "This form was updated to match the real form.",
                "replacedBy": current and str(current.id),
            }, status=410)
        if form.status != FormStatus.APPROVED:
            return Response({
                "error": "FORM_NOT_APPROVED",
                "message": "This form is not available for practice yet.",
            }, status=403)
        return Response(FormDetailSerializer(form).data)
