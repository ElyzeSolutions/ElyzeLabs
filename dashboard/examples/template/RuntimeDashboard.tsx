import { formatUptime } from '../../lib/format';
import type { EventRow, ModuleAction, ModuleRow, Overview, Readiness } from '../../types/dashboard';
import { ActionButton } from './ActionButton';
import { EmptyState } from './EmptyState';
import { EventFeed } from './EventFeed';
import { KpiCard } from './KpiCard';
import { ModuleCard } from './ModuleCard';
import { ReadinessChecks } from './ReadinessChecks';
import { SectionCard } from './SectionCard';
import { readinessClass } from './tone';

interface RuntimeDashboardProps {
  overview: Overview | null;
  readiness: Readiness | null;
  modules: ModuleRow[];
  events: EventRow[];
  loading: boolean;
  error: string | null;
  busyAction: string | null;
  lastRefreshLabel: string;
  activeModuleCount: number;
  totalQueueDepth: number;
  onRefresh: () => void;
  onReset: () => void;
  onApplyAction: (moduleId: string, action: ModuleAction) => void;
}

const MODULE_ACTIONS: ModuleAction[] = ['start', 'pause', 'stop', 'restart'];

export function RuntimeDashboard({
  overview,
  readiness,
  modules,
  events,
  loading,
  error,
  busyAction,
  lastRefreshLabel,
  activeModuleCount,
  totalQueueDepth,
  onRefresh,
  onReset,
  onApplyAction,
}: RuntimeDashboardProps) {
  return (
    <section className="space-y-5">
      <SectionCard
        title="Template Baseline"
        subtitle="Reusable starter for operations dashboards with mock orchestrator data"
        actions={
          <div className="flex flex-wrap gap-2">
            <ActionButton
              label="Refresh"
              tone="cyan"
              disabled={busyAction !== null}
              onClick={onRefresh}
            />
            <ActionButton
              label="Reset Mock Runtime"
              tone="amber"
              disabled={busyAction !== null}
              busy={busyAction === 'reset'}
              onClick={onReset}
            />
          </div>
        }
      >
        <p className="text-xs text-slate-400">Last refresh: {lastRefreshLabel}</p>
        {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
      </SectionCard>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Readiness"
          value={overview ? `${overview.readiness_score.toFixed(1)}%` : loading ? '...' : 'n/a'}
          detail={readiness?.tier || 'loading'}
          accent={readinessClass(readiness?.tier || 'blocked')}
        />
        <KpiCard
          label="Active Modules"
          value={activeModuleCount}
          detail={`of ${overview?.module_count ?? modules.length}`}
        />
        <KpiCard label="Queued Tasks" value={totalQueueDepth} detail="mock workload depth" />
        <KpiCard
          label="Runtime Uptime"
          value={overview ? formatUptime(overview.uptime_sec) : loading ? '...' : 'n/a'}
          detail={`events tracked: ${overview?.event_count ?? events.length}`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <SectionCard title="Modules" subtitle="Control-plane simulation">
          <div className="space-y-3">
            {modules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                actions={MODULE_ACTIONS}
                disabled={busyAction !== null}
                busyAction={busyAction}
                onAction={onApplyAction}
              />
            ))}
            {!modules.length && !loading ? (
              <EmptyState title="No modules available" message="Connect runtime adapters to populate module rows." />
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Event Stream" subtitle={`latest ${events.length}`}>
          <ReadinessChecks checks={readiness?.checks ?? []} />
          <div className="mt-3">
            <EventFeed events={events} loading={loading} />
          </div>
        </SectionCard>
      </section>
    </section>
  );
}
