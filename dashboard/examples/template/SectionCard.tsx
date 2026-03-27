import type { ReactNode } from 'react';

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionCard({ title, subtitle, actions, children, className = '' }: SectionCardProps) {
  return (
    <article className={`glass-panel rounded-xl border border-slate-700/60 p-4 ${className}`.trim()}>
      {title || subtitle || actions ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            {title ? <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p> : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </div>
      ) : null}
      <div className={title || subtitle || actions ? 'mt-3' : ''}>{children}</div>
    </article>
  );
}
