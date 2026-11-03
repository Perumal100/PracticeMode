from django.urls import path

from .views import FormDetailView, FormListView

urlpatterns = [
    path("forms", FormListView.as_view(), name="form-list"),
    path("forms/<uuid:form_id>", FormDetailView.as_view(), name="form-detail"),
]
