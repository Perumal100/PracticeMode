// US-08 AC-01 and AC-03: save each answer automatically and report the result.
//
// Rule 2 (Sprint 2 design): a field shows "Saved" only after the server
// confirms it. The client never reports success on its own.
//
// Autosave condition: the design says the client saves when the learner
// changes an answer. Typing is debounced (debounceMs) so each keystroke is not
// a request, and flush(fieldId) saves immediately, e.g. on blur.
// Set debounceMs to 0 to save on every change.
import { useCallback, useEffect, useRef, useState } from 'react';
import { saveAnswer as defaultSaveAnswer } from './attemptApi.js';
import { messageForSaveError } from './messages.js';

export const DEFAULT_DEBOUNCE_MS = 800;

export function useAutosave({
  attemptId,
  enabled = true,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  saveAnswer = defaultSaveAnswer,
}) {
  // fieldId -> { state: 'pending'|'saving'|'saved'|'error', savedAt?, message? }
  const [statuses, setStatuses] = useState({});
  const timers = useRef(new Map());
  const latestValue = useRef(new Map());
  const requestSeq = useRef(new Map());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const setStatus = useCallback((fieldId, status) => {
    if (!mounted.current) return;
    setStatuses((prev) => ({ ...prev, [fieldId]: status }));
  }, []);

  const send = useCallback(
    async (fieldId) => {
      const key = String(fieldId);
      if (!latestValue.current.has(key)) return;
      const value = latestValue.current.get(key);
      const seq = (requestSeq.current.get(key) ?? 0) + 1;
      requestSeq.current.set(key, seq);
      setStatus(key, { state: 'saving' });

      try {
        const result = await saveAnswer(attemptId, fieldId, value);
        // Ignore responses for older values; a newer save is in flight or queued.
        if (requestSeq.current.get(key) !== seq || timers.current.has(key)) return;
        setStatus(key, { state: 'saved', savedAt: result?.savedAt ?? null });
      } catch (error) {
        if (requestSeq.current.get(key) !== seq || timers.current.has(key)) return;
        setStatus(key, { state: 'error', message: messageForSaveError(error), error });
      }
    },
    [attemptId, saveAnswer, setStatus],
  );

  const flush = useCallback(
    (fieldId) => {
      const key = String(fieldId);
      const timer = timers.current.get(key);
      if (timer === undefined) return;
      clearTimeout(timer);
      timers.current.delete(key);
      send(fieldId);
    },
    [send],
  );

  const queueSave = useCallback(
    (fieldId, value) => {
      if (!enabled) return;
      const key = String(fieldId);
      latestValue.current.set(key, value);
      setStatus(key, { state: 'pending' });

      const existing = timers.current.get(key);
      if (existing !== undefined) clearTimeout(existing);

      if (debounceMs <= 0) {
        timers.current.delete(key);
        send(fieldId);
        return;
      }
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          send(fieldId);
        }, debounceMs),
      );
    },
    [enabled, debounceMs, send, setStatus],
  );

  // Resends the latest value for a field after a failed save.
  const retry = useCallback(
    (fieldId) => {
      if (!enabled) return;
      send(fieldId);
    },
    [enabled, send],
  );

  return { statuses, queueSave, flush, retry };
}
