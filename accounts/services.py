from django.contrib.auth import authenticate, login, logout
from rest_framework.exceptions import APIException, AuthenticationFailed, PermissionDenied

from . import identity


class IdentityUnavailable(APIException):
    status_code = 503
    default_detail = {
        "error": "LEARNER_IDENTITY_UNAVAILABLE",
        "message": "Learner access could not be started. Please retry.",
    }


def current_user(user):
    role = identity.role_for(user)
    if role is None:
        raise PermissionDenied({"error": "ROLE_NOT_ALLOWED", "message": "A single PracticeMode role is required."})
    return identity.user_details(user, role)


def sign_in(request, credentials):
    requested_role = credentials.get("role")
    if requested_role == identity.LEARNER:
        try:
            user = identity.create_learner(credentials["displayName"])
        except identity.LearnerIdentityUnavailable:
            raise IdentityUnavailable() from None
    else:
        user = authenticate(request, **identity.staff_credentials(credentials["username"], credentials["password"]))
        if user is None:
            raise AuthenticationFailed({"error": "INVALID_CREDENTIALS", "message": "Invalid username or password."})

    details = current_user(user)
    # A password must never become an alternative learner access flow.
    if (requested_role and details["role"] != requested_role) or (
        requested_role != identity.LEARNER and details["role"] == identity.LEARNER
    ):
        raise PermissionDenied({"error": "ROLE_NOT_ALLOWED", "message": "This access method is not allowed for this role."})
    login(request, user)
    return details


def sign_out(request):
    logout(request)
