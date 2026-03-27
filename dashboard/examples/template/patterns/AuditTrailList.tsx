export interface AuditTrailEntry {
  id: string;
  status: 'approved' | 'blocked' | 'pending' | string;
  source: string;
  reason: string;
  actor?: string;
  timestamp?: string;
}

interface AuditTrailListProps {
  title: string;
  entries: AuditTrailEntry[];
  maxHeightClassName?: string;
  emptyMessage?: string;
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  approved: 'border-emerald-300/35 bg-emerald-500/12 text-emerald-200',
  blocked: 'border-rose-300/35 bg-rose-500/12 text-rose-200',
  pending: 'border-amber-300/35 bg-amber-500/12 text-amber-200',
};

const STATUS_ACCENT_CLASS: Record<string, string> = {
  approved: 'border-emerald-400/35',
  blocked: 'border-rose-400/35',
  pending: 'border-amber-400/35',
};

export function AuditTrailList({
  title,
  entries,
  maxHeightClassName = 'max-h-[260px]',
  emptyMessage = 'No audit entries yet.',
}: AuditTrailListProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.14em] text-slate-300">{title}</p>
        <span className="rounded border border-slate-700/70 bg-slate-950/70 px-2 py-1 text-[10px] font-mono text-slate-300">
          {entries.length}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700/70 bg-slate-900/30 px-3 py-6 text-center text-xs text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className={`space-y-2 overflow-y-auto pr-1 ${maxHeightClassName}`}>
          {entries.map((entry) => {
            const status = String(entry.status || '').toLowerCase();
            const badgeClass = STATUS_BADGE_CLASS[status] ?? 'border-slate-500/35 bg-slate-700/30 text-slate-200';
            const accentClass = STATUS_ACCENT_CLASS[status] ?? 'border-slate-600/60';
            return (
              <article
                key={entry.id}
                className={`rounded-lg border-l-2 border border-slate-700/70 bg-slate-900/35 px-3 py-2 ${accentClass}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${badgeClass}`}>
                    {status || 'event'}
                  </span>
                  <span className="text-xs text-slate-300">{entry.source}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{entry.reason}</p>
                {(entry.actor || entry.timestamp) ? (
                  <p className="mt-1 text-[11px] font-mono text-slate-500">
                    {entry.actor ? `by ${entry.actor}` : ''}
                    {entry.actor && entry.timestamp ? ' · ' : ''}
                    {entry.timestamp ?? ''}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
