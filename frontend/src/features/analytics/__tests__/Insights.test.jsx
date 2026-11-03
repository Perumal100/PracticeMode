// Reviewer practice insights: counts only. The API is a test double.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import { niceMax } from '../ActivityChart.jsx';
import Insights, { FormInsights } from '../Insights.jsx';

const series = (days) => Array.from({ length: days }, (_, i) => ({
  date: `2026-10-${String(10 + i).padStart(2, '0')}`, started: i === days - 1 ? 5 : 0, submitted: i === days - 1 ? 4 : 0,
}));
const overview = (days = 14) => ({
  totals: { publishedForms: 2, awaitingReview: 1, learners: 7, attempts: 9, submitted: 6, cleanSubmissions: 2, completionRate: 0.6667 },
  activity: { days, series: series(days) },
  forms: [
    { id: 'f1', title: 'Housing application', status: 'APPROVED', categories: ['Housing'], learners: 7, attempts: 9, submitted: 6, cleanSubmissions: 2, completionRate: 0.6667, averageIssues: 1.5, lastPracticedAt: '2026-11-03T09:00:00Z' },
    { id: 'f2', title: 'Quiet form', status: 'APPROVED', categories: [], learners: 0, attempts: 0, submitted: 0, cleanSubmissions: 0, completionRate: null, averageIssues: null, lastPracticedAt: null },
  ],
});
const detail = {
  ...overview().forms[0], medianMinutesToSubmit: 7.4,
  fields: [
    { id: 'a', position: 1, label: 'Full name', input_type: 'text', required: true, submissionsWithIssue: 1, issueRate: 0.1667, rules: { REQUIRED: 1 } },
    { id: 'b', position: 2, label: 'LinkedIn profile', input_type: 'url', required: false, submissionsWithIssue: 3, issueRate: 0.5, rules: { FORMAT: 3 } },
    { id: 'c', position: 3, label: 'Email', input_type: 'email', required: true, submissionsWithIssue: 0, issueRate: 0, rules: {} },
  ],
};

describe('Insights', () => {
  it('shows totals, daily activity and per-form counts', async () => {
    const onOpen = vi.fn();
    const api = { getAnalytics: vi.fn((days) => Promise.resolve(overview(days))) };
    render(<Insights onOpen={onOpen} api={api} />);
    expect(await screen.findByText('Learners who practised')).toBeInTheDocument();
    expect(api.getAnalytics).toHaveBeenCalledWith(14);
    expect(await screen.findByText('7', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('67% of attempts')).toBeInTheDocument();
    const days = within(screen.getByRole('list', { name: 'Attempts started per day' })).getAllByRole('listitem');
    expect(days).toHaveLength(14);
    expect(days[13]).toHaveAccessibleName(/5 started, 4 submitted/);
    fireEvent.focus(days[13]);
    expect(screen.getByRole('status')).toHaveTextContent('Submitted4');
    fireEvent.click(screen.getByRole('button', { name: 'Housing application' }));
    expect(onOpen).toHaveBeenCalledWith('f1');
    expect(screen.getByText('Not yet')).toBeInTheDocument();
  });

  it('switches the activity range', async () => {
    const api = { getAnalytics: vi.fn((days) => Promise.resolve(overview(days))) };
    render(<Insights onOpen={() => {}} api={api} />);
    fireEvent.click(await screen.findByRole('tab', { name: '30 days' }));
    await waitFor(() => expect(api.getAnalytics).toHaveBeenLastCalledWith(30));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Attempts started per day' })).getAllByRole('listitem')).toHaveLength(30));
  });

  it('explains a refusal', async () => {
    render(<Insights onOpen={() => {}} api={{ getAnalytics: vi.fn().mockRejectedValue(new ApiError(403, null, 'x')) }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Only Form Reviewers');
  });
});

describe('FormInsights', () => {
  it('ranks questions by how often learners got them wrong', async () => {
    const onReview = vi.fn();
    render(<FormInsights formId="f1" onBack={() => {}} onReview={onReview} api={{ getFormAnalytics: vi.fn().mockResolvedValue(detail) }} />);
    const ranked = within(await screen.findByRole('list', { name: 'Questions with feedback' })).getAllByRole('listitem');
    expect(ranked.map((li) => li.textContent)).toEqual([expect.stringContaining('LinkedIn profile'), expect.stringContaining('Full name')]);
    expect(ranked[0]).toHaveTextContent('Wrong format · 3');
    expect(ranked[0]).toHaveTextContent('3 of 6 submissions');
    expect(screen.getByText(/No problems on 1 question/).parentElement).toHaveTextContent('Email');
    expect(screen.getByText('7 min')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open in review' }));
    expect(onReview).toHaveBeenCalledWith('f1');
  });

  it('has an empty state before anyone submits', async () => {
    const quiet = { ...overview().forms[1], medianMinutesToSubmit: null, fields: [] };
    render(<FormInsights formId="f2" onBack={() => {}} onReview={() => {}} api={{ getFormAnalytics: vi.fn().mockResolvedValue(quiet) }} />);
    expect(await screen.findByText('No submissions yet')).toBeInTheDocument();
  });
});

it('rounds the chart scale up to a readable number', () => {
  expect([0, 3, 5, 7, 12, 31, 140].map(niceMax)).toEqual([4, 4, 5, 10, 20, 50, 200]);
});
