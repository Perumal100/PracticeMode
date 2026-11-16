"""US-15: learners request a form by its link and follow its preparation status."""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from form_requests.models import FormRequest
from reviewer.models import FormField, PracticeForm, ReviewDecision

URL = "/api/form-requests"
REVIEW = "/api/review/form-requests"
LINK = "https://jobs.example.test/apply/warehouse"


class FormRequestTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        model = get_user_model()
        cls.users = {}
        for name, role in (("maya", "LEARNER"), ("noor", "LEARNER"), ("ines", "INSTRUCTOR"), ("rita", "FORM_REVIEWER")):
            user = model.objects.create_user(username=name, first_name=name.title())
            user.groups.add(Group.objects.get_or_create(name=role)[0])
            cls.users[name] = user

    def client_for(self, name=None):
        client = APIClient(enforce_csrf_checks=True)
        if name:
            client.force_login(self.users[name])
        client.get("/api/session")
        return client

    def setUp(self):
        self.maya, self.noor, self.rita = self.client_for("maya"), self.client_for("noor"), self.client_for("rita")

    def send(self, client, url, data=None):
        token = client.cookies.get("csrftoken")
        return client.post(url, data or {}, format="json", HTTP_X_CSRFTOKEN=token.value if token else "")

    def ask(self, client=None, url=LINK, note="I am applying next week."):
        return self.send(client or self.maya, URL, {"url": url, "note": note})

    def form(self, status="AWAITING_REVIEW", url=LINK, **extra):
        form = PracticeForm.objects.create(title="Warehouse application", source_url=url, status=status, **extra)
        FormField.objects.create(practice_form=form, position=1, label="Name", input_type="text")
        return form

    def mine(self, client=None):
        return (client or self.maya).get(URL).data

    def test_learner_requests_a_form_by_link_and_sees_it_received(self):
        response = self.ask(url=f"{LINK}#section-2")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual((response.data["url"], response.data["state"], response.data["formId"]), (LINK, "RECEIVED", None))
        saved = FormRequest.objects.get()
        self.assertEqual((saved.learner, saved.note, saved.status), (self.users["maya"], "I am applying next week.", "OPEN"))
        self.assertEqual([row["requestId"] for row in self.mine()], [response.data["requestId"]])

    def test_invalid_links_create_nothing(self):
        for url in ("", "not a link", "ftp://files.example.test/form", "javascript:alert(1)", "https://" + "a" * 2050):
            with self.subTest(url=url):
                response = self.ask(url=url)
                self.assertEqual(response.status_code, 400)
                self.assertIn("url", response.data)
        self.assertEqual(self.send(self.maya, URL, {"url": LINK, "learner": "noor"}).status_code, 400)
        self.assertFalse(FormRequest.objects.exists())

    def test_a_learner_cannot_request_the_same_page_twice_while_it_is_open(self):
        self.ask()
        response = self.ask(url=f"{LINK}/?ref=mail")
        self.assertEqual((response.status_code, response.data["error"]), (409, "REQUEST_ALREADY_OPEN"))
        # Another learner may ask for the same form.
        self.assertEqual(self.ask(self.noor).status_code, 201)

    def test_a_form_already_published_is_offered_instead_of_a_request(self):
        published = self.form(status="APPROVED")
        response = self.ask()
        self.assertEqual((response.status_code, response.data["error"], response.data["formId"]), (409, "FORM_ALREADY_AVAILABLE", str(published.pk)))
        self.assertFalse(FormRequest.objects.exists())

    def test_a_request_for_a_page_already_awaiting_review_says_so(self):
        self.form()
        self.assertEqual(self.ask().data["state"], "AWAITING_REVIEW")

    def test_status_follows_the_linked_form_from_review_to_practice(self):
        created = self.ask().data
        form = self.form()
        self.assertEqual(self.send(self.rita, f"{REVIEW}/{created['requestId']}/link", {"formId": str(form.pk)}).data, {"updated": 1})
        self.assertEqual(self.mine()[0]["state"], "AWAITING_REVIEW")
        form.status = "APPROVED"
        form.save()
        row = self.mine()[0]
        self.assertEqual((row["state"], row["formId"]), ("AVAILABLE", str(form.pk)))
        # A revision replaces the form: the request points learners at the new version.
        revision = self.form(status="APPROVED", revision_of=form)
        form.status = "SUPERSEDED"
        form.save()
        self.assertEqual(self.mine()[0]["formId"], str(revision.pk))

    def test_a_rejected_form_explains_why(self):
        created = self.ask().data
        form = self.form()
        self.send(self.rita, f"{REVIEW}/{created['requestId']}/link", {"formId": str(form.pk)})
        ReviewDecision.objects.create(practice_form=form, reviewer=self.users["rita"], outcome="REJECTED", rejection_reason="The page needs a sign-in.")
        form.status = "REJECTED"
        form.save()
        row = self.mine()[0]
        self.assertEqual((row["state"], row["message"]), ("NOT_AVAILABLE", "The page needs a sign-in."))

    def test_declining_needs_a_reason_and_closes_every_open_request_for_the_page(self):
        first = self.ask().data
        self.ask(self.noor, url=f"{LINK}/")
        self.assertEqual(self.send(self.rita, f"{REVIEW}/{first['requestId']}/decline", {"reason": "  "}).status_code, 400)
        response = self.send(self.rita, f"{REVIEW}/{first['requestId']}/decline", {"reason": "This form is behind a CAPTCHA."})
        self.assertEqual(response.data, {"updated": 2})
        for client in (self.maya, self.noor):
            row = self.mine(client)[0]
            self.assertEqual((row["state"], row["message"]), ("NOT_AVAILABLE", "This form is behind a CAPTCHA."))
        again = self.send(self.rita, f"{REVIEW}/{first['requestId']}/decline", {"reason": "Again"})
        self.assertEqual((again.status_code, again.data["error"]), (409, "REQUEST_CLOSED"))

    def test_only_waiting_or_approved_forms_can_be_linked(self):
        created = self.ask().data
        failed = self.form(status="FAILED", failure_reason="No fields found.")
        response = self.send(self.rita, f"{REVIEW}/{created['requestId']}/link", {"formId": str(failed.pk)})
        self.assertEqual((response.status_code, response.data["error"]), (409, "FORM_NOT_LINKABLE"))
        missing = self.send(self.rita, f"{REVIEW}/{created['requestId']}/link", {"formId": "00000000-0000-4000-8000-000000000000"})
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(FormRequest.objects.get().status, "OPEN")

    def test_reviewers_see_requests_grouped_by_page_without_the_learner(self):
        self.ask()
        self.ask(self.noor, url=f"{LINK}?utm=1")
        rows = self.rita.get(REVIEW, {"status": "OPEN"}).data
        self.assertEqual([row["requestCount"] for row in rows], [2, 2])
        self.assertNotIn("maya", str(rows))
        self.assertNotIn("learner", rows[0])
        self.assertEqual(self.rita.get(REVIEW, {"status": "DECLINED"}).data, [])
        self.assertEqual(self.rita.get(REVIEW, {"status": "DONE"}).status_code, 400)

    def test_learners_see_only_their_own_requests(self):
        self.ask()
        self.assertEqual(self.mine(self.noor), [])

    def test_permissions(self):
        created = self.ask().data
        for name, expected in ((None, 401), ("ines", 403), ("rita", 403)):
            with self.subTest(caller=name, side="learner"):
                client = self.client_for(name)
                self.assertEqual(client.get(URL).status_code, expected)
                self.assertEqual(self.ask(client).status_code, expected)
        for name, expected in ((None, 401), ("maya", 403), ("ines", 403)):
            with self.subTest(caller=name, side="reviewer"):
                client = self.client_for(name)
                self.assertEqual(client.get(REVIEW).status_code, expected)
                self.assertEqual(self.send(client, f"{REVIEW}/{created['requestId']}/decline", {"reason": "No"}).status_code, expected)
        self.assertEqual(FormRequest.objects.get().status, "OPEN")
