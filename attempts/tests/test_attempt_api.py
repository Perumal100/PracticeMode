from datetime import timedelta
import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import DatabaseError, IntegrityError, connection, transaction
from django.db.migrations.recorder import MigrationRecorder
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from attempts.models import Answer, Attempt, ProgressCounter
from reviewer.models import FormField, PracticeForm


class AttemptApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        model = get_user_model()
        cls.users = {}
        for name, role in (("alex-one", "LEARNER"), ("alex-two", "LEARNER"),
                           ("instructor", "INSTRUCTOR"), ("reviewer", "FORM_REVIEWER")):
            user = model._default_manager.create_user(**{model.USERNAME_FIELD: name}, first_name="Alex")
            group, _ = Group.objects.get_or_create(name=role)
            user.groups.add(group)
            cls.users[name] = user
        cls.form = PracticeForm.objects.create(title="Practice form", source_url="https://example.test/form", status="APPROVED")
        cls.name = FormField.objects.create(practice_form=cls.form, position=1, label="Name", input_type="text",
                                           required=True, validation={"minLength": 2, "maxLength": 5})
        cls.email = FormField.objects.create(practice_form=cls.form, position=2, label="Email", input_type="email")
        cls.number = FormField.objects.create(practice_form=cls.form, position=3, label="Number", input_type="number",
                                             validation={"min": 1, "max": 10})
        cls.date = FormField.objects.create(practice_form=cls.form, position=4, label="Date", input_type="date")
        cls.checkbox = FormField.objects.create(practice_form=cls.form, position=5, label="Confirm", input_type="checkbox", required=True)
        cls.select = FormField.objects.create(practice_form=cls.form, position=6, label="Choice", input_type="select",
                                             validation={"allowedValues": ["a", "b"]})
        cls.other_form = PracticeForm.objects.create(title="Other form", source_url="https://example.test/other", status="APPROVED")
        cls.other_field = FormField.objects.create(practice_form=cls.other_form, position=1, label="Other", input_type="text")

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.client.force_login(self.users["alex-one"])
        self.client.get("/api/session")

    def send(self, method, url, data=None, client=None):
        client = client or self.client
        token = client.cookies.get("csrftoken")
        return getattr(client, method)(url, data, format="json", HTTP_X_CSRFTOKEN=token.value if token else "")

    def create(self, form=None, **extra):
        return self.send("post", "/api/attempts", {"formId": str((form or self.form).pk), **extra})

    def attempt(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        return Attempt.objects.get(pk=response.data["id"])

    def url(self, attempt):
        return f"/api/attempts/{attempt.pk}"

    def save(self, attempt, field, value):
        return self.send("patch", f"{self.url(attempt)}/answers/{field.pk}", {"value": value})

    def complete(self, attempt):
        return self.send("post", self.url(attempt) + "/completion")

    def test_migration_applied_and_creation_is_persisted_with_one_progress_record(self):
        self.assertTrue(MigrationRecorder(connection).migration_qs.filter(app="attempts", name="0001_initial").exists())
        response = self.create(displayName="A name never selects an owner")
        self.assertEqual(response.status_code, 201)
        attempt = Attempt.objects.get(pk=response.data["id"])
        self.assertEqual(attempt.learner_id, self.users["alex-one"].pk)
        self.assertEqual(attempt.practice_form, self.form)
        self.assertEqual(response.data["formId"], str(self.form.pk))
        self.assertEqual(response.data["status"], "IN_PROGRESS")
        self.assertIsNone(response.data["lastSavedAt"])
        self.assertIsNone(response.data["completedAt"])
        self.assertEqual(response.data["validationFeedback"], [])
        self.assertEqual(response.data["answers"], [])
        self.assertEqual(attempt.progress.validation_error_count, 0)
        self.assertEqual(attempt.progress.hint_view_count, 0)
        self.assertEqual(ProgressCounter.objects.filter(attempt=attempt).count(), 1)

    def test_only_approved_forms_can_start_attempts(self):
        for status in ("AWAITING_REVIEW", "REJECTED", "FAILED"):
            PracticeForm.objects.filter(pk=self.form.pk).update(status=status)
            response = self.create()
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.data["error"], "FORM_NOT_APPROVED")
        self.assertFalse(Attempt.objects.exists())

    def test_missing_form_is_404(self):
        response = self.send("post", "/api/attempts", {"formId": str(uuid.uuid4())})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error"], "FORM_NOT_FOUND")

    def test_invalid_create_requests_do_not_create_records(self):
        for data in ({}, {"formId": "invalid"}, {"formId": str(self.form.pk), "learnerId": 99}, [], None):
            with self.subTest(data=data):
                self.assertEqual(self.send("post", "/api/attempts", data).status_code, 400)
        self.assertFalse(Attempt.objects.exists())

    def test_autosave_round_trip_matches_frontend_contract(self):
        attempt = self.attempt()
        response = self.save(attempt, self.name, "Alex")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"fieldId", "value", "savedAt"})
        self.assertEqual(response.data["fieldId"], str(self.name.pk))
        self.assertEqual(response.data["value"], "Alex")
        self.assertIsNotNone(response.data["savedAt"])
        attempt.refresh_from_db()
        saved = Answer.objects.get(attempt=attempt, field=self.name)
        self.assertEqual(saved.value, "Alex")
        self.assertEqual(attempt.last_saved_at, saved.updated_at)
        detail = self.client.get(self.url(attempt))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["answers"], [response.data])
        self.assertEqual(detail.data["lastSavedAt"], response.data["savedAt"])
        self.assertNotIn("learner", detail.data)

    def test_answer_upsert_does_not_duplicate_or_modify_other_fields(self):
        attempt = self.attempt()
        self.save(attempt, self.email, "saved@example.test")
        email = Answer.objects.get(attempt=attempt, field=self.email)
        email_timestamp = email.updated_at
        self.save(attempt, self.name, "First")
        self.save(attempt, self.name, "Next")
        self.assertEqual(Answer.objects.filter(attempt=attempt, field=self.name).count(), 1)
        email.refresh_from_db()
        self.assertEqual(email.value, "saved@example.test")
        self.assertEqual(email.updated_at, email_timestamp)
        self.assertEqual([row["fieldId"] for row in self.client.get(self.url(attempt)).data["answers"]],
                         [str(self.name.pk), str(self.email.pk)])

    def test_incomplete_and_rule_invalid_drafts_are_saved(self):
        attempt = self.attempt()
        for field, value in ((self.name, ""), (self.email, "not-email"), (self.number, "not-a-number"),
                             (self.date, "2026-99-99"), (self.checkbox, False), (self.select, "not-an-option")):
            with self.subTest(field=field.input_type):
                self.assertEqual(self.save(attempt, field, value).status_code, 200)
                self.assertEqual(Answer.objects.get(attempt=attempt, field=field).value, value)
        self.assertEqual(self.save(attempt, self.name, None).status_code, 200)
        self.assertIsNone(Answer.objects.get(attempt=attempt, field=self.name).value)

    def test_incompatible_value_shapes_and_unknown_fields_are_rejected(self):
        attempt = self.attempt()
        for field, value in ((self.name, {}), (self.email, []), (self.number, True),
                             (self.checkbox, "yes"), (self.date, 20260101), (self.select, ["a"])):
            with self.subTest(field=field.input_type, value=value):
                response = self.save(attempt, field, value)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["error"], "INVALID_VALUE")
        url = f"{self.url(attempt)}/answers/{self.name.pk}"
        for data in ({}, {"value": "Alex", "fieldId": str(self.email.pk)}, [], "text"):
            self.assertEqual(self.send("patch", url, data).status_code, 400)
        self.assertFalse(Answer.objects.exists())

    def test_fields_must_exist_and_belong_to_the_attempt_form(self):
        attempt = self.attempt()
        response = self.save(attempt, self.other_field, "secret")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "FIELD_FORM_MISMATCH")
        response = self.send("patch", f"{self.url(attempt)}/answers/{uuid.uuid4()}", {"value": "x"})
        self.assertEqual(response.status_code, 404)
        self.assertFalse(Answer.objects.exists())

    def test_missing_attempt_is_404_for_all_resource_endpoints(self):
        missing = f"/api/attempts/{uuid.uuid4()}"
        for response in (self.client.get(missing), self.send("patch", missing + f"/answers/{self.name.pk}", {"value": "x"}),
                         self.send("post", missing + "/completion")):
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.data["error"], "ATTEMPT_NOT_FOUND")

    def test_same_display_name_does_not_grant_another_learner_access(self):
        attempt = self.attempt()
        self.save(attempt, self.name, "Alex")
        self.client.force_login(self.users["alex-two"])
        for response in (self.client.get(self.url(attempt)), self.save(attempt, self.name, "Other"), self.complete(attempt)):
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.data["error"], "ATTEMPT_FORBIDDEN")
            self.assertNotIn("value", response.data)
            self.assertNotIn("answers", response.data)
        self.assertEqual(Answer.objects.get(attempt=attempt, field=self.name).value, "Alex")
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, "IN_PROGRESS")

    def test_signed_out_and_wrong_role_access_for_all_four_endpoints(self):
        attempt = self.attempt()
        clients = [(APIClient(enforce_csrf_checks=True), 401)]
        for role in ("instructor", "reviewer"):
            client = APIClient(enforce_csrf_checks=True)
            client.force_login(self.users[role])
            client.get("/api/session")
            clients.append((client, 403))
        for client, status in clients:
            responses = [self.send("post", "/api/attempts", {"formId": str(self.form.pk)}, client),
                         client.get(self.url(attempt)),
                         self.send("patch", f"{self.url(attempt)}/answers/{self.name.pk}", {"value": "x"}, client),
                         self.send("post", self.url(attempt) + "/completion", client=client)]
            for response in responses:
                self.assertEqual(response.status_code, status)
                self.assertNotIn("answers", response.data)
                self.assertNotIn("formId", response.data)

    def test_unsafe_endpoints_require_csrf_with_a_real_session(self):
        attempt = self.attempt()
        responses = [self.client.post("/api/attempts", {"formId": str(self.form.pk)}, format="json"),
                     self.client.patch(f"{self.url(attempt)}/answers/{self.name.pk}", {"value": "x"}, format="json"),
                     self.client.post(self.url(attempt) + "/completion")]
        for response in responses:
            self.assertEqual(response.status_code, 403)
            self.assertIn("CSRF", response.data["detail"])

    def test_completion_finalizes_with_errors_and_updates_progress(self):
        attempt = self.attempt()
        self.save(attempt, self.name, "Too long")
        self.save(attempt, self.email, "bad")
        self.save(attempt, self.number, "0")
        self.save(attempt, self.date, "2026-02-30")
        self.save(attempt, self.checkbox, False)
        self.save(attempt, self.select, "z")
        response = self.complete(attempt)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"status", "completedAt", "validationFeedback"})
        self.assertEqual(response.data["status"], "COMPLETED")
        self.assertIsNotNone(response.data["completedAt"])
        self.assertEqual([item["ruleType"] for item in response.data["validationFeedback"]],
                         ["MAX_LENGTH", "FORMAT", "MIN_VALUE", "FORMAT", "REQUIRED", "ALLOWED_VALUES"])
        for item in response.data["validationFeedback"]:
            self.assertEqual(set(item), {"fieldId", "ruleType", "errorMessage"})
        attempt.refresh_from_db()
        self.assertEqual(attempt.validation_feedback, response.data["validationFeedback"])
        self.assertEqual(attempt.progress.validation_error_count, 6)
        self.assertEqual(attempt.progress.hint_view_count, 0)
        self.assertEqual(self.client.get(self.url(attempt)).data["status"], "COMPLETED")

    def test_valid_completion_has_empty_feedback(self):
        attempt = self.attempt()
        for field, value in ((self.name, "Alex"), (self.email, "alex@example.test"), (self.number, 5),
                             (self.date, "2026-11-02"), (self.checkbox, True), (self.select, "a")):
            self.assertEqual(self.save(attempt, field, value).status_code, 200)
        response = self.complete(attempt)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["validationFeedback"], [])
        attempt.refresh_from_db()
        self.assertEqual(attempt.progress.validation_error_count, 0)

    def test_empty_attempt_completes_with_required_feedback(self):
        attempt = self.attempt()
        response = self.complete(attempt)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["ruleType"] for item in response.data["validationFeedback"]], ["REQUIRED", "REQUIRED"])

    def test_completion_retries_return_stored_result_without_updates(self):
        attempt = self.attempt()
        first = self.complete(attempt)
        progress = ProgressCounter.objects.get(attempt=attempt)
        original_progress = (progress.validation_error_count, progress.hint_view_count, progress.updated_at)
        # A retry must not revalidate or fabricate new feedback from changed metadata.
        FormField.objects.filter(pk=self.name.pk).update(validation={"unsupported": True})
        with CaptureQueriesContext(connection) as queries:
            repeated = self.complete(attempt)
        self.assertEqual(repeated.status_code, 409)
        self.assertEqual(repeated.data, first.data)
        self.assertFalse(any(q["sql"].lstrip().upper().startswith(("UPDATE", "INSERT")) for q in queries))
        progress.refresh_from_db()
        self.assertEqual((progress.validation_error_count, progress.hint_view_count, progress.updated_at), original_progress)
        self.assertEqual(ProgressCounter.objects.filter(attempt=attempt).count(), 1)

    def test_completed_answers_cannot_be_changed(self):
        attempt = self.attempt()
        self.save(attempt, self.name, "Alex")
        self.complete(attempt)
        before = list(Answer.objects.filter(attempt=attempt).values())
        response = self.save(attempt, self.name, "Other")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"], "ATTEMPT_COMPLETED")
        self.assertEqual(list(Answer.objects.filter(attempt=attempt).values()), before)

    def test_completion_rejects_supplied_answers_and_unknown_filters(self):
        attempt = self.attempt()
        response = self.send("post", self.url(attempt) + "/completion", {"answers": []})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get(self.url(attempt) + "?learnerId=1").status_code, 400)
        self.assertEqual(self.send("post", "/api/attempts?status=COMPLETED", {"formId": str(self.form.pk)}).status_code, 400)
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, "IN_PROGRESS")

    def test_read_returns_persisted_answers_without_writes(self):
        attempt = self.attempt()
        self.save(attempt, self.name, "Alex")
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(self.url(attempt))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))

    def test_creation_rolls_back_if_progress_persistence_fails(self):
        with patch.object(ProgressCounter, "save", side_effect=DatabaseError("simulated failure")):
            response = self.create()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"], "ATTEMPT_CREATE_FAILED")
        self.assertFalse(Attempt.objects.exists())
        self.assertFalse(ProgressCounter.objects.exists())

    def test_save_failure_preserves_previous_answer_and_save_timestamp(self):
        attempt = self.attempt()
        self.save(attempt, self.name, "Alex")
        before_answer = Answer.objects.get(attempt=attempt, field=self.name)
        attempt.refresh_from_db()
        before_save = attempt.last_saved_at
        with patch.object(Attempt, "save", side_effect=DatabaseError("simulated failure after answer write")):
            response = self.save(attempt, self.name, "Other")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data, {"error": "SAVE_FAILED", "message": "Your answer could not be saved. Please retry."})
        after_answer = Answer.objects.get(pk=before_answer.pk)
        attempt.refresh_from_db()
        self.assertEqual(after_answer.value, before_answer.value)
        self.assertEqual(after_answer.updated_at, before_answer.updated_at)
        self.assertEqual(attempt.last_saved_at, before_save)

    def test_first_save_failure_does_not_leave_an_answer(self):
        attempt = self.attempt()
        with patch.object(Attempt, "save", side_effect=DatabaseError("simulated failure")):
            self.assertEqual(self.save(attempt, self.name, "Alex").status_code, 503)
        self.assertFalse(Answer.objects.filter(attempt=attempt).exists())
        attempt.refresh_from_db()
        self.assertIsNone(attempt.last_saved_at)

    def test_completion_failure_rolls_back_status_feedback_and_counters(self):
        attempt = self.attempt()
        with patch.object(ProgressCounter, "save", side_effect=DatabaseError("simulated failure after completion write")):
            response = self.complete(attempt)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"], "COMPLETION_FAILED")
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, "IN_PROGRESS")
        self.assertIsNone(attempt.completed_at)
        self.assertEqual(attempt.validation_feedback, [])
        self.assertEqual(attempt.progress.validation_error_count, 0)
        self.assertEqual(self.complete(attempt).status_code, 200)

    def test_missing_progress_fails_completion_without_partial_state(self):
        attempt = self.attempt()
        attempt.progress.delete()
        self.assertEqual(self.complete(attempt).status_code, 503)
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, "IN_PROGRESS")

    def test_retrieval_database_failure_is_a_503_without_answers(self):
        attempt = self.attempt()
        with patch("attempts.services.prefetch_related_objects", side_effect=DatabaseError("simulated failure")):
            response = self.client.get(self.url(attempt))
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"], "ATTEMPT_UNAVAILABLE")
        self.assertNotIn("answers", response.data)

    def test_unsupported_field_and_rules_are_explicit_and_create_nothing(self):
        for changes, rule in (
            ({"input_type": "file"}, "UNSUPPORTED_FIELD_TYPE"),
            ({"validation": {"pattern": ".*"}}, "pattern"),
            ({"validation": {"maxLength": True}}, "maxLength"),
            ({"validation": {"required": False}}, "required"),
            ({"validation": []}, "INVALID_RULES"),
        ):
            with self.subTest(changes=changes):
                FormField.objects.filter(pk=self.name.pk).update(input_type="text", validation={})
                FormField.objects.filter(pk=self.name.pk).update(**changes)
                response = self.create()
                self.assertEqual(response.status_code, 422)
                self.assertEqual(response.data["error"], "UNSUPPORTED_FORM_SCHEMA")
                self.assertEqual(response.data["details"][0]["fieldId"], str(self.name.pk))
                self.assertEqual(response.data["details"][0]["ruleType"], rule)
        self.assertFalse(Attempt.objects.exists())

    def test_missing_select_options_are_explicit_not_fabricated(self):
        FormField.objects.filter(pk=self.select.pk).update(validation={})
        response = self.create()
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["details"][0]["ruleType"], "ALLOWED_VALUES")

    def test_newly_unsupported_metadata_blocks_save_and_completion_without_mutation(self):
        attempt = self.attempt()
        FormField.objects.filter(pk=self.name.pk).update(validation={"pattern": ".*"})
        self.assertEqual(self.save(attempt, self.name, "Alex").status_code, 422)
        self.assertEqual(self.complete(attempt).status_code, 422)
        self.assertFalse(Answer.objects.exists())
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, "IN_PROGRESS")

    def test_unpublishing_a_form_does_not_destroy_an_existing_attempt(self):
        attempt = self.attempt()
        PracticeForm.objects.filter(pk=self.form.pk).update(status="REJECTED")
        self.assertEqual(self.client.get(self.url(attempt)).status_code, 200)
        self.assertEqual(self.save(attempt, self.name, "Alex").status_code, 200)
        self.assertEqual(self.complete(attempt).status_code, 200)
        self.assertEqual(self.create().status_code, 403)

    def test_database_constraints_reject_invalid_attempt_state_and_timestamps(self):
        attempt = self.attempt()
        before = attempt.started_at - timedelta(seconds=1)
        for changes in ({"status": "UNKNOWN"}, {"status": "COMPLETED"}, {"completed_at": timezone.now()},
                        {"last_saved_at": before}, {"status": "COMPLETED", "completed_at": before}):
            with self.subTest(changes=changes), self.assertRaises(IntegrityError), transaction.atomic():
                Attempt.objects.filter(pk=attempt.pk).update(**changes)

    def test_answer_and_progress_uniqueness_and_nonnegative_counters(self):
        attempt = self.attempt()
        self.save(attempt, self.name, "Alex")
        with self.assertRaises(IntegrityError), transaction.atomic():
            Answer.objects.create(attempt=attempt, field=self.name, value="Duplicate")
        with self.assertRaises(IntegrityError), transaction.atomic():
            ProgressCounter.objects.create(attempt=attempt)
        for field in ("validation_error_count", "hint_view_count"):
            with self.assertRaises(IntegrityError), transaction.atomic():
                ProgressCounter.objects.filter(attempt=attempt).update(**{field: -1})

    def test_referenced_owner_form_and_answer_field_cannot_be_deleted(self):
        attempt = self.attempt()
        self.save(attempt, self.name, "Alex")
        for obj in (self.users["alex-one"], self.form, self.name):
            with self.assertRaises(ProtectedError):
                obj.delete()
