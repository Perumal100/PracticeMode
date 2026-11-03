// US-04, US-10, US-16 and US-17 reviewer screens. The API is a test double.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import ReviewDetail, { describeRules } from '../ReviewDetail.jsx';
import ReviewQueue from '../ReviewQueue.jsx';

const pending = {
  id: 'f1', title: 'Job Application Form', status: 'AWAITING_REVIEW', source_url: 'https://example.test/apply',
  source_available: true, categories: [], created_at: '2026-11-03T09:00:00Z', updated_at: '2026-11-03T09:00:00Z', decision: null,
  fields: [
    { id: 'a', position: 1, label: 'First Name', input_type: 'text', required: true, validation: { minLength: 2, maxLength: 50 } },
    { id: 'b', position: 2, label: 'Highest Education', input_type: 'select', required: true, validation: { allowedValues: ['High School', 'PhD'] } },
  ],
};

describe('ReviewQueue', () => {
  it('US-04 AC-01 / US-16: lists pending forms and new-form notifications', async () => {
    const onOpen = vi.fn();
    const api = {
      listReviewForms: vi.fn().mockResolvedValue([{ ...pending, field_count: 2 }]),
      listNotifications: vi.fn().mockResolvedValue([{ id: 'n1', form_id: 'f1', form_title: 'Job Application Form', created_at: pending.created_at, is_read: false }]),
    };
    render(<ReviewQueue onOpen={onOpen} api={api} />);
    const notices = await screen.findByRole('status', { name: '1 new form awaiting review' });
    expect(api.listReviewForms).toHaveBeenCalledWith('AWAITING_REVIEW');
    fireEvent.click(await screen.findByRole('button', { name: 'Inspect Job Application Form' }));
    expect(onOpen).toHaveBeenCalledWith('f1');
    fireEvent.click(within(notices).getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('US-04 AC-03: a non-reviewer sees a refusal and no form data', async () => {
    const api = { listReviewForms: vi.fn().mockRejectedValue(new ApiError(403, null, 'x')), listNotifications: vi.fn().mockRejectedValue(new ApiError(403, null, 'x')) };
    render(<ReviewQueue onOpen={() => {}} api={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Only Form Reviewers');
    expect(screen.queryByText('Job Application Form')).not.toBeInTheDocument();
  });
});

describe('ReviewDetail', () => {
  const setup = (overrides = {}) => {
    const api = { getReviewForm: vi.fn().mockResolvedValue(pending), decideForm: vi.fn(), updateFormMetadata: vi.fn(), ...overrides };
    render(<ReviewDetail formId="f1" onBack={() => {}} api={api} />);
    return api;
  };

  it('US-04 AC-02 / US-10 AC-01: shows the source link and every field with type, required flag and rules', async () => {
    setup();
    expect(await screen.findByRole('link', { name: 'https://example.test/apply' })).toHaveAttribute('href', 'https://example.test/apply');
    expect(screen.getByText('First Name')).toBeInTheDocument();
    expect(screen.getByText('2–50 characters')).toBeInTheDocument();
    expect(screen.getByText('Options: High School, PhD')).toBeInTheDocument();
  });

  it('US-10 AC-03: an unreachable source is flagged, not treated as verified', async () => {
    setup({ getReviewForm: vi.fn().mockResolvedValue({ ...pending, source_available: false }) });
    expect(await screen.findByText(/could not reach this source/)).toBeInTheDocument();
  });

  it('US-17 AC-01: approving records the decision', async () => {
    const approved = { ...pending, status: 'APPROVED', decision: { outcome: 'APPROVED', reviewer: 'reviewer', rejection_reason: '', decided_at: '2026-11-03T10:00:00Z' } };
    const api = setup({ decideForm: vi.fn().mockResolvedValue(approved) });
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(api.decideForm).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve form' }));
    await waitFor(() => expect(api.decideForm).toHaveBeenCalledWith('f1', 'APPROVE', ''));
    expect(screen.getByText(/Approved by reviewer/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it('the reviewer previews the form as learners see it and checks sample answers without saving', async () => {
    const checkPreviewAnswers = vi.fn()
      .mockResolvedValueOnce({ validationFeedback: [
        { fieldId: 'a', ruleType: 'LENGTH', errorMessage: 'Use at least 2 characters.' },
        { fieldId: 'b', ruleType: 'REQUIRED', errorMessage: 'This field is required.' },
      ] })
      .mockResolvedValueOnce({ validationFeedback: [] });
    const api = setup({ checkPreviewAnswers, updateField: vi.fn() });
    fireEvent.click(await screen.findByRole('button', { name: 'Preview form' }));
    const dialog = await screen.findByRole('dialog', { name: /Preview: Job Application Form/ });
    fireEvent.change(within(dialog).getByLabelText(/First Name/), { target: { value: 'A' } });
    expect(within(dialog).getByRole('option', { name: 'PhD' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check answers' }));
    await waitFor(() => expect(checkPreviewAnswers).toHaveBeenCalledWith('f1', { a: 'A' }));
    expect(await within(dialog).findByText('2 answers need attention. A learner would see the same messages.')).toBeInTheDocument();
    expect(within(dialog).getByText('Use at least 2 characters.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/First Name/)).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(within(dialog).getByLabelText(/First Name/), { target: { value: 'Alex' } });
    fireEvent.change(within(dialog).getByLabelText(/Highest Education/), { target: { value: 'PhD' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check answers' }));
    expect(await within(dialog).findByText('No problems found. These answers would pass.')).toBeInTheDocument();
    expect(checkPreviewAnswers).toHaveBeenLastCalledWith('f1', { a: 'Alex', b: 'PhD' });
    expect(api.updateField).not.toHaveBeenCalled();
  });

  it('an approved form is revised as a pending copy; learners keep the current version until it is approved', async () => {
    const approved = { ...pending, status: 'APPROVED', open_revision: null, decision: { outcome: 'APPROVED', reviewer: 'reviewer', rejection_reason: '', decided_at: '2026-11-03T10:00:00Z' } };
    const onOpenForm = vi.fn();
    const reviseForm = vi.fn().mockResolvedValue({ ...pending, id: 'f2', revision_of: 'f1' });
    const { unmount } = render(<ReviewDetail formId="f1" onBack={() => {}} onOpenForm={onOpenForm} api={{ getReviewForm: vi.fn().mockResolvedValue(approved), reviseForm }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revise form' }));
    expect(reviseForm).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Start revision' }));
    await waitFor(() => expect(onOpenForm).toHaveBeenCalledWith('f2'));
    unmount();

    // The revision explains itself, links back, and says what approving does.
    const { unmount: unmount2 } = render(<ReviewDetail formId="f2" onBack={() => {}} onOpenForm={onOpenForm} api={{ getReviewForm: vi.fn().mockResolvedValue({ ...pending, id: 'f2', revision_of: 'f1' }) }} />);
    expect(await screen.findByText('This is a revision of a published form')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View current version/ }));
    expect(onOpenForm).toHaveBeenLastCalledWith('f1');
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/instead of the current one/)).toBeInTheDocument();
    unmount2();

    // While a revision is pending, the original opens it instead of starting another.
    render(<ReviewDetail formId="f1" onBack={() => {}} onOpenForm={onOpenForm} api={{ getReviewForm: vi.fn().mockResolvedValue({ ...approved, open_revision: 'f2' }) }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open revision' }));
    expect(onOpenForm).toHaveBeenLastCalledWith('f2');
    expect(screen.queryByRole('button', { name: 'Revise form' })).not.toBeInTheDocument();
  });

  it('a replaced version says so and links to the newer one', async () => {
    const onOpenForm = vi.fn();
    render(<ReviewDetail formId="f1" onBack={() => {}} onOpenForm={onOpenForm} api={{ getReviewForm: vi.fn().mockResolvedValue({ ...pending, status: 'SUPERSEDED', replaced_by: 'f2' }) }} />);
    expect(await screen.findByText('Replaced by a newer version')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revise form' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Open newer version/ }));
    expect(onOpenForm).toHaveBeenCalledWith('f2');
  });

  it('an approved form links to its practice insights; a pending one does not', async () => {
    const onInsights = vi.fn();
    const approved = { ...pending, status: 'APPROVED', decision: { outcome: 'APPROVED', reviewer: 'reviewer', rejection_reason: '', decided_at: '2026-11-03T10:00:00Z' } };
    const { unmount } = render(<ReviewDetail formId="f1" onBack={() => {}} onInsights={onInsights} api={{ getReviewForm: vi.fn().mockResolvedValue(approved) }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Practice insights' }));
    expect(onInsights).toHaveBeenCalledWith('f1');
    unmount();
    render(<ReviewDetail formId="f1" onBack={() => {}} onInsights={onInsights} api={{ getReviewForm: vi.fn().mockResolvedValue(pending) }} />);
    expect(await screen.findByText('First Name')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Practice insights' })).not.toBeInTheDocument();
  });

  it('US-17 AC-02: rejecting needs a reason', async () => {
    const api = setup({ decideForm: vi.fn().mockResolvedValue({ ...pending, status: 'REJECTED' }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give a reason');
    expect(api.decideForm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Rejection reason'), { target: { value: 'Date field extracted as text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Date field extracted as text');
    fireEvent.click(screen.getByRole('button', { name: 'Reject form' }));
    await waitFor(() => expect(api.decideForm).toHaveBeenCalledWith('f1', 'REJECT', 'Date field extracted as text'));
  });

  it('US-17 AC-03: a refused or repeated decision is explained', async () => {
    setup({ decideForm: vi.fn().mockRejectedValue(new ApiError(409, null, 'x')) });
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve form' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already been reviewed');
  });

  it('saves categories for learner search on a pending form', async () => {
    const api = setup({ updateFormMetadata: vi.fn().mockResolvedValue({ ...pending, categories: ['Employment', 'Jobs'] }) });
    fireEvent.change(await screen.findByLabelText('Categories'), { target: { value: 'Employment, Jobs, employment,' } });
    expect(screen.getByRole('button', { name: 'Remove Jobs' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save categories' }));
    await waitFor(() => expect(api.updateFormMetadata).toHaveBeenCalledWith('f1', { categories: ['Employment', 'Jobs'] }));
  });

  it('describeRules shows unknown rules instead of hiding them', () => {
    expect(describeRules({ pattern: '\\d+' })).toBe('pattern: "\\\\d+"');
    expect(describeRules({})).toBe('None');
  });
});
