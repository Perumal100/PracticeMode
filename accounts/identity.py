"""User-model integration points; no identity schema is owned by this module."""
import secrets

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import DatabaseError, transaction

LEARNER = "LEARNER"
INSTRUCTOR = "INSTRUCTOR"
FORM_REVIEWER = "FORM_REVIEWER"
ROLES = (LEARNER, INSTRUCTOR, FORM_REVIEWER)


class LearnerIdentityUnavailable(Exception):
    """The learner identity could not be stored."""


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
    # Every sign-in creates a new learner; never match an existing one by name.
    # The team shares Django's default user model and role groups, so a learner
    # is a user with the display name, no email and no usable password. The
    # generated username is the non-personal short code from Sprint 2 that
    # tells learners with the same display name apart.
    model = get_user_model()
    try:
        with transaction.atomic():
            user = model._default_manager.create_user(**{
                model.USERNAME_FIELD: f"learner-{secrets.token_hex(6)}",
                "first_name": display_name,
            })
            user.groups.add(Group.objects.get_or_create(name=LEARNER)[0])
    except DatabaseError:
        raise LearnerIdentityUnavailable from None
    return user
