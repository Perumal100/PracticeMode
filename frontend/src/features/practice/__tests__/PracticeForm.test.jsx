// US-11, US-08 (wired into the page) and US-26. The API is a test double.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import PracticeForm from '../PracticeForm.jsx';
import { storedAttempt, storedAttemptId } from '../attemptStore.js';

const user = { id: 'u1', displayName: 'Alex', role: 'LEARNER' };
const form = {
  id: 'f1', title: 'Fictional housing application', status: 'APPROVED', categories: ['Housing'],
  fields: [
    { id: 'name', position: 1, label: 'Full name', input_type: 'text', required: true, validation: { maxLength: 60 } },
    { id: 'email', position: 2, label: 'Email', input_type: 'email', required: false, validation: {} },
    { id: 'size', position: 3, label: 'Household size', input_type: 'select', required: true, validation: { allowedValues: ['1', '2', '3+'] } },
    { id: 'agree', position: 4, label: 'I understand this is practice', input_type: 'checkbox', required: false, validation: {} },
    { id: 'linkedin', position: 5, label: 'LinkedIn profile', input_type: 'url', required: false, validation: { maxLength: 255 } },
  ],
};
const attempt = (overrides = {}) => ({ id: 'a1', formId: 'f1', status: 'IN_PROGRESS', answers: [], validationFeedback: [], ...overrides });

function setup(overrides = {}) {
  const api = {
    getForm: vi.fn().mockResolvedValue(form),
    startAttempt: vi.fn().mockResolvedValue(attempt()),
    getAttempt: vi.fn().mockResolvedValue(attempt()),
    saveAnswer: vi.fn((attemptId, fieldId, value) => Promise.resolve({ fieldId, value, savedAt: '2026-11-03T10:00:00Z' })),
    completeAttempt: vi.fn().mockResolvedValue({ status: 'COMPLETED', completedAt: '2026-11-03T10:05:00Z', validationFeedback: [] }),
    debounceMs: 0,
    ...overrides,
  };
  render(<PracticeForm formId="f1" user={user} onBack={() => {}} api={api} />);
  return api;
}

async function submitAnyway() {
  fireEvent.click(screen.getByRole('button', { name: 'Submit attempt' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Submit anyway' }));
}

async function startPractice() {
  fireEvent.click(await screen.findByRole('button', { name: 'Start practice' }));
  return screen.findByLabelText(/Full name/);
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('PracticeForm', () => {
  it('US-11 AC-01: renders each extracted field with its control and required marker', async () => {
    const api = setup();
    await startPractice();
    expect(api.startAttempt).toHaveBeenCalledWith('f1');
    expect(screen.getByLabelText(/Full name/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/Email/)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(/I understand/)).toHaveAttribute('type', 'checkbox');
    expect(screen.getByLabelText(/LinkedIn profile/)).toHaveAttribute('type', 'url');
    const select = screen.getByLabelText(/Household size/);
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', '1', '2', '3+']);
    expect(screen.getByLabelText(/Full name/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Email/)).not.toHaveAttribute('aria-required');
    expect(storedAttemptId('u1', 'f1')).toBe('a1');
  });

  it('US-11 AC-02 / US-08 AC-01: an edited answer is saved and confirmed without touching other fields', async () => {
    const api = setup();
    fireEvent.change(await startPractice(), { target: { value: 'Alex Morgan' } });
    await screen.findByText('Saved ✓');
    expect(api.saveAnswer).toHaveBeenCalledWith('a1', 'name', 'Alex Morgan');
    expect(api.saveAnswer).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/Email/)).toHaveValue('');
    fireEvent.click(screen.getByLabelText(/I understand/));
    await waitFor(() => expect(api.saveAnswer).toHaveBeenCalledWith('a1', 'agree', true));
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: '' } });
    await waitFor(() => expect(api.saveAnswer).toHaveBeenLastCalledWith('a1', 'name', null));
  });

  it('US-08 AC-02: reopening the form resumes the saved attempt', async () => {
    window.localStorage.setItem('pm_attempts_v1', JSON.stringify({ 'u1:f1': 'a1' }));
    const api = setup({ getAttempt: vi.fn().mockResolvedValue(attempt({ answers: [{ fieldId: 'name', value: 'Alex', savedAt: 'x' }, { fieldId: 'size', value: '2', savedAt: 'x' }] })) });
    expect(await screen.findByLabelText(/Full name/)).toHaveValue('Alex');
    expect(screen.getByLabelText(/Household size/)).toHaveValue('2');
    expect(api.startAttempt).not.toHaveBeenCalled();
  });

  it('US-08 AC-03: a failed save is reported next to the field', async () => {
    setup({ saveAnswer: vi.fn().mockRejectedValue(new ApiError(503, 'SAVE_FAILED', 'x')) });
    fireEvent.change(await startPractice(), { target: { value: 'Alex' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Not saved. Retry.');
  });

  it('US-26 AC-01/AC-02: submitting shows feedback on the affected fields and locks the answers', async () => {
    const api = setup({
      completeAttempt: vi.fn().mockResolvedValue({
        status: 'COMPLETED', completedAt: 'x',
        validationFeedback: [{ fieldId: 'name', ruleType: 'REQUIRED', errorMessage: 'This field is required.' }],
      }),
    });
    await startPractice();
    await submitAnyway();
    expect(await screen.findByText(/1 answer needs attention/)).toBeInTheDocument();
    expect(screen.getByText('This field is required.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/)).toHaveAttribute('aria-invalid', 'true');
    expect(storedAttempt('u1', 'f1')).toEqual({ id: 'a1', status: 'COMPLETED' });
    expect(screen.getByLabelText(/Full name/)).toBeDisabled();
    expect(api.completeAttempt).toHaveBeenCalledWith('a1');
    expect(screen.getByRole('button', { name: 'Start a new attempt' })).toBeInTheDocument();
  });

  it('US-26: waits for queued saves before submitting', async () => {
    const api = setup({ debounceMs: 10_000 });
    fireEvent.change(await startPractice(), { target: { value: 'Alex' } });
    expect(api.saveAnswer).not.toHaveBeenCalled();
    await submitAnyway();
    await waitFor(() => expect(api.completeAttempt).toHaveBeenCalled());
    expect(api.saveAnswer.mock.invocationCallOrder[0]).toBeLessThan(api.completeAttempt.mock.invocationCallOrder[0]);
  });

  it('US-26 AC-03: a repeated submission shows the stored result', async () => {
    const stored = { status: 'COMPLETED', completedAt: 'x', validationFeedback: [] };
    setup({ completeAttempt: vi.fn().mockRejectedValue(new ApiError(409, null, 'x', stored)) });
    await startPractice();
    await submitAnyway();
    expect(await screen.findByText(/No problems were found/)).toBeInTheDocument();
  });

  it('US-11 AC-03: a form that is not approved cannot be started and says why', async () => {
    const api = setup({ getForm: vi.fn().mockRejectedValue(new ApiError(403, 'FORM_NOT_APPROVED', 'x')) });
    expect(await screen.findByRole('alert')).toHaveTextContent('not available for practice');
    expect(screen.queryByRole('button', { name: 'Start practice' })).not.toBeInTheDocument();
    expect(api.startAttempt).not.toHaveBeenCalled();
  });

  it('asks before submitting with required questions unanswered, and can be cancelled', async () => {
    const api = setup();
    await startPractice();
    fireEvent.click(screen.getByRole('button', { name: 'Submit attempt' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('2 required questions unanswered');
    fireEvent.click(screen.getByRole('button', { name: 'Keep answering' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.completeAttempt).not.toHaveBeenCalled();
  });

  it('shows progress on required questions', async () => {
    setup();
    fireEvent.change(await startPractice(), { target: { value: 'Alex' } });
    expect(screen.getByRole('progressbar', { name: 'Required questions answered' })).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('1 of 2 required questions answered')).toBeInTheDocument();
  });

  it('explains a form whose rules cannot be checked (422)', async () => {
    setup({ startAttempt: vi.fn().mockRejectedValue(new ApiError(422, 'UNSUPPORTED_FORM_SCHEMA', 'x')) });
    fireEvent.click(await screen.findByRole('button', { name: 'Start practice' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot be practised');
  });

  it('an unavailable saved attempt offers a fresh start', async () => {
    window.localStorage.setItem('pm_attempts_v1', JSON.stringify({ 'u1:f1': 'gone' }));
    setup({ getAttempt: vi.fn().mockRejectedValue(new ApiError(404, 'ATTEMPT_NOT_FOUND', 'x')) });
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new attempt' }));
    expect(await screen.findByRole('button', { name: 'Start practice' })).toBeInTheDocument();
    expect(storedAttemptId('u1', 'f1')).toBeNull();
  });
});
