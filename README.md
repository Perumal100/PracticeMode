# PracticeMode

PracticeMode is a safe, web-based place for people to practise completing online forms without entering information on external websites. Form definitions are imported from supported sources, reviewed by a human Form Reviewer, and published only after approval.

> The product and Sprint 2 implementation are PracticeMode, as defined in the accepted Sprint 1 and Sprint 2 design documents.

## Run the full system (Sprint 3)

You need Python 3.11+, Node.js 20+, and Chrome. [The integration guide](docs/sprint-03-integration.md) records how the Sprint 3 branches were combined.

**1. Backend** (Django on http://localhost:8000):

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo      # two fictional forms awaiting review
.venv/bin/python manage.py shell -c "
from django.contrib.auth.models import Group, User
for name, role in [('reviewer', 'FORM_REVIEWER'), ('instructor', 'INSTRUCTOR')]:
    user, _ = User.objects.get_or_create(username=name, defaults={'first_name': name.title()})
    user.set_password('change-me-123')
    user.is_staff = True
    user.save()
    user.groups.set([Group.objects.get_or_create(name=role)[0]])
"
cp .env.example .env                      # optional: local settings, see Configuration
.venv/bin/python manage.py runserver
```

Demo accounts: `reviewer` / `change-me-123` (Form Reviewer) and `instructor` / `change-me-123`. Learners need no account; they type a display name. Each staff account needs exactly one role group. On Windows, use `.venv\Scripts\python` and `copy .env.example .env`.

**2. Web app** (http://localhost:5173, proxies `/api` to the backend):

```bash
cd frontend && npm install && npm run dev
```

**3. Browser extension** (optional; it imports new forms):

1. Open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and choose `Form_Scrapper_Extension`.
2. Put its ID in `.env` as `DJANGO_CSRF_TRUSTED_ORIGINS=chrome-extension://<id>` and restart the server.
3. Run the bundled test forms with `cd Form_Scrapper_Extension && npm install && npm run fixtures`. They are at http://localhost:4317.
4. Sign in to the web app as `reviewer` in the same Chrome profile, open a test form, and use **Send to PracticeMode for review**.

**4. Tests**

```bash
.venv/bin/python manage.py test
(cd frontend && npm test)
(cd Form_Scrapper_Extension && npx playwright install chromium && npm test)
```

### Demo script

1. **US-25:** the extension extracts `test01_three_step_form.html` and sends it. A file-upload form shows which fields were left out.
2. **US-04, US-16, US-10:** the reviewer signs in, sees the notification and queue, and opens the form. They check the source link, field types, required flags and rules, then add categories.
3. **US-17:** the reviewer approves one form and rejects a demo form with a reason. Rejecting without a reason is refused.
4. **US-01:** in a private window, a learner signs in with only a display name. Opening `#/review` sends them back to their catalog.
5. **US-02:** the learner searches by keyword and categories, and a search with no matches shows a message.
6. **US-11, US-08:** the learner starts the form and types answers ("Saved ✓"). They reload the page and the answers come back.
7. **US-26:** the learner submits with a bad email and a missing required answer. The feedback appears under those fields, and the answers lock.

## Project layout

| Path | What it holds | Stories |
| --- | --- | --- |
| `accounts/` | Staff and learner sign-in, sessions, role checks | US-01 |
| `catalog/` | Learner search of approved forms | US-02 |
| `attempts/` | Practice attempts, autosaved answers, completion feedback, progress counters | US-08, US-11, US-26 |
| `reviewer/` | Form import, review queue, notifications, decisions, metadata edits, `seed_demo` | US-04, US-10, US-16, US-17, US-25 |
| `frontend/` | React web app ([frontend/README.md](frontend/README.md)) | all screens |
| `Form_Scrapper_Extension/` | Chrome extension that extracts forms and sends them for review ([its README](Form_Scrapper_Extension/README.md)) | US-25 |
| `docs/` | Backlog, requirements, sprint notes, [integration guide](docs/sprint-03-integration.md) | |

Roles are Django groups on the default user model: `LEARNER`, `INSTRUCTOR` and `FORM_REVIEWER`. Each account needs exactly one. Every permission is checked on the server.

## API reference

All paths are under `/api` and have no trailing slash. A signed-out caller gets `401`. A caller with the wrong role or ownership gets `403` with no protected data in the body.

### Sign-in (US-01)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/session` | Sets the CSRF cookie; returns the current user or `{"user": null}` |
| `POST` | `/api/login` | Staff username and password, or learner display name |
| `POST` | `/api/logout` | Ends the session; `204` |

Paths have no trailing slash. Unsafe requests require the session cookies and `X-CSRFToken` header, including anonymous login. Initialize cookies with `GET /api/session`; login rotates CSRF, so reread the cookie afterward. Staff login accepts `{"username":"...","password":"...","role":"INSTRUCTOR"}` (role is optional). It returns `{"user":{"id":"...","displayName":"...","role":"INSTRUCTOR"}}`; exactly one recognized role group is required. Learner login accepts `{"role":"LEARNER","displayName":"Alex"}` and returns the same shape with role `LEARNER`; a storage failure returns `503 LEARNER_IDENTITY_UNAVAILABLE` without a session. A public signed-out session response is `200`, while protected endpoints return `401`. Wrong role/ownership returns `403` without protected data. Reviewers cannot read learner answers.

### Learner catalog (US-02)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/forms?keyword=...&category=...` | Approved forms, newest first |
| `GET` | `/api/forms/{formId}` | An approved form and its fields in position order |

Catalog list is a plain array of `{id, title, status, categories}`; detail adds `fields: [{id, position, label, input_type, required, validation}]`. Empty results are `[]`. `category` may be repeated up to 10 times (`?category=Housing&category=Education`); a form matches when it has any selected category, ignoring case, and keyword and category filters combine. Blank/repeated/oversized keyword values, blank or oversized categories, and unknown filters return `400`. Missing forms return `404`; unapproved details return `403 FORM_NOT_APPROVED`. Reviewer/source metadata and unavailable guidance/options are omitted.

### Practice attempts (US-08, US-11, US-26)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/attempts` | Start an attempt on an approved form; `201` |
| `GET` | `/api/attempts/{attemptId}` | The owner's attempt with saved answers |
| `PATCH` | `/api/attempts/{attemptId}/answers/{fieldId}` | Save one answer; `200` only after it is stored |
| `POST` | `/api/attempts/{attemptId}/completion` | Complete and receive validation feedback |

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

### Form review and import (US-04, US-10, US-16, US-17, US-25)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/review/forms?status=` | Forms by status (default `AWAITING_REVIEW`) |
| `GET` | `/api/review/forms/{formId}` | Extracted fields, validation, source reference and decision |
| `PATCH` | `/api/review/forms/{formId}` | Edit a pending form's title or categories |
| `POST` | `/api/review/forms/{formId}/decision` | `{"decision": "APPROVE"}` or `{"decision": "REJECT", "rejection_reason": "..."}` |
| `GET` | `/api/review/notifications` | Notifications for forms awaiting review |
| `POST` | `/api/forms/extractions` | Import an extracted form for review (used by the browser extension) |

```text
Supported schema import
        -> AWAITING_REVIEW notification
        -> reviewer inspects source and extracted fields
        -> APPROVED (available to learners) or REJECTED (with reason)
```

Only Form Reviewers can call these. A form can be decided only once; a repeat returns `409`, and rejecting without a reason returns `400`.

The import endpoint accepts structure only: `{title, source_url, source_available, categories?, fields: [{position, label, input_type, required, validation}]}`. Payloads that carry learner answers are rejected. Each field's `validation` may hold only the rules the attempt module can check, listed below; anything else returns `400`. A second import of a source that is still awaiting review returns `409 DUPLICATE_PENDING_IMPORT`.

#### Editing a pending form (`PATCH /api/review/forms/{formId}`)

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

## Validation rules and limitations

The implementation reads the existing `FormField.required`, `input_type`, and `validation` JSON. It does not create a separate validation-rule or options model.

- Text/email/tel/textarea/select accept string drafts; dates accept strings; number drafts accept strings or finite JSON numbers; checkboxes accept booleans. Null is allowed for an unanswered draft. Email, ISO date, and finite-number formats are checked at completion.
- Required fields use the stored flag; unchecked required checkboxes generate feedback. An optional stored `required` rule must agree with the flag.
- `minLength`/`maxLength`: nonnegative integer bounds for text/email/tel/textarea/select.
- `min`/`max`: finite numeric bounds for number fields.
- `allowedValues`: an explicit nonempty, unique string list for select fields. No options are inferred. A select with no stored `allowedValues` is unsupported for starting an attempt.
- Unknown rule keys, invalid parameters/ranges, unsupported field types (including file/radio), and missing select choices return `422 UNSUPPORTED_FORM_SCHEMA` with field/rule details. This check runs on creation, on the saved field during autosave, and across the form at completion. Unsupported rules are not silently treated as successful validation. Regex `pattern` rules are currently unsupported.

SQLite is used for local development; PostgreSQL remains the production target.
Source availability currently uses a boolean rather than the three-state value
described in Sprint 2. Categories are stored as a JSON list.

Metadata editing currently supports title and categories only. Changes to
extracted fields, source information, and lifecycle status are outside this endpoint.

Not built yet (product backlog): assistance requests and instructor progress (US-03, US-05, US-22), hints, translations and checklists (US-09, US-12, US-18), and file uploads.

## Data model

`reviewer` owns the form tables: `PracticeForm` (with `categories` and `failure_reason`, migration `0002`), `FormField`, `ReviewDecision` and `ReviewNotification`. `attempts` owns the learner tables below. `attempts.0001_initial` depends only on `reviewer.0001_initial` and the user model.

- `Attempt`: UUID ID, protected learner FK (`settings.AUTH_USER_MODEL`, related name `practice_attempts`), protected form FK (`reviewer.PracticeForm`, related name `attempts`), `IN_PROGRESS`/`COMPLETED` status, start/save/completion timestamps, JSON feedback list. Database checks enforce valid status, completion timestamp consistency, and save/completion times not preceding start.
- `Answer`: UUID ID, attempt FK (`CASCADE`, related name `answers`), protected field FK (`reviewer.FormField`, related name `practice_answers`), nullable JSON value, update timestamp; unique `(attempt, field)`.
- `ProgressCounter`: UUID ID, one-to-one attempt FK (`CASCADE`, related name `progress`), nonnegative validation-error/hint-view counters, update timestamp. Services create the row with its attempt; the uniqueness constraint prevents duplicates. Completion stores the feedback count rather than incrementing it on retries.

Role/ownership, field-to-form consistency, and completed-attempt immutability are enforced by API permissions and transactional services, not by cross-table SQL checks. Other modules must preserve these invariants when writing directly. Form definitions/fields must not be structurally changed underneath existing attempts; publish a new form record for such changes. Form-status changes block new attempts but do not remove an existing owner's saved work.

Runtime model access and swappable foreign keys do not make changing `AUTH_USER_MODEL` after migrations automatic. Coordinate any user-model replacement before applying this schema to a shared or existing database.

## Demo data

After installing dependencies and applying migrations, run:

```bash
python manage.py seed_demo
```

This creates two fictional forms with fields and review notifications.
Both start in `AWAITING_REVIEW`. Their source URLs are placeholders, and
`source_available` is false.

Running the command again skips existing demo forms without changing them.
No learner answers or user accounts are created.

## Configuration

Every setting is optional for local use. Put local values in a `.env` file at the project root, starting from `cp .env.example .env`. The backend reads it on start-up (`practicemode/env.py`). `.env` is git-ignored, so each person keeps their own. Variables already set in the shell or by a host override the file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | unset (SQLite `db.sqlite3`) | `postgresql://USER:PASSWORD@HOST:5432/DBNAME` for PostgreSQL |
| `DJANGO_SECRET_KEY` | development key | Set a private value when hosting |
| `DJANGO_DEBUG` | `true` | `false` when hosting; cookies then become Secure |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma separated |
| `DJANGO_FORCE_HTTPS` | `false` | `true` redirects HTTP to HTTPS |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | empty | Add `chrome-extension://<extension-id>` so the extension can import forms |

Staff passwords are stored as bcrypt hashes, and session cookies are HttpOnly. SQLite runs in `IMMEDIATE` transaction mode so concurrent answer saves wait for each other instead of failing.

## Tests

```bash
.venv/bin/python manage.py test                 # backend: accounts, catalog, attempts, reviewer
(cd frontend && npm test)                       # web app (Vitest)
(cd Form_Scrapper_Extension && npm test)        # extension unit and end-to-end (Playwright)
```

Django builds a separate test database, so your `db.sqlite3` is untouched. The backend tests include real staff and learner sessions with CSRF, role and ownership checks on every protected route, rollback after database errors, immutable completed attempts, and retries that do not double-count progress. PostgreSQL row locking still needs a run against a dedicated PostgreSQL database.

See [the reviewer workflow notes](docs/sprint-02-reviewer-workflow.md) and [the product backlog](docs/product-backlog.md) for the review process and story status.
