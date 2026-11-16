"""Practice history: a learner's attempts stay on their account."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from attempts.models import Answer, Attempt, ProgressCounter
from reviewer.models import FormField, PracticeForm


class HistoryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        model = get_user_model()
        cls.users = {}
        for name, role in (("maya", "LEARNER"), ("noor", "LEARNER"), ("ines", "INSTRUCTOR"), ("rita", "FORM_REVIEWER")):
            user = model.objects.create_user(username=name, first_name=name.title(), password="practise-forms-42")
            user.groups.add(Group.objects.get_or_create(name=role)[0])
            cls.users[name] = user
        cls.form = PracticeForm.objects.create(title="Housing application", source_url="https://example.test/h", status="APPROVED")
        cls.name = FormField.objects.create(practice_form=cls.form, position=1, label="Name", input_type="text", required=True)
        cls.email = FormField.objects.create(practice_form=cls.form, position=2, label="Email", input_type="email")
        now = timezone.now()
        cls.older = Attempt.objects.create(learner=cls.users["maya"], practice_form=cls.form, started_at=now - timedelta(days=2),
                                           status="COMPLETED", completed_at=now - timedelta(days=1),
                                           validation_feedback=[{"fieldId": str(cls.email.pk), "ruleType": "FORMAT", "errorMessage": "x"}])
        cls.newer = Attempt.objects.create(learner=cls.users["maya"], practice_form=cls.form, started_at=now - timedelta(hours=1))
        Answer.objects.create(attempt=cls.newer, field=cls.name, value="Jordan Rivera")
        Answer.objects.create(attempt=cls.newer, field=cls.email, value=None)
        cls.others = Attempt.objects.create(learner=cls.users["noor"], practice_form=cls.form)
        for attempt in (cls.older, cls.newer, cls.others):
            ProgressCounter.objects.create(attempt=attempt)

    def client_for(self, name=None):
        client = APIClient()
        if name:
            client.force_login(self.users[name])
        return client

    def test_history_lists_only_the_learners_own_attempts_newest_first(self):
        rows = self.client_for("maya").get("/api/attempts").data
        self.assertEqual([row["id"] for row in rows], [str(self.newer.pk), str(self.older.pk)])
        self.assertEqual(
            {key: rows[0][key] for key in ("formTitle", "formStatus", "status", "answeredCount", "issueCount")},
            {"formTitle": "Housing application", "formStatus": "APPROVED", "status": "IN_PROGRESS", "answeredCount": 1, "issueCount": None},
        )
        self.assertEqual((rows[1]["status"], rows[1]["issueCount"]), ("COMPLETED", 1))

    def test_history_never_includes_answers(self):
        response = self.client_for("maya").get("/api/attempts")
        self.assertNotIn("Jordan Rivera", str(response.data))
        self.assertNotIn("answers", response.data[0])

    def test_history_survives_signing_out_and_back_in(self):
        client = APIClient()
        self.assertTrue(client.login(username="maya", password="practise-forms-42"))
        self.assertEqual(len(client.get("/api/attempts").data), 2)

    def test_new_learner_has_an_empty_history(self):
        Attempt.objects.filter(learner=self.users["noor"]).delete()
        self.assertEqual(self.client_for("noor").get("/api/attempts").data, [])

    def test_only_learners_have_a_history(self):
        for name, expected in ((None, 401), ("ines", 403), ("rita", 403)):
            with self.subTest(caller=name):
                response = self.client_for(name).get("/api/attempts")
                self.assertEqual(response.status_code, expected)
                self.assertNotIn("formTitle", str(response.data))

    def test_history_takes_no_filters(self):
        self.assertEqual(self.client_for("maya").get("/api/attempts", {"learner": "noor"}).status_code, 400)
