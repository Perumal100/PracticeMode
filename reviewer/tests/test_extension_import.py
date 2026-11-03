from django.contrib.auth.models import Group, User
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from reviewer.models import FormStatus, PracticeForm
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
