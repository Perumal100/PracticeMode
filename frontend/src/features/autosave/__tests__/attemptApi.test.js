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

  it('extractSavedAnswers maps answers to { fieldId: value }', () => {
    expect(extractSavedAnswers({ answers: [{ fieldId: 7, value: 'A' }] })).toEqual({ 7: 'A' });
    expect(extractSavedAnswers({})).toEqual({});
    expect(extractSavedAnswers(null)).toEqual({});
  });
});
