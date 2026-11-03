from django.contrib.auth.models import Group, User
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from reviewer.models import FormField, FormStatus, PracticeForm
from reviewer.permissions import FORM_REVIEWER_GROUP


class ReviewerFormEditingTests(TestCase):
    """A reviewer corrects an extracted form before deciding (US-04, US-10)."""

    def setUp(self):
        self.reviewer = User.objects.create_user(username="reviewer", password="test-password")
        self.reviewer.groups.add(Group.objects.create(name=FORM_REVIEWER_GROUP))
        self.client = APIClient()
        self.client.force_authenticate(self.reviewer)
        self.form = PracticeForm.objects.create(
            title="Apply for this job", source_url="https://job-boards.example.io/embed/job_app",
        )
        self.name = FormField.objects.create(practice_form=self.form, position=1, label="Name", input_type="text", required=True)
        self.email = FormField.objects.create(practice_form=self.form, position=2, label="Email", input_type="email")
        self.country = FormField.objects.create(
            practice_form=self.form, position=3, label="Country", input_type="select",
            validation={"allowedValues": ["US", "Canada"]},
        )

    def url(self, name, **kwargs):
        return reverse(name, kwargs={"form_id": self.form.id, **kwargs})

    def field_url(self, field):
        return self.url("review-field-detail", field_id=field.id)

    def labels(self):
        return list(self.form.fields.order_by("position").values_list("position", "label"))

    def test_reviewer_corrects_title_and_source(self):
        response = self.client.patch(self.url("review-form-detail"), {
            "title": "Senior Software Engineer",
            "source_url": "https://careers.datadoghq.com/detail/8052118/?gh_jid=8052118",
            "source_available": True,
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "Senior Software Engineer")
        self.assertEqual(response.data["source_url"], "https://careers.datadoghq.com/detail/8052118/?gh_jid=8052118")
        self.form.refresh_from_db()
        self.assertTrue(self.form.source_available)

    def test_invalid_source_url_is_400(self):
        response = self.client.patch(self.url("review-form-detail"), {"source_url": "not a url"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reviewer_edits_a_field(self):
        response = self.client.patch(self.field_url(self.country), {
            "label": "Country of residence", "required": True,
            "validation": {"allowedValues": ["United States", "Canada", "Mexico"]},
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.country.refresh_from_db()
        self.assertEqual(self.country.label, "Country of residence")
        self.assertTrue(self.country.required)
        self.assertEqual(self.country.validation, {"allowedValues": ["United States", "Canada", "Mexico"]})
        self.assertEqual(self.country.input_type, "select")

    def test_changing_the_type_must_bring_matching_rules(self):
        # A select without options cannot be practised, so it is refused.
        refused = self.client.patch(self.field_url(self.name), {"input_type": "select"}, format="json")
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        accepted = self.client.patch(self.field_url(self.name), {"input_type": "select", "validation": {"allowedValues": ["A", "B"]}}, format="json")
        self.assertEqual(accepted.status_code, status.HTTP_200_OK)

    def test_field_edits_reject_unsupported_rules_and_unknown_keys(self):
        for payload in ({"validation": {"pattern": "\\d+"}}, {"label": "  "}, {"position": 9}, {"answer": "x"}, {}):
            with self.subTest(payload=payload):
                response = self.client.patch(self.field_url(self.email), payload, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.email.refresh_from_db()
        self.assertEqual((self.email.label, self.email.validation), ("Email", {}))

    def test_reviewer_marks_a_text_field_as_a_link(self):
        response = self.client.patch(self.field_url(self.name), {"input_type": "url", "validation": {"maxLength": 255}}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.name.refresh_from_db()
        self.assertEqual((self.name.input_type, self.name.validation), ("url", {"maxLength": 255}))
        refused = self.client.patch(self.field_url(self.name), {"validation": {"min": 1}}, format="json")
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reviewer_adds_a_missing_field_at_the_end(self):
        response = self.client.post(self.url("review-field-list"), {
            "label": "LinkedIn profile", "input_type": "text", "validation": {"maxLength": 200},
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.labels()[-1], (4, "LinkedIn profile"))
        self.assertEqual(len(response.data["fields"]), 4)

    def test_reviewer_deletes_a_wrong_field_and_positions_close_up(self):
        response = self.client.delete(self.field_url(self.email))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.labels(), [(1, "Name"), (2, "Country")])

    def test_the_last_field_cannot_be_deleted(self):
        self.client.delete(self.field_url(self.email))
        self.client.delete(self.field_url(self.country))
        response = self.client.delete(self.field_url(self.name))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"], "FORM_NEEDS_A_FIELD")
        self.assertEqual(self.labels(), [(1, "Name")])

    def test_reviewer_reorders_fields(self):
        order = [self.country.id, self.name.id, self.email.id]
        response = self.client.put(self.url("review-field-order"), {"fieldIds": [str(i) for i in order]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.labels(), [(1, "Country"), (2, "Name"), (3, "Email")])

    def test_reorder_must_list_every_field_once(self):
        for ids in ([self.name.id, self.email.id], [self.name.id, self.name.id, self.email.id], [self.name.id, self.email.id, self.country.id, self.name.id]):
            with self.subTest(ids=ids):
                response = self.client.put(self.url("review-field-order"), {"fieldIds": [str(i) for i in ids]}, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.labels(), [(1, "Name"), (2, "Email"), (3, "Country")])

    def test_a_field_of_another_form_is_404(self):
        other = PracticeForm.objects.create(title="Other", source_url="https://example.test/other")
        stray = FormField.objects.create(practice_form=other, position=1, label="Stray", input_type="text")
        self.assertEqual(self.client.patch(self.field_url(stray), {"label": "x"}, format="json").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.delete(self.field_url(stray)).status_code, status.HTTP_404_NOT_FOUND)

    def test_reviewed_forms_are_locked(self):
        self.form.status = FormStatus.APPROVED
        self.form.save()
        attempts = [
            self.client.patch(self.field_url(self.name), {"label": "Changed"}, format="json"),
            self.client.post(self.url("review-field-list"), {"label": "New", "input_type": "text"}, format="json"),
            self.client.delete(self.field_url(self.name)),
            self.client.put(self.url("review-field-order"), {"fieldIds": [str(self.email.id), str(self.name.id), str(self.country.id)]}, format="json"),
            self.client.patch(self.url("review-form-detail"), {"source_url": "https://example.test/new"}, format="json"),
        ]
        self.assertEqual([r.status_code for r in attempts], [status.HTTP_409_CONFLICT] * 5)
        self.assertEqual(self.labels(), [(1, "Name"), (2, "Email"), (3, "Country")])

    def test_only_form_reviewers_can_edit(self):
        learner = User.objects.create_user(username="learner", password="test-password")
        client = APIClient()
        client.force_authenticate(learner)
        self.assertEqual(client.patch(self.field_url(self.name), {"label": "x"}, format="json").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(client.post(self.url("review-field-list"), {"label": "x", "input_type": "text"}, format="json").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(client.delete(self.field_url(self.name)).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(APIClient().delete(self.field_url(self.name)).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.labels(), [(1, "Name"), (2, "Email"), (3, "Country")])
