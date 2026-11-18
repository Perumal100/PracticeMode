from collections.abc import Mapping

from django.utils import timezone
from rest_framework import serializers

from .models import AssistanceRequest


def display_name(user):
    return user.get_full_name() or ""


class RequestBodySerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, Mapping) and set(data) - set(self.fields):
            raise serializers.ValidationError({"error": "INVALID_REQUEST", "message": "Unknown request fields."})
        return super().to_internal_value(data)


class CreateRequestSerializer(RequestBodySerializer):
    attemptId = serializers.UUIDField()
    requestedSlot = serializers.DateTimeField(error_messages={"required": "Choose a date and time for the session."})
    note = serializers.CharField(max_length=1000, error_messages={
        "required": "Say what you need help with.", "blank": "Say what you need help with.",
    })

    def validate_requestedSlot(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("Choose a time in the future.")
        return value


class LearnerListFilterSerializer(RequestBodySerializer):
    attemptId = serializers.UUIDField(required=False)


class InstructorListFilterSerializer(RequestBodySerializer):
    status = serializers.ChoiceField(choices=AssistanceRequest.Status.choices, required=False)


class ScheduleSerializer(RequestBodySerializer):
    # Omitted: the instructor's default meeting link is used.
    meetingLink = serializers.URLField(max_length=500, required=False, error_messages={"invalid": "Enter a full link, starting with https://"})
    meetingDetails = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")

    def validate_meetingLink(self, value):
        if value.split(":", 1)[0].lower() not in ("http", "https"):
            raise serializers.ValidationError("Enter a full link, starting with https://")
        return value


class EventSerializer(serializers.Serializer):
    action = serializers.CharField()
    label = serializers.CharField(source="get_action_display")
    detail = serializers.CharField()
    at = serializers.DateTimeField()
    by = serializers.SerializerMethodField()

    def get_by(self, event):
        return display_name(event.actor) if event.actor_id else None


def learner_code(user):
    """The learner's username: it tells learners with the same display name apart and is not personal data."""
    return user.get_username()


class AssistanceRequestSerializer(serializers.ModelSerializer):
    requestId = serializers.UUIDField(source="id")
    attemptId = serializers.UUIDField(source="attempt_id")
    formId = serializers.UUIDField(source="attempt.practice_form_id")
    formTitle = serializers.CharField(source="attempt.practice_form.title")
    requestedSlot = serializers.DateTimeField(source="requested_slot")
    meetingLink = serializers.CharField(source="meeting_link")
    meetingDetails = serializers.CharField(source="meeting_details")
    events = EventSerializer(many=True, read_only=True)
    instructorName = serializers.SerializerMethodField()
    learnerName = serializers.SerializerMethodField()
    learnerCode = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at")

    class Meta:
        model = AssistanceRequest
        fields = ("requestId", "status", "attemptId", "formId", "formTitle", "requestedSlot", "note",
                  "meetingLink", "meetingDetails", "instructorName", "learnerName", "learnerCode", "createdAt", "events")

    def get_instructorName(self, request):
        return display_name(request.instructor) if request.instructor_id else None

    def get_learnerName(self, request):
        return display_name(request.learner)

    def get_learnerCode(self, request):
        return learner_code(request.learner)
