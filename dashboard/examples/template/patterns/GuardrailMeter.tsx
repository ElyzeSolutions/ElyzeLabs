interface GuardrailMeterProps {
  title: string;
  metricLabel: string;
  currentValue: number;
  limitValue: number;
  formatValue?: (value: number) => string;
  warningThresholdPct?: number;
  criticalThresholdPct?: number;
  warningMessage?: string;
  criticalMessage?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function GuardrailMeter({
  title,
  metricLabel,
  currentValue,
  limitValue,
  formatValue,
  warningThresholdPct = 66,
  criticalThresholdPct = 90,
  warningMessage = 'Guardrail approaching threshold.',
  criticalMessage = 'Guardrail at critical level. Escalation recommended.',
}: GuardrailMeterProps) {
  const safeLimit = limitValue > 0 ? limitValue : 1;
  const usedPct = (currentValue / safeLimit) * 100;
  const clampedPct = clamp(usedPct, 0, 100);
  const tone = clampedPct >= criticalThresholdPct ? 'critical' : clampedPct >= warningThresholdPct ? 'warning' : 'healthy';
  const formatter = formatValue ?? ((value: number) => value.toFixed(2));

  const barClass =
    tone === 'critical'
      ? 'from-rose-500 to-rose-400'
      : tone === 'warning'
        ? 'from-amber-500 to-amber-300'
        : 'from-emerald-500 to-emerald-300';
  const textClass =
    tone === 'critical'
      ? 'text-rose-300'
      : tone === 'warning'
        ? 'text-amber-300'
        : 'text-emerald-300';

  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.14em] text-slate-300">{title}</p>
        <p className={`text-xs font-mono ${textClass}`}>{clampedPct.toFixed(1)}% used</p>
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
        <span>{metricLabel}</span>
        <span className="font-mono">
          {formatter(currentValue)} / {formatter(limitValue)}
        </span>
      </div>

      <div className="h-2.5 overflow-hidden rounded bg-slate-950/90">
        <div
          className={`h-full rounded bg-gradient-to-r transition-[width] duration-300 ${barClass}`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>

      {tone !== 'healthy' ? (
        <p className={`mt-2 text-xs ${textClass}`}>
          {tone === 'critical' ? criticalMessage : warningMessage}
        </p>
      ) : null}
    </div>
  );
}
