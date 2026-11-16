// The history of one help request: who did what, and when.
import { formatDateTime } from '@/lib/format.js';

export function MeetingLink({ href, className = '' }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex max-w-full items-center gap-1 break-all font-medium text-primary underline underline-offset-4 ${className}`}>
      {href}<span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export default function SessionTimeline({ events = [], viewerName }) {
  if (!events.length) return <p className="text-[13px] text-muted-foreground">No history recorded.</p>;
  return (
    <ol className="space-y-2.5 border-l pl-4">
      {events.map((event) => (
        <li key={`${event.action}-${event.at}`} className="relative text-[13px]">
          <span aria-hidden className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-muted-foreground/60" />
          <p>
            <span className="font-medium">{event.label}</span>
            {event.by && <span className="text-muted-foreground"> by {event.by === viewerName ? 'you' : event.by}</span>}
          </p>
          {event.detail && (/^https?:\/\//.test(event.detail) ? <MeetingLink href={event.detail} className="text-[13px] font-normal" /> : <p className="text-muted-foreground">{event.detail}</p>)}
          <p className="tabular-nums text-xs text-muted-foreground">{formatDateTime(event.at)}</p>
        </li>
      ))}
    </ol>
  );
}
