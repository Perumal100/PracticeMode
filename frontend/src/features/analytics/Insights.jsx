// Practice insights for Form Reviewers: how published forms are used.
// Counts only. The API never returns learner names, IDs or answers, and
// nothing here asks for them.
import { AlertCircle, BarChart3, CheckCircle2, ChevronRight, Clock, FileText, Send, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state.jsx';
import { PageHeader } from '@/components/page-header.jsx';
import { StatCard } from '@/components/stat-card.jsx';
import { Alert } from '@/components/ui/alert.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Progress } from '@/components/ui/progress.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { Tabs } from '@/components/ui/tabs.jsx';
import { timeAgo } from '@/lib/format';
import { getAnalytics as defaultGetAnalytics, getFormAnalytics as defaultGetFormAnalytics } from '../../api/analytics.js';
import { FIELD_TYPES } from '../review/FieldEditor.jsx';
import { ActivityChart } from './ActivityChart.jsx';

const RANGES = [7, 14, 30];
const TYPE_LABEL = Object.fromEntries(FIELD_TYPES);
export const RULE_LABEL = {
  REQUIRED: 'Left blank',
  FORMAT: 'Wrong format',
  MIN_LENGTH: 'Too short',
  MAX_LENGTH: 'Too long',
  MIN_VALUE: 'Below the minimum',
  MAX_VALUE: 'Above the maximum',
  ALLOWED_VALUES: 'Not one of the options',
};

const percent = (rate) => (rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)}%`);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function errorMessage(error) {
  if (error?.status === 401) return 'Your session has ended. Sign in again.';
  if (error?.status === 403) return 'Only Form Reviewers can see practice insights.';
  if (error?.status === 404) return 'This form does not exist.';
  return 'Practice insights could not be loaded. Please try again.';
}

function useLoad(load, deps) {
  const [result, setResult] = useState({ state: 'loading', data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    setResult((r) => ({ ...r, state: r.data ? 'refreshing' : 'loading' }));
    load().then(
      (data) => !cancelled && setResult({ state: 'ready', data, error: null }),
      (error) => !cancelled && setResult({ state: 'error', data: null, error: errorMessage(error) }),
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return result;
}

function PrivacyNote() {
  return (
    <p className="mt-8 flex items-start gap-2 text-xs text-muted-foreground">
      <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" />
      Counts only. Learner names, sign-in codes and answers are never shown here; problem counts come from the rule each answer broke, not from what was typed.
    </p>
  );
}

export default function Insights({ onOpen, api = {} }) {
  const getAnalytics = api.getAnalytics ?? defaultGetAnalytics;
  const [days, setDays] = useState(14);
  const result = useLoad(() => getAnalytics(days), [getAnalytics, days]);
  const header = (
    <PageHeader
      title="Practice insights"
      description="How learners use the published forms: who practised, how far they got, and which questions trip them up."
      actions={<Tabs label="Activity range" value={days} onValueChange={setDays} items={RANGES.map((d) => ({ value: d, label: `${d} days` }))} />}
    />
  );

  if (result.state === 'error') {
    return <>{header}<Alert variant="destructive"><AlertCircle />{result.error}</Alert></>;
  }
  const data = result.data;
  const loading = result.state === 'loading';
  const totals = data?.totals;
  const rangeStarted = data?.activity.series.reduce((n, d) => n + d.started, 0) ?? 0;

  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Learners who practised" value={totals?.learners} icon={Users} loading={loading} hint="Each learner sign-in counts once" />
        <StatCard label="Attempts started" value={totals?.attempts} icon={TrendingUp} loading={loading} hint={totals && `${rangeStarted} in the last ${days} days`} />
        <StatCard label="Submitted" value={totals?.submitted} icon={Send} tone="success" loading={loading} hint={totals && `${percent(totals.completionRate)} of attempts`} />
        <StatCard label="Clean submissions" value={totals?.cleanSubmissions} icon={CheckCircle2} tone="success" loading={loading} hint="No feedback on any answer" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Attempts started per day</CardTitle>
          <CardDescription>Last {days} days. Hover or focus a day to see how many were submitted.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? <Skeleton className="h-44" /> : <ActivityChart series={data.activity.series} />}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Forms</CardTitle>
          <CardDescription>
            {totals ? `${plural(totals.publishedForms, 'published form')} · ${totals.awaitingReview} awaiting review. Open a form to see where learners struggle.` : 'Loading…'}
          </CardDescription>
        </CardHeader>
        {loading ? (
          <CardContent className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</CardContent>
        ) : data.forms.length === 0 ? (
          <CardContent>
            <EmptyState icon={FileText} title="No published forms yet" description="Approve a form in the review queue. Its practice numbers will appear here." className="border-0" />
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Form</TableHead>
                <TableHead className="text-right">Learners</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Attempts</TableHead>
                <TableHead className="hidden w-44 sm:table-cell">Submitted</TableHead>
                <TableHead className="hidden text-right md:table-cell">Avg. issues</TableHead>
                <TableHead className="hidden lg:table-cell">Last practised</TableHead>
                <TableHead className="hidden w-8 sm:table-cell"><span className="sr-only">Open</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.forms.map((form) => (
                <TableRow key={form.id} className="cursor-pointer" onClick={() => onOpen(form.id)}>
                  <TableCell className="max-w-56 sm:max-w-72">
                    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(form.id); }} className="block max-w-full truncate text-left font-medium hover:underline">
                      {form.title}
                    </button>
                    {form.categories.length > 0 && <p className="truncate text-xs text-muted-foreground">{form.categories.join(' · ')}</p>}
                    <p className="text-xs text-muted-foreground sm:hidden">{form.submitted} submitted · {percent(form.completionRate)}</p>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{form.learners}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{form.attempts}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex items-center gap-2">
                      <Progress value={form.submitted} max={form.attempts || 1} label={`${form.title}: submitted attempts`} className="w-20" />
                      <span className="text-xs tabular-nums text-muted-foreground">{form.submitted} · {percent(form.completionRate)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{form.averageIssues ?? '—'}</TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">{form.lastPracticedAt ? timeAgo(form.lastPracticedAt) : 'Not yet'}</TableCell>
                  <TableCell className="hidden sm:table-cell"><ChevronRight className="size-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <PrivacyNote />
    </>
  );
}

function StruggleRow({ field, submissions }) {
  const rules = Object.entries(field.rules);
  return (
    <li className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="text-xs tabular-nums text-muted-foreground">{field.position}.</span>
          <span className="truncate">{field.label}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{TYPE_LABEL[field.input_type] ?? field.input_type}</Badge>
          {field.required && <Badge variant="secondary">Required</Badge>}
          {rules.map(([rule, n]) => <Badge key={rule} variant="warning">{RULE_LABEL[rule] ?? rule} · {n}</Badge>)}
        </div>
      </div>
      <div>
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold tabular-nums text-foreground">{percent(field.issueRate)}</span>
          <span className="text-muted-foreground">{field.submissionsWithIssue} of {plural(submissions, 'submission')}</span>
        </div>
        <Progress value={field.submissionsWithIssue} max={submissions} label={`${field.label}: submissions with feedback`} className="mt-1.5 h-2" />
      </div>
    </li>
  );
}

export function FormInsights({ formId, onBack, onReview, api = {} }) {
  const getFormAnalytics = api.getFormAnalytics ?? defaultGetFormAnalytics;
  const result = useLoad(() => getFormAnalytics(formId), [getFormAnalytics, formId]);
  const crumbs = [{ label: 'Practice insights', onClick: onBack }];

  if (result.state === 'loading') {
    return (
      <>
        <PageHeader title={<Skeleton className="h-7 w-72" />} breadcrumb={[...crumbs, { label: '…' }]} />
        <Skeleton className="h-96 rounded-lg" />
      </>
    );
  }
  if (result.state === 'error') {
    return (
      <>
        <PageHeader title="Insights unavailable" breadcrumb={[...crumbs, { label: 'Unavailable' }]} />
        <Alert variant="destructive"><AlertCircle />{result.error}</Alert>
      </>
    );
  }

  const data = result.data;
  const struggled = data.fields.filter((f) => f.submissionsWithIssue > 0).sort((a, b) => b.issueRate - a.issueRate || a.position - b.position);
  const smooth = data.fields.filter((f) => f.submissionsWithIssue === 0);
  return (
    <>
      <PageHeader
        title={data.title}
        breadcrumb={[...crumbs, { label: data.title }]}
        description={data.lastPracticedAt ? `Last practised ${timeAgo(data.lastPracticedAt)}` : 'No one has practised this form yet.'}
        actions={<Button variant="outline" onClick={() => onReview(data.id)}>Open in review</Button>}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Learners who practised" value={data.learners} icon={Users} />
        <StatCard label="Attempts started" value={data.attempts} icon={TrendingUp} hint={`${data.submitted} submitted`} />
        <StatCard label="Completion rate" value={percent(data.completionRate)} icon={Send} tone="success" hint={`${data.cleanSubmissions} with no feedback`} />
        <StatCard label="Median time to submit" value={data.medianMinutesToSubmit === null ? '—' : `${Math.round(data.medianMinutesToSubmit)} min`} icon={Clock} hint="From start to submission" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Where learners struggle</CardTitle>
          <CardDescription>Share of submissions that got feedback on each question, most-missed first. Badges show which rule was broken.</CardDescription>
        </CardHeader>
        {data.submitted === 0 ? (
          <CardContent>
            <EmptyState icon={BarChart3} title="No submissions yet" description="Once learners submit this form, the questions they find hardest appear here." className="border-0" />
          </CardContent>
        ) : (
          <>
            {struggled.length > 0 ? (
              <ol aria-label="Questions with feedback" className="divide-y">
                {struggled.map((field) => <StruggleRow key={field.id} field={field} submissions={data.submitted} />)}
              </ol>
            ) : (
              <CardContent className="text-sm text-muted-foreground">Every submission passed every rule.</CardContent>
            )}
            {smooth.length > 0 && (
              <div className="flex items-start gap-2 border-t px-5 py-4 text-[13px] text-muted-foreground">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                <p><span className="font-medium text-foreground">No problems on {plural(smooth.length, 'question')}:</span> {smooth.map((f) => f.label).join(', ')}</p>
              </div>
            )}
          </>
        )}
      </Card>
      <PrivacyNote />
    </>
  );
}
