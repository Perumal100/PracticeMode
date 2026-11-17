"""US-18: the preparation checklist served with a practice form."""
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import IntegrityError, transaction

from guidance.models import ChecklistItem
from reviewer.models import PracticeForm

from .base import GuidanceTestCase


class ChecklistTests(GuidanceTestCase):
    def form_data(self, form=None, client=None):
        return (client or self.client).get(f"/api/forms/{(form or self.form).pk}")

    # AC-01, AC-02
    def test_checklist_is_served_in_order_with_its_fictional_examples(self):
        ChecklistItem.objects.create(practice_form=self.form, position=2, description="An email address")
        ChecklistItem.objects.create(practice_form=self.form, position=1, description="A photo ID", fictional_example="Sample licence D000")
        self.assertEqual(self.form_data().data["checklist"], [
            {"position": 1, "description": "A photo ID", "fictional_example": "Sample licence D000"},
            {"position": 2, "description": "An email address", "fictional_example": ""},
        ])

    # AC-03
    def test_form_without_a_checklist_returns_an_empty_list(self):
        self.assertEqual(self.form_data().data["checklist"], [])

    def test_checklist_is_not_shown_for_an_unapproved_form_or_to_other_roles(self):
        pending = PracticeForm.objects.create(title="Pending", source_url="https://example.test/pending")
        ChecklistItem.objects.create(practice_form=pending, position=1, description="A photo ID")
        response = self.form_data(pending)
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("checklist", response.data)
        ChecklistItem.objects.create(practice_form=self.form, position=1, description="A photo ID")
        for name, expected in ((None, 401), ("instructor", 403), ("reviewer", 403)):
            with self.subTest(caller=name):
                response = self.form_data(client=self.client_for(name))
                self.assertEqual(response.status_code, expected)
                self.assertNotIn("checklist", response.data)

    def test_revising_a_form_keeps_its_checklist(self):
        ChecklistItem.objects.create(practice_form=self.form, position=1, description="A photo ID", fictional_example="Sample licence D000")
        response = self.send("post", f"/api/review/forms/{self.form.pk}/revisions", client=self.client_for("reviewer"))
        revision = PracticeForm.objects.get(pk=response.data["id"])
        self.assertEqual(list(revision.checklist_items.values_list("position", "description", "fictional_example")),
                         [(1, "A photo ID", "Sample licence D000")])

    def test_items_need_a_description_and_a_unique_positive_position(self):
        with self.assertRaises(ValidationError):
            ChecklistItem(practice_form=self.form, position=1, description="  ").full_clean()
        ChecklistItem.objects.create(practice_form=self.form, position=1, description="A photo ID")
        for position in (1, 0):
            with self.subTest(position=position), self.assertRaises(IntegrityError), transaction.atomic():
                ChecklistItem.objects.create(practice_form=self.form, position=position, description="Another")

    def test_demo_seed_gives_one_form_a_checklist_and_leaves_the_other_without(self):
        call_command("seed_demo", verbosity=0)
        for _ in range(2):
            call_command("seed_guidance", verbosity=0)
        self.assertEqual(ChecklistItem.objects.filter(practice_form__title__contains="Housing").count(), 4)
        self.assertFalse(ChecklistItem.objects.filter(practice_form__title__contains="Course").exists())
