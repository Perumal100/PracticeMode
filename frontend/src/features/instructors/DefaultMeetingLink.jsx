// The instructor's default meeting link, sent to learners when a request is accepted.
import { Loader2, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Input, Label } from '@/components/ui/input.jsx';
import { getOwnProfile as defaultGet, updateOwnProfile as defaultUpdate } from '../../api/instructors.js';
import { MeetingLink } from '../assistance/SessionTimeline.jsx';

export default function DefaultMeetingLink({ getOwnProfile = defaultGet, updateOwnProfile = defaultUpdate }) {
  const [link, setLink] = useState(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState({ busy: false, error: null });

  useEffect(() => {
    getOwnProfile().then((p) => setLink(p.meetingLink || ''), () => setLink(''));
  }, [getOwnProfile]);

  async function save(event) {
    event.preventDefault();
    setState({ busy: true, error: null });
    try {
      const profile = await updateOwnProfile({ meetingLink: draft.trim() });
      setLink(profile.meetingLink);
      setEditing(false);
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error: error?.body?.meetingLink?.[0] ?? 'The link could not be saved. Please try again.' });
    }
  }

  if (link === null) return null;
  return (
    <div className="mb-6 rounded-lg border bg-card px-4 py-3 text-sm shadow-xs">
      {editing ? (
        <form onSubmit={save} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="default-link">Default meeting link</Label>
            <Input id="default-link" type="url" inputMode="url" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://"
              aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? 'default-link-error' : undefined} />
            {state.error && <p id="default-link-error" className="text-[13px] font-medium text-destructive">{state.error}</p>}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={state.busy}>{state.busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0">
            <span className="text-muted-foreground">Your default meeting link: </span>
            {link ? <MeetingLink href={link} /> : <span>not set yet</span>}
          </p>
          <Button size="sm" variant="ghost" onClick={() => { setDraft(link); setEditing(true); }}><Pencil />Change</Button>
        </div>
      )}
    </div>
  );
}
