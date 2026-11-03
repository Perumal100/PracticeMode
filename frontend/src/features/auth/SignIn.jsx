// US-01: learners enter a display name only; staff use a username and password.
import { AlertCircle, Loader2, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Brand } from '@/components/brand.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input, Label } from '@/components/ui/input.jsx';
import { Tabs } from '@/components/ui/tabs.jsx';
import { signInLearner, signInStaff } from '../../api/session.js';

function messageFor(error) {
  if (error?.status === 401) return 'That username and password do not match a PracticeMode account.';
  if (error?.status === 403) return 'This account has no PracticeMode role. Ask an administrator to assign one.';
  if (error?.status === 503) return 'Sign-in is unavailable right now. Please try again.';
  if (error?.status === 0) return 'Could not reach PracticeMode. Check your connection.';
  return 'Sign-in failed. Check your details and try again.';
}

const POINTS = [
  { icon: ShieldCheck, title: 'Nothing leaves PracticeMode', text: 'Practice answers stay here and are never sent to the real website.' },
  { icon: UserRound, title: 'No personal details needed', text: 'Learners use a display name only. No email, no password.' },
  { icon: LockKeyhole, title: 'Reviewed before you practise', text: 'Every form is checked by a Form Reviewer before it is published.' },
];

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
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <Brand tone="light" />
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white text-balance">
            Practise real online forms before you fill them in for real.
          </h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5"><Icon className="size-4 text-white" /></span>
                <div>
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="mt-0.5 text-sm text-sidebar-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-sidebar-muted">CS-GY 6063 · Group I2-4</p>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Brand className="mb-10 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === 'learner' ? 'Choose a name to show while you practise.' : 'Reviewers and instructors sign in with their account.'}
          </p>

          <Tabs
            className="mt-6 w-full [&>button]:flex-1 [&>button]:justify-center"
            label="Sign-in method"
            value={mode}
            onValueChange={(next) => { setMode(next); setError(null); }}
            items={[{ value: 'learner', label: 'I am practising' }, { value: 'staff', label: 'Staff sign-in' }]}
          />

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            {mode === 'learner' ? (
              <div className="space-y-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input id="display-name" value={displayName} maxLength={150} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" placeholder="e.g. Alex" autoFocus />
                <p className="text-xs text-muted-foreground">Use a name or nickname only. Never enter real personal details.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
              </>
            )}
            {error && (
              <Alert variant="destructive"><AlertCircle />{error}</Alert>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
