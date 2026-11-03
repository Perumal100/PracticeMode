# PracticeMode

**A safe place to practise filling in online forms before doing it for real.**

PracticeMode copies the structure of a real online form (a job application, a housing application, a benefits claim) into a practice version. A human **Form Reviewer** checks the copy against the original before publishing it. **Learners** then fill it in with made-up details, get their answers saved as they type, and receive feedback on mistakes. Nothing a learner types is ever sent to the real website.

CS-GY 6063 Software Engineering I · Section I2 · Group I2-4 · Fall 2026

| | |
| --- | --- |
| **Sprint 3 goal** | A Form Reviewer can import a real web form with the browser extension, verify and correct it, and publish it. A learner can then find that form, practise it with autosave, and get feedback on their answers. |
| **Status** | 10 of 16 MVP user stories implemented; the other 6 stay in the product backlog for Sprint 4. |
| **Stack** | Django 5.2 + Django REST Framework · React 18 + Vite + Tailwind CSS v4 (shadcn/ui components) · Chrome extension (Manifest V3) · SQLite locally, PostgreSQL for deployment |
| **Tests** | 135 backend · 78 frontend · 28 extension unit · 26 extension end-to-end (Playwright) |

## Contents

- [User stories: Sprint 3 status](#user-stories-sprint-3-status)
- [Features](#features)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Demo script](#demo-script)
- [Testing](#testing)
- [Departures from the Sprint 2 design](#departures-from-the-sprint-2-design)
- [Team](#team)
- [Reference: API, validation rules, data model, configuration](#reference)
- [More documentation](#more-documentation)

## User stories: Sprint 3 status

"Implemented" means the acceptance criteria pass in the automated tests and in the demo walkthrough on `main`. Under the course's definition of done, a story becomes **Done** once a teammate has reviewed it.

### Implemented (10 MVP stories)

| Story | What a user can do | Acceptance criteria covered | Key commits | Tests |
| --- | --- | --- | --- | --- |
| **US-01** Role-based access | Learners sign in with only a display name; reviewers and instructors sign in with a username and password and land in their own workspace. | AC-01 role workspace · AC-02 bad credentials refused (`401`, no data) · AC-03 a learner is refused reviewer routes (`403`) and redirected in the UI | `38fc4b4` `9359f7a` `5898d35` | `accounts/tests/test_authentication.py`, `SignIn.test.jsx`, `App.test.jsx` |
| **US-02** Search the catalog | Search approved forms by keyword and several categories at once. | AC-01 keyword · AC-02 multiple categories (any match) · AC-03 clear no-results message; unapproved forms never listed | `38fc4b4` `6ab1b63` `69ef97a` `5898d35` | `catalog/tests/test_forms.py`, `Catalog.test.jsx` |
| **US-04** Review queue | See imported forms by status and inspect every extracted field's label, type, required flag and rules. | AC-01 pending queue · AC-02 field preview · AC-03 non-reviewers get `401`/`403` with no form data | `a8c9348` `5898d35` `f29391b` | `reviewer/tests/test_review_api.py`, `Review.test.jsx` |
| **US-08** Autosave | Each answer saves as the learner types; "Saved ✓" appears only after the server confirms; reopening the form restores the answers. | AC-01 save on change · AC-02 resume · AC-03 a failed save says "Not saved" with Retry | `b5c677d` `7263f4f` `1ab6a6c` `38fc4b4` `0b9dd5b` | `attempts/tests/test_attempt_api.py`, `useAutosave.test.jsx`, `useResumeAttempt.test.jsx`, `PracticeForm.test.jsx` |
| **US-10** Compare with the source | Open the original page beside the copy; see when the source could not be reached; correct the title, source, and any field before deciding. | AC-01 source link · AC-02 field-by-field comparison and correction · AC-03 an unreachable source is flagged, not treated as verified | `a8c9348` `ae9edf8` `98b5c12` | `reviewer/tests/test_form_editing.py`, `ReviewEditing.test.jsx`, extension e2e (embedded form) |
| **US-11** Practise an approved form | Fill in a practice copy whose controls match the original's field types. | AC-01 fields rendered · AC-02 editing one answer leaves others unchanged · AC-03 an unapproved form cannot be started (`403`, explained) | `38fc4b4` `01dc41c` | `attempts/tests/test_attempt_api.py`, `PracticeForm.test.jsx` |
| **US-16** Review notifications | New imports appear in a "New imports" panel and open the form directly. | AC-01 notification on import · AC-02 opens the form · AC-03 hidden from other roles | `a8c9348` `01dc41c` | `reviewer/tests/test_review_api.py`, `Review.test.jsx` |
| **US-17** Approve or reject | Approve, or reject with a required reason; both ask for confirmation and record who decided and when. | AC-01 approval recorded and published · AC-02 rejection needs a reason and blocks practice · AC-03 non-reviewers refused, status unchanged; a second decision returns `409` | `a8c9348` `5898d35` | `reviewer/tests/test_review_api.py`, `Review.test.jsx` |
| **US-25** Import with the extension | Capture a multi-step form with the browser extension and send it for review in one click. | AC-01 creates a pending form with fields and source · AC-02 unsupported fields and rules are reported, never published silently · AC-03 non-reviewers refused | `4841c79` `2aa2e0b` `3970e71` `fa00694` `ae9edf8` | `reviewer/tests/test_extension_import.py`, `Form_Scrapper_Extension/tests/` |
| **US-26** Submit and get feedback | Submit an attempt and see which answers break the form's rules, next to those fields. | AC-01 outcome recorded · AC-02 per-field feedback · AC-03 a completed attempt is locked; a repeat returns the stored result | `38fc4b4` `01dc41c` | `attempts/tests/test_validation.py`, `test_attempt_api.py`, `PracticeForm.test.jsx` |

### Product backlog (not in Sprint 3)

| Priority | Stories | Why they wait |
| --- | --- | --- |
| MVP, Sprint 4 | **US-03** request instructor help · **US-05** instructor views requests · **US-22** instructor progress filters | Need the assistance-request model and instructor screens. Instructors can already sign in and see a placeholder. `ProgressCounter` rows are already recorded per attempt. |
| MVP, Sprint 4 | **US-09** translated guidance · **US-12** field hints · **US-18** preparation checklist | Need hint, translation and checklist models plus content. |
| Stretch | US-15 request status · US-19 compare attempts · US-21 favourites · US-24 issue reports | `failure_reason` is already stored for US-15. |
| Out of scope | US-06, US-07, US-13, US-14, US-20, US-23 | Agreed in Sprint 1. |

Full list with priorities: [docs/product-backlog.md](docs/product-backlog.md).

## Features

### For learners
- **Sign in with a name only:** no email, no password, no personal details.
- **Practice catalog:** totals for available, in-progress and submitted forms; keyword search; category filter pills; cards that offer Practise, Continue or View result.
- **Practice workspace:**
  - numbered questions with the right control for each (text, email, phone, number, date, choice list, checkbox, long text)
  - required markers, and progress on required questions
  - autosave with a status under each answer, and an overall "All changes saved" indicator
  - resume after a reload
- **Submission and feedback:** asks before submitting with required questions unanswered. Answers are checked against their field's type (email, phone, link, date, number, choice) and limits. Afterwards, a summary links each problem to its field, and the answers lock.

### For Form Reviewers
- **Dashboard:** counts of forms awaiting review, approved and rejected; a "New imports" panel; the queue with status tabs.
- **Form inspection:**
  - source link, with a warning when the source was unreachable
  - each field's label, answer type, required flag and rules
  - long choice lists collapse to a summary, with a filterable "Show all"
- **Corrections before deciding:** edit the title and source page; add, edit, reorder and remove fields; set categories. Every change is re-checked with the import rules.
- **Decision:** approve, or reject with a reason, after a confirmation. Decisions are recorded and cannot be repeated.

### Browser extension (form extractor)
- Walks multi-step forms with fictional sample data and **never submits**. It stops before final "Submit", "Pay" or "Create account" buttons.
- Captures labels, types, required flags, options (including custom and lazy dropdowns), validation, and conditional questions. It also handles iframes and shadow DOM.
- Safety model: automatic on test pages; on real sites only with permission, or in **assisted mode**, where the user navigates and the extension only records.
- **Send to PracticeMode for review** maps the capture to the import API. It reports any field it can't import (file uploads, passwords) and records the page in the address bar as the source (for example a Datadog careers page, not the Greenhouse iframe inside it).

### Across the system
- **Server-side permissions:** every route checks role and ownership. Signed out gets `401`; wrong role or owner gets `403` with no protected data.
- **Security:** staff passwords are stored as bcrypt hashes; session cookies are HttpOnly (and Secure when not in debug); every write needs a CSRF token; extension requests are accepted only from trusted origins.
- **Privacy:** learners store a display name only. Imports carry structure only, and a payload containing answers is rejected. Practice answers never leave PracticeMode.

## Architecture

```
 Chrome extension ──(import, API-15)──┐
                                      ▼
 React web app ──(/api via Vite proxy)──► Django + DRF ──► SQLite / PostgreSQL
  learner · reviewer · instructor        accounts · catalog · attempts · reviewer
```

| Path | What it holds | Stories |
| --- | --- | --- |
| `accounts/` | Staff and learner sign-in, sessions, role checks | US-01 |
| `catalog/` | Learner search of approved forms | US-02 |
| `attempts/` | Practice attempts, autosaved answers, completion feedback, progress counters | US-08, US-11, US-26 |
| `reviewer/` | Import endpoint, review queue, notifications, decisions, corrections, `seed_demo` | US-04, US-10, US-16, US-17, US-25 |
| `practicemode/` | Django settings, URL routing, `.env` loader | |
| `frontend/` | React web app ([frontend/README.md](frontend/README.md)) | all screens |
| `Form_Scrapper_Extension/` | Chrome extension ([its README](Form_Scrapper_Extension/README.md)) | US-25 |
| `docs/` | Backlog, requirements, sprint notes, [integration guide](docs/sprint-03-integration.md) | |

Roles are Django groups on the default user model: `LEARNER`, `INSTRUCTOR` and `FORM_REVIEWER`. Each account needs exactly one.

## Getting started

You need **Python 3.11+**, **Node.js 20+** and **Chrome**. The commands are for macOS and Linux. On Windows, use `.venv\Scripts\python` and `copy` instead of `cp`.

### 1. Backend (http://localhost:8000)

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env                       # optional local settings, see Configuration
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo       # two fictional forms awaiting review
.venv/bin/python manage.py shell -c "
from django.contrib.auth.models import Group, User
for name, role in [('reviewer', 'FORM_REVIEWER'), ('instructor', 'INSTRUCTOR')]:
    user, _ = User.objects.get_or_create(username=name, defaults={'first_name': name.title()})
    user.set_password('change-me-123')
    user.is_staff = True
    user.save()
    user.groups.set([Group.objects.get_or_create(name=role)[0]])
"
.venv/bin/python manage.py runserver
```

### 2. Web app (http://localhost:5173)

```bash
cd frontend
npm install
npm run dev
```

### 3. Browser extension (optional; needed to import new forms)

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose `Form_Scrapper_Extension`.
2. Copy the extension's ID into `.env` as `DJANGO_CSRF_TRUSTED_ORIGINS=chrome-extension://<id>`, then restart the backend.
3. Optional sample forms: `cd Form_Scrapper_Extension && npm install && npm run fixtures`, then open http://localhost:4317.

### Demo accounts

| Role | How to sign in | Lands on |
| --- | --- | --- |
| Learner | **I am practising**, then any display name | Practice forms |
| Form Reviewer | **Staff sign-in**: `reviewer` / `change-me-123` | Form review dashboard (also `/admin/`) |
| Instructor | **Staff sign-in**: `instructor` / `change-me-123` | Instructor placeholder (Sprint 4) |

Change a password with `.venv/bin/python manage.py changepassword reviewer`. Use a private window for the learner so the two sessions stay separate.

## Demo script

1. **US-25:** the extension extracts `test01_three_step_form.html` and sends it. Sending `test09_file_upload.html` shows which fields were left out, and sending the same form twice is refused.
2. **US-16, US-04:** the reviewer signs in, sees the new import in "New imports", and opens it.
3. **US-10:** the reviewer opens the source, compares the fields, corrects a field and the title, and adds categories.
4. **US-17:** the reviewer approves the form, then rejects a demo form (first without a reason, which is refused, then with one).
5. **US-01:** in a private window, a learner signs in with only a display name. Opening `#/review` sends them back to their catalog.
6. **US-02:** the learner filters by category and keyword; a search with no matches shows a message.
7. **US-11, US-08:** the learner starts the form, types answers ("Saved ✓"), reloads the page, and the answers come back.
8. **US-26:** the learner submits with a bad email and a missing required answer. Feedback appears under those fields, and the answers lock.

## Testing

```bash
.venv/bin/python manage.py test                     # 135 backend tests
(cd frontend && npm test)                           # 78 frontend tests (Vitest + Testing Library)
(cd Form_Scrapper_Extension && npx playwright install chromium && npm test)   # 28 unit + 26 end-to-end
```

- Every implemented story has tests for its main path **and** for its error, edge or permission case (see the story table above).
- Backend tests use a separate test database, so your `db.sqlite3` is untouched. They cover:
  - real sessions with CSRF, and role and ownership checks on protected routes
  - rollback after database errors, immutable completed attempts, and retries that don't double-count progress
- Extension end-to-end tests load the real extension in Chromium against 17 local test forms: multi-step, React, conditional, CAPTCHA, file upload, shadow DOM, and an embedded cross-origin form. They assert it never submits and never sends typed values.

## Departures from the Sprint 2 design

| Design (Sprint 2) | Implementation | Why |
| --- | --- | --- |
| Custom `User` with a `role` column and a `Session` table | Django's default user with role **groups**, and Django sessions | Built-in, battle-tested auth; same role rules and HttpOnly session cookie |
| Separate `ValidationRule` table; options as their own data | Rules stored as JSON on `FormField.validation` (`minLength`, `maxLength`, `min`, `max`, `allowedValues`) | One read per form; the import and attempt modules share one rule set |
| `sourceAvailability` with three states | Boolean `source_available`, set by the importer and confirmable by the reviewer | Covers US-10 AC-03 for the MVP; automatic re-checking is in the backlog |
| API-07 to API-10 for reviewers | Plus `PATCH` form details and the `/fields` routes for corrections | Extraction is never perfect; reviewers must fix it before approving (US-10) |
| Tests with Jest + Supertest | Django test client (backend), Vitest (frontend), Playwright (extension) | Django backend chosen in Sprint 2; same four-way permission cases |
| Supported input types include RADIO and FILE | Radio groups import as choice lists; file fields are reported and skipped | File uploads (PDF/DOCX checks) are in the backlog |

## Team

| Member | Main contributions in Sprint 3 |
| --- | --- |
| Kashvi Prawal (Product Owner) | US-08 autosave on the frontend: save, resume, failure messages and their tests; frontend scaffold and API client |
| Rohan Aditya Ram | Accounts (US-01), learner catalog (US-02) and practice attempts with validation feedback (US-08, US-11, US-26) |
| Atheer Alajmi | Form categories and failure reason, pending-form metadata editing, `seed_demo` demo data |
| Perumal Marimuthu | Reviewer workflow API: queue, notifications, decisions and import (US-04, US-10, US-16, US-17, US-25) |
| Siddharth Jiyani | Browser extension and import (US-25), web app screens and UI, learner sign-in, reviewer corrections, integration |

## Reference

### API reference

All paths are under `/api` and have no trailing slash. A signed-out caller gets `401`. A caller with the wrong role or ownership gets `403` with no protected data in the body.

#### Sign-in (US-01)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/session` | Sets the CSRF cookie; returns the current user or `{"user": null}` |
| `POST` | `/api/login` | Staff username and password, or learner display name |
| `POST` | `/api/logout` | Ends the session; `204` |

Paths have no trailing slash. Unsafe requests require the session cookies and `X-CSRFToken` header, including anonymous login. Initialize cookies with `GET /api/session`; login rotates CSRF, so reread the cookie afterward. Staff login accepts `{"username":"...","password":"...","role":"INSTRUCTOR"}` (role is optional). It returns `{"user":{"id":"...","displayName":"...","role":"INSTRUCTOR"}}`; exactly one recognized role group is required. Learner login accepts `{"role":"LEARNER","displayName":"Alex"}` and returns the same shape with role `LEARNER`; a storage failure returns `503 LEARNER_IDENTITY_UNAVAILABLE` without a session. A public signed-out session response is `200`, while protected endpoints return `401`. Wrong role/ownership returns `403` without protected data. Reviewers cannot read learner answers.

#### Learner catalog (US-02)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/forms?keyword=...&category=...` | Approved forms, newest first |
| `GET` | `/api/forms/{formId}` | An approved form and its fields in position order |

Catalog list is a plain array of `{id, title, status, categories}`; detail adds `fields: [{id, position, label, input_type, required, validation}]`. Empty results are `[]`. `category` may be repeated up to 10 times (`?category=Housing&category=Education`); a form matches when it has any selected category, ignoring case, and keyword and category filters combine. Blank/repeated/oversized keyword values, blank or oversized categories, and unknown filters return `400`. Missing forms return `404`; unapproved details return `403 FORM_NOT_APPROVED`. Reviewer/source metadata and unavailable guidance/options are omitted.

#### Practice attempts (US-08, US-11, US-26)

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

#### Form review and import (US-04, US-10, US-16, US-17, US-25)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/review/forms?status=` | Forms by status (default `AWAITING_REVIEW`) |
| `GET` | `/api/review/forms/{formId}` | Extracted fields, validation, source reference and decision |
| `PATCH` | `/api/review/forms/{formId}` | Correct a pending form's title, categories, source URL or source availability |
| `POST` | `/api/review/forms/{formId}/fields` | Add a field the extraction missed |
| `PATCH` | `/api/review/forms/{formId}/fields/{fieldId}` | Correct a field's label, type, required flag or validation |
| `DELETE` | `/api/review/forms/{formId}/fields/{fieldId}` | Remove a field the source does not have (at least one must remain) |
| `PUT` | `/api/review/forms/{formId}/fields/order` | `{"fieldIds": [...]}` puts the fields in the source's order |
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

##### Correcting a pending form

While a form is `AWAITING_REVIEW`, a reviewer can fix what extraction got wrong before deciding. Every change is re-checked with the import rules, so an edited form can still be practised. After the decision the form is locked, and every edit returns `409 Conflict`.

- **Form details** (`PATCH /api/review/forms/{formId}`) accept only `title`, `categories`, `source_url` and `source_available`; omitted values stay unchanged. Status, failure reason and fields cannot be changed here (`400`).
- **Fields** are added, changed, removed and reordered through the `/fields` routes above. A field takes `label`, `input_type`, `required` and `validation`; any other key returns `400`. Positions are renumbered 1..n after a removal or a reorder.

```json
PATCH /api/review/forms/{formId}
{ "title": "Senior Software Engineer", "source_url": "https://careers.datadoghq.com/detail/8052118/?gh_jid=8052118" }
```

### Validation rules

The implementation reads the existing `FormField.required`, `input_type`, and `validation` JSON. It does not create a separate validation-rule or options model.

- Text/email/tel/url/textarea/select accept string drafts; dates accept strings; number drafts accept strings or finite JSON numbers; checkboxes accept booleans. Null is allowed for an unanswered draft. Formats are checked at completion: email; phone (digits with `+ ( ) - .` and spaces, 7 to 15 digits); link (an `http`/`https` address with a real host name, where `https://` may be left off); ISO date; finite number.
- Required fields use the stored flag; unchecked required checkboxes generate feedback. An optional stored `required` rule must agree with the flag.
- `minLength`/`maxLength`: nonnegative integer bounds for text/email/tel/url/textarea/select.
- `min`/`max`: finite numeric bounds for number fields.
- `allowedValues`: an explicit nonempty, unique string list for select fields. No options are inferred. A select with no stored `allowedValues` is unsupported for starting an attempt.
- Unknown rule keys, invalid parameters/ranges, unsupported field types (including file/radio), and missing select choices return `422 UNSUPPORTED_FORM_SCHEMA` with field/rule details. This check runs on creation, on the saved field during autosave, and across the form at completion. Unsupported rules are not silently treated as successful validation. Regex `pattern` rules are currently unsupported.

SQLite is used for local development; PostgreSQL remains the production target.
Source availability currently uses a boolean rather than the three-state value
described in Sprint 2. Categories are stored as a JSON list.

Metadata editing currently supports title and categories only. Changes to
extracted fields, source information, and lifecycle status are outside this endpoint.

### Data model

`reviewer` owns the form tables: `PracticeForm` (with `categories` and `failure_reason`, migration `0002`), `FormField`, `ReviewDecision` and `ReviewNotification`. `attempts` owns the learner tables below. `attempts.0001_initial` depends only on `reviewer.0001_initial` and the user model.

- `Attempt`: UUID ID, protected learner FK (`settings.AUTH_USER_MODEL`, related name `practice_attempts`), protected form FK (`reviewer.PracticeForm`, related name `attempts`), `IN_PROGRESS`/`COMPLETED` status, start/save/completion timestamps, JSON feedback list. Database checks enforce valid status, completion timestamp consistency, and save/completion times not preceding start.
- `Answer`: UUID ID, attempt FK (`CASCADE`, related name `answers`), protected field FK (`reviewer.FormField`, related name `practice_answers`), nullable JSON value, update timestamp; unique `(attempt, field)`.
- `ProgressCounter`: UUID ID, one-to-one attempt FK (`CASCADE`, related name `progress`), nonnegative validation-error/hint-view counters, update timestamp. Services create the row with its attempt; the uniqueness constraint prevents duplicates. Completion stores the feedback count rather than incrementing it on retries.

Role/ownership, field-to-form consistency, and completed-attempt immutability are enforced by API permissions and transactional services, not by cross-table SQL checks. Other modules must preserve these invariants when writing directly. Form definitions/fields must not be structurally changed underneath existing attempts; publish a new form record for such changes. Form-status changes block new attempts but do not remove an existing owner's saved work.

Runtime model access and swappable foreign keys do not make changing `AUTH_USER_MODEL` after migrations automatic. Coordinate any user-model replacement before applying this schema to a shared or existing database.

### Configuration

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

## More documentation

- [frontend/README.md](frontend/README.md): web app screens, UI stack and layout
- [Form_Scrapper_Extension/README.md](Form_Scrapper_Extension/README.md): extension controls, safety model, export format and API-15 mapping
- [docs/product-backlog.md](docs/product-backlog.md): all 26 stories and their status
- [docs/sprint-03-integration.md](docs/sprint-03-integration.md): how the Sprint 3 branches were integrated
- [docs/sprint-02-reviewer-workflow.md](docs/sprint-02-reviewer-workflow.md): reviewer lifecycle
- `docs/SE Sprint 1 (1).docx`, `docs/Sprint 2_ Design Document (1).docx`: requirements and design
