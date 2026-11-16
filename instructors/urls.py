from django.urls import path

from . import views

urlpatterns = [
    path("instructor-signup", views.InstructorSignupView.as_view(), name="instructor-signup"),
    path("instructor/profile", views.OwnProfileView.as_view(), name="instructor-profile"),
    path("instructor/forms", views.PublishedFormListView.as_view(), name="instructor-forms"),
    path("instructor/forms/<uuid:form_id>", views.PublishedFormDetailView.as_view(), name="instructor-form-detail"),
    path("instructor/change-requests", views.ChangeRequestListView.as_view(), name="instructor-change-requests"),
    path("review/instructors", views.ReviewInstructorListView.as_view(), name="review-instructors"),
    path("review/instructors/<int:user_id>/<str:action>", views.ReviewInstructorActionView.as_view(), name="review-instructor-action"),
    path("review/change-requests", views.ReviewChangeRequestListView.as_view(), name="review-change-requests"),
    path("review/change-requests/<uuid:change_id>/<str:action>", views.ReviewChangeRequestActionView.as_view(), name="review-change-request-action"),
]
