"""US-12: contextual hints, and the hint-view count US-22 filters on."""
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from attempts.models import Answer, Attempt, ProgressCounter
from guidance.models import Hint
from reviewer.models import PracticeForm

from .base import GuidanceTestCase


class HintTests(GuidanceTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.hint = Hint.objects.create(field=cls.name, text="Write your first and last name, as on your ID.")

    def view_hint(self, attempt_id, field, client=None):
        return self.send("post", f"/api/attempts/{attempt_id}/hint-views", {"fieldId": str(field.pk)}, client=client)

    def count(self, attempt_id):
        return ProgressCounter.objects.get(attempt_id=attempt_id).hint_view_count

    # AC-01
    def test_form_detail_carries_the_hint_with_the_original_label(self):
        data = self.field_data(self.name)
        self.assertEqual(data["label"], "Full name")
        self.assertEqual(data["hints"], [{"language_code": "en", "text": self.hint.text}])

    # AC-03
    def test_field_without_a_hint_returns_no_guidance(self):
        self.assertEqual(self.field_data(self.email)["hints"], [])

    def test_opening_a_hint_is_counted_each_time(self):
        attempt_id = self.start_attempt()
        self.assertEqual(self.view_hint(attempt_id, self.name).data, {"hintViewCount": 1})
        self.assertEqual(self.view_hint(attempt_id, self.name).data, {"hintViewCount": 2})
        self.assertEqual(self.count(attempt_id), 2)

    # AC-02
    def test_opening_a_hint_leaves_saved_answers_unchanged(self):
        attempt_id = self.start_attempt()
        self.send("patch", f"/api/attempts/{attempt_id}/answers/{self.name.pk}", {"value": "Jordan Rivera"})
        saved_at = Answer.objects.get(attempt_id=attempt_id).updated_at
        self.assertEqual(self.view_hint(attempt_id, self.name).status_code, 200)
        answer = Answer.objects.get(attempt_id=attempt_id)
        self.assertEqual((answer.value, answer.updated_at), ("Jordan Rivera", saved_at))

    def test_field_without_a_hint_is_not_counted(self):
        attempt_id = self.start_attempt()
        response = self.view_hint(attempt_id, self.email)
        self.assertEqual((response.status_code, response.data["error"]), (404, "HINT_NOT_FOUND"))
        self.assertEqual(self.count(attempt_id), 0)

    def test_field_from_another_form_is_rejected(self):
        other = PracticeForm.objects.create(title="Other", source_url="https://example.test/other", status="APPROVED")
        field = other.fields.create(position=1, label="Other", input_type="text")
        Hint.objects.create(field=field, text="Another form's hint.")
        attempt_id = self.start_attempt()
        self.assertEqual(self.view_hint(attempt_id, field).status_code, 400)
        self.assertEqual(self.count(attempt_id), 0)

    def test_hint_opened_after_submission_is_not_counted(self):
        attempt_id = self.start_attempt()
        self.send("post", f"/api/attempts/{attempt_id}/completion")
        self.assertEqual(Attempt.objects.get(pk=attempt_id).status, "COMPLETED")
        self.assertEqual(self.view_hint(attempt_id, self.name).status_code, 409)
        self.assertEqual(self.count(attempt_id), 0)

    def test_only_the_owning_learner_can_record_a_hint_view(self):
        attempt_id = self.start_attempt()
        for name, expected in ((None, 401), ("learner-two", 403), ("instructor", 403), ("reviewer", 403)):
            with self.subTest(caller=name):
                response = self.view_hint(attempt_id, self.name, client=self.client_for(name))
                self.assertEqual(response.status_code, expected)
                self.assertNotIn("hintViewCount", response.data)
        self.assertEqual(self.count(attempt_id), 0)

    def test_unknown_request_fields_are_rejected(self):
        attempt_id = self.start_attempt()
        response = self.send("post", f"/api/attempts/{attempt_id}/hint-views", {"fieldId": str(self.name.pk), "count": 50})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.count(attempt_id), 0)

    def test_revising_a_form_keeps_its_hints(self):
        response = self.send("post", f"/api/review/forms/{self.form.pk}/revisions", client=self.client_for("reviewer"))
        self.assertEqual(response.status_code, 201, response.data)
        revision = PracticeForm.objects.get(pk=response.data["id"])
        self.assertEqual(
            list(Hint.objects.filter(field__practice_form=revision).values_list("field__position", "text")),
            [(1, self.hint.text)],
        )


class HintModelTests(GuidanceTestCase):
    def test_blank_text_and_unsupported_languages_are_invalid(self):
        for values in ({"text": "   "}, {"text": "Fine", "language_code": "xx"}):
            with self.subTest(values=values), self.assertRaises(ValidationError):
                Hint(field=self.name, **values).full_clean()

    def test_one_hint_per_field_and_language(self):
        Hint.objects.create(field=self.name, text="First")
        with self.assertRaises(IntegrityError), transaction.atomic():
            Hint.objects.create(field=self.name, text="Second")


class SeedGuidanceTests(GuidanceTestCase):
    def test_seeding_twice_adds_each_demo_hint_once(self):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)
        for _ in range(2):
            call_command("seed_guidance", verbosity=0)
        self.assertEqual(Hint.objects.count(), 4)
        self.assertFalse(Hint.objects.filter(field__label="Preferred move date").exists())
