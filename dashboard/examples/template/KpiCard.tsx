import type { ReactNode } from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
  detail?: string;
  accent?: string;
  icon?: ReactNode;
}

export function KpiCard({ label, value, detail, accent, icon }: KpiCardProps) {
  return (
    <article className="glass-panel rounded-lg border border-slate-700/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
        {icon ? <span className="text-slate-400">{icon}</span> : null}
      </div>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      {detail ? <p className={`mt-1 text-xs ${accent ?? 'text-slate-300'}`}>{detail}</p> : null}
    </article>
  );
}
