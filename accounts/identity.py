"""User-model integration points; no identity schema is owned by this module."""
from django.contrib.auth import get_user_model

LEARNER = "LEARNER"
INSTRUCTOR = "INSTRUCTOR"
FORM_REVIEWER = "FORM_REVIEWER"
ROLES = (LEARNER, INSTRUCTOR, FORM_REVIEWER)


class LearnerIdentityUnavailable(Exception):
    """Learner persistence must be supplied with the agreed user-model contract."""


def staff_credentials(username, password):
    return {get_user_model().USERNAME_FIELD: username, "password": password}


def role_for(user):
    # Match the existing group convention. Missing/ambiguous roles fail closed;
    # Django is_staff/is_superuser flags do not select an application role.
    roles = list(user.groups.filter(name__in=ROLES).values_list("name", flat=True))
    return roles[0] if len(roles) == 1 else None


def user_details(user, role):
    # Prefer the proposed field; retain Django's existing name accessor until
    # Atheer's field contract is available. Never substitute a login identifier.
    display_name = getattr(user, "display_name", None)
    if display_name is None:
        get_full_name = getattr(user, "get_full_name", None)
        display_name = get_full_name() if get_full_name else ""
    return {"id": str(user.pk), "displayName": display_name, "role": role}


def create_learner(display_name):
    # Do not match an existing learner by name or invent a temporary schema.
    raise LearnerIdentityUnavailable
