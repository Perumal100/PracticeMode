import json
from io import StringIO

from django.contrib.auth.models import Group, User
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from attempts import services
from attempts.models import Attempt
from reviewer.models import FormField, PracticeForm


class ReviewerAnalyticsTests(TestCase):
    """Form Reviewers see how forms are practised, as counts only."""

    @classmethod
    def setUpTestData(cls):
        def user(name, role, first_name=""):
            account = User.objects.create_user(username=name, first_name=first_name)
            account.groups.add(Group.objects.get_or_create(name=role)[0])
            return account

        cls.reviewer = user("reviewer", "FORM_REVIEWER")
        cls.alex = user("learner-aaaa", "LEARNER", "Alex Private")
        cls.sam = user("learner-bbbb", "LEARNER", "Sam Private")
        cls.form = PracticeForm.objects.create(title="Housing", source_url="https://example.test/h", status="APPROVED", categories=["Housing"])
        cls.name = FormField.objects.create(practice_form=cls.form, position=1, label="Name", input_type="text", required=True)
        cls.site = FormField.objects.create(practice_form=cls.form, position=2, label="Website", input_type="url")
        cls.quiet = PracticeForm.objects.create(title="Quiet form", source_url="https://example.test/q", status="APPROVED")
        FormField.objects.create(practice_form=cls.quiet, position=1, label="Name", input_type="text")
        PracticeForm.objects.create(title="Pending", source_url="https://example.test/p")

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.reviewer)

    def practise(self, learner, answers, submit=True):
        attempt = services.create_attempt(learner, self.form.pk)
        for field, value in answers.items():
            services.save_answer(learner, attempt.pk, field.pk, value)
        if submit:
            services.complete_attempt(learner, attempt.pk)
        return attempt

    def seed(self):
        self.practise(self.alex, {self.name: "Alex", self.site: "not a link"})
        self.practise(self.alex, {self.name: "Alex", self.site: "alex.dev"})
        self.practise(self.sam, {self.site: "sfnifj"})
        self.practise(self.sam, {self.name: "Sam"}, submit=False)

    def test_overview_counts_learners_once_and_lists_published_forms(self):
        self.seed()
        response = self.client.get("/api/review/analytics")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["totals"], {
            "publishedForms": 2, "awaitingReview": 1, "learners": 2, "attempts": 4,
            "submitted": 3, "cleanSubmissions": 1, "completionRate": 0.75,
        })
        housing, quiet = response.data["forms"]
        self.assertEqual((housing["title"], housing["learners"], housing["attempts"], housing["submitted"]), ("Housing", 2, 4, 3))
        self.assertEqual(housing["averageIssues"], 1.0)  # 1 + 0 + 2 issues over 3 submissions
        self.assertEqual((quiet["title"], quiet["learners"], quiet["completionRate"]), ("Quiet form", 0, None))

    def test_activity_covers_the_range_ending_today(self):
        self.seed()
        series = self.client.get("/api/review/analytics?days=7").data["activity"]["series"]
        self.assertEqual(len(series), 7)
        self.assertEqual(series[-1], {"date": timezone.localdate().isoformat(), "started": 4, "submitted": 3})
        self.assertEqual(sum(day["started"] for day in series[:-1]), 0)

    def test_form_detail_shows_where_learners_struggle(self):
        self.seed()
        response = self.client.get(f"/api/review/analytics/forms/{self.form.pk}")
        self.assertEqual(response.status_code, 200)
        name, site = response.data["fields"]
        self.assertEqual((name["label"], name["submissionsWithIssue"], name["rules"]), ("Name", 1, {"REQUIRED": 1}))
        self.assertEqual((site["label"], site["submissionsWithIssue"], site["issueRate"], site["rules"]), ("Website", 2, round(2 / 3, 4), {"FORMAT": 2}))
        self.assertEqual(response.data["learners"], 2)
        self.assertIsNotNone(response.data["medianMinutesToSubmit"])

    def test_no_learner_detail_is_ever_returned(self):
        self.seed()
        body = json.dumps([
            self.client.get("/api/review/analytics").data,
            self.client.get(f"/api/review/analytics/forms/{self.form.pk}").data,
        ], default=str)
        for private in ("Alex Private", "Sam Private", "learner-aaaa", "learner-bbbb",
                        "not a link", "sfnifj", "alex.dev", *(str(a.pk) for a in Attempt.objects.all())):
            self.assertNotIn(private, body)

    def test_only_form_reviewers_can_read_analytics(self):
        learner = APIClient()
        learner.force_authenticate(self.alex)
        self.assertEqual(learner.get("/api/review/analytics").status_code, 403)
        self.assertEqual(learner.get(f"/api/review/analytics/forms/{self.form.pk}").status_code, 403)
        self.assertEqual(APIClient().get("/api/review/analytics").status_code, 401)
        admin = APIClient()
        admin.force_authenticate(User.objects.create_superuser("admin", password="x"))
        self.assertEqual(admin.get("/api/review/analytics").status_code, 200)

    def test_bad_requests(self):
        for query in ("?days=5", "?days=week", "?learner=1"):
            with self.subTest(query=query):
                self.assertEqual(self.client.get(f"/api/review/analytics{query}").status_code, 400)
        missing = self.client.get("/api/review/analytics/forms/00000000-0000-0000-0000-000000000000")
        self.assertEqual(missing.status_code, 404)


class SeedDemoActivityTests(TestCase):
    def test_seeds_fictional_activity_and_clears_only_its_own(self):
        form = PracticeForm.objects.create(title="Jobs", source_url="https://example.test/j", status="APPROVED")
        for position, (label, kind, rules) in enumerate((
            ("Name", "text", {"maxLength": 40}), ("Email", "email", {}), ("Phone", "tel", {}),
            ("LinkedIn", "url", {}), ("Start", "date", {}), ("Years", "number", {"min": 0, "max": 50}),
            ("Country", "select", {"allowedValues": ["US", "CA"]}), ("Agree", "checkbox", {}),
        ), start=1):
            FormField.objects.create(practice_form=form, position=position, label=label, input_type=kind, required=position % 2 == 1, validation=rules)
        real = User.objects.create_user("learner-real")
        real.groups.add(Group.objects.get_or_create(name="LEARNER")[0])
        services.create_attempt(real, form.pk)

        call_command("seed_demo_activity", learners=10, stdout=StringIO())
        demo = Attempt.objects.filter(learner__username__startswith="demo-learner-")
        self.assertEqual(demo.values("learner").distinct().count(), 10)
        self.assertTrue(demo.filter(status="COMPLETED").exclude(validation_feedback=[]).exists())
        self.assertTrue(all(a.progress.validation_error_count == len(a.validation_feedback) for a in demo))

        out = StringIO()
        call_command("seed_demo_activity", stdout=out)
        self.assertIn("already exists", out.getvalue())

        call_command("seed_demo_activity", clear=True, stdout=StringIO())
        self.assertFalse(User.objects.filter(username__startswith="demo-learner-").exists())
        self.assertEqual(Attempt.objects.count(), 1)
