import type { ReactNode } from 'react';

interface TemplateTopbarProps {
  title: string;
  subtitle?: string;
  statusLabel?: string;
  statusTone?: 'ok' | 'warn' | 'error';
  meta?: ReactNode;
  onMenuToggle: () => void;
}

const STATUS_TONE_CLASS: Record<NonNullable<TemplateTopbarProps['statusTone']>, string> = {
  ok: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  warn: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
  error: 'border-rose-400/40 bg-rose-500/10 text-rose-200',
};

export function TemplateTopbar({
  title,
  subtitle,
  statusLabel = 'Ready',
  statusTone = 'ok',
  meta,
  onMenuToggle,
}: TemplateTopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-slate-950/90 px-3 py-3 backdrop-blur-xl md:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMenuToggle}
              className="rounded border border-slate-600/70 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800/80 md:hidden"
            >
              Menu
            </button>
            <h1 className="truncate text-sm font-semibold tracking-wide text-slate-100 md:text-base">{title}</h1>
            <span className={`hidden rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] md:inline-flex ${STATUS_TONE_CLASS[statusTone]}`}>
              {statusLabel}
            </span>
          </div>
          {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
        </div>
        {meta ? <div className="flex items-center gap-2">{meta}</div> : null}
      </div>
    </header>
  );
}
