from collections.abc import Mapping

from rest_framework import serializers

from .models import Answer, Attempt


class RequestSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, Mapping) and set(data) - set(self.fields):
            raise serializers.ValidationError({"error": "INVALID_REQUEST", "message": "Unknown request fields."})
        return super().to_internal_value(data)


class CreateAttemptSerializer(RequestSerializer):
    formId = serializers.UUIDField()
    # Accepted for the documented request shape. Identity always comes from
    # the authenticated session; this does not create/update/select an owner.
    displayName = serializers.CharField(required=False, max_length=150)


class SaveAnswerSerializer(RequestSerializer):
    value = serializers.JSONField(allow_null=True)


class CompletionRequestSerializer(RequestSerializer):
    pass


class AnswerSerializer(serializers.ModelSerializer):
    fieldId = serializers.UUIDField(source="field_id")
    savedAt = serializers.DateTimeField(source="updated_at")

    class Meta:
        model = Answer
        fields = ("fieldId", "value", "savedAt")


class CompletionSerializer(serializers.ModelSerializer):
    completedAt = serializers.DateTimeField(source="completed_at")
    validationFeedback = serializers.JSONField(source="validation_feedback")

    class Meta:
        model = Attempt
        fields = ("status", "completedAt", "validationFeedback")


class AttemptSerializer(CompletionSerializer):
    formId = serializers.UUIDField(source="practice_form_id")
    startedAt = serializers.DateTimeField(source="started_at")
    lastSavedAt = serializers.DateTimeField(source="last_saved_at")
    answers = AnswerSerializer(many=True, read_only=True)

    class Meta(CompletionSerializer.Meta):
        fields = ("id", "formId", "status", "startedAt", "lastSavedAt", "completedAt", "validationFeedback", "answers")
