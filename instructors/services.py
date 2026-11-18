from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.identity import INSTRUCTOR
from assistance.services import release_instructor_sessions

from .models import InstructorProfile

Status = InstructorProfile.Status


class UsernameTaken(Exception):
    pass


def profile_for(user):
    """The instructor's profile; instructors created before profiles existed get an active one."""
    profile, _ = InstructorProfile.objects.get_or_create(user=user, defaults={"status": Status.ACTIVE})
    return profile


def _group():
    return Group.objects.get_or_create(name=INSTRUCTOR)[0]


def create_instructor(*, username, full_name, password, meeting_link, organisation="", active=False, by=None):
    model = get_user_model()
    first, _, last = full_name.strip().partition(" ")
    try:
        with transaction.atomic():
            if model.objects.filter(username__iexact=username).exists():
                raise UsernameTaken
            user = model.objects.create_user(username=username, password=password, first_name=first, last_name=last.strip())
            profile = InstructorProfile.objects.create(
                user=user, meeting_link=meeting_link, organisation=organisation,
                status=Status.ACTIVE if active else Status.PENDING,
                decided_at=timezone.now() if active else None, decided_by=by,
            )
            if active:
                user.groups.add(_group())
    except IntegrityError:
        raise UsernameTaken from None
    return profile


def set_status(profile, status, by, note=""):
    """Approve, decline, remove or restore. The INSTRUCTOR role exists only while ACTIVE."""
    with transaction.atomic():
        profile.status, profile.decided_by, profile.decided_at, profile.decision_note = status, by, timezone.now(), note
        profile.save(update_fields=["status", "decided_by", "decided_at", "decision_note"])
        if status == Status.ACTIVE:
            profile.user.groups.add(_group())
        else:
            profile.user.groups.remove(_group())
        if status == Status.REMOVED:
            # Learners whose session this instructor had accepted go back to the waiting queue.
            release_instructor_sessions(profile.user, by)
    return profile
