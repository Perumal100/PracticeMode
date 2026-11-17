from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from reviewer.models import FormField, PracticeForm


class GuidanceTestCase(TestCase):
    """An approved two-field form, two learners, a reviewer and an instructor."""

    @classmethod
    def setUpTestData(cls):
        model = get_user_model()
        cls.users = {}
        for name, role in (("learner-one", "LEARNER"), ("learner-two", "LEARNER"),
                           ("instructor", "INSTRUCTOR"), ("reviewer", "FORM_REVIEWER")):
            user = model._default_manager.create_user(username=name, first_name="Alex")
            user.groups.add(Group.objects.get_or_create(name=role)[0])
            cls.users[name] = user
        cls.form = PracticeForm.objects.create(title="Housing application", source_url="https://example.test/housing", status="APPROVED")
        cls.name = FormField.objects.create(practice_form=cls.form, position=1, label="Full name", input_type="text", required=True)
        cls.email = FormField.objects.create(practice_form=cls.form, position=2, label="Email", input_type="email")

    def client_for(self, name=None):
        client = APIClient(enforce_csrf_checks=True)
        if name:
            client.force_login(self.users[name])
        client.get("/api/session")
        return client

    def setUp(self):
        self.client = self.client_for("learner-one")

    def send(self, method, url, data=None, client=None):
        client = client or self.client
        token = client.cookies.get("csrftoken")
        return getattr(client, method)(url, data, format="json", HTTP_X_CSRFTOKEN=token.value if token else "")

    def start_attempt(self, client=None):
        response = self.send("post", "/api/attempts", {"formId": str(self.form.pk)}, client=client)
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["id"]

    def field_data(self, field, client=None):
        response = (client or self.client).get(f"/api/forms/{self.form.pk}")
        self.assertEqual(response.status_code, 200, response.data)
        return next(item for item in response.data["fields"] if item["id"] == str(field.pk))
