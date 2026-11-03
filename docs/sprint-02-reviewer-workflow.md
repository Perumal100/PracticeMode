# Sprint 2 Form Reviewer Workflow

## Scope delivered by Perumal Marimuthu

This slice implements the Form Reviewer responsibilities from the accepted design: reviewer-only access, import of a supported schema, a queue and field/source preview, pending-review notifications, and approval or rejection. It covers US-04, US-10, US-16, US-17, and US-25.

## Lifecycle

```text
supported schema import -> AWAITING_REVIEW -> APPROVED
                                        \\-> REJECTED (reason required)
```

The decision endpoint locks the form record and accepts a decision only while its status is `AWAITING_REVIEW`. This prevents double approval, double rejection, and decision races. A repeated or stale request receives `409 Conflict`.

## API contract

| Endpoint | Allowed caller | Expected failures |
| --- | --- | --- |
| `GET /api/review/forms` | Form Reviewer | `401` signed out, `403` wrong role, `400` unknown status |
| `GET /api/review/forms/{formId}` | Form Reviewer | `401`, `403`, `404` unknown form |
| `POST /api/review/forms/{formId}/decision` | Form Reviewer | `400` invalid/reasonless decision, `401`, `403`, `404`, `409` stale decision |
| `GET /api/review/notifications` | Form Reviewer | `401`, `403` |
| `POST /api/forms/extractions` | Form Reviewer | `400` invalid schema or answer-bearing payload, `401`, `403` |

All successful imports create a form with the status `AWAITING_REVIEW` and a notification. The source is marked `source_available: false` when an importing component knows that it could not retrieve the source; this state is visible to the reviewer and is never treated as verification.

## Changes since Sprint 1

- The project uses the **Form Reviewer** persona rather than the removed Workshop Coordinator role.
- Practice forms are imported as supported field schemas and require human verification before publication.
- Reviewer work is now an explicit queue with notifications, source comparison, field-level metadata, and recorded decisions.
- Approval and rejection are server-side role-protected; rejection must preserve a reason and neither action can be repeated.
- The implementation follows the Sprint 2 architecture choice of Django/DRF and PostgreSQL instead of the repository's earlier FastAPI planning note.

## Test coverage

`reviewer/tests/test_review_api.py` checks signed-out and wrong-role access, queue/detail/notification visibility, valid approval and rejection, missing rejection reason, duplicate decisions, supported extraction, and invalid import payloads. Run it with:

```powershell
.\.venv\Scripts\python manage.py test reviewer
```
