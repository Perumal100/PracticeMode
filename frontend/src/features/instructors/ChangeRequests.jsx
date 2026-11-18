// Form Reviewers answer instructors' reports of mistakes in published forms.
// Fixing the form itself is done with "Revise form" on its review page.
import { AlertCircle, ArrowRight, Inbox, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state.jsx';
import { PageHeader } from '@/components/page-header.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Label, Textarea } from '@/components/ui/input.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Tabs } from '@/components/ui/tabs.jsx';
import { formatDateTime } from '@/lib/format.js';
import * as defaultApi from '../../api/instructors.js';
import { ChangeStatus } from './InstructorForms.jsx';

const TABS = [['OPEN', 'Open'], ['RESOLVED', 'Resolved'], ['DECLINED', 'Declined']];

function Answer({ change, onAnswered, answerChangeRequest }) {
  const [response, setResponse] = useState('');
  const [state, setState] = useState({ busy: null, error: null });

  async function answer(action) {
    if (!response.trim()) {
      setState({ busy: null, error: 'Tell the instructor what you did or why not.' });
      return;
    }
    setState({ busy: action, error: null });
    try {
      await answerChangeRequest(change.id, action, response.trim());
      onAnswered();
    } catch (error) {
      setState({ busy: null, error: error?.status === 409 ? 'Someone has already answered this request.' : 'The answer could not be saved. Please try again.' });
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <Label htmlFor={`answer-${change.id}`} className="text-[13px]">Answer to the instructor</Label>
      <Textarea id={`answer-${change.id}`} rows={2} maxLength={2000} value={response} onChange={(e) => setResponse(e.target.value)}
        placeholder="For example: fixed in a revision, or the real form does not ask for this" aria-invalid={state.error ? true : undefined} />
      {state.error && <p role="alert" className="text-[13px] font-medium text-destructive">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => answer('resolve')} disabled={Boolean(state.busy)}>{state.busy === 'resolve' && <Loader2 className="animate-spin motion-reduce:animate-none" />}Mark as resolved</Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => answer('decline')} disabled={Boolean(state.busy)}>Decline</Button>
      </div>
    </div>
  );
}

export default function ChangeRequests({ status = 'OPEN', onStatusChange, onOpenForm, api: overrides = {} }) {
  const [api] = useState(() => ({ ...defaultApi, ...overrides }));
  const tab = TABS.some(([v]) => v === status) ? status : 'OPEN';
  const [state, setState] = useState({ status: 'loading', items: [] });

  const load = useCallback(() => {
    setState({ status: 'loading', items: [] });
    api.listChangeRequests(tab).then((items) => setState({ status: 'ready', items }),
      (error) => setState({ status: 'error', items: [], error: error?.status === 403 ? 'Only Form Reviewers can see change requests.' : 'The change requests could not be loaded.' }));
  }, [api, tab]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader title="Change requests" description="Mistakes instructors found in published forms. To fix one, open the form and use Revise form, then answer the instructor here." />
      <Tabs label="Change request status" value={tab} onValueChange={onStatusChange} items={TABS.map(([value, label]) => ({ value, label }))} />
      <div className="mt-4">
        {state.status === 'loading' && <div className="space-y-3" aria-busy="true">{[0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>}
        {state.status === 'error' && <Alert variant="destructive"><AlertCircle />{state.error}</Alert>}
        {state.status === 'ready' && !state.items.length && (
          <EmptyState role="status" icon={Inbox} title={tab === 'OPEN' ? 'No open change requests' : 'Nothing in this list yet'}
            description={tab === 'OPEN' ? 'When an instructor reports a mistake in a published form, it appears here.' : undefined} />
        )}
        {state.status === 'ready' && state.items.length > 0 && (
          <ul className="space-y-4">
            {state.items.map((change) => (
              <li key={change.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{change.formTitle}</p>
                      <p className="text-[13px] text-muted-foreground">{change.fieldLabel ? `Question: ${change.fieldLabel}` : 'The whole form'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ChangeStatus status={change.status} />
                      <Button size="sm" variant="outline" onClick={() => onOpenForm(change.formId)} aria-label={`Open ${change.formTitle}`}>Open form<ArrowRight /></Button>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm">{change.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">From {change.instructorName}, {formatDateTime(change.createdAt)}</p>
                  {change.status === 'OPEN'
                    ? <Answer change={change} onAnswered={load} answerChangeRequest={api.answerChangeRequest} />
                    : <p className="mt-3 rounded-md bg-muted px-3 py-2 text-[13px]"><span className="font-medium">{change.resolvedBy}:</span> {change.response}</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
