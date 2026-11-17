from rest_framework import serializers

from .languages import LANGUAGES
from .models import ChecklistItem, Hint, Translation


class HintSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hint
        fields = ("language_code", "text")


class TranslationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Translation
        fields = ("language_code", "translated_label", "guidance_text")


class ChecklistItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChecklistItem
        fields = ("position", "description", "fictional_example")


def guidance_languages():
    """Every language a learner may choose, whether or not a form has content in it yet."""
    return [{"code": code, "name": name} for code, name in LANGUAGES.items()]
