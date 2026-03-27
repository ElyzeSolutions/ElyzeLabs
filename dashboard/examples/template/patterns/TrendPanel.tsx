interface TrendPoint {
  label: string;
  value: number;
}

interface TrendPanelProps {
  title: string;
  subtitle?: string;
  points: TrendPoint[];
}

function asPct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(6, Math.min(100, Math.round((value / max) * 100)));
}

export function TrendPanel({ title, subtitle, points }: TrendPanelProps) {
  const values = points.map((point) => point.value);
  const max = values.length ? Math.max(...values) : 0;
  const min = values.length ? Math.min(...values) : 0;
  const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-slate-300">{title}</p>
          {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="text-[10px] font-mono text-slate-500">
          min {min.toFixed(1)} · avg {avg.toFixed(1)} · max {max.toFixed(1)}
        </div>
      </div>

      <div className="flex min-h-[140px] items-end gap-2 rounded border border-slate-800/80 bg-slate-950/50 p-2">
        {points.map((point) => (
          <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div
              className="w-full rounded-t-sm bg-cyan-500/35 transition-[height,background-color] duration-200 hover:bg-cyan-400/55"
              style={{ height: `${asPct(point.value, max)}%` }}
              title={`${point.label}: ${point.value.toFixed(2)}`}
            />
            <span className="w-full truncate text-center text-[10px] text-slate-500">{point.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
