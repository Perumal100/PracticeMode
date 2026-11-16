"""Form Reviewers write hints, translations and the preparation checklist.

Guidance never changes a form's structure, so it may be edited while a form
awaits review and after it is approved; learners see the change at once.
"""
from collections.abc import Mapping

from django.db import transaction
from rest_framework import serializers, status
from rest_framework.exceptions import APIException, NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from reviewer.models import FormField, FormStatus, PracticeForm
from reviewer.permissions import IsFormReviewer

from .languages import LANGUAGES, ORIGINAL
from .models import ChecklistItem, Hint, Translation

EDITABLE = (FormStatus.AWAITING_REVIEW, FormStatus.APPROVED)


class GuidanceLocked(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = {"error": "GUIDANCE_LOCKED", "message": "Guidance can be edited only on forms awaiting review or approved."}


class Strict(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, Mapping) and set(data) - set(self.fields):
            raise serializers.ValidationError({"error": "INVALID_REQUEST", "message": "Unknown fields."})
        return super().to_internal_value(data)


class TranslationInput(Strict):
    language_code = serializers.ChoiceField(choices=[code for code in LANGUAGES if code != ORIGINAL])
    translated_label = serializers.CharField(max_length=300, allow_blank=True, required=False, default="")
    guidance_text = serializers.CharField(max_length=1000, allow_blank=True, required=False, default="")


class FieldGuidanceInput(Strict):
    hint = serializers.CharField(max_length=1000, allow_blank=True)
    translations = TranslationInput(many=True)

    def validate_translations(self, items):
        codes = [item["language_code"] for item in items]
        if len(codes) != len(set(codes)):
            raise serializers.ValidationError("Each language may appear only once.")
        for item in items:
            if not item["translated_label"].strip() and not item["guidance_text"].strip():
                raise serializers.ValidationError(f"Give a translated label or guidance for {LANGUAGES[item['language_code']]}, or remove it.")
        return items


class ChecklistItemInput(Strict):
    description = serializers.CharField(max_length=300)
    fictional_example = serializers.CharField(max_length=300, allow_blank=True, required=False, default="")


class ChecklistInput(Strict):
    items = ChecklistItemInput(many=True, max_length=30)


def _editable_form(form_id):
    try:
        form = PracticeForm.objects.select_for_update().get(pk=form_id)
    except PracticeForm.DoesNotExist:
        raise NotFound({"error": "FORM_NOT_FOUND"}) from None
    if form.status not in EDITABLE:
        raise GuidanceLocked()
    return form


def field_guidance(field):
    return {
        "hint": next((h.text for h in field.hints.all() if h.language_code == ORIGINAL), ""),
        "translations": [
            {"language_code": t.language_code, "translated_label": t.translated_label, "guidance_text": t.guidance_text}
            for t in field.translations.all()
        ],
    }


class FieldGuidanceView(APIView):
    permission_classes = [IsFormReviewer]

    def put(self, request, form_id, field_id):
        data = FieldGuidanceInput(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            form = _editable_form(form_id)
            try:
                field = form.fields.get(pk=field_id)
            except FormField.DoesNotExist:
                raise NotFound({"error": "FIELD_NOT_FOUND"}) from None
            # The submitted guidance replaces what was there; blank means none.
            hint = data.validated_data["hint"].strip()
            Hint.objects.filter(field=field, language_code=ORIGINAL).delete()
            if hint:
                Hint.objects.create(field=field, language_code=ORIGINAL, text=hint)
            field.translations.all().delete()
            Translation.objects.bulk_create([
                Translation(field=field, language_code=item["language_code"],
                            translated_label=item["translated_label"].strip(), guidance_text=item["guidance_text"].strip())
                for item in data.validated_data["translations"]
            ])
        field = FormField.objects.prefetch_related("hints", "translations").get(pk=field.pk)
        return Response(field_guidance(field))


class ChecklistView(APIView):
    permission_classes = [IsFormReviewer]

    def put(self, request, form_id):
        data = ChecklistInput(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            form = _editable_form(form_id)
            form.checklist_items.all().delete()
            ChecklistItem.objects.bulk_create([
                ChecklistItem(practice_form=form, position=index, description=item["description"].strip(),
                              fictional_example=item["fictional_example"].strip())
                for index, item in enumerate(data.validated_data["items"], start=1)
            ])
        return Response([
            {"position": item.position, "description": item.description, "fictional_example": item.fictional_example}
            for item in form.checklist_items.all()
        ])
