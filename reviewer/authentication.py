from rest_framework.authentication import SessionAuthentication


class SessionAuthenticationWith401(SessionAuthentication):
    """Keep cookie authentication while returning the documented 401 for guests."""

    def authenticate_header(self, request):
        return "Session"
