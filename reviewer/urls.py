from django.urls import path

from .views import (
    FormExtractionView,
    ReviewDecisionView,
    ReviewFormDetailView,
    ReviewFormListView,
    ReviewNotificationListView,
)

urlpatterns = [
    path("review/forms", ReviewFormListView.as_view(), name="review-form-list"),
    path("review/forms/<uuid:form_id>", ReviewFormDetailView.as_view(), name="review-form-detail"),
    path("review/forms/<uuid:form_id>/decision", ReviewDecisionView.as_view(), name="review-form-decision"),
    path("review/notifications", ReviewNotificationListView.as_view(), name="review-notifications"),
    path("forms/extractions", FormExtractionView.as_view(), name="form-extraction"),
]
