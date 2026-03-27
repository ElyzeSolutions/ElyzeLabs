const SIDEBAR_SECTIONS = [
  {
    title: 'Operations',
    items: [
      { label: 'Event Feed', hotkey: '1', active: true },
      { label: 'Decisions', hotkey: '2' },
      { label: 'Modules', hotkey: '3' },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { label: 'Portfolio', hotkey: '4' },
      { label: 'Health', hotkey: '5' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { label: 'LLM Usage', hotkey: '6' },
      { label: 'Accounts', hotkey: '7' },
      { label: 'Settings', hotkey: '8' },
    ],
  },
];

const MOBILE_ITEMS = [
  { label: 'Feed', active: true },
  { label: 'Decide' },
  { label: 'Modules' },
  { label: 'Health' },
  { label: 'More' },
];

function ShellStat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'cyan' | 'amber' }) {
  const toneClass =
    tone === 'cyan'
      ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
      : tone === 'amber'
        ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
        : 'border-slate-700 bg-slate-900/70 text-slate-200';

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

export function LegacyShellShowcase() {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/80">
        <div className="grid min-h-[320px] grid-cols-1 md:grid-cols-[210px_1fr]">
          <aside className="border-b border-slate-700/70 bg-slate-900/80 p-3 md:border-b-0 md:border-r">
            <div className="mb-3 flex items-center gap-2 border-b border-slate-700/60 pb-3">
              <div className="h-7 w-7 rounded-md bg-cyan-500/20 text-center text-xs font-bold leading-7 text-cyan-100">CP</div>
              <div>
                <p className="text-xs tracking-[0.18em] text-slate-300">CONTROL PLANE</p>
                <p className="text-[10px] text-slate-500">legacy shell pattern</p>
              </div>
            </div>

            <div className="space-y-4">
              {SIDEBAR_SECTIONS.map((section) => (
                <div key={section.title}>
                  <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">{section.title}</p>
                  <div className="space-y-1">
                    {section.items.map((item) => (
                      <button
                        type="button"
                        key={item.label}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                          item.active
                            ? 'border border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                            : 'border border-transparent text-slate-300 hover:bg-slate-800/80'
                        }`}
                      >
                        <span>{item.label}</span>
                        <span className="font-mono text-[10px] text-slate-500">{item.hotkey}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div className="flex min-h-0 flex-col">
            <header className="flex items-center justify-between border-b border-slate-700/70 bg-slate-950/90 px-3 py-2.5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">System</p>
                <p className="text-sm font-semibold text-slate-100">Event Feed</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-emerald-200">Online</span>
                <span className="rounded border border-slate-700 px-2 py-1 text-slate-300">$1,115.64</span>
              </div>
            </header>

            <div className="grid gap-3 p-3 lg:grid-cols-[1.35fr_1fr]">
              <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">System Events</p>
                  <span className="rounded border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] uppercase text-cyan-200">live</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    'heartbeat | orchestrator_core | info',
                    'worker_update | planner_agent | debug',
                    'dispatch_summary | orchestrator_core | info',
                    'queue_warning | executor_agent | warning',
                  ].map((row) => (
                    <div key={row} className="rounded border border-slate-800/80 bg-slate-950/60 px-2 py-1.5 text-[11px] text-slate-300">
                      {row}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <ShellStat label="Readiness" value="91.4%" tone="cyan" />
                <ShellStat label="Active Workers" value="11 / 13" />
                <ShellStat label="Queue Depth" value="34" tone="amber" />
                <ShellStat label="Actions" value="Start | Pause | Restart" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[22px] border border-slate-700/80 bg-slate-950">
        <div className="border-b border-slate-700/70 px-3 py-2.5">
          <p className="text-xs text-slate-300">History</p>
          <p className="text-[11px] text-slate-500">All symbols</p>
        </div>

        <div className="space-y-1 px-3 py-2">
          {[
            'XAUUSD, sell 0.01',
            'XAUUSD, buy 0.01',
            'XAUUSD, sell 0.03',
            'XAUUSD, buy 0.02',
          ].map((row, idx) => (
            <div key={row} className="flex items-center justify-between border-b border-slate-800/80 py-2 text-xs">
              <span className="text-slate-200">{row}</span>
              <span className={idx % 2 === 0 ? 'text-rose-300' : 'text-emerald-300'}>{idx % 2 === 0 ? '-8.83' : '7.13'}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-1 border-t border-slate-700/70 bg-slate-900/80 px-2 py-2">
          {MOBILE_ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`rounded-lg px-1 py-1.5 text-[10px] ${
                item.active ? 'bg-cyan-500/20 text-cyan-100' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
