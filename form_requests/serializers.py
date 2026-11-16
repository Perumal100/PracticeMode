from collections.abc import Mapping

from rest_framework import serializers

from .models import FormRequest
from .services import learner_view

ALLOWED_SCHEMES = ("http", "https")


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, Mapping) and set(data) - set(self.fields):
            raise serializers.ValidationError({"error": "INVALID_REQUEST", "message": "Unknown request fields."})
        return super().to_internal_value(data)


class CreateFormRequestSerializer(StrictSerializer):
    url = serializers.URLField(max_length=2048, error_messages={
        "required": "Paste the link to the form.", "blank": "Paste the link to the form.",
        "invalid": "Paste a full link, starting with https://",
    })
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")

    def validate_url(self, value):
        if value.split(":", 1)[0].lower() not in ALLOWED_SCHEMES:
            raise serializers.ValidationError("Paste a full link, starting with https://")
        return value


class LinkSerializer(StrictSerializer):
    formId = serializers.UUIDField()


class DeclineSerializer(StrictSerializer):
    reason = serializers.CharField(max_length=500, error_messages={
        "required": "Tell the learner why this form cannot be practised.", "blank": "Tell the learner why this form cannot be practised.",
    })


class ReviewFilterSerializer(StrictSerializer):
    status = serializers.ChoiceField(choices=FormRequest.Status.choices, required=False)


class LearnerFormRequestSerializer(serializers.ModelSerializer):
    requestId = serializers.UUIDField(source="id")
    createdAt = serializers.DateTimeField(source="created_at")
    updatedAt = serializers.DateTimeField(source="updated_at")

    class Meta:
        model = FormRequest
        fields = ("requestId", "url", "note", "createdAt", "updatedAt")

    def to_representation(self, request):
        return {**super().to_representation(request), **learner_view(request)}


class ReviewFormRequestSerializer(serializers.ModelSerializer):
    """What a reviewer needs to act on a request. The learner is never named."""

    requestId = serializers.UUIDField(source="id")
    createdAt = serializers.DateTimeField(source="created_at")
    declineReason = serializers.CharField(source="decline_reason")
    requestCount = serializers.SerializerMethodField()
    form = serializers.SerializerMethodField()

    class Meta:
        model = FormRequest
        fields = ("requestId", "url", "note", "status", "createdAt", "declineReason", "requestCount", "form")

    def get_requestCount(self, request):
        return self.context["counts"].get((request.source_key, request.status), 1)

    def get_form(self, request):
        form = request.form
        return {"id": str(form.pk), "title": form.title, "status": form.status} if form else None
