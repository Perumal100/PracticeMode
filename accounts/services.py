from django.contrib.auth import authenticate, login, logout
from rest_framework.exceptions import APIException, AuthenticationFailed, PermissionDenied

from . import identity


class UsernameTaken(APIException):
    status_code = 409
    default_detail = {"error": "USERNAME_TAKEN", "message": "That username is taken. Choose another one."}


class IdentityUnavailable(APIException):
    status_code = 503
    default_detail = {
        "error": "LEARNER_IDENTITY_UNAVAILABLE",
        "message": "Your account could not be created. Please retry.",
    }


def current_user(user):
    role = identity.role_for(user)
    if role is None:
        raise PermissionDenied({"error": "ROLE_NOT_ALLOWED", "message": "A single PracticeMode role is required."})
    return identity.user_details(user, role)


def sign_in(request, credentials):
    user = authenticate(request, **identity.staff_credentials(credentials["username"], credentials["password"]))
    if user is None:
        raise AuthenticationFailed({"error": "INVALID_CREDENTIALS", "message": "Invalid username or password."})
    details = current_user(user)
    # A requested role is a check, never an elevation.
    if credentials.get("role") and details["role"] != credentials["role"]:
        raise PermissionDenied({"error": "ROLE_NOT_ALLOWED", "message": "This account does not have that role."})
    login(request, user)
    return details


def register_learner(request, data):
    try:
        user = identity.create_learner(data["username"], data["displayName"], data["password"])
    except identity.UsernameTaken:
        raise UsernameTaken() from None
    except identity.LearnerIdentityUnavailable:
        raise IdentityUnavailable() from None
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return current_user(user)


def sign_out(request):
    logout(request)
