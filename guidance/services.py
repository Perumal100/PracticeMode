from .models import ChecklistItem, Hint, Translation


def copy_guidance(original, revision):
    """Carry guidance over to a revision, matching fields by position."""
    targets = {field.position: field for field in revision.fields.all()}
    Hint.objects.bulk_create([
        Hint(field=targets[hint.field.position], language_code=hint.language_code, text=hint.text,
             ai_generated=hint.ai_generated, approved=hint.approved)
        for hint in Hint.objects.filter(field__practice_form=original).select_related("field")
        if hint.field.position in targets
    ])
    Translation.objects.bulk_create([
        Translation(field=targets[item.field.position], language_code=item.language_code,
                    translated_label=item.translated_label, guidance_text=item.guidance_text,
                    ai_generated=item.ai_generated, approved=item.approved)
        for item in Translation.objects.filter(field__practice_form=original).select_related("field")
        if item.field.position in targets
    ])
    ChecklistItem.objects.bulk_create([
        ChecklistItem(practice_form=revision, position=item.position, description=item.description,
                      fictional_example=item.fictional_example)
        for item in original.checklist_items.all()
    ])
