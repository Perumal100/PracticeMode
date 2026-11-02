# PracticeMode

PracticeMode is a safe, web-based place for people to practise completing online forms without entering information on external websites. Form definitions are imported from supported sources, reviewed by a human Form Reviewer, and published only after approval.

> The product and Sprint 2 implementation are PracticeMode, as defined in the accepted Sprint 1 and Sprint 2 design documents.

## Reviewer workflow implemented in Sprint 2

```text
Supported schema import
        -> AWAITING_REVIEW notification
        -> reviewer inspects source and extracted fields
        -> APPROVED (available to learners) or REJECTED (with reason)
```

The reviewer API is server-side protected. A signed-out caller receives `401`; an authenticated caller without the `FORM_REVIEWER` group receives `403`; a form can be decided only once. See [the reviewer workflow notes](docs/sprint-02-reviewer-workflow.md) and [the Product Backlog](docs/product-backlog.md).

## Local development

The current implementation is Django and Django REST Framework. PostgreSQL is the production target; SQLite is used by default for an easy local start.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python manage.py migrate
.\.venv\Scripts\python manage.py test reviewer
.\.venv\Scripts\python manage.py runserver
```

Use `DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME` to use PostgreSQL. Set `DJANGO_FORCE_HTTPS=true` and `DJANGO_DEBUG=false` in a hosted environment.

## Implemented endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/review/forms` | Pending review queue, or a specific valid `status` query value |
| `GET` | `/api/review/forms/{formId}` | Extracted fields, validation metadata, and source reference |
| `POST` | `/api/review/forms/{formId}/decision` | Approve or reject an awaiting form |
| `GET` | `/api/review/notifications` | Notifications for forms awaiting review |
| `POST` | `/api/forms/extractions` | Import a supported schema for reviewer verification |

The import endpoint accepts schema metadata only. Learner answer values are rejected and are never forwarded to a source site.
