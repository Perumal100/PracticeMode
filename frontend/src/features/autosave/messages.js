// Learner-facing text for save results (Sprint 2 design, Rule 2).
export const SAVE_MESSAGES = {
  pending: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved ✓',
  failed: 'Not saved. Retry.',
  invalid: 'Not saved: this answer is not valid.',
  forbidden: 'Not saved: you do not have access to this attempt.',
  notFound: 'Not saved: this attempt or field no longer exists.',
};

// Turns an ApiError from a PATCH into the message shown next to the field.
export function messageForSaveError(error) {
  switch (error?.status) {
    case 400:
      return SAVE_MESSAGES.invalid;
    case 403:
      return SAVE_MESSAGES.forbidden;
    case 404:
      return SAVE_MESSAGES.notFound;
    default:
      // 503 SAVE_FAILED, network errors and anything unexpected.
      return SAVE_MESSAGES.failed;
  }
}
