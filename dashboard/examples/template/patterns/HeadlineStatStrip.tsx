type HeadlineTone = 'neutral' | 'positive' | 'negative' | 'accent';

export interface HeadlineStat {
  id: string;
  label: string;
  value: string;
  detail?: string;
  tone?: HeadlineTone;
}

interface HeadlineStatStripProps {
  stats: HeadlineStat[];
}

const VALUE_CLASS: Record<HeadlineTone, string> = {
  neutral: 'text-slate-100',
  positive: 'text-emerald-300',
  negative: 'text-rose-300',
  accent: 'text-cyan-300',
};

export function HeadlineStatStrip({ stats }: HeadlineStatStripProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/40">
      <div className="grid grid-cols-1 divide-y divide-slate-800/80 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
        {stats.map((stat) => {
          const tone = stat.tone ?? 'neutral';
          return (
            <div key={stat.id} className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{stat.label}</p>
              <p className={`mt-1 text-3xl font-semibold tracking-tight md:text-4xl ${VALUE_CLASS[tone]}`}>
                {stat.value}
              </p>
              {stat.detail ? (
                <p className="mt-1 truncate text-[11px] text-slate-500">{stat.detail}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
