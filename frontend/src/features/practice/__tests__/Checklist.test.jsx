// US-18: the preparation checklist. The API is a test double.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PracticeForm from '../PracticeForm.jsx';

const user = { id: 'u1', displayName: 'Alex', role: 'LEARNER' };
const baseForm = {
  id: 'f1', title: 'Fictional housing application', status: 'APPROVED', categories: ['Housing'],
  fields: [{ id: 'name', position: 1, label: 'Full name', input_type: 'text', required: true, validation: {} }],
};
const checklist = [
  { position: 1, description: 'A photo ID, such as a passport', fictional_example: 'Sample licence number D000-0000-0000' },
  { position: 2, description: 'The date you would like to move', fictional_example: '' },
];
const attempt = { id: 'a1', formId: 'f1', status: 'IN_PROGRESS', answers: [], validationFeedback: [] };

function setup(form) {
  const api = {
    getForm: vi.fn().mockResolvedValue(form),
    startAttempt: vi.fn().mockResolvedValue(attempt),
    getAttempt: vi.fn().mockResolvedValue(attempt),
    saveAnswer: vi.fn(),
    debounceMs: 0,
  };
  render(<PracticeForm formId="f1" user={user} onBack={() => {}} api={api} />);
  return api;
}

beforeEach(() => window.localStorage.clear());

describe('US-18 preparation checklist', () => {
  it('AC-01: lists what to have ready before the learner starts', async () => {
    setup({ ...baseForm, checklist });
    expect(await screen.findByRole('heading', { name: 'Before you start' })).toBeVisible();
    const items = screen.getAllByRole('listitem').filter((li) => /photo ID|like to move/.test(li.textContent));
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('A photo ID, such as a passport'),
      expect.stringContaining('The date you would like to move'),
    ]);
  });

  it('AC-02: every example is marked as fictional', async () => {
    setup({ ...baseForm, checklist });
    const example = (await screen.findByText('Sample licence number D000-0000-0000')).closest('p');
    expect(within(example).getByText('Fictional example')).toBeVisible();
    expect(screen.getByText(/Every example is made up for practice; never enter your real details here\./)).toBeVisible();
    // An item without an example gets no label and no invented example.
    expect(screen.getAllByText('Fictional example')).toHaveLength(1);
  });

  it('AC-03: a form with no checklist says so and invents nothing', async () => {
    setup({ ...baseForm, checklist: [] });
    expect(await screen.findByText('No preparation checklist is available for this form.')).toBeVisible();
    expect(screen.queryByText('Fictional example')).not.toBeInTheDocument();
  });

  it('keeps the checklist within reach while answering', async () => {
    setup({ ...baseForm, checklist });
    fireEvent.click(await screen.findByRole('button', { name: 'Start practice' }));
    await screen.findByLabelText(/Full name/);
    expect(screen.queryByRole('heading', { name: 'Before you start' })).not.toBeInTheDocument();
    const disclosure = screen.getByText('Preparation checklist').closest('details');
    expect(within(disclosure).getByText('A photo ID, such as a passport')).toBeInTheDocument();
    expect(within(disclosure).getByText('Fictional example')).toBeInTheDocument();
  });
});
