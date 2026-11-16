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

from . import ai
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
            {"language_code": t.language_code, "translated_label": t.translated_label, "guidance_text": t.guidance_text, "ai_draft": not t.approved}
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
            # Saving is the reviewer's approval, AI drafts included; text kept
            # word for word from a draft still records that AI wrote it.
            ai_hints = set(field.hints.filter(ai_generated=True).values_list("text", flat=True))
            ai_translations = set(field.translations.filter(ai_generated=True).values_list("language_code", "translated_label", "guidance_text"))
            hint = data.validated_data["hint"].strip()
            Hint.objects.filter(field=field, language_code=ORIGINAL).delete()
            if hint:
                Hint.objects.create(field=field, language_code=ORIGINAL, text=hint, ai_generated=hint in ai_hints, approved=True)
            field.translations.all().delete()
            rows = []
            for item in data.validated_data["translations"]:
                values = (item["language_code"], item["translated_label"].strip(), item["guidance_text"].strip())
                rows.append(Translation(field=field, language_code=values[0], translated_label=values[1], guidance_text=values[2],
                                        ai_generated=values in ai_translations, approved=True))
            Translation.objects.bulk_create(rows)
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


class AIDraftInput(Strict):
    task = serializers.ChoiceField(choices=["hints", "translations"])
    languages = serializers.ListField(
        child=serializers.ChoiceField(choices=[code for code in LANGUAGES if code != ORIGINAL]), required=False, allow_empty=False,
    )


class FieldIdsInput(Strict):
    fieldIds = serializers.ListField(child=serializers.UUIDField(), required=False)


class AIError(APIException):
    def __init__(self, status_code, code, message):
        self.status_code = status_code
        super().__init__({"error": code, "message": message})


def _check_editable(form_id):
    try:
        form = PracticeForm.objects.get(pk=form_id)
    except PracticeForm.DoesNotExist:
        raise NotFound({"error": "FORM_NOT_FOUND"}) from None
    if form.status not in EDITABLE:
        raise GuidanceLocked()
    return form


def _ask(call, *args):
    try:
        return call(*args)
    except ai.AIUnavailable:
        raise AIError(503, "AI_NOT_CONFIGURED", "AI drafting is not set up: add GEMINI_API_KEY or GROQ_API_KEY to the server's .env.") from None
    except ai.AIFailed as error:
        raise AIError(502, "AI_FAILED", f"The AI services could not draft this ({error}). Try again, or write the guidance yourself.") from None


class AIDraftView(APIView):
    """Draft missing hints or translations with AI. Drafts are hidden from learners until approved."""

    permission_classes = [IsFormReviewer]

    def post(self, request, form_id):
        data = AIDraftInput(data=request.data)
        data.is_valid(raise_exception=True)
        form = _check_editable(form_id)
        fields = list(form.fields.prefetch_related("hints", "translations"))
        providers, created = set(), 0
        # The model is called outside any transaction, so no row stays locked while it answers.
        if data.validated_data["task"] == "hints":
            missing = [f for f in fields if not any(h.language_code == ORIGINAL for h in f.hints.all())]
            drafts = {}
            if missing:
                drafts, provider = _ask(ai.draft_hints, missing)
                providers.add(provider)
            with transaction.atomic():
                _editable_form(form_id)
                taken = set(Hint.objects.filter(field__in=missing, language_code=ORIGINAL).values_list("field_id", flat=True))
                rows = [Hint(field_id=pk, language_code=ORIGINAL, text=text, ai_generated=True, approved=False)
                        for pk, text in drafts.items() if pk not in taken]
                Hint.objects.bulk_create(rows)
                created = len(rows)
            skipped = len(missing) - created
        else:
            languages = data.validated_data.get("languages") or [code for code in LANGUAGES if code != ORIGINAL]
            planned = skipped = 0
            for code in languages:
                missing = [f for f in fields if not any(t.language_code == code for t in f.translations.all())]
                if not missing:
                    continue
                planned += len(missing)
                items = [(f, next((h.text for h in f.hints.all() if h.language_code == ORIGINAL), "")) for f in missing]
                drafts, provider = _ask(ai.draft_translations, items, code)
                providers.add(provider)
                with transaction.atomic():
                    _editable_form(form_id)
                    taken = set(Translation.objects.filter(field__in=missing, language_code=code).values_list("field_id", flat=True))
                    rows = [Translation(field_id=pk, language_code=code, translated_label=label, guidance_text=guidance,
                                        ai_generated=True, approved=False)
                            for pk, (label, guidance) in drafts.items() if pk not in taken]
                    Translation.objects.bulk_create(rows)
                    created += len(rows)
            skipped = planned - created
        return Response({"created": created, "skipped": skipped, "providers": sorted(providers)})


def pending_drafts(form):
    return (Hint.objects.filter(field__practice_form=form, approved=False).count()
            + Translation.objects.filter(field__practice_form=form, approved=False).count())


def _drafts(form, field_ids):
    hints = Hint.objects.filter(field__practice_form=form, approved=False)
    translations = Translation.objects.filter(field__practice_form=form, approved=False)
    if field_ids is not None:
        hints, translations = hints.filter(field_id__in=field_ids), translations.filter(field_id__in=field_ids)
    return hints, translations


class ApproveDraftsView(APIView):
    """The reviewer has read the AI drafts and accepts them as they are."""

    permission_classes = [IsFormReviewer]

    def post(self, request, form_id):
        data = FieldIdsInput(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            form = _editable_form(form_id)
            hints, translations = _drafts(form, data.validated_data.get("fieldIds"))
            approved = hints.update(approved=True) + translations.update(approved=True)
        return Response({"approved": approved})


class DiscardDraftsView(APIView):
    permission_classes = [IsFormReviewer]

    def post(self, request, form_id):
        data = FieldIdsInput(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            form = _editable_form(form_id)
            hints, translations = _drafts(form, data.validated_data.get("fieldIds"))
            discarded = hints.delete()[0] + translations.delete()[0]
        return Response({"discarded": discarded})
