// Reviewers write hints, translations and the checklist. The API is a test double.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import ReviewDetail from '../ReviewDetail.jsx';

const languages = [{ code: 'en', name: 'English' }, { code: 'es', name: 'Español' }, { code: 'zh', name: '中文' }];
const form = (overrides = {}) => ({
  id: 'f1', title: 'Warehouse application', status: 'AWAITING_REVIEW', source_url: 'https://example.test/w', source_available: true,
  categories: [], created_at: '2026-11-16T09:00:00Z', updated_at: '2026-11-16T09:00:00Z', decision: null,
  revision_of: null, open_revision: null, replaced_by: null, guidance_languages: languages, checklist: [],
  fields: [
    { id: 'name', position: 1, label: 'Full name', input_type: 'text', required: true, validation: {}, hints: [], translations: [] },
    { id: 'email', position: 2, label: 'Email', input_type: 'email', required: false, validation: {},
      hints: [{ language_code: 'en', text: 'An address with an @ sign.' }], translations: [{ language_code: 'es', translated_label: 'Correo', guidance_text: '' }] },
  ],
  ...overrides,
});

function setup(data = form(), overrides = {}) {
  const api = {
    getReviewForm: vi.fn().mockResolvedValue(data),
    saveFieldGuidance: vi.fn((formId, fieldId, guidance) => Promise.resolve({ hint: guidance.hint, translations: guidance.translations })),
    saveChecklist: vi.fn((formId, items) => Promise.resolve(items.map((item, i) => ({ position: i + 1, ...item })))),
    ...overrides,
  };
  render(<ReviewDetail formId="f1" onBack={() => {}} api={api} />);
  return api;
}

describe('Reviewer guidance editing', () => {
  it('shows which guidance each question has', async () => {
    setup();
    expect(await screen.findByText('No hint or translations')).toBeVisible();
    expect(screen.getByText('Hint; Translated: Español')).toBeVisible();
  });

  it('writes a hint and a translation for a question; empty languages are left out', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Hint and translations for Full name' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Hint'), { target: { value: '  Your first and last name.  ' } });
    const spanish = within(dialog).getByText('Español').closest('div');
    fireEvent.change(within(spanish).getByLabelText('Translated label'), { target: { value: 'Nombre completo' } });
    fireEvent.change(within(spanish).getByLabelText('Guidance'), { target: { value: 'Su nombre y apellido.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save guidance' }));
    await waitFor(() => expect(api.saveFieldGuidance).toHaveBeenCalledWith('f1', 'name', {
      hint: 'Your first and last name.',
      translations: [{ language_code: 'es', translated_label: 'Nombre completo', guidance_text: 'Su nombre y apellido.' }],
    }));
    await waitFor(() => expect(screen.getAllByText('Hint; Translated: Español')).toHaveLength(2));
    expect(screen.queryByText('No hint or translations')).not.toBeInTheDocument();
  });

  it('opens with the guidance already written', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Hint and translations for Email' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Hint')).toHaveValue('An address with an @ sign.');
    expect(within(within(dialog).getByText('Español').closest('div')).getByLabelText('Translated label')).toHaveValue('Correo');
    expect(within(dialog).queryByText('English')).not.toBeInTheDocument();
  });

  it('keeps the dialog open with the reason when saving fails', async () => {
    setup(form(), { saveFieldGuidance: vi.fn().mockRejectedValue(new ApiError(409, 'GUIDANCE_LOCKED', 'x')) });
    fireEvent.click(await screen.findByRole('button', { name: 'Hint and translations for Full name' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save guidance' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This form can no longer be changed.');
  });

  it('guidance stays editable on an approved form, while its fields do not', async () => {
    setup(form({ status: 'APPROVED' }));
    expect(await screen.findByRole('button', { name: 'Hint and translations for Full name' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit Full name' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save checklist' })).toBeVisible();
  });

  it('a rejected form shows guidance read-only', async () => {
    setup(form({ status: 'REJECTED', checklist: [{ position: 1, description: 'A photo ID', fictional_example: '' }] }));
    expect(await screen.findByText('A photo ID')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Hint and translations/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save checklist' })).not.toBeInTheDocument();
  });

  it('writes the preparation checklist; every item needs a description', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save checklist' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Each item needs a description');
    fireEvent.change(screen.getByLabelText('What to have ready'), { target: { value: 'A photo ID' } });
    fireEvent.change(screen.getByLabelText('Fictional example (optional)'), { target: { value: 'Sample licence D000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save checklist' }));
    await waitFor(() => expect(api.saveChecklist).toHaveBeenCalledWith('f1', [{ description: 'A photo ID', fictional_example: 'Sample licence D000' }]));
  });
});

describe('Checklist confirmation', () => {
  it('confirms the save and keeps the items on screen', async () => {
    const api = {
      getReviewForm: vi.fn().mockResolvedValue(form()),
      saveChecklist: vi.fn((formId, items) => Promise.resolve(items.map((item, i) => ({ position: i + 1, ...item })))),
    };
    render(<ReviewDetail formId="f1" onBack={() => {}} api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('What to have ready'), { target: { value: 'A photo ID' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save checklist' }));
    expect(await screen.findByText('Checklist saved.')).toBeVisible();
    expect(screen.getByLabelText('What to have ready')).toHaveValue('A photo ID');
  });
});
