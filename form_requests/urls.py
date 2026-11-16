from django.urls import path

from .views import LearnerFormRequestView, ReviewFormRequestDeclineView, ReviewFormRequestLinkView, ReviewFormRequestListView

urlpatterns = [
    path("form-requests", LearnerFormRequestView.as_view(), name="form-request-list"),
    path("review/form-requests", ReviewFormRequestListView.as_view(), name="review-form-request-list"),
    path("review/form-requests/<uuid:request_id>/link", ReviewFormRequestLinkView.as_view(), name="review-form-request-link"),
    path("review/form-requests/<uuid:request_id>/decline", ReviewFormRequestDeclineView.as_view(), name="review-form-request-decline"),
]
