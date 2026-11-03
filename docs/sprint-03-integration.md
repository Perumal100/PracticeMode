# Sprint 3 Integration Guide

How the Sprint 3 branches were combined into one working build. The integration was done on `develop-perumal` and `main` was then fast-forwarded to it. The four merge commits show each branch coming in, in the order below. The combined result passes 116 backend tests, 67 frontend tests, and 25 extension unit and 25 end-to-end tests, plus a full-stack walkthrough through the web app. The steps are kept here so the merge can be repeated or audited.

## Branches

| Branch | Owner | Contents | Stories | Git history |
| --- | --- | --- | --- | --- |
| `develop-perumal` | Perumal | Django project, `reviewer` app: review queue, decisions, notifications, API-15 import | US-04, US-10, US-16, US-17, US-25 (server) | root `08c575f` |
| `Dev-Atheer` | Atheer | Form categories and failure reason (`reviewer.0002`), pending-form metadata edit (`PATCH /api/review/forms/{id}`), `seed_demo` | US-02 data, US-15 data | based on `develop-perumal` |
| `kashvi_branch` | Kashvi (screens added by Siddharth) | `frontend/`: API client, US-08 autosave hooks, and the sign-in, learner home, practice workspace and reviewer dashboard screens (Tailwind + shadcn/ui) | US-01, US-02, US-04, US-08, US-10, US-11, US-16, US-17, US-26 (client) | based on `develop-perumal` |
| `dev-rohan` | Rohan | `accounts` (staff and learner sign-in), `catalog` (learner search), `attempts` (create, resume, autosave, complete) | US-01, US-02, US-08 (server), US-11 (server), US-26 | root `caa0388` (`main`) |
| `browser-extension` | Siddharth | `Form_Scrapper_Extension/`: multi-step extraction and sending to API-15 | US-25 (client) | root `caa0388` (`main`) |

`dev-rohan` and `browser-extension` start from `main`, which shares no commits with `develop-perumal`. Merging them needs `--allow-unrelated-histories`. Every file that both sides contain then merges as an add/add. Files with identical content merge silently, and the shared files on those branches have been made identical where possible. Three trivial conflicts remain.

## Merge order and conflict resolution

```bash
git checkout -b integration develop-perumal
git merge Dev-Atheer            # clean
git merge kashvi_branch         # clean
git merge --allow-unrelated-histories dev-rohan
git merge --allow-unrelated-histories browser-extension   # clean
```

Conflicts from `dev-rohan`. Each resolution keeps both sides:

| File | Resolution |
| --- | --- |
| `practicemode/settings.py` | Take `dev-rohan`'s `INSTALLED_APPS` (`accounts`, `reviewer`, `catalog`, `attempts`). Either docstring line is fine. |
| `practicemode/urls.py` | Keep all four includes: `reviewer.urls`, `accounts.urls`, `catalog.urls`, `attempts.urls`. Their paths and URL names do not overlap. |
| `README.md` | Combined into one README: run steps and demo script, project layout, API reference by area, validation rules, data model, configuration and tests. |

`reviewer/models.py`, `reviewer/migrations/0001` and `0002`, `.gitignore` and `requirements.txt` are identical on every branch that has them, so they merge without conflicts. `attempts.0001` depends on `reviewer.0001` only, so the migration graph stays linear.

After merging, check:

```bash
python manage.py check
python manage.py makemigrations --check --dry-run   # expect "No changes detected"
python manage.py test                               # 116 tests
(cd frontend && npm install && npm test)            # 67 tests
(cd Form_Scrapper_Extension && npm install && npm run setup:browsers && npm test)   # 25 unit + 25 e2e
```

## Running the integrated build locally

```bash
python -m venv .venv && .venv/bin/python -m pip install -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo          # two fictional AWAITING_REVIEW forms (Dev-Atheer)
.venv/bin/python manage.py shell -c "
from django.contrib.auth.models import Group, User
for name, role in [('reviewer', 'FORM_REVIEWER'), ('instructor', 'INSTRUCTOR')]:
    user, _ = User.objects.get_or_create(username=name, defaults={'first_name': name.title()})
    user.set_password('change-me-123')
    user.is_staff = True   # allows the Django admin sign-in as well
    user.save()
    user.groups.set([Group.objects.get_or_create(name=role)[0]])
"
DJANGO_CSRF_TRUSTED_ORIGINS=chrome-extension://<extension-id> .venv/bin/python manage.py runserver   # :8000
(cd frontend && npm run dev)                  # :5173, proxies /api to :8000
```

Each staff user needs exactly one role group. `accounts` refuses a user with no recognised group, or with more than one, at sign-in. Learners are created on sign-in with `{"role": "LEARNER", "displayName": "..."}` and need no setup.

## Cross-branch contracts

These were checked against the running code. Field names in request and response bodies are exact.

| Contract | Producer | Consumer | Shape |
| --- | --- | --- | --- |
| Roles | `accounts.identity`, `reviewer.permissions` | every protected view | Django groups `LEARNER`, `INSTRUCTOR`, `FORM_REVIEWER` on the default user model. |
| Sign-in (API-01) | `accounts` | frontend, extension, reviewers | `GET /api/session` sets `csrftoken`. `POST /api/login` with `{username, password}` or `{role: "LEARNER", displayName}` returns `{user: {id, displayName, role}}`. |
| Import (API-15) | extension `shared/import_payload.js` | `reviewer.FormExtractionView` | `{title, source_url, source_available, fields: [{position, label, input_type, required, validation}]}`. `input_type` is one of `text email tel number date select checkbox textarea`. A second import of a source that is still awaiting review returns `409 DUPLICATE_PENDING_IMPORT`. |
| Validation rules | `reviewer.FormField.validation` | `attempts.validation.check_schema` | `minLength`/`maxLength` on text-like fields, `min`/`max` on numbers, `allowedValues` (required) on selects. The import endpoint rejects any other rule with `400`, so every approved form can be practised. |
| Categories | `reviewer.PracticeForm.categories` (Dev-Atheer) | `catalog` | JSON list of labels. `GET /api/forms?category=A&category=B` matches any selected category, ignoring case. |
| Attempt read (API-05) | `attempts` | `frontend/src/features/autosave` | `{id, formId, status, startedAt, lastSavedAt, completedAt, validationFeedback, answers: [{fieldId, value, savedAt}]}` |
| Answer save (API-06) | `attempts` | autosave | `PATCH /api/attempts/{id}/answers/{fieldId}` with `{value}` returns `{fieldId, value, savedAt}`. Errors: `400`, `401`, `403`, `404`, `409 ATTEMPT_COMPLETED`, `422`, `503 SAVE_FAILED`. |
| CSRF from the extension | `practicemode.settings` | extension service worker | `DJANGO_CSRF_TRUSTED_ORIGINS=chrome-extension://<id>` |
| CSRF from the Vite dev server | `frontend/vite.config.js` | Django | The proxy keeps `changeOrigin: false`, so `Host` matches `Origin`. |

## Demo walkthrough that was verified

1. A reviewer signs in. The extension captures `test01_three_step_form.html`, `test06_custom_dropdowns.html` and `test09_file_upload.html` and sends each one. The three file-upload fields are left out and listed.
2. The review queue and notifications list three forms, and the detail view shows the source URL and fields. The reviewer sets categories through `PATCH`, approves two forms, and rejects the upload form with a reason.
3. A learner signs in with a display name. `?category=employment` finds the approved job form only. Starting the rejected form returns `403 FORM_NOT_APPROVED`.
4. The frontend's `saveAnswer` saves four answers through the Vite proxy, and resuming restores them. Completion returns `FORMAT`, `MIN_VALUE` and `REQUIRED` feedback. A later edit returns `409`, shown as "Not saved: this attempt has already been submitted."

## Not covered by any branch yet (product backlog)

- **US-03, US-05, US-22**: assistance requests and instructor progress (API-11 to API-14, API-17). No models or endpoints exist yet. `ProgressCounter` exists in `attempts`.
- **US-09, US-12, US-18**: translations, hints and checklists. No `Hint`, `Translation` or `ChecklistItem` models exist, and API-03 does not return guidance. `hint_view_count` is never incremented.
- **Instructor screens**: an instructor who signs in sees a placeholder until US-03, US-05 and US-22 are built.
- **API-15 `422` path**: an extraction failure is not yet recorded as a `FAILED` form with `failure_reason`. The extension reports such failures itself and sends nothing.
- **US-10 AC-03**: `source_available` is a boolean set by the importer. Nothing re-checks the source, and the design's three-state `sourceAvailability` is not implemented.
- **Files**: `UploadedFile` and the PDF/DOCX byte check are not implemented. File fields are left out of imports.
- **Role edge case**: `reviewer.permissions` treats a superuser as a Form Reviewer, but `accounts` sign-in requires a role group. Give demo accounts a group.
