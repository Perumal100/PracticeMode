// US-03: requesting instructor help from the practice form. The API is a test double.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import AssistancePanel from '../AssistancePanel.jsx';

const NOW = new Date('2026-11-16T12:00:00').getTime();
const request = (overrides = {}) => ({
  requestId: 'r1', status: 'REQUESTED', attemptId: 'a1', formId: 'f1', formTitle: 'Housing application',
  requestedSlot: '2026-11-20T15:00:00Z', note: 'I am stuck on the address question.', meetingDetails: '', instructorName: null,
  createdAt: '2026-11-16T12:00:00Z', ...overrides,
});

function setup(overrides = {}) {
  const api = {
    listAttemptRequests: vi.fn().mockResolvedValue([]),
    createRequest: vi.fn().mockResolvedValue(request()),
    cancelRequest: vi.fn().mockResolvedValue(request({ status: 'CANCELLED' })),
    ...overrides,
  };
  render(<AssistancePanel attemptId="a1" api={api} now={() => NOW} />);
  return api;
}

async function openForm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Ask an instructor' }));
}
const fill = (slot, note) => {
  if (slot !== null) fireEvent.change(screen.getByLabelText('When would you like to meet?'), { target: { value: slot } });
  if (note !== null) fireEvent.change(screen.getByLabelText('What do you need help with?'), { target: { value: note } });
};
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

describe('US-03 ask an instructor', () => {
  it('AC-01: sends the session time and the note for this attempt', async () => {
    const api = setup();
    await openForm();
    fill('2026-11-20T10:00', '  I am stuck on the address question.  ');
    send();
    await waitFor(() => expect(api.createRequest).toHaveBeenCalledTimes(1));
    expect(api.createRequest).toHaveBeenCalledWith({
      attemptId: 'a1', requestedSlot: new Date('2026-11-20T10:00').toISOString(), note: 'I am stuck on the address question.',
    });
  });

  it('AC-02: confirms the request and shows its current status', async () => {
    setup();
    await openForm();
    fill('2026-11-20T10:00', 'I am stuck on the address question.');
    send();
    const status = await screen.findByRole('status');
    expect(within(status).getByText('Requested')).toBeVisible();
    expect(status).toHaveTextContent('Request sent. An instructor will reply with meeting details.');
    expect(screen.getByText('I am stuck on the address question.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
  });

  it('AC-02: shows the instructor and the meeting details once the request is scheduled', async () => {
    const api = setup({ listAttemptRequests: vi.fn()
      .mockResolvedValueOnce([request()])
      .mockResolvedValueOnce([request({ status: 'SCHEDULED', instructorName: 'Ines Ortega', meetingDetails: 'Room 204, bring your questions.' })]) });
    expect(await screen.findByText('Requested')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText('Scheduled')).toBeVisible();
    expect(screen.getByText('Ines Ortega')).toBeVisible();
    expect(screen.getByText('Room 204, bring your questions.')).toBeVisible();
    expect(api.listAttemptRequests).toHaveBeenCalledTimes(2);
  });

  it('AC-03: names the missing details and sends nothing', async () => {
    const api = setup();
    await openForm();
    send();
    expect(screen.getByText('Choose a date and time for the session.')).toBeVisible();
    expect(screen.getByText('Say what you need help with.')).toBeVisible();
    expect(screen.getByLabelText('When would you like to meet?')).toHaveAttribute('aria-invalid', 'true');
    fill('2026-11-10T10:00', '   ');
    send();
    expect(screen.getByText('Choose a time in the future.')).toBeVisible();
    expect(screen.getByText('Say what you need help with.')).toBeVisible();
    expect(api.createRequest).not.toHaveBeenCalled();
  });

  it('AC-03: shows what the server rejected and keeps the form open', async () => {
    setup({ createRequest: vi.fn().mockRejectedValue(new ApiError(400, null, 'Bad request', { requestedSlot: ['Choose a time in the future.'] })) });
    await openForm();
    fill('2026-11-20T10:00', 'Help with the address.');
    send();
    expect(await screen.findByText('Choose a time in the future.')).toBeVisible();
    expect(screen.getByLabelText('What do you need help with?')).toHaveValue('Help with the address.');
  });

  it('pressing Enter in the time field sends the request, not the surrounding attempt form', async () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    const api = { listAttemptRequests: vi.fn().mockResolvedValue([]), createRequest: vi.fn().mockResolvedValue(request()) };
    render(<form onSubmit={onSubmit}><AssistancePanel attemptId="a1" api={api} now={() => NOW} /></form>);
    await openForm();
    fill('2026-11-20T10:00', 'Help with the address.');
    const notPrevented = fireEvent.keyDown(screen.getByLabelText('When would you like to meet?'), { key: 'Enter' });
    expect(notPrevented).toBe(false);
    await waitFor(() => expect(api.createRequest).toHaveBeenCalledTimes(1));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cancels an open request only after confirmation, then lets the learner ask again', async () => {
    const api = setup({ listAttemptRequests: vi.fn().mockResolvedValue([request()]) });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel request' }));
    expect(api.cancelRequest).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(api.cancelRequest).toHaveBeenCalledWith('r1'));
    expect(await screen.findByText('Your last request was cancelled.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ask an instructor' })).toBeVisible();
  });

  it('offers a retry when the requests cannot be loaded', async () => {
    const api = setup({ listAttemptRequests: vi.fn().mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline')).mockResolvedValueOnce([]) });
    expect(await screen.findByText('Your help requests could not be loaded.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Ask an instructor' })).toBeVisible();
    expect(api.listAttemptRequests).toHaveBeenCalledTimes(2);
  });
});
