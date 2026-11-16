// AI drafts of hints and translations. A language model writes a first draft;
// the Form Reviewer reads, edits and approves it. Drafts never reach learners
// on their own, and a form is approved only once its drafts are reviewed.
import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert.jsx';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Checkbox } from '@/components/ui/input.jsx';
import { Progress } from '@/components/ui/progress.jsx';

export function countDrafts(fields = []) {
  return fields.reduce((n, f) => n + (f.hints ?? []).filter((h) => h.ai_draft).length + (f.translations ?? []).filter((t) => t.ai_draft).length, 0);
}

export function aiErrorMessage(error) {
  if (error?.code === 'AI_NOT_CONFIGURED' || error?.code === 'AI_FAILED') return error.message;
  if (error?.status === 409) return 'This form can no longer be changed.';
  return 'The AI drafts could not be made. Please try again.';
}

const BATCH = 8;
const ORIGINAL = 'en';

const hasHint = (field) => (field.hints ?? []).some((h) => h.language_code === ORIGINAL);

function chunks(list) {
  const out = [];
  for (let i = 0; i < list.length; i += BATCH) out.push(list.slice(i, i + BATCH));
  return out;
}

const range = (batch, all) => {
  const first = all.indexOf(batch[0]) + 1;
  return `questions ${first} to ${first + batch.length - 1} of ${all.length}`;
};

/**
 * The work, as small steps: hints first, so the translations that follow
 * include the new hints. Mirrors what the server drafts for each step.
 */
export function planSteps(fields, { hints, languages }) {
  const steps = [];
  const needingHints = hints ? fields.filter((f) => !hasHint(f)) : [];
  for (const batch of chunks(needingHints)) {
    steps.push({ task: 'hints', fieldIds: batch.map((f) => f.id), label: `Writing hints, ${range(batch, needingHints)}` });
  }
  for (const { code, name } of languages) {
    const willHaveHint = (f) => hasHint(f) || needingHints.includes(f);
    const needing = fields.filter((f) => {
      const existing = (f.translations ?? []).find((t) => t.language_code === code);
      return !existing || (!existing.guidance_text && willHaveHint(f));
    });
    for (const batch of chunks(needing)) {
      steps.push({ task: 'translations', languages: [code], fieldIds: batch.map((f) => f.id), label: `Translating into ${name}, ${range(batch, needing)}` });
    }
  }
  return steps;
}

/** One dialog for both kinds of draft. */
export function AIDraftDialog({ fields, languages: allLanguages = [], open, onOpenChange, onRun }) {
  const languages = allLanguages.filter((l) => l.code !== ORIGINAL);
  const withoutHint = fields.filter((f) => !hasHint(f)).length;
  const [hints, setHints] = useState(withoutHint > 0);
  const [chosen, setChosen] = useState(() => languages.map((l) => l.code));
  const toggle = (code) => setChosen((c) => (c.includes(code) ? c.filter((x) => x !== code) : [...c, code]));
  const plan = planSteps(fields, { hints, languages: languages.filter((l) => chosen.includes(l.code)) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Draft guidance with AI</DialogTitle>
          <DialogDescription>
            Drafts fill in only what is missing and stay hidden from learners until you approve them. Only the form&rsquo;s questions are sent, never a learner&rsquo;s answers.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="ai-hints" className="flex cursor-pointer items-start gap-2 text-sm">
          <Checkbox id="ai-hints" checked={hints} disabled={!withoutHint} onChange={() => setHints((h) => !h)} />
          <span>
            <span className="font-medium">Hints</span>
            <span className="block text-[13px] text-muted-foreground">{withoutHint ? `For the ${withoutHint} question${withoutHint === 1 ? '' : 's'} without one.` : 'Every question already has a hint.'}</span>
          </span>
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Translations of each label and hint</legend>
          <p className="text-[13px] text-muted-foreground">Hints are written first, so new hints are translated too.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {languages.map(({ code, name }) => (
              <label key={code} htmlFor={`ai-lang-${code}`} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox id={`ai-lang-${code}`} checked={chosen.includes(code)} onChange={() => toggle(code)} />
                <span lang={code}>{name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-[13px] text-muted-foreground" role="status">
          {plan.length ? `${plan.length} step${plan.length === 1 ? '' : 's'}; progress is shown as each finishes.` : 'Nothing is missing for what you chose.'}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!plan.length} onClick={() => onRun(plan)}><Sparkles />Start drafting</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Progress of a running draft, with a way to stop after the current step. */
export function DraftProgress({ run, onStop }) {
  if (!run) return null;
  const done = run.index;
  return (
    <div role="status" aria-live="polite" className="space-y-2 border-b bg-muted/40 px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <span className="flex min-w-0 items-center gap-2">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
          <span className="min-w-0">
            <span className="font-medium">Step {Math.min(done + 1, run.steps.length)} of {run.steps.length}:</span> {run.steps[Math.min(done, run.steps.length - 1)].label}
          </span>
        </span>
        <Button size="sm" variant="ghost" onClick={onStop} disabled={run.stopping}>{run.stopping ? 'Stopping after this step…' : 'Stop'}</Button>
      </div>
      <Progress value={done} max={run.steps.length} label="AI drafting progress" />
      <p className="text-xs text-muted-foreground tabular-nums">{run.created + run.updated} draft{run.created + run.updated === 1 ? '' : 's'} so far</p>
    </div>
  );
}

/** Shown while AI drafts wait: what that means and how to finish. */
export function DraftsBanner({ count, busy, onApproveAll, onDiscardAll }) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (!count) return null;
  return (
    <Alert variant="warning" className="mb-6">
      <Sparkles />
      <div className="flex flex-1 flex-col gap-3">
        <p>
          <span className="font-medium">{count} AI draft{count === 1 ? ' is' : 's are'} waiting for your review.</span>{' '}
          Learners do not see drafts, and the form cannot be approved until you approve or discard them. Open a question&rsquo;s
          hint and translations to read and correct one; saving it approves it.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onApproveAll} disabled={busy}>Approve all drafts</Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDiscard(true)} disabled={busy}>Discard all drafts</Button>
        </div>
      </div>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard all AI drafts?</AlertDialogTitle>
            <AlertDialogDescription>Every hint and translation still marked as an AI draft is removed. Guidance you approved or wrote yourself stays.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep drafts</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDiscardAll}>Discard drafts</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Alert>
  );
}
