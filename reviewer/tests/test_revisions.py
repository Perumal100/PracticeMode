from django.contrib.auth.models import Group, User
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from attempts import services
from attempts.models import Attempt
from reviewer.models import FormField, FormStatus, PracticeForm
from reviewer.permissions import FORM_REVIEWER_GROUP


class FormRevisionTests(TestCase):
    """An approved form is revised when its source page changes."""

    def setUp(self):
        self.reviewer = User.objects.create_user(username="reviewer")
        self.reviewer.groups.add(Group.objects.create(name=FORM_REVIEWER_GROUP))
        self.client = APIClient()
        self.client.force_authenticate(self.reviewer)
        self.learner = User.objects.create_user(username="learner")
        self.learner.groups.add(Group.objects.create(name="LEARNER"))
        self.learner_client = APIClient()
        self.learner_client.force_authenticate(self.learner)
        self.form = PracticeForm.objects.create(
            title="Apply", source_url="https://example.test/apply", status=FormStatus.APPROVED, categories=["Jobs"],
        )
        self.name = FormField.objects.create(practice_form=self.form, position=1, label="Name", input_type="text", required=True)
        FormField.objects.create(practice_form=self.form, position=2, label="Website", input_type="text", validation={"maxLength": 200})

    def revise(self, form=None):
        return self.client.post(reverse("review-form-revisions", kwargs={"form_id": (form or self.form).id}))

    def decide(self, form_id, decision, reason=""):
        body = {"decision": decision, **({"rejection_reason": reason} if reason else {})}
        return self.client.post(reverse("review-form-decision", kwargs={"form_id": form_id}), body, format="json")

    def test_revision_copies_the_form_for_editing_while_learners_keep_the_original(self):
        response = self.revise()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        revision = response.data
        self.assertEqual((revision["status"], revision["revision_of"], revision["title"], revision["categories"]), ("AWAITING_REVIEW", self.form.id, "Apply", ["Jobs"]))
        self.assertEqual([(f["label"], f["input_type"]) for f in revision["fields"]], [("Name", "text"), ("Website", "text")])
        self.assertNotIn(self.name.id, [f["id"] for f in revision["fields"]])

        # The source now asks for a link: correct the copy, not the live form.
        website = revision["fields"][1]["id"]
        edit = self.client.patch(reverse("review-field-detail", kwargs={"form_id": revision["id"], "field_id": website}), {"input_type": "url"}, format="json")
        self.assertEqual(edit.status_code, status.HTTP_200_OK)
        self.assertEqual(self.form.fields.get(position=2).input_type, "text")
        self.assertEqual(self.learner_client.get(f"/api/forms/{self.form.id}").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(reverse("review-form-detail", kwargs={"form_id": self.form.id})).data["open_revision"], revision["id"])

    def test_approving_the_revision_replaces_the_original_and_keeps_old_attempts(self):
        attempt = services.create_attempt(self.learner, self.form.id)
        services.save_answer(self.learner, attempt.id, self.name.id, "Alex")
        revision = self.revise().data
        self.assertEqual(self.decide(revision["id"], "APPROVE").status_code, status.HTTP_200_OK)

        self.form.refresh_from_db()
        self.assertEqual(self.form.status, FormStatus.SUPERSEDED)
        self.assertEqual(self.client.get(reverse("review-form-detail", kwargs={"form_id": self.form.id})).data["replaced_by"], revision["id"])
        catalog = self.learner_client.get("/api/forms").data
        self.assertEqual([f["id"] for f in catalog], [str(revision["id"])])
        gone = self.learner_client.get(f"/api/forms/{self.form.id}")
        self.assertEqual((gone.status_code, gone.data["error"], gone.data["replacedBy"]), (410, "FORM_REPLACED", revision["id"]))
        self.assertEqual(Attempt.objects.get(id=attempt.id).answers.get().value, "Alex")

        # A second revision replaces the first; old links lead to the newest.
        second = self.revise(PracticeForm.objects.get(id=revision["id"])).data
        self.decide(second["id"], "APPROVE")
        self.assertEqual(self.learner_client.get(f"/api/forms/{self.form.id}").data["replacedBy"], second["id"])

    def test_rejecting_the_revision_leaves_the_original_published(self):
        revision = self.revise().data
        self.decide(revision["id"], "REJECT", "Source unchanged after all")
        self.form.refresh_from_db()
        self.assertEqual(self.form.status, FormStatus.APPROVED)
        self.assertIsNone(self.client.get(reverse("review-form-detail", kwargs={"form_id": self.form.id})).data["replaced_by"])
        self.assertEqual(self.revise().status_code, status.HTTP_201_CREATED)

    def test_only_one_pending_copy_and_only_of_approved_forms(self):
        first = self.revise().data
        again = self.revise()
        self.assertEqual((again.status_code, again.data["error"], again.data["formId"]), (409, "REVISION_PENDING", first["id"]))
        self.assertEqual(self.revise(PracticeForm.objects.get(id=first["id"])).status_code, status.HTTP_409_CONFLICT)
        missing = self.client.post(reverse("review-form-revisions", kwargs={"form_id": "00000000-0000-0000-0000-000000000000"}))
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

    def test_only_form_reviewers_can_revise(self):
        url = reverse("review-form-revisions", kwargs={"form_id": self.form.id})
        self.assertEqual(self.learner_client.post(url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(APIClient().post(url).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(PracticeForm.objects.count(), 1)
