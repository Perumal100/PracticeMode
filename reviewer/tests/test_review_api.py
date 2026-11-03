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

    def category_payload(self):
        return {
            "title": "Fictional category test",
            "source_url": "https://example.test/categories",
            "fields": [
                {"position": 0, "label": "Name", "input_type": "text"},
            ],
        }

    def test_extraction_saves_categories_and_exposes_them_in_queue_and_detail(self):
        client = self.reviewer_client()
        payload = self.category_payload()
        # Surrounding whitespace should be removed before saving.
        payload["categories"] = [" Housing ", "Education"]

        response = client.post(reverse("form-extraction"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        expected = ["Housing", "Education"]
        self.assertEqual(response.data["categories"], expected)

        created = PracticeForm.objects.get(id=response.data["id"])
        self.assertEqual(created.categories, expected)

        detail = client.get(
            reverse("review-form-detail", kwargs={"form_id": created.id})
        )
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(detail.data["categories"], expected)

        queue = client.get(reverse("review-form-list"))
        self.assertEqual(queue.status_code, status.HTTP_200_OK)
        queued_form = next(
            item for item in queue.data if str(item["id"]) == str(created.id)
        )
        self.assertEqual(queued_form["categories"], expected)

    def test_extraction_rejects_blank_or_duplicate_categories_without_saving(self):
        client = self.reviewer_client()
        invalid_categories = [
            [""],
            ["   "],
            ["Housing", " housing "],
        ]
        # Invalid requests must not create forms, fields, or notifications.
        before = (
            PracticeForm.objects.count(),
            FormField.objects.count(),
            ReviewNotification.objects.count(),
        )

        for categories in invalid_categories:
            with self.subTest(categories=categories):
                payload = self.category_payload()
                payload["categories"] = categories

                response = client.post(
                    reverse("form-extraction"), payload, format="json"
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("categories", response.data)
                self.assertEqual(
                    (
                        PracticeForm.objects.count(),
                        FormField.objects.count(),
                        ReviewNotification.objects.count(),
                    ),
                    before,
                )

    def test_extraction_defaults_to_empty_categories_when_omitted(self):
        response = self.reviewer_client().post(
            reverse("form-extraction"),
            self.category_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["categories"], [])
        created = PracticeForm.objects.get(id=response.data["id"])
        self.assertEqual(created.categories, [])

    def test_reviewer_can_edit_pending_form_metadata(self):
        response = self.reviewer_client().patch(
            reverse("review-form-detail", kwargs={"form_id": self.pending_form.id}),
            {"title": "Updated housing form", "categories": [" Housing "]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.pending_form.refresh_from_db()
        self.assertEqual(self.pending_form.title, "Updated housing form")
        self.assertEqual(self.pending_form.categories, ["Housing"])
        self.assertEqual(self.pending_form.status, FormStatus.AWAITING_REVIEW)
        self.assertEqual(response.data["categories"], ["Housing"])
        self.assertFalse(ReviewDecision.objects.exists())

    def test_partial_edit_preserves_omitted_metadata(self):
        client = self.reviewer_client()
        url = reverse("review-form-detail", kwargs={"form_id": self.pending_form.id})
        original_title = self.pending_form.title

        response = client.patch(url, {"categories": ["Housing"]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.pending_form.refresh_from_db()
        self.assertEqual(self.pending_form.title, original_title)

        response = client.patch(url, {"title": "New title"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.pending_form.refresh_from_db()
        self.assertEqual(self.pending_form.title, "New title")
        self.assertEqual(self.pending_form.categories, ["Housing"])

    def test_edit_rejects_invalid_or_protected_fields_without_changes(self):
        client = self.reviewer_client()
        url = reverse("review-form-detail", kwargs={"form_id": self.pending_form.id})
        original_title = self.pending_form.title
        original_updated_at = self.pending_form.updated_at

        # A rejected edit must leave the stored form unchanged.
        invalid_payloads = [
            {},
            {"title": "   "},
            {"categories": ["   "]},
            {"categories": ["Housing", " housing "]},
            {"title": "Blocked change", "status": "APPROVED"},
            {"fields": []},
            {"failure_reason": "Not editable here"},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                response = client.patch(url, payload, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.pending_form.refresh_from_db()
                self.assertEqual(self.pending_form.title, original_title)
                self.assertEqual(self.pending_form.categories, [])
                self.assertEqual(self.pending_form.status, FormStatus.AWAITING_REVIEW)
                self.assertEqual(self.pending_form.updated_at, original_updated_at)

    def test_non_pending_forms_cannot_be_edited(self):
        client = self.reviewer_client()

        # Approval, rejection, and extraction failure all block metadata edits.
        for form_status in (
            FormStatus.APPROVED,
            FormStatus.REJECTED,
            FormStatus.FAILED,
        ):
            with self.subTest(form_status=form_status):
                form = PracticeForm.objects.create(
                    title="Locked form",
                    source_url="https://example.test/locked",
                    status=form_status,
                    failure_reason="Unsupported source." if form_status == FormStatus.FAILED else "",
                )
                response = client.patch(
                    reverse("review-form-detail", kwargs={"form_id": form.id}),
                    {"title": "Must not change"},
                    format="json",
                )

                self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
                form.refresh_from_db()
                self.assertEqual(form.title, "Locked form")
                self.assertEqual(form.status, form_status)

    def test_edit_requires_reviewer_permissions(self):
        url = reverse("review-form-detail", kwargs={"form_id": self.pending_form.id})

        response = self.client.patch(url, {"title": "Blocked"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(self.learner)
        response = self.client.patch(url, {"title": "Blocked"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.pending_form.refresh_from_db()
        self.assertEqual(self.pending_form.title, "Fictional housing application")

    def test_edit_missing_form_returns_404(self):
        response = self.reviewer_client().patch(
            reverse(
                "review-form-detail",
                kwargs={"form_id": "00000000-0000-0000-0000-000000000000"},
            ),
            {"title": "Missing form"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)