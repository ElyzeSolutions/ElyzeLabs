import { useEffect, useState, type ReactNode } from 'react';

interface InspectorTab {
  id: string;
  label: string;
  badge?: number;
  content: ReactNode;
}

interface TabbedInspectorProps {
  title: string;
  subtitle?: string;
  tabs: InspectorTab[];
  defaultTabId?: string;
}

export function TabbedInspector({ title, subtitle, tabs, defaultTabId }: TabbedInspectorProps) {
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

  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];

  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-slate-300">{title}</p>
          {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="inline-flex flex-wrap gap-1 rounded-md border border-slate-700/70 bg-slate-950/70 p-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] uppercase tracking-[0.12em] transition ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-100'
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge && tab.badge > 0 ? (
                  <span className="rounded bg-slate-800/80 px-1 text-[10px] text-slate-300">{tab.badge}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3">{activeTab?.content ?? null}</div>
    </div>
  );
}
