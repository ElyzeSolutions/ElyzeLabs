type FilterTone = 'cyan' | 'amber' | 'emerald' | 'rose' | 'slate';

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
  tone?: FilterTone;
}

export interface FilterGroup {
  id: string;
  label: string;
  selectedIds: string[];
  options: FilterOption[];
  onToggle: (optionId: string) => void;
}

export interface SavedViewOption {
  id: string;
  label: string;
}

interface FilterBarProps {
  title?: string;
  subtitle?: string;
  searchValue: string;
  searchPlaceholder?: string;
  onSearchChange: (value: string) => void;
  groups: FilterGroup[];
  savedViews?: SavedViewOption[];
  activeSavedViewId?: string;
  onSavedViewChange?: (id: string) => void;
  onReset?: () => void;
}

const ACTIVE_TONE_CLASS: Record<FilterTone, string> = {
  cyan: 'border-cyan-300/45 bg-cyan-500/15 text-cyan-100',
  amber: 'border-amber-300/45 bg-amber-500/15 text-amber-100',
  emerald: 'border-emerald-300/45 bg-emerald-500/15 text-emerald-100',
  rose: 'border-rose-300/45 bg-rose-500/15 text-rose-100',
  slate: 'border-slate-500/65 bg-slate-700/75 text-slate-100',
};

function optionClass(isActive: boolean, disabled?: boolean, tone: FilterTone = 'cyan') {
  if (disabled) return 'cursor-not-allowed border-white/10 bg-white/[0.02] text-white/35';
  if (isActive) return ACTIVE_TONE_CLASS[tone];
  return 'border-white/15 bg-white/[0.02] text-white/70 hover:bg-white/[0.06]';
}

export function FilterBar({
  title = 'Filters',
  subtitle,
  searchValue,
  searchPlaceholder = 'Search',
  onSearchChange,
  groups,
  savedViews = [],
  activeSavedViewId,
  onSavedViewChange,
  onReset,
}: FilterBarProps) {
  const activeFilterCount =
    groups.reduce((sum, group) => sum + group.selectedIds.length, 0) + (searchValue.trim() ? 1 : 0);

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/45 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-slate-300">{title}</p>
          {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>
        <span className="rounded border border-slate-700/70 bg-slate-950/70 px-2 py-1 text-[10px] font-mono text-slate-300">
          {activeFilterCount} active
        </span>
      </div>

      <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <label className="block">
          <span className="sr-only">Search filter</span>
          <input
            type="text"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-md border border-slate-700/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/50 focus:outline-none"
          />
        </label>

        {savedViews.length > 0 ? (
          <label className="inline-flex min-w-[150px] items-center">
            <span className="sr-only">Saved view</span>
            <select
              value={activeSavedViewId ?? ''}
              onChange={(event) => onSavedViewChange?.(event.target.value)}
              className="h-full w-full rounded-md border border-slate-700/70 bg-slate-950/70 px-2.5 py-2 text-xs uppercase tracking-[0.12em] text-slate-200 focus:border-cyan-300/50 focus:outline-none"
            >
              {savedViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-slate-600/70 bg-slate-800/65 px-3 py-2 text-xs uppercase tracking-[0.12em] text-slate-200 transition hover:border-cyan-300/40 hover:text-cyan-100"
          >
            Reset
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-1.5 md:flex-row md:items-center">
            <p className="w-[90px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-slate-500">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-1">
              {group.options.map((option) => {
                const isActive = group.selectedIds.includes(option.id);
                return (
                  <button
                    key={`${group.id}-${option.id}`}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => group.onToggle(option.id)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.11em] transition ${optionClass(isActive, option.disabled, option.tone ?? 'cyan')}`}
                  >
                    <span>{option.label}</span>
                    {typeof option.count === 'number' ? (
                      <span className="rounded bg-slate-900/80 px-1 text-[9px] text-slate-300">{option.count}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
