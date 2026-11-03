from django.contrib.auth.models import Group, User
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from reviewer.models import FormStatus, PracticeForm, ReviewNotification
from reviewer.permissions import FORM_REVIEWER_GROUP

EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
CSRF_SECRET = "a" * 32


@override_settings(CSRF_TRUSTED_ORIGINS=[EXTENSION_ORIGIN])
class ExtensionImportTests(TestCase):
    """API-15 as the browser extension calls it: a real session, CSRF, and its own origin."""

    def setUp(self):
        reviewer = User.objects.create_user(username="reviewer", password="test-password")
        reviewer.groups.add(Group.objects.create(name=FORM_REVIEWER_GROUP))
        self.client = APIClient(enforce_csrf_checks=True)
        self.client.force_login(reviewer)
        self.client.cookies["csrftoken"] = CSRF_SECRET

    def post(self, origin):
        return self.client.post(
            reverse("form-extraction"),
            {
                "title": "Fictional library card",
                "source_url": "http://localhost:4317/library",
                "fields": [
                    {"position": 1, "label": "Practice name", "input_type": "text", "required": True,
                     "validation": {"maxLength": 80}},
                    {"position": 2, "label": "Branch", "input_type": "select",
                     "validation": {"allowedValues": ["North", "South"]}},
                ],
            },
            format="json",
            HTTP_ORIGIN=origin,
            HTTP_X_CSRFTOKEN=CSRF_SECRET,
        )

    def test_trusted_extension_origin_can_import_for_review(self):
        response = self.post(EXTENSION_ORIGIN)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], FormStatus.AWAITING_REVIEW)
        self.assertEqual(response.data["fields"][1]["validation"], {"allowedValues": ["North", "South"]})

    def test_untrusted_extension_origin_is_refused_without_creating_a_form(self):
        response = self.post("chrome-extension://someotherextensionidxxxxxxxxxxxx")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(PracticeForm.objects.exists())


class ImportContractTests(TestCase):
    """API-15 rules that keep imported forms practisable and reviewed once."""

    def setUp(self):
        reviewer = User.objects.create_user(username="reviewer", password="test-password")
        reviewer.groups.add(Group.objects.create(name=FORM_REVIEWER_GROUP))
        self.client = APIClient()
        self.client.force_authenticate(reviewer)

    def payload(self, *fields, source_url="https://example.test/apply"):
        return {"title": "Fictional application", "source_url": source_url,
                "fields": list(fields) or [{"position": 1, "label": "Name", "input_type": "text"}]}

    def post(self, payload):
        return self.client.post(reverse("form-extraction"), payload, format="json")

    def test_second_import_of_a_pending_source_is_409_and_stores_nothing(self):
        self.assertEqual(self.post(self.payload()).status_code, status.HTTP_201_CREATED)
        duplicate = self.post(self.payload())
        self.assertEqual(duplicate.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(duplicate.data["error"], "DUPLICATE_PENDING_IMPORT")
        self.assertEqual(PracticeForm.objects.count(), 1)
        self.assertEqual(ReviewNotification.objects.count(), 1)

    def test_a_reviewed_source_can_be_imported_again(self):
        first = self.post(self.payload())
        PracticeForm.objects.filter(id=first.data["id"]).update(status=FormStatus.REJECTED)
        self.assertEqual(self.post(self.payload()).status_code, status.HTTP_201_CREATED)

    def test_supported_rules_are_accepted(self):
        response = self.post(self.payload(
            {"position": 1, "label": "Name", "input_type": "text", "required": True, "validation": {"minLength": 2, "maxLength": 50, "required": True}},
            {"position": 2, "label": "Age", "input_type": "number", "validation": {"min": "18", "max": 120}},
            {"position": 3, "label": "Size", "input_type": "select", "validation": {"allowedValues": ["1", "2"]}},
            {"position": 4, "label": "Agree", "input_type": "checkbox"},
            {"position": 5, "label": "LinkedIn profile", "input_type": "url", "validation": {"maxLength": 255}},
        ))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_rules_learners_could_not_be_checked_against_are_400(self):
        cases = {
            "pattern": {"position": 1, "label": "Zip", "input_type": "text", "validation": {"pattern": "\\d{5}"}},
            "range on text": {"position": 1, "label": "Name", "input_type": "text", "validation": {"min": 1}},
            "select without options": {"position": 1, "label": "Size", "input_type": "select"},
            "blank option": {"position": 1, "label": "Size", "input_type": "select", "validation": {"allowedValues": ["1", " "]}},
            "bad length": {"position": 1, "label": "Name", "input_type": "text", "validation": {"maxLength": "50"}},
            "reversed length": {"position": 1, "label": "Name", "input_type": "text", "validation": {"minLength": 9, "maxLength": 3}},
            "reversed range": {"position": 1, "label": "Age", "input_type": "number", "validation": {"min": 9, "max": 3}},
            "required mismatch": {"position": 1, "label": "Name", "input_type": "text", "validation": {"required": True}},
            "not an object": {"position": 1, "label": "Name", "input_type": "text", "validation": ["maxLength"]},
        }
        for name, field in cases.items():
            with self.subTest(name):
                response = self.post(self.payload(field, source_url=f"https://example.test/{name.replace(' ', '-')}"))
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PracticeForm.objects.exists())
