import { afterEach, describe, expect, it, vi } from 'vitest';
import { signIn } from '../session.js';

afterEach(() => vi.restoreAllMocks());

describe('signIn', () => {
  it('still signs in when the old session was refused', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'ROLE_NOT_ALLOWED' }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'INSTRUCTOR_REMOVED', message: 'Your instructor account has been removed.' }), { status: 403 }));
    await expect(signIn('ines_o', 'secret')).rejects.toMatchObject({ code: 'INSTRUCTOR_REMOVED' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe('/api/login');
  });
});
