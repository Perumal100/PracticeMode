# PracticeMode

PracticeMode is a safe, web-based place for people to practise completing online forms without entering information on external websites. Form definitions are imported from supported sources, reviewed by a human Form Reviewer, and published only after approval.

> The product and Sprint 2 implementation are PracticeMode, as defined in the accepted Sprint 1 and Sprint 2 design documents.

## dev-rohan backend scope

This branch implements staff and learner authentication, learner catalog search with keyword and category filters, and learner-owned attempt creation, retrieval, autosave, and completion. It reuses Perumal's initial form migration unchanged from `1f88ea4`, and `reviewer/models.py` plus `reviewer/migrations/0002_practiceform_categories_failure_reason.py` byte for byte from Atheer's `Dev-Atheer` branch (`30eb43b`) so those files merge cleanly. Reviewer workflow routes are intentionally unregistered; no import, approval, or form-management behavior is implemented here. The original README is reused from that branch and updated for this implementation.

Learners sign in with a display name only. Every learner sign-in creates a new Django user in the `LEARNER` group with the display name as `first_name`, no email, an unusable password, and a generated `learner-<code>` username that is never returned. `AUTH_USER_MODEL` remains Django's default, as on every other branch.

## Local development

Python 3.11 is supported by the current environment. The backend uses Django/DRF, bcrypt, and psycopg from `requirements.txt`. PostgreSQL is the deployment target; SQLite supports local development and isolated tests.

From the repository root on macOS:

```zsh
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

The commands below use disposable SQLite databases and leave the repository's `db.sqlite3` untouched.

Run an empty local server with existing migrations applied only to a temporary database. Stop it with Ctrl-C; the temporary database is then removed. No forms or user accounts are seeded:

```zsh
.venv/bin/python - <<'PY'
import os
from pathlib import Path
from tempfile import TemporaryDirectory

os.environ.pop("DATABASE_URL", None)
os.environ.update(DJANGO_SETTINGS_MODULE="practicemode.settings", DJANGO_DEBUG="true", DJANGO_FORCE_HTTPS="false")
from django.conf import settings

with TemporaryDirectory(prefix="practicemode-dev-") as folder:
    settings.DATABASES["default"] = {"ENGINE": "django.db.backends.sqlite3", "NAME": str(Path(folder) / "dev.sqlite3")}
    import django
    django.setup()
    from django.core.management import call_command
    from django.db import connections
    try:
        call_command("migrate", interactive=False)
        call_command("runserver", "127.0.0.1:8000", use_reloader=False)
    finally:
        connections.close_all()
PY
```

Normal persistent development uses `.venv/bin/python manage.py migrate` followed by `.venv/bin/python manage.py runserver`. Use `DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DEDICATED_DB` for a dedicated PostgreSQL database. Provision the database separately. Hosted settings require a private `DJANGO_SECRET_KEY`, appropriate `DJANGO_ALLOWED_HOSTS`, `DJANGO_DEBUG=false`, `DJANGO_FORCE_HTTPS=true`, and HTTPS. Session cookies are HttpOnly; session and CSRF cookies are Secure outside debug mode.

## Database-backed tests

This command applies the real migrations to a disposable test database, runs all backend suites, checks migration drift, and removes the temporary databases:

```zsh
.venv/bin/python - <<'PY'
import os
from pathlib import Path
from tempfile import TemporaryDirectory

os.environ.pop("DATABASE_URL", None)
os.environ.update(DJANGO_SETTINGS_MODULE="practicemode.settings", DJANGO_DEBUG="true", DJANGO_FORCE_HTTPS="false")
from django.conf import settings

with TemporaryDirectory(prefix="practicemode-tests-") as folder:
    settings.DATABASES["default"] = {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": str(Path(folder) / "baseline.sqlite3"),
        "TEST": {"NAME": str(Path(folder) / "test.sqlite3")},
    }
    import django
    django.setup()
    from django.core.management import call_command
    from django.db import connections
    try:
        call_command("check")
        call_command("makemigrations", check=True, dry_run=True)
        call_command("test", "accounts", "catalog", "attempts", interactive=False)
    finally:
        connections.close_all()
PY
```

Coverage includes real staff sessions and CSRF, learner-role catalog/attempt authorization, duplicate-display-name isolation, persisted drafts, rollback after database errors, completion with validation errors, immutable completed attempts, and retries without duplicate progress updates. Injected failures occur around real ORM writes so rollback is checked against persisted state. PostgreSQL concurrency behavior still needs verification against a dedicated PostgreSQL test database; SQLite does not implement `SELECT FOR UPDATE` row locks.

## Implemented endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/session` | Public CSRF initialization and current user, or `{"user": null}` |
| `POST` | `/api/login` | Staff username/password login, or learner display-name login |
| `POST` | `/api/logout` | Authenticated, CSRF-protected logout; `204` |
| `GET` | `/api/forms?keyword=...&category=...` | Learner-only approved forms, newest first with ID tie-breaker |
| `GET` | `/api/forms/{formId}` | Learner-only approved form and position-ordered fields |
| `POST` | `/api/attempts` | Learner-only creation; `201` with the new attempt |
| `GET` | `/api/attempts/{attemptId}` | Owner-only attempt and saved answers |
| `PATCH` | `/api/attempts/{attemptId}/answers/{fieldId}` | Owner-only draft save; `200` only after persistence |
| `POST` | `/api/attempts/{attemptId}/completion` | Owner-only completion with stored feedback |

Paths have no trailing slash. Unsafe requests require the session cookies and `X-CSRFToken` header, including anonymous login. Initialize cookies with `GET /api/session`; login rotates CSRF, so reread the cookie afterward. Staff login accepts `{"username":"...","password":"...","role":"INSTRUCTOR"}` (role is optional). It returns `{"user":{"id":"...","displayName":"...","role":"INSTRUCTOR"}}`; exactly one recognized role group is required. Learner login accepts `{"role":"LEARNER","displayName":"Alex"}` and returns the same shape with role `LEARNER`; a storage failure returns `503 LEARNER_IDENTITY_UNAVAILABLE` without a session. A public signed-out session response is `200`, while protected endpoints return `401`. Wrong role/ownership returns `403` without protected data. Reviewers cannot read learner answers.

Catalog list is a plain array of `{id, title, status, categories}`; detail adds `fields: [{id, position, label, input_type, required, validation}]`. Empty results are `[]`. `category` may be repeated up to 10 times (`?category=Housing&category=Education`); a form matches when it has any selected category, ignoring case, and keyword and category filters combine. Blank/repeated/oversized keyword values, blank or oversized categories, and unknown filters return `400`. Missing forms return `404`; unapproved details return `403 FORM_NOT_APPROVED`. Reviewer/source metadata and unavailable guidance/options are omitted.

Attempt creation accepts `{"formId":"<uuid>"}`. Optional `displayName` is accepted for the documented input contract but never selects, creates, or updates an identity; the authenticated session supplies ownership. Creation requires an approved form and creates exactly one progress record in the same transaction.

Creation and retrieval return:

```json
{
  "id": "<attempt-uuid>",
  "formId": "<form-uuid>",
  "status": "IN_PROGRESS",
  "startedAt": "2026-11-02T12:00:00Z",
  "lastSavedAt": null,
  "completedAt": null,
  "validationFeedback": [],
  "answers": []
}
```

Answer PATCH accepts `{"value": ...}` and returns `{fieldId, value, savedAt}`. Retrieval includes those same answer objects, ordered by field position. Null clears an answer; incomplete and rule-invalid drafts may be saved. Incompatible JSON representations return `400 INVALID_VALUE`. A foreign-form field returns `400 FIELD_FORM_MISMATCH`; missing attempts/fields return `404`. A failed save returns `503 SAVE_FAILED` and preserves the prior answer and timestamp. Clients should wait for queued saves to succeed before requesting completion, which evaluates only persisted answers.

Completion accepts no body. Policy A follows DD-05/API-16: the first successful completion returns `200` with `{status: "COMPLETED", completedAt, validationFeedback: [{fieldId, ruleType, errorMessage}]}`, even when validation errors exist. Empty feedback means no supported-rule errors were found. Status, feedback, completion time, and the progress error count are persisted atomically. A repeated completion returns `409` with the identical stored result and no duplicate updates. Subsequent answer changes return `409 ATTEMPT_COMPLETED`.

## Supported validation and explicit limitations

The implementation reads the existing `FormField.required`, `input_type`, and `validation` JSON. It does not create a separate validation-rule or options model.

- Text/email/tel/textarea/select accept string drafts; dates accept strings; number drafts accept strings or finite JSON numbers; checkboxes accept booleans. Null is allowed for an unanswered draft. Email, ISO date, and finite-number formats are checked at completion.
- Required fields use the stored flag; unchecked required checkboxes generate feedback. An optional stored `required` rule must agree with the flag.
- `minLength`/`maxLength`: nonnegative integer bounds for text/email/tel/textarea/select.
- `min`/`max`: finite numeric bounds for number fields.
- `allowedValues`: an explicit nonempty, unique string list for select fields. No options are inferred. A select with no stored `allowedValues` is unsupported for starting an attempt.
- Unknown rule keys, invalid parameters/ranges, unsupported field types (including file/radio), and missing select choices return `422 UNSUPPORTED_FORM_SCHEMA` with field/rule details. This check runs on creation, on the saved field during autosave, and across the form at completion. Unsupported rules are not silently treated as successful validation. Regex `pattern` rules are currently unsupported.

There is no file upload, guidance/translation/checklist model, assistance workflow, instructor progress dashboard, or hint-opening tracking in this branch. The approved-form list can supply the learner dashboard's available-forms section. Reviewer dashboard APIs remain Perumal's integration dependency. Progress hint counts start at zero and are not fabricated.

## Proposed shared models and migration agreement

`attempts.0001_initial` depends on `reviewer.0001_initial` and the swappable user model. It does not touch Atheer's `reviewer.0002`, so the two migrate in either order.

- `Attempt`: UUID ID, protected learner FK (`settings.AUTH_USER_MODEL`, related name `practice_attempts`), protected form FK (`reviewer.PracticeForm`, related name `attempts`), `IN_PROGRESS`/`COMPLETED` status, start/save/completion timestamps, JSON feedback list. Database checks enforce valid status, completion timestamp consistency, and save/completion times not preceding start.
- `Answer`: UUID ID, attempt FK (`CASCADE`, related name `answers`), protected field FK (`reviewer.FormField`, related name `practice_answers`), nullable JSON value, update timestamp; unique `(attempt, field)`.
- `ProgressCounter`: UUID ID, one-to-one attempt FK (`CASCADE`, related name `progress`), nonnegative validation-error/hint-view counters, update timestamp. Services create the row with its attempt; the uniqueness constraint prevents duplicates. Completion stores the feedback count rather than incrementing it on retries.

Role/ownership, field-to-form consistency, and completed-attempt immutability are enforced by API permissions and transactional services, not by cross-table SQL checks. Other modules must preserve these invariants when writing directly. Form definitions/fields must not be structurally changed underneath existing attempts; publish a new form record for such changes. Form-status changes block new attempts but do not remove an existing owner's saved work.

Runtime model access and swappable foreign keys do not make changing `AUTH_USER_MODEL` after migrations automatic. Coordinate any user-model replacement before applying this schema to a shared or existing database.
