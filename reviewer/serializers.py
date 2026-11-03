import math

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
        fields = ("id", "title", "source_url", "source_available", "status", "created_at", "field_count")


class PracticeFormDetailSerializer(serializers.ModelSerializer):
    fields = FormFieldSerializer(many=True, read_only=True)
    decision = serializers.SerializerMethodField()

    class Meta:
        model = PracticeForm
        fields = ("id", "title", "source_url", "source_available", "status", "created_at", "updated_at", "fields", "decision")

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


# Validation rules each input type may carry: the ones the attempt module
# (attempts/validation.py) can check. Any other rule would let a reviewer
# approve a form that learners can never start (422 UNSUPPORTED_FORM_SCHEMA).
LENGTH_RULES = {"minLength", "maxLength"}
SUPPORTED_RULES = {
    "text": LENGTH_RULES, "email": LENGTH_RULES, "tel": LENGTH_RULES, "textarea": LENGTH_RULES,
    "select": LENGTH_RULES | {"allowedValues"}, "number": {"min", "max"}, "date": set(), "checkbox": set(),
}


def _finite_number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


class ExtractionFieldSerializer(serializers.Serializer):
    position = serializers.IntegerField(min_value=0)
    label = serializers.CharField(max_length=300, trim_whitespace=True)
    input_type = serializers.ChoiceField(choices=[choice[0] for choice in FormField.INPUT_TYPES])
    required = serializers.BooleanField(default=False)
    validation = serializers.JSONField(required=False, default=dict)

    def validate(self, attrs):
        rules = attrs.get("validation")
        if not isinstance(rules, dict):
            raise serializers.ValidationError({"validation": "Validation rules must be an object."})
        input_type = attrs["input_type"]
        problems = []
        for name, value in rules.items():
            if name == "required":
                ok = value is attrs["required"]
            elif name not in SUPPORTED_RULES[input_type]:
                ok = False
            elif name in LENGTH_RULES:
                ok = type(value) is int and value >= 0
            elif name in {"min", "max"}:
                ok = _finite_number(value) is not None
            else:  # allowedValues
                ok = (isinstance(value, list) and bool(value) and len(set(map(str, value))) == len(value)
                      and all(isinstance(item, str) and item.strip() for item in value))
            if not ok:
                problems.append(f"{name} is not a supported rule for a {input_type} field.")
        if input_type == "select" and "allowedValues" not in rules:
            problems.append("A select field needs its options in allowedValues.")
        if type(rules.get("minLength")) is int and type(rules.get("maxLength")) is int and rules["minLength"] > rules["maxLength"]:
            problems.append("minLength exceeds maxLength.")
        low, high = _finite_number(rules.get("min")), _finite_number(rules.get("max"))
        if low is not None and high is not None and low > high:
            problems.append("min exceeds max.")
        if problems:
            raise serializers.ValidationError({"validation": problems})
        return attrs


class ExtractionRequestSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, trim_whitespace=True)
    source_url = serializers.URLField(max_length=2048)
    source_available = serializers.BooleanField(default=True)
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
