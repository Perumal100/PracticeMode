// US-01 sign-in calls (API-01). Every role signs in with a username and password;
// learners create their own account (no email or other personal details).
import { apiRequest } from './client.js';

// Sets the csrftoken cookie and returns the signed-in user, or null.
export async function getSession() {
  const data = await apiRequest('/api/session');
  return data?.user ?? null;
}

// Only sets the CSRF cookie. An old session whose role was taken away answers
// 403 here; that must not stop the person from signing in again.
function prepareCsrf() {
  return getSession().catch(() => null);
}

export async function signIn(username, password) {
  await prepareCsrf(); // login is CSRF-protected even before a session exists
  const data = await apiRequest('/api/login', { method: 'POST', body: { username, password } });
  return data.user;
}

export async function register({ username, displayName, password }) {
  await prepareCsrf();
  const data = await apiRequest('/api/register', { method: 'POST', body: { username, displayName, password } });
  return data.user;
}

export function signOut() {
  return apiRequest('/api/logout', { method: 'POST' });
}
