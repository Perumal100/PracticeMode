# PracticeMode

PracticeMode is a safe, web-based place for people to practise completing online forms without entering information on external websites. Form definitions are imported from supported sources, reviewed by a human Form Reviewer, and published only after approval.

> The product and Sprint 2 implementation are PracticeMode, as defined in the accepted Sprint 1 and Sprint 2 design documents.

## Run the full system (Sprint 3)

These steps apply once all Sprint 3 branches are merged. See [the integration guide](docs/sprint-03-integration.md) for the merge itself. You need Python 3.11+, Node.js 20+, and Chrome.

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
DJANGO_CSRF_TRUSTED_ORIGINS=chrome-extension://<extension-id> .venv/bin/python manage.py runserver
```

Demo accounts: `reviewer` / `change-me-123` (Form Reviewer) and `instructor` / `change-me-123`. Learners need no account; they type a display name. Each staff account needs exactly one role group. On Windows, use `.venv\Scripts\python` and set the variable with `set DJANGO_CSRF_TRUSTED_ORIGINS=...` first.

**2. Web app** (http://localhost:5173, proxies `/api` to the backend):

```bash
cd frontend && npm install && npm run dev
```

**3. Browser extension** (optional; it imports new forms):

1. Open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and choose `Form_Scrapper_Extension`.
2. Put its ID in `DJANGO_CSRF_TRUSTED_ORIGINS` above.
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
