"""Form Reviewers write hints, translations and the checklist (US-09, US-12, US-18)."""
from guidance.models import ChecklistItem, Hint, Translation
from reviewer.models import PracticeForm

from .base import GuidanceTestCase


class ReviewerGuidanceTests(GuidanceTestCase):
    def setUp(self):
        super().setUp()
        self.rita = self.client_for("reviewer")

    def put_guidance(self, body, field=None, form=None, client=None):
        form, field = form or self.form, field or self.name
        return self.send("put", f"/api/review/forms/{form.pk}/fields/{field.pk}/guidance", body, client=client or self.rita)

    def put_checklist(self, items, form=None, client=None):
        return self.send("put", f"/api/review/forms/{(form or self.form).pk}/checklist", {"items": items}, client=client or self.rita)

    def test_reviewer_writes_a_hint_and_translations_that_learners_then_see(self):
        response = self.put_guidance({
            "hint": "  Write your first and last name.  ",
            "translations": [
                {"language_code": "es", "translated_label": "Nombre completo", "guidance_text": "Escriba su nombre y apellido."},
                {"language_code": "zh", "translated_label": "全名"},
            ],
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["hint"], "Write your first and last name.")
        learner_view = self.field_data(self.name)
        self.assertEqual(learner_view["hints"], [{"language_code": "en", "text": "Write your first and last name."}])
        self.assertEqual([t["language_code"] for t in learner_view["translations"]], ["es", "zh"])
        reviewer_view = self.rita.get(f"/api/review/forms/{self.form.pk}").data
        field = next(f for f in reviewer_view["fields"] if f["id"] == str(self.name.pk))
        self.assertEqual(field["translations"][0]["translated_label"], "Nombre completo")
        self.assertIn({"code": "es", "name": "Español"}, reviewer_view["guidance_languages"])

    def test_saving_replaces_the_previous_guidance_and_blank_removes_it(self):
        self.put_guidance({"hint": "Old hint", "translations": [{"language_code": "es", "translated_label": "Nombre"}]})
        self.put_guidance({"hint": "", "translations": [{"language_code": "hi", "guidance_text": "अपना पूरा नाम लिखें।"}]})
        self.assertFalse(Hint.objects.exists())
        self.assertEqual(list(Translation.objects.values_list("language_code", flat=True)), ["hi"])

    def test_invalid_guidance_is_400_and_changes_nothing(self):
        self.put_guidance({"hint": "Keep me", "translations": []})
        for body in (
            {"hint": "x", "translations": [{"language_code": "en", "translated_label": "Name"}]},
            {"hint": "x", "translations": [{"language_code": "fr", "translated_label": "Nom"}]},
            {"hint": "x", "translations": [{"language_code": "es"}]},
            {"hint": "x", "translations": [{"language_code": "es", "translated_label": "A"}, {"language_code": "es", "translated_label": "B"}]},
            {"hint": "x" * 1001, "translations": []},
            {"hint": "x", "translations": [], "learner": "maya"},
            {"translations": []},
        ):
            with self.subTest(body=body):
                self.assertEqual(self.put_guidance(body).status_code, 400)
        self.assertEqual(list(Hint.objects.values_list("text", flat=True)), ["Keep me"])

    def test_reviewer_writes_the_checklist_in_order(self):
        response = self.put_checklist([
            {"description": "A photo ID", "fictional_example": "Sample licence D000"},
            {"description": "  Your current address  "},
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.client.get(f"/api/forms/{self.form.pk}").data["checklist"], [
            {"position": 1, "description": "A photo ID", "fictional_example": "Sample licence D000"},
            {"position": 2, "description": "Your current address", "fictional_example": ""},
        ])
        self.assertEqual(self.put_checklist([]).data, [])
        self.assertFalse(ChecklistItem.objects.exists())
        self.assertEqual(self.put_checklist([{"description": ""}]).status_code, 400)

    def test_guidance_is_editable_while_pending_or_approved_only(self):
        pending = PracticeForm.objects.create(title="Pending", source_url="https://example.test/p")
        field = pending.fields.create(position=1, label="Name", input_type="text")
        self.assertEqual(self.put_guidance({"hint": "Hi", "translations": []}, field=field, form=pending).status_code, 200)
        for status in ("REJECTED", "SUPERSEDED", "WITHDRAWN"):
            with self.subTest(status=status):
                PracticeForm.objects.filter(pk=pending.pk).update(status=status)
                response = self.put_guidance({"hint": "Changed", "translations": []}, field=field, form=pending)
                self.assertEqual((response.status_code, response.data["error"]), (409, "GUIDANCE_LOCKED"))
                self.assertEqual(self.put_checklist([{"description": "ID"}], form=pending).status_code, 409)
        self.assertEqual(Hint.objects.get(field=field).text, "Hi")

    def test_a_field_from_another_form_is_404(self):
        other = PracticeForm.objects.create(title="Other", source_url="https://example.test/o", status="APPROVED")
        field = other.fields.create(position=1, label="Other", input_type="text")
        self.assertEqual(self.put_guidance({"hint": "x", "translations": []}, field=field).status_code, 404)

    def test_only_reviewers_write_guidance(self):
        for name, expected in ((None, 401), ("learner-one", 403), ("instructor", 403)):
            with self.subTest(caller=name):
                client = self.client_for(name)
                self.assertEqual(self.put_guidance({"hint": "x", "translations": []}, client=client).status_code, expected)
                self.assertEqual(self.put_checklist([{"description": "ID"}], client=client).status_code, expected)
        self.assertFalse(Hint.objects.exists() or ChecklistItem.objects.exists())
