// US-08 AC-02: when a learner reopens an unfinished attempt, load the most
// recently saved answers so the practice form (US-11) can show them.
import { useEffect, useState } from 'react';
import { getAttempt as defaultGetAttempt, extractSavedAnswers } from './attemptApi.js';

const LOAD_ERRORS = {
  401: 'Your session has ended. Sign in again to continue this attempt.',
  403: 'You do not have access to this practice attempt.',
  404: 'This practice attempt does not exist.',
};

export function useResumeAttempt(attemptId, { getAttempt = defaultGetAttempt } = {}) {
  const [state, setState] = useState({
    status: 'loading',
    attempt: null,
    savedAnswers: {},
    isCompleted: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', attempt: null, savedAnswers: {}, isCompleted: false, error: null });

    getAttempt(attemptId).then(
      (attempt) => {
        if (cancelled) return;
        setState({
          status: 'ready',
          attempt,
          savedAnswers: extractSavedAnswers(attempt),
          // Answers lock once an attempt is COMPLETED (Sprint 2 design, STM-02).
          isCompleted: attempt?.status === 'COMPLETED',
          error: null,
        });
      },
      (error) => {
        if (cancelled) return;
        setState({
          status: 'error',
          attempt: null,
          savedAnswers: {},
          isCompleted: false,
          error: LOAD_ERRORS[error?.status] ?? 'Your saved answers could not be loaded. Please try again.',
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [attemptId, getAttempt]);

  return state;
}
