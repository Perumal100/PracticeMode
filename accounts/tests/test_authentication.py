from importlib import import_module
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.conf import settings
from django.contrib.auth import SESSION_KEY, get_user_model
from django.contrib.auth.hashers import check_password
from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import include, path
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.test import APIClient
from rest_framework.views import APIView

from accounts import identity
from accounts.permissions import HasRole
from accounts.serializers import LoginSerializer


class InstructorOnlyView(APIView):
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = (identity.INSTRUCTOR,)

    def get(self, request):
        return Response({"authorized": True})


class UnconfiguredRoleView(InstructorOnlyView):
    allowed_roles = ()


# These probe routes exist only in the test URL configuration.
urlpatterns = [
    path("api/", include("accounts.urls")),
    path("test/instructor", InstructorOnlyView.as_view()),
    path("test/unconfigured", UnconfiguredRoleView.as_view()),
]


class IdentityBoundaryTests(SimpleTestCase):
    def test_credentials_use_the_runtime_model_username_field(self):
        with patch("accounts.identity.get_user_model", return_value=SimpleNamespace(USERNAME_FIELD="staff_handle")):
            self.assertEqual(identity.staff_credentials("teacher", "secret"), {
                "staff_handle": "teacher", "password": "secret",
            })

    def test_display_name_mapping_does_not_expose_username(self):
        user = SimpleNamespace(pk="uuid", display_name="Alex", username="private-login")
        self.assertEqual(identity.user_details(user, identity.LEARNER), {
            "id": "uuid", "displayName": "Alex", "role": "LEARNER",
        })

    def test_staff_compatibility_name_accessor(self):
        user = SimpleNamespace(pk=5, get_full_name=lambda: "Instructor Name")
        self.assertEqual(identity.user_details(user, identity.INSTRUCTOR)["displayName"], "Instructor Name")

    def test_missing_and_ambiguous_roles_fail_closed(self):
        user = SimpleNamespace(groups=Mock())
        for roles in ([], ["LEARNER", "FORM_REVIEWER"]):
            user.groups.filter.return_value.values_list.return_value = roles
            self.assertIsNone(identity.role_for(user))

    def test_learner_creation_is_explicitly_unavailable(self):
        with self.assertRaises(identity.LearnerIdentityUnavailable):
            identity.create_learner("Alex")

    def test_login_rejects_invalid_payloads(self):
        for payload in (
            {}, {"username": "teacher"}, {"username": "teacher", "password": ""},
            {"role": "ADMIN", "username": "teacher", "password": "secret"},
            {"role": "LEARNER", "displayName": "   "},
            {"role": "LEARNER", "displayName": "Alex", "password": "secret"},
            {"role": "LEARNER", "displayName": "Alex", "username": "other"},
            {"displayName": "Alex"},
            {"username": "teacher", "password": "secret", "is_superuser": True},
        ):
            with self.subTest(payload=payload):
                self.assertFalse(LoginSerializer(data=payload).is_valid())


@override_settings(ROOT_URLCONF=__name__)
class SessionAuthenticationTests(TestCase):
    """Real sessions against the configured model; repeat after model integration."""

    @classmethod
    def setUpTestData(cls):
        model = get_user_model()
        # Fixture details live here so a future model's manager can be adapted
        # without changing the API behavior assertions.
        cls.password = "test-staff-password"
        cls.instructor = model._default_manager.create_user(**{
            model.USERNAME_FIELD: "instructor", "password": cls.password,
        })
        cls.reviewer = model._default_manager.create_user(**{
            model.USERNAME_FIELD: "reviewer", "password": cls.password,
        })
        cls.instructor.groups.add(Group.objects.create(name=identity.INSTRUCTOR))
        cls.reviewer.groups.add(Group.objects.create(name=identity.FORM_REVIEWER))

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)

    def csrf(self, client=None, **kwargs):
        client = client or self.client
        client.get("/api/session", **kwargs)
        return client.cookies[settings.CSRF_COOKIE_NAME].value

    def login(self, username="instructor", password=None, **extra):
        token = self.csrf()
        return self.client.post("/api/login", {
            "username": username, "password": password or self.password, **extra,
        }, format="json", HTTP_X_CSRFTOKEN=token)

    def test_session_bootstrap_is_public_and_sets_csrf_cookie(self):
        response = self.client.get("/api/session")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"user": None})
        self.assertIn(settings.CSRF_COOKIE_NAME, response.cookies)
        self.assertIn("no-store", response["Cache-Control"])

    def test_staff_login_returns_stable_fields_and_real_session(self):
        old_csrf = self.csrf()
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data["user"]), {"id", "displayName", "role"})
        self.assertEqual(response.data["user"]["id"], str(self.instructor.pk))
        self.assertEqual(response.data["user"]["role"], "INSTRUCTOR")
        self.assertEqual(self.client.session[SESSION_KEY], str(self.instructor.pk))
        self.assertTrue(response.cookies[settings.SESSION_COOKIE_NAME]["httponly"])
        self.assertNotEqual(old_csrf, self.client.cookies[settings.CSRF_COOKIE_NAME].value)
        self.assertEqual(self.client.get("/api/session").data, response.data)
        self.assertNotIn("password", str(response.data))

    def test_staff_hash_uses_bcrypt_cost_at_least_ten(self):
        hashed = self.instructor.password
        self.assertTrue(hashed.startswith("bcrypt_sha256$"))
        self.assertGreaterEqual(int(hashed.split("$")[3]), 10)
        self.assertTrue(check_password(self.password, hashed))

    def test_reviewer_can_sign_in_with_existing_group(self):
        response = self.login(username="reviewer", role="FORM_REVIEWER")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["role"], "FORM_REVIEWER")

    def test_bad_credentials_are_401_without_session_or_user_data(self):
        for username in ("instructor", "nonexistent"):
            response = self.login(username=username, password="wrong")
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.data["error"], "INVALID_CREDENTIALS")
            self.assertNotIn("user", response.data)
            self.assertNotIn(SESSION_KEY, self.client.session)

    def test_inactive_staff_cannot_sign_in(self):
        self.instructor.is_active = False
        self.instructor.save(update_fields=["is_active"])
        self.assertEqual(self.login().status_code, 401)

    def test_requested_role_cannot_elevate_privileges(self):
        response = self.login(role="FORM_REVIEWER")
        self.assertEqual(response.status_code, 403)
        self.assertNotIn(SESSION_KEY, self.client.session)

    def test_missing_or_multiple_groups_do_not_create_session(self):
        self.instructor.groups.clear()
        self.assertEqual(self.login().status_code, 403)
        self.instructor.groups.add(*Group.objects.all())
        self.assertEqual(self.login().status_code, 403)
        self.assertNotIn(SESSION_KEY, self.client.session)

    def test_password_access_cannot_sign_in_a_learner(self):
        self.instructor.groups.set([Group.objects.create(name="LEARNER")])
        self.assertEqual(self.login().status_code, 403)
        self.assertNotIn(SESSION_KEY, self.client.session)

    def test_valid_learner_request_creates_no_identity_or_session(self):
        model = get_user_model()
        before = model._default_manager.count()
        for _ in range(2):
            response = self.client.post("/api/login", {"role": "LEARNER", "displayName": "Alex"},
                format="json", HTTP_X_CSRFTOKEN=self.csrf())
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.data["error"], "LEARNER_IDENTITY_UNAVAILABLE")
        self.assertEqual(model._default_manager.count(), before)
        self.assertNotIn(SESSION_KEY, self.client.session)

    def test_malformed_login_is_400(self):
        response = self.client.post("/api/login", {}, format="json", HTTP_X_CSRFTOKEN=self.csrf())
        self.assertEqual(response.status_code, 400)
        self.assertNotIn(SESSION_KEY, self.client.session)

    def test_anonymous_login_requires_csrf_token(self):
        response = self.client.post("/api/login", {"username": "instructor", "password": self.password}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertNotIn(SESSION_KEY, self.client.session)

    def test_bad_csrf_token_is_rejected(self):
        self.csrf()
        response = self.client.post("/api/login", {"username": "instructor", "password": self.password},
            format="json", HTTP_X_CSRFTOKEN="x" * 32)
        self.assertEqual(response.status_code, 403)

    def test_signed_out_protected_requests_are_401(self):
        self.assertEqual(self.client.get("/test/instructor").status_code, 401)
        self.assertEqual(self.client.post("/api/logout").status_code, 401)

    def test_role_check_allows_instructor_and_denies_reviewer(self):
        self.login()
        self.assertEqual(self.client.get("/test/instructor").status_code, 200)
        self.assertEqual(self.client.get("/test/unconfigured").status_code, 403)
        self.login(username="reviewer")
        denied = self.client.get("/test/instructor")
        self.assertEqual(denied.status_code, 403)
        self.assertNotIn("authorized", denied.data)

    def test_logout_requires_csrf_and_invalidates_the_stored_session(self):
        self.login()
        old_key = self.client.session.session_key
        self.assertEqual(self.client.post("/api/logout").status_code, 403)
        token = self.client.cookies[settings.CSRF_COOKIE_NAME].value
        response = self.client.post("/api/logout", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 204)
        store = import_module(settings.SESSION_ENGINE).SessionStore
        self.assertFalse(store().exists(old_key))
        self.assertEqual(self.client.get("/api/session").data, {"user": None})
        self.assertEqual(self.client.get("/test/instructor").status_code, 401)

    def test_expired_session_cannot_authorize_requests(self):
        self.login()
        session = self.client.session
        session.set_expiry(-1)
        session.save()
        self.assertEqual(self.client.get("/test/instructor").status_code, 401)
        self.assertEqual(self.client.get("/api/session").data, {"user": None})

    def test_removed_role_is_not_authorized_by_existing_session(self):
        self.login()
        self.instructor.groups.clear()
        self.assertEqual(self.client.get("/api/session").status_code, 403)
        self.assertEqual(self.client.get("/test/instructor").status_code, 403)

    @override_settings(SESSION_COOKIE_SECURE=True, CSRF_COOKIE_SECURE=True)
    def test_https_cookies_are_secure_and_login_rejects_foreign_origin(self):
        token = self.csrf(secure=True)
        payload = {"username": "instructor", "password": self.password}
        denied = self.client.post("/api/login", payload, format="json", secure=True,
            HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN="https://untrusted.example")
        self.assertEqual(denied.status_code, 403)
        response = self.client.post("/api/login", payload, format="json", secure=True,
            HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN="https://testserver")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.cookies[settings.SESSION_COOKIE_NAME]["secure"])
        self.assertTrue(response.cookies[settings.CSRF_COOKIE_NAME]["secure"])
