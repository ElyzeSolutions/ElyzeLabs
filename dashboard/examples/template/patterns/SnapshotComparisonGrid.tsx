type SnapshotTone = 'emerald' | 'amber' | 'cyan' | 'rose';

export interface SnapshotMetric {
  id: string;
  label: string;
  value: string;
  accentClassName?: string;
}

export interface SnapshotPanel {
  id: string;
  label: string;
  meta?: string;
  tone?: SnapshotTone;
  metrics: SnapshotMetric[];
}

interface SnapshotComparisonGridProps {
  title: string;
  subtitle?: string;
  panels: SnapshotPanel[];
}

const PANEL_TONE_CLASS: Record<SnapshotTone, string> = {
  emerald: 'border-emerald-400/25 bg-emerald-500/[0.06]',
  amber: 'border-amber-400/25 bg-amber-500/[0.06]',
  cyan: 'border-cyan-400/25 bg-cyan-500/[0.06]',
  rose: 'border-rose-400/25 bg-rose-500/[0.06]',
};

const LABEL_TONE_CLASS: Record<SnapshotTone, string> = {
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
  cyan: 'text-cyan-300',
  rose: 'text-rose-300',
};

export function SnapshotComparisonGrid({ title, subtitle, panels }: SnapshotComparisonGridProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.14em] text-slate-300">{title}</p>
        {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {panels.map((panel) => {
          const tone = panel.tone ?? 'cyan';
          return (
            <article
              key={panel.id}
              className={`rounded-lg border px-3 py-3 ${PANEL_TONE_CLASS[tone]}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={`text-[11px] uppercase tracking-[0.12em] ${LABEL_TONE_CLASS[tone]}`}>{panel.label}</p>
                {panel.meta ? (
                  <span className="text-[10px] font-mono text-slate-400">{panel.meta}</span>
                ) : null}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {panel.metrics.map((metric) => (
                  <div key={metric.id}>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
                    <p className={`font-mono text-sm text-slate-100 ${metric.accentClassName ?? ''}`.trim()}>
                      {metric.value}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
