/**
 * shared/import_payload.js
 * Turns the extraction export (practicemode.form-extraction/v1) into the body
 * of PracticeMode's import endpoint, API-15 POST /api/forms/extractions.
 * Pure functions, loaded by the service worker and the unit tests.
 *
 * Backend contract (reviewer app on develop-perumal):
 *   { title, source_url, source_available,
 *     fields: [{ position, label, input_type, required, validation }] }
 * input_type is one of BACKEND_TYPES. Only the validation rules the attempt
 * module can check (attempts/validation.py on dev-rohan) are sent; a form with
 * any other rule could be approved but never practised (422).
 *
 * Only structure is sent. Option entries and defaults are reduced to the
 * allowed values, so nothing typed into the page can reach the payload.
 */

(() => {
  const PM = (globalThis.PracticeMode = globalThis.PracticeMode || {});

  const BACKEND_TYPES = ['text', 'email', 'tel', 'number', 'date', 'select', 'checkbox', 'textarea', 'url'];

  // Extension field type -> backend input_type. Choice lists become a select.
  const TYPE_MAP = {
    text: 'text', search: 'text', url: 'url',
    email: 'email', tel: 'tel',
    number: 'number', range: 'number',
    date: 'date',
    textarea: 'textarea', richtext: 'textarea',
    checkbox: 'checkbox',
    select: 'select', radio: 'select', 'button-group': 'select',
  };

  const UNSUPPORTED_REASONS = {
    file: 'file uploads are not supported for practice yet',
    password: 'password fields are never practised',
    'checkbox-group': 'multiple-choice checkbox groups are not supported yet',
  };

  const LENGTH_TYPES = new Set(['text', 'email', 'tel', 'textarea', 'url']);

  // Many sites (Greenhouse, Lever) ask for profile links in plain text boxes.
  // Such a box becomes a link field so learners get the link check; the
  // reviewer sees a note and can change it back.
  const LINK_HINT = /\b(urls?|links?|website|web\s*site|homepage|portfolio|linkedin|github|gitlab|blog)\b/i;
  const NOT_A_LINK = /\?|hear about|how did|referr|worked|employ/i;

  function asksForLink(field) {
    if (/\burl\b/i.test(field.autocomplete || '') || /^https?:\/\//i.test(field.placeholder || '')) return true;
    const label = String(field.label || '');
    return (LINK_HINT.test(label) || LINK_HINT.test(String(field.name || '').replace(/[_-]+/g, ' '))) && !NOT_A_LINK.test(label);
  }
  const TITLE_MAX = 200;
  const LABEL_MAX = 300;

  const finite = (value) => {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const length = (value) => (Number.isInteger(value) && value >= 0 ? value : null);

  function allowedValues(field) {
    const values = [];
    for (const option of field.options || []) {
      if (option.isPlaceholder || option.disabled) continue;
      // Learners choose by the visible label; the page's internal value is not shown.
      const text = String(option.label || option.value || '').trim();
      if (text && !values.includes(text)) values.push(text);
    }
    return values;
  }

  /** Supported rules for one field, plus a note for each rule left out. */
  function rulesFor(field, inputType) {
    const source = field.validation || {};
    const rules = {};
    const dropped = [];

    if (LENGTH_TYPES.has(inputType)) {
      const min = length(source.minLength);
      const max = length(source.maxLength);
      if (min !== null && max !== null && min > max) dropped.push('minLength/maxLength (min exceeds max)');
      else {
        if (min !== null) rules.minLength = min;
        if (max !== null) rules.maxLength = max;
      }
    }
    if (inputType === 'number') {
      const min = finite(source.min);
      const max = finite(source.max);
      if (min !== null && max !== null && min > max) dropped.push('min/max (min exceeds max)');
      else {
        if (min !== null) rules.min = min;
        if (max !== null) rules.max = max;
      }
    }
    if (inputType === 'select') rules.allowedValues = allowedValues(field);

    // Reported so the reviewer knows what to check against the source page.
    if (source.pattern) dropped.push('pattern');
    if (inputType === 'date' && (source.min || source.max)) dropped.push('date range');
    if (source.step) dropped.push('step');
    return { rules, dropped };
  }

  function unsupportedReason(field) {
    if (UNSUPPORTED_REASONS[field.type]) return UNSUPPORTED_REASONS[field.type];
    if (!TYPE_MAP[field.type]) return `input type "${field.type}" is not supported yet`;
    if (field.type === 'select' && field.multiple) return 'multiple-selection lists are not supported yet';
    return null;
  }

  /**
   * Returns { payload, skipped, notes }.
   *   skipped: [{ label, type, reason }] fields left out of the import
   *   notes:   [{ label, message }]      fields imported with a change
   */
  function buildImportPayload(exportDoc) {
    const skipped = [];
    const notes = [];
    const fields = [];

    for (const step of exportDoc?.steps || []) {
      for (const field of step.fields || []) {
        const label = String(field.label || '').trim().slice(0, LABEL_MAX);
        const reason = unsupportedReason(field);
        if (reason) {
          skipped.push({ label, type: field.type, reason });
          continue;
        }
        const inputType = TYPE_MAP[field.type] === 'text' && asksForLink(field) ? 'url' : TYPE_MAP[field.type];
        const { rules, dropped } = rulesFor(field, inputType);
        if (inputType === 'select' && !rules.allowedValues.length) {
          skipped.push({ label, type: field.type, reason: 'no options were captured' });
          continue;
        }
        // A follow-up question only appears for some answers. Practice forms
        // show every field, so requiring it would report false omissions.
        const required = Boolean(field.required) && !field.conditional;
        if (field.required && field.conditional) notes.push({ label, message: 'conditional field imported as optional' });
        if (field.type !== inputType && inputType === 'select') notes.push({ label, message: `${field.type} imported as a choice list` });
        if (field.type !== 'url' && inputType === 'url') notes.push({ label, message: 'text box imported as a link because it asks for one' });
        if (dropped.length) notes.push({ label, message: `left out unsupported rules: ${dropped.join(', ')}` });

        fields.push({ position: fields.length + 1, label, input_type: inputType, required, validation: rules });
      }
    }

    const payload = {
      title: String(exportDoc?.formTitle || '').trim().slice(0, TITLE_MAX) || 'Untitled form',
      source_url: exportDoc?.source?.url || '',
      // The extension has just read the page, so its source was reachable.
      source_available: true,
      fields,
    };
    return { payload, skipped, notes };
  }

  /** First readable message from a DRF error body. */
  function firstMessage(body) {
    if (!body) return null;
    if (typeof body === 'string') return body;
    if (Array.isArray(body)) return firstMessage(body[0]);
    if (typeof body === 'object') {
      if (body.message) return body.message;
      if (body.detail) return firstMessage(body.detail);
      for (const [key, value] of Object.entries(body)) {
        const text = firstMessage(value);
        if (text) return key === 'non_field_errors' ? text : `${key}: ${text}`;
      }
    }
    return null;
  }

  /** Reviewer-facing explanation of a failed import. */
  function describeImportError(status, body, { serverUrl, extensionOrigin } = {}) {
    const detail = firstMessage(body);
    if (status === 0) return `Could not reach PracticeMode at ${serverUrl}. Check the server address and that the server is running.`;
    if (status === 401) return `Sign in to PracticeMode at ${serverUrl} as a Form Reviewer in this browser, then send again.`;
    if (status === 403 && /csrf/i.test(detail || '')) {
      return `PracticeMode refused requests from this extension (${detail}). Add ${extensionOrigin} to DJANGO_CSRF_TRUSTED_ORIGINS on the server and sign in again.`;
    }
    if (status === 403) return 'Your PracticeMode account is not a Form Reviewer, so it cannot import forms.';
    if (status === 400) return `PracticeMode rejected the import: ${detail || 'the form structure is invalid.'}`;
    if (status === 409) return 'This form is already in the PracticeMode review queue. Review that copy before sending it again.';
    return `PracticeMode could not store the import (HTTP ${status}${detail ? `: ${detail}` : ''}).`;
  }

  /** One-line summary for the copilot after a successful import. */
  function describeImported(result) {
    const parts = [`Sent to PracticeMode: ${result.fieldCount} field${result.fieldCount === 1 ? '' : 's'} awaiting review.`];
    if (result.skipped?.length) {
      parts.push(`Left out ${result.skipped.length}: ${result.skipped.map((s) => `${s.label} (${s.reason})`).join('; ')}.`);
    }
    if (result.notes?.length) parts.push(`${result.notes.length} field${result.notes.length === 1 ? '' : 's'} changed; check them in the review queue.`);
    return parts.join(' ');
  }

  PM.importPayload = { buildImportPayload, describeImportError, describeImported, BACKEND_TYPES, TYPE_MAP };
})();
