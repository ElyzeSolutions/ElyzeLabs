import type { ReactNode } from 'react';

import { CaretDown } from '@phosphor-icons/react';

interface PageStatItem {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: 'neutral' | 'positive' | 'warn' | 'critical';
}

interface PageIntroProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  stats?: PageStatItem[];
  className?: string;
}

interface PageDisclosureProps {
  title: string;
  description?: string;
  action?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
  className?: string;
}

const STAT_TONE_CLASS: Record<NonNullable<PageStatItem['tone']>, string> = {
  neutral: 'border-white/8 bg-white/[0.035] text-[var(--shell-text)]',
  positive: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
  warn: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
  critical: 'border-rose-400/20 bg-rose-400/10 text-rose-100'
};
const EMPTY_PAGE_STATS: PageStatItem[] = [];

export function PageStatGrid({ stats }: { stats: PageStatItem[] }) {
  if (stats.length === 0) {
    return null;
  }

  return (
    <div className="shell-stat-grid">
      {stats.map((item) => {
        const tone = STAT_TONE_CLASS[item.tone ?? 'neutral'];
        return (
          <div key={item.label} className={['shell-stat-card', tone].join(' ')}>
            <p className="shell-stat-label">{item.label}</p>
            <p className="shell-stat-value">{item.value}</p>
            {item.detail ? <p className="shell-stat-detail">{item.detail}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
  stats = EMPTY_PAGE_STATS,
  className = ''
}: PageIntroProps) {
  return (
    <article className={['shell-hero', className].join(' ').trim()}>
      <div className="shell-hero-content">
        {eyebrow ? <p className="shell-hero-kicker">{eyebrow}</p> : null}
        <h1 className="shell-hero-title">{title}</h1>
        {description ? <p className="shell-hero-copy">{description}</p> : null}
      </div>
      {actions ? <div className="shell-hero-actions">{actions}</div> : null}
      {stats.length > 0 ? <PageStatGrid stats={stats} /> : null}
    </article>
  );
}

export function PageDisclosure({
  title,
  description,
  action,
  defaultOpen = false,
  open,
  onToggle,
  children,
  className = ''
}: PageDisclosureProps) {
  return (
    <details open={open ?? defaultOpen} onToggle={onToggle} className={['shell-disclosure', className].join(' ').trim()}>
      <summary
        onClick={(event) => {
          const target = event.target;
          if (target instanceof HTMLElement && target.closest('[data-disclosure-action="true"]')) {
            event.preventDefault();
          }
        }}
      >
        <div className="min-w-0">
          <h2 className="shell-section-title">{title}</h2>
          {description ? <p className="shell-section-copy">{description}</p> : null}
        </div>
        <div className="shell-disclosure-summary" data-disclosure-action="true">
          {action}
          <span className="shell-disclosure-chevron">
            <CaretDown size={16} weight="bold" />
          </span>
        </div>
      </summary>
      <div className="shell-disclosure-content">{children}</div>
    </details>
  );
}
