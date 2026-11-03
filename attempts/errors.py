from rest_framework.exceptions import APIException


class AttemptError(APIException):
    def __init__(self, code, message, status_code, details=None):
        self.status_code = status_code
        detail = {"error": code, "message": message}
        if details is not None:
            detail["details"] = details
        super().__init__(detail)
