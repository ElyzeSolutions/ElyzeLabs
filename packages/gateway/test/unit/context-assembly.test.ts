import { describe, expect, it } from 'vitest';

import type { MemorySearchResult } from '@ops/memory';
import type { MessageRecord } from '@ops/shared';

import { buildPromptAssembly, type ContextAssemblyPolicy } from '../../src/context-assembly.js';

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
    createdAt: input.createdAt ?? '2026-03-01T12:00:00.000Z'
  };
}

function makeMemoryResult(content: string, combinedScore: number): MemorySearchResult {
  return {
    item: {
      id: `memory-${Math.random().toString(36).slice(2, 10)}`,
      sessionId: null,
      agentId: 'codex',
      source: 'structured',
      content,
      embeddingRef: null,
      importance: 5,
      metadataJson: '{}',
      createdAt: '2026-03-01T12:00:00.000Z'
    },
    lexicalScore: 0.4,
    semanticScore: 0.6,
    recencyScore: 0.7,
    significanceScore: 0.5,
    combinedScore,
    citations: ['memory://1']
  };
}

describe('context assembly', () => {
  const defaultPolicy: ContextAssemblyPolicy = {
    enabled: true,
    totalTokenBudget: 600,
    overflowStrategy: 'shrink',
    transcriptWindowTurns: 4,
    transcriptMaxMessages: 8,
    memoryTopK: 3,
    memoryMinScore: 0.2,
    reserves: {
      instructions: 200,
      task: 180,
      recentTranscript: 140,
      memoryRecall: 80
    },
    dropOrder: ['memory_recall', 'recent_transcript', 'instructions']
  };

  it('assembles deterministically and preserves recent unresolved inbound constraints', () => {
    const basePrompt = ['ROLE: CEO', 'SYSTEM: Keep responses crisp.', '', 'TASK: Ship support page rollout plan.'].join('\n');
    const messages: MessageRecord[] = [
      makeMessage({
        id: 'm1',
        direction: 'inbound',
        source: 'telegram',
        content: 'Please keep the original CTA copy unchanged.',
        createdAt: '2026-03-01T12:00:00.000Z'
      }),
      makeMessage({
        id: 'm2',
        direction: 'outbound',
        source: 'agent',
        sender: 'agent',
        content: 'Acknowledged.',
        createdAt: '2026-03-01T12:00:02.000Z'
      }),
      makeMessage({
        id: 'm3',
        direction: 'inbound',
        source: 'api',
        content: 'Also include an escalation path in the support flow.',
        createdAt: '2026-03-01T12:00:04.000Z'
      })
    ];
    const memoryRows = [
      makeMemoryResult('Decision: support page needs an escalation matrix.', 0.71),
      makeMemoryResult('Low relevance historical note', 0.1)
    ];

    const first = buildPromptAssembly({
      basePrompt,
      messages,
      memoryRows,
      policy: defaultPolicy
    });
    const second = buildPromptAssembly({
      basePrompt,
      messages,
      memoryRows,
      policy: defaultPolicy
    });

    expect(second).toEqual(first);
    expect(first.overflowed).toBe(false);
    expect(first.prompt).toContain('RECENT_TRANSCRIPT:');
    expect(first.prompt).toContain('CURRENT_TASK:');
    expect(first.prompt).toContain('escalation path');
    expect(first.continuityCoverage.unresolvedConstraintIncluded).toBe(true);
    expect(first.continuityCoverage.memoryCandidatesSelected).toBe(1);
  });

  it('treats delegated agent inbound prompts as unresolved constraint candidates', () => {
    const result = buildPromptAssembly({
      basePrompt: 'TASK: Respond using delegated constraints.',
      messages: [
        makeMessage({
          id: 'delegate-inbound',
          direction: 'inbound',
          source: 'agent',
          sender: 'software-engineer',
          content: 'Delegated constraint: keep remediation output terse.',
          createdAt: '2026-03-01T12:01:00.000Z'
        }),
        makeMessage({
          id: 'delegate-outbound',
          direction: 'outbound',
          source: 'agent',
          sender: 'ceo-default',
          content: 'Acknowledged.',
          createdAt: '2026-03-01T12:01:01.000Z'
        })
      ],
      memoryRows: [],
      policy: {
        ...defaultPolicy,
        memoryTopK: 0,
        reserves: {
          ...defaultPolicy.reserves,
          memoryRecall: 0
        }
      }
    });

    expect(result.continuityCoverage.transcriptTurnsSelected).toBe(1);
    expect(result.continuityCoverage.unresolvedConstraintIncluded).toBe(true);
  });

  it('reports preflight overflow under fail_fast strategy without implicit shrinking', () => {
    const hugeTask = `INSTRUCTIONS ${'rule '.repeat(5_000)}\nTASK:${'do '.repeat(5_000)}`;
    const result = buildPromptAssembly({
      basePrompt: hugeTask,
      messages: [
        makeMessage({
          id: 'overflow-message',
          content: `Operator context ${'history '.repeat(5_000)}`
        })
      ],
      memoryRows: [makeMemoryResult(`Historical decision ${'memory '.repeat(5_000)}`, 0.9)],
      policy: {
        ...defaultPolicy,
        totalTokenBudget: 256,
        overflowStrategy: 'fail_fast',
        transcriptWindowTurns: 1,
        transcriptMaxMessages: 4,
        memoryTopK: 1,
        memoryMinScore: 0,
        reserves: {
          instructions: 400,
          task: 400,
          recentTranscript: 400,
          memoryRecall: 400
        }
      }
    });

    expect(result.overflowed).toBe(true);
    expect(result.overflowReason).toBe('preflight_over_budget');
    expect(result.totalEstimatedTokens).toBeGreaterThan(result.contextLimit);
  });

  it('drops lower-priority segments first when shrink strategy is applied', () => {
    const result = buildPromptAssembly({
      basePrompt: `INSTRUCTIONS ${'rule '.repeat(5_000)}\nTASK:${'do '.repeat(5_000)}`,
      messages: [
        makeMessage({
          id: 'm1',
          direction: 'inbound',
          content: `transcript memory that can be dropped for budget if needed ${'history '.repeat(5_000)}`
        })
      ],
      memoryRows: [makeMemoryResult(`memory recall candidate likely to be dropped ${'memory '.repeat(5_000)}`, 0.9)],
      policy: {
        ...defaultPolicy,
        totalTokenBudget: 256,
        transcriptWindowTurns: 1,
        transcriptMaxMessages: 4,
        memoryTopK: 1,
        memoryMinScore: 0,
        reserves: {
          instructions: 400,
          task: 400,
          recentTranscript: 400,
          memoryRecall: 400
        }
      }
    });

    const droppedIds = new Set(result.droppedSegments.map((segment) => segment.id));
    expect(result.overflowed).toBe(false);
    expect(droppedIds.has('memory_recall') || droppedIds.has('recent_transcript')).toBe(true);
    expect(result.prompt).toContain('CURRENT_TASK:');
  });

  it('dedupes the latest inbound ask from transcript replay when CURRENT_TASK already carries it', () => {
    const repeatedTask = 'Please keep the original CTA copy unchanged.';
    const result = buildPromptAssembly({
      basePrompt: `TASK: ${repeatedTask}`,
      messages: [
        makeMessage({
          id: 'older-context',
          direction: 'inbound',
          source: 'telegram',
          content: 'Also preserve the escalation path in the support flow.',
          createdAt: '2026-03-01T12:00:00.000Z'
        }),
        makeMessage({
          id: 'latest-inbound',
          direction: 'inbound',
          source: 'telegram',
          content: repeatedTask,
          createdAt: '2026-03-01T12:00:10.000Z'
        })
      ],
      memoryRows: [],
      policy: {
        ...defaultPolicy,
        memoryTopK: 0,
        reserves: {
          ...defaultPolicy.reserves,
          memoryRecall: 0
        }
      },
      taskHint: repeatedTask
    });

    expect(result.continuityCoverage.latestInboundDeduped).toBe(true);
    expect(result.continuityCoverage.unresolvedConstraintIncluded).toBe(true);
    expect(result.prompt.match(/Please keep the original CTA copy unchanged\./g)?.length ?? 0).toBe(1);
    expect(result.prompt).toContain('Also preserve the escalation path');
  });
});
