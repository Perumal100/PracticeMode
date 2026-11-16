// Instructor sign-up, reviewer management, forms and change requests. The API is a test double.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import MySessions from '../../assistance/MySessions.jsx';
import ChangeRequests from '../ChangeRequests.jsx';
import InstructorForms from '../InstructorForms.jsx';
import InstructorSignUp from '../InstructorSignUp.jsx';
import ManageInstructors from '../ManageInstructors.jsx';

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('InstructorSignUp', () => {
  function fill() {
    type('Full name', 'Ines Ortega');
    type('Username', 'ines_o');
    type('Default meeting link', 'https://meet.example.test/ines');
    type('Password', 'teach-forms-2026');
    type('Confirm password', 'teach-forms-2026');
  }

  it('sends the details and explains that a reviewer approves the account', async () => {
    const signUp = vi.fn().mockResolvedValue({ status: 'PENDING' });
    render(<InstructorSignUp onSignIn={() => {}} signUp={signUp} />);
    fill();
    type('Organisation (optional)', 'Springfield library');
    fireEvent.click(screen.getByRole('button', { name: 'Request account' }));
    await waitFor(() => expect(signUp).toHaveBeenCalledWith({
      fullName: 'Ines Ortega', username: 'ines_o', meetingLink: 'https://meet.example.test/ines', organisation: 'Springfield library', password: 'teach-forms-2026',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('once your account is approved');
  });

  it('checks the details first, including a real meeting link', () => {
    const signUp = vi.fn();
    render(<InstructorSignUp onSignIn={() => {}} signUp={signUp} />);
    fill();
    type('Default meeting link', 'zoom room 5');
    fireEvent.click(screen.getByRole('button', { name: 'Request account' }));
    expect(screen.getByText('Enter a full link, starting with https://')).toBeVisible();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('shows a taken username on its field', async () => {
    render(<InstructorSignUp onSignIn={() => {}} signUp={vi.fn().mockRejectedValue(new ApiError(409, 'USERNAME_TAKEN', 'x'))} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Request account' }));
    expect(await screen.findByText('That username is taken. Choose another one.')).toBeVisible();
  });
});

const instructors = [
  { id: '7', username: 'ines_o', fullName: 'Ines Ortega', organisation: 'Library', meetingLink: 'https://meet.example.test/ines', status: 'PENDING', createdAt: '2026-11-16T10:00:00Z', decisionNote: '', sessionCount: 0 },
  { id: '8', username: 'omar_h', fullName: 'Omar Haddad', organisation: '', meetingLink: 'https://meet.example.test/omar', status: 'ACTIVE', createdAt: '2026-11-10T10:00:00Z', decisionNote: '', sessionCount: 4 },
];

describe('ManageInstructors', () => {
  function setup(status, overrides = {}) {
    const api = {
      listInstructors: vi.fn().mockResolvedValue(instructors),
      instructorAction: vi.fn().mockResolvedValue({}),
      addInstructor: vi.fn().mockResolvedValue({ fullName: 'Lee Park' }),
      ...overrides,
    };
    render(<ManageInstructors status={status} onStatusChange={() => {}} api={api} />);
    return api;
  }

  it('approves a waiting sign-up', async () => {
    const api = setup('PENDING');
    fireEvent.click(await screen.findByRole('button', { name: 'Approve Ines Ortega' }));
    await waitFor(() => expect(api.instructorAction).toHaveBeenCalledWith('7', 'approve', ''));
  });

  it('removes an active instructor only after confirmation, with a note', async () => {
    const api = setup('ACTIVE');
    expect(await screen.findByText('Omar Haddad')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Omar Haddad' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Sessions they had booked go back to the waiting queue');
    fireEvent.change(within(dialog).getByLabelText(/Note/), { target: { value: 'Left the programme.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.instructorAction).toHaveBeenCalledWith('8', 'remove', 'Left the programme.'));
  });

  it('adds an instructor directly', async () => {
    const api = setup('ACTIVE');
    fireEvent.click(await screen.findByRole('button', { name: 'Add instructor' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Full name'), { target: { value: ' Lee Park ' } });
    fireEvent.change(within(dialog).getByLabelText('Username'), { target: { value: 'lee_p' } });
    fireEvent.change(within(dialog).getByLabelText('Default meeting link'), { target: { value: 'https://meet.example.test/lee' } });
    fireEvent.change(within(dialog).getByLabelText('First password'), { target: { value: 'teach-forms-2026' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add instructor' }));
    await waitFor(() => expect(api.addInstructor).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Lee Park', username: 'lee_p' })));
  });

  it('refuses a caller who is not a reviewer', async () => {
    setup('PENDING', { listInstructors: vi.fn().mockRejectedValue(new ApiError(403, null, 'x')) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Only Form Reviewers can manage instructors.');
  });
});

const form = { id: 'f1', title: 'Warehouse application', fieldCount: 2, fields: [
  { id: 'a', position: 1, label: 'Full name', input_type: 'text', required: true },
  { id: 'b', position: 2, label: 'Start date', input_type: 'date', required: false },
] };

describe('InstructorForms', () => {
  it('reports a problem with one question and lists the answer', async () => {
    const api = {
      listPublishedForms: vi.fn().mockResolvedValue([form]),
      getPublishedForm: vi.fn().mockResolvedValue(form),
      listMyChangeRequests: vi.fn().mockResolvedValue([{ id: 'c1', formTitle: 'Warehouse application', fieldLabel: 'Full name', description: 'Middle name missing.', status: 'RESOLVED', response: 'Fixed in version 2.', resolvedBy: 'Rita', createdAt: '2026-11-16T10:00:00Z' }]),
      createChangeRequest: vi.fn().mockResolvedValue({ id: 'c2' }),
    };
    render(<InstructorForms api={api} />);
    expect(await screen.findByText('Fixed in version 2.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open Warehouse application' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Report a problem with Start date' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Which question?')).toHaveValue('b');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Describe what is wrong');
    fireEvent.change(within(dialog).getByLabelText('What is wrong?'), { target: { value: ' This should be a date picker. ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    await waitFor(() => expect(api.createChangeRequest).toHaveBeenCalledWith({ formId: 'f1', fieldId: 'b', description: 'This should be a date picker.' }));
  });
});

describe('ChangeRequests (reviewer)', () => {
  const open = { id: 'c1', formId: 'f1', formTitle: 'Warehouse application', fieldLabel: 'Full name', description: 'Middle name missing.', status: 'OPEN', instructorName: 'Ines Ortega', createdAt: '2026-11-16T10:00:00Z' };

  it('answers an open request and opens its form', async () => {
    const api = { listChangeRequests: vi.fn().mockResolvedValue([open]), answerChangeRequest: vi.fn().mockResolvedValue({}) };
    const onOpenForm = vi.fn();
    render(<ChangeRequests onStatusChange={() => {}} onOpenForm={onOpenForm} api={api} />);
    expect(await screen.findByText('Middle name missing.')).toBeVisible();
    expect(screen.getByText(/From Ines Ortega/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open Warehouse application' }));
    expect(onOpenForm).toHaveBeenCalledWith('f1');
    fireEvent.click(screen.getByRole('button', { name: 'Mark as resolved' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Tell the instructor');
    fireEvent.change(screen.getByLabelText('Answer to the instructor'), { target: { value: 'Fixed in version 2.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as resolved' }));
    await waitFor(() => expect(api.answerChangeRequest).toHaveBeenCalledWith('c1', 'resolve', 'Fixed in version 2.'));
  });
});

describe('MySessions (learner)', () => {
  it('lists every session with its meeting link and history', async () => {
    const listMyRequests = vi.fn().mockResolvedValue([{
      requestId: 'r1', status: 'COMPLETED', formTitle: 'Housing application', requestedSlot: '2026-11-20T15:00:00Z', note: 'Help with dates',
      instructorName: 'Ines Ortega', meetingLink: 'https://meet.example.test/ines', meetingDetails: '',
      events: [{ action: 'REQUESTED', label: 'Requested', by: 'Maya', detail: '', at: '2026-11-16T10:00:00Z' },
               { action: 'COMPLETED', label: 'Marked as completed', by: 'Ines Ortega', detail: '', at: '2026-11-20T16:00:00Z' }],
    }]);
    render(<MySessions user={{ displayName: 'Maya' }} listMyRequests={listMyRequests} />);
    expect(await screen.findByRole('link', { name: /meet\.example\.test\/ines/ })).toHaveAttribute('href', 'https://meet.example.test/ines');
    expect(screen.getByText('Completed')).toBeVisible();
    fireEvent.click(screen.getByText('History'));
    expect(screen.getByText('Marked as completed')).toBeVisible();
    expect(screen.getByText('by you')).toBeVisible();
  });
});
