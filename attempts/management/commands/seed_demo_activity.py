"""Fictional practice activity so the reviewer analytics page has data in a demo.

Creates learners named "Demo learner" (usernames start with demo-learner-)
who practise the approved forms over the past two weeks, with realistic
mistakes. Everything goes through the real validation, so the feedback is
what a learner would get. --clear removes exactly what this command made.
"""
import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.identity import LEARNER
from reviewer.models import FormStatus, PracticeForm

from ...errors import AttemptError
from ...models import Answer, Attempt, ProgressCounter
from ...validation import check_schema, validation_feedback

PREFIX = "demo-learner-"
# How often a demo learner gets a field of this type wrong.
MISTAKE_RATE = {"url": 0.35, "date": 0.3, "tel": 0.25, "email": 0.15, "number": 0.15}


def good_answer(field, rng):
    rules = field.validation
    if field.input_type == "select":
        return rng.choice(rules["allowedValues"])
    if field.input_type == "checkbox":
        return True
    if field.input_type == "number":
        low = int(float(rules.get("min", 1)))
        high = int(float(rules.get("max", low + 10)))
        return str(rng.randint(low, max(low, high)))
    value = {
        "email": "jordan.rivera@example.test",
        "tel": "+1 212 555 0147",
        "url": "https://www.linkedin.com/in/jordan-rivera",
        "date": "2026-01-15",
        "textarea": "I want to practise this form before I apply for real.",
    }.get(field.input_type, "Jordan Rivera")
    if "maxLength" in rules:
        value = value[: rules["maxLength"]]
    return value.ljust(rules.get("minLength", 0), "x")


def wrong_answer(field, rng):
    rules = field.validation
    if field.input_type == "checkbox":
        return False
    if field.required and rng.random() < 0.4:
        return None
    if field.input_type == "number":
        return str(float(rules["max"]) + 5) if "max" in rules else "about ten"
    if "maxLength" in rules and field.input_type in {"text", "textarea"}:
        return "Jordan " * (rules["maxLength"] // 6 + 2)
    return {
        "email": "jordan.rivera@", "tel": "call me", "url": "my linkedin",
        "date": "15/01/2026", "select": "Something else",
    }.get(field.input_type, None if field.required else "")


def answer_for(field, rng, care=1.0):
    if not field.required and rng.random() < 0.3:
        return None  # optional questions are often skipped
    if rng.random() < MISTAKE_RATE.get(field.input_type, 0.08) * care:
        return wrong_answer(field, rng)
    return good_answer(field, rng)


class Command(BaseCommand):
    help = "Add (or --clear) fictional practice activity for the reviewer analytics demo."

    def add_arguments(self, parser):
        parser.add_argument("--learners", type=int, default=24, help="How many demo learners to create (default 24).")
        parser.add_argument("--clear", action="store_true", help="Remove the demo learners and their attempts.")

    @transaction.atomic
    def handle(self, *args, learners, clear, **options):
        demo_users = get_user_model().objects.filter(username__startswith=PREFIX)
        if clear:
            removed, _ = Attempt.objects.filter(learner__in=demo_users).delete()
            count = demo_users.count()
            demo_users.delete()
            self.stdout.write(self.style.SUCCESS(f"Removed {count} demo learners and their practice data ({removed} rows)."))
            return
        if demo_users.exists():
            self.stdout.write("Demo activity already exists. Run with --clear first to start again.")
            return

        forms = []
        for form in PracticeForm.objects.filter(status=FormStatus.APPROVED).prefetch_related("fields"):
            fields = list(form.fields.all())
            try:
                check_schema(fields)
            except AttemptError:
                continue
            forms.append((form, fields))
        if not forms:
            self.stdout.write(self.style.WARNING("No approved forms to practise. Approve a form in the review queue first."))
            return

        rng = random.Random(2026)
        group = Group.objects.get_or_create(name=LEARNER)[0]
        now = timezone.now()
        attempts = []
        for number in range(1, learners + 1):
            user = get_user_model().objects.create_user(username=f"{PREFIX}{number:03d}", first_name="Demo learner")
            user.groups.add(group)
            for form, fields in [entry for entry in forms if rng.random() < 0.7] or [rng.choice(forms)]:
                # Busier recently, as when a form has just been published.
                started = now - timedelta(days=min(13, int(rng.expovariate(0.25))), hours=rng.randint(1, 10), minutes=rng.randint(0, 59))
                attempt = self.practise(user, fields, form, started, rng)
                attempts.append(attempt)
                # Some learners try again after feedback, and make fewer mistakes.
                if attempt.validation_feedback and rng.random() < 0.45 and started < now - timedelta(hours=1):
                    retry_at = started + min(timedelta(hours=rng.randint(1, 30)), (now - started) / 2)
                    attempts.append(self.practise(user, fields, form, retry_at, rng, care=0.3))

        submitted = sum(a.status == Attempt.Status.COMPLETED for a in attempts)
        self.stdout.write(self.style.SUCCESS(
            f"Created {learners} demo learners with {len(attempts)} attempts ({submitted} submitted) on {len(forms)} approved forms."
        ))

    @staticmethod
    def practise(user, fields, form, started, rng, care=1.0):
        attempt = Attempt.objects.create(learner=user, practice_form=form, started_at=started)
        answers = {field.pk: answer_for(field, rng, care) for field in fields}
        Answer.objects.bulk_create(
            Answer(attempt=attempt, field=field, value=answers[field.pk]) for field in fields if answers[field.pk] is not None
        )
        progress = ProgressCounter(attempt=attempt)
        attempt.last_saved_at = started + timedelta(minutes=rng.randint(2, 20))
        if rng.random() < 0.8:
            attempt.status = Attempt.Status.COMPLETED
            attempt.completed_at = attempt.last_saved_at + timedelta(minutes=rng.randint(0, 5))
            attempt.validation_feedback = validation_feedback(fields, answers)
            progress.validation_error_count = len(attempt.validation_feedback)
        attempt.save()
        progress.save()
        return attempt
