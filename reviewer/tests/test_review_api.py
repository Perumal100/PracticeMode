from django.contrib.auth.models import Group, User
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from reviewer.models import FormField, FormStatus, PracticeForm, ReviewDecision, ReviewNotification
from reviewer.permissions import FORM_REVIEWER_GROUP


class FormReviewerApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.reviewer = User.objects.create_user(username="reviewer", password="test-password")
        self.reviewer.groups.add(Group.objects.create(name=FORM_REVIEWER_GROUP))
        self.learner = User.objects.create_user(username="learner", password="test-password")
        self.pending_form = PracticeForm.objects.create(
            title="Fictional housing application",
            source_url="https://example.test/housing",
        )
        FormField.objects.create(
            practice_form=self.pending_form,
            position=0,
            label="Fictional full name",
            input_type="text",
            required=True,
            validation={"maxLength": 100},
        )
        self.notification = ReviewNotification.objects.create(practice_form=self.pending_form)

    def reviewer_client(self):
        client = APIClient()
        client.force_authenticate(self.reviewer)
        return client

    def decision_url(self, form=None):
        return reverse("review-form-decision", kwargs={"form_id": (form or self.pending_form).id})

    def test_signed_out_reviewer_endpoint_returns_401_without_review_data(self):
        response = self.client.get(reverse("review-form-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn("results", response.data)
        self.assertNotIn("Fictional housing application", str(response.data))

    def test_non_reviewer_cannot_read_queue_or_make_decision(self):
        self.client.force_authenticate(self.learner)
        queue = self.client.get(reverse("review-form-list"))
        decision = self.client.post(self.decision_url(), {"decision": "APPROVE"}, format="json")
        self.assertEqual(queue.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(decision.status_code, status.HTTP_403_FORBIDDEN)
        self.pending_form.refresh_from_db()
        self.assertEqual(self.pending_form.status, FormStatus.AWAITING_REVIEW)
        self.assertFalse(ReviewDecision.objects.exists())

    def test_reviewer_sees_pending_schema_source_and_notification(self):
        client = self.reviewer_client()
        queue = client.get(reverse("review-form-list"))
        detail = client.get(reverse("review-form-detail", kwargs={"form_id": self.pending_form.id}))
        notifications = client.get(reverse("review-notifications"))
        self.assertEqual(queue.status_code, status.HTTP_200_OK)
        self.assertEqual(len(queue.data), 1)
        self.assertEqual(detail.data["source_url"], "https://example.test/housing")
        self.assertEqual(detail.data["fields"][0]["label"], "Fictional full name")
        self.assertTrue(detail.data["fields"][0]["required"])
        self.assertEqual(len(notifications.data), 1)
        self.assertEqual(notifications.data[0]["form_id"], str(self.pending_form.id))

    def test_rejection_requires_a_reason_and_preserves_pending_status_when_missing(self):
        response = self.reviewer_client().post(self.decision_url(), {"decision": "REJECT"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.pending_form.refresh_from_db()
        self.assertEqual(self.pending_form.status, FormStatus.AWAITING_REVIEW)
        self.assertFalse(ReviewDecision.objects.exists())

    def test_approval_records_reviewer_timestamp_and_prevents_duplicate_decision(self):
        client = self.reviewer_client()
        approved = client.post(self.decision_url(), {"decision": "APPROVE"}, format="json")
        duplicate = client.post(self.decision_url(), {"decision": "APPROVE"}, format="json")
        self.assertEqual(approved.status_code, status.HTTP_200_OK)
        self.assertEqual(approved.data["status"], FormStatus.APPROVED)
        decision = ReviewDecision.objects.get(practice_form=self.pending_form)
        self.assertEqual(decision.reviewer, self.reviewer)
        self.assertEqual(decision.outcome, ReviewDecision.Outcome.APPROVED)
        self.assertIsNotNone(decision.decided_at)
        self.notification.refresh_from_db()
        self.assertTrue(self.notification.is_read)
        self.assertEqual(duplicate.status_code, status.HTTP_409_CONFLICT)

    def test_rejection_records_reason_and_removes_form_from_default_pending_queue(self):
        client = self.reviewer_client()
        response = client.post(
            self.decision_url(),
            {"decision": "REJECT", "rejection_reason": "Required date field was extracted as text."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], FormStatus.REJECTED)
        self.assertEqual(response.data["decision"]["rejection_reason"], "Required date field was extracted as text.")
        self.assertEqual(client.get(reverse("review-form-list")).data, [])

    def test_extraction_creates_pending_schema_and_notification(self):
        response = self.reviewer_client().post(
            reverse("form-extraction"),
            {
                "title": "Fictional benefits request",
                "source_url": "https://example.test/benefits",
                "source_available": False,
                "fields": [{"position": 0, "label": "Practice identifier", "input_type": "text", "required": True}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], FormStatus.AWAITING_REVIEW)
        self.assertFalse(response.data["source_available"])
        created = PracticeForm.objects.get(id=response.data["id"])
        self.assertTrue(ReviewNotification.objects.filter(practice_form=created).exists())

    def test_extraction_rejects_answer_values_and_duplicate_field_positions(self):
        client = self.reviewer_client()
        answer_payload = {
            "title": "Invalid import",
            "source_url": "https://example.test/invalid",
            "fields": [{"position": 0, "label": "Name", "input_type": "text", "answer": "private learner data"}],
        }
        answer_response = client.post(reverse("form-extraction"), answer_payload, format="json")
        duplicate_response = client.post(
            reverse("form-extraction"),
            {
                "title": "Duplicate positions",
                "source_url": "https://example.test/duplicate",
                "fields": [
                    {"position": 0, "label": "One", "input_type": "text"},
                    {"position": 0, "label": "Two", "input_type": "text"},
                ],
            },
            format="json",
        )
        self.assertEqual(answer_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(duplicate_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PracticeForm.objects.filter(title__in=["Invalid import", "Duplicate positions"]).exists())
