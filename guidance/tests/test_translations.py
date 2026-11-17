"""US-09: translated labels and guidance, served beside the original."""
from django.core.exceptions import ValidationError
from django.core.management import call_command

from attempts.models import Answer
from guidance.models import Hint, Translation
from reviewer.models import PracticeForm

from .base import GuidanceTestCase


class TranslationTests(GuidanceTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        Hint.objects.create(field=cls.name, text="Write your first and last name.")
        cls.spanish = Translation.objects.create(
            field=cls.name, language_code="es", translated_label="Nombre completo",
            guidance_text="Escriba su nombre y apellido.",
        )

    # AC-01
    def test_form_detail_carries_translations_beside_the_original_label(self):
        data = self.field_data(self.name)
        self.assertEqual(data["label"], "Full name")
        self.assertEqual(data["translations"], [{
            "language_code": "es", "translated_label": "Nombre completo", "guidance_text": "Escriba su nombre y apellido.",
        }])

    # AC-02
    def test_original_labels_and_saved_answers_do_not_depend_on_a_language(self):
        attempt_id = self.start_attempt()
        self.send("patch", f"/api/attempts/{attempt_id}/answers/{self.name.pk}", {"value": "Jordan Rivera"})
        self.assertEqual(self.field_data(self.name)["label"], "Full name")
        self.assertEqual(Answer.objects.get(attempt_id=attempt_id).value, "Jordan Rivera")
        # The form endpoint takes no language parameter; choosing one is a display choice.
        self.assertEqual(self.client.get(f"/api/forms/{self.form.pk}", {"language": "es"}).status_code, 400)

    # AC-03
    def test_missing_translation_is_an_empty_list_while_the_language_stays_selectable(self):
        response = self.client.get(f"/api/forms/{self.form.pk}")
        self.assertIn({"code": "hi", "name": "हिन्दी"}, response.data["guidance_languages"])
        self.assertEqual(self.field_data(self.email)["translations"], [])
        # The original guidance is still there to fall back to.
        self.assertEqual(self.field_data(self.name)["hints"][0]["language_code"], "en")

    def test_other_roles_cannot_read_guidance(self):
        for name, expected in ((None, 401), ("instructor", 403), ("reviewer", 403)):
            with self.subTest(caller=name):
                response = self.client_for(name).get(f"/api/forms/{self.form.pk}")
                self.assertEqual(response.status_code, expected)
                self.assertNotIn("fields", response.data)

    def test_revising_a_form_keeps_its_translations(self):
        response = self.send("post", f"/api/review/forms/{self.form.pk}/revisions", client=self.client_for("reviewer"))
        revision = PracticeForm.objects.get(pk=response.data["id"])
        self.assertEqual(
            list(Translation.objects.filter(field__practice_form=revision).values_list("language_code", "translated_label")),
            [("es", "Nombre completo")],
        )

    def test_translation_needs_content_and_a_language_other_than_the_original(self):
        invalid = (
            {"language_code": "zh"},
            {"language_code": "en", "translated_label": "Full name"},
            {"language_code": "xx", "translated_label": "Nom"},
        )
        for values in invalid:
            with self.subTest(values=values), self.assertRaises(ValidationError):
                Translation(field=self.email, **values).full_clean()
        Translation(field=self.email, language_code="zh", translated_label="电子邮箱").full_clean()

    def test_demo_seed_translates_one_form_and_leaves_the_other_untranslated(self):
        call_command("seed_demo", verbosity=0)
        for _ in range(2):
            call_command("seed_guidance", verbosity=0)
        seeded = Translation.objects.exclude(pk=self.spanish.pk)
        self.assertEqual(seeded.count(), 5)
        self.assertFalse(seeded.filter(field__practice_form__title__contains="Course Registration").exists())
