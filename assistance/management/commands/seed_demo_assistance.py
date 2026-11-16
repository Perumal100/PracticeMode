"""Fictional assistance requests so the instructor screens have data in a demo.

Uses the "Demo learner" accounts that `seed_demo_activity` creates: a few
requests wait for any instructor, the rest are booked with one instructor,
whose progress page then lists those learners. --clear removes exactly the
requests this command made.
"""
import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.identity import INSTRUCTOR, role_for
from attempts.models import Attempt, ProgressCounter

from instructors.services import profile_for

from ...models import AssistanceEvent, AssistanceRequest

PREFIX = "demo-learner-"
NOTES = (
    "I do not know what to put for the date question.",
    "The form says my email is wrong and I cannot see why.",
    "I am not sure which questions I have to answer.",
    "Can someone go through the feedback with me?",
)
DEMO_LINK = "https://meet.example.test/practicemode-demo"
ROOMS = ("Room 204, community centre", "Video call, link sent by the front desk", "Library help desk")


class Command(BaseCommand):
    help = "Add (or --clear) fictional assistance requests for the instructor demo."

    def add_arguments(self, parser):
        parser.add_argument("--instructor", default="instructor", help="Username of the instructor who accepts the booked sessions.")
        parser.add_argument("--clear", action="store_true", help="Remove the demo assistance requests.")

    @transaction.atomic
    def handle(self, *args, instructor, clear, **options):
        demo_requests = AssistanceRequest.objects.filter(learner__username__startswith=PREFIX)
        if clear:
            removed, _ = demo_requests.delete()
            self.stdout.write(self.style.SUCCESS(f"Removed {removed} demo assistance request(s)."))
            return
        if demo_requests.exists():
            self.stdout.write("Demo assistance requests already exist. Run with --clear first to start again.")
            return
        staff = get_user_model().objects.filter(username=instructor).first()
        if staff is None or role_for(staff) != INSTRUCTOR:
            self.stdout.write(self.style.WARNING(f"No instructor account named '{instructor}'. Create it first (see the README)."))
            return
        profile = profile_for(staff)
        if not profile.meeting_link:
            profile.meeting_link = DEMO_LINK
            profile.save(update_fields=["meeting_link"])
        learners = list(get_user_model().objects.filter(username__startswith=PREFIX, practice_attempts__isnull=False).distinct().order_by("username")[:8])
        if not learners:
            self.stdout.write(self.style.WARNING("No demo learners with attempts. Run seed_demo_activity first."))
            return

        rng = random.Random(2026)
        now = timezone.now()
        waiting = booked = 0
        for index, learner in enumerate(learners):
            attempt = Attempt.objects.filter(learner=learner).order_by("-started_at").first()
            # Demo learners never opened a hint, so give the progress filters something to find.
            for counter in ProgressCounter.objects.filter(attempt__learner=learner):
                counter.hint_view_count = rng.choice((0, 0, 1, 2, 4, 6))
                counter.save(update_fields=["hint_view_count", "updated_at"])
            request = AssistanceRequest(
                attempt=attempt, learner=learner, note=NOTES[index % len(NOTES)],
                requested_slot=now + timedelta(days=1 + index % 5, hours=rng.randint(1, 6)),
            )
            if index < 3:
                waiting += 1
            else:
                request.status, request.instructor, request.meeting_details = AssistanceRequest.Status.SCHEDULED, staff, ROOMS[index % len(ROOMS)]
                request.meeting_link = profile.meeting_link or DEMO_LINK
                booked += 1
            request.save()
            AssistanceEvent.objects.create(request=request, action=AssistanceEvent.Action.REQUESTED, actor=learner)
            if request.instructor:
                AssistanceEvent.objects.create(request=request, action=AssistanceEvent.Action.SCHEDULED, actor=staff, detail=request.meeting_link)
        self.stdout.write(self.style.SUCCESS(f"Created {waiting} waiting request(s) and {booked} session(s) booked with '{instructor}'."))
