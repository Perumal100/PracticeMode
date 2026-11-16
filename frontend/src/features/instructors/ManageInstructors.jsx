// Form Reviewers approve instructor sign-ups, add instructors directly, and
// remove or restore them. Removing an instructor returns their booked
// sessions to the waiting queue; their history is kept.
import { AlertCircle, Loader2, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state.jsx';
import { PageHeader } from '@/components/page-header.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Input, Label, Textarea } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { Tabs } from '@/components/ui/tabs.jsx';
import { formatDateTime } from '@/lib/format.js';
import * as defaultApi from '../../api/instructors.js';
import { MeetingLink } from '../assistance/SessionTimeline.jsx';

const TABS = [['PENDING', 'Waiting for approval'], ['ACTIVE', 'Active'], ['REMOVED', 'Removed'], ['DECLINED', 'Declined']];
const ACTIONS = {
  PENDING: [['approve', 'Approve', 'default'], ['decline', 'Decline', 'ghost']],
  ACTIVE: [['remove', 'Remove', 'ghost']],
  REMOVED: [['restore', 'Restore', 'outline']],
  DECLINED: [['restore', 'Approve', 'outline']],
};
const CONFIRM = {
  decline: ['Decline this request?', 'They cannot sign in. You can approve them later from the Declined list.'],
  remove: ['Remove this instructor?', 'They are signed out and cannot sign in. Sessions they had booked go back to the waiting queue, and their history is kept.'],
};

function AddInstructor({ open, onOpenChange, onAdded, addInstructor }) {
  const blank = { fullName: '', username: '', meetingLink: '', organisation: '', password: '' };
  const [values, setValues] = useState(blank);
  const [state, setState] = useState({ busy: false, errors: {} });
  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    setState({ busy: true, errors: {} });
    try {
      const added = await addInstructor({ ...values, fullName: values.fullName.trim(), meetingLink: values.meetingLink.trim(), organisation: values.organisation.trim() });
      setValues(blank);
      setState({ busy: false, errors: {} });
      onAdded(added);
    } catch (error) {
      const body = error?.body ?? {};
      setState({ busy: false, errors: error?.status === 409 ? { username: 'That username is taken.' }
        : error?.status === 400 ? Object.fromEntries(Object.keys(blank).filter((k) => body[k]).map((k) => [k, [].concat(body[k]).join(' ')]))
          : { form: 'The instructor could not be added. Please try again.' } });
    }
  }

  const field = (name, label, props = {}, help) => (
    <div className="space-y-1.5">
      <Label htmlFor={`add-${name}`}>{label}</Label>
      <Input id={`add-${name}`} value={values[name]} onChange={set(name)} aria-invalid={state.errors[name] ? true : undefined} {...props} />
      {(state.errors[name] || help) && <p className={state.errors[name] ? 'text-[13px] font-medium text-destructive' : 'text-xs text-muted-foreground'}>{state.errors[name] || help}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add an instructor</DialogTitle>
            <DialogDescription>The account is active at once. Give the instructor their username and password yourself.</DialogDescription>
          </DialogHeader>
          {field('fullName', 'Full name')}
          {field('username', 'Username', { autoCapitalize: 'none', spellCheck: false })}
          {field('meetingLink', 'Default meeting link', { type: 'url', placeholder: 'https://' })}
          {field('organisation', 'Organisation (optional)')}
          {field('password', 'First password', { type: 'password', autoComplete: 'new-password' }, 'At least 8 characters, not only numbers. Ask them to change it with an administrator later.')}
          {state.errors.form && <Alert variant="destructive"><AlertCircle />{state.errors.form}</Alert>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={state.busy}>{state.busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}Add instructor</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ManageInstructors({ status = 'PENDING', onStatusChange, api: overrides = {} }) {
  const [api] = useState(() => ({ ...defaultApi, ...overrides }));
  const tab = TABS.some(([v]) => v === status) ? status : 'PENDING';
  const [state, setState] = useState({ status: 'loading', all: [] });
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    api.listInstructors().then((all) => setState({ status: 'ready', all }),
      (error) => setState({ status: 'error', all: [], error: error?.status === 403 ? 'Only Form Reviewers can manage instructors.' : 'The instructors could not be loaded.' }));
  }, [api]);
  useEffect(() => { load(); }, [load]);

  async function act(instructor, action) {
    setConfirm(null);
    try {
      await api.instructorAction(instructor.id, action, note.trim());
      setNote('');
      toast.success({ approve: 'Instructor approved. They can sign in now.', decline: 'Request declined.', remove: 'Instructor removed.', restore: 'Instructor restored.' }[action]);
      load();
    } catch (error) {
      toast.error(error?.message ?? 'That change could not be saved.');
    }
  }

  const rows = state.all.filter((i) => i.status === tab);
  const count = (v) => state.all.filter((i) => i.status === v).length;

  return (
    <>
      <PageHeader title="Instructors" description="Approve instructor sign-ups, add instructors yourself, and remove those who no longer help learners."
        actions={<Button onClick={() => setAdding(true)}><UserPlus />Add instructor</Button>} />
      {state.status === 'error' ? <Alert variant="destructive"><AlertCircle />{state.error}</Alert> : (
        <>
          <Tabs label="Instructor status" value={tab} onValueChange={onStatusChange} className="max-w-full overflow-x-auto"
            items={TABS.map(([value, label]) => ({ value, label, count: state.status === 'ready' ? count(value) : undefined }))} />
          <div className="mt-4">
            {state.status === 'loading' && <Card className="space-y-3 p-4" aria-busy="true">{[0, 1].map((i) => <Skeleton key={i} className="h-10" />)}</Card>}
            {state.status === 'ready' && !rows.length && (
              <EmptyState role="status" icon={Users} title={tab === 'PENDING' ? 'No sign-ups waiting' : 'Nobody in this list'}
                description={tab === 'PENDING' ? 'Instructors request an account at /#/instructor-signup.' : undefined} />
            )}
            {state.status === 'ready' && rows.length > 0 && (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Instructor</TableHead>
                      <TableHead>Default meeting link</TableHead>
                      <TableHead>{tab === 'PENDING' ? 'Requested' : 'Sessions'}</TableHead>
                      <TableHead><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((instructor) => (
                      <TableRow key={instructor.id}>
                        <TableCell>
                          <span className="font-medium">{instructor.fullName || instructor.username}</span>
                          <span className="block text-xs text-muted-foreground">{instructor.username}{instructor.organisation && `, ${instructor.organisation}`}</span>
                          {instructor.decisionNote && <span className="block text-xs text-muted-foreground">Note: {instructor.decisionNote}</span>}
                        </TableCell>
                        <TableCell className="max-w-64">{instructor.meetingLink ? <MeetingLink href={instructor.meetingLink} className="text-[13px] font-normal" /> : <span className="text-muted-foreground">Not set</span>}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{tab === 'PENDING' ? formatDateTime(instructor.createdAt) : instructor.sessionCount}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {ACTIONS[tab].map(([action, label, variant]) => (
                              <Button key={action} size="sm" variant={variant} className={action === 'remove' || action === 'decline' ? 'text-destructive' : undefined}
                                onClick={() => (CONFIRM[action] ? setConfirm({ instructor, action }) : act(instructor, action))}
                                aria-label={`${label} ${instructor.fullName || instructor.username}`}>{label}</Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        </>
      )}
      <AddInstructor open={adding} onOpenChange={setAdding} addInstructor={api.addInstructor}
        onAdded={(added) => { setAdding(false); toast.success(`${added.fullName} can sign in now.`); load(); }} />
      <AlertDialog open={confirm !== null} onOpenChange={(isOpen) => !isOpen && setConfirm(null)}>
        <AlertDialogContent>
          {confirm && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{CONFIRM[confirm.action][0]}</AlertDialogTitle>
                <AlertDialogDescription>{CONFIRM[confirm.action][1]}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="decision-note">Note (optional, kept on record)</Label>
                <Textarea id="decision-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => act(confirm.instructor, confirm.action)}>{confirm.action === 'remove' ? 'Remove' : 'Decline'}</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
