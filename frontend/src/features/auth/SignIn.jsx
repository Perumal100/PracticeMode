// US-01: everyone signs in with a username and password. Learners create an
// account with a username and a display name only, so their practice history
// stays with them; no email or other personal detail is asked for.
import { AlertCircle, History, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Brand } from '@/components/brand.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input, Label } from '@/components/ui/input.jsx';
import { Tabs } from '@/components/ui/tabs.jsx';
import { register as defaultRegister, signIn as defaultSignIn } from '../../api/session.js';

const USERNAME = /^[A-Za-z0-9_.-]{3,30}$/;
const MIN_PASSWORD = 8;

function signInMessage(error) {
  if (error?.code?.startsWith?.('INSTRUCTOR_')) return error.message;
  if (error?.status === 401) return 'That username and password do not match a PracticeMode account.';
  if (error?.status === 403) return 'This account has no PracticeMode role. Ask an administrator to assign one.';
  if (error?.status === 0) return 'Could not reach PracticeMode. Check your connection.';
  return 'Sign-in is unavailable right now. Please try again.';
}

const POINTS = [
  { icon: ShieldCheck, title: 'Nothing leaves PracticeMode', text: 'Practice answers stay here and are never sent to the real website.' },
  { icon: History, title: 'Your practice is kept', text: 'Sign in from any device to continue a form or look back at your results.' },
  { icon: LockKeyhole, title: 'No personal details needed', text: 'A username and a display name are enough. We never ask for your email.' },
];

function FieldError({ id, children }) {
  return children ? <p id={id} className="text-[13px] font-medium text-destructive">{children}</p> : null;
}

function field(errors, name) {
  return { 'aria-invalid': errors[name] ? true : undefined, 'aria-describedby': errors[name] ? `${name}-error` : undefined };
}

export default function SignIn({ onSignedIn, onInstructorSignUp, api = {} }) {
  const signIn = api.signIn ?? defaultSignIn;
  const register = api.register ?? defaultRegister;
  const [mode, setMode] = useState('signin');
  const [values, setValues] = useState({ username: '', displayName: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const creating = mode === 'register';

  const set = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }));

  function check() {
    const found = {};
    if (creating) {
      if (!USERNAME.test(values.username)) found.username = 'Use 3 to 30 letters, numbers, dots, dashes or underscores.';
      if (!values.displayName.trim()) found.displayName = 'Choose a name to show while you practise.';
      if (values.password.length < MIN_PASSWORD) found.password = `Use at least ${MIN_PASSWORD} characters.`;
      else if (values.confirm !== values.password) found.confirm = 'The passwords do not match.';
    } else {
      if (!values.username) found.username = 'Enter your username.';
      if (!values.password) found.password = 'Enter your password.';
    }
    return found;
  }

  async function submit(event) {
    event.preventDefault();
    const found = check();
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const user = creating
        ? await register({ username: values.username, displayName: values.displayName.trim(), password: values.password })
        : await signIn(values.username, values.password);
      onSignedIn(user);
    } catch (error) {
      if (creating && error?.status === 409) setErrors({ username: 'That username is taken. Choose another one.' });
      else if (creating && error?.status === 400) {
        const body = error.body ?? {};
        setErrors({
          username: body.username?.[0], displayName: body.displayName?.[0], password: body.password?.join(' '),
          form: body.username || body.displayName || body.password ? undefined : 'Check your details and try again.',
        });
      } else setErrors({ form: creating ? 'Your account could not be created. Please try again.' : signInMessage(error) });
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
        <p className="text-xs text-sidebar-muted">CS-GY 6063, Group I2-4</p>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Brand className="mb-10 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">{creating ? 'Create a learner account' : 'Sign in'}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {creating ? 'Choose a username and a name to show. Never use your real personal details.' : 'Learners, reviewers and instructors all sign in here.'}
          </p>

          <Tabs
            className="mt-6 w-full [&>button]:flex-1 [&>button]:justify-center"
            label="Account"
            value={mode}
            onValueChange={(next) => { setMode(next); setErrors({}); }}
            items={[{ value: 'signin', label: 'Sign in' }, { value: 'register', label: 'Create account' }]}
          />

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={values.username} maxLength={30} onChange={set('username')} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus {...field(errors, 'username')} />
              <FieldError id="username-error">{errors.username}</FieldError>
            </div>
            {creating && (
              <div className="space-y-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input id="display-name" value={values.displayName} maxLength={150} onChange={set('displayName')} autoComplete="nickname" placeholder="e.g. Alex" {...field(errors, 'displayName')} />
                {errors.displayName
                  ? <FieldError id="displayName-error">{errors.displayName}</FieldError>
                  : <p className="text-xs text-muted-foreground">Shown to an instructor if you ask for help. A first name or nickname is enough.</p>}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={values.password} onChange={set('password')} autoComplete={creating ? 'new-password' : 'current-password'} {...field(errors, 'password')} />
              {errors.password
                ? <FieldError id="password-error">{errors.password}</FieldError>
                : creating && <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD} characters, not only numbers.</p>}
            </div>
            {creating && (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input id="confirm-password" type="password" value={values.confirm} onChange={set('confirm')} autoComplete="new-password" {...field(errors, 'confirm')} />
                <FieldError id="confirm-error">{errors.confirm}</FieldError>
              </div>
            )}
            {errors.form && <Alert variant="destructive"><AlertCircle />{errors.form}</Alert>}
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}
              {creating ? (busy ? 'Creating account…' : 'Create account') : (busy ? 'Signing in…' : 'Sign in')}
            </Button>
          </form>
          {onInstructorSignUp && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Teaching or helping learners?{' '}
              <button type="button" onClick={onInstructorSignUp} className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline">Request an instructor account</button>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
