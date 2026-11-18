# PracticeMode

**A safe place to practise filling in online forms before doing it for real.**

PracticeMode copies the structure of a real online form (a job application, a housing application, a benefits claim) into a practice version. A human **Form Reviewer** checks the copy against the original before publishing it. **Learners** then fill it in with made-up details, get their answers saved as they type, and receive feedback on mistakes. Nothing a learner types is ever sent to the real website.

CS-GY 6063 Software Engineering I · Section I2 · Group I2-4 · Fall 2026

| | |
| --- | --- |
| **Sprint 3 goal** | A Form Reviewer can import a real web form with the browser extension, verify and correct it, and publish it. A learner can then find that form, practise it with autosave, and get feedback on their answers. |
| **Sprint 4 work** | The six remaining MVP stories (US-03, US-05, US-09, US-12, US-18, US-22), stretch story US-15, learner accounts with a password and practice history, form version history for learners, and form deletion for reviewers. Built on local branches; each story becomes Done once a teammate reviews and merges its pull request. |
| **Status** | Sprint 3: 10 of 16 MVP stories Done. Sprint 4: the other 6 MVP stories and US-15 implemented and tested, awaiting review. |
| **Live deployment** | [practicemode-amber.vercel.app](https://practicemode-amber.vercel.app/) |
| **Stack** | Django 5.2 + Django REST Framework · React 18 + Vite + Tailwind CSS v4 (shadcn/ui components) · Chrome extension (Manifest V3) · SQLite locally, PostgreSQL for deployment |
| **Tests** | 291 backend · 183 frontend · 28 extension unit · 29 extension end-to-end (Playwright) |

## Contents

- [User stories](#user-stories)
- [Features](#features)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Demo script](#demo-script)
- [Testing](#testing)
- [Departures from the Sprint 2 design](#departures-from-the-sprint-2-design)
- [Team](#team)
- [Pull requests and reviews](#pull-requests-and-reviews)
- [Reference: API, validation rules, data model, configuration](#reference)
- [More documentation](#more-documentation)

## User stories

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

### Implemented in Sprint 4 (awaiting review)

Each row is one local branch, stacked in this order. A story moves to **Done** once its pull request is reviewed by a teammate and merged.

| Story | What a user can do | Acceptance criteria covered | Branch | Tests |
| --- | --- | --- | --- | --- |
| **US-12** Field hints | Open a hint under a question without leaving the form. | AC-01 hint shown with the label still visible · AC-02 opening or closing a hint leaves the answer unchanged · AC-03 a field without a hint shows no hint control and no invented text | `feature/us-12-field-hints` | `guidance/tests/test_hints.py`, `Hints.test.jsx` |
| **US-09** Translated guidance | Choose a guidance language; the translated label and guidance appear beside the original. | AC-01 translation beside the original · AC-02 changing language keeps labels and answers · AC-03 a missing translation is named and the original guidance is shown | `feature/us-09-translated-guidance` | `guidance/tests/test_translations.py`, `Translations.test.jsx` |
| **US-18** Preparation checklist | See what to have ready before starting, with every example marked as fictional. | AC-01 checklist shown · AC-02 examples labelled "Fictional example" · AC-03 a form without a checklist says so | `feature/us-18-preparation-checklist` | `guidance/tests/test_checklist.py`, `Checklist.test.jsx` |
| **US-03** Request instructor help | Ask for a live session from the practice form and follow its status. | AC-01 request stored with the attempt and form · AC-02 confirmation and current status · AC-03 a missing time or note is named and nothing is created | `feature/us-03-assistance-request` | `assistance/tests/test_learner_requests.py`, `AssistancePanel.test.jsx` |
| **US-05** Instructor requests | See waiting requests, accept one with meeting details, mark it completed or cancel it. | AC-01 queue with form and meeting details · AC-02 request details · AC-03 another instructor's accepted request returns `403` with no request data | `feature/us-05-instructor-requests` | `assistance/tests/test_instructor_requests.py`, `Instructor.test.jsx` |
| **US-22** Progress filters | Filter the attempts of learners whose request you accepted by unfinished attempts, repeated errors or frequent hint use. | AC-01 filters · AC-02 error and hint-view counts per attempt · AC-03 learners outside the instructor's scope are never listed; asking for one returns `403` | `feature/us-22-progress-filters` | `assistance/tests/test_progress.py`, `LearnerProgress.test.jsx` |
| **US-15** (stretch) Request a form | Send the link to a form that is not in the catalog and follow it from received to ready to practise. | AC-01 current status shown · AC-02 an unapproved form is never shown as available · AC-03 a declined or rejected request explains why | `feature/us-15-form-requests` | `form_requests/tests/test_form_requests.py`, `Requests.test.jsx` |

Also built in Sprint 4, as changes the team asked for during the sprint:

| Change | What it does | Branch | Tests |
| --- | --- | --- | --- |
| Learner accounts (changes US-01) | Learners create an account with a username, a display name and a password (no email), and sign in from any device. Their attempts are kept on the account, listed on **My practice**, and resumed from there. | `feature/learner-accounts` | `accounts/tests/test_authentication.py`, `attempts/tests/test_history.py`, `SignIn.test.jsx`, `PracticeHistory.test.jsx` |
| Form versions for learners | Each published version is numbered. Learners see the version they are on and a version history listing the questions added, removed and changed. A learner can still open a version they practised after it was replaced. | `feature/form-versions-and-deletion` | `reviewer/tests/test_versions_and_removal.py`, `Versions.test.jsx` |
| Deleting forms | A reviewer deletes a form and all its versions. A form learners have practised is withdrawn instead: it leaves the catalog and queue, takes no new answers, and its learners keep their results. | `feature/form-versions-and-deletion` | `reviewer/tests/test_versions_and_removal.py`, `ReviewEditing.test.jsx` |

### Product backlog

| Priority | Stories | Status |
| --- | --- | --- |
| Stretch | US-19 compare guided and independent attempts · US-21 favourites · US-24 issue reports | Not started |
| Out of scope | US-06, US-07, US-13, US-14, US-20, US-23 | Agreed in Sprint 1 |

Full list with priorities: [docs/product-backlog.md](docs/product-backlog.md).

## Features

### For learners
- **A learner account without personal details:** a username, a display name and a password. No email is asked for. Practice history is kept on the account, so a learner can continue on another device.
- **My practice:** every attempt on every form and version, with how far it got or how many answers needed attention.
- **Practice catalog:** totals for available, in-progress and submitted forms; keyword search; category filter pills; cards that offer Practise, Continue or View result.
- **Practice workspace:**
  - numbered questions with the right control for each (text, email, phone, number, date, choice list, checkbox, long text)
  - required markers, and progress on required questions
  - autosave with a status under each answer, and an overall "All changes saved" indicator
  - resume after a reload
- **My sessions:** every help request with the instructor, the meeting link (a "join" link), any note, and its history.
- **Help while practising:**
  - a hint under any question a reviewer wrote one for (US-12)
  - a guidance language: translated labels and guidance appear beside the original text, and a missing translation is named, never invented (US-09)
  - a preparation checklist before starting, with every example marked as fictional (US-18)
  - **Help from an instructor:** ask for a live session about this attempt and follow it until it is booked (US-03)
- **Form versions:** the version number and, after an update, what changed. A version the learner practised stays readable after it is replaced or removed.
- **Request a form:** send the link to a form that is not in the catalog and follow its status (US-15).
- **Submission and feedback:** asks before submitting with required questions unanswered. Answers are checked against their field's type (email, phone, link, date, number, choice) and limits. Afterwards, a summary links each problem to its field, and the answers lock.

### For Form Reviewers
- **Dashboard:** counts of forms awaiting review, approved and rejected; a "New imports" panel; the queue with status tabs.
- **Form inspection:**
  - source link, with a warning when the source was unreachable
  - each field's label, answer type, required flag and rules
  - long choice lists collapse to a summary, with a filterable "Show all"
- **Preview:** try the form exactly as learners will see it, and check sample answers with the same rules learners get. Nothing is saved.
- **Corrections before deciding:** edit the title and source page; add, edit, reorder and remove fields; set categories. Every change is re-checked with the import rules.
- **Decision:** approve, or reject with a reason, after a confirmation. Decisions are recorded and cannot be repeated.
- **Revising a published form:** when the real form changes, **Revise form** opens an editable copy for review. Learners keep practising the current version until the revision is approved; it then replaces the current version (status *Replaced*), and old links send learners to the new one. Attempts on the old version are kept. Rejecting the revision leaves the current version published.
- **Practice insights** (counts only, never who or what was typed):
  - learners who practised, attempts started and submitted, and submissions with no feedback
  - attempts per day over the last 7, 14 or 30 days
  - a per-form table, and for each form, the questions learners get wrong most often and which rule they broke, plus the median time to submit
  - an approved form's review page links straight to its insights

- **AI drafts of guidance:** two separate buttons. **Draft hints** writes a hint for every question without one; **Draft translations** opens a dialog to pick languages and translates each question's label and hint (draft hints first so they are translated too). Only what is missing is filled in, using Gemini with Groq as the backup. Requests go in batches of up to 15 questions per language, with a progress bar and a Stop button, and a hint added after a translation existed is translated into it. To stay within the free limits, every configured key (`GEMINI_API_KEY`, `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, …) is tried with each model in turn: a rate-limited, retired or slow model moves to the next one, a server error gets one retry, and a refused key moves to the next key. If every key and model is rate-limited, the page counts down the wait the service asks for and tries the same step again, up to 5 times. Only the form's questions (labels, answer types, rules, existing hints) are sent, never anything a learner typed. Drafts are marked "AI draft", learners do not see them, and the form cannot be approved until the reviewer approves (as is, or after editing) or discards every draft.
- **Guidance:** on the review page, each question has a **Hint and translations** button: a hint in the original language and, per language, a translated label and guidance. A sidebar card holds the preparation checklist with fictional examples. Guidance changes no structure, so it stays editable after approval, and learners see changes at once.
- **Instructors:** approve or decline instructor sign-ups, add an instructor directly (active at once), and remove or restore one. Removing an instructor signs them out and returns their booked sessions to the waiting queue; their history is kept.
- **Change requests:** instructors' reports of mistakes in published forms, by form and question. Open the form to revise it, then mark the request resolved or declined with an answer the instructor sees.
- **Learner requests:** each requested page once, with how many learners asked (never who). Importing the page with the extension links the requests automatically; a reviewer can also link one to an existing form or decline it with a reason.
- **Deleting a form:** removes every version. A form learners have practised is withdrawn instead, keeping their results.

### For instructors
- **Their own account:** instructors request one at `/#/instructor-signup` with their name, a username, a password, a default meeting link and, optionally, their organisation. A Form Reviewer approves it before they can sign in.
- **Assistance requests** (US-05): waiting requests are open to every instructor. Accepting one fills in the instructor's default meeting link, which they can change for that session, with an optional note; it then disappears from other instructors' queues. Mark it completed, change the meeting, or cancel it afterwards. The default link can be changed at the top of the queue.
- **Session history:** every request keeps a history (requested, accepted, meeting changed, completed, cancelled, returned to the queue), with who did it and when. The completed and cancelled tabs list past sessions.
- **Forms and change requests:** a **Forms** page lists published forms and their questions. An instructor can report a mistake in a whole form or one question, from there or from a help request, and sees the Form Reviewer's answer.
- **Learner progress** (US-22): attempts by learners whose request you accepted, with error and hint-view counts, filtered by unfinished attempts, repeated errors or frequent hint use. Filters stay in the address.

### Browser extension (form extractor)
- Walks multi-step forms with fictional sample data and **never submits**. It stops before final "Submit", "Pay" or "Create account" buttons.
- On a job page whose form appears only after **Apply**, it clicks that button once to open the form (never an "Apply" that sends a form or a code), and follows an Apply link that would open a new tab in the same tab.
- Captures labels, types, required flags, options (including custom and lazy dropdowns), validation, and conditional questions. It also handles iframes and shadow DOM.
- Safety model: automatic on test pages; on real sites only with permission, or in **assisted mode**, where the user navigates and the extension only records.
- **Send to PracticeMode for review** maps the capture to the import API. It reports any field it can't import (file uploads, passwords) and records the page in the address bar as the source (for example a Datadog careers page, not the Greenhouse iframe inside it).

### Across the system
- **Server-side permissions:** every route checks role and ownership. Signed out gets `401`; wrong role or owner gets `403` with no protected data.
- **Security:** staff passwords are stored as bcrypt hashes; session cookies are HttpOnly (and Secure when not in debug); every write needs a CSRF token; extension requests are accepted only from trusted origins.
- **Privacy:** a learner account holds a chosen username, a display name and a bcrypt password hash, and nothing else about the person. Imports carry structure only, and a payload containing answers is rejected. Practice answers never leave PracticeMode.

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
| `attempts/` | Practice attempts, autosaved answers, completion feedback, progress counters, reviewer analytics, `seed_demo_activity` | US-08, US-11, US-26 |
| `reviewer/` | Import endpoint, review queue, notifications, decisions, corrections, `seed_demo` | US-04, US-10, US-16, US-17, US-25 |
| `guidance/` | Hints, translations and preparation checklists, `seed_guidance` | US-09, US-12, US-18 |
| `assistance/` | Assistance requests and instructor progress, `seed_demo_assistance` | US-03, US-05, US-22 |
| `form_requests/` | Learner requests for new forms | US-15 |
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
.venv/bin/python manage.py seed_guidance   # hints, translations and a checklist for them
.venv/bin/python manage.py shell -c "
from django.contrib.auth.models import Group, User
for name, role, first in [('reviewer', 'FORM_REVIEWER', 'Rita'), ('instructor', 'INSTRUCTOR', 'Ines')]:
    user, _ = User.objects.get_or_create(username=name, defaults={'first_name': first})
    user.set_password('change-me-123')
    user.is_staff = True
    user.save()
    user.groups.set([Group.objects.get_or_create(name=role)[0]])
"
.venv/bin/python manage.py runserver
```

Once a form is approved, `.venv/bin/python manage.py seed_demo_activity` adds two weeks of fictional practice by 24 "Demo learner" accounts, so Practice insights has numbers to show. Then `.venv/bin/python manage.py seed_demo_assistance` gives the `instructor` account three waiting help requests and five booked sessions, so the instructor screens have data. Each command's `--clear` option removes exactly what it made and nothing else.

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
| Learner | **Create account**: choose a username, a display name and a password (8 or more characters, not only numbers) | Practice forms |
| Form Reviewer | **Sign in**: `reviewer` / `change-me-123` | Form review dashboard (also `/admin/`) |
| Instructor | **Sign in**: `instructor` / `change-me-123`, or **Request an instructor account** (`/#/instructor-signup`) and approve it as the reviewer under **Instructors** | Assistance requests |

Change a password with `.venv/bin/python manage.py changepassword reviewer`. Use a private window for the learner so the two sessions stay separate. Learner passwords cannot be recovered without an email address; an administrator can set a new one with `changepassword`.

## Demo script

1. **US-25:** the extension extracts `test01_three_step_form.html` and sends it. Sending `test09_file_upload.html` shows which fields were left out, and sending the same form twice is refused.
2. **US-16, US-04:** the reviewer signs in, sees the new import in "New imports", and opens it.
3. **US-10:** the reviewer opens the source, compares the fields, corrects a field and the title, and adds categories. **Preview form** shows the result as learners will see it; typing `sfnifj` into a link field and pressing **Check answers** shows the same error a learner would get.
4. **US-17:** the reviewer approves the form, then rejects a demo form (first without a reason, which is refused, then with one).
5. **US-01:** in a private window, a learner signs in with only a display name. Opening `#/review` sends them back to their catalog.
6. **US-02:** the learner filters by category and keyword; a search with no matches shows a message.
7. **US-11, US-08:** the learner starts the form, types answers ("Saved ✓"), reloads the page, and the answers come back.
8. **US-26:** the learner submits with a bad email and a missing required answer. Feedback appears under those fields, and the answers lock.
9. **Practice insights:** back as the reviewer, open **Practice insights**. The learner's attempt is counted without their name. Open the form to see which questions were missed. Run `seed_demo_activity` beforehand for a fuller chart.

**Sprint 4 additions** (run `seed_guidance`, `seed_demo_activity` and `seed_demo_assistance` first):

10. **Learner account:** create an account, start the housing form, type an answer, sign out, sign back in from another browser. **My practice** lists the attempt and **Continue** restores the answer.
11. **US-18, US-12, US-09:** the housing form shows "Before you start" with fictional examples. Open a hint, then switch the guidance language to Español (translated) and to हिन्दी (named as unavailable; the original guidance is shown). The typed answer stays.
12. **US-03:** press **Ask an instructor** with nothing filled in (both missing details are named), then send a time and a note.
13. **US-05, US-22:** as the instructor, open the request, try to accept without meeting details (refused), then accept it. **View this learner's progress**, then filter **Frequent hint use**. A second instructor account opening the same request gets "not available to you".
14. **US-15:** as the learner, **Request a form** with a page link. As the reviewer, **Learner requests** shows it; link it to a form, and the learner's request shows **Ready to practise**.
15. **Versions and deletion:** as the reviewer, revise the housing form, add a question and approve. The learner's old attempt shows "Version 1, since updated", and the new version's history lists the new question. Delete the course form: because demo learners practised it, it is withdrawn, and the learner's request now says it was removed.

## Testing

```bash
.venv/bin/python manage.py test                     # 291 backend tests
(cd frontend && npm test)                           # 183 frontend tests (Vitest + Testing Library)
(cd Form_Scrapper_Extension && npx playwright install chromium && npm test)   # 28 unit + 29 end-to-end
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
| Learners give a display name only, with no password (Sprint 1 Privacy NFR, UC-01) | Learners create an account with a username, a display name and a bcrypt-hashed password; still no email | Requested in Sprint 4 so practice history follows the learner across sign-ins and devices. A learner who forgets their password needs an administrator, because there is no email to reset it |
| `ProgressCounter.hintViewCount` with no write path | `POST /api/attempts/{id}/hint-views` counts each opened hint | US-22 filters on hint use (Sprint 2, DD-04) |
| Progress visible for learners with a request assigned to the instructor (DD-02) | Requests in `SCHEDULED` or `COMPLETED` with that instructor; a cancelled session ends the access | A cancelled session should not keep exposing a learner's progress |
| Guidance is written by people (Sprint 2, DD: "nothing is invented") | A language model may draft hints and translations, but only as drafts a Form Reviewer approves or corrects before learners see them; a form with unreviewed drafts cannot be approved | Imported forms had no guidance and writing it by hand for four languages did not scale. The human check keeps US-09 AC-03 and US-12 AC-03: nothing unreviewed is shown as guidance |
| Instructor accounts are created by an administrator | Instructors request their own account, which a Form Reviewer approves; reviewers can also add, remove and restore instructors | Requested in Sprint 4. Approval keeps self-registration from opening learner requests and progress to anyone |
| Accepting a request stores free-text meeting details (API-17) | A meeting link (the instructor's default, changeable per session) plus an optional note, and a history of every step | Requested in Sprint 4 so learners always get a link to join, and both sides have a record of their sessions |
| Forms are approved or rejected, never deleted | Reviewers can delete a form; one with learner attempts gets the new `WITHDRAWN` status instead | Keeps learners' results while taking the form out of use |
| Supported input types include RADIO and FILE | Radio groups import as choice lists; file fields are reported and skipped | File uploads (PDF/DOCX checks) are in the backlog |

## Team

| Member | Main contributions in Sprint 3 |
| --- | --- |
| Kashvi Prawal (Product Owner) | US-08 autosave on the frontend: save, resume, failure messages and their tests; frontend scaffold and API client |
| Rohan Aditya Ram | Accounts (US-01), learner catalog (US-02) and practice attempts with validation feedback (US-08, US-11, US-26) |
| Atheer Alajmi | Form categories and failure reason, pending-form metadata editing, `seed_demo` demo data |
| Perumal Marimuthu | Reviewer workflow API: queue, notifications, decisions and import (US-04, US-10, US-16, US-17, US-25) |
| Siddharth Jiyani | Browser extension and import (US-25), web app screens and UI, learner sign-in, reviewer corrections, integration |

## Pull requests and reviews

Every branch reached `main` through a pull request that a teammate reviewed. Listed in merge order.

| PR | Stories | Branch | Author | Reviewer |
| --- | --- | --- | --- | --- |
| [#2](https://github.com/Perumal100/PracticeMode/pull/2) Form Reviewer workflow API | US-04, US-16, US-17 | `pr/reviewer-workflow` | Perumal Marimuthu | Atheer Alajmi |
| [#3](https://github.com/Perumal100/PracticeMode/pull/3) Form metadata validation, protected editing, demo data | US-10 (supporting) | `Dev-Atheer` | Atheer Alajmi | Siddharth Jiyani |
| [#7](https://github.com/Perumal100/PracticeMode/pull/7) React frontend with autosave, learner and reviewer screens | US-08 | `kashvi_branch` | Kashvi Prawal | Rohan Aditya Ram |
| [#6](https://github.com/Perumal100/PracticeMode/pull/6) Accounts, learner catalog and practice attempts | US-01, US-02, US-11, US-26 | `dev-rohan` | Rohan Aditya Ram | Siddharth Jiyani |
| [#8](https://github.com/Perumal100/PracticeMode/pull/8) Browser extension that extracts forms and sends them for review | US-25 | `browser-extension` | Siddharth Jiyani | Perumal Marimuthu |
| [#5](https://github.com/Perumal100/PracticeMode/pull/5) Post-integration: reviewer corrections, link and phone checks, practice insights | US-10, US-26 | `pr/post-integration` | Siddharth Jiyani | Kashvi Prawal |

## Reference

### API reference

All paths are under `/api` and have no trailing slash. A signed-out caller gets `401`. A caller with the wrong role or ownership gets `403` with no protected data in the body.

#### Sign-in (US-01)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/session` | Sets the CSRF cookie; returns the current user or `{"user": null}` |
| `POST` | `/api/login` | Username and password, for every role |
| `POST` | `/api/register` | Create a learner account: `{username, displayName, password}`; `201` and signed in |
| `POST` | `/api/logout` | Ends the session; `204` |

Paths have no trailing slash. Unsafe requests require the session cookies and `X-CSRFToken` header, including anonymous login. Initialize cookies with `GET /api/session`; login rotates CSRF, so reread the cookie afterward. Staff login accepts `{"username":"...","password":"...","role":"INSTRUCTOR"}` (role is optional). It returns `{"user":{"id":"...","displayName":"...","role":"INSTRUCTOR"}}`; exactly one recognized role group is required. Learner login accepts `{"role":"LEARNER","displayName":"Alex"}` and returns the same shape with role `LEARNER`; a storage failure returns `503 LEARNER_IDENTITY_UNAVAILABLE` without a session. A public signed-out session response is `200`, while protected endpoints return `401`. Wrong role/ownership returns `403` without protected data. Reviewers cannot read learner answers.

**Sprint 4 change:** display-name-only learner access was replaced by accounts. `POST /api/register` takes a username (3 to 30 letters, numbers, dots, dashes or underscores, unique ignoring case), a display name and a password (8 or more characters, not a common or all-numeric password, not the username or display name). It never accepts an email or a role. A taken username returns `409 USERNAME_TAKEN`; invalid details return `400` with the field. Every role then signs in through `POST /api/login` with `{username, password}`; an optional `role` is checked, never granted.

#### Learner catalog (US-02)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/forms?keyword=...&category=...` | Approved forms, newest first |
| `GET` | `/api/forms/{formId}` | An approved form and its fields in position order; a replaced form returns `410` with `replacedBy` |

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

#### Practice history, hints, versions (Sprint 4)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/attempts` | The learner's own attempts, newest first: `{id, formId, formTitle, formStatus, formVersion, status, startedAt, lastSavedAt, completedAt, answeredCount, issueCount}`. No answers |
| `POST` | `/api/attempts/{attemptId}/hint-views` | `{"fieldId"}` counts one opened hint (US-12, used by US-22). `404` when the field has no hint, `409` after submission |
| `GET` | `/api/forms/{formId}/versions` | Published versions, newest first: `{id, version, title, status, publishedAt, fieldCount, current, changes: {added, removed, changed}}` |

The form detail (`GET /api/forms/{formId}`) now also returns `version`, `replaced_by`, `guidance_languages`, `checklist` (`[{position, description, fictional_example}]`, empty when none was defined), and on each field `hints` (`[{language_code, text}]`) and `translations` (`[{language_code, translated_label, guidance_text}]`). A learner who practised a version that was later replaced or withdrawn can still read it (`200`, status `SUPERSEDED` or `WITHDRAWN`); anyone else gets `410 FORM_REPLACED` or `410 FORM_REMOVED`. Saving or submitting an attempt on a withdrawn form returns `409 FORM_REMOVED`.

#### Assistance and progress (US-03, US-05, US-22)

| Method | Path | Caller | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/assistance-requests` | Learner | API-11: `{attemptId, requestedSlot, note}`; `201`. Missing or past slot, or blank note: `400`, nothing created. Another learner's attempt: `403`. An attempt with an open request: `409` |
| `GET` | `/api/assistance-requests?attemptId=` | Learner | Own requests and their status |
| `GET` | `/api/assistance-requests?status=` | Instructor | API-12: every `REQUESTED` request plus the caller's own |
| `GET` | `/api/assistance-requests/{requestId}` | Learner who owns it, or instructor | API-13. An instructor reads it while it waits, or once it is theirs; otherwise `403` with no request fields |
| `PATCH` | `/api/assistance-requests/{requestId}/schedule` | Instructor | API-17: `{meetingDetails}` accepts it (`SCHEDULED`). Already accepted by another instructor: `409 REQUEST_ALREADY_SCHEDULED` |
| `POST` | `/api/assistance-requests/{requestId}/complete` | Assigned instructor | `SCHEDULED` to `COMPLETED` |
| `POST` | `/api/assistance-requests/{requestId}/cancel` | Owning learner, or the assigned instructor | Open to `CANCELLED` |
| `GET` | `/api/progress?incomplete=&minErrors=&minHints=&formId=&learnerCode=` | Instructor | API-14: attempts of learners with a `SCHEDULED` or `COMPLETED` request assigned to the caller, with `validationErrorCount` and `hintViewCount`. A `learnerCode` outside that scope returns `403` |

Requests and progress show the learner's display name and username (`learnerCode`), never answers.

#### Instructor accounts and change requests

| Method | Path | Caller | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/instructor-signup` | Anyone (CSRF) | `{username, fullName, password, meetingLink, organisation?}`; `201`, status `PENDING`. Signing in before approval returns `403 INSTRUCTOR_PENDING` (`INSTRUCTOR_DECLINED`, `INSTRUCTOR_REMOVED` likewise) |
| `GET` / `PATCH` | `/api/instructor/profile` | Instructor | Own name, organisation and default `meetingLink` |
| `GET` | `/api/instructor/forms`, `/api/instructor/forms/{formId}` | Instructor | Published forms and their questions |
| `GET` / `POST` | `/api/instructor/change-requests` | Instructor | Own reports; `{formId, fieldId?, description}` reports a mistake in a published form |
| `GET` / `POST` | `/api/review/instructors?status=` | Form Reviewer | List instructors; `POST` adds one, active at once |
| `POST` | `/api/review/instructors/{userId}/{approve,decline,remove,restore}` | Form Reviewer | `{note?}`. The `INSTRUCTOR` role exists only while active; removing returns their booked sessions to the queue |
| `GET` | `/api/review/change-requests?status=` | Form Reviewer | `OPEN`, `RESOLVED` or `DECLINED` reports |
| `POST` | `/api/review/change-requests/{id}/{resolve,decline}` | Form Reviewer | `{response}`, shown to the instructor |

Accepting a help request (`PATCH /api/assistance-requests/{id}/schedule`) now takes `{meetingLink, meetingDetails?}`; without `meetingLink` the instructor's default link is used, and with neither it returns `400`. Every request carries `meetingLink` and an `events` history: `{action, label, by, detail, at}`.

#### Form requests (US-15)

| Method | Path | Caller | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/form-requests` | Learner | `{url, note?}`; `201`. Only `http`/`https` links. A page already published returns `409 FORM_ALREADY_AVAILABLE` with `formId`; the same learner asking again while it is open returns `409 REQUEST_ALREADY_OPEN` |
| `GET` | `/api/form-requests` | Learner | Own requests with `state` (`RECEIVED`, `AWAITING_REVIEW`, `AVAILABLE`, `NOT_AVAILABLE`), `message` and, when available, the current version's `formId` |
| `GET` | `/api/review/form-requests?status=` | Form Reviewer | Requests with `requestCount` for the same page; no learner details |
| `POST` | `/api/review/form-requests/{requestId}/link` | Form Reviewer | `{formId}` links every open request for that page to a form awaiting review or approved |
| `POST` | `/api/review/form-requests/{requestId}/decline` | Form Reviewer | `{reason}` declines every open request for that page; learners see the reason |

Requests are matched by page: scheme, host and path, ignoring the query string, fragment and a trailing slash. An import through `POST /api/forms/extractions` links the open requests for its page.

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
| `POST` | `/api/review/forms/{formId}/preview-check` | `{"answers": {fieldId: value}}` returns the `validationFeedback` a learner would get; nothing is saved |
| `POST` | `/api/review/forms/{formId}/revisions` | Start revising an approved form: returns a pending copy (`201`), or `409` with `formId` when a copy from that source already awaits review |
| `PUT` | `/api/review/forms/{formId}/fields/{fieldId}/guidance` | `{hint, translations: [{language_code, translated_label, guidance_text}]}` replaces a question's hint and translations; blank removes them. Pending or approved forms only (`409 GUIDANCE_LOCKED` otherwise) |
| `POST` | `/api/review/forms/{formId}/guidance/ai` | `{task: "hints"}` or `{task: "translations", languages?: [...]}`, optionally limited to `fieldIds` (up to 50), drafts the missing hints or translations with AI as unapproved drafts. A translation whose hint was never translated gets its guidance filled in and becomes a draft again. Returns `{created, updated, skipped, providers}`. `503 AI_NOT_CONFIGURED` without keys, `502 AI_FAILED` when every provider fails |
| `POST` | `/api/review/forms/{formId}/guidance/approve-drafts` | `{fieldIds?}` approves AI drafts as written (all of them when `fieldIds` is omitted) |
| `POST` | `/api/review/forms/{formId}/guidance/discard-drafts` | Removes every AI draft; guidance written or approved by a reviewer stays |
| `PUT` | `/api/review/forms/{formId}/checklist` | `{items: [{description, fictional_example}]}` replaces the preparation checklist, in order |
| `DELETE` | `/api/review/forms/{formId}` | Delete the form and all its versions (`{"outcome": "DELETED"}`), or withdraw them when learners practised any (`{"outcome": "WITHDRAWN"}`). Already withdrawn: `409` |
| `POST` | `/api/review/forms/{formId}/decision` | `{"decision": "APPROVE"}` or `{"decision": "REJECT", "rejection_reason": "..."}` |
| `GET` | `/api/review/notifications` | Notifications for forms awaiting review |
| `POST` | `/api/forms/extractions` | Import an extracted form for review (used by the browser extension) |
| `GET` | `/api/review/analytics?days=14` | Practice totals, attempts per day (`days` is 7, 14 or 30) and per-form counts |
| `GET` | `/api/review/analytics/forms/{formId}` | One form's counts and, per question, how many submissions got feedback and for which rule |

```text
Supported schema import
        -> AWAITING_REVIEW notification
        -> reviewer inspects source and extracted fields
        -> APPROVED (available to learners) or REJECTED (with reason)
```

Only Form Reviewers can call these. The analytics routes return aggregates only: no learner name, username, ID or answer value. Each learner account counts once. A form can be decided only once; a repeat returns `409`, and rejecting without a reason returns `400`.

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

Sprint 4 adds three apps:

- `guidance`: `Hint` and `Translation` (one per field and language; a missing row means no guidance, never invented text) and `ChecklistItem` (one per form and position). Form Reviewers write them on the review page; `seed_guidance` adds demo content. Revising a form copies its guidance.
- `assistance`: `AssistanceRequest` (attempt, learner, optional instructor, requested slot, note, status, meeting details). Database constraints allow one open request per attempt, require an instructor and meeting details when `SCHEDULED`, and keep `REQUESTED` rows unassigned.
- `instructors`: `InstructorProfile` (one per instructor: default meeting link, organisation, status `PENDING`/`ACTIVE`/`DECLINED`/`REMOVED`, who decided and when) and `FormChangeRequest` (form, optional question with its label kept as text, instructor, description, status, the reviewer's answer). `AssistanceRequest` gains `meeting_link`, and `AssistanceEvent` records each step of a request.
- `form_requests`: `FormRequest` (learner, URL, page key, note, status `OPEN`/`LINKED`/`DECLINED`, optional form, decline reason). Deleting a form clears the link.

`PracticeForm.status` gains `WITHDRAWN`.

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
| `GEMINI_API_KEY` | unset | Google Gemini key for AI drafts of hints and translations (tried first) |
| `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, … | unset | More Gemini keys (from other accounts), tried in number order when one is over its limit |
| `GROQ_API_KEY` (and `GROQ_API_KEY_1`, …) | unset | Groq key(s), used when every Gemini key fails |
| `GEMINI_MODELS` / `GROQ_MODELS` | `gemini-2.5-flash,gemini-flash-lite-latest,gemini-3-flash-preview,gemini-3.1-flash-lite` / `openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b` | Models tried in order, comma-separated |
| `AI_TIMEOUT_SECONDS` | `30` | How long one AI request may take before the next model is tried |
| `AI_TIMEOUT_SECONDS` | `30` | How long to wait for each provider |

Staff passwords are stored as bcrypt hashes, and session cookies are HttpOnly. SQLite runs in `IMMEDIATE` transaction mode so concurrent answer saves wait for each other instead of failing.

## More documentation

- [frontend/README.md](frontend/README.md): web app screens, UI stack and layout
- [Form_Scrapper_Extension/README.md](Form_Scrapper_Extension/README.md): extension controls, safety model, export format and API-15 mapping
- [docs/product-backlog.md](docs/product-backlog.md): all 26 stories and their status
- [docs/sprint-03-integration.md](docs/sprint-03-integration.md): how the Sprint 3 branches were integrated
- [docs/sprint-02-reviewer-workflow.md](docs/sprint-02-reviewer-workflow.md): reviewer lifecycle
- `docs/SE Sprint 1 (1).docx`, `docs/Sprint 2_ Design Document (1).docx`: requirements and design
