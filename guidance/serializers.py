from rest_framework import serializers

from .models import Hint


class HintSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hint
        fields = ("language_code", "text")
