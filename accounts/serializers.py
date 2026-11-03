from rest_framework import serializers

from .identity import LEARNER, ROLES


class LoginSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=ROLES, required=False)
    username = serializers.CharField(required=False, trim_whitespace=False)
    password = serializers.CharField(required=False, trim_whitespace=False, write_only=True)
    displayName = serializers.CharField(required=False, max_length=150)

    def validate(self, attrs):
        unknown = set(self.initial_data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError("Unknown login fields.")
        if attrs.get("role") == LEARNER:
            if not attrs.get("displayName"):
                raise serializers.ValidationError({"displayName": "A display name is required."})
            if "username" in attrs or "password" in attrs:
                raise serializers.ValidationError("Learners use a display name only.")
        else:
            if "displayName" in attrs:
                raise serializers.ValidationError("Display-name access requires the LEARNER role.")
            for field in ("username", "password"):
                if not attrs.get(field):
                    raise serializers.ValidationError({field: "This field is required."})
        return attrs


class UserSerializer(serializers.Serializer):
    id = serializers.CharField()
    displayName = serializers.CharField(allow_blank=True)
    role = serializers.ChoiceField(choices=ROLES)
