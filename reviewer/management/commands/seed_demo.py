import uuid

from django.core.management.base import BaseCommand
from django.db import transaction

from reviewer.models import (
    FormField,
    FormStatus,
    PracticeForm,
    ReviewNotification,
)


class Command(BaseCommand):
    help = "Create fictional practice forms for the demo."

    @transaction.atomic
    def handle(self, *args, **options):
        demo_forms = [
            {
                "key": "housing",
                "title": "DEMO: Fictional Housing Application",
                "categories": ["Housing"],
                "fields": [
                    ("Fictional full name", "text", True),
                    ("Practice email", "email", True),
                    ("Preferred move date", "date", False),
                ],
            },
            {
                "key": "education",
                "title": "DEMO: Fictional Course Registration",
                "categories": ["Education"],
                "fields": [
                    ("Fictional student name", "text", True),
                    ("Practice email", "email", True),
                    ("Learning goals", "textarea", False),
                ],
            },
        ]

        created_count = 0

        for demo in demo_forms:
            form_id = uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"https://example.test/practicemode-demo/{demo['key']}",
            )

            if PracticeForm.objects.filter(id=form_id).exists():
                self.stdout.write(f"Already exists: {demo['title']}")
                continue

            form = PracticeForm(
                id=form_id,
                title=demo["title"],
                source_url=f"https://example.test/{demo['key']}",
                source_available=False,
                categories=demo["categories"],
                status=FormStatus.AWAITING_REVIEW,
            )
            form.full_clean()
            form.save()

            for position, (label, input_type, required) in enumerate(
                demo["fields"], start=1
            ):
                field = FormField(
                    practice_form=form,
                    position=position,
                    label=label,
                    input_type=input_type,
                    required=required,
                )
                field.full_clean()
                field.save()

            ReviewNotification.objects.create(practice_form=form)
            created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Created {created_count} demo forms. "
                "Existing forms were left unchanged."
            )
        )