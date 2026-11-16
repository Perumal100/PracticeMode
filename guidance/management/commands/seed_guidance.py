"""Fictional guidance for the two demo forms that `seed_demo` creates.

Safe to run again: existing rows are updated, never duplicated. One field per
form is left without a hint on purpose, to show what a learner sees then.
"""
import uuid

from django.core.management.base import BaseCommand
from django.db import transaction

from reviewer.models import PracticeForm

from ...models import ChecklistItem, Hint, Translation

# The housing form is translated into Spanish and, in part, Chinese. The
# education form has no translations, to show what a learner sees then.
GUIDANCE = {
    "housing": {
        "Fictional full name": {
            "hint": "Write a first name and a last name. For practice, make one up, such as Jordan Rivera.",
            "translations": {
                "es": ("Nombre completo ficticio", "Escriba un nombre y un apellido. Para practicar, invente uno, por ejemplo Jordan Rivera."),
                "zh": ("虚构的全名", "请填写名字和姓氏。练习时可以编一个，例如 Jordan Rivera。"),
            },
        },
        "Practice email": {
            "hint": "An email address has a name, an @ sign and a domain, such as jordan@example.test.",
            "translations": {
                "es": ("Correo electrónico de práctica", "Una dirección de correo tiene un nombre, el signo @ y un dominio, por ejemplo jordan@example.test."),
                "zh": ("练习用电子邮箱", "电子邮箱地址由名称、@ 符号和域名组成，例如 jordan@example.test。"),
            },
        },
        "Preferred move date": {
            "translations": {
                "es": ("Fecha de mudanza preferida", "Elija el día en que le gustaría mudarse."),
            },
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


# Only the housing form has a checklist; the course form shows the empty case.
CHECKLISTS = {
    "housing": [
        ("A photo ID, such as a passport or driving licence", "Sample licence number D000-0000-0000"),
        ("Your current address and the date you moved in", "12 Sample Street, Apt 4, Springfield"),
        ("An email address you check often", "jordan@example.test"),
        ("The date you would like to move", ""),
    ],
}


def demo_form(key):
    form_id = uuid.uuid5(uuid.NAMESPACE_URL, f"https://example.test/practicemode-demo/{key}")
    # A revised demo form keeps its guidance under the newest version.
    return PracticeForm.objects.filter(id=form_id).first()


class Command(BaseCommand):
    help = "Add fictional hints, translations and a preparation checklist to the demo forms."

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
                if "hint" in content:
                    Hint.objects.update_or_create(field=field, language_code="en", defaults={"text": content["hint"]})
                for code, (label_text, guidance_text) in content.get("translations", {}).items():
                    Translation.objects.update_or_create(
                        field=field, language_code=code,
                        defaults={"translated_label": label_text, "guidance_text": guidance_text},
                    )
            for position, (description, example) in enumerate(CHECKLISTS.get(key, []), start=1):
                ChecklistItem.objects.update_or_create(
                    practice_form=form, position=position,
                    defaults={"description": description, "fictional_example": example},
                )
            seeded += 1
        self.stdout.write(self.style.SUCCESS(f"Guidance is in place on {seeded} demo form(s)."))
