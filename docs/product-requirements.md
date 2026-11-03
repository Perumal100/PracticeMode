# PracticeMode Product Requirements

## Product objective

Enable learners to rehearse online forms in a controlled environment. Practice answers remain inside PracticeMode; they are never submitted to the original website. Only a human-verified practice-form definition may be used to start a new practice attempt.

## Users

- **Learner:** finds approved practice forms, practises safely, uses guidance, saves drafts, and requests help.
- **Instructor:** responds to authorised assistance requests and reviews progress for assigned learners.
- **Form Reviewer:** imports supported form schemas, compares the extracted fields with a source reference, and approves or rejects each pending form.

## Sprint 2 reviewer requirements

1. Only authenticated Form Reviewers may list the review queue, read a preview, read reviewer notifications, import a form, or make a decision.
2. The queue exposes the extracted labels, input types, required indicators, validation metadata, and source URL needed for verification.
3. A successful supported import creates an `AWAITING_REVIEW` practice form and a reviewer notification.
4. Approval records reviewer identity and timestamp, then changes the form to `APPROVED`.
5. Rejection requires a non-blank reason, records reviewer identity and timestamp, and changes the form to `REJECTED`.
6. A form that is no longer awaiting review cannot receive a second decision. The API returns `409` and leaves the saved decision intact.
7. Invalid imports, including duplicate field positions or learner-answer data, create no published form.

## Constraints

- The browser client is not the security boundary; permissions are enforced by Django before protected data is loaded.
- Staff credentials use bcrypt and session cookies are HttpOnly. HTTPS is required outside local development.
- PostgreSQL is the deployment database. SQLite is supported only as the local development default.
- Supported schemas contain structure and validation metadata, never a learner's answers or personal information.
