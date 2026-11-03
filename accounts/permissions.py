from rest_framework.permissions import BasePermission

from .identity import role_for


class HasRole(BasePermission):
    """Protected views declare their allowed_roles; an omitted rule denies access."""

    message = "This role cannot access this resource."

    def has_permission(self, request, view):
        return bool(
            request.user.is_authenticated
            and role_for(request.user) in getattr(view, "allowed_roles", ())
        )
