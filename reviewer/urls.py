from django.urls import path

from .views import (
    FormExtractionView,
    ReviewDecisionView,
    ReviewFieldDetailView,
    ReviewFieldListView,
    ReviewFieldOrderView,
    ReviewFormDetailView,
    ReviewFormListView,
    ReviewNotificationListView,
    ReviewPreviewCheckView,
)

urlpatterns = [
    path("review/forms", ReviewFormListView.as_view(), name="review-form-list"),
    path("review/forms/<uuid:form_id>", ReviewFormDetailView.as_view(), name="review-form-detail"),
    path("review/forms/<uuid:form_id>/decision", ReviewDecisionView.as_view(), name="review-form-decision"),
    path("review/forms/<uuid:form_id>/fields", ReviewFieldListView.as_view(), name="review-field-list"),
    path("review/forms/<uuid:form_id>/fields/order", ReviewFieldOrderView.as_view(), name="review-field-order"),
    path("review/forms/<uuid:form_id>/fields/<uuid:field_id>", ReviewFieldDetailView.as_view(), name="review-field-detail"),
    path("review/forms/<uuid:form_id>/preview-check", ReviewPreviewCheckView.as_view(), name="review-preview-check"),
    path("review/notifications", ReviewNotificationListView.as_view(), name="review-notifications"),
    path("forms/extractions", FormExtractionView.as_view(), name="form-extraction"),
]
