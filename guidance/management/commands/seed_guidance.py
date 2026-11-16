"""Fictional guidance for the two demo forms that `seed_demo` creates.

Safe to run again: existing rows are updated, never duplicated. One field per
form is left without a hint on purpose, to show what a learner sees then.
"""
import uuid

from django.core.management.base import BaseCommand
from django.db import transaction

from reviewer.models import PracticeForm

from ...models import Hint

GUIDANCE = {
    "housing": {
        "Fictional full name": {
            "hint": "Write a first name and a last name. For practice, make one up, such as Jordan Rivera.",
        },
        "Practice email": {
            "hint": "An email address has a name, an @ sign and a domain, such as jordan@example.test.",
        },
    },
    "education": {
        "Fictional student name": {
            "hint": "Use the name the school would have on record. For practice, make one up.",
        },
        "Learning goals": {
            "hint": "One or two sentences are enough. Say what you want to be able to do after the course.",
        },
    },
}


def demo_form(key):
    form_id = uuid.uuid5(uuid.NAMESPACE_URL, f"https://example.test/practicemode-demo/{key}")
    # A revised demo form keeps its guidance under the newest version.
    return PracticeForm.objects.filter(id=form_id).first()


class Command(BaseCommand):
    help = "Add fictional hints to the demo forms."

    @transaction.atomic
    def handle(self, *args, **options):
        seeded = 0
        for key, fields in GUIDANCE.items():
            form = demo_form(key)
            if form is None:
                self.stdout.write(self.style.WARNING(f"Demo form '{key}' not found. Run seed_demo first."))
                continue
            by_label = {field.label: field for field in form.fields.all()}
            for label, content in fields.items():
                field = by_label.get(label)
                if field is None:
                    continue
                Hint.objects.update_or_create(field=field, language_code="en", defaults={"text": content["hint"]})
            seeded += 1
        self.stdout.write(self.style.SUCCESS(f"Guidance is in place on {seeded} demo form(s)."))
