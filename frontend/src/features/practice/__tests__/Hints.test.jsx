// US-12: contextual hints on the practice form. The API is a test double.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PracticeForm from '../PracticeForm.jsx';

const user = { id: 'u1', displayName: 'Alex', role: 'LEARNER' };
const HINT = 'Write your first and last name, as on your ID.';
const form = {
  id: 'f1', title: 'Fictional housing application', status: 'APPROVED', categories: ['Housing'],
  fields: [
    { id: 'name', position: 1, label: 'Full name', input_type: 'text', required: true, validation: {}, hints: [{ language_code: 'en', text: HINT }] },
    { id: 'email', position: 2, label: 'Email', input_type: 'email', required: false, validation: {}, hints: [] },
  ],
};
const attempt = (overrides = {}) => ({ id: 'a1', formId: 'f1', status: 'IN_PROGRESS', answers: [], validationFeedback: [], ...overrides });

async function setup(overrides = {}) {
  const api = {
    getForm: vi.fn().mockResolvedValue(form),
    startAttempt: vi.fn().mockResolvedValue(attempt()),
    getAttempt: vi.fn().mockResolvedValue(attempt()),
    saveAnswer: vi.fn((attemptId, fieldId, value) => Promise.resolve({ fieldId, value, savedAt: '2026-11-10T10:00:00Z' })),
    recordHintView: vi.fn().mockResolvedValue({ hintViewCount: 1 }),
    debounceMs: 0,
    ...overrides,
  };
  render(<PracticeForm formId="f1" user={user} onBack={() => {}} api={api} />);
  if (!window.localStorage.getItem('pm_attempts_v1')) fireEvent.click(await screen.findByRole('button', { name: 'Start practice' }));
  await screen.findByLabelText(/Full name/);
  return api;
}

const hintButton = () => screen.getByRole('button', { name: /hint for Full name/i });

beforeEach(() => window.localStorage.clear());

describe('US-12 field hints', () => {
  it('AC-01: opening a hint shows it under the question and keeps the label visible', async () => {
    const api = await setup();
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    fireEvent.click(hintButton());
    expect(screen.getByText(HINT)).toBeVisible();
    expect(screen.getByText('Full name')).toBeVisible();
    expect(hintButton()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/Full name/)).toHaveAttribute('aria-describedby', 'hint-name');
    expect(api.recordHintView).toHaveBeenCalledWith('a1', 'name');
  });

  it('AC-02: opening and closing a hint leaves the entered answer unchanged', async () => {
    const api = await setup();
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Jordan Rivera' } });
    await screen.findByText('Saved ✓');
    fireEvent.click(hintButton());
    fireEvent.click(hintButton());
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/)).toHaveValue('Jordan Rivera');
    expect(api.saveAnswer).toHaveBeenCalledTimes(1);
    // Closing is not a view; only the one opening was counted.
    expect(api.recordHintView).toHaveBeenCalledTimes(1);
  });

  it('AC-03: a field with no hint shows no hint control and no guidance', async () => {
    await setup();
    expect(screen.getAllByRole('button', { name: /hint for/i })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /hint for Email/i })).not.toBeInTheDocument();
  });

  it('still shows the hint when the view could not be recorded', async () => {
    await setup({ recordHintView: vi.fn().mockRejectedValue(new Error('offline')) });
    fireEvent.click(hintButton());
    expect(screen.getByText(HINT)).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('does not count hints opened on a submitted attempt', async () => {
    window.localStorage.setItem('pm_attempts_v1', JSON.stringify({ 'u1:f1': { id: 'a1', status: 'COMPLETED' } }));
    const api = await setup({ getAttempt: vi.fn().mockResolvedValue(attempt({ status: 'COMPLETED' })) });
    fireEvent.click(hintButton());
    expect(screen.getByText(HINT)).toBeVisible();
    expect(api.recordHintView).not.toHaveBeenCalled();
  });
});
