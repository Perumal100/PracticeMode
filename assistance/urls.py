from django.urls import path

from .progress import ProgressView
from .views import (
    AssistanceRequestCancelView, AssistanceRequestCompleteView, AssistanceRequestDetailView,
    AssistanceRequestListView, AssistanceRequestScheduleView,
)

urlpatterns = [
    path("assistance-requests", AssistanceRequestListView.as_view(), name="assistance-request-list"),
    path("assistance-requests/<uuid:request_id>", AssistanceRequestDetailView.as_view(), name="assistance-request-detail"),
    path("assistance-requests/<uuid:request_id>/cancel", AssistanceRequestCancelView.as_view(), name="assistance-request-cancel"),
    path("assistance-requests/<uuid:request_id>/schedule", AssistanceRequestScheduleView.as_view(), name="assistance-request-schedule"),
    path("assistance-requests/<uuid:request_id>/complete", AssistanceRequestCompleteView.as_view(), name="assistance-request-complete"),
    path("progress", ProgressView.as_view(), name="learner-progress"),
]
