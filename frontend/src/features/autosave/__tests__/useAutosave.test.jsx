// Frontend unit tests for US-08 AC-01 and AC-03. The API is a test double;
// these do not test the Django backend.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import { SAVE_MESSAGES } from '../messages.js';
import { useAutosave } from '../useAutosave.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const setup = (options = {}) => {
  const saveAnswer = options.saveAnswer ?? vi.fn();
  const hook = renderHook((props) => useAutosave(props), {
    initialProps: { attemptId: 42, debounceMs: 500, saveAnswer, ...options },
  });
  return { ...hook, saveAnswer };
};

describe('useAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('AC-01: saves the latest value after the learner stops typing', async () => {
    const saveAnswer = vi.fn().mockResolvedValue({ fieldId: 7, value: 'Alex', savedAt: '2026-10-19T18:24:00Z' });
    const { result } = setup({ saveAnswer });

    act(() => {
      result.current.queueSave(7, 'A');
      result.current.queueSave(7, 'Al');
      result.current.queueSave(7, 'Alex');
    });
    expect(saveAnswer).not.toHaveBeenCalled();
    expect(result.current.statuses['7'].state).toBe('pending');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(saveAnswer).toHaveBeenCalledTimes(1);
    expect(saveAnswer).toHaveBeenCalledWith(42, 7, 'Alex');
    expect(result.current.statuses['7']).toEqual({ state: 'saved', savedAt: '2026-10-19T18:24:00Z' });
  });

  it('Rule 2: does not show saved before the server confirms', async () => {
    const pending = deferred();
    const saveAnswer = vi.fn().mockReturnValue(pending.promise);
    const { result } = setup({ saveAnswer, debounceMs: 0 });

    act(() => result.current.queueSave(7, 'Alex'));
    expect(result.current.statuses['7'].state).toBe('saving');

    await act(async () => {
      pending.resolve({ fieldId: 7, value: 'Alex', savedAt: 't1' });
    });
    expect(result.current.statuses['7'].state).toBe('saved');
  });

  it('flush saves immediately (e.g. on blur)', async () => {
    const saveAnswer = vi.fn().mockResolvedValue({ savedAt: 't1' });
    const { result } = setup({ saveAnswer });

    act(() => result.current.queueSave(7, 'Alex'));
    await act(async () => result.current.flush(7));

    expect(saveAnswer).toHaveBeenCalledWith(42, 7, 'Alex');
    expect(result.current.statuses['7'].state).toBe('saved');
  });

  it('AC-03: shows "Not saved. Retry." when the server returns 503 SAVE_FAILED', async () => {
    const saveAnswer = vi.fn().mockRejectedValue(new ApiError(503, 'SAVE_FAILED', 'Your answer could not be saved.'));
    const { result } = setup({ saveAnswer, debounceMs: 0 });

    await act(async () => result.current.queueSave(7, 'Alex'));

    expect(result.current.statuses['7'].state).toBe('error');
    expect(result.current.statuses['7'].message).toBe(SAVE_MESSAGES.failed);
  });

  it('AC-03: treats a network failure as not saved', async () => {
    const saveAnswer = vi.fn().mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'));
    const { result } = setup({ saveAnswer, debounceMs: 0 });

    await act(async () => result.current.queueSave(7, 'Alex'));
    expect(result.current.statuses['7'].message).toBe(SAVE_MESSAGES.failed);
  });

  it('AC-03: shows an invalid-value message for 400', async () => {
    const saveAnswer = vi.fn().mockRejectedValue(new ApiError(400, null, 'Invalid value'));
    const { result } = setup({ saveAnswer, debounceMs: 0 });

    await act(async () => result.current.queueSave(7, '???'));
    expect(result.current.statuses['7'].message).toBe(SAVE_MESSAGES.invalid);
  });

  it('retry resends the latest value and clears the warning on success', async () => {
    const saveAnswer = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, 'SAVE_FAILED', 'failed'))
      .mockResolvedValueOnce({ savedAt: 't2' });
    const { result } = setup({ saveAnswer, debounceMs: 0 });

    await act(async () => result.current.queueSave(7, 'Alex'));
    expect(result.current.statuses['7'].state).toBe('error');

    await act(async () => result.current.retry(7));
    expect(saveAnswer).toHaveBeenLastCalledWith(42, 7, 'Alex');
    expect(result.current.statuses['7']).toEqual({ state: 'saved', savedAt: 't2' });
  });

  it('an older response cannot mark a newer value as saved', async () => {
    const first = deferred();
    const second = deferred();
    const saveAnswer = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = setup({ saveAnswer, debounceMs: 0 });

    act(() => result.current.queueSave(7, 'Al'));
    act(() => result.current.queueSave(7, 'Alex'));

    await act(async () => first.resolve({ savedAt: 'old' }));
    expect(result.current.statuses['7'].state).toBe('saving');

    await act(async () => second.resolve({ savedAt: 'new' }));
    expect(result.current.statuses['7']).toEqual({ state: 'saved', savedAt: 'new' });
  });

  it('a late failure for an older value does not override a newer success', async () => {
    const first = deferred();
    const second = deferred();
    const saveAnswer = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = setup({ saveAnswer, debounceMs: 0 });

    act(() => result.current.queueSave(7, 'Al'));
    act(() => result.current.queueSave(7, 'Alex'));
    await act(async () => second.resolve({ savedAt: 'new' }));
    await act(async () => first.reject(new ApiError(503, 'SAVE_FAILED', 'failed')));

    expect(result.current.statuses['7']).toEqual({ state: 'saved', savedAt: 'new' });
  });

  it('keeps fields independent', async () => {
    const saveAnswer = vi
      .fn()
      .mockImplementation((_a, fieldId) =>
        fieldId === 8 ? Promise.reject(new ApiError(503, 'SAVE_FAILED', 'x')) : Promise.resolve({ savedAt: 't' }),
      );
    const { result } = setup({ saveAnswer, debounceMs: 0 });

    await act(async () => {
      result.current.queueSave(7, 'Alex');
      result.current.queueSave(8, 'Morgan');
    });
    expect(result.current.statuses['7'].state).toBe('saved');
    expect(result.current.statuses['8'].state).toBe('error');
  });

  it('does not autosave when disabled (completed attempt)', async () => {
    const saveAnswer = vi.fn();
    const { result } = setup({ saveAnswer, enabled: false, debounceMs: 0 });

    await act(async () => {
      result.current.queueSave(7, 'Alex');
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(saveAnswer).not.toHaveBeenCalled();
    expect(result.current.statuses['7']).toBeUndefined();
  });
});
