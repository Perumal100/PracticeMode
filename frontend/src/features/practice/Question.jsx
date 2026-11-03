// One numbered question with its control and feedback. Shared by the learner's
// attempt and the reviewer's preview, so both show the form the same way.
import { AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/input.jsx';
import { cn } from '@/lib/utils';
import FieldInput from './FieldInput.jsx';

export default function Question({ field, number, value, disabled, messages = [], onChange, onBlur, children }) {
  const feedbackId = messages.length ? `feedback-${field.id}` : undefined;
  const isCheckbox = field.input_type === 'checkbox';
  const input = (
    <FieldInput field={field} value={value ?? null} disabled={disabled} invalid={messages.length > 0} describedBy={feedbackId} onChange={onChange} onBlur={onBlur} />
  );
  return (
    <div className={cn('px-5 py-4', messages.length && 'bg-destructive-soft/40')}>
      <div className="flex gap-2">
        <span aria-hidden className="w-5 shrink-0 pt-px text-xs leading-5 tabular-nums text-muted-foreground">{number}.</span>
        <div className={cn('flex min-w-0 flex-1 gap-2.5', isCheckbox ? 'items-start' : 'flex-col')}>
          {isCheckbox && input}
          <Label htmlFor={`field-${field.id}`} className={cn('leading-5', isCheckbox && 'cursor-pointer')}>
            {field.label}
            {field.required && <span className="text-destructive"> *<span className="sr-only"> (required)</span></span>}
          </Label>
          {!isCheckbox && input}
        </div>
      </div>
      <div className="flex flex-col gap-1 pl-7 empty:hidden [&>*:first-child]:mt-2">
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
