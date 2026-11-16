from django.urls import path

from .review import ChecklistView, FieldGuidanceView

urlpatterns = [
    path("review/forms/<uuid:form_id>/fields/<uuid:field_id>/guidance", FieldGuidanceView.as_view(), name="review-field-guidance"),
    path("review/forms/<uuid:form_id>/checklist", ChecklistView.as_view(), name="review-checklist"),
]
