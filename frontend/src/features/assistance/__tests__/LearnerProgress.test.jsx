// US-22 learner progress filters. The API is a test double.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import LearnerProgress from '../LearnerProgress.jsx';

const unfinished = {
  attemptId: 'a1', learnerName: 'Alex', learnerCode: 'aaa111', formId: 'f1', formTitle: 'Housing application', status: 'IN_PROGRESS',
  validationErrorCount: 0, hintViewCount: 4, startedAt: '2026-11-15T10:00:00Z', lastSavedAt: null,
};
const submitted = {
  attemptId: 'a2', learnerName: 'Alex', learnerCode: 'aaa111', formId: 'f2', formTitle: 'Course registration', status: 'COMPLETED',
  validationErrorCount: 3, hintViewCount: 1, startedAt: '2026-11-14T10:00:00Z', lastSavedAt: '2026-11-14T10:20:00Z',
};

function setup({ query = {}, listProgress } = {}) {
  const api = listProgress ?? vi.fn((filters) => Promise.resolve(Object.keys(filters).length ? [submitted] : [unfinished, submitted]));
  const onQueryChange = vi.fn();
  render(<LearnerProgress query={query} onQueryChange={onQueryChange} listProgress={api} />);
  return { api, onQueryChange };
}

describe('US-22 learner progress', () => {
  it('AC-02: shows each attempt with the measures used to find learners', async () => {
    setup();
    const row = (await screen.findByText('Course registration', { selector: 'td' })).closest('tr');
    expect(within(row).getByText('Alex')).toBeVisible();
    expect(within(row).getByText('Code aaa111')).toBeVisible();
    expect(within(row).getByText('Submitted')).toBeVisible();
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent).slice(3, 5)).toEqual(['3', '1']);
    expect(within(screen.getByText('Housing application', { selector: 'td' }).closest('tr')).getByText('Not saved yet')).toBeVisible();
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Learner', 'Practice form', 'Attempt', 'Errors', 'Hint views', 'Last saved']);
  });

  it('AC-01: choosing a filter asks for it through the address', async () => {
    const { onQueryChange } = setup();
    await screen.findByText('Course registration', { selector: 'td' });
    fireEvent.click(screen.getByLabelText('Repeated errors (2 or more)'));
    expect(onQueryChange).toHaveBeenLastCalledWith({ minErrors: '2' });
    fireEvent.click(screen.getByLabelText('Unfinished attempts'));
    expect(onQueryChange).toHaveBeenLastCalledWith({ incomplete: 'true' });
    fireEvent.click(screen.getByLabelText('Frequent hint use (3 or more)'));
    expect(onQueryChange).toHaveBeenLastCalledWith({ minHints: '3' });
    fireEvent.change(screen.getByLabelText('Practice form'), { target: { value: 'f2' } });
    expect(onQueryChange).toHaveBeenLastCalledWith({ formId: 'f2' });
  });

  it('AC-01: filters in the address are sent to the API and shown as selected', async () => {
    const { api, onQueryChange } = setup({ query: { minErrors: '2', incomplete: 'true', page: '9' } });
    await waitFor(() => expect(api).toHaveBeenCalledWith({ incomplete: 'true', minErrors: '2' }));
    expect(await screen.findByRole('status')).toHaveTextContent('1 attempt of 2');
    expect(screen.getByLabelText('Repeated errors (2 or more)')).toBeChecked();
    expect(screen.getByLabelText('Frequent hint use (3 or more)')).not.toBeChecked();
    expect(screen.queryByText('Housing application', { selector: 'td' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Repeated errors (2 or more)'));
    expect(onQueryChange).toHaveBeenLastCalledWith({ incomplete: 'true' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onQueryChange).toHaveBeenLastCalledWith({});
  });

  it('says when no attempts match and offers to clear the filters', async () => {
    const { onQueryChange } = setup({ query: { minHints: '3' }, listProgress: vi.fn((filters) => Promise.resolve(Object.keys(filters).length ? [] : [submitted])) });
    expect(await screen.findByText('No attempts match these filters')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onQueryChange).toHaveBeenCalledWith({});
  });

  it('AC-03: an instructor with no accepted requests sees no learners', async () => {
    setup({ listProgress: vi.fn().mockResolvedValue([]) });
    expect(await screen.findByText('No learner progress to show yet')).toBeVisible();
    expect(screen.getByText('Progress appears for learners once you accept their assistance request.')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('AC-03: a learner outside the instructor\'s scope is refused', async () => {
    setup({ query: { learnerCode: 'bbb222' }, listProgress: vi.fn((filters) => (filters.learnerCode ? Promise.reject(new ApiError(403, 'PROGRESS_FORBIDDEN', 'x')) : Promise.resolve([submitted]))) });
    expect(await screen.findByRole('alert')).toHaveTextContent('You can only see progress for learners whose request you accepted.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

    it('refreshes progress while keeping the selected filters', async () => {
    let refreshed = false;
    const api = vi.fn((filters) => Promise.resolve(
      Object.keys(filters).length
        ? [{ ...submitted, validationErrorCount: refreshed ? 7 : 3 }]
        : [unfinished, submitted]
    ));
    const { onQueryChange } = setup({
      query: { minErrors: '2', formId: 'f2' },
      listProgress: api,
    });

    const row = (await screen.findByText(
      'Course registration', { selector: 'td' }
    )).closest('tr');
    expect(within(row).getAllByRole('cell')[3]).toHaveTextContent('3');

    api.mockClear();
    refreshed = true;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      const updatedRow = screen.getByText(
        'Course registration', { selector: 'td' }
      ).closest('tr');
      expect(within(updatedRow).getAllByRole('cell')[3]).toHaveTextContent('7');
    });

    expect(api).toHaveBeenCalledWith({});
    expect(api).toHaveBeenCalledWith({ minErrors: '2', formId: 'f2' });
    expect(screen.getByLabelText('Repeated errors (2 or more)')).toBeChecked();
    expect(screen.getByLabelText('Practice form')).toHaveValue('f2');
    expect(onQueryChange).not.toHaveBeenCalled();
  });


    it('retries a failed request and shows progress', async () => {
    let failed = true;
    const api = vi.fn((filters) => {
      if (!Object.keys(filters).length) {
        return Promise.resolve([unfinished, submitted]);
      }
      return failed
        ? Promise.reject(new Error('Network error'))
        : Promise.resolve([submitted]);
    });

    const { onQueryChange } = setup({
      query: { minErrors: '2' },
      listProgress: api,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Learner progress could not be loaded. Please try again.'
    );

    api.mockClear();
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(
      'Course registration', { selector: 'td' }
    )).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledWith({ minErrors: '2' });
    expect(onQueryChange).not.toHaveBeenCalled();
  });
});
