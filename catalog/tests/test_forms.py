import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import Resolver404, resolve
from django.utils import timezone
from rest_framework.test import APIClient

from reviewer.models import FormField, FormStatus, PracticeForm, ReviewDecision, ReviewNotification


class CatalogTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        model = get_user_model()
        cls.users = {}
        # Session fixtures exercise authorization; learner sign-in itself is
        # covered by accounts.tests.
        for role in ("LEARNER", "INSTRUCTOR", "FORM_REVIEWER"):
            user = model._default_manager.create_user(**{model.USERNAME_FIELD: role.lower()})
            user.groups.add(Group.objects.create(name=role))
            cls.users[role] = user
        cls.form = PracticeForm.objects.create(
            id=uuid.UUID(int=1), title="Housing application", status=FormStatus.APPROVED,
            source_url="https://private-source.example/housing",
        )
        cls.other = PracticeForm.objects.create(
            id=uuid.UUID(int=2), title="Employment application", status=FormStatus.APPROVED,
            source_url="https://private-source.example/employment",
        )
        cls.unapproved = []
        for status in (FormStatus.AWAITING_REVIEW, FormStatus.REJECTED, FormStatus.FAILED):
            cls.unapproved.append(PracticeForm.objects.create(
                title="Private housing " + status, status=status,
                source_url="https://private-source.example/unapproved",
            ))
        # Insert out of order to test the model's position ordering.
        cls.last_field = FormField.objects.create(
            practice_form=cls.form, position=2, label="Additional information", input_type="textarea",
        )
        cls.first_field = FormField.objects.create(
            practice_form=cls.form, position=1, label="Fictional name", input_type="text",
            required=True, validation={"maxLength": 60},
        )
        cls.decision = ReviewDecision.objects.create(
            practice_form=cls.form, reviewer=cls.users["FORM_REVIEWER"],
            outcome="APPROVED", rejection_reason="",
        )
        cls.notification = ReviewNotification.objects.create(practice_form=cls.form)

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.client.force_login(self.users["LEARNER"])

    def detail_url(self, form=None):
        return f"/api/forms/{(form or self.form).pk}"

    def test_shared_migration_is_applied_to_the_test_database(self):
        self.assertTrue(MigrationRecorder(connection).migration_qs.filter(
            app="reviewer", name="0001_initial",
        ).exists())

    def test_list_contains_only_approved_forms_and_minimal_fields(self):
        response = self.client.get("/api/forms")
        self.assertEqual(response.status_code, 200)
        self.assertEqual({row["id"] for row in response.json()}, {str(self.form.pk), str(self.other.pk)})
        for row in response.json():
            self.assertEqual(set(row), {"id", "title", "status"})
            self.assertEqual(row["status"], "APPROVED")

    def test_list_orders_newest_first_and_breaks_timestamp_ties_by_id(self):
        timestamp = timezone.now()
        PracticeForm.objects.filter(pk__in=[self.form.pk, self.other.pk]).update(created_at=timestamp)
        newest = PracticeForm.objects.create(
            title="Newest", status="APPROVED", source_url="https://example.test/newest",
        )
        PracticeForm.objects.filter(pk=newest.pk).update(created_at=timestamp + timedelta(seconds=1))
        expected = [str(newest.pk), str(self.form.pk), str(self.other.pk)]
        for _ in range(2):
            self.assertEqual([row["id"] for row in self.client.get("/api/forms").json()], expected)

    def test_keyword_search_is_case_insensitive_and_trims_whitespace(self):
        response = self.client.get("/api/forms", {"keyword": "  HOUSING  "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [{
            "id": str(self.form.pk), "title": "Housing application", "status": "APPROVED",
        }])

    def test_empty_search_result_is_an_empty_array(self):
        response = self.client.get("/api/forms", {"keyword": "no matching title"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_no_approved_forms_returns_an_empty_array(self):
        PracticeForm.objects.filter(status="APPROVED").update(status="REJECTED")
        self.assertEqual(self.client.get("/api/forms").json(), [])

    def test_invalid_or_unimplemented_filters_are_rejected(self):
        for query in (
            "keyword=", "keyword=%20%20", "keyword=" + "x" * 201,
            "keyword=housing&keyword=employment", "category=housing", "categories=housing",
            "status=AWAITING_REVIEW", "page=2", "unknown=value", "keyword=housing&category=jobs",
        ):
            with self.subTest(query=query):
                response = self.client.get("/api/forms?" + query)
                self.assertEqual(response.status_code, 400)
                self.assertNotIn("Housing application", str(response.data))

    def test_detail_returns_stored_values_and_ordered_fields_without_review_metadata(self):
        response = self.client.get(self.detail_url())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "id": str(self.form.pk), "title": "Housing application", "status": "APPROVED",
            "fields": [
                {"id": str(self.first_field.pk), "position": 1, "label": "Fictional name",
                 "input_type": "text", "required": True, "validation": {"maxLength": 60}},
                {"id": str(self.last_field.pk), "position": 2, "label": "Additional information",
                 "input_type": "textarea", "required": False, "validation": {}},
            ],
        })
        # Exact shape assertions exclude source, decision, reviewer, notification,
        # and fabricated options/guidance/checklist fields.

    def test_detail_without_stored_fields_returns_an_empty_field_array(self):
        response = self.client.get(self.detail_url(self.other))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["fields"], [])

    def test_detail_rejects_filters(self):
        for query in ("keyword=housing", "category=housing", "status=APPROVED"):
            with self.subTest(query=query):
                self.assertEqual(self.client.get(self.detail_url() + "?" + query).status_code, 400)

    def test_missing_form_returns_404(self):
        response = self.client.get(f"/api/forms/{uuid.uuid4()}")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"error": "FORM_NOT_FOUND"})
        self.assertEqual(self.client.get("/api/forms/not-a-uuid").status_code, 404)

    def test_unapproved_forms_are_denied_without_their_metadata(self):
        for form in self.unapproved:
            with self.subTest(status=form.status):
                response = self.client.get(self.detail_url(form))
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json(), {
                    "error": "FORM_NOT_APPROVED", "message": "This form is not available for practice yet.",
                })

    def test_signed_out_access_returns_401(self):
        client = APIClient()
        for url in ("/api/forms", self.detail_url()):
            response = client.get(url)
            self.assertEqual(response.status_code, 401)
            self.assertNotIn("Housing application", str(response.data))

    def test_wrong_role_denied_before_filters_or_form_lookup(self):
        for role in ("INSTRUCTOR", "FORM_REVIEWER"):
            self.client.force_login(self.users[role])
            for url in ("/api/forms", "/api/forms?status=APPROVED", self.detail_url(),
                        f"/api/forms/{uuid.uuid4()}"):
                with self.subTest(role=role, url=url):
                    response = self.client.get(url)
                    self.assertEqual(response.status_code, 403)
                    self.assertNotIn("Housing application", str(response.data))
                    self.assertNotIn("fields", response.data)

    def test_missing_or_ambiguous_role_cannot_access_catalog(self):
        user = self.users["LEARNER"]
        user.groups.clear()
        self.assertEqual(self.client.get("/api/forms").status_code, 403)
        user.groups.add(*Group.objects.all())
        self.assertEqual(self.client.get(self.detail_url()).status_code, 403)

    def test_responses_reflect_persisted_changes(self):
        self.client.get(self.detail_url())
        PracticeForm.objects.filter(pk=self.form.pk).update(title="Updated housing form")
        FormField.objects.filter(pk=self.first_field.pk).update(label="Updated field label")
        detail = self.client.get(self.detail_url()).json()
        self.assertEqual(detail["title"], "Updated housing form")
        self.assertEqual(detail["fields"][0]["label"], "Updated field label")
        self.assertEqual(self.client.get("/api/forms", {"keyword": "Updated"}).json()[0]["title"],
                         "Updated housing form")
        PracticeForm.objects.filter(pk=self.form.pk).update(status="REJECTED")
        self.assertEqual(self.client.get(self.detail_url()).status_code, 403)
        self.assertEqual(self.client.get("/api/forms", {"keyword": "Updated"}).json(), [])

    def test_reads_do_not_modify_forms_fields_decisions_or_notifications(self):
        models = (PracticeForm, FormField, ReviewDecision, ReviewNotification)
        before = {model: list(model.objects.order_by("pk").values()) for model in models}
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(self.client.get("/api/forms").status_code, 200)
            self.assertEqual(self.client.get(self.detail_url()).status_code, 200)
        for query in queries:
            self.assertTrue(query["sql"].lstrip().upper().startswith("SELECT"), query["sql"])
        after = {model: list(model.objects.order_by("pk").values()) for model in models}
        self.assertEqual(before, after)
        self.notification.refresh_from_db()
        self.assertFalse(self.notification.is_read)

    def test_reviewer_workflow_routes_are_not_shadowed_by_learner_routes(self):
        # Perumal's reviewer app owns these paths. They are unregistered on this
        # branch and registered after integration; either way no accounts,
        # catalog, or attempts view may answer them.
        for url in ("/api/review/forms", "/api/review/notifications", "/api/forms/extractions",
                    f"/api/review/forms/{self.form.pk}", f"/api/review/forms/{self.form.pk}/decision"):
            with self.subTest(url=url):
                try:
                    match = resolve(url)
                except Resolver404:
                    continue
                self.assertFalse(match.func.__module__.startswith(("accounts.", "catalog.", "attempts.")), match.func)
