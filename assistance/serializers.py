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
    meetingDetails = serializers.CharField(max_length=1000, error_messages={
        "required": "Add the meeting details the learner needs.", "blank": "Add the meeting details the learner needs.",
    })


def learner_code(user):
    """The learner's username: it tells learners with the same display name apart and is not personal data."""
    return user.get_username()


class AssistanceRequestSerializer(serializers.ModelSerializer):
    requestId = serializers.UUIDField(source="id")
    attemptId = serializers.UUIDField(source="attempt_id")
    formId = serializers.UUIDField(source="attempt.practice_form_id")
    formTitle = serializers.CharField(source="attempt.practice_form.title")
    requestedSlot = serializers.DateTimeField(source="requested_slot")
    meetingDetails = serializers.CharField(source="meeting_details")
    instructorName = serializers.SerializerMethodField()
    learnerName = serializers.SerializerMethodField()
    learnerCode = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at")

    class Meta:
        model = AssistanceRequest
        fields = ("requestId", "status", "attemptId", "formId", "formTitle", "requestedSlot", "note",
                  "meetingDetails", "instructorName", "learnerName", "learnerCode", "createdAt")

    def get_instructorName(self, request):
        return display_name(request.instructor) if request.instructor_id else None

    def get_learnerName(self, request):
        return display_name(request.learner)

    def get_learnerCode(self, request):
        return learner_code(request.learner)
