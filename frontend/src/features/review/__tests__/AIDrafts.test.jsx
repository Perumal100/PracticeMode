// AI drafts on the review page. The API is a test double; no AI service is called.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import ReviewDetail from '../ReviewDetail.jsx';

const languages = [{ code: 'en', name: 'English' }, { code: 'es', name: 'Español' }, { code: 'zh', name: '中文' }];
const base = {
  id: 'f1', title: 'Warehouse application', status: 'AWAITING_REVIEW', source_url: 'https://example.test/w', source_available: true,
  categories: [], created_at: '2026-11-16T09:00:00Z', updated_at: '2026-11-16T09:00:00Z', decision: null,
  revision_of: null, open_revision: null, replaced_by: null, guidance_languages: languages, checklist: [],
};
const plain = { ...base, fields: [{ id: 'name', position: 1, label: 'Full name', input_type: 'text', required: true, validation: {}, hints: [], translations: [] }] };
const drafted = {
  ...base,
  fields: [{
    id: 'name', position: 1, label: 'Full name', input_type: 'text', required: true, validation: {},
    hints: [{ language_code: 'en', text: 'Enter your first and last name.', ai_draft: true }],
    translations: [{ language_code: 'es', translated_label: 'Nombre completo', guidance_text: 'Escriba su nombre.', ai_draft: true }],
  }],
};

function setup(overrides = {}) {
  const api = {
    getReviewForm: vi.fn().mockResolvedValueOnce(plain).mockResolvedValue(drafted),
    draftGuidance: vi.fn().mockResolvedValue({ created: 1, skipped: 0, providers: ['Gemini'] }),
    approveDrafts: vi.fn().mockResolvedValue({ approved: 2 }),
    discardDrafts: vi.fn().mockResolvedValue({ discarded: 2 }),
    decideForm: vi.fn(),
    ...overrides,
  };
  render(<ReviewDetail formId="f1" onBack={() => {}} api={api} />);
  return api;
}

describe('AI drafts', () => {
  it('drafts hints, then shows them as drafts waiting for review', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Draft hints with AI' }));
    await waitFor(() => expect(api.draftGuidance).toHaveBeenCalledWith('f1', 'hints', undefined));
    expect(await screen.findByText(/2 AI drafts are waiting for your review/)).toBeVisible();
    expect(screen.getByText('Hint (AI draft); Translated: Español (AI draft)')).toBeVisible();
  });

  it('drafts translations into the languages chosen', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Draft translations with AI' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('English')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText('中文'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Draft translations' }));
    await waitFor(() => expect(api.draftGuidance).toHaveBeenCalledWith('f1', 'translations', ['es']));
  });

  it('the form cannot be approved while drafts wait; approving the drafts allows it', async () => {
    const api = setup({ getReviewForm: vi.fn().mockResolvedValueOnce(drafted).mockResolvedValue(plain) });
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Review the AI drafts first');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve all drafts' }));
    await waitFor(() => expect(api.approveDrafts).toHaveBeenCalledWith('f1'));
    await waitFor(() => expect(screen.queryByText(/waiting for your review/)).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alertdialog')).toBeVisible();
  });

  it('discards drafts only after confirmation', async () => {
    const api = setup({ getReviewForm: vi.fn().mockResolvedValueOnce(drafted).mockResolvedValue(plain) });
    fireEvent.click(await screen.findByRole('button', { name: 'Discard all drafts' }));
    expect(api.discardDrafts).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard drafts' }));
    await waitFor(() => expect(api.discardDrafts).toHaveBeenCalledWith('f1'));
  });

  it('the editor marks AI drafts and says saving approves them', async () => {
    setup({ getReviewForm: vi.fn().mockResolvedValue(drafted) });
    fireEvent.click(await screen.findByRole('button', { name: 'Hint and translations for Full name' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/saving approves what is here/)).toBeVisible();
    expect(within(dialog).getAllByText('AI draft')).toHaveLength(2);
    expect(within(dialog).getByLabelText(/^Hint/)).toHaveValue('Enter your first and last name.');
  });

  it('explains when the AI services fail or are not set up', async () => {
    setup({ draftGuidance: vi.fn().mockRejectedValue(new ApiError(502, 'AI_FAILED', 'The AI services could not draft this (Gemini: HTTP 503; Groq: HTTP 401).')) });
    fireEvent.click(await screen.findByRole('button', { name: 'Draft hints with AI' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gemini: HTTP 503; Groq: HTTP 401');
  });
});
