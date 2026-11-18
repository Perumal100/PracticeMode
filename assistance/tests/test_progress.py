"""US-22: instructors filter the progress of the learners they are helping (API-14)."""
from datetime import timedelta

from django.utils import timezone

from attempts.models import Answer, Attempt
from reviewer.models import PracticeForm

from .base import AssistanceTestCase

URL = "/api/progress"
MEETING = "Room 204."


class ProgressTests(AssistanceTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.course = PracticeForm.objects.create(title="Course registration", source_url="https://example.test/course", status="APPROVED")
        # The first learner: one unfinished attempt with many hint views, one submitted with errors.
        cls.set_progress(cls.attempt, hints=4)
        cls.submitted = cls.make_attempt(cls.learner, form=cls.course, status="COMPLETED",
                                         completed_at=timezone.now() + timedelta(minutes=5))
        cls.set_progress(cls.submitted, errors=3, hints=1)
        Answer.objects.create(attempt=cls.attempt, field=cls.field, value="Jordan Rivera")

    @staticmethod
    def set_progress(attempt, errors=0, hints=0):
        attempt.progress.validation_error_count = errors
        attempt.progress.hint_view_count = hints
        attempt.progress.save()

    def setUp(self):
        super().setUp()
        self.ines, self.omar = self.client_for("ines"), self.client_for("omar")
        # Ines helps the first learner; Omar helps the second.
        self.make_request(status="SCHEDULED", instructor=self.users["ines"], meeting_details=MEETING)
        self.make_request(self.other_attempt, status="SCHEDULED", instructor=self.users["omar"], meeting_details=MEETING)

    def attempts(self, client, **query):
        response = client.get(URL, query)
        self.assertEqual(response.status_code, 200, response.data)
        return [row["attemptId"] for row in response.data]

    # AC-01
    def test_filters_select_unfinished_attempts_repeated_errors_and_frequent_hint_use(self):
        both = {str(self.attempt.pk), str(self.submitted.pk)}
        self.assertEqual(set(self.attempts(self.ines)), both)
        self.assertEqual(self.attempts(self.ines, incomplete="true"), [str(self.attempt.pk)])
        self.assertEqual(self.attempts(self.ines, minErrors=2), [str(self.submitted.pk)])
        self.assertEqual(self.attempts(self.ines, minHints=3), [str(self.attempt.pk)])
        self.assertEqual(self.attempts(self.ines, formId=str(self.course.pk)), [str(self.submitted.pk)])
        self.assertEqual(self.attempts(self.ines, incomplete="true", minErrors=1), [])
        self.assertEqual(set(self.attempts(self.ines, incomplete="false")), both)

    # AC-02
    def test_rows_carry_the_measures_and_never_an_answer(self):
        row = next(row for row in self.ines.get(URL).data if row["attemptId"] == str(self.submitted.pk))
        self.assertEqual(
            {key: row[key] for key in ("learnerName", "learnerCode", "formTitle", "status", "validationErrorCount", "hintViewCount")},
            {"learnerName": "Alex", "learnerCode": "learner-aaa111", "formTitle": "Course registration", "status": "COMPLETED",
             "validationErrorCount": 3, "hintViewCount": 1},
        )
        self.assertNotIn("Jordan Rivera", str(self.ines.get(URL).data))
        self.assertNotIn("answers", row)

    # AC-03
    def test_instructor_sees_only_learners_whose_request_they_accepted(self):
        self.assertEqual(self.attempts(self.omar), [str(self.other_attempt.pk)])
        self.assertNotIn(str(self.other_attempt.pk), self.attempts(self.ines))

    # AC-03
    def test_asking_for_a_learner_outside_the_scope_is_refused(self):
        self.assertEqual(set(self.attempts(self.ines, learnerCode="learner-aaa111")), {str(self.attempt.pk), str(self.submitted.pk)})
        for code in ("learner-bbb222", "zzz999"):
            with self.subTest(code=code):
                response = self.ines.get(URL, {"learnerCode": code})
                self.assertEqual((response.status_code, response.data["error"]), (403, "PROGRESS_FORBIDDEN"))
                self.assertNotIn("attemptId", str(response.data))

    def test_a_waiting_or_cancelled_request_gives_no_access_to_progress(self):
        newcomer = self.make_attempt(self.other_learner, form=self.course)
        waiting = self.make_request(newcomer)
        self.assertNotIn(str(newcomer.pk), self.attempts(self.ines))
        # Omar's session with this learner is cancelled: the scope goes with it.
        self.send("post", f"/api/assistance-requests/{self.other_attempt.assistance_requests.get().pk}/cancel", client=self.omar)
        self.assertEqual(self.attempts(self.omar), [])
        waiting.refresh_from_db()
        self.assertEqual(waiting.status, "REQUESTED")

    def test_a_completed_session_keeps_the_learner_in_scope(self):
        request = self.attempt.assistance_requests.get()
        self.send("post", f"/api/assistance-requests/{request.pk}/complete", client=self.ines)
        self.assertEqual(len(self.attempts(self.ines)), 2)

    def test_invalid_filters_are_rejected(self):
        for query in ({"minErrors": "-1"}, {"minHints": "many"}, {"incomplete": "maybe"}, {"formId": "housing"},
                      {"learnerCode": "../x"}, {"status": "COMPLETED"}, {"learnerId": "1"}):
            with self.subTest(query=query):
                self.assertEqual(self.ines.get(URL, query).status_code, 400)

    def test_only_instructors_can_read_progress(self):
        for name, expected in ((None, 401), ("learner-aaa111", 403), ("reviewer", 403)):
            with self.subTest(caller=name):
                response = self.client_for(name).get(URL)
                self.assertEqual(response.status_code, expected)
                self.assertNotIn("attemptId", str(response.data))

    def test_progress_is_read_only(self):
        self.assertEqual(self.send("post", URL, {}, client=self.ines).status_code, 405)
        self.assertEqual(Attempt.objects.count(), 3)
