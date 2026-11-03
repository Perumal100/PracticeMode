import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PM } from './load.mjs';

const { buildImportPayload, describeImportError, describeImported, BACKEND_TYPES } = PM.importPayload;

// Field objects as the extension exports them (test01 and test06 fixtures).
const doc = (fields, extra = {}) => ({
  schema: 'practicemode.form-extraction/v1',
  formTitle: 'Job Application Form',
  source: { url: 'http://localhost:4317/test01_three_step_form.html', origin: 'http://localhost:4317', environment: 'fixture' },
  steps: [{ step: 1, title: 'Step', fields }],
  ...extra,
});
const firstName = { fieldId: 'first_name', label: 'First Name', name: 'firstName', order: 1, placeholder: 'Enter your first name', required: true, type: 'text', validation: { maxLength: 50, minLength: 2 } };
const email = { fieldId: 'email', label: 'Email Address', order: 2, required: true, type: 'email', validation: { format: 'email' } };
const phone = { fieldId: 'phone', label: 'Phone Number', order: 3, required: false, type: 'tel', validation: { pattern: '[0-9\\-\\+\\(\\)\\s]{7,20}' } };
const education = {
  fieldId: 'education', label: 'Highest Education', order: 4, required: true, type: 'select', optionsSource: 'native',
  options: [{ isPlaceholder: true, label: '-- Select --', value: '' }, { label: 'High School', value: 'hs' }, { label: 'PhD', value: 'phd', defaultSelected: true }],
};
const gradYear = { fieldId: 'graduation_year', label: 'Graduation Year', order: 5, required: false, type: 'number', validation: { max: '2030', min: '1970' } };
const city = { fieldId: 'city', label: 'City', order: 6, type: 'text', allowsFreeText: true, optionsSource: 'datalist', options: [{ label: '', value: 'New York' }] };

test('maps exported fields to the API-15 payload in document order', () => {
  const steps = [{ step: 1, fields: [firstName, email] }, { step: 2, fields: [] }, { step: 3, fields: [education, gradYear] }];
  const { payload, skipped } = buildImportPayload(doc([], { steps }));
  assert.deepEqual(Object.keys(payload).sort(), ['fields', 'source_available', 'source_url', 'title']);
  assert.equal(payload.title, 'Job Application Form');
  assert.equal(payload.source_url, 'http://localhost:4317/test01_three_step_form.html');
  assert.equal(payload.source_available, true);
  assert.deepEqual(payload.fields, [
    { position: 1, label: 'First Name', input_type: 'text', required: true, validation: { minLength: 2, maxLength: 50 } },
    { position: 2, label: 'Email Address', input_type: 'email', required: true, validation: {} },
    { position: 3, label: 'Highest Education', input_type: 'select', required: true, validation: { allowedValues: ['High School', 'PhD'] } },
    { position: 4, label: 'Graduation Year', input_type: 'number', required: false, validation: { min: 1970, max: 2030 } },
  ]);
  assert.deepEqual(skipped, []);
});

test('only sends input types and rules the backend can validate', () => {
  const choice = { label: 'Employed?', type: 'radio', required: true, options: [{ label: 'Yes', value: 'y' }, { label: 'No', value: 'n' }] };
  const dateRange = { label: 'Start', type: 'date', validation: { min: '2026-01-01', max: '2026-12-31' } };
  const backwards = { label: 'Code', type: 'text', validation: { minLength: 9, maxLength: 3 } };
  const { payload, notes } = buildImportPayload(doc([phone, choice, dateRange, backwards, city, { label: 'Agree', type: 'checkbox' }]));
  const allowed = { text: ['minLength', 'maxLength'], tel: ['minLength', 'maxLength'], date: [], select: ['allowedValues'], checkbox: [] };
  for (const field of payload.fields) {
    assert.ok(BACKEND_TYPES.includes(field.input_type), field.input_type);
    for (const rule of Object.keys(field.validation)) assert.ok(allowed[field.input_type].includes(rule), `${field.label}: ${rule}`);
  }
  assert.deepEqual(payload.fields.find((f) => f.label === 'Employed?').validation, { allowedValues: ['Yes', 'No'] });
  // A datalist only suggests values; the field stays free text.
  assert.deepEqual(payload.fields.find((f) => f.label === 'City'), { position: 5, label: 'City', input_type: 'text', required: false, validation: {} });
  assert.ok(notes.some((n) => n.label === 'Phone Number' && /pattern/.test(n.message)));
  assert.ok(notes.some((n) => n.label === 'Employed?' && /choice list/.test(n.message)));
  assert.ok(notes.some((n) => n.label === 'Code' && /min exceeds max/.test(n.message)));
});

test('leaves out fields the practice module cannot render, with a reason', () => {
  const { payload, skipped } = buildImportPayload(doc([
    firstName,
    { label: 'Upload Resume', type: 'file', required: true },
    { label: 'Password', type: 'password' },
    { label: 'Skills', type: 'checkbox-group', options: [{ label: 'A', value: 'a' }] },
    { label: 'Languages', type: 'select', multiple: true, options: [{ label: 'English', value: 'en' }] },
    { label: 'Shift', type: 'time' },
    { label: 'Empty list', type: 'select', options: [{ isPlaceholder: true, label: 'Choose', value: '' }] },
  ]));
  assert.deepEqual(payload.fields.map((f) => f.label), ['First Name']);
  assert.deepEqual(skipped.map((s) => s.label), ['Upload Resume', 'Password', 'Skills', 'Languages', 'Shift', 'Empty list']);
  assert.ok(skipped.every((s) => s.reason));
});

test('conditional follow-up questions are imported as optional', () => {
  const employer = { label: 'Employer Name', type: 'text', required: true, conditional: { visibleInitially: false, showWhen: [{ fieldId: 'employed', value: 'yes' }] } };
  const { payload, notes } = buildImportPayload(doc([employer]));
  assert.equal(payload.fields[0].required, false);
  assert.ok(notes.some((n) => /conditional/.test(n.message)));
});

test('the payload carries structure only, never answers or page defaults', () => {
  const { payload } = buildImportPayload(doc([firstName, education, city, { label: 'Agree', type: 'checkbox', defaultChecked: true }]));
  const keys = [];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) { keys.push(k); walk(v); }
  };
  walk(payload);
  // The backend rejects any of these keys as learner answers (reviewer.serializers).
  for (const forbidden of ['answer', 'answers', 'answer_value', 'value', 'defaultSelected', 'defaultChecked', 'placeholder', 'name', 'id']) {
    assert.ok(!keys.includes(forbidden), forbidden);
  }
  assert.ok(!JSON.stringify(payload).includes('phd'), 'internal option values are not sent');
});

test('long titles and labels are trimmed to the backend limits', () => {
  const { payload } = buildImportPayload(doc([{ label: `  ${'L'.repeat(400)}  `, type: 'text' }], { formTitle: 'T'.repeat(250) }));
  assert.equal(payload.title.length, 200);
  assert.equal(payload.fields[0].label.length, 300);
  assert.equal(buildImportPayload(doc([], { formTitle: '' })).payload.title, 'Untitled form');
});

test('import errors tell the reviewer what to do next', () => {
  const ctx = { serverUrl: 'http://localhost:8000', extensionOrigin: 'chrome-extension://abc' };
  assert.match(describeImportError(0, null, ctx), /Could not reach PracticeMode at http:\/\/localhost:8000/);
  assert.match(describeImportError(401, { detail: 'Authentication credentials were not provided.' }, ctx), /Sign in to PracticeMode/);
  assert.match(describeImportError(403, { detail: 'CSRF Failed: Origin checking failed - chrome-extension://abc does not match any trusted origins.' }, ctx),
    /Add chrome-extension:\/\/abc to DJANGO_CSRF_TRUSTED_ORIGINS/);
  assert.match(describeImportError(403, { detail: 'Form Reviewer permission is required.' }, ctx), /not a Form Reviewer/);
  assert.match(describeImportError(400, { source_url: ['Enter a valid URL.'] }, ctx), /rejected the import: source_url: Enter a valid URL\./);
  assert.match(describeImportError(503, null, ctx), /HTTP 503/);
});

test('the success message reports what was imported and what was left out', () => {
  const message = describeImported({ fieldCount: 3, skipped: [{ label: 'Upload Resume', reason: 'file uploads are not supported for practice yet' }], notes: [{}] });
  assert.match(message, /3 fields awaiting review/);
  assert.match(message, /Left out 1: Upload Resume \(file uploads/);
  assert.match(message, /1 field changed/);
});
