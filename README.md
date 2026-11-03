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

## Sprint 3: Form metadata and editing

- Added `categories` and `failure_reason` to `PracticeForm`, with a database migration.
- Model validation rejects blank or duplicate category labels and requires a reason for `FAILED` forms when `full_clean()` is called.
- Schema imports accept optional categories, trim surrounding whitespace, and reject blank or duplicate labels.
- Review queue and detail responses include categories and failure reasons.
- Reviewers can edit a pending form's title and categories using `PATCH /api/review/forms/{formId}`.

### Editing rules

Only forms with status `AWAITING_REVIEW` can be edited through this endpoint.
Edits to `APPROVED`, `REJECTED`, or `FAILED` forms return `409 Conflict`.

The endpoint accepts only `title` and `categories`; omitted values remain unchanged.
Empty requests, invalid values, and attempts to edit other fields return `400`.
Missing forms return `404`. Reviewer authentication and permissions are required.

Example PATCH request body:

```json
{
  "title": "Updated practice form",
  "categories": ["Housing"]
}
```

### Fictional demo data

After installing dependencies and applying migrations, run:

```bash
python manage.py seed_demo
```

This creates two fictional forms with fields and review notifications.
Both start in `AWAITING_REVIEW`. Their source URLs are placeholders, and
`source_available` is false.

Running the command again skips existing demo forms without changing them.
No learner answers or user accounts are created.

### Codespaces / Linux setup

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py test reviewer
```

The reviewer test suite currently contains 22 passing tests, including model
validation, category API behavior, partial edits, permissions, and edit-state protection.

### Implementation notes

SQLite is used for local development; PostgreSQL remains the production target.
Source availability currently uses a boolean rather than the three-state value
described in Sprint 2. Categories are stored as a JSON list.

Metadata editing currently supports title and categories only. Changes to
extracted fields, source information, and lifecycle status are outside this endpoint.
