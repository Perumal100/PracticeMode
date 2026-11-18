"""Instructor accounts, management by Form Reviewers, and form change requests."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from assistance.models import AssistanceRequest
from attempts.models import Attempt, ProgressCounter
from instructors.models import FormChangeRequest, InstructorProfile
from reviewer.models import FormField, PracticeForm

SIGNUP = {"username": "ines_o", "fullName": "Ines Ortega", "password": "teach-forms-2026",
          "meetingLink": "https://meet.example.test/ines", "organisation": "Springfield library"}


class InstructorTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        model = get_user_model()
        cls.reviewer = model.objects.create_user(username="rita", first_name="Rita", password="review-forms-2026")
        cls.reviewer.groups.add(Group.objects.get_or_create(name="FORM_REVIEWER")[0])
        cls.learner = model.objects.create_user(username="maya", first_name="Maya")
        cls.learner.groups.add(Group.objects.get_or_create(name="LEARNER")[0])
        cls.form = PracticeForm.objects.create(title="Warehouse application", source_url="https://example.test/w", status="APPROVED")
        cls.field = FormField.objects.create(practice_form=cls.form, position=1, label="Full name", input_type="text", required=True)

    def client_for(self, user=None):
        client = APIClient(enforce_csrf_checks=True)
        if user:
            client.force_login(user)
        client.get("/api/session")
        return client

    def send(self, client, method, url, data=None):
        token = client.cookies.get("csrftoken")
        return getattr(client, method)(url, data or {}, format="json", HTTP_X_CSRFTOKEN=token.value if token else "")

    def sign_up(self, **changes):
        return self.send(self.client_for(), "post", "/api/instructor-signup", {**SIGNUP, **changes})

    def login(self, username="ines_o", password="teach-forms-2026"):
        client = self.client_for()
        return client, self.send(client, "post", "/api/login", {"username": username, "password": password})

    def act(self, user_id, action, note=""):
        return self.send(self.client_for(self.reviewer), "post", f"/api/review/instructors/{user_id}/{action}", {"note": note})

    def active_instructor(self):
        self.sign_up()
        user = get_user_model().objects.get(username="ines_o")
        self.act(user.pk, "approve")
        return user


class SignupAndApprovalTests(InstructorTestCase):
    def test_signup_waits_for_a_reviewer_before_sign_in(self):
        response = self.sign_up()
        self.assertEqual((response.status_code, response.data["status"]), (201, "PENDING"))
        profile = InstructorProfile.objects.get(user__username="ines_o")
        self.assertEqual((profile.meeting_link, profile.organisation, profile.user.get_full_name()),
                         ("https://meet.example.test/ines", "Springfield library", "Ines Ortega"))
        self.assertFalse(profile.user.groups.exists())
        _, response = self.login()
        self.assertEqual((response.status_code, response.data["error"]), (403, "INSTRUCTOR_PENDING"))

    def test_approved_instructor_signs_in_with_the_instructor_role(self):
        self.sign_up()
        user = get_user_model().objects.get(username="ines_o")
        self.assertEqual(self.act(user.pk, "approve").data["status"], "ACTIVE")
        _, response = self.login()
        self.assertEqual((response.status_code, response.data["user"]["role"]), (200, "INSTRUCTOR"))

    def test_declined_signup_cannot_sign_in(self):
        self.sign_up()
        user = get_user_model().objects.get(username="ines_o")
        self.act(user.pk, "decline", "We could not confirm this account.")
        _, response = self.login()
        self.assertEqual(response.data["error"], "INSTRUCTOR_DECLINED")

    def test_signup_validation(self):
        for changes in ({"meetingLink": ""}, {"meetingLink": "zoom room 5"}, {"meetingLink": "javascript:alert(1)"},
                        {"password": "12345678"}, {"password": "short"}, {"username": "a b"}, {"fullName": " "}, {"role": "FORM_REVIEWER"}):
            with self.subTest(changes=changes):
                self.assertEqual(self.sign_up(**changes).status_code, 400)
        self.assertFalse(InstructorProfile.objects.exists())
        self.sign_up()
        self.assertEqual(self.sign_up(username="INES_O").status_code, 409)
        self.assertEqual(self.sign_up(username="rita").status_code, 409)

    def test_signup_requires_csrf(self):
        response = APIClient(enforce_csrf_checks=True).post("/api/instructor-signup", SIGNUP, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(InstructorProfile.objects.exists())


class ManagementTests(InstructorTestCase):
    def test_reviewer_adds_an_instructor_who_can_sign_in_at_once(self):
        response = self.send(self.client_for(self.reviewer), "post", "/api/review/instructors", {**SIGNUP, "username": "omar_h", "fullName": "Omar Haddad"})
        self.assertEqual((response.status_code, response.data["status"], response.data["fullName"]), (201, "ACTIVE", "Omar Haddad"))
        _, login = self.login(username="omar_h")
        self.assertEqual(login.status_code, 200)

    def test_reviewer_lists_instructors_by_status(self):
        self.sign_up()
        old = get_user_model().objects.create_user(username="legacy", first_name="Lee")
        old.groups.add(Group.objects.get_or_create(name="INSTRUCTOR")[0])
        rita = self.client_for(self.reviewer)
        self.assertEqual([row["username"] for row in rita.get("/api/review/instructors", {"status": "PENDING"}).data], ["ines_o"])
        self.assertEqual([row["username"] for row in rita.get("/api/review/instructors", {"status": "ACTIVE"}).data], ["legacy"])
        self.assertNotIn("password", str(rita.get("/api/review/instructors").data))

    def test_removing_an_instructor_signs_them_out_and_returns_their_sessions_to_the_queue(self):
        ines = self.active_instructor()
        client, _ = self.login()
        attempt = Attempt.objects.create(learner=self.learner, practice_form=self.form)
        ProgressCounter.objects.create(attempt=attempt)
        session = AssistanceRequest.objects.create(attempt=attempt, learner=self.learner, requested_slot=timezone.now() + timedelta(days=1),
                                                   note="Help", status="SCHEDULED", instructor=ines, meeting_link="https://meet.example.test/ines")
        self.assertEqual(self.act(ines.pk, "remove", "Left the programme.").data["status"], "REMOVED")
        self.assertEqual(client.get("/api/assistance-requests").status_code, 403)
        session.refresh_from_db()
        self.assertEqual((session.status, session.instructor, session.meeting_link), ("REQUESTED", None, ""))
        self.assertEqual(session.events.last().action, "RELEASED")
        _, login = self.login()
        self.assertEqual(login.data["error"], "INSTRUCTOR_REMOVED")
        self.assertEqual(self.act(ines.pk, "restore").data["status"], "ACTIVE")
        self.assertEqual(self.login()[1].status_code, 200)

    def test_invalid_transitions_and_permissions(self):
        self.sign_up()
        user = get_user_model().objects.get(username="ines_o")
        self.assertEqual(self.act(user.pk, "remove").status_code, 409)
        self.assertEqual(self.act(user.pk, "promote").status_code, 404)
        self.assertEqual(self.act(99999, "approve").status_code, 404)
        learner = self.client_for(self.learner)
        self.assertEqual(learner.get("/api/review/instructors").status_code, 403)
        self.assertEqual(self.send(learner, "post", f"/api/review/instructors/{user.pk}/approve").status_code, 403)
        self.assertEqual(InstructorProfile.objects.get().status, "PENDING")


class ProfileAndFormTests(InstructorTestCase):
    def test_instructor_reads_and_changes_their_default_meeting_link(self):
        ines = self.active_instructor()
        client = self.client_for(ines)
        self.assertEqual(client.get("/api/instructor/profile").data["meetingLink"], "https://meet.example.test/ines")
        response = self.send(client, "patch", "/api/instructor/profile", {"meetingLink": "https://meet.example.test/ines-2"})
        self.assertEqual(response.data["meetingLink"], "https://meet.example.test/ines-2")
        self.assertEqual(self.send(client, "patch", "/api/instructor/profile", {"meetingLink": "nope"}).status_code, 400)
        self.assertEqual(self.client_for(self.learner).get("/api/instructor/profile").status_code, 403)

    def test_instructor_sees_published_forms_only(self):
        ines = self.active_instructor()
        PracticeForm.objects.create(title="Draft", source_url="https://example.test/d")
        client = self.client_for(ines)
        self.assertEqual([f["title"] for f in client.get("/api/instructor/forms").data], ["Warehouse application"])
        detail = client.get(f"/api/instructor/forms/{self.form.pk}").data
        self.assertEqual([f["label"] for f in detail["fields"]], ["Full name"])


class ChangeRequestTests(InstructorTestCase):
    def setUp(self):
        self.ines = self.active_instructor()
        self.client_ines = self.client_for(self.ines)
        self.rita = self.client_for(self.reviewer)

    def report(self, **changes):
        body = {"formId": str(self.form.pk), "fieldId": str(self.field.pk), "description": "The real form asks for a middle name too.", **changes}
        return self.send(self.client_ines, "post", "/api/instructor/change-requests", body)

    def test_instructor_reports_a_mistake_and_sees_the_reviewers_answer(self):
        created = self.report().data
        self.assertEqual((created["status"], created["fieldLabel"], created["formTitle"]), ("OPEN", "Full name", "Warehouse application"))
        queue = self.rita.get("/api/review/change-requests", {"status": "OPEN"}).data
        self.assertEqual([(row["id"], row["instructorName"]) for row in queue], [(created["id"], "Ines Ortega")])
        answered = self.send(self.rita, "post", f"/api/review/change-requests/{created['id']}/resolve", {"response": "Added in version 2."}).data
        self.assertEqual((answered["status"], answered["response"], answered["resolvedBy"]), ("RESOLVED", "Added in version 2.", "Rita"))
        mine = self.client_ines.get("/api/instructor/change-requests").data
        self.assertEqual((mine[0]["status"], mine[0]["response"]), ("RESOLVED", "Added in version 2."))
        again = self.send(self.rita, "post", f"/api/review/change-requests/{created['id']}/decline", {"response": "No"})
        self.assertEqual(again.status_code, 409)

    def test_a_whole_form_report_needs_no_question(self):
        created = self.report(fieldId=None).data
        self.assertEqual((created["fieldId"], created["fieldLabel"]), (None, ""))

    def test_invalid_reports_are_refused(self):
        other = PracticeForm.objects.create(title="Other", source_url="https://example.test/o", status="APPROVED")
        foreign = FormField.objects.create(practice_form=other, position=1, label="X", input_type="text")
        draft = PracticeForm.objects.create(title="Draft", source_url="https://example.test/d")
        self.assertEqual(self.report(description=" ").status_code, 400)
        self.assertEqual(self.report(fieldId=str(foreign.pk)).status_code, 400)
        self.assertEqual(self.report(formId=str(draft.pk), fieldId=None).status_code, 404)
        self.assertEqual(self.send(self.rita, "post", "/api/review/change-requests/00000000-0000-4000-8000-000000000000/resolve", {"response": "x"}).status_code, 404)
        self.assertFalse(FormChangeRequest.objects.exists())

    def test_answer_needs_text_and_only_reviewers_answer(self):
        created = self.report().data
        self.assertEqual(self.send(self.rita, "post", f"/api/review/change-requests/{created['id']}/resolve", {"response": ""}).status_code, 400)
        for client in (self.client_ines, self.client_for(self.learner)):
            self.assertEqual(client.get("/api/review/change-requests").status_code, 403)
            self.assertEqual(self.send(client, "post", f"/api/review/change-requests/{created['id']}/resolve", {"response": "x"}).status_code, 403)
        self.assertEqual(self.client_for(self.learner).get("/api/instructor/change-requests").status_code, 403)
        self.assertEqual(FormChangeRequest.objects.get().status, "OPEN")
