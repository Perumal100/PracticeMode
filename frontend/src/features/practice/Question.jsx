// One numbered question with its control, hint and feedback. Shared by the
// learner's attempt and the reviewer's preview, so both show the form the same way.
import { AlertCircle, CircleHelp } from 'lucide-react';
import { useState } from 'react';
import { Label } from '@/components/ui/input.jsx';
import { cn } from '@/lib/utils';
import FieldInput from './FieldInput.jsx';
import { hintFor } from './guidance.js';

export default function Question({ field, number, value, disabled, messages = [], onChange, onBlur, onHintOpen, children }) {
  const [hintOpen, setHintOpen] = useState(false);
  const hint = hintFor(field);
  const hintId = `hint-${field.id}`;
  const feedbackId = messages.length ? `feedback-${field.id}` : undefined;
  const describedBy = [hint && hintOpen && hintId, feedbackId].filter(Boolean).join(' ') || undefined;
  const isCheckbox = field.input_type === 'checkbox';
  const input = (
    <FieldInput field={field} value={value ?? null} disabled={disabled} invalid={messages.length > 0} describedBy={describedBy} onChange={onChange} onBlur={onBlur} />
  );
  const label = (
    <Label htmlFor={`field-${field.id}`} className={cn('leading-5', isCheckbox && 'cursor-pointer')}>
      {field.label}
      {field.required && <span className="text-destructive"> *<span className="sr-only"> (required)</span></span>}
    </Label>
  );

  // US-12: the hint opens under the question, so the label and the answer stay as they are.
  function toggleHint() {
    if (!hintOpen) onHintOpen?.(field.id);
    setHintOpen(!hintOpen);
  }
  const hintButton = hint && (
    <button
      type="button"
      aria-expanded={hintOpen}
      aria-controls={hintId}
      onClick={toggleHint}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] font-medium transition-colors',
        isCheckbox && 'ml-auto',
        hintOpen ? 'bg-accent-soft text-accent-soft-foreground' : 'text-primary hover:bg-accent-soft',
      )}
    >
      <CircleHelp className="size-3.5" />{hintOpen ? 'Hide hint' : 'Hint'}
      <span className="sr-only"> for {field.label}</span>
    </button>
  );

  return (
    <div className={cn('px-5 py-4', messages.length && 'bg-destructive-soft/40')}>
      <div className="flex gap-2">
        <span aria-hidden className="w-5 shrink-0 pt-px text-xs leading-5 tabular-nums text-muted-foreground">{number}.</span>
        <div className={cn('flex min-w-0 flex-1 gap-2.5', isCheckbox ? 'items-start' : 'flex-col')}>
          {isCheckbox && input}
          {isCheckbox ? label : <div className="flex items-start justify-between gap-3">{label}{hintButton}</div>}
          {isCheckbox && hintButton}
          {!isCheckbox && input}
        </div>
      </div>
      <div className="flex flex-col gap-1 pl-7 empty:hidden [&>*:first-child]:mt-2">
        {hint && hintOpen && (
          <p id={hintId} className="rounded-md bg-accent-soft px-3 py-2 text-[13px] leading-relaxed text-accent-soft-foreground">{hint.text}</p>
        )}
        {children}
        {messages.length > 0 && (
          <ul id={feedbackId} className="space-y-0.5 text-[13px] font-medium text-destructive">
            {messages.map((m) => <li key={m} className="flex items-center gap-1.5"><AlertCircle className="size-3.5" />{m}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

// Feedback items grouped by field, as the API returns them flat.
export function messagesByField(feedback = []) {
  const map = {};
  for (const item of feedback) (map[item.fieldId] ??= []).push(item.errorMessage);
  return map;
}
