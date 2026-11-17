from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from assistance.models import AssistanceRequest
from attempts.models import Attempt, ProgressCounter
from reviewer.models import FormField, PracticeForm

URL = "/api/assistance-requests"


class AssistanceTestCase(TestCase):
    """Two learners with an attempt each, two instructors and a reviewer."""

    @classmethod
    def setUpTestData(cls):
        model = get_user_model()
        cls.users = {}
        people = (("learner-aaa111", "LEARNER", "Alex"), ("learner-bbb222", "LEARNER", "Alex"),
                  ("ines", "INSTRUCTOR", "Ines Ortega"), ("omar", "INSTRUCTOR", "Omar Haddad"), ("reviewer", "FORM_REVIEWER", "Rae"))
        for username, role, name in people:
            first, _, last = name.partition(" ")
            user = model._default_manager.create_user(username=username, first_name=first, last_name=last)
            user.groups.add(Group.objects.get_or_create(name=role)[0])
            cls.users[username] = user
        cls.learner, cls.other_learner = cls.users["learner-aaa111"], cls.users["learner-bbb222"]
        cls.form = PracticeForm.objects.create(title="Housing application", source_url="https://example.test/housing", status="APPROVED")
        cls.field = FormField.objects.create(practice_form=cls.form, position=1, label="Full name", input_type="text", required=True)
        cls.attempt = cls.make_attempt(cls.learner)
        cls.other_attempt = cls.make_attempt(cls.other_learner)

    @classmethod
    def make_attempt(cls, learner, form=None, **values):
        attempt = Attempt.objects.create(learner=learner, practice_form=form or cls.form, **values)
        ProgressCounter.objects.create(attempt=attempt)
        return attempt

    def client_for(self, name=None):
        client = APIClient(enforce_csrf_checks=True)
        if name:
            client.force_login(self.users[name])
        client.get("/api/session")
        return client

    def setUp(self):
        self.client = self.client_for("learner-aaa111")
        self.slot = timezone.now() + timedelta(days=2)

    def send(self, method, url, data=None, client=None):
        client = client or self.client
        token = client.cookies.get("csrftoken")
        return getattr(client, method)(url, data, format="json", HTTP_X_CSRFTOKEN=token.value if token else "")

    def body(self, **overrides):
        data = {"attemptId": str(self.attempt.pk), "requestedSlot": self.slot.isoformat(), "note": "I am stuck on the address question."}
        data.update(overrides)
        return {key: value for key, value in data.items() if value is not None}

    def request_help(self, client=None, **overrides):
        return self.send("post", URL, self.body(**overrides), client=client)

    def make_request(self, attempt=None, **values):
        attempt = attempt or self.attempt
        return AssistanceRequest.objects.create(
            attempt=attempt, learner=attempt.learner, requested_slot=self.slot, note="I am stuck on the address question.", **values,
        )
