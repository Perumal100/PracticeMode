from django.contrib.auth.models import Group, User
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from attempts.models import Answer, Attempt
from reviewer.models import FormField, PracticeForm
from reviewer.permissions import FORM_REVIEWER_GROUP


class ReviewerPreviewTests(TestCase):
    """A reviewer tries a form with sample answers before deciding (US-04, US-10)."""

    def setUp(self):
        self.reviewer = User.objects.create_user(username="reviewer")
        self.reviewer.groups.add(Group.objects.create(name=FORM_REVIEWER_GROUP))
        self.client = APIClient()
        self.client.force_authenticate(self.reviewer)
        self.form = PracticeForm.objects.create(title="Apply", source_url="https://example.test/apply")
        self.name = FormField.objects.create(practice_form=self.form, position=1, label="Name", input_type="text", required=True)
        self.site = FormField.objects.create(practice_form=self.form, position=2, label="LinkedIn", input_type="url")
        self.url = reverse("review-preview-check", kwargs={"form_id": self.form.id})

    def check(self, answers, client=None):
        return (client or self.client).post(self.url, {"answers": answers}, format="json")

    def test_sample_answers_get_the_learner_feedback_and_nothing_is_saved(self):
        response = self.check({str(self.site.id): "sfnifj"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [(item["fieldId"], item["ruleType"]) for item in response.data["validationFeedback"]],
            [(str(self.name.id), "REQUIRED"), (str(self.site.id), "FORMAT")],
        )
        clean = self.check({str(self.name.id): "Alex", str(self.site.id): "linkedin.com/in/alex"})
        self.assertEqual(clean.data["validationFeedback"], [])
        self.assertFalse(Attempt.objects.exists() or Answer.objects.exists())

    def test_bad_requests(self):
        other = FormField.objects.create(
            practice_form=PracticeForm.objects.create(title="Other", source_url="https://example.test/o"),
            position=1, label="Stray", input_type="text",
        )
        for body in ({}, {"answers": []}, {"answers": {}, "extra": 1}, {"answers": {str(other.id): "x"}}, {"answers": {str(self.name.id): 5}}):
            with self.subTest(body=body):
                self.assertEqual(self.client.post(self.url, body, format="json").status_code, status.HTTP_400_BAD_REQUEST)
        missing = reverse("review-preview-check", kwargs={"form_id": "00000000-0000-0000-0000-000000000000"})
        self.assertEqual(self.client.post(missing, {"answers": {}}, format="json").status_code, status.HTTP_404_NOT_FOUND)

    def test_only_form_reviewers_can_preview(self):
        learner = APIClient()
        learner.force_authenticate(User.objects.create_user(username="learner"))
        self.assertEqual(self.check({}, learner).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.check({}, APIClient()).status_code, status.HTTP_401_UNAUTHORIZED)
