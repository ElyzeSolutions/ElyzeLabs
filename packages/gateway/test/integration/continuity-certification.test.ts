import { afterEach, describe, expect, it } from 'vitest';

import type { ContinuityCertificationReport } from '@ops/shared';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

const applyCeoBaseline = async (harness: GatewayTestHarness): Promise<void> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/onboarding/ceo-baseline',
    payload: {
      actor: 'continuity-certification-test'
    }
  });
  expect(response.statusCode).toBe(200);
};

const createTelegramPayload = (input: {
  updateId: number;
  senderId: number;
  text: string;
  username?: string;
}) => ({
  update_id: input.updateId,
  message: {
    text: input.text,
    chat: { id: input.senderId, type: 'private' },
    from: {
      id: input.senderId,
      username: input.username ?? `user${input.senderId}`
    },
    mentioned: true
  }
});

const createAgentProfile = async (
  harness: GatewayTestHarness,
  input: { name: string; title: string; systemPrompt: string }
): Promise<{ id: string; title: string }> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/agents/profiles',
    payload: {
      name: input.name,
      title: input.title,
      systemPrompt: input.systemPrompt,
      defaultRuntime: 'codex',
      defaultModel: 'default',
      allowedRuntimes: ['codex'],
      skills: ['testing'],
      tools: ['runtime:codex']
    }
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { agent: { id: string; title: string } }).agent;
};

const createInternalSession = async (harness: GatewayTestHarness, sessionKey: string): Promise<string> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: {
      sessionKey,
      label: sessionKey,
      agentId: 'ceo-default',
      runtime: 'process'
    }
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { session: { id: string } }).session.id;
};

const seedMessage = (
  harness: GatewayTestHarness,
  input: {
    sessionId: string;
    direction: 'inbound' | 'outbound';
    source?: 'telegram' | 'dashboard' | 'api' | 'agent' | 'system';
    sender: string;
    content: string;
  }
): void => {
  const db = harness.createDb();
  db.saveMessage({
    sessionId: input.sessionId,
    channel: 'internal',
    direction: input.direction,
    source: input.source ?? 'api',
    sender: input.sender,
    content: input.content,
    metadataJson: '{}'
  });
  db.close();
};

const getPromptAssembly = async (harness: GatewayTestHarness, runId: string) => {
  const response = await harness.inject({
    method: 'GET',
    url: `/api/runs/${encodeURIComponent(runId)}/prompt-assembly`
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    snapshot: {
      promptPreview: string;
      continuityCoverage: {
        latestInboundDeduped?: boolean;
        continuitySummaryIncluded?: boolean;
        compactionMode?: string | null;
        scope?: string;
      };
    };
  };
};

const getContinuity = async (harness: GatewayTestHarness, sessionId: string) => {
  const response = await harness.inject({
    method: 'GET',
    url: `/api/sessions/${encodeURIComponent(sessionId)}/continuity`
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    summary: {
      text: string;
      mode: string | null;
      createdAt: string | null;
      unresolvedConstraint: string | null;
    } | null;
    ledger: Array<{
      id: string;
      mode: string;
      reason: string;
      summary: string | null;
      details: Record<string, unknown>;
    }>;
  };
};

const findTelegramSessionId = async (harness: GatewayTestHarness): Promise<string> => {
  const response = await harness.inject({
    method: 'GET',
    url: '/api/sessions'
  });
  expect(response.statusCode).toBe(200);
  const body = response.json() as {
    sessions: Array<{ id: string; channel: string }>;
  };
  const telegramSession = body.sessions.find((entry) => entry.channel === 'telegram');
  expect(telegramSession?.id).toBeTruthy();
  return telegramSession!.id;
};

describe('continuity certification', () => {
  const harnesses: GatewayTestHarness[] = [];

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()!.close();
    }
  });

  it(
    'supports manual compaction, delegated scope isolation, and rollover summaries',
    async () => {
      const harness = await createGatewayTestHarness('continuity-manual-rollover');
      harnesses.push(harness);
      await applyCeoBaseline(harness);

      const docsWriter = await createAgentProfile(harness, {
        name: 'Docs Writer',
        title: 'Technical Writer',
        systemPrompt: 'Summarize continuity-sensitive follow-up tasks.'
      });
      const originSessionId = await createInternalSession(harness, 'internal:continuity-manual-origin');

      seedMessage(harness, {
        sessionId: originSessionId,
        direction: 'inbound',
        sender: 'operator',
        content: 'Budget update has to stay visible in the operator summary.'
      });
      seedMessage(harness, {
        sessionId: originSessionId,
        direction: 'outbound',
        source: 'agent',
        sender: 'ceo-default',
        content: 'Acknowledged.'
      });
      seedMessage(harness, {
        sessionId: originSessionId,
        direction: 'inbound',
        sender: 'operator',
        content: 'Please keep the original CTA copy unchanged.'
      });

      const compactResponse = await harness.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(originSessionId)}/compact`,
        payload: {
          actor: 'operator',
          preserveMessages: 2
        }
      });
      expect(compactResponse.statusCode).toBe(200);

      const continuityAfterCompact = await getContinuity(harness, originSessionId);
      expect(continuityAfterCompact.summary?.mode).toBe('manual_compact');
      expect(continuityAfterCompact.ledger[0]?.mode).toBe('manual_compact');

      const repeatedTask = 'Please keep the original CTA copy unchanged.';
      const runResponse = await harness.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(originSessionId)}/runs`,
        headers: {
          'Idempotency-Key': 'continuity-manual-dedupe'
        },
        payload: {
          prompt: repeatedTask,
          runtime: 'codex',
          model: null,
          autoDelegate: false
        }
      });
      expect(runResponse.statusCode).toBe(201);
      const runId = (runResponse.json() as { run: { id: string } }).run.id;
      await harness.waitForTerminalRun(runId);

      const promptAssembly = await getPromptAssembly(harness, runId);
      expect(promptAssembly.snapshot.continuityCoverage.latestInboundDeduped).toBe(true);
      expect(promptAssembly.snapshot.continuityCoverage.continuitySummaryIncluded).toBe(true);
      expect(promptAssembly.snapshot.promptPreview).toContain('CONTINUITY_SUMMARY:');

      seedMessage(harness, {
        sessionId: originSessionId,
        direction: 'inbound',
        sender: 'operator',
        content: 'Parent-only secret note that must not bleed into delegated scope.'
      });

      const delegateResponse = await harness.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(originSessionId)}/collaboration/send`,
        payload: {
          actor: 'operator',
          target: docsWriter.id,
          prompt: 'Summarize the continuity handling for the operator.'
        }
      });
      expect(delegateResponse.statusCode).toBe(201);
      const delegatedRunId = (delegateResponse.json() as { run: { id: string } }).run.id;
      await harness.waitForTerminalRun(delegatedRunId);

      const delegatedAssembly = await getPromptAssembly(harness, delegatedRunId);
      expect(delegatedAssembly.snapshot.continuityCoverage.scope).toBe('delegated');
      expect(delegatedAssembly.snapshot.promptPreview).not.toContain('Parent-only secret note');

      const senderId = 77881;
      const firstTelegram = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 778810,
          senderId,
          text: '/session',
          username: 'continuityops'
        })
      });
      expect(firstTelegram.statusCode).toBe(200);
      const telegramSessionId = await findTelegramSessionId(harness);
      seedMessage(harness, {
        sessionId: telegramSessionId,
        direction: 'inbound',
        source: 'telegram',
        sender: 'continuityops',
        content: 'Remember the alpha launch constraint.'
      });

      const newSessionResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 778811,
          senderId,
          text: '/new',
          username: 'continuityops'
        })
      });
      expect(newSessionResponse.statusCode).toBe(200);
      const newSessionId = (newSessionResponse.json() as { sessionId: string }).sessionId;
      expect(newSessionId).not.toBe(telegramSessionId);

      const followupResponse = await harness.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(newSessionId)}/runs`,
        headers: {
          'Idempotency-Key': 'continuity-rollover-followup'
        },
        payload: {
          prompt: 'Continue with the launch plan.',
          runtime: 'codex',
          model: null,
          autoDelegate: false
        }
      });
      expect(followupResponse.statusCode).toBe(201);
      const followupRunId = (followupResponse.json() as { run: { id: string } }).run.id;
      expect(followupRunId).toBeTruthy();
      await harness.waitForTerminalRun(followupRunId!);

      const rolloverContinuity = await getContinuity(harness, newSessionId);
      expect(rolloverContinuity.ledger[0]?.mode).toBe('rollover_summary');
      expect(rolloverContinuity.ledger[0]?.summary ?? '').toContain('alpha launch constraint');
    },
    25_000
  );

  it(
    'auto-compacts under context pressure and records fresh_session_required when budget is still exhausted',
    async () => {
      const harness = await createGatewayTestHarness('continuity-auto-compact', (config) => {
        (config.runtime as Record<string, unknown>).contextAssembly = {
          enabled: true,
          totalTokenBudget: 256,
          overflowStrategy: 'fail_fast',
          transcriptWindowTurns: 2,
          transcriptMaxMessages: 4,
          memoryTopK: 1,
          memoryMinScore: 0,
          reserves: {
            instructions: 400,
            task: 400,
            recentTranscript: 400,
            memoryRecall: 400
          },
          dropOrder: ['recent_transcript', 'instructions', 'memory_recall']
        };
      });
      harnesses.push(harness);
      await applyCeoBaseline(harness);

      const sessionId = await createInternalSession(harness, 'internal:continuity-auto-origin');
      for (let index = 0; index < 12; index += 1) {
        seedMessage(harness, {
          sessionId,
          direction: index % 2 === 0 ? 'inbound' : 'outbound',
          source: index % 2 === 0 ? 'telegram' : 'agent',
          sender: index % 2 === 0 ? 'operator' : 'ceo-default',
          content:
            index % 2 === 0
              ? `Operator follow-up ${index}: keep constraint ${index} visible in continuity.`
              : `Assistant acknowledgement ${index}.`
        });
      }
      const db = harness.createDb();
      db.insertMemory({
        agentId: 'ceo-default',
        sessionId,
        source: 'agent',
        content: `Historical launch memory ${'memory '.repeat(5_000)}`,
        importance: 9,
        metadata: {
          significance: 9
        }
      });
      db.close();

      const hugePrompt = `INSTRUCTIONS ${'rule '.repeat(5_000)}\nTASK:${'do '.repeat(5_000)}`;
      const runResponse = await harness.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(sessionId)}/runs`,
        headers: {
          'Idempotency-Key': 'continuity-auto-overflow'
        },
        payload: {
          prompt: hugePrompt,
          runtime: 'codex',
          model: null,
          autoDelegate: false
        }
      });
      expect(runResponse.statusCode).toBe(201);
      const runId = (runResponse.json() as { run: { id: string } }).run.id;
      const terminal = await harness.waitForTerminalRun(runId);
      expect(terminal.status).toBe('failed');

      const promptAssembly = await getPromptAssembly(harness, runId);
      expect(promptAssembly.snapshot.continuityCoverage.compactionMode).toBe('auto_compact');
      expect(promptAssembly.snapshot.continuityCoverage.continuitySummaryIncluded).toBe(true);

      const continuityState = await getContinuity(harness, sessionId);
      const ledgerModes = continuityState.ledger.map((entry) => entry.mode);
      expect(ledgerModes).toContain('auto_compact');
      expect(ledgerModes).toContain('fresh_session_required');
    },
    20_000
  );

  it(
    'publishes comparator-backed continuity evidence for manual compact, delegated scope, auto compact, and rollover',
    async () => {
      const harness = await createGatewayTestHarness('continuity-comparator-bundle', (config) => {
        (config.runtime as Record<string, unknown>).contextAssembly = {
          enabled: true,
          totalTokenBudget: 256,
          overflowStrategy: 'fail_fast',
          transcriptWindowTurns: 2,
          transcriptMaxMessages: 4,
          memoryTopK: 1,
          memoryMinScore: 0,
          reserves: {
            instructions: 400,
            task: 400,
            recentTranscript: 400,
            memoryRecall: 400
          },
          dropOrder: ['recent_transcript', 'instructions', 'memory_recall']
        };
      });
      harnesses.push(harness);
      await applyCeoBaseline(harness);

      const docsWriter = await createAgentProfile(harness, {
        name: 'Docs Writer',
        title: 'Technical Writer',
        systemPrompt: 'Preserve only delegated continuity facts.'
      });

      const operatorSessionId = await createInternalSession(harness, 'internal:continuity-compare-operator');
      seedMessage(harness, {
        sessionId: operatorSessionId,
        direction: 'inbound',
        sender: 'operator',
        content: 'Preserve the launch CTA as the unresolved constraint.'
      });
      seedMessage(harness, {
        sessionId: operatorSessionId,
        direction: 'outbound',
        source: 'agent',
        sender: 'ceo-default',
        content: 'Acknowledged.'
      });
      seedMessage(harness, {
        sessionId: operatorSessionId,
        direction: 'inbound',
        sender: 'operator',
        content: 'Keep parent-only budget details out of delegated prompts.'
      });

      const manualCompactResponse = await harness.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(operatorSessionId)}/compact`,
        payload: {
          actor: 'operator',
          preserveMessages: 2
        }
      });
      expect(manualCompactResponse.statusCode).toBe(200);

      const dedupeRunResponse = await harness.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(operatorSessionId)}/runs`,
        headers: {
          'Idempotency-Key': 'continuity-comparator-dedupe'
        },
        payload: {
          prompt: 'Keep parent-only budget details out of delegated prompts.',
          runtime: 'codex',
          model: null,
          autoDelegate: false
        }
      });
      expect(dedupeRunResponse.statusCode).toBe(201);
      const dedupeRunId = (dedupeRunResponse.json() as { run: { id: string } }).run.id;
      await harness.waitForTerminalRun(dedupeRunId);
      const dedupeAssembly = await getPromptAssembly(harness, dedupeRunId);
      expect(dedupeAssembly.snapshot.continuityCoverage.latestInboundDeduped).toBe(true);
      expect(dedupeAssembly.snapshot.continuityCoverage.continuitySummaryIncluded).toBe(true);

      seedMessage(harness, {
        sessionId: operatorSessionId,
        direction: 'inbound',
        sender: 'operator',
        content: 'Parent-only budget details that delegated scope must never receive.'
      });
      const delegatedResponse = await harness.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(operatorSessionId)}/collaboration/send`,
        payload: {
          actor: 'operator',
          target: docsWriter.id,
          prompt: 'Summarize only delegated continuity facts.'
        }
      });
      expect(delegatedResponse.statusCode).toBe(201);
      const delegatedRunId = (delegatedResponse.json() as { run: { id: string } }).run.id;
      await harness.waitForTerminalRun(delegatedRunId);
      const delegatedAssembly = await getPromptAssembly(harness, delegatedRunId);
      expect(delegatedAssembly.snapshot.continuityCoverage.scope).toBe('delegated');
      expect(delegatedAssembly.snapshot.promptPreview).not.toContain('Parent-only budget details');

      const autoSessionId = await createInternalSession(harness, 'internal:continuity-compare-auto');
      for (let index = 0; index < 12; index += 1) {
        seedMessage(harness, {
          sessionId: autoSessionId,
          direction: index % 2 === 0 ? 'inbound' : 'outbound',
          source: index % 2 === 0 ? 'telegram' : 'agent',
          sender: index % 2 === 0 ? 'operator' : 'ceo-default',
          content:
            index % 2 === 0
              ? `Follow-up ${index}: keep continuity constraint ${index}.`
              : `Ack ${index}.`
        });
      }
      const hugePrompt = `TASK ${'oversized '.repeat(7_000)}`;
      const autoRunResponse = await harness.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(autoSessionId)}/runs`,
        headers: {
          'Idempotency-Key': 'continuity-comparator-auto'
        },
        payload: {
          prompt: hugePrompt,
          runtime: 'codex',
          model: null,
          autoDelegate: false
        }
      });
      expect(autoRunResponse.statusCode).toBe(201);
      const autoRunId = (autoRunResponse.json() as { run: { id: string } }).run.id;
      await harness.waitForTerminalRun(autoRunId);
      const autoAssembly = await getPromptAssembly(harness, autoRunId);
      const autoContinuity = await getContinuity(harness, autoSessionId);
      expect(autoAssembly.snapshot.continuityCoverage.compactionMode).toBe('auto_compact');
      expect(autoContinuity.ledger.map((entry) => entry.mode)).toEqual(
        expect.arrayContaining(['auto_compact', 'fresh_session_required'])
      );

      const senderId = 77921;
      const telegramBootstrap = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 779210,
          senderId,
          text: '/session',
          username: 'continuitymatrix'
        })
      });
      expect(telegramBootstrap.statusCode).toBe(200);
      const telegramSessionId = await findTelegramSessionId(harness);
      seedMessage(harness, {
        sessionId: telegramSessionId,
        direction: 'inbound',
        source: 'telegram',
        sender: 'continuitymatrix',
        content: 'Remember the launch checklist dependency.'
      });

      const telegramCompact = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 779211,
          senderId,
          text: '/compact',
          username: 'continuitymatrix'
        })
      });
      expect(telegramCompact.statusCode).toBe(200);

      const newSessionResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 779212,
          senderId,
          text: '/new',
          username: 'continuitymatrix'
        })
      });
      expect(newSessionResponse.statusCode).toBe(200);
      const rolloverSessionId = (newSessionResponse.json() as { sessionId: string }).sessionId;
      const rolloverContinuity = await getContinuity(harness, rolloverSessionId);
      expect(rolloverContinuity.ledger.map((entry) => entry.mode)).toContain('rollover_summary');

      const reportResponse = await harness.inject({
        method: 'POST',
        url: '/api/certification/continuity/report',
        payload: {
          status: 'passed',
          matrix: [
            {
              scenario: 'operator_followup_dedupe',
              surface: 'api',
              status: 'passed',
              continuityModes: ['manual_compact'],
              scope: 'operator',
              sessionId: operatorSessionId,
              runId: dedupeRunId,
              summary: 'Manual compaction preserved continuity summary and removed newest-turn duplication.',
              evidence: [
                `run:${dedupeRunId}`,
                `summaryIncluded:${String(dedupeAssembly.snapshot.continuityCoverage.continuitySummaryIncluded)}`,
                `deduped:${String(dedupeAssembly.snapshot.continuityCoverage.latestInboundDeduped)}`
              ]
            },
            {
              scenario: 'delegated_scope_isolation',
              surface: 'api',
              status: 'passed',
              continuityModes: ['manual_compact'],
              scope: 'delegated',
              sessionId: operatorSessionId,
              runId: delegatedRunId,
              summary: 'Delegated scope received a scoped handoff without raw parent transcript bleed.',
              evidence: [`run:${delegatedRunId}`, 'scope:delegated', 'parent-secret-excluded:true']
            },
            {
              scenario: 'auto_compaction_pressure',
              surface: 'api',
              status: 'passed',
              continuityModes: ['auto_compact', 'fresh_session_required'],
              scope: 'operator',
              sessionId: autoSessionId,
              runId: autoRunId,
              summary: 'Automatic compaction ran once under pressure and emitted a fresh-session-required receipt when budget stayed exhausted.',
              evidence: [
                `run:${autoRunId}`,
                `compaction:${String(autoAssembly.snapshot.continuityCoverage.compactionMode)}`,
                `ledger:${autoContinuity.ledger.map((entry) => entry.mode).join(',')}`
              ]
            },
            {
              scenario: 'telegram_rollover_summary',
              surface: 'telegram',
              status: 'passed',
              continuityModes: ['manual_compact', 'rollover_summary'],
              scope: 'operator',
              sessionId: rolloverSessionId,
              runId: null,
              summary: 'Telegram /compact and /new exported a rollover summary for the next session.',
              evidence: [`session:${rolloverSessionId}`, `ledger:${rolloverContinuity.ledger.map((entry) => entry.mode).join(',')}`]
            }
          ],
          comparators: [
            {
              comparator: 'baseline_alpha',
              claim: 'Manual compact semantics stay explicit and newest-turn dedupe is observable.',
              status: 'met',
              notes: ['Manual compaction is operator-triggered and recorded in the continuity ledger.'],
              evidence: [`run:${dedupeRunId}`]
            },
            {
              comparator: 'baseline_beta',
              claim: 'Rollover summaries survive explicit thread resets instead of silently dropping context.',
              status: 'met',
              notes: ['Telegram /new records rollover_summary with the carried-forward constraint.'],
              evidence: [`session:${rolloverSessionId}`]
            },
            {
              comparator: 'baseline_gamma',
              claim: 'Delegated sessions receive scoped continuity instead of inheriting raw parent transcript history.',
              status: 'met',
              notes: ['Delegated prompt assembly reported delegated scope and excluded the parent-only secret.'],
              evidence: [`run:${delegatedRunId}`]
            },
            {
              comparator: 'baseline_delta',
              claim: 'Automatic compaction is owned by the runtime loop and emits explicit fresh-session-required evidence when needed.',
              status: 'met',
              notes: ['Auto compaction and fresh_session_required are both visible in the continuity ledger.'],
              evidence: [`run:${autoRunId}`]
            }
          ],
          followUpTasks: [],
          summary: [
            'Manual compact, delegated scope, auto compact, and rollover summary scenarios all produced explicit evidence.',
            'Comparator rows map ElyzeLabs continuity behavior directly against baseline_alpha, baseline_beta, baseline_gamma, and baseline_delta expectations.'
          ],
          artifacts: {
            operatorSessionId,
            autoSessionId,
            rolloverSessionId
          }
        }
      });
      expect(reportResponse.statusCode).toBe(201);

      const certificationResponse = await harness.inject({
        method: 'GET',
        url: '/api/certification/continuity'
      });
      expect(certificationResponse.statusCode).toBe(200);
      const certificationBody = certificationResponse.json() as { certification: ContinuityCertificationReport | null };
      expect(certificationBody.certification?.schema).toBe('ops.continuity-certification.v1');
      expect(certificationBody.certification?.matrix).toHaveLength(4);
      expect(certificationBody.certification?.comparators.map((entry) => entry.comparator)).toEqual(
        expect.arrayContaining(['baseline_alpha', 'baseline_beta', 'baseline_gamma', 'baseline_delta'])
      );
    },
    35_000
  );
});
