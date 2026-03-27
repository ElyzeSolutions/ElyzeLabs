import { describe, expect, it } from 'vitest';

import type { MessageRecord } from '@ops/shared';

import {
  applyContinuityPromptAugment,
  buildStaleSpanSummary,
  detectContinuityFailure,
  planContinuityRemediation
} from '../../src/continuity-remediation.js';
import type { ContextAssemblyPolicy } from '../../src/context-assembly.js';

function makeMessage(input: Partial<MessageRecord> & Pick<MessageRecord, 'id' | 'content'>): MessageRecord {
  return {
    id: input.id,
    sessionId: input.sessionId ?? 'session-1',
    channel: input.channel ?? 'internal',
    direction: input.direction ?? 'inbound',
    source: input.source ?? 'api',
    sender: input.sender ?? 'operator',
    content: input.content,
    metadataJson: input.metadataJson ?? '{}',
    createdAt: input.createdAt ?? '2026-03-02T12:00:00.000Z'
  };
}

const policy: ContextAssemblyPolicy = {
  enabled: true,
  totalTokenBudget: 4096,
  overflowStrategy: 'shrink',
  transcriptWindowTurns: 6,
  transcriptMaxMessages: 24,
  memoryTopK: 4,
  memoryMinScore: 0.15,
  reserves: {
    instructions: 1600,
    task: 1600,
    recentTranscript: 900,
    memoryRecall: 500
  },
  dropOrder: ['memory_recall', 'recent_transcript', 'instructions']
};

describe('continuity remediation planner', () => {
  it('classifies overflow failures as high severity continuity issues', () => {
    const failure = detectContinuityFailure('runtime rejected request: context window overflow');
    expect(failure).toBeTruthy();
    expect(failure?.code).toBe('context_overflow_runtime');
    expect(failure?.severity).toBe('high');
  });

  it('classifies low recall failures and selects memory-priority fallback action', () => {
    const failure = detectContinuityFailure('no recall candidates found; memory context missing');
    expect(failure).toBeTruthy();
    const plan = planContinuityRemediation({
      policy,
      failure: failure!,
      transcriptMessages: []
    });
    expect(plan.action).toBe('memory_priority_fallback');
    expect(plan.policyOverride.memoryTopK).toBeGreaterThanOrEqual(policy.memoryTopK);
    expect(plan.policyOverride.dropOrder).toEqual(['recent_transcript', 'instructions', 'memory_recall']);
  });

  it('builds stale-span summary and medium-severity stale summary action', () => {
    const failure = detectContinuityFailure('missing context from prior turn');
    const transcriptMessages: MessageRecord[] = [
      makeMessage({ id: 'm-new', content: 'Latest inbound turn that remains in active window.' }),
      makeMessage({ id: 'm-old-1', content: 'Older unresolved requirement: keep rollout behind feature flag.' }),
      makeMessage({ id: 'm-old-2', content: 'Second older requirement: preserve escalation matrix.' })
    ];
    const summary = buildStaleSpanSummary(transcriptMessages, 1);
    expect(summary).toContain('Older unresolved requirement');
    const plan = planContinuityRemediation({
      policy: {
        ...policy,
        transcriptMaxMessages: 1
      },
      failure: failure!,
      transcriptMessages
    });
    expect(plan.action).toBe('stale_span_summary');
    expect(plan.promptAugment).toContain('Older unresolved requirement');
    const patchedPrompt = applyContinuityPromptAugment('TASK: respond clearly', plan.promptAugment);
    expect(patchedPrompt).toContain('STALE_SPAN_SUMMARY:');
  });

  it('uses window-shrink action for high severity failures', () => {
    const failure = detectContinuityFailure('token budget exceeded after context packing');
    const plan = planContinuityRemediation({
      policy,
      failure: failure!,
      transcriptMessages: []
    });
    expect(plan.action).toBe('window_shrink');
    expect(plan.policyOverride.memoryTopK).toBe(0);
    expect(plan.policyOverride.reserves?.memoryRecall).toBe(0);
  });
});
