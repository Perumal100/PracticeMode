// US-01 sign-in calls (API-01, dev-rohan accounts app).
import { apiRequest } from './client.js';

// Sets the csrftoken cookie and returns the signed-in user, or null.
export async function getSession() {
  const data = await apiRequest('/api/session');
  return data?.user ?? null;
}

export async function signInLearner(displayName) {
  await getSession(); // login is CSRF-protected even before a session exists
  const data = await apiRequest('/api/login', { method: 'POST', body: { role: 'LEARNER', displayName } });
  return data.user;
}

export async function signInStaff(username, password) {
  await getSession();
  const data = await apiRequest('/api/login', { method: 'POST', body: { username, password } });
  return data.user;
}

export function signOut() {
  return apiRequest('/api/logout', { method: 'POST' });
}
