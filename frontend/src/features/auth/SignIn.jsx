// US-01: learners enter a display name only; staff use a username and password.
import { useState } from 'react';
import { signInLearner, signInStaff } from '../../api/session.js';

function messageFor(error) {
  if (error?.status === 401) return 'That username and password do not match a PracticeMode account.';
  if (error?.status === 403) return 'This account has no PracticeMode role. Ask an administrator to assign one.';
  if (error?.status === 503) return 'Sign-in is unavailable right now. Please try again.';
  if (error?.status === 0) return 'Could not reach PracticeMode. Check your connection.';
  return 'Sign-in failed. Check your details and try again.';
}

export default function SignIn({ onSignedIn, api = { signInLearner, signInStaff } }) {
  const [mode, setMode] = useState('learner');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (mode === 'learner' && !displayName.trim()) {
      setError('Enter a name to show while you practise.');
      return;
    }
    if (mode === 'staff' && (!username || !password)) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    try {
      const user = mode === 'learner'
        ? await api.signInLearner(displayName.trim())
        : await api.signInStaff(username, password);
      onSignedIn(user);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card narrow">
      <h2>Sign in</h2>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'learner'} onClick={() => { setMode('learner'); setError(null); }}>
          I am practising
        </button>
        <button type="button" role="tab" aria-selected={mode === 'staff'} onClick={() => { setMode('staff'); setError(null); }}>
          Staff sign-in
        </button>
      </div>
      <form onSubmit={submit} noValidate>
        {mode === 'learner' ? (
          <>
            <label>
              Display name
              <input value={displayName} maxLength={150} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" />
            </label>
            <p className="muted">No email or password. Use a name or nickname only; never enter real personal details.</p>
          </>
        ) : (
          <>
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
          </>
        )}
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </section>
  );
}
