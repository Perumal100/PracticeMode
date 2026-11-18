"""Learners see a form's versions and what changed; reviewers delete forms."""
from django.contrib.auth.models import Group, User
from django.test import TestCase
from rest_framework.test import APIClient

from assistance.models import AssistanceRequest
from attempts import services
from attempts.models import Attempt
from form_requests.models import FormRequest
from guidance.models import Hint
from reviewer.models import FormField, FormStatus, PracticeForm, ReviewDecision, ReviewNotification


class VersionTestCase(TestCase):
    def setUp(self):
        self.reviewer = User.objects.create_user(username="rita")
        self.reviewer.groups.add(Group.objects.create(name="FORM_REVIEWER"))
        self.learner = User.objects.create_user(username="maya")
        self.learner.groups.add(Group.objects.create(name="LEARNER"))
        self.other = User.objects.create_user(username="noor")
        self.other.groups.add(Group.objects.get(name="LEARNER"))
        self.instructor = User.objects.create_user(username="ines")
        self.instructor.groups.add(Group.objects.create(name="INSTRUCTOR"))
        self.clients = {}
        for user in (self.reviewer, self.learner, self.other, self.instructor):
            client = APIClient()
            client.force_authenticate(user)
            self.clients[user.username] = client
        self.form = PracticeForm.objects.create(title="Apply", source_url="https://example.test/apply", status=FormStatus.AWAITING_REVIEW)
        FormField.objects.create(practice_form=self.form, position=1, label="Name", input_type="text", required=True)
        FormField.objects.create(practice_form=self.form, position=2, label="Website", input_type="text")
        FormField.objects.create(practice_form=self.form, position=3, label="Fax number", input_type="tel")
        self.decide(self.form, "APPROVE")

    def decide(self, form, decision):
        body = {"decision": decision, **({"rejection_reason": "Not right"} if decision == "REJECT" else {})}
        response = self.clients["rita"].post(f"/api/review/forms/{form.id}/decision", body, format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def revise(self, form, edit=None):
        response = self.clients["rita"].post(f"/api/review/forms/{form.id}/revisions")
        self.assertEqual(response.status_code, 201, response.data)
        revision = PracticeForm.objects.get(id=response.data["id"])
        if edit:
            edit(revision)
        return revision


class VersionHistoryTests(VersionTestCase):
    def update_source(self, revision):
        website = revision.fields.get(label="Website")
        website.input_type, website.required = "url", True
        website.save()
        revision.fields.get(label="Fax number").delete()
        FormField.objects.create(practice_form=revision, position=4, label="Email", input_type="email")

    def test_learners_see_each_published_version_and_what_changed(self):
        second = self.revise(self.form, self.update_source)
        self.decide(second, "APPROVE")
        rejected = self.revise(second)
        self.decide(rejected, "REJECT")
        history = self.clients["maya"].get(f"/api/forms/{second.id}/versions").data
        self.assertEqual([(row["version"], row["id"], row["current"]) for row in history],
                         [(2, str(second.id), True), (1, str(self.form.id), False)])
        self.assertEqual(history[0]["changes"], {
            "added": ["Email"], "removed": ["Fax number"],
            "changed": [{"label": "Website", "details": ["answer type changed from text to link", "now required"]}],
        })
        self.assertIsNone(history[1]["changes"])
        self.assertEqual(history[0]["fieldCount"], 3)
        # The same history is reachable from the old version.
        self.assertEqual(self.clients["maya"].get(f"/api/forms/{self.form.id}/versions").data, history)

    def test_form_detail_carries_its_version_number(self):
        self.assertEqual(self.clients["maya"].get(f"/api/forms/{self.form.id}").data["version"], 1)
        second = self.revise(self.form)
        self.decide(second, "APPROVE")
        self.assertEqual(self.clients["maya"].get(f"/api/forms/{second.id}").data["version"], 2)

    def test_history_rows_carry_the_version_practised(self):
        attempt = services.create_attempt(self.learner, self.form.id)
        second = self.revise(self.form)
        self.decide(second, "APPROVE")
        services.create_attempt(self.learner, second.id)
        rows = self.clients["maya"].get("/api/attempts").data
        self.assertEqual(sorted((row["formVersion"], row["formStatus"]) for row in rows), [(1, "SUPERSEDED"), (2, "APPROVED")])
        # The old version stays readable for its learner; its attempt can still be finished.
        self.assertEqual(self.clients["maya"].get(f"/api/forms/{self.form.id}").status_code, 200)
        self.assertEqual(services.save_answer(self.learner, attempt.id, self.form.fields.get(position=1).id, "Maya").value, "Maya")

    def test_versions_of_an_unpublished_form_are_not_shown(self):
        pending = PracticeForm.objects.create(title="Draft", source_url="https://example.test/draft")
        response = self.clients["maya"].get(f"/api/forms/{pending.id}/versions")
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("title", str(response.data))
        for name in ("rita", "ines"):
            self.assertEqual(self.clients[name].get(f"/api/forms/{self.form.id}/versions").status_code, 403)
        self.assertEqual(APIClient().get(f"/api/forms/{self.form.id}/versions").status_code, 401)


class RemovalTests(VersionTestCase):
    def delete(self, form, client="rita"):
        return self.clients[client].delete(f"/api/review/forms/{form.id}")

    def test_a_form_nobody_practised_is_deleted_with_its_versions_and_guidance(self):
        Hint.objects.create(field=self.form.fields.first(), text="Your name.")
        pending_revision = self.revise(self.form)
        request = FormRequest.objects.create(learner=self.learner, url=self.form.source_url, source_key=self.form.source_url,
                                             status="LINKED", form=self.form)
        response = self.delete(self.form)
        self.assertEqual(response.data, {"outcome": "DELETED"})
        for model in (PracticeForm, FormField, ReviewDecision, ReviewNotification, Hint):
            self.assertFalse(model.objects.exists(), model.__name__)
        request.refresh_from_db()
        self.assertIsNone(request.form)
        self.assertEqual(self.clients["maya"].get(f"/api/forms/{pending_revision.id}").status_code, 404)

    def test_a_practised_form_is_withdrawn_and_its_learners_keep_their_history(self):
        attempt = services.create_attempt(self.learner, self.form.id)
        field = self.form.fields.get(position=1)
        services.save_answer(self.learner, attempt.id, field.id, "Maya")
        AssistanceRequest.objects.create(attempt=attempt, learner=self.learner, requested_slot="2030-01-01T10:00:00Z", note="Help")
        revision = self.revise(self.form)
        self.assertEqual(self.delete(revision).data, {"outcome": "WITHDRAWN"})
        statuses = set(PracticeForm.objects.values_list("status", flat=True))
        self.assertEqual(statuses, {FormStatus.WITHDRAWN})
        # Gone from the catalog and the review queue; nobody can start it.
        self.assertEqual(self.clients["maya"].get("/api/forms").data, [])
        self.assertEqual(self.clients["rita"].get("/api/review/forms").data, [])
        self.assertEqual(self.clients["maya"].post("/api/attempts", {"formId": str(self.form.id)}, format="json").status_code, 403)
        # Its learner still sees the form and their answers, read-only.
        kept = self.clients["maya"].get(f"/api/forms/{self.form.id}")
        self.assertEqual((kept.status_code, kept.data["status"]), (200, "WITHDRAWN"))
        self.assertEqual(self.clients["maya"].get(f"/api/attempts/{attempt.id}").data["answers"][0]["value"], "Maya")
        saved = self.clients["maya"].patch(f"/api/attempts/{attempt.id}/answers/{field.id}", {"value": "Other"}, format="json")
        self.assertEqual((saved.status_code, saved.data["error"]), (409, "FORM_REMOVED"))
        done = self.clients["maya"].post(f"/api/attempts/{attempt.id}/completion", format="json")
        self.assertEqual((done.status_code, done.data["error"]), (409, "FORM_REMOVED"))
        self.assertEqual(Attempt.objects.get().status, "IN_PROGRESS")
        # Other learners are told it was removed.
        gone = self.clients["noor"].get(f"/api/forms/{self.form.id}")
        self.assertEqual((gone.status_code, gone.data["error"]), (410, "FORM_REMOVED"))

    def test_removing_twice_or_a_missing_form(self):
        self.assertEqual(self.delete(self.form).status_code, 200)
        self.assertEqual(self.delete(self.form).status_code, 404)
        attempt_form = PracticeForm.objects.create(title="Other", source_url="https://example.test/o", status="APPROVED")
        Attempt.objects.create(learner=self.learner, practice_form=attempt_form)
        self.delete(attempt_form)
        self.assertEqual(self.delete(attempt_form).status_code, 409)

    def test_only_reviewers_can_delete(self):
        for name, expected in (("maya", 403), ("ines", 403)):
            self.assertEqual(self.delete(self.form, name).status_code, expected)
        self.assertEqual(APIClient().delete(f"/api/review/forms/{self.form.id}").status_code, 401)
        self.assertEqual(PracticeForm.objects.get().status, FormStatus.APPROVED)
