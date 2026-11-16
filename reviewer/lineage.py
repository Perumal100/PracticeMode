"""A form and its revisions: which versions were published, and what changed between them."""
from .models import FormStatus, PracticeForm, ReviewDecision


def root_of(form):
    while form.revision_of_id:
        form = form.revision_of
    return form


def lineage(form):
    """Every form in this form's family: the original and every revision of it, at any depth."""
    family, frontier = [], [root_of(form)]
    while frontier:
        current = frontier.pop()
        family.append(current)
        frontier.extend(current.revisions.all())
    return family


def published_versions(form):
    """The versions learners could practise, oldest first. A version is published once a reviewer approved it."""
    family = lineage(form)
    approved = {
        decision.practice_form_id: decision.decided_at
        for decision in ReviewDecision.objects.filter(practice_form__in=family, outcome=ReviewDecision.Outcome.APPROVED)
    }
    # A form approved outside the review flow (the admin site, seed data) has no decision row.
    for member in family:
        if member.status in (FormStatus.APPROVED, FormStatus.SUPERSEDED):
            approved.setdefault(member.pk, member.created_at)
    versions, current = [], root_of(form)
    while current is not None:
        if current.pk in approved:
            versions.append((current, approved[current.pk]))
        current = next((child for child in current.revisions.all() if child.pk in approved), None)
    return versions


def version_number(form):
    for number, (version, _) in enumerate(published_versions(form), start=1):
        if version.pk == form.pk:
            return number
    return None


def _describe(old, new):
    details = []
    if old.input_type != new.input_type:
        details.append(f"answer type changed from {old.get_input_type_display().lower()} to {new.get_input_type_display().lower()}")
    if old.required != new.required:
        details.append("now required" if new.required else "no longer required")
    old_choices, new_choices = old.validation.get("allowedValues"), new.validation.get("allowedValues")
    if old_choices != new_choices:
        details.append("choices changed")
    if {k: v for k, v in old.validation.items() if k != "allowedValues"} != {k: v for k, v in new.validation.items() if k != "allowedValues"}:
        details.append("limits changed")
    return details


def changes_between(old_form, new_form):
    """Questions added, removed and changed, matched by label."""
    old = {field.label.strip().casefold(): field for field in old_form.fields.all()}
    new = {field.label.strip().casefold(): field for field in new_form.fields.all()}
    return {
        "added": [field.label for key, field in new.items() if key not in old],
        "removed": [field.label for key, field in old.items() if key not in new],
        "changed": [
            {"label": field.label, "details": details}
            for key, field in new.items() if key in old and (details := _describe(old[key], field))
        ],
    }


def version_history(form):
    """Newest first, each with what changed since the version before it."""
    versions = published_versions(form)
    rows = []
    for index, (version, published_at) in enumerate(versions):
        rows.append({
            "id": str(version.pk),
            "version": index + 1,
            "title": version.title,
            "status": version.status,
            "publishedAt": published_at,
            "fieldCount": version.fields.count(),
            "current": version.status == FormStatus.APPROVED,
            "changes": changes_between(versions[index - 1][0], version) if index else None,
        })
    return list(reversed(rows))


def remove_family(form):
    """Delete a form and its revisions, or withdraw them all when learners have practised any of them.

    Withdrawn forms leave the catalog and the review queue, take no new answers,
    and keep every learner's attempts and results. Returns "DELETED" or "WITHDRAWN".
    """
    family = lineage(form)
    if any(member.attempts.exists() for member in family):
        PracticeForm.objects.filter(pk__in=[member.pk for member in family]).update(status=FormStatus.WITHDRAWN)
        return "WITHDRAWN"
    # Revisions point at the form they revise, so delete the newest first.
    for member in reversed(family):
        ReviewDecision.objects.filter(practice_form=member).delete()
        member.fields.all().delete()
        member.delete()
    return "DELETED"
