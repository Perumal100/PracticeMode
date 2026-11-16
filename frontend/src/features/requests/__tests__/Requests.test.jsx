// US-15 form requests, learner and reviewer screens. The API is a test double.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import RequestForm from '../RequestForm.jsx';
import ReviewRequests from '../ReviewRequests.jsx';

const LINK = 'https://jobs.example.test/apply/warehouse';
const mine = (overrides = {}) => ({
  requestId: 'r1', url: LINK, note: '', createdAt: '2026-11-16T10:00:00Z', updatedAt: '2026-11-16T10:00:00Z',
  state: 'RECEIVED', message: 'A Form Reviewer will look at this link.', formId: null, ...overrides,
});

describe('RequestForm (learner)', () => {
  function setup(overrides = {}) {
    const api = { listMyRequests: vi.fn().mockResolvedValue([]), requestForm: vi.fn().mockResolvedValue(mine()), ...overrides };
    const onOpenForm = vi.fn();
    render(<RequestForm onOpenForm={onOpenForm} api={api} />);
    return { api, onOpenForm };
  }
  const fill = (url, note = '') => {
    fireEvent.change(screen.getByLabelText('Link to the form'), { target: { value: url } });
    fireEvent.change(screen.getByLabelText(/Anything a reviewer should know/), { target: { value: note } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
  };

  it('sends the link and note and lists the request as received', async () => {
    const { api } = setup();
    await screen.findByText('No requests yet');
    fill(`  ${LINK}  `, ' The address part confuses me. ');
    await waitFor(() => expect(api.requestForm).toHaveBeenCalledWith({ url: LINK, note: 'The address part confuses me.' }));
    expect(await screen.findByText('Received')).toBeVisible();
    expect(screen.getByText('Request sent. Its status is in the list.')).toBeVisible();
    expect(screen.getByLabelText('Link to the form')).toHaveValue('');
  });

  it('checks the link before sending it', async () => {
    const { api } = setup();
    await screen.findByText('No requests yet');
    for (const bad of ['', 'jobs.example.test', 'ftp://example.test/form']) {
      fill(bad);
      expect(screen.getByRole('alert')).toHaveTextContent('Paste a full link, starting with https://');
    }
    expect(api.requestForm).not.toHaveBeenCalled();
  });

  it('offers a form that is already in the catalog instead', async () => {
    const { onOpenForm } = setup({ requestForm: vi.fn().mockRejectedValue(new ApiError(409, 'FORM_ALREADY_AVAILABLE', 'x', { formId: 'f7' })) });
    await screen.findByText('No requests yet');
    fill(LINK);
    fireEvent.click(await screen.findByRole('button', { name: 'Practise it now' }));
    expect(onOpenForm).toHaveBeenCalledWith('f7');
  });

  it('shows each request\'s status, the reviewer\'s reason, and a way to practise when ready', async () => {
    const { onOpenForm } = setup({ listMyRequests: vi.fn().mockResolvedValue([
      mine({ requestId: 'r3', state: 'AVAILABLE', message: 'Ready to practise.', formId: 'f9' }),
      mine({ requestId: 'r2', state: 'NOT_AVAILABLE', message: 'This form is behind a CAPTCHA.' }),
      mine({ requestId: 'r1', state: 'AWAITING_REVIEW', message: 'A practice copy was made and is waiting for a Form Reviewer to check it.' }),
    ]) });
    expect(await screen.findByText('Ready to practise')).toBeVisible();
    expect(screen.getByText('This form is behind a CAPTCHA.')).toBeVisible();
    expect(screen.getByText('Being checked')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /Practise the form/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Practise the form/ }));
    expect(onOpenForm).toHaveBeenCalledWith('f9');
  });

  it('says when the same form was already requested', async () => {
    setup({ requestForm: vi.fn().mockRejectedValue(new ApiError(409, 'REQUEST_ALREADY_OPEN', 'x')) });
    await screen.findByText('No requests yet');
    fill(LINK);
    expect(await screen.findByRole('alert')).toHaveTextContent('You have already requested this form.');
  });
});

describe('ReviewRequests (Form Reviewer)', () => {
  const open = (overrides = {}) => ({
    requestId: 'r1', url: LINK, note: 'Applying next week.', status: 'OPEN', createdAt: '2026-11-16T10:00:00Z',
    declineReason: '', requestCount: 2, form: null, ...overrides,
  });

  function setup(overrides = {}) {
    const api = {
      listReviewRequests: vi.fn().mockResolvedValue([open(), open({ requestId: 'r2', url: `${LINK}/` })]),
      linkRequest: vi.fn().mockResolvedValue({ updated: 2 }),
      declineRequest: vi.fn().mockResolvedValue({ updated: 2 }),
      listReviewForms: vi.fn((status) => Promise.resolve(status === 'APPROVED' ? [{ id: 'f1', title: 'Warehouse application', status: 'APPROVED' }] : [])),
      ...overrides,
    };
    render(<ReviewRequests onStatusChange={() => {}} onOpenForm={() => {}} api={api} />);
    return api;
  }

  it('lists each requested page once with how many learners asked, without naming them', async () => {
    setup();
    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByRole('link', { name: /jobs\.example\.test/ })).toHaveAttribute('href', LINK);
    expect(within(rows[0]).getByRole('link', { name: /jobs\.example\.test/ })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(rows[0]).getByText('2')).toBeVisible();
    expect(within(rows[0]).getByText('Applying next week.')).toBeVisible();
  });

  it('links a request to a form', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Link' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Link' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose the form');
    fireEvent.change(await within(dialog).findByLabelText('Form'), { target: { value: 'f1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(api.linkRequest).toHaveBeenCalledWith('r1', 'f1'));
    await waitFor(() => expect(api.listReviewRequests).toHaveBeenCalledTimes(2));
  });

  it('declines only with a reason', async () => {
    const api = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Tell the learner why');
    expect(api.declineRequest).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'It needs a sign-in.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(api.declineRequest).toHaveBeenCalledWith('r1', 'It needs a sign-in.'));
  });

  it('refuses a caller who is not a reviewer', async () => {
    setup({ listReviewRequests: vi.fn().mockRejectedValue(new ApiError(403, null, 'x')) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Only Form Reviewers');
  });
});
