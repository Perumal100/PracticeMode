// Checks requests match the Sprint 2 API contract. fetch is mocked.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client.js';
import { extractSavedAnswers, getAttempt, saveAnswer } from '../attemptApi.js';

const jsonResponse = (status, body) =>
  Promise.resolve(new Response(body === undefined ? '' : JSON.stringify(body), { status }));

afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('attemptApi', () => {
  it('GET /api/attempts/{attemptId}', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(jsonResponse(200, { id: 42, answers: [] }));
    await getAttempt(42);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/attempts/42');
    expect(options.method).toBe('GET');
    expect(options.credentials).toBe('same-origin');
  });

  it('PATCH /api/attempts/{attemptId}/answers/{fieldId} with { value } and CSRF token', async () => {
    document.cookie = 'csrftoken=abc123';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockReturnValue(jsonResponse(200, { fieldId: 7, value: 'Alex Morgan', savedAt: '2026-10-19T18:24:00Z' }));

    const result = await saveAnswer(42, 7, 'Alex Morgan');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/attempts/42/answers/7');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ value: 'Alex Morgan' });
    expect(options.headers['X-CSRFToken']).toBe('abc123');
    expect(result.savedAt).toBe('2026-10-19T18:24:00Z');
  });

  it('turns 503 SAVE_FAILED into an ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      jsonResponse(503, { error: 'SAVE_FAILED', message: 'Your answer could not be saved. Please retry.' }),
    );
    await expect(saveAnswer(42, 7, 'x')).rejects.toMatchObject({ status: 503, code: 'SAVE_FAILED' });
  });

  it('turns a network failure into an ApiError with status 0', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await saveAnswer(42, 7, 'x').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
  });

  it('extractSavedAnswers reads the API-05 response returned by the dev-rohan backend', () => {
    // Shape from attempts.serializers.AttemptSerializer: UUID ids, answers ordered by field position.
    const attempt = {
      id: '0b8c1a52-6a43-4d55-9b0e-2f3f0d6f8a11',
      formId: '5d0e7f2c-1c9a-4a8e-8f43-0c3b9e2a7d10',
      status: 'IN_PROGRESS',
      startedAt: '2026-11-02T12:00:00Z',
      lastSavedAt: '2026-11-02T12:01:00Z',
      completedAt: null,
      validationFeedback: [],
      answers: [
        { fieldId: '9a1f4c3e-2b7d-4e8a-a1c2-3d4e5f6a7b8c', value: 'Alex Morgan', savedAt: '2026-11-02T12:01:00Z' },
        { fieldId: 'c7d8e9f0-1a2b-4c3d-8e4f-5a6b7c8d9e0f', value: true, savedAt: '2026-11-02T12:00:30Z' },
        { fieldId: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b', value: null, savedAt: '2026-11-02T12:00:10Z' },
      ],
    };
    expect(extractSavedAnswers(attempt)).toEqual({
      '9a1f4c3e-2b7d-4e8a-a1c2-3d4e5f6a7b8c': 'Alex Morgan',
      'c7d8e9f0-1a2b-4c3d-8e4f-5a6b7c8d9e0f': true,
      'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b': null,
    });
  });

  it('extractSavedAnswers maps answers to { fieldId: value }', () => {
    expect(extractSavedAnswers({ answers: [{ fieldId: 7, value: 'A' }] })).toEqual({ 7: 'A' });
    expect(extractSavedAnswers({})).toEqual({});
    expect(extractSavedAnswers(null)).toEqual({});
  });
});
