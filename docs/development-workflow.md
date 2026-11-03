# PracticeMode Development Workflow

## Stack

- Frontend: React (to be integrated with the REST API)
- Backend: Django and Django REST Framework
- Database: PostgreSQL in deployment; SQLite only as the local default
- Tests: Django test client for APIs, then frontend and end-to-end tests as those layers are added

## Branch and review workflow

1. Create focused work from `develop`; do not push directly to `main`.
2. Keep each story's API, permission rules, tests, and documentation together.
3. Run `python manage.py test` and `python manage.py check` before committing.
4. Open a pull request into `develop`, then merge release-ready work into `main` only after team review.

## Reviewer data rules

- A `PracticeForm` enters the reviewer workflow as `AWAITING_REVIEW`.
- A decision is atomic: its review record and the form status are saved together.
- `APPROVED` permits a later learner-attempt module to publish/use the form. `REJECTED` does not.
- Source-schema imports carry field structure only. They must not carry learner answers.
- The `FORM_REVIEWER` Django group is required at the API boundary. Hiding a screen is not access control.
