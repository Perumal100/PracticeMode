// An instructor reports a mistake in a published form: the whole form, or
// one question. A Form Reviewer answers it from the change requests queue.
import { Flag, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Label, NativeSelect, Textarea } from '@/components/ui/input.jsx';
import { createChangeRequest as defaultCreate, getPublishedForm as defaultGetForm } from '../../api/instructors.js';

export function ReportDialog({ form, initialFieldId = '', open, onOpenChange, onSent, createChangeRequest = defaultCreate }) {
  const [fieldId, setFieldId] = useState(initialFieldId);
  const [description, setDescription] = useState('');
  const [state, setState] = useState({ busy: false, error: null });

  async function send(event) {
    event.preventDefault();
    if (!description.trim()) {
      setState({ busy: false, error: 'Describe what is wrong and what it should say.' });
      return;
    }
    setState({ busy: true, error: null });
    try {
      const created = await createChangeRequest({ formId: form.id, fieldId, description: description.trim() });
      setDescription('');
      setState({ busy: false, error: null });
      onSent?.(created);
      onOpenChange(false);
    } catch (error) {
      setState({ busy: false, error: error?.status === 404 ? 'This form is no longer published.' : 'Your report could not be sent. Please try again.' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={send} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Report a problem with “{form.title}”</DialogTitle>
            <DialogDescription>A Form Reviewer checks it against the real form and answers you here.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="report-field">Which question?</Label>
            <NativeSelect id="report-field" value={fieldId} onChange={(e) => setFieldId(e.target.value)}>
              <option value="">The whole form</option>
              {(form.fields ?? []).map((f) => <option key={f.id} value={f.id}>{f.position}. {f.label}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-description">What is wrong?</Label>
            <Textarea id="report-description" rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="For example: the real form also asks for a middle name, or this should be a date"
              aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? 'report-error' : undefined} />
            {state.error && <p id="report-error" role="alert" className="text-[13px] font-medium text-destructive">{state.error}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={state.busy}>{state.busy && <Loader2 className="animate-spin motion-reduce:animate-none" />}Send report</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A card on a help request: report a problem with the form the learner is practising. */
export default function ReportProblem({ formId, formTitle, getForm = defaultGetForm, createChangeRequest }) {
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ busy: false, error: null, sent: false });

  async function open() {
    setState({ busy: true, error: null, sent: false });
    try {
      setForm(await getForm(formId));
      setState({ busy: false, error: null, sent: false });
    } catch {
      setState({ busy: false, error: 'This form is not published any more, so it cannot be reported here.', sent: false });
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Something wrong with the form?</CardTitle>
        <CardDescription>If “{formTitle}” differs from the real form, tell a Form Reviewer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button variant="outline" size="sm" onClick={open} disabled={state.busy}>
          {state.busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Flag />}Report a problem
        </Button>
        {state.error && <p role="alert" className="text-[13px] text-destructive">{state.error}</p>}
        {state.sent && <p role="status" className="text-[13px] font-medium text-success">Report sent. Its answer appears under Forms.</p>}
      </CardContent>
      {form && (
        <ReportDialog form={form} open onOpenChange={(isOpen) => !isOpen && setForm(null)} createChangeRequest={createChangeRequest}
          onSent={() => setState({ busy: false, error: null, sent: true })} />
      )}
    </Card>
  );
}
