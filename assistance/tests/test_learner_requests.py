"""US-03: a learner requests live help and follows the request's status."""
from datetime import timedelta

from django.utils import timezone

from assistance.models import AssistanceRequest

from .base import URL, AssistanceTestCase

PRIVATE = ("note", "requestedSlot", "meetingDetails", "attemptId")


class LearnerRequestTests(AssistanceTestCase):
    # AC-01
    def test_request_is_recorded_against_the_attempt_and_its_form(self):
        response = self.request_help()
        self.assertEqual(response.status_code, 201, response.data)
        saved = AssistanceRequest.objects.get()
        self.assertEqual((saved.attempt, saved.learner, saved.status, saved.instructor), (self.attempt, self.learner, "REQUESTED", None))
        self.assertEqual(response.data["requestId"], str(saved.pk))
        self.assertEqual(response.data["attemptId"], str(self.attempt.pk))
        self.assertEqual(response.data["formId"], str(self.form.pk))
        self.assertEqual(response.data["formTitle"], "Housing application")

    # AC-02
    def test_learner_gets_confirmation_and_can_read_the_current_status(self):
        created = self.request_help().data
        self.assertEqual(created["status"], "REQUESTED")
        listed = self.client.get(URL, {"attemptId": str(self.attempt.pk)})
        self.assertEqual([(row["requestId"], row["status"]) for row in listed.data], [(created["requestId"], "REQUESTED")])
        detail = self.client.get(f"{URL}/{created['requestId']}")
        self.assertEqual((detail.status_code, detail.data["status"], detail.data["instructorName"]), (200, "REQUESTED", None))

    # AC-03
    def test_incomplete_request_names_what_is_missing_and_creates_nothing(self):
        cases = (
            ({"requestedSlot": None}, "requestedSlot"),
            ({"note": None}, "note"),
            ({"note": "   "}, "note"),
            ({"requestedSlot": (timezone.now() - timedelta(hours=1)).isoformat()}, "requestedSlot"),
            ({"requestedSlot": "next week"}, "requestedSlot"),
            ({"attemptId": None}, "attemptId"),
        )
        for overrides, field in cases:
            with self.subTest(overrides=overrides):
                response = self.request_help(**overrides)
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
        self.assertFalse(AssistanceRequest.objects.exists())

    def test_unknown_fields_are_rejected(self):
        response = self.request_help(instructorId="1", status="SCHEDULED")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(AssistanceRequest.objects.exists())

    def test_request_for_another_learners_or_a_missing_attempt_is_refused(self):
        response = self.request_help(attemptId=str(self.other_attempt.pk))
        self.assertEqual((response.status_code, response.data["error"]), (403, "ATTEMPT_FORBIDDEN"))
        response = self.request_help(attemptId="00000000-0000-4000-8000-000000000000")
        self.assertEqual(response.status_code, 404)
        self.assertFalse(AssistanceRequest.objects.exists())

    def test_only_learners_can_ask_for_help(self):
        for name, expected in ((None, 401), ("ines", 403), ("reviewer", 403)):
            with self.subTest(caller=name):
                self.assertEqual(self.request_help(client=self.client_for(name)).status_code, expected)
        self.assertFalse(AssistanceRequest.objects.exists())

    def test_one_open_request_per_attempt(self):
        first = self.request_help().data
        duplicate = self.request_help(note="Asking again.")
        self.assertEqual((duplicate.status_code, duplicate.data["error"]), (409, "REQUEST_ALREADY_OPEN"))
        self.assertEqual(AssistanceRequest.objects.count(), 1)
        # Once the open one is closed, the learner can ask again.
        self.assertEqual(self.send("post", f"{URL}/{first['requestId']}/cancel").data["status"], "CANCELLED")
        self.assertEqual(self.request_help().status_code, 201)

    def test_learner_cancels_their_own_open_request_once(self):
        request = self.make_request()
        self.assertEqual(self.send("post", f"{URL}/{request.pk}/cancel").status_code, 200)
        again = self.send("post", f"{URL}/{request.pk}/cancel")
        self.assertEqual((again.status_code, again.data["error"]), (409, "REQUEST_CLOSED"))

    def test_another_learner_cannot_see_or_cancel_the_request(self):
        request = self.make_request()
        other = self.client_for("learner-bbb222")
        self.assertEqual(other.get(URL).data, [])
        self.assertEqual(other.get(URL, {"attemptId": str(self.attempt.pk)}).data, [])
        for response in (other.get(f"{URL}/{request.pk}"), self.send("post", f"{URL}/{request.pk}/cancel", client=other)):
            self.assertEqual(response.status_code, 403)
            for key in PRIVATE:
                self.assertNotIn(key, response.data)
        request.refresh_from_db()
        self.assertEqual(request.status, "REQUESTED")

    def test_signed_out_callers_get_401_without_request_data(self):
        request = self.make_request()
        guest = self.client_for()
        for response in (guest.get(URL), guest.get(f"{URL}/{request.pk}"), self.send("post", f"{URL}/{request.pk}/cancel", client=guest)):
            self.assertEqual(response.status_code, 401)
            self.assertNotIn("note", str(response.data))
