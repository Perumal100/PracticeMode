// The versions of a form a reviewer published, newest first, and what changed
// in each, so a learner who practised an earlier version knows what is new.
import { ChevronDown, History } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { formatDateTime } from '@/lib/format.js';
import { getFormVersions as defaultGetFormVersions } from '../../api/catalog.js';

function Changes({ changes }) {
  if (!changes) return <p className="text-[13px] text-muted-foreground">The first published version.</p>;
  const { added, removed, changed } = changes;
  if (!added.length && !removed.length && !changed.length) return <p className="text-[13px] text-muted-foreground">The wording or order changed; the questions are the same.</p>;
  return (
    <ul className="space-y-1 text-[13px]">
      {added.map((label) => <li key={`a-${label}`}><span className="font-medium text-success">New question:</span> {label}</li>)}
      {changed.map((item) => <li key={`c-${item.label}`}><span className="font-medium">Changed:</span> {item.label} ({item.details.join(', ')})</li>)}
      {removed.map((label) => <li key={`r-${label}`}><span className="font-medium text-destructive">Removed:</span> {label}</li>)}
    </ul>
  );
}

export default function VersionHistory({ formId, version, getFormVersions = defaultGetFormVersions }) {
  const [state, setState] = useState({ status: 'idle', versions: [] });

  function toggle(event) {
    if (!event.currentTarget.open || state.status !== 'idle') return;
    setState({ status: 'loading', versions: [] });
    getFormVersions(formId).then(
      (versions) => setState({ status: 'ready', versions }),
      () => setState({ status: 'error', versions: [] }),
    );
  }

  return (
    <details onToggle={toggle} className="group rounded-lg border bg-card shadow-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-5 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <History className="size-4 text-muted-foreground" />Version history
        <span className="text-[13px] font-normal text-muted-foreground">You are viewing version {version}</span>
        <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="border-t">
        {state.status === 'loading' && <div className="space-y-2 p-5" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
        {state.status === 'error' && <p role="alert" className="px-5 py-4 text-sm text-destructive">The version history could not be loaded.</p>}
        {state.status === 'ready' && (
          <ol className="divide-y">
            {state.versions.map((item) => (
              <li key={item.id} className="space-y-1.5 px-5 py-3">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">Version {item.version}</span>
                  <span className="text-[13px] text-muted-foreground">published {formatDateTime(item.publishedAt)}</span>
                  {item.current && <Badge variant="success">Current</Badge>}
                  {item.version === version && !item.current && <Badge variant="secondary">You are viewing this</Badge>}
                </p>
                <Changes changes={item.changes} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}
