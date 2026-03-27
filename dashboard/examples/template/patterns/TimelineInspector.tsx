import { useEffect, useMemo, useState } from 'react';

export interface TimelineStep {
  id: string;
  label: string;
  summary: string;
  timestamp: string;
  status: 'done' | 'active' | 'pending' | 'warning' | 'error';
  detail?: string;
}

interface TimelineInspectorProps {
  title: string;
  subtitle?: string;
  steps: TimelineStep[];
  defaultStepId?: string;
}

const STATUS_CLASS: Record<TimelineStep['status'], string> = {
  done: 'border-emerald-300/40 bg-emerald-500/12 text-emerald-200',
  active: 'border-cyan-300/45 bg-cyan-500/12 text-cyan-200',
  pending: 'border-slate-500/60 bg-slate-700/45 text-slate-200',
  warning: 'border-amber-300/45 bg-amber-500/12 text-amber-200',
  error: 'border-rose-300/45 bg-rose-500/12 text-rose-200',
};

export function TimelineInspector({ title, subtitle, steps, defaultStepId }: TimelineInspectorProps) {
  const [activeStepId, setActiveStepId] = useState<string>(defaultStepId ?? steps[0]?.id ?? '');

  useEffect(() => {
    if (!steps.length) {
      setActiveStepId('');
      return;
    }
    if (!steps.some((step) => step.id === activeStepId)) {
      setActiveStepId(defaultStepId && steps.some((step) => step.id === defaultStepId) ? defaultStepId : steps[0].id);
    }
  }, [activeStepId, defaultStepId, steps]);

  const activeStep = useMemo(
    () => steps.find((step) => step.id === activeStepId) ?? steps[0],
    [activeStepId, steps],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.14em] text-slate-300">{title}</p>
        {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
      </div>

      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700/70 bg-slate-900/25 px-3 py-8 text-center text-xs text-slate-500">
          No lifecycle events yet.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr]">
          <div className="max-h-[320px] space-y-2 overflow-y-auto rounded-lg border border-slate-700/70 bg-slate-950/45 p-2">
            {steps.map((step) => {
              const isActive = step.id === activeStepId;
              const statusClass = STATUS_CLASS[step.status];
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStepId(step.id)}
                  className={`w-full rounded-md border px-2.5 py-2 text-left transition ${isActive ? 'border-cyan-300/40 bg-cyan-500/10' : 'border-slate-700/70 bg-slate-900/35 hover:border-slate-500/70'}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-100">{step.label}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.11em] ${statusClass}`}>{step.status}</span>
                  </div>
                  <p className="line-clamp-1 text-xs text-slate-400">{step.summary}</p>
                  <p className="mt-1 text-[11px] font-mono text-slate-500">{step.timestamp}</p>
                </button>
              );
            })}
          </div>

          <article className="rounded-lg border border-slate-700/70 bg-slate-900/35 p-3">
            {activeStep ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-100">{activeStep.label}</p>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.11em] ${STATUS_CLASS[activeStep.status]}`}>
                    {activeStep.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{activeStep.summary}</p>
                <p className="text-xs font-mono text-slate-500">{activeStep.timestamp}</p>
                {activeStep.detail ? (
                  <div className="rounded border border-slate-700/70 bg-slate-950/50 p-2 text-xs text-slate-300">
                    {activeStep.detail}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Select a step to inspect details.</p>
            )}
          </article>
        </div>
      )}
    </div>
  );
}
