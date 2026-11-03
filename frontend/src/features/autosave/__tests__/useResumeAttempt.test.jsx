// Frontend unit tests for US-08 AC-02. The API is a test double.
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import { useResumeAttempt } from '../useResumeAttempt.js';

describe('useResumeAttempt', () => {
  it('AC-02: restores the most recently saved answers', async () => {
    const getAttempt = vi.fn().mockResolvedValue({
      id: 42,
      status: 'IN_PROGRESS',
      answers: [
        { fieldId: 7, value: 'Alex Morgan', updatedAt: '2026-10-19T18:24:00Z' },
        { fieldId: 9, value: 'alex@example.com', updatedAt: '2026-10-19T18:25:00Z' },
      ],
    });
    const { result } = renderHook(() => useResumeAttempt(42, { getAttempt }));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(getAttempt).toHaveBeenCalledWith(42);
    expect(result.current.savedAnswers).toEqual({ 7: 'Alex Morgan', 9: 'alex@example.com' });
    expect(result.current.isCompleted).toBe(false);
  });

  it('returns no answers for an attempt with nothing saved yet', async () => {
    const getAttempt = vi.fn().mockResolvedValue({ id: 42, status: 'IN_PROGRESS', answers: [] });
    const { result } = renderHook(() => useResumeAttempt(42, { getAttempt }));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.savedAnswers).toEqual({});
  });

  it('flags a completed attempt so autosave can be turned off', async () => {
    const getAttempt = vi.fn().mockResolvedValue({ id: 42, status: 'COMPLETED', answers: [] });
    const { result } = renderHook(() => useResumeAttempt(42, { getAttempt }));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isCompleted).toBe(true);
  });

  it.each([
    [401, 'Your session has ended. Sign in again to continue this attempt.'],
    [403, 'You do not have access to this practice attempt.'],
    [404, 'This practice attempt does not exist.'],
    [500, 'Your saved answers could not be loaded. Please try again.'],
  ])('shows an error instead of a blank form for %i', async (status, message) => {
    const getAttempt = vi.fn().mockRejectedValue(new ApiError(status, null, 'x'));
    const { result } = renderHook(() => useResumeAttempt(42, { getAttempt }));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(message);
    expect(result.current.savedAnswers).toEqual({});
  });
});
