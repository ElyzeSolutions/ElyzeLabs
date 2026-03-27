import { formatTs } from '../../lib/format';
import type { EventRow } from '../../types/dashboard';
import { EmptyState } from './EmptyState';
import { levelClass } from './tone';

interface EventFeedProps {
  events: EventRow[];
  loading: boolean;
  maxHeightClass?: string;
}

export function EventFeed({ events, loading, maxHeightClass = 'max-h-[540px]' }: EventFeedProps) {
  return (
    <div className={`space-y-2 overflow-y-auto pr-1 ${maxHeightClass}`}>
      {events.map((event) => (
        <div key={event.id} className="rounded border border-slate-700/70 bg-slate-900/30 p-2.5">
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>{formatTs(event.ts)}</span>
            <span className={levelClass(event.level)}>{event.level.toUpperCase()}</span>
          </div>
          <p className="mt-1 text-xs text-slate-100">
            {event.source} • {event.type}
          </p>
          <p className="mt-1 text-xs text-slate-300">{event.message}</p>
        </div>
      ))}
      {!events.length && !loading ? (
        <EmptyState title="No events yet" message="Wire your runtime emitter and events will land here." />
      ) : null}
    </div>
  );
}
