from django.urls import path

from .views import LoginView, LogoutView, SessionView

urlpatterns = [
    path("login", LoginView.as_view(), name="login"),
    path("logout", LogoutView.as_view(), name="logout"),
    path("session", SessionView.as_view(), name="session"),
]
