// Edit or add one extracted field before the review decision. The server
// re-checks everything with the import rules; this form only catches obvious
// mistakes early and keeps the rules that match the chosen type.
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Checkbox, Input, Label, NativeSelect, Textarea } from '@/components/ui/input.jsx';

export const FIELD_TYPES = [
  ['text', 'Short text'],
  ['textarea', 'Long text'],
  ['email', 'Email'],
  ['tel', 'Phone'],
  ['url', 'Link'],
  ['number', 'Number'],
  ['date', 'Date'],
  ['select', 'Choice list'],
  ['checkbox', 'Checkbox'],
];
const LENGTH_TYPES = new Set(['text', 'textarea', 'email', 'tel', 'url']);

/** First readable message from an API error body. */
export function apiErrorMessage(error, fallback) {
  const walk = (body) => {
    if (!body) return null;
    if (typeof body === 'string') return body;
    if (Array.isArray(body)) return walk(body[0]);
    if (typeof body === 'object') {
      if (body.message) return body.message;
      if (body.detail) return walk(body.detail);
      for (const value of Object.values(body)) {
        const text = walk(value);
        if (text) return text;
      }
    }
    return null;
  };
  if (error?.status === 409) return 'This form has already been reviewed, so it can no longer be edited.';
  return walk(error?.body) || fallback;
}

function initialDraft(field) {
  const v = field?.validation ?? {};
  return {
    label: field?.label ?? '',
    inputType: field?.input_type ?? 'text',
    required: field?.required ?? false,
    options: (v.allowedValues ?? []).join('\n'),
    minLength: v.minLength ?? '',
    maxLength: v.maxLength ?? '',
    min: v.min ?? '',
    max: v.max ?? '',
  };
}

/** Turns the draft into the API body, or returns { error }. */
export function buildFieldPayload(draft) {
  const label = draft.label.trim();
  if (!label) return { error: 'Enter the question label exactly as the source shows it.' };
  const validation = {};
  if (draft.inputType === 'select') {
    const options = [...new Set(draft.options.split('\n').map((o) => o.trim()).filter(Boolean))];
    if (!options.length) return { error: 'A choice list needs at least one option.' };
    validation.allowedValues = options;
  }
  const num = (value) => (value === '' || value === null ? null : Number(value));
  if (LENGTH_TYPES.has(draft.inputType)) {
    const [low, high] = [num(draft.minLength), num(draft.maxLength)];
    if ([low, high].some((n) => n !== null && (!Number.isInteger(n) || n < 0))) return { error: 'Lengths must be whole numbers of 0 or more.' };
    if (low !== null && high !== null && low > high) return { error: 'The minimum length is larger than the maximum.' };
    if (low !== null) validation.minLength = low;
    if (high !== null) validation.maxLength = high;
  }
  if (draft.inputType === 'number') {
    const [low, high] = [num(draft.min), num(draft.max)];
    if ([low, high].some((n) => n !== null && !Number.isFinite(n))) return { error: 'The minimum and maximum must be numbers.' };
    if (low !== null && high !== null && low > high) return { error: 'The minimum is larger than the maximum.' };
    if (low !== null) validation.min = low;
    if (high !== null) validation.max = high;
  }
  return { payload: { label, input_type: draft.inputType, required: draft.required, validation } };
}

export default function FieldEditor({ open, onOpenChange, field, onSave }) {
  const [draft, setDraft] = useState(() => initialDraft(field));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(initialDraft(field));
      setError(null);
    }
  }, [open, field]);

  const set = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  async function submit(event) {
    event.preventDefault();
    const { payload, error: problem } = buildFieldPayload(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(payload);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, 'The field could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  const type = draft.inputType;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{field ? 'Edit field' : 'Add field'}</DialogTitle>
            <DialogDescription>Match the source page: the label, the kind of answer, and any limits it enforces.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="field-label">Label</Label>
              <Input id="field-label" value={draft.label} maxLength={300} onChange={set('label')} autoFocus />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="field-type">Answer type</Label>
                <NativeSelect id="field-type" value={type} onChange={set('inputType')}>
                  {FIELD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </NativeSelect>
              </div>
              <label htmlFor="field-required" className="flex items-center gap-2.5 self-end pb-2 text-sm font-medium">
                <Checkbox id="field-required" checked={draft.required} onChange={set('required')} className="mt-0" />
                Required
              </label>
            </div>

            {type === 'select' && (
              <div className="grid gap-2">
                <Label htmlFor="field-options">Options</Label>
                <Textarea id="field-options" rows={5} value={draft.options} onChange={set('options')} placeholder={'One option per line\nUnited States\nCanada'} />
                <p className="text-xs text-muted-foreground">One per line, in the order the source lists them. Leave out placeholders like "Select…".</p>
              </div>
            )}
            {LENGTH_TYPES.has(type) && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="field-min-length">Minimum length</Label>
                  <Input id="field-min-length" type="number" min={0} value={draft.minLength} onChange={set('minLength')} placeholder="None" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="field-max-length">Maximum length</Label>
                  <Input id="field-max-length" type="number" min={0} value={draft.maxLength} onChange={set('maxLength')} placeholder="None" />
                </div>
              </div>
            )}
            {type === 'number' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="field-min">Minimum value</Label>
                  <Input id="field-min" type="number" value={draft.min} onChange={set('min')} placeholder="None" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="field-max">Maximum value</Label>
                  <Input id="field-max" type="number" value={draft.max} onChange={set('max')} placeholder="None" />
                </div>
              </div>
            )}
          </div>

          {error && <Alert variant="destructive"><AlertCircle />{error}</Alert>}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{field ? 'Save field' : 'Add field'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
