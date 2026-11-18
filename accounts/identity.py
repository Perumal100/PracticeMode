"""User-model integration points; no identity schema is owned by this module."""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import DatabaseError, IntegrityError, transaction

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


class UsernameTaken(Exception):
    """Another account already uses this username."""


def create_learner(username, display_name, password):
    # A learner account holds a username they chose, a display name and a
    # bcrypt password hash: no email or other personal detail, so the Sprint 1
    # privacy rule still holds while practice history follows the learner.
    model = get_user_model()
    manager = model._default_manager
    try:
        with transaction.atomic():
            if manager.filter(**{f"{model.USERNAME_FIELD}__iexact": username}).exists():
                raise UsernameTaken
            user = manager.create_user(**{model.USERNAME_FIELD: username, "first_name": display_name, "password": password})
            user.groups.add(Group.objects.get_or_create(name=LEARNER)[0])
    except IntegrityError:
        raise UsernameTaken from None
    except DatabaseError:
        raise LearnerIdentityUnavailable from None
    return user
