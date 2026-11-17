from rest_framework.exceptions import APIException


class AssistanceError(APIException):
    """An error body with a code and a message, and never the protected record."""

    def __init__(self, code, message, status_code):
        self.status_code = status_code
        super().__init__({"error": code, "message": message})
