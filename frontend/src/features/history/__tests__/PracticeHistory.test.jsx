// The learner's practice history page. The API is a test double.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PracticeHistory from '../PracticeHistory.jsx';

const history = [
  { id: 'a2', formId: 'f1', formTitle: 'Housing application', formStatus: 'APPROVED', status: 'IN_PROGRESS', startedAt: '2026-11-16T10:00:00Z', answeredCount: 2, issueCount: null },
  { id: 'a1', formId: 'f0', formTitle: 'Housing application', formStatus: 'SUPERSEDED', status: 'COMPLETED', startedAt: '2026-11-10T10:00:00Z', answeredCount: 3, issueCount: 1 },
  { id: 'a0', formId: 'f9', formTitle: 'Course registration', formStatus: 'APPROVED', status: 'COMPLETED', startedAt: '2026-11-09T10:00:00Z', answeredCount: 3, issueCount: 0 },
];

describe('PracticeHistory', () => {
  it('lists every attempt with its progress or result and opens one', async () => {
    const onOpen = vi.fn();
    render(<PracticeHistory onOpen={onOpen} onBrowse={() => {}} listMyAttempts={vi.fn().mockResolvedValue(history)} />);
    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('2 answered so far')).toBeVisible();
    expect(within(rows[1]).getByText('1 answer needed attention')).toBeVisible();
    expect(within(rows[1]).getByText('An older version; the form has since been updated')).toBeVisible();
    expect(within(rows[2]).getByText('No problems found')).toBeVisible();
    fireEvent.click(within(rows[1]).getByRole('button', { name: /View result: Housing application/ }));
    expect(onOpen).toHaveBeenCalledWith(history[1]);
  });

  it('points a new learner to the catalog', async () => {
    const onBrowse = vi.fn();
    render(<PracticeHistory onOpen={() => {}} onBrowse={onBrowse} listMyAttempts={vi.fn().mockResolvedValue([])} />);
    expect(await screen.findByText('You have not practised a form yet')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Browse practice forms' }));
    expect(onBrowse).toHaveBeenCalled();
  });

  it('offers a retry when the history cannot be loaded', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(history);
    render(<PracticeHistory onOpen={() => {}} onBrowse={() => {}} listMyAttempts={list} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByRole('row')).toHaveLength(4);
  });
});
