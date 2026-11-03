"""Practice analytics for Form Reviewers: counts only.

Every figure is an aggregate. No learner name, ID, or answer value leaves
this module; the per-question view counts the stored feedback rule types,
never what a learner typed.
"""
from collections import Counter, defaultdict
from datetime import timedelta
from statistics import median

from django.db.models import Avg, Count, Max, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from reviewer.models import FormStatus, PracticeForm
from reviewer.permissions import IsFormReviewer

from .models import Attempt

RANGES = (7, 14, 30)
COMPLETED = Attempt.Status.COMPLETED


def _rate(part, whole):
    return round(part / whole, 4) if whole else None


def _form_counts(queryset):
    submitted = Q(attempts__status=COMPLETED)
    return queryset.annotate(
        learner_count=Count("attempts__learner", distinct=True),
        attempt_count=Count("attempts", distinct=True),
        submitted_count=Count("attempts", filter=submitted, distinct=True),
        clean_count=Count("attempts", filter=submitted & Q(attempts__progress__validation_error_count=0), distinct=True),
        average_issues=Avg("attempts__progress__validation_error_count", filter=submitted),
        last_practiced_at=Max("attempts__started_at"),
    )


def _form_summary(form):
    return {
        "id": str(form.pk),
        "title": form.title,
        "status": form.status,
        "categories": form.categories,
        "learners": form.learner_count,
        "attempts": form.attempt_count,
        "submitted": form.submitted_count,
        "cleanSubmissions": form.clean_count,
        "completionRate": _rate(form.submitted_count, form.attempt_count),
        "averageIssues": round(form.average_issues, 2) if form.average_issues is not None else None,
        "lastPracticedAt": form.last_practiced_at,
    }


def _daily(queryset, field, start):
    rows = (queryset.filter(**{f"{field}__date__gte": start})
            .annotate(day=TruncDate(field)).values("day").annotate(n=Count("id")))
    return {row["day"]: row["n"] for row in rows}


def overview(days):
    attempts = Attempt.objects.all()
    totals = attempts.aggregate(
        learners=Count("learner", distinct=True),
        attempts=Count("id"),
        submitted=Count("id", filter=Q(status=COMPLETED)),
        clean=Count("id", filter=Q(status=COMPLETED, progress__validation_error_count=0)),
    )
    forms = _form_counts(PracticeForm.objects.filter(Q(status=FormStatus.APPROVED) | Q(attempts__isnull=False)).distinct())
    form_rows = sorted((_form_summary(form) for form in forms), key=lambda row: (-row["learners"], -row["attempts"], row["title"].lower()))

    today = timezone.localdate()
    start = today - timedelta(days=days - 1)
    started = _daily(attempts, "started_at", start)
    submitted = _daily(attempts, "completed_at", start)
    series = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        series.append({"date": day.isoformat(), "started": started.get(day, 0), "submitted": submitted.get(day, 0)})

    return {
        "totals": {
            "publishedForms": PracticeForm.objects.filter(status=FormStatus.APPROVED).count(),
            "awaitingReview": PracticeForm.objects.filter(status=FormStatus.AWAITING_REVIEW).count(),
            "learners": totals["learners"],
            "attempts": totals["attempts"],
            "submitted": totals["submitted"],
            "cleanSubmissions": totals["clean"],
            "completionRate": _rate(totals["submitted"], totals["attempts"]),
        },
        "activity": {"days": days, "series": series},
        "forms": form_rows,
    }


def form_detail(form_id):
    try:
        form = _form_counts(PracticeForm.objects.filter(pk=form_id)).get()
    except PracticeForm.DoesNotExist:
        raise NotFound({"error": "FORM_NOT_FOUND", "message": "Practice form was not found."}) from None

    submissions = list(Attempt.objects.filter(practice_form=form, status=COMPLETED)
                       .values_list("started_at", "completed_at", "validation_feedback"))
    # One count per submission and rule: a field flagged twice in one attempt
    # is still one learner who struggled with it.
    flagged = defaultdict(set)
    rules = defaultdict(Counter)
    for index, (_, _, feedback) in enumerate(submissions):
        for item in feedback or []:
            field_id = str(item.get("fieldId"))
            flagged[field_id].add(index)
            rules[field_id][item.get("ruleType")] += 1

    fields = []
    for field in form.fields.order_by("position"):
        key = str(field.pk)
        fields.append({
            "id": key,
            "position": field.position,
            "label": field.label,
            "input_type": field.input_type,
            "required": field.required,
            "submissionsWithIssue": len(flagged[key]),
            "issueRate": _rate(len(flagged[key]), len(submissions)),
            "rules": dict(rules[key].most_common()),
        })

    minutes = [(done - began).total_seconds() / 60 for began, done, _ in submissions]
    return {
        **_form_summary(form),
        "medianMinutesToSubmit": round(median(minutes), 1) if minutes else None,
        "fields": fields,
    }


class AnalyticsOverviewView(APIView):
    permission_classes = [IsFormReviewer]

    def get(self, request):
        unknown = set(request.query_params) - {"days"}
        if unknown:
            raise ValidationError({"filters": f"Unknown filter: {', '.join(sorted(unknown))}."})
        try:
            days = int(request.query_params.get("days", 14))
        except ValueError:
            days = None
        if days not in RANGES:
            raise ValidationError({"days": f"Choose one of {', '.join(map(str, RANGES))} days."})
        return Response(overview(days))


class AnalyticsFormView(APIView):
    permission_classes = [IsFormReviewer]

    def get(self, request, form_id):
        return Response(form_detail(form_id))
