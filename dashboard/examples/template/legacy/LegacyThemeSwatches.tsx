const PALETTE = [
  { slot: 'background', sample: 'hsl(222 47% 11%)', note: 'main canvas' },
  { slot: 'card', sample: 'hsl(217 33% 17%)', note: 'panels / cards' },
  { slot: 'primary', sample: 'hsl(186 100% 42%)', note: 'active focus' },
  { slot: 'success', sample: 'hsl(142 71% 45%)', note: 'healthy / positive' },
  { slot: 'warning', sample: 'hsl(38 92% 50%)', note: 'degraded / caution' },
  { slot: 'destructive', sample: 'hsl(339 90% 60%)', note: 'error / blocked' },
];

export function LegacyThemeSwatches() {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {PALETTE.map((entry) => (
        <div key={entry.slot} className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-300">{entry.slot}</p>
            <p className="text-[10px] text-slate-500">{entry.note}</p>
          </div>
          <div
            className="h-10 rounded border border-slate-700"
            style={{ backgroundColor: entry.sample }}
            aria-label={`${entry.slot} swatch`}
          />
          <p className="mt-1.5 text-[10px] font-mono text-slate-500">{entry.sample}</p>
        </div>
      ))}
    </div>
  );
}
