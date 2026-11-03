// Shared fetch wrapper for the Django REST API.
// The backend uses Django session authentication, so requests send the
// session cookie and unsafe methods include the CSRF token.

export class ApiError extends Error {
  constructor(status, code, message, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // 0 means the request never reached the server
    this.code = code;
    this.body = body;
  }
}

function readCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function apiRequest(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (UNSAFE_METHODS.has(method)) {
    const csrf = readCookie('csrftoken');
    if (csrf) headers['X-CSRFToken'] = csrf;
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.', null);
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? null,
      data?.message ?? `Request failed with status ${response.status}.`,
      data,
    );
  }
  return data;
}
