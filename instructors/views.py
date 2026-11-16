from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.identity import INSTRUCTOR
from accounts.permissions import HasRole
from reviewer.models import FormStatus, PracticeForm
from reviewer.permissions import IsFormReviewer

from . import services
from .models import FormChangeRequest, InstructorProfile
from .serializers import (
    ChangeFilterSerializer, ChangeRequestInputSerializer, ChangeRequestSerializer, ChangeResponseSerializer,
    DecisionNoteSerializer, InstructorSerializer, InstructorSignupSerializer, OwnProfileSerializer,
    ProfileUpdateSerializer, PublishedFormDetailSerializer, PublishedFormSerializer, StatusFilterSerializer,
)

Status = InstructorProfile.Status


def _taken():
    return Response({"error": "USERNAME_TAKEN", "message": "That username is taken. Choose another one."}, status=409)


@method_decorator(never_cache, name="dispatch")
class InstructorSignupView(APIView):
    """Anyone may ask for an instructor account; a Form Reviewer approves it before it can sign in."""

    permission_classes = [AllowAny]

    def post(self, request):
        SessionAuthentication().enforce_csrf(request)
        data = InstructorSignupSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        try:
            services.create_instructor(
                username=values["username"], full_name=values["fullName"], password=values["password"],
                meeting_link=values["meetingLink"], organisation=values["organisation"].strip(),
            )
        except services.UsernameTaken:
            return _taken()
        return Response({"status": Status.PENDING, "message": "Your account is waiting for a Form Reviewer to approve it."}, status=201)


class InstructorView(APIView):
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = (INSTRUCTOR,)


class OwnProfileView(InstructorView):
    def get(self, request):
        return Response(OwnProfileSerializer(services.profile_for(request.user)).data)

    def patch(self, request):
        data = ProfileUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        profile = services.profile_for(request.user)
        profile.meeting_link = data.validated_data["meetingLink"]
        if "organisation" in data.validated_data:
            profile.organisation = data.validated_data["organisation"].strip()
        profile.save(update_fields=["meeting_link", "organisation"])
        return Response(OwnProfileSerializer(profile).data)


# ── Form Reviewers manage instructors ─────────────────────────────────
class ReviewInstructorListView(APIView):
    permission_classes = [IsFormReviewer]

    def get(self, request):
        filters = StatusFilterSerializer(data=request.query_params.dict())
        filters.is_valid(raise_exception=True)
        # Instructors from before profiles existed get one, so every instructor is listed.
        for user in get_user_model().objects.filter(groups__name=INSTRUCTOR, instructor_profile__isnull=True):
            services.profile_for(user)
        profiles = InstructorProfile.objects.select_related("user")
        if status := filters.validated_data.get("status"):
            profiles = profiles.filter(status=status)
        return Response(InstructorSerializer(profiles, many=True).data)

    def post(self, request):
        """A reviewer adds an instructor directly; the account is active at once."""
        data = InstructorSignupSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        try:
            profile = services.create_instructor(
                username=values["username"], full_name=values["fullName"], password=values["password"],
                meeting_link=values["meetingLink"], organisation=values["organisation"].strip(), active=True, by=request.user,
            )
        except services.UsernameTaken:
            return _taken()
        return Response(InstructorSerializer(profile).data, status=201)


# Which status each action moves from, and to.
TRANSITIONS = {
    "approve": ({Status.PENDING}, Status.ACTIVE),
    "decline": ({Status.PENDING}, Status.DECLINED),
    "remove": ({Status.ACTIVE}, Status.REMOVED),
    "restore": ({Status.REMOVED, Status.DECLINED}, Status.ACTIVE),
}


class ReviewInstructorActionView(APIView):
    permission_classes = [IsFormReviewer]

    def post(self, request, user_id, action):
        if action not in TRANSITIONS:
            raise NotFound({"error": "UNKNOWN_ACTION"})
        data = DecisionNoteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            try:
                profile = InstructorProfile.objects.select_for_update().select_related("user").get(user_id=user_id)
            except InstructorProfile.DoesNotExist:
                raise NotFound({"error": "INSTRUCTOR_NOT_FOUND"}) from None
            allowed_from, target = TRANSITIONS[action]
            if profile.status not in allowed_from:
                return Response({"error": "INVALID_TRANSITION", "message": f"This instructor is {profile.get_status_display().lower()}."}, status=409)
            services.set_status(profile, target, request.user, data.validated_data["note"].strip())
        return Response(InstructorSerializer(profile).data)


# ── Instructors see published forms and report mistakes ───────────────
class PublishedFormListView(InstructorView):
    def get(self, request):
        forms = PracticeForm.objects.filter(status=FormStatus.APPROVED).prefetch_related("fields").order_by("title")
        return Response(PublishedFormSerializer(forms, many=True).data)


class PublishedFormDetailView(InstructorView):
    def get(self, request, form_id):
        try:
            form = PracticeForm.objects.prefetch_related("fields").get(pk=form_id, status=FormStatus.APPROVED)
        except PracticeForm.DoesNotExist:
            raise NotFound({"error": "FORM_NOT_FOUND", "message": "This form is not published."}) from None
        return Response(PublishedFormDetailSerializer(form).data)


class ChangeRequestListView(InstructorView):
    def get(self, request):
        changes = FormChangeRequest.objects.filter(instructor=request.user).select_related("practice_form", "instructor", "resolved_by")
        return Response(ChangeRequestSerializer(changes, many=True).data)

    def post(self, request):
        data = ChangeRequestInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        try:
            form = PracticeForm.objects.get(pk=values["formId"], status=FormStatus.APPROVED)
        except PracticeForm.DoesNotExist:
            return Response({"error": "FORM_NOT_FOUND", "message": "Only published forms can be reported."}, status=404)
        field = None
        if values.get("fieldId"):
            field = form.fields.filter(pk=values["fieldId"]).first()
            if field is None:
                return Response({"fieldId": ["This question is not part of the form."]}, status=400)
        change = FormChangeRequest.objects.create(
            practice_form=form, field=field, field_label=field.label if field else "",
            instructor=request.user, description=values["description"].strip(),
        )
        return Response(ChangeRequestSerializer(change).data, status=201)


class ReviewChangeRequestListView(APIView):
    permission_classes = [IsFormReviewer]

    def get(self, request):
        filters = ChangeFilterSerializer(data=request.query_params.dict())
        filters.is_valid(raise_exception=True)
        changes = FormChangeRequest.objects.select_related("practice_form", "instructor", "resolved_by")
        if status := filters.validated_data.get("status"):
            changes = changes.filter(status=status)
        return Response(ChangeRequestSerializer(changes, many=True).data)


class ReviewChangeRequestActionView(APIView):
    permission_classes = [IsFormReviewer]

    def post(self, request, change_id, action):
        targets = {"resolve": FormChangeRequest.Status.RESOLVED, "decline": FormChangeRequest.Status.DECLINED}
        if action not in targets:
            raise NotFound({"error": "UNKNOWN_ACTION"})
        data = ChangeResponseSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            try:
                change = FormChangeRequest.objects.select_for_update().get(pk=change_id)
            except FormChangeRequest.DoesNotExist:
                raise NotFound({"error": "CHANGE_REQUEST_NOT_FOUND"}) from None
            if change.status != FormChangeRequest.Status.OPEN:
                return Response({"error": "CHANGE_REQUEST_CLOSED", "message": "This request has already been answered."}, status=409)
            change.status, change.response = targets[action], data.validated_data["response"].strip()
            change.resolved_by, change.resolved_at = request.user, timezone.now()
            change.save(update_fields=["status", "response", "resolved_by", "resolved_at"])
        change = FormChangeRequest.objects.select_related("practice_form", "instructor", "resolved_by").get(pk=change.pk)
        return Response(ChangeRequestSerializer(change).data)
