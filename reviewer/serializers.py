from rest_framework import serializers

from .models import FormField, FormStatus, PracticeForm, ReviewDecision, ReviewNotification


class FormFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormField
        fields = ("id", "position", "label", "input_type", "required", "validation")


class PracticeFormQueueSerializer(serializers.ModelSerializer):
    field_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PracticeForm
        fields = ("id", "title", "source_url", "source_available", "categories", "failure_reason", "status", "created_at", "field_count")


class PracticeFormDetailSerializer(serializers.ModelSerializer):
    fields = FormFieldSerializer(many=True, read_only=True)
    decision = serializers.SerializerMethodField()

    class Meta:
        model = PracticeForm
        fields = ("id", "title", "source_url", "source_available", "categories", "failure_reason", "status", "created_at", "updated_at", "fields", "decision")
    def get_decision(self, obj):
        try:
            decision = obj.review_decision
        except ReviewDecision.DoesNotExist:
            return None
        return {
            "outcome": decision.outcome,
            "reviewer": decision.reviewer.username,
            "rejection_reason": decision.rejection_reason,
            "decided_at": decision.decided_at,
        }


class DecisionRequestSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=("APPROVE", "REJECT"))
    rejection_reason = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)

    def validate(self, attrs):
        if attrs["decision"] == "REJECT" and not attrs.get("rejection_reason", "").strip():
            raise serializers.ValidationError({"rejection_reason": "A rejection reason is required when rejecting a form."})
        if attrs["decision"] == "APPROVE" and attrs.get("rejection_reason", "").strip():
            raise serializers.ValidationError({"rejection_reason": "A rejection reason is only valid for a rejection."})
        return attrs


class ExtractionFieldSerializer(serializers.Serializer):
    position = serializers.IntegerField(min_value=0)
    label = serializers.CharField(max_length=300, trim_whitespace=True)
    input_type = serializers.ChoiceField(choices=[choice[0] for choice in FormField.INPUT_TYPES])
    required = serializers.BooleanField(default=False)
    validation = serializers.JSONField(required=False, default=dict)


class ExtractionRequestSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, trim_whitespace=True)
    source_url = serializers.URLField(max_length=2048)
    source_available = serializers.BooleanField(default=True)
    # Optional form categories; reject blank labels.
    categories = serializers.ListField(
        child=serializers.CharField(
            max_length=100,
            allow_blank=False,
            trim_whitespace=True,
        ),
        required=False,
        default=list,
    )
    fields = ExtractionFieldSerializer(many=True, allow_empty=False)

    @staticmethod
    def _contains_answer_value(value):
        if isinstance(value, dict):
            return any(
                key.lower().replace("-", "_") in {"answer", "answers", "answer_value"}
                or ExtractionRequestSerializer._contains_answer_value(child)
                for key, child in value.items()
            )
        if isinstance(value, list):
            return any(ExtractionRequestSerializer._contains_answer_value(item) for item in value)
        return False

    def validate(self, attrs):
        # Extraction carries a schema only. Learner answers are a privacy boundary.
        if self._contains_answer_value(self.initial_data):
            raise serializers.ValidationError("Extraction payloads must not contain learner answers.")
        return attrs

    def validate_categories(self, categories):
        # Reject duplicate categories, ignoring letter case.
        normalized = [category.casefold() for category in categories]
        if len(set(normalized)) != len(normalized):
            raise serializers.ValidationError(
                "Categories must not contain duplicates."
            )
        return categories

    def validate_fields(self, fields):
        positions = [field["position"] for field in fields]
        if len(set(positions)) != len(positions):
            raise serializers.ValidationError("Each extracted field must have a unique position.")
        return fields


class NotificationSerializer(serializers.ModelSerializer):
    form_id = serializers.UUIDField(source="practice_form_id", read_only=True)
    form_title = serializers.CharField(source="practice_form.title", read_only=True)

    class Meta:
        model = ReviewNotification
        fields = ("id", "form_id", "form_title", "created_at", "is_read")
