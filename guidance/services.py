from .models import Hint, Translation


def copy_guidance(original, revision):
    """Carry guidance over to a revision, matching fields by position."""
    targets = {field.position: field for field in revision.fields.all()}
    Hint.objects.bulk_create([
        Hint(field=targets[hint.field.position], language_code=hint.language_code, text=hint.text)
        for hint in Hint.objects.filter(field__practice_form=original).select_related("field")
        if hint.field.position in targets
    ])
    Translation.objects.bulk_create([
        Translation(field=targets[item.field.position], language_code=item.language_code,
                    translated_label=item.translated_label, guidance_text=item.guidance_text)
        for item in Translation.objects.filter(field__practice_form=original).select_related("field")
        if item.field.position in targets
    ])
