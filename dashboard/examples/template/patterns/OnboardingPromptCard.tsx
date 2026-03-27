import { ActionButton } from '../ActionButton';

interface PromptAction {
  label: string;
  tone?: 'cyan' | 'amber' | 'slate';
  onClick?: () => void;
}

interface OnboardingPromptCardProps {
  title: string;
  description: string;
  primaryAction: PromptAction;
  secondaryAction?: PromptAction;
}

export function OnboardingPromptCard({
  title,
  description,
  primaryAction,
  secondaryAction,
}: OnboardingPromptCardProps) {
  return (
    <section className="rounded-xl border border-slate-700/70 bg-slate-900/35 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-100">{title}</p>
          <p className="text-xs text-slate-400">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label={primaryAction.label}
            tone={primaryAction.tone ?? 'cyan'}
            onClick={primaryAction.onClick}
          />
          {secondaryAction ? (
            <ActionButton
              label={secondaryAction.label}
              tone={secondaryAction.tone ?? 'amber'}
              onClick={secondaryAction.onClick}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
