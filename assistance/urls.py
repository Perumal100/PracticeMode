from django.urls import path

from .views import AssistanceRequestCancelView, AssistanceRequestDetailView, AssistanceRequestListView

urlpatterns = [
    path("assistance-requests", AssistanceRequestListView.as_view(), name="assistance-request-list"),
    path("assistance-requests/<uuid:request_id>", AssistanceRequestDetailView.as_view(), name="assistance-request-detail"),
    path("assistance-requests/<uuid:request_id>/cancel", AssistanceRequestCancelView.as_view(), name="assistance-request-cancel"),
]
