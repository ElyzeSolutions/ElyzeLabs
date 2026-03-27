import { useMemo } from 'react';

import type { TemplateNavItem } from './types';

interface TemplateSidebarProps {
  brand: string;
  navItems: TemplateNavItem[];
  activeNavId: string;
  onNavChange: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  footerNote?: string;
}

function ToneBadge({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <span className="ml-auto inline-flex min-w-[18px] justify-center rounded-full bg-cyan-500/20 px-1 text-[10px] font-mono text-cyan-100">
      {value > 9 ? '9+' : value}
    </span>
  );
}

export function TemplateSidebar({
  brand,
  navItems,
  activeNavId,
  onNavChange,
  isOpen,
  onClose,
  footerNote,
}: TemplateSidebarProps) {
  const sections = useMemo(() => {
    const grouped = new Map<string, TemplateNavItem[]>();
    navItems.forEach((item) => {
      const key = item.section || 'Main';
      const existing = grouped.get(key);
      if (existing) {
        existing.push(item);
      } else {
        grouped.set(key, [item]);
      }
    });
    return Array.from(grouped.entries());
  }, [navItems]);

  return (
    <>
      <aside className="group/sidebar hidden h-full w-[66px] flex-col overflow-hidden border-r border-white/5 bg-slate-900/70 shadow-2xl shadow-black/20 transition-[width] duration-200 hover:w-[220px] md:flex">
        <div className="flex h-14 items-center border-b border-white/5 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-500/20 text-xs font-bold tracking-wide text-cyan-100">
            {brand}
          </div>
          <span className="ml-3 hidden text-xs uppercase tracking-[0.18em] text-slate-300 group-hover/sidebar:block">
            Control Plane
          </span>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto py-4">
          {sections.map(([sectionName, items]) => (
            <div key={sectionName}>
              <p className="mb-2 hidden px-4 text-[10px] uppercase tracking-[0.16em] text-slate-500 group-hover/sidebar:block">
                {sectionName}
              </p>
              <div className="space-y-1 px-2.5">
                {items.map((item) => {
                  const active = item.id === activeNavId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavChange(item.id)}
                      className={`flex h-10 w-full items-center rounded px-2 text-left text-xs transition ${
                        active
                          ? 'bg-cyan-500/15 text-cyan-100 shadow-[inset_2px_0_0_0_rgba(34,211,238,0.8)]'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
                      }`}
                    >
                      <span className="w-8 text-center font-mono text-[11px] uppercase">
                        {(item.shortLabel || item.label).slice(0, 1)}
                      </span>
                      <span className="hidden flex-1 truncate pr-2 group-hover/sidebar:block">{item.label}</span>
                      <span className="hidden group-hover/sidebar:inline"><ToneBadge value={item.badge || 0} /></span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/5 p-3 text-[10px] text-slate-500">
          {footerNote || 'Template shell'}
        </div>
      </aside>

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[280px] border-r border-slate-700/80 bg-slate-950/95 p-4 backdrop-blur-xl transition-transform duration-200 md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-700/70 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-500/20 text-xs font-bold text-cyan-100">
              {brand}
            </div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Control Plane</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-slate-400 hover:text-slate-100">
            Close
          </button>
        </div>

        <div className="space-y-4">
          {sections.map(([sectionName, items]) => (
            <div key={sectionName}>
              <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">{sectionName}</p>
              <div className="space-y-1">
                {items.map((item) => {
                  const active = item.id === activeNavId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onNavChange(item.id);
                        onClose();
                      }}
                      className={`flex h-9 w-full items-center rounded px-2 text-left text-xs transition ${
                        active
                          ? 'bg-cyan-500/15 text-cyan-100'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
                      }`}
                    >
                      <span className="flex-1">{item.label}</span>
                      <ToneBadge value={item.badge || 0} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
