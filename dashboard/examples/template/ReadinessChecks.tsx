import type { ReadinessCheck } from '../../types/dashboard';

interface ReadinessChecksProps {
  checks: ReadinessCheck[];
}

export function ReadinessChecks({ checks }: ReadinessChecksProps) {
  if (!checks.length) return null;

  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">Readiness Checks</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {checks.map((check) => (
          <span
            key={check.name}
            className={`rounded border px-2 py-1 text-[11px] uppercase tracking-wide ${
              check.ok
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-400/40 bg-rose-500/10 text-rose-200'
            }`}
          >
            {check.name}
          </span>
        ))}
      </div>
    </div>
  );
}
