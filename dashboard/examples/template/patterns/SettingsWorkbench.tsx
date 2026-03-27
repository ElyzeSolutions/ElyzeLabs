import { useEffect, useMemo, useState, type ReactNode } from 'react';

export interface SettingsWorkbenchTab {
  id: string;
  label: string;
  helper?: string;
  badge?: string | number;
  dirty?: boolean;
  content: ReactNode;
}

interface SettingsWorkbenchProps {
  title: string;
  subtitle?: string;
  modeLabel?: string;
  tabs: SettingsWorkbenchTab[];
  defaultTabId?: string;
}

export function SettingsWorkbench({
  title,
  subtitle,
  modeLabel,
  tabs,
  defaultTabId,
}: SettingsWorkbenchProps) {
  const [activeTabId, setActiveTabId] = useState<string>(defaultTabId || tabs[0]?.id || '');

  useEffect(() => {
    if (!tabs.length) {
      setActiveTabId('');
      return;
    }
    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(defaultTabId && tabs.some((tab) => tab.id === defaultTabId) ? defaultTabId : tabs[0].id);
    }
  }, [activeTabId, defaultTabId, tabs]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || tabs[0],
    [activeTabId, tabs],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-slate-300">{title}</p>
          {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>
        {modeLabel ? (
          <span className="rounded border border-cyan-300/35 bg-cyan-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100">
            {modeLabel}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-[230px_1fr]">
        <div className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-1.5">
          <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={`group flex min-w-max items-center gap-2 rounded-md border px-2.5 py-2 text-left transition md:min-w-0 ${
                    isActive
                      ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100'
                      : 'border-transparent text-slate-300 hover:border-slate-700/70 hover:bg-slate-900/70'
                  }`}
                >
                  <span className="truncate text-[11px] uppercase tracking-[0.12em]">{tab.label}</span>
                  {tab.badge ? (
                    <span className="rounded bg-slate-800/90 px-1.5 py-0.5 text-[10px] text-slate-300">
                      {tab.badge}
                    </span>
                  ) : null}
                  {tab.dirty ? <span className="h-2 w-2 rounded-full bg-amber-300" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
          <div className="mb-3 border-b border-slate-800/80 pb-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">{activeTab?.label ?? 'No tab selected'}</p>
            {activeTab?.helper ? <p className="mt-0.5 text-xs text-slate-500">{activeTab.helper}</p> : null}
          </div>
          {activeTab?.content ?? <p className="text-xs text-slate-500">No tab content.</p>}
        </div>
      </div>
    </div>
  );
}
