// Learner-facing text for save results (Sprint 2 design, Rule 2).
export const SAVE_MESSAGES = {
  pending: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved ✓',
  failed: 'Not saved. Retry.',
  invalid: 'Not saved: this answer is not valid.',
  forbidden: 'Not saved: you do not have access to this attempt.',
  notFound: 'Not saved: this attempt or field no longer exists.',
  signedOut: 'Not saved: your session has ended. Sign in again.',
  completed: 'Not saved: this attempt has already been submitted.',
  unsupported: 'Not saved: this form cannot be practised right now.',
};

// Turns an ApiError from a PATCH into the message shown next to the field.
export function messageForSaveError(error) {
  switch (error?.status) {
    case 400:
      return SAVE_MESSAGES.invalid;
    case 401:
      return SAVE_MESSAGES.signedOut;
    case 403:
      return SAVE_MESSAGES.forbidden;
    case 404:
      return SAVE_MESSAGES.notFound;
    case 409:
      // ATTEMPT_COMPLETED: answers lock once the attempt is completed (STM-02).
      return SAVE_MESSAGES.completed;
    case 422:
      // UNSUPPORTED_FORM_SCHEMA: the stored form has rules the server cannot check.
      return SAVE_MESSAGES.unsupported;
    default:
      // 503 SAVE_FAILED, network errors and anything unexpected.
      return SAVE_MESSAGES.failed;
  }
}
