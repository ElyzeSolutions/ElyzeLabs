import { describe, expect, it } from 'vitest';

import { extractDelegationRouterPayload } from '../../src/router-payload.js';

describe('router payload extraction', () => {
  it('extracts direct JSON payload', () => {
    const result = extractDelegationRouterPayload({
      summary: '{"targetAgentIds":["software-engineer"],"confidence":0.88,"reason":"implementation task"}',
      raw: ''
    });

    expect(result.payload).toBeTruthy();
    expect(result.payload?.targetAgentIds).toEqual(['software-engineer']);
    expect(result.payload?.confidence).toBe(0.88);
  });

  it('extracts nested OpenRouter payload even when summary has brace noise', () => {
    const raw = JSON.stringify({
      ts: '2026-02-28T00:00:00.000Z',
      model: 'openai/gpt-5-mini',
      payload: {
        choices: [
          {
            message: {
              content: '{"targetAgentIds":["worker-review"],"confidence":0.79,"reason":"quality verification needed"}'
            }
          }
        ]
      }
    });

    const result = extractDelegationRouterPayload({
      summary:
        'JSON schema reminder: {"targetAgentIds":["agent-id"],"confidence":0.0,"reason":"short rationale"}',
      raw
    });

    expect(result.payload).toBeTruthy();
    expect(result.payload?.targetAgentIds).toEqual(['worker-review']);
    expect(result.payload?.reason).toBe('quality verification needed');
  });

  it('extracts payload embedded in CLI event stream envelopes', () => {
    const stream = [
      '{"type":"thread.started","thread_id":"abc"}',
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"{\\"targetAgentIds\\":[\\"worker-outreach\\"],\\"confidence\\":0.74,\\"reason\\":\\"go-to-market request\\"}"}}',
      '{"type":"turn.completed"}'
    ].join('\n');

    const result = extractDelegationRouterPayload({
      summary: stream,
      raw: ''
    });

    expect(result.payload).toBeTruthy();
    expect(result.payload?.targetAgentIds).toEqual(['worker-outreach']);
    expect(result.payload?.confidence).toBe(0.74);
  });

  it('extracts batch assignment payloads with per-item delegate targets', () => {
    const summary = JSON.stringify({
      assignments: [
        {
          itemId: 'item-1',
          targetAgentId: 'software-engineer',
          reason: 'implementation work'
        },
        {
          itemId: 'item-2',
          targetAgentId: 'worker-review',
          reason: 'verification and regression tests'
        }
      ],
      reason: 'balanced by capability',
      confidence: 0.87
    });

    const result = extractDelegationRouterPayload({
      summary,
      raw: ''
    });

    expect(result.payload).toBeTruthy();
    expect(result.payload?.assignments).toEqual([
      {
        itemId: 'item-1',
        targetAgentId: 'software-engineer',
        reason: 'implementation work'
      },
      {
        itemId: 'item-2',
        targetAgentId: 'worker-review',
        reason: 'verification and regression tests'
      }
    ]);
    expect(result.payload?.targetAgentIds).toEqual(['software-engineer', 'worker-review']);
  });
});
