import type { ReactNode } from 'react';

interface ActionButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: 'cyan' | 'amber' | 'slate';
  icon?: ReactNode;
}

const TONE_CLASS: Record<NonNullable<ActionButtonProps['tone']>, string> = {
  cyan: 'border-cyan-300/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20',
  amber: 'border-amber-300/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20',
  slate: 'border-slate-600/70 bg-slate-800/60 text-slate-200 hover:border-cyan-300/50 hover:text-cyan-200',
};

export function ActionButton({
  label,
  onClick,
  disabled,
  busy,
  tone = 'cyan',
  icon,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-3 py-2 text-xs font-medium uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-60 ${TONE_CLASS[tone]}`}
    >
      <span className="inline-flex items-center gap-1.5">{icon}{busy ? '...' : label}</span>
    </button>
  );
}
