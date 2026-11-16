// US-05 instructor screens. The API is a test double.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import RequestDetail from '../RequestDetail.jsx';
import RequestQueue from '../RequestQueue.jsx';

const request = (overrides = {}) => ({
  requestId: 'r1', status: 'REQUESTED', attemptId: 'a1', formId: 'f1', formTitle: 'Housing application',
  requestedSlot: '2026-11-20T15:00:00Z', note: 'I am stuck on the address question.', meetingDetails: '', instructorName: null,
  learnerName: 'Alex', learnerCode: 'aaa111', createdAt: '2026-11-16T12:00:00Z', ...overrides,
});
const mine = request({ requestId: 'r2', status: 'SCHEDULED', learnerCode: 'bbb222', formTitle: 'Course registration', instructorName: 'Ines Ortega', meetingDetails: 'Room 204.' });

describe('RequestQueue', () => {
  it('US-05 AC-01: lists waiting requests with the learner, the form and the requested time', async () => {
    const onOpen = vi.fn();
    render(<RequestQueue onOpen={onOpen} onStatusChange={() => {}} api={{ listRequests: vi.fn().mockResolvedValue([request(), mine]) }} />);
    const row = (await screen.findByText('Housing application')).closest('tr');
    expect(within(row).getByText('Alex')).toBeVisible();
    expect(within(row).getByText('Code aaa111')).toBeVisible();
    expect(within(row).getByText('I am stuck on the address question.')).toBeVisible();
    expect(screen.queryByText('Course registration')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Waiting/ })).toHaveTextContent('1');
    fireEvent.click(within(row).getByRole('button', { name: 'Open request from Alex aaa111' }));
    expect(onOpen).toHaveBeenCalledWith('r1');
  });

  it('US-05 AC-01: the accepted tab shows only the sessions booked with this instructor', async () => {
    const onStatusChange = vi.fn();
    render(<RequestQueue status="SCHEDULED" onOpen={() => {}} onStatusChange={onStatusChange} api={{ listRequests: vi.fn().mockResolvedValue([request(), mine]) }} />);
    expect(await screen.findByText('Course registration')).toBeVisible();
    expect(screen.queryByText('Housing application')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Waiting/ }));
    expect(onStatusChange).toHaveBeenCalledWith('REQUESTED');
  });

  it('explains an empty queue', async () => {
    render(<RequestQueue onOpen={() => {}} onStatusChange={() => {}} api={{ listRequests: vi.fn().mockResolvedValue([]) }} />);
    expect(await screen.findByRole('status')).toHaveTextContent('No requests are waiting');
  });

  it('US-05 AC-03: a caller who is not an instructor sees a refusal and no requests', async () => {
    render(<RequestQueue onOpen={() => {}} onStatusChange={() => {}} api={{ listRequests: vi.fn().mockRejectedValue(new ApiError(403, null, 'x')) }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Only instructors can open assistance requests.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('reloads the queue on Refresh', async () => {
    const listRequests = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([request()]);
    render(<RequestQueue onOpen={() => {}} onStatusChange={() => {}} api={{ listRequests }} />);
    await screen.findByText('No requests are waiting');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('Housing application')).toBeVisible();
  });
});

describe('RequestDetail', () => {
  function setup(overrides = {}) {
    const api = {
      getRequest: vi.fn().mockResolvedValue(request()),
      scheduleRequest: vi.fn().mockResolvedValue({ ...request(), status: 'SCHEDULED', instructorName: 'Ines Ortega', meetingDetails: 'Room 204.' }),
      completeRequest: vi.fn().mockResolvedValue({ ...mine, status: 'COMPLETED' }),
      cancelRequest: vi.fn().mockResolvedValue({ ...mine, status: 'CANCELLED' }),
      ...overrides,
    };
    const onBack = vi.fn();
    render(<RequestDetail requestId="r1" onBack={onBack} api={api} />);
    return { api, onBack };
  }

  it('US-05 AC-02: shows what the instructor needs to prepare', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Request from Alex' })).toBeVisible();
    expect(screen.getByText('Housing application')).toBeVisible();
    expect(screen.getByText('I am stuck on the address question.')).toBeVisible();
    expect(screen.getByText('Code aaa111')).toBeVisible();
    expect(screen.getByText('Requested')).toBeVisible();
  });

  it('accepting needs meeting details, then books the session', async () => {
    const { api } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept and schedule' }));
    expect(screen.getByText('Add the meeting details the learner needs.')).toBeVisible();
    expect(api.scheduleRequest).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Meeting details'), { target: { value: ' Room 204. ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept and schedule' }));
    await waitFor(() => expect(api.scheduleRequest).toHaveBeenCalledWith('r1', 'Room 204.'));
    expect(await screen.findByText('Scheduled')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mark as completed' })).toBeVisible();
  });

  it('US-05 AC-03: a request another instructor accepted is refused without its details', async () => {
    setup({ getRequest: vi.fn().mockRejectedValue(new ApiError(403, 'REQUEST_FORBIDDEN', 'x')) });
    expect(await screen.findByRole('alert')).toHaveTextContent('This request is not available to you.');
    expect(screen.queryByText('I am stuck on the address question.')).not.toBeInTheDocument();
  });

  it('losing the race to accept hides the request', async () => {
    setup({ scheduleRequest: vi.fn().mockRejectedValue(new ApiError(409, 'REQUEST_ALREADY_SCHEDULED', 'x')) });
    fireEvent.change(await screen.findByLabelText('Meeting details'), { target: { value: 'Room 204.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept and schedule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Another instructor has already accepted this request.');
    expect(screen.queryByText('I am stuck on the address question.')).not.toBeInTheDocument();
  });

  it('marks a booked session as completed', async () => {
    const { api } = setup({ getRequest: vi.fn().mockResolvedValue(mine) });
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as completed' }));
    await waitFor(() => expect(api.completeRequest).toHaveBeenCalledWith('r2'));
    expect(await screen.findByText('This session took place.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mark as completed' })).not.toBeInTheDocument();
  });

  it('cancels a booked session only after confirmation', async () => {
    const { api } = setup({ getRequest: vi.fn().mockResolvedValue(mine) });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel session' }));
    expect(api.cancelRequest).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel session' }));
    await waitFor(() => expect(api.cancelRequest).toHaveBeenCalledWith('r2'));
    expect(await screen.findByText('This session was cancelled.')).toBeVisible();
  });
});
