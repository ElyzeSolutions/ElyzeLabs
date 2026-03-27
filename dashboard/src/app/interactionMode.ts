import type { InteractionMode, MessageRow, RunRow } from './types';

export function resolveInteractionModeCopy(
  mode: InteractionMode | null | undefined
): {
  label: string;
  shortLabel: string;
  detail: string;
  chipClassName: string;
  toneClass: string;
} | null {
  switch (mode) {
    case 'answer_direct':
      return {
        label: 'Assistant Answer',
        shortLabel: 'Assistant',
        detail: 'Direct natural-language reply',
        chipClassName: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
        toneClass: 'text-emerald-200'
      };
    case 'direct_execute':
      return {
        label: 'Direct Execution',
        shortLabel: 'Execute',
        detail: 'Executed in the current run',
        chipClassName: 'border-sky-400/20 bg-sky-500/10 text-sky-200',
        toneClass: 'text-sky-200'
      };
    case 'delegate':
      return {
        label: 'Delegated',
        shortLabel: 'Delegate',
        detail: 'Routed to another agent or session',
        chipClassName: 'border-amber-400/20 bg-amber-500/10 text-amber-100',
        toneClass: 'text-amber-100'
      };
    case 'plan_backlog':
      return {
        label: 'Planning',
        shortLabel: 'Plan',
        detail: 'Backlog-first planning workflow',
        chipClassName: 'border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-100',
        toneClass: 'text-fuchsia-100'
      };
    case 'fail_missing_capability':
      return {
        label: 'Capability Blocked',
        shortLabel: 'Blocked',
        detail: 'Required capability was unavailable',
        chipClassName: 'border-rose-400/20 bg-rose-500/10 text-rose-100',
        toneClass: 'text-rose-100'
      };
    default:
      return null;
  }
}

export function resolveConversationInteractionMode(
  messages: MessageRow[],
  latestRun: RunRow | null | undefined
): {
  mode: InteractionMode | null;
  reason: string | null;
} {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.direction !== 'outbound') {
      continue;
    }
    if (message.interactionMode) {
      return {
        mode: message.interactionMode,
        reason: message.interactionModeReason ?? null
      };
    }
  }

  return {
    mode: latestRun?.interactionMode ?? null,
    reason: latestRun?.interactionModeReason ?? null
  };
}
