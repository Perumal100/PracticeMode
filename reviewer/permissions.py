from rest_framework.permissions import BasePermission

FORM_REVIEWER_GROUP = "FORM_REVIEWER"


def is_form_reviewer(user) -> bool:
    return bool(user and user.is_authenticated and (user.is_superuser or user.groups.filter(name=FORM_REVIEWER_GROUP).exists()))


class IsFormReviewer(BasePermission):
    message = "Form Reviewer permission is required."

    def has_permission(self, request, view) -> bool:
        return is_form_reviewer(request.user)
