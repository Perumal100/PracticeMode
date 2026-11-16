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


class AssistanceRequestSerializer(serializers.ModelSerializer):
    requestId = serializers.UUIDField(source="id")
    attemptId = serializers.UUIDField(source="attempt_id")
    formId = serializers.UUIDField(source="attempt.practice_form_id")
    formTitle = serializers.CharField(source="attempt.practice_form.title")
    requestedSlot = serializers.DateTimeField(source="requested_slot")
    meetingDetails = serializers.CharField(source="meeting_details")
    instructorName = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at")

    class Meta:
        model = AssistanceRequest
        fields = ("requestId", "status", "attemptId", "formId", "formTitle", "requestedSlot", "note",
                  "meetingDetails", "instructorName", "createdAt")

    def get_instructorName(self, request):
        return display_name(request.instructor) if request.instructor_id else None
