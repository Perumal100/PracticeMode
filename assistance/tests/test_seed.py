from django.core.management import call_command

from assistance.models import AssistanceRequest
from reviewer.models import PracticeForm

from .base import AssistanceTestCase


class SeedDemoAssistanceTests(AssistanceTestCase):
    def seed(self, *args):
        call_command("seed_demo_assistance", *args, instructor="ines", verbosity=0)

    def test_seeds_waiting_and_booked_requests_once_and_clears_only_its_own(self):
        PracticeForm.objects.filter(pk=self.form.pk).update(status="APPROVED")
        call_command("seed_demo_activity", learners=8, verbosity=0)
        mine = self.make_request()
        for _ in range(2):
            self.seed()
        demo = AssistanceRequest.objects.filter(learner__username__startswith="demo-learner-")
        self.assertEqual((demo.filter(status="REQUESTED").count(), demo.filter(status="SCHEDULED", instructor=self.users["ines"]).count()), (3, 5))
        rows = self.client_for("ines").get("/api/progress").data
        self.assertTrue(rows)
        self.assertEqual({row["learnerName"] for row in rows}, {"Demo learner"})
        self.seed("--clear")
        self.assertEqual(list(AssistanceRequest.objects.all()), [mine])

    def test_does_nothing_without_demo_learners_or_a_real_instructor(self):
        self.seed()
        call_command("seed_demo_assistance", instructor="reviewer", verbosity=0)
        self.assertFalse(AssistanceRequest.objects.exists())
