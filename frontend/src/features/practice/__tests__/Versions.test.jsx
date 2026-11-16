// Form versions on the practice page. The API is a test double.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import PracticeForm from '../PracticeForm.jsx';

const user = { id: 'u1', displayName: 'Maya', role: 'LEARNER' };
const fields = [{ id: 'name', position: 1, label: 'Full name', input_type: 'text', required: true, validation: {} }];
const current = { id: 'f2', title: 'Warehouse application', status: 'APPROVED', version: 2, replaced_by: null, categories: [], fields };
const versions = [
  { id: 'f2', version: 2, title: 'Warehouse application', status: 'APPROVED', publishedAt: '2026-11-15T10:00:00Z', fieldCount: 1, current: true,
    changes: { added: ['Email'], removed: ['Fax number'], changed: [{ label: 'Website', details: ['now required'] }] } },
  { id: 'f1', version: 1, title: 'Warehouse application', status: 'SUPERSEDED', publishedAt: '2026-11-01T10:00:00Z', fieldCount: 3, current: false, changes: null },
];
const attempt = (overrides = {}) => ({ id: 'a1', formId: 'f1', status: 'COMPLETED', answers: [{ fieldId: 'name', value: 'Maya', savedAt: 'x' }], validationFeedback: [], ...overrides });

function setup(form, overrides = {}) {
  const api = {
    getForm: vi.fn().mockResolvedValue(form),
    getFormVersions: vi.fn().mockResolvedValue(versions),
    listMyAttempts: vi.fn().mockResolvedValue([]),
    getAttempt: vi.fn().mockResolvedValue(attempt()),
    saveAnswer: vi.fn(),
    debounceMs: 0,
    ...overrides,
  };
  const onOpenForm = vi.fn();
  render(<PracticeForm formId={form.id} user={user} onBack={() => {}} onOpenForm={onOpenForm} api={api} />);
  return { api, onOpenForm };
}

beforeEach(() => window.localStorage.clear());

describe('form versions', () => {
  it('shows the version and, on request, what changed in each version', async () => {
    const { api } = setup(current);
    expect(await screen.findByText('1 question, 1 required, version 2')).toBeVisible();
    expect(api.getFormVersions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Version history'));
    expect(await screen.findByText('Email')).toBeVisible();
    expect(screen.getByText('Fax number')).toBeVisible();
    expect(screen.getByText('Website (now required)')).toBeVisible();
    expect(screen.getByText('The first published version.')).toBeVisible();
    expect(screen.getByText('Current')).toBeVisible();
  });

  it('a first version shows no history', async () => {
    setup({ ...current, version: 1 });
    await screen.findByText('1 question, 1 required, version 1');
    expect(screen.queryByText('Version history')).not.toBeInTheDocument();
  });

  it('an older version the learner practised opens read-only with a way to the current one', async () => {
    const old = { ...current, id: 'f1', status: 'SUPERSEDED', version: 1, replaced_by: 'f2' };
    const { onOpenForm } = setup(old, { listMyAttempts: vi.fn().mockResolvedValue([{ id: 'a1', formId: 'f1', status: 'COMPLETED' }]) });
    expect(await screen.findByText(/This is version 1, which you practised/)).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText(/Full name/)).toHaveValue('Maya'));
    expect(screen.queryByRole('button', { name: /Start a new attempt/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open the current version' }));
    expect(onOpenForm).toHaveBeenCalledWith('f2');
  });

  it('a removed form keeps the learner\'s answers but takes no new ones', async () => {
    const removed = { ...current, id: 'f1', status: 'WITHDRAWN', version: 1 };
    const { api } = setup(removed, {
      listMyAttempts: vi.fn().mockResolvedValue([{ id: 'a1', formId: 'f1', status: 'IN_PROGRESS' }]),
      getAttempt: vi.fn().mockResolvedValue(attempt({ status: 'IN_PROGRESS' })),
    });
    expect(await screen.findByText(/A Form Reviewer removed this form/)).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText(/Full name/)).toHaveValue('Maya'));
    const input = screen.getByLabelText(/Full name/);
    expect(input).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Submit attempt' })).not.toBeInTheDocument();
    expect(screen.queryByText('Help from an instructor')).not.toBeInTheDocument();
    expect(api.saveAnswer).not.toHaveBeenCalled();
  });

  it('a removed form the learner never practised explains that it is gone', async () => {
    const api = { getForm: vi.fn().mockRejectedValue(new ApiError(410, 'FORM_REMOVED', 'x', { error: 'FORM_REMOVED' })), listMyAttempts: vi.fn().mockResolvedValue([]) };
    render(<PracticeForm formId="f1" user={user} onBack={() => {}} api={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('A Form Reviewer removed this form');
  });
});
