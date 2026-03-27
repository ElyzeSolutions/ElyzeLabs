import { formatTs } from '../../lib/format';
import type { ModuleAction, ModuleRow } from '../../types/dashboard';
import { ActionButton } from './ActionButton';
import { StatusBadge } from './StatusBadge';

interface ModuleCardProps {
  module: ModuleRow;
  actions: ModuleAction[];
  disabled: boolean;
  busyAction: string | null;
  onAction: (moduleId: string, action: ModuleAction) => void;
}

export function ModuleCard({ module, actions, disabled, busyAction, onAction }: ModuleCardProps) {
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">{module.name}</p>
          <p className="text-xs text-slate-400">
            {module.id} • {module.owner} • {module.category}
          </p>
        </div>
        <StatusBadge status={module.status} />
      </div>
      <p className="mt-2 text-sm text-slate-300">{module.description}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300 md:grid-cols-4">
        <span>queue {module.queue_depth}</span>
        <span>cpu {module.cpu_pct.toFixed(1)}%</span>
        <span>mem {module.memory_mb.toFixed(0)}mb</span>
        <span>last {formatTs(module.last_event_at)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((action) => {
          const key = `${module.id}:${action}`;
          return (
            <ActionButton
              key={action}
              label={action}
              tone="slate"
              disabled={disabled}
              busy={busyAction === key}
              onClick={() => onAction(module.id, action)}
            />
          );
        })}
      </div>
    </div>
  );
}
