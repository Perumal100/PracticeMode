"""US-05: instructors see, accept and close assistance requests (API-12, API-13, API-17)."""
from assistance.models import AssistanceRequest

from .base import URL, AssistanceTestCase

PRIVATE = ("note", "requestedSlot", "meetingDetails", "meetingLink", "attemptId", "learnerName", "formTitle", "events")
MEETING = "Room 204 at the library. Bring your questions."
LINK = "https://meet.example.test/ines-room"


class InstructorRequestTests(AssistanceTestCase):
    def setUp(self):
        super().setUp()
        self.ines, self.omar = self.client_for("ines"), self.client_for("omar")
        self.waiting = self.make_request()
        self.taken = self.make_request(self.other_attempt, status="SCHEDULED", instructor=self.users["omar"], meeting_details=MEETING)

    def schedule(self, request, client, details=MEETING, link=LINK):
        body = {"meetingDetails": details} if details is not None else {}
        if link is not None:
            body["meetingLink"] = link
        return self.send("patch", f"{URL}/{request.pk}/schedule", body, client=client)

    def assert_no_request_data(self, response):
        for key in PRIVATE:
            self.assertNotIn(key, response.data)

    # AC-01
    def test_queue_shows_waiting_requests_and_the_instructors_own_with_form_and_meeting_details(self):
        ines_rows = self.ines.get(URL).data
        self.assertEqual([row["requestId"] for row in ines_rows], [str(self.waiting.pk)])
        row = ines_rows[0]
        self.assertEqual((row["formTitle"], row["learnerName"], row["learnerCode"], row["status"]),
                         ("Housing application", "Alex", "learner-aaa111", "REQUESTED"))
        omar_rows = {row["requestId"]: row for row in self.omar.get(URL).data}
        self.assertEqual(set(omar_rows), {str(self.waiting.pk), str(self.taken.pk)})
        self.assertEqual(omar_rows[str(self.taken.pk)]["meetingDetails"], MEETING)

    def test_queue_filters_by_status_and_rejects_unknown_filters(self):
        self.assertEqual([row["requestId"] for row in self.omar.get(URL, {"status": "SCHEDULED"}).data], [str(self.taken.pk)])
        self.assertEqual(self.ines.get(URL, {"status": "SCHEDULED"}).data, [])
        for query in ({"status": "OPEN"}, {"attemptId": str(self.attempt.pk)}, {"instructor": "omar"}):
            with self.subTest(query=query):
                self.assertEqual(self.ines.get(URL, query).status_code, 400)

    # AC-02
    def test_detail_gives_what_the_instructor_needs_to_prepare_and_no_answers(self):
        response = self.ines.get(f"{URL}/{self.waiting.pk}")
        self.assertEqual(response.status_code, 200)
        for key, value in (("note", "I am stuck on the address question."), ("formTitle", "Housing application"),
                           ("attemptId", str(self.attempt.pk)), ("formId", str(self.form.pk)), ("learnerCode", "learner-aaa111")):
            self.assertEqual(response.data[key], value)
        self.assertNotIn("answers", response.data)

    # AC-03
    def test_request_accepted_by_another_instructor_is_refused_without_its_details(self):
        for response in (self.ines.get(f"{URL}/{self.taken.pk}"),
                         self.send("post", f"{URL}/{self.taken.pk}/complete", client=self.ines),
                         self.send("post", f"{URL}/{self.taken.pk}/cancel", client=self.ines)):
            self.assertEqual(response.status_code, 403)
            self.assert_no_request_data(response)
        response = self.schedule(self.taken, self.ines, "My room instead.")
        self.assertEqual((response.status_code, response.data["error"]), (409, "REQUEST_ALREADY_SCHEDULED"))
        self.assert_no_request_data(response)
        self.taken.refresh_from_db()
        self.assertEqual((self.taken.status, self.taken.instructor, self.taken.meeting_details), ("SCHEDULED", self.users["omar"], MEETING))

    def test_accepting_a_request_assigns_the_instructor_and_stores_the_meeting_details(self):
        response = self.schedule(self.waiting, self.ines)
        self.assertEqual((response.status_code, response.data["status"], response.data["instructorName"]), (200, "SCHEDULED", "Ines Ortega"))
        self.waiting.refresh_from_db()
        self.assertEqual((self.waiting.instructor, self.waiting.meeting_details, self.waiting.meeting_link), (self.users["ines"], MEETING, LINK))
        # It leaves every other instructor's queue, and the learner sees who accepted.
        self.assertNotIn(str(self.waiting.pk), [row["requestId"] for row in self.omar.get(URL).data])
        self.assertEqual(self.omar.get(f"{URL}/{self.waiting.pk}").status_code, 403)
        learner_view = self.client.get(f"{URL}/{self.waiting.pk}").data
        self.assertEqual((learner_view["instructorName"], learner_view["meetingDetails"], learner_view["meetingLink"]), ("Ines Ortega", MEETING, LINK))

    def test_accepting_needs_a_meeting_link(self):
        for link in (None, "not a link", "javascript:alert(1)"):
            with self.subTest(link=link):
                response = self.schedule(self.waiting, self.ines, link=link)
                self.assertEqual(response.status_code, 400)
                self.assertIn("meetingLink", response.data)
        self.waiting.refresh_from_db()
        self.assertEqual((self.waiting.status, self.waiting.instructor), ("REQUESTED", None))

    def test_the_instructors_default_link_is_used_when_none_is_given(self):
        from instructors.services import profile_for

        profile = profile_for(self.users["ines"])
        profile.meeting_link = "https://meet.example.test/ines-default"
        profile.save()
        response = self.schedule(self.waiting, self.ines, details=None, link=None)
        self.assertEqual((response.status_code, response.data["meetingLink"], response.data["meetingDetails"]),
                         (200, "https://meet.example.test/ines-default", ""))

    def test_history_records_who_did_what(self):
        self.schedule(self.waiting, self.ines)
        changed = self.schedule(self.waiting, self.ines, link="https://meet.example.test/new-room")
        # The reply already carries the new history entry.
        self.assertEqual(changed.data["events"][-1]["action"], "UPDATED")
        self.send("post", f"{URL}/{self.waiting.pk}/complete", client=self.ines)
        events = self.client.get(f"{URL}/{self.waiting.pk}").data["events"]
        self.assertEqual([(e["action"], e["by"]) for e in events], [("SCHEDULED", "Ines Ortega"), ("UPDATED", "Ines Ortega"), ("COMPLETED", "Ines Ortega")])
        self.assertEqual(events[1]["detail"], "https://meet.example.test/new-room")

    def test_assigned_instructor_can_correct_the_meeting_details(self):
        response = self.schedule(self.taken, self.omar, "Moved to room 110.", link="https://meet.example.test/room-110")
        self.assertEqual((response.status_code, response.data["meetingDetails"], response.data["meetingLink"]),
                         (200, "Moved to room 110.", "https://meet.example.test/room-110"))

    def test_only_instructors_accept_or_complete_requests(self):
        for name, expected in ((None, 401), ("learner-aaa111", 403), ("reviewer", 403)):
            with self.subTest(caller=name):
                client = self.client_for(name)
                self.assertEqual(self.schedule(self.waiting, client).status_code, expected)
                self.assertEqual(self.send("post", f"{URL}/{self.taken.pk}/complete", client=client).status_code, expected)
        self.assertEqual(self.client_for("reviewer").get(URL).status_code, 403)
        self.waiting.refresh_from_db()
        self.assertEqual(self.waiting.status, "REQUESTED")

    def test_assigned_instructor_marks_the_session_completed_once(self):
        response = self.send("post", f"{URL}/{self.taken.pk}/complete", client=self.omar)
        self.assertEqual((response.status_code, response.data["status"]), (200, "COMPLETED"))
        again = self.send("post", f"{URL}/{self.taken.pk}/complete", client=self.omar)
        self.assertEqual((again.status_code, again.data["error"]), (409, "REQUEST_CLOSED"))
        self.assertEqual(self.schedule(self.taken, self.omar).status_code, 409)

    def test_a_waiting_request_cannot_be_completed_or_cancelled_by_an_instructor(self):
        response = self.send("post", f"{URL}/{self.waiting.pk}/complete", client=self.ines)
        self.assertEqual((response.status_code, response.data["error"]), (409, "REQUEST_NOT_SCHEDULED"))
        self.assertEqual(self.send("post", f"{URL}/{self.waiting.pk}/cancel", client=self.ines).status_code, 403)
        self.waiting.refresh_from_db()
        self.assertEqual(self.waiting.status, "REQUESTED")

    def test_assigned_instructor_or_learner_cancels_a_scheduled_session(self):
        response = self.send("post", f"{URL}/{self.taken.pk}/cancel", client=self.omar)
        self.assertEqual((response.status_code, response.data["status"]), (200, "CANCELLED"))
        mine = self.make_request(self.make_attempt(self.other_learner), status="SCHEDULED", instructor=self.users["omar"], meeting_details=MEETING)
        response = self.send("post", f"{URL}/{mine.pk}/cancel", client=self.client_for("learner-bbb222"))
        self.assertEqual(response.data["status"], "CANCELLED")

    def test_a_request_the_learner_cancelled_before_anyone_accepted_is_closed_to_instructors(self):
        self.send("post", f"{URL}/{self.waiting.pk}/cancel")
        self.assertEqual(self.ines.get(URL).data, [])
        self.assertEqual(self.ines.get(f"{URL}/{self.waiting.pk}").status_code, 403)
        self.assertEqual(self.schedule(self.waiting, self.ines).status_code, 403)
        self.assertEqual(AssistanceRequest.objects.get(pk=self.waiting.pk).instructor, None)

    def test_instructors_cannot_create_requests(self):
        self.assertEqual(self.request_help(client=self.ines, attemptId=str(self.make_attempt(self.learner).pk)).status_code, 403)
