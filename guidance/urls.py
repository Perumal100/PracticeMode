from django.urls import path

from .review import AIDraftView, ApproveDraftsView, ChecklistView, DiscardDraftsView, FieldGuidanceView

urlpatterns = [
    path("review/forms/<uuid:form_id>/fields/<uuid:field_id>/guidance", FieldGuidanceView.as_view(), name="review-field-guidance"),
    path("review/forms/<uuid:form_id>/checklist", ChecklistView.as_view(), name="review-checklist"),
    path("review/forms/<uuid:form_id>/guidance/ai", AIDraftView.as_view(), name="review-guidance-ai"),
    path("review/forms/<uuid:form_id>/guidance/approve-drafts", ApproveDraftsView.as_view(), name="review-guidance-approve"),
    path("review/forms/<uuid:form_id>/guidance/discard-drafts", DiscardDraftsView.as_view(), name="review-guidance-discard"),
]
