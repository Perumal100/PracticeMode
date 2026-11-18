from collections.abc import Mapping

from rest_framework import serializers

from accounts.serializers import USERNAME_PATTERN, RegisterSerializer
from reviewer.models import FormField, PracticeForm

from .models import FormChangeRequest, InstructorProfile


class Strict(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, Mapping) and set(data) - set(self.fields):
            raise serializers.ValidationError({"error": "INVALID_REQUEST", "message": "Unknown fields."})
        return super().to_internal_value(data)


def meeting_link_field(**kwargs):
    return serializers.URLField(max_length=500, error_messages={
        "required": "Add the link learners use to join your sessions.", "blank": "Add the link learners use to join your sessions.",
        "invalid": "Enter a full link, starting with https://",
    }, **kwargs)


def check_web_link(value):
    if value and value.split(":", 1)[0].lower() not in ("http", "https"):
        raise serializers.ValidationError("Enter a full link, starting with https://")
    return value


class InstructorSignupSerializer(Strict):
    username = serializers.RegexField(USERNAME_PATTERN, error_messages={
        "invalid": "Use 3 to 30 letters, numbers, dots, dashes or underscores.", "required": "Choose a username.", "blank": "Choose a username.",
    })
    fullName = serializers.CharField(max_length=150, error_messages={"required": "Enter your name.", "blank": "Enter your name."})
    password = serializers.CharField(trim_whitespace=False, write_only=True)
    meetingLink = meeting_link_field()
    organisation = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")

    validate_meetingLink = staticmethod(check_web_link)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        # The same password rules as learner accounts.
        checker = RegisterSerializer(data={"username": attrs["username"], "displayName": attrs["fullName"], "password": attrs["password"]})
        if not checker.is_valid() and "password" in checker.errors:
            raise serializers.ValidationError({"password": checker.errors["password"]})
        return attrs


class ProfileUpdateSerializer(Strict):
    meetingLink = meeting_link_field()
    organisation = serializers.CharField(max_length=200, required=False, allow_blank=True)

    validate_meetingLink = staticmethod(check_web_link)


class DecisionNoteSerializer(Strict):
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class StatusFilterSerializer(Strict):
    status = serializers.ChoiceField(choices=InstructorProfile.Status.choices, required=False)


class InstructorSerializer(serializers.ModelSerializer):
    """What a Form Reviewer sees about an instructor."""

    id = serializers.CharField(source="user_id")
    username = serializers.CharField(source="user.username")
    fullName = serializers.SerializerMethodField()
    meetingLink = serializers.CharField(source="meeting_link")
    createdAt = serializers.DateTimeField(source="created_at")
    decidedAt = serializers.DateTimeField(source="decided_at")
    decisionNote = serializers.CharField(source="decision_note")
    sessionCount = serializers.SerializerMethodField()

    class Meta:
        model = InstructorProfile
        fields = ("id", "username", "fullName", "organisation", "meetingLink", "status", "createdAt", "decidedAt", "decisionNote", "sessionCount")

    def get_fullName(self, profile):
        return profile.user.get_full_name()

    def get_sessionCount(self, profile):
        return profile.user.assigned_assistance_requests.count()


class OwnProfileSerializer(serializers.ModelSerializer):
    fullName = serializers.SerializerMethodField()
    meetingLink = serializers.CharField(source="meeting_link")

    class Meta:
        model = InstructorProfile
        fields = ("fullName", "organisation", "meetingLink", "status")

    def get_fullName(self, profile):
        return profile.user.get_full_name()


class FormQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormField
        fields = ("id", "position", "label", "input_type", "required", "validation")


class PublishedFormSerializer(serializers.ModelSerializer):
    fieldCount = serializers.IntegerField(source="fields.count")

    class Meta:
        model = PracticeForm
        fields = ("id", "title", "categories", "fieldCount")


class PublishedFormDetailSerializer(PublishedFormSerializer):
    fields = FormQuestionSerializer(many=True, read_only=True)

    class Meta(PublishedFormSerializer.Meta):
        fields = (*PublishedFormSerializer.Meta.fields, "fields")


class ChangeRequestInputSerializer(Strict):
    formId = serializers.UUIDField()
    fieldId = serializers.UUIDField(required=False, allow_null=True)
    description = serializers.CharField(max_length=2000, error_messages={
        "required": "Describe what is wrong and what it should say.", "blank": "Describe what is wrong and what it should say.",
    })


class ChangeResponseSerializer(Strict):
    response = serializers.CharField(max_length=2000, error_messages={
        "required": "Tell the instructor what you did or why not.", "blank": "Tell the instructor what you did or why not.",
    })


class ChangeFilterSerializer(Strict):
    status = serializers.ChoiceField(choices=FormChangeRequest.Status.choices, required=False)


class ChangeRequestSerializer(serializers.ModelSerializer):
    formId = serializers.UUIDField(source="practice_form_id")
    formTitle = serializers.CharField(source="practice_form.title")
    formStatus = serializers.CharField(source="practice_form.status")
    fieldId = serializers.UUIDField(source="field_id")
    fieldLabel = serializers.CharField(source="field_label")
    instructorName = serializers.SerializerMethodField()
    resolvedBy = serializers.SerializerMethodField()
    resolvedAt = serializers.DateTimeField(source="resolved_at")
    createdAt = serializers.DateTimeField(source="created_at")

    class Meta:
        model = FormChangeRequest
        fields = ("id", "formId", "formTitle", "formStatus", "fieldId", "fieldLabel", "description", "status", "response",
                  "instructorName", "resolvedBy", "resolvedAt", "createdAt")

    def get_instructorName(self, change):
        return change.instructor.get_full_name() or change.instructor.get_username()

    def get_resolvedBy(self, change):
        return (change.resolved_by.get_full_name() or change.resolved_by.get_username()) if change.resolved_by_id else None
