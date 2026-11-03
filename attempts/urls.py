from django.urls import path

from .analytics import AnalyticsFormView, AnalyticsOverviewView
from .views import AnswerSaveView, AttemptCompletionView, AttemptCreateView, AttemptDetailView

urlpatterns = [
    path("attempts", AttemptCreateView.as_view(), name="attempt-create"),
    path("attempts/<uuid:attempt_id>", AttemptDetailView.as_view(), name="attempt-detail"),
    path("attempts/<uuid:attempt_id>/answers/<uuid:field_id>", AnswerSaveView.as_view(), name="answer-save"),
    path("attempts/<uuid:attempt_id>/completion", AttemptCompletionView.as_view(), name="attempt-completion"),
    path("review/analytics", AnalyticsOverviewView.as_view(), name="analytics-overview"),
    path("review/analytics/forms/<uuid:form_id>", AnalyticsFormView.as_view(), name="analytics-form"),
]
