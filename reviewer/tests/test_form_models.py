from django.core.exceptions import ValidationError
from django.test import TestCase

from reviewer.models import FormStatus, PracticeForm


class PracticeFormModelTests(TestCase):
    def make_form(self, **changes):
        data = {
            "title": "Fictional housing application",
            "source_url": "https://example.test/housing",
            "categories": ["Housing"],
        }
        data.update(changes)
        return PracticeForm(**data)

    def test_valid_categories_are_saved(self):
        form = self.make_form()
        form.full_clean()
        form.save()
        form.refresh_from_db()
        self.assertEqual(form.categories, ["Housing"])

    def test_invalid_categories_are_rejected(self):
        for categories in [
            "Housing",
            [123],
            [" "],
            ["Housing", " housing "],
        ]:
            with self.subTest(categories=categories):
                form = self.make_form(categories=categories)
                with self.assertRaises(ValidationError) as error:
                    form.full_clean()
                self.assertIn("categories", error.exception.message_dict)

    def test_failed_form_requires_failure_reason(self):
        form = self.make_form(status=FormStatus.FAILED)
        with self.assertRaises(ValidationError) as error:
            form.full_clean()
        self.assertIn("failure_reason", error.exception.message_dict)

    def test_failed_form_with_reason_is_saved(self):
        form = self.make_form(
            status=FormStatus.FAILED,
            failure_reason="Unsupported source form.",
        )
        form.full_clean()
        form.save()
        form.refresh_from_db()
        self.assertEqual(form.status, FormStatus.FAILED)
        self.assertEqual(form.failure_reason, "Unsupported source form.")

    def test_categories_default_to_empty_list(self):
        form = PracticeForm(
            title="Fictional form",
            source_url="https://example.test/form",
        )
        form.full_clean()
        self.assertEqual(form.categories, [])