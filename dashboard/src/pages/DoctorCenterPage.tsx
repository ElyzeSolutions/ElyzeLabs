import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowSquareOut, CheckCircle, FirstAidKit, Play, WarningCircle, XCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';

import { runDoctorRepair } from '../app/api';
import { doctorCenterQueryOptions } from '../app/queryOptions';
import { useAppStore } from '../app/store';
import type { CardMetric, DoctorCenterAreaRow, DoctorCenterCheckRow, DoctorCenterStatus, DoctorRepairActionRow } from '../app/types';
import { PageIntro } from '../components/ops/PageHeader';
import { useRouteHeaderMetrics } from '../components/shell/RouteHeaderContext';

const PANEL_CLASS = 'rounded-lg border border-white/10 bg-white/[0.035] p-5';
const CHECK_CLASS = 'rounded-lg border border-white/8 bg-black/15 p-4';
const BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50';

function statusTone(status: DoctorCenterStatus): string {
  switch (status) {
    case 'pass':
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100';
    case 'warn':
      return 'border-amber-300/25 bg-amber-300/10 text-amber-100';
    case 'fail':
      return 'border-rose-400/25 bg-rose-400/10 text-rose-100';
    default:
      return 'border-white/10 bg-white/5 text-white';
  }
}

function statusMetricTone(status: DoctorCenterStatus): CardMetric['tone'] {
  switch (status) {
    case 'pass':
      return 'positive';
    case 'warn':
      return 'warn';
    case 'fail':
      return 'critical';
    default:
      return 'neutral';
  }
}

function StatusIcon({ status }: { status: DoctorCenterStatus }) {
  if (status === 'pass') {
    return <CheckCircle size={16} weight="fill" />;
  }
  if (status === 'warn') {
    return <WarningCircle size={16} weight="fill" />;
  }
  return <XCircle size={16} weight="fill" />;
}

function ActionControl({
  action,
  busy,
  disabled,
  onRun
}: {
  action: DoctorRepairActionRow;
  busy: boolean;
  disabled: boolean;
  onRun: (action: DoctorRepairActionRow) => void;
}) {
  if (action.kind === 'navigate') {
    return (
      <a href={action.target} className={BUTTON_CLASS}>
        <ArrowSquareOut size={14} weight="bold" />
        {action.label}
      </a>
    );
  }

  return (
    <button type="button" className={PRIMARY_BUTTON_CLASS} disabled={disabled || busy} onClick={() => onRun(action)}>
      <Play size={14} weight="bold" />
      {busy ? 'Running...' : action.label}
    </button>
  );
}

function AreaPanel({
  area,
  busyActionId,
  canMutate,
  onRunAction
}: {
  area: DoctorCenterAreaRow;
  busyActionId: string | null;
  canMutate: boolean;
  onRunAction: (action: DoctorRepairActionRow) => void;
}) {
  const actionsById = useMemo(() => new Map(area.repairActions.map((action) => [action.id, action])), [area.repairActions]);

  return (
    <section className={PANEL_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase ${statusTone(area.status)}`}>
              <StatusIcon status={area.status} />
              {area.status}
            </span>
            <h2 className="text-lg font-semibold text-white">{area.label}</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-white/60">{area.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {area.repairActions.map((action) => (
            <ActionControl
              key={action.id}
              action={action}
              busy={busyActionId === action.id}
              disabled={!canMutate}
              onRun={onRunAction}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {area.metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-white/8 bg-white/[0.025] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">{metric.label}</p>
            <p className="mt-1 text-xl font-semibold text-white">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {area.checks.map((check) => (
          <DoctorCheckCard
            key={check.id}
            check={check}
            action={check.repairActionId ? actionsById.get(check.repairActionId) : undefined}
            busyActionId={busyActionId}
            canMutate={canMutate}
            onRunAction={onRunAction}
          />
        ))}
      </div>
    </section>
  );
}

function DoctorCheckCard({
  check,
  action,
  busyActionId,
  canMutate,
  onRunAction
}: {
  check: DoctorCenterCheckRow;
  action?: DoctorRepairActionRow;
  busyActionId: string | null;
  canMutate: boolean;
  onRunAction: (action: DoctorRepairActionRow) => void;
}) {
  return (
    <article className={CHECK_CLASS}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase ${statusTone(check.status)}`}>
              <StatusIcon status={check.status} />
              {check.status}
            </span>
            <h3 className="text-sm font-semibold text-white">{check.label}</h3>
          </div>
          <p className="mt-2 text-sm text-white/60">{check.summary}</p>
        </div>
        {action ? (
          <ActionControl action={action} busy={busyActionId === action.id} disabled={!canMutate} onRun={onRunAction} />
        ) : null}
      </div>
    </article>
  );
}

export function DoctorCenterPage() {
  const token = useAppStore((state) => state.token);
  const query = useQuery(doctorCenterQueryOptions(token));
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const doctor = query.data ?? null;
  const headerMetrics = useMemo<CardMetric[]>(
    () => [
      {
        id: 'doctor_overall',
        label: 'Doctor',
        value: doctor?.score ?? 0,
        displayValue: doctor?.overall ?? 'unknown',
        tone: doctor ? statusMetricTone(doctor.overall) : 'neutral'
      },
      {
        id: 'doctor_actions',
        label: 'Repair Actions',
        value: doctor?.repairActions.length ?? 0,
        displayValue: String(doctor?.repairActions.length ?? 0),
        tone: (doctor?.repairActions.length ?? 0) > 0 ? 'warn' : 'neutral'
      }
    ],
    [doctor]
  );
  useRouteHeaderMetrics(headerMetrics);

  const runAction = useCallback(
    async (action: DoctorRepairActionRow) => {
      if (!token || action.kind !== 'execute') {
        return;
      }
      setBusyActionId(action.id);
      try {
        const result = await runDoctorRepair(token, action.id, {
          approved: action.requiresApproval
        });
        toast.success(result.repair.summary);
        await query.refetch({ throwOnError: true });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Doctor repair failed.');
      } finally {
        setBusyActionId(null);
      }
    },
    [query, token]
  );

  const queryError = query.error instanceof Error ? query.error.message : query.error ? 'Doctor center unavailable.' : null;

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Operations"
        title="Repair Center"
        description="Readiness, skill lifecycle, schedule guardrails, and browser profile posture in one place."
        actions={
          <button type="button" className={BUTTON_CLASS} disabled={query.isFetching} onClick={() => query.refetch()}>
            <FirstAidKit size={16} weight="bold" />
            {query.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        }
        stats={[
          {
            label: 'Overall',
            value: doctor?.overall ?? 'unknown',
            detail: doctor ? `Score ${doctor.score}` : 'No snapshot loaded',
            tone: doctor ? statusMetricTone(doctor.overall) : 'neutral'
          },
          {
            label: 'Areas',
            value: doctor?.areas.length ?? 0,
            detail: doctor?.generatedAt ?? 'Waiting for gateway',
            tone: 'neutral'
          }
        ]}
      />

      {queryError ? <div className="rounded-lg border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">{queryError}</div> : null}

      {!doctor && query.isLoading ? (
        <div className={PANEL_CLASS}>Loading repair center...</div>
      ) : null}

      {doctor ? (
        <div className="grid gap-5">
          {doctor.areas.map((area) => (
            <AreaPanel
              key={area.id}
              area={area}
              busyActionId={busyActionId}
              canMutate={Boolean(token)}
              onRunAction={runAction}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
