from django.contrib.auth.password_validation import CommonPasswordValidator, NumericPasswordValidator, validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .identity import ROLES

USERNAME_PATTERN = r"^[A-Za-z0-9_.-]{3,30}$"
PASSWORD_MIN_LENGTH = 8
# Learner passwords only; staff accounts are created by an administrator.
LEARNER_PASSWORD_VALIDATORS = [CommonPasswordValidator(), NumericPasswordValidator()]


class StrictSerializer(serializers.Serializer):
    def validate(self, attrs):
        if set(self.initial_data) - set(self.fields):
            raise serializers.ValidationError("Unknown fields.")
        return attrs


class LoginSerializer(StrictSerializer):
    """Every role signs in with a username and password."""

    role = serializers.ChoiceField(choices=ROLES, required=False)
    username = serializers.CharField(trim_whitespace=False)
    password = serializers.CharField(trim_whitespace=False, write_only=True)


class RegisterSerializer(StrictSerializer):
    """A learner account: no email, phone or real name is asked for."""

    username = serializers.RegexField(USERNAME_PATTERN, error_messages={
        "invalid": "Use 3 to 30 letters, numbers, dots, dashes or underscores.",
        "required": "Choose a username.", "blank": "Choose a username.",
    })
    displayName = serializers.CharField(max_length=150, error_messages={
        "required": "Choose a name to show while you practise.", "blank": "Choose a name to show while you practise.",
    })
    password = serializers.CharField(trim_whitespace=False, write_only=True, error_messages={
        "required": "Choose a password.", "blank": "Choose a password.",
    })

    def validate(self, attrs):
        attrs = super().validate(attrs)
        password = attrs["password"]
        problems = []
        if len(password) < PASSWORD_MIN_LENGTH:
            problems.append(f"Use at least {PASSWORD_MIN_LENGTH} characters.")
        elif password.casefold() in (attrs["username"].casefold(), attrs["displayName"].strip().casefold()):
            problems.append("Do not use your username or display name as your password.")
        else:
            try:
                validate_password(password, password_validators=LEARNER_PASSWORD_VALIDATORS)
            except DjangoValidationError as error:
                problems.extend(error.messages)
        if problems:
            raise serializers.ValidationError({"password": problems})
        attrs["displayName"] = attrs["displayName"].strip()
        return attrs


class UserSerializer(serializers.Serializer):
    id = serializers.CharField()
    displayName = serializers.CharField(allow_blank=True)
    role = serializers.ChoiceField(choices=ROLES)
