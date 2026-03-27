import type { TemplateNavItem } from './types';

interface TemplateMobileNavProps {
  navItems: TemplateNavItem[];
  activeNavId: string;
  onNavChange: (id: string) => void;
}

export function TemplateMobileNav({ navItems, activeNavId, onNavChange }: TemplateMobileNavProps) {
  const maxItems = 5;
  const items = navItems.slice(0, maxItems);

  return (
    <nav className="fixed bottom-2 left-2 right-2 z-40 rounded-xl border border-slate-700/70 bg-slate-900/95 p-1 backdrop-blur-xl md:hidden">
      <div className={`grid gap-1 ${items.length >= 5 ? 'grid-cols-5' : items.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {items.map((item) => {
          const active = item.id === activeNavId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavChange(item.id)}
              className={`rounded-lg px-1 py-2 text-[10px] font-medium uppercase tracking-[0.08em] transition ${
                active
                  ? 'bg-cyan-500/20 text-cyan-100'
                  : 'text-slate-400 hover:bg-slate-800/90 hover:text-slate-200'
              }`}
            >
              {item.shortLabel || item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
