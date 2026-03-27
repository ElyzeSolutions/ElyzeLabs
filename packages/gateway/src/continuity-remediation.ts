import type { MessageRecord } from '@ops/shared';

import type { ContextAssemblyPolicy } from './context-assembly.js';

export type ContinuityRemediationSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ContinuityRemediationAction = 'window_shrink' | 'stale_span_summary' | 'memory_priority_fallback';

export interface ContinuityFailureSignal {
  code: string;
  severity: ContinuityRemediationSeverity;
  error: string;
}

export interface ContinuityRemediationPlan {
  action: ContinuityRemediationAction;
  triggerCode: string;
  severity: ContinuityRemediationSeverity;
  policyOverride: Partial<ContextAssemblyPolicy>;
  promptAugment: string | null;
  detail: string;
}

const CONTEXT_OVERFLOW_PATTERN = /(context|token).*(length|limit|window|overflow|budget)/i;
const CONTEXT_GAP_PATTERN = /(missing context|lost context|dropped context|forgot|constraint.*missing|prior turn)/i;
const LOW_RECALL_PATTERN = /(low recall|no recall|memory.*(missing|empty|none|not found)|recall.*missing)/i;

function clipText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function detectContinuityFailure(error: string | null | undefined): ContinuityFailureSignal | null {
  const normalizedError = String(error ?? '').trim();
  if (!normalizedError) {
    return null;
  }

  if (LOW_RECALL_PATTERN.test(normalizedError)) {
    return {
      code: 'low_recall_runtime',
      severity: 'low',
      error: normalizedError
    };
  }

  if (CONTEXT_OVERFLOW_PATTERN.test(normalizedError)) {
    return {
      code: 'context_overflow_runtime',
      severity: 'high',
      error: normalizedError
    };
  }

  if (CONTEXT_GAP_PATTERN.test(normalizedError)) {
    return {
      code: 'continuity_context_gap',
      severity: 'medium',
      error: normalizedError
    };
  }

  return null;
}

export function buildStaleSpanSummary(
  messages: MessageRecord[],
  skipRecentMessages: number,
  maxLines = 4
): string | null {
  if (messages.length === 0) {
    return null;
  }

  const staleCandidates = messages
    .slice(Math.max(0, skipRecentMessages))
    .filter((message) => message.direction === 'inbound' && message.content.trim().length > 0)
    .reverse()
    .slice(0, Math.max(1, maxLines));

  if (staleCandidates.length === 0) {
    return null;
  }

  return staleCandidates
    .map((message) => {
      const source = `${message.source}/${message.direction}`;
      const timestamp = message.createdAt.slice(11, 19);
      return `[${timestamp}] ${source} ${message.sender}: ${clipText(message.content, 160)}`;
    })
    .join('\n');
}

export function applyContinuityPromptAugment(basePrompt: string, augment: string | null): string {
  if (!augment || augment.trim().length === 0) {
    return basePrompt;
  }
  if (basePrompt.includes('STALE_SPAN_SUMMARY:')) {
    return basePrompt;
  }
  return `${basePrompt.trimEnd()}\n\nSTALE_SPAN_SUMMARY:\n${augment.trim()}`;
}

export function planContinuityRemediation(input: {
  policy: ContextAssemblyPolicy;
  failure: ContinuityFailureSignal;
  transcriptMessages: MessageRecord[];
}): ContinuityRemediationPlan {
  const policy = input.policy;
  const staleSpanSummary = buildStaleSpanSummary(input.transcriptMessages, policy.transcriptMaxMessages);

  if (input.failure.severity === 'high' || input.failure.severity === 'critical') {
    return {
      action: 'window_shrink',
      triggerCode: input.failure.code,
      severity: input.failure.severity,
      policyOverride: {
        transcriptWindowTurns: Math.max(1, Math.floor(policy.transcriptWindowTurns / 2)),
        transcriptMaxMessages: Math.max(6, Math.floor(policy.transcriptMaxMessages / 2)),
        memoryTopK: 0,
        reserves: {
          ...policy.reserves,
          recentTranscript: Math.max(200, Math.floor(policy.reserves.recentTranscript * 0.5)),
          memoryRecall: 0
        }
      },
      promptAugment: null,
      detail: 'Shrink transcript window and disable memory recall for one bounded retry.'
    };
  }

  if (input.failure.severity === 'medium') {
    return {
      action: 'stale_span_summary',
      triggerCode: input.failure.code,
      severity: input.failure.severity,
      policyOverride: {
        transcriptWindowTurns: Math.max(1, Math.floor(policy.transcriptWindowTurns / 2)),
        transcriptMaxMessages: Math.max(6, Math.floor(policy.transcriptMaxMessages / 2)),
        reserves: {
          ...policy.reserves,
          recentTranscript: Math.max(280, Math.floor(policy.reserves.recentTranscript * 0.6))
        }
      },
      promptAugment: staleSpanSummary,
      detail: 'Inject stale-span summary and reduce transcript volume for one bounded retry.'
    };
  }

  return {
    action: 'memory_priority_fallback',
    triggerCode: input.failure.code,
    severity: input.failure.severity,
    policyOverride: {
      transcriptWindowTurns: Math.max(1, Math.floor(policy.transcriptWindowTurns / 3)),
      transcriptMaxMessages: Math.max(4, Math.floor(policy.transcriptMaxMessages / 3)),
      memoryTopK: Math.max(policy.memoryTopK, 8),
      reserves: {
        ...policy.reserves,
        recentTranscript: Math.max(120, Math.floor(policy.reserves.recentTranscript * 0.35)),
        memoryRecall: Math.max(
          policy.reserves.memoryRecall,
          Math.floor(policy.reserves.memoryRecall * 1.5),
          400
        )
      },
      dropOrder: ['recent_transcript', 'instructions', 'memory_recall']
    },
    promptAugment: null,
    detail: 'Prioritize memory recall budget and reduce transcript pressure for one bounded retry.'
  };
}
