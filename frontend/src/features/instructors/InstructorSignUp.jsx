// A separate sign-up page for instructors (#/instructor-signup). The account
// waits for a Form Reviewer to approve it, because instructors can see
// learners' help requests and progress.
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Brand } from '@/components/brand.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input, Label } from '@/components/ui/input.jsx';
import { signUpInstructor as defaultSignUp } from '../../api/instructors.js';

const USERNAME = /^[A-Za-z0-9_.-]{3,30}$/;

function isWebLink(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const FIELDS = [
  ['fullName', 'Full name', { autoComplete: 'name' }, 'Learners see this name when you accept their request.'],
  ['username', 'Username', { autoComplete: 'username', autoCapitalize: 'none', spellCheck: false }, null],
  ['meetingLink', 'Default meeting link', { type: 'url', inputMode: 'url', placeholder: 'https://meet.google.com/…' }, 'Sent to learners when you accept their request. You can change it for any session.'],
  ['organisation', 'Organisation (optional)', { autoComplete: 'organization' }, 'Helps a Form Reviewer confirm your account, for example the library or centre you teach at.'],
  ['password', 'Password', { type: 'password', autoComplete: 'new-password' }, 'At least 8 characters, not only numbers.'],
  ['confirm', 'Confirm password', { type: 'password', autoComplete: 'new-password' }, null],
];

export default function InstructorSignUp({ onSignIn, signUp = defaultSignUp }) {
  const [values, setValues] = useState({ fullName: '', username: '', meetingLink: '', organisation: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function check() {
    const found = {};
    if (!values.fullName.trim()) found.fullName = 'Enter your name.';
    if (!USERNAME.test(values.username)) found.username = 'Use 3 to 30 letters, numbers, dots, dashes or underscores.';
    if (!isWebLink(values.meetingLink.trim())) found.meetingLink = 'Enter a full link, starting with https://';
    if (values.password.length < 8) found.password = 'Use at least 8 characters.';
    else if (values.confirm !== values.password) found.confirm = 'The passwords do not match.';
    return found;
  }

  async function submit(event) {
    event.preventDefault();
    const found = check();
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await signUp({ fullName: values.fullName.trim(), username: values.username, meetingLink: values.meetingLink.trim(), organisation: values.organisation.trim(), password: values.password });
      setDone(true);
    } catch (error) {
      if (error?.status === 409) setErrors({ username: 'That username is taken. Choose another one.' });
      else if (error?.status === 400) {
        const body = error.body ?? {};
        setErrors(Object.fromEntries(['fullName', 'username', 'meetingLink', 'password', 'organisation'].filter((k) => body[k]).map((k) => [k, [].concat(body[k]).join(' ')])));
      } else setErrors({ form: 'Your request could not be sent. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12 sm:px-8">
      <div className="w-full max-w-md">
        <Brand className="mb-10" />
        {done ? (
          <div role="status" className="space-y-4">
            <CheckCircle2 className="size-8 text-success" />
            <h1 className="text-2xl font-semibold tracking-tight">Request sent</h1>
            <p className="text-sm text-muted-foreground">A Form Reviewer will check your details. You can sign in as <span className="font-medium text-foreground">{values.username}</span> once your account is approved.</p>
            <Button variant="outline" onClick={onSignIn}>Back to sign in</Button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Request an instructor account</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Instructors meet learners who ask for help. A Form Reviewer approves each account before it can sign in.</p>
            <form onSubmit={submit} noValidate className="mt-8 space-y-4">
              {FIELDS.map(([name, label, props, help]) => (
                <div key={name} className="space-y-2">
                  <Label htmlFor={`instructor-${name}`}>{label}</Label>
                  <Input id={`instructor-${name}`} value={values[name]} onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                    aria-invalid={errors[name] ? true : undefined} aria-describedby={errors[name] || help ? `instructor-${name}-note` : undefined} {...props} />
                  {(errors[name] || help) && (
                    <p id={`instructor-${name}-note`} className={errors[name] ? 'text-[13px] font-medium text-destructive' : 'text-xs text-muted-foreground'}>{errors[name] || help}</p>
                  )}
                </div>
              ))}
              {errors.form && <Alert variant="destructive"><AlertCircle />{errors.form}</Alert>}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}Request account</Button>
              <p className="text-center text-sm text-muted-foreground">Already have an account? <button type="button" onClick={onSignIn} className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline">Sign in</button></p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
