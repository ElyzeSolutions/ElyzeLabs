import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { buildGatewayApp } from '../../packages/gateway/src/server.js';

const RUNTIMES = ['codex', 'claude', 'gemini', 'process'] as const;

const CONTEXT_ASSEMBLY_CONFIG = {
  enabled: true,
  totalTokenBudget: 4096,
  overflowStrategy: 'shrink',
  transcriptWindowTurns: 2,
  transcriptMaxMessages: 8,
  memoryTopK: 4,
  memoryMinScore: 0,
  reserves: {
    instructions: 1200,
    task: 1400,
    recentTranscript: 900,
    memoryRecall: 600
  },
  dropOrder: ['memory_recall', 'recent_transcript', 'instructions']
} as const;

function createAdapterScript(): string {
  return [
    'let input = "";',
    'process.stdin.on("data", (chunk) => { input += chunk; });',
    'process.stdin.on("end", () => {',
    '  const attemptOne = input.includes(\'"attempt": 1\');',
    '  if (input.includes("OVERFLOW_CERT") && attemptOne) {',
    '    process.stderr.write("context window overflow\\n");',
    '    process.exit(1);',
    '    return;',
    '  }',
    '  if (input.includes("LOW_RECALL_CERT") && attemptOne) {',
    '    process.stderr.write("low recall memory context missing\\n");',
    '    process.exit(1);',
    '    return;',
    '  }',
    '  if (input.includes("OVERFLOW_CERT")) {',
    '    process.stdout.write("OVERFLOW_RECOVERED");',
    '    return;',
    '  }',
    '  if (input.includes("LOW_RECALL_CERT")) {',
    '    process.stdout.write("LOW_RECALL_RECOVERED");',
    '    return;',
    '  }',
    '  process.stdout.write(input || "ok");',
    '});'
  ].join('');
}

describe('continuity certification harness', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-continuity-cert-'));
  const originalFetch = globalThis.fetch;

  afterAll(() => {
    vi.stubGlobal('fetch', originalFetch);
  });

  it('produces baseline-vs-context certification evidence across API and Telegram paths', async () => {
    fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('api.telegram.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: { message_id: 1 } }),
          text: async () => JSON.stringify({ ok: true, result: { message_id: 1 } })
        } as unknown as Response;
      }
      throw new Error(`Unexpected fetch target: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const config = {
      server: {
        host: '127.0.0.1',
        port: 8788,
        companyName: 'Company',
        corsOrigin: '*',
        apiToken: 'continuity-cert-token',
        logLevel: 'error'
      },
      channel: {
        telegram: {
          enabled: true,
          botToken: 'token',
          useWebhook: false,
          debugRawOutput: false,
          dmScope: 'peer',
          requireMentionInGroups: true,
          allowlist: []
        }
      },
      queue: {
        defaultLane: 'default',
        laneConcurrency: { default: 2 },
        retry: {
          maxAttempts: 2,
          baseDelayMs: 50,
          maxDelayMs: 100
        }
      },
      runtime: {
        defaultRuntime: 'process',
        workspaceRoot: root,
        workspaceStrategy: 'session',
        contextAssembly: CONTEXT_ASSEMBLY_CONFIG,
        adapters: {
          codex: { command: 'node', args: ['-e', 'process.stdout.write("codex");'] },
          claude: { command: 'node', args: ['-e', 'process.stdout.write("claude");'] },
          gemini: { command: 'node', args: ['-e', 'process.stdout.write("gemini");'] },
          process: {
            command: 'node',
            args: ['-e', createAdapterScript()]
          }
        }
      },
      memory: {
        enabled: true,
        writeStructured: true,
        workspaceMemoryFile: 'MEMORY.md',
        dailyMemoryDir: '.daily',
        retentionDays: 30,
        embedding: {
          provider: 'noop',
          voyageModel: 'voyage-3-lite',
          voyageApiKey: undefined
        }
      },
      vault: {
        enabled: true,
        requireUnlockOnStartup: false,
        autoUnlockFromEnv: false,
        envKey: undefined,
        allowPassphraseUnlock: true,
        passphraseSalt: 'continuity-cert-vault-salt',
        passphraseIterations: 10000
      },
      skills: {
        directories: [path.join(root, 'skills')],
        catalogStrict: false,
        sandboxDefault: true,
        installer: {
          enabled: true,
          allowedSources: ['*/*'],
          blockedSources: [],
          requireApproval: true,
          timeoutMs: 20_000,
          maxAttempts: 1,
          installRoot: '.ops/skills'
        }
      },
      policy: {
        requirePairing: false,
        allowElevatedExecution: false,
        elevatedApprover: 'operator'
      },
      observability: {
        eventBufferSize: 500,
        metricsWindowSec: 60
      },
      office: {
        enabled: true,
        defaultLayoutName: 'Main'
      },
      persistence: {
        sqlitePath: path.join(root, 'state.db')
      }
    } as const;

    const app = await buildGatewayApp(config as never, {
      skillRegistryRunner: async () => ({
        exitCode: 0,
        stdout: 'noop',
        stderr: ''
      })
    });

    const inject = async (options: Parameters<typeof app.inject>[0]) => {
      if (typeof options === 'string') {
        return app.inject(options);
      }
      const headers = { ...(options.headers ?? {}) } as Record<string, string>;
      const hasAuth = Boolean(headers.Authorization || headers.authorization || headers['x-api-token']);
      if (String(options.url ?? '').startsWith('/api/') && !hasAuth) {
        headers.Authorization = `Bearer ${config.server.apiToken}`;
      }
      if (String(options.url ?? '').startsWith('/api/') && !headers['x-ops-role']) {
        headers['x-ops-role'] = 'admin';
      }
      return app.inject({
        ...options,
        headers
      });
    };

    const waitForTerminal = async (runId: string, timeoutMs = 15_000) => {
      const terminalStatuses = new Set(['completed', 'failed', 'aborted']);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const response = await inject({
          method: 'GET',
          url: `/api/runs/${runId}`
        });
        expect(response.statusCode).toBe(200);
        const payload = response.json() as {
          run: {
            status: string;
            error: string | null;
            resultSummary: string | null;
          };
        };
        if (terminalStatuses.has(payload.run.status)) {
          return payload.run;
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      throw new Error(`Run ${runId} did not reach terminal state`);
    };

    const updateContextAssemblyEnabled = async (enabled: boolean): Promise<void> => {
      const current = await inject({
        method: 'GET',
        url: '/api/config/runtime'
      });
      expect(current.statusCode).toBe(200);
      const currentBody = current.json() as { config: Record<string, unknown> };
      const nextConfig = structuredClone(currentBody.config);
      const runtime = ((nextConfig.runtime as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
      runtime.contextAssembly = {
        ...CONTEXT_ASSEMBLY_CONFIG,
        enabled
      };
      nextConfig.runtime = runtime;
      const save = await inject({
        method: 'PUT',
        url: '/api/config/runtime',
        payload: {
          config: nextConfig,
          actor: 'continuity-certification'
        }
      });
      expect(save.statusCode).toBe(200);
    };

    const forceLocalHarnessRoutes = async (): Promise<void> => {
      const limitsResponse = await inject({
        method: 'GET',
        url: '/api/llm/limits'
      });
      expect(limitsResponse.statusCode).toBe(200);
      const limitsBody = limitsResponse.json() as {
        limits: {
          primaryModelByRuntime: Record<string, string | null>;
          fallbackByRuntime: Record<string, Array<{ runtime: string; model: string | null }>>;
          localHarnessByRuntime: Record<string, boolean>;
          orchestratorPrimaryModelByRuntime: Record<string, string | null>;
          orchestratorFallbackByRuntime: Record<string, Array<{ runtime: string; model: string | null }>>;
          orchestratorLocalHarnessByRuntime: Record<string, boolean>;
        };
      };
      const nextLimits = structuredClone(limitsBody.limits);
      for (const runtime of RUNTIMES) {
        nextLimits.primaryModelByRuntime[runtime] = nextLimits.primaryModelByRuntime[runtime] ?? 'gemini-3.1-pro-preview';
        nextLimits.orchestratorPrimaryModelByRuntime[runtime] =
          nextLimits.orchestratorPrimaryModelByRuntime[runtime] ?? 'gemini-2.5-flash-lite';
        nextLimits.fallbackByRuntime[runtime] = [];
        nextLimits.orchestratorFallbackByRuntime[runtime] = [];
        nextLimits.localHarnessByRuntime[runtime] = true;
        nextLimits.orchestratorLocalHarnessByRuntime[runtime] = true;
      }
      const saveLimits = await inject({
        method: 'PUT',
        url: '/api/llm/limits',
        payload: {
          actor: 'continuity-certification',
          limits: nextLimits
        }
      });
      expect(saveLimits.statusCode).toBe(200);
    };

    const runApiContinuityScenario = async (label: string) => {
      const marker = `CERT_${label.toUpperCase()}_PIN`;
      const sessionResponse = await inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {
          label: `continuity-api-${label}`,
          agentId: 'ceo-default',
          runtime: 'process',
          model: 'default'
        }
      });
      expect(sessionResponse.statusCode).toBe(201);
      const sessionId = (sessionResponse.json() as { session: { id: string } }).session.id;

      const prompts = [
        `Constraint marker ${marker} must remain active until task completion.`,
        `Continue this plan and keep prior constraint unresolved.`,
        `Finalize the plan without re-listing every prior detail.`
      ];
      let finalRunId = '';
      for (let index = 0; index < prompts.length; index += 1) {
        const runResponse = await inject({
          method: 'POST',
          url: `/api/sessions/${sessionId}/runs`,
          headers: {
            'Idempotency-Key': `continuity-api-${label}-${index}-${Date.now()}`
          },
          payload: {
            prompt: prompts[index],
            runtime: 'process',
            model: 'default'
          }
        });
        expect(runResponse.statusCode).toBe(201);
        const runId = (runResponse.json() as { run: { id: string } }).run.id;
        finalRunId = runId;
        await waitForTerminal(runId);
      }

      const snapshotResponse = await inject({
        method: 'GET',
        url: `/api/runs/${finalRunId}/prompt-assembly`
      });
      expect(snapshotResponse.statusCode).toBe(200);
      const snapshotBody = snapshotResponse.json() as {
        snapshot: {
          promptPreview: string;
          continuityCoverage: Record<string, unknown>;
        };
      };
      return {
        runId: finalRunId,
        marker,
        containsConstraint: snapshotBody.snapshot.promptPreview.includes(marker),
        unresolvedIncluded: Boolean(snapshotBody.snapshot.continuityCoverage.unresolvedConstraintIncluded)
      };
    };

    const runTelegramContinuityScenario = async (label: string) => {
      const marker = `CERT_${label.toUpperCase()}_PIN`;
      const chatId = 91_000 + Math.floor(Math.random() * 5000);
      const senderId = chatId;
      const prompts = [
        `Constraint marker ${marker} must remain active until task completion.`,
        `Continue this plan and keep prior constraint unresolved.`,
        `Finalize the plan without re-listing every prior detail.`
      ];
      let finalRunId = '';
      for (let index = 0; index < prompts.length; index += 1) {
        const ingress = await inject({
          method: 'POST',
          url: '/api/ingress/telegram',
          payload: {
            update_id: Number(`${chatId}${index + 1}`),
            message: {
              text: prompts[index],
              chat: { id: chatId, type: 'private' },
              from: { id: senderId, username: `cert_${label}` },
              mentioned: true
            }
          }
        });
        expect(ingress.statusCode).toBe(200);
        const ingressBody = ingress.json() as { runId?: string; status: string };
        expect(ingressBody.status).toBe('queued');
        expect(ingressBody.runId).toBeTruthy();
        finalRunId = String(ingressBody.runId);
        await waitForTerminal(finalRunId);
      }

      const snapshotResponse = await inject({
        method: 'GET',
        url: `/api/runs/${finalRunId}/prompt-assembly`
      });
      expect(snapshotResponse.statusCode).toBe(200);
      const snapshotBody = snapshotResponse.json() as {
        snapshot: {
          promptPreview: string;
          continuityCoverage: Record<string, unknown>;
        };
      };
      return {
        runId: finalRunId,
        marker,
        containsConstraint: snapshotBody.snapshot.promptPreview.includes(marker),
        unresolvedIncluded: Boolean(snapshotBody.snapshot.continuityCoverage.unresolvedConstraintIncluded)
      };
    };

    const runFaultScenario = async (prompt: string, label: string) => {
      const sessionResponse = await inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {
          label: `fault-${label}`,
          agentId: 'ceo-default',
          runtime: 'process',
          model: 'default'
        }
      });
      expect(sessionResponse.statusCode).toBe(201);
      const sessionId = (sessionResponse.json() as { session: { id: string } }).session.id;
      const runResponse = await inject({
        method: 'POST',
        url: `/api/sessions/${sessionId}/runs`,
        headers: {
          'Idempotency-Key': `fault-${label}-${Date.now()}`
        },
        payload: {
          prompt,
          runtime: 'process',
          model: 'default'
        }
      });
      expect(runResponse.statusCode).toBe(201);
      const runId = (runResponse.json() as { run: { id: string } }).run.id;
      const terminal = await waitForTerminal(runId);
      const signalsResponse = await inject({
        method: 'GET',
        url: '/api/continuity/signals?limit=300'
      });
      expect(signalsResponse.statusCode).toBe(200);
      const signalsBody = signalsResponse.json() as {
        signals: Array<{
          runId: string | null;
          code: string;
          details: Record<string, unknown>;
        }>;
      };
      const runSignals = signalsBody.signals.filter((signal) => signal.runId === runId);
      const plannedSignal = runSignals.find((signal) => signal.code === 'retry_planned');
      const exhaustedSignal = runSignals.find((signal) => signal.code === 'retry_exhausted');
      return {
        runId,
        status: terminal.status,
        error: terminal.error,
        remediationAction: plannedSignal ? String(plannedSignal.details.action ?? '') : null,
        retryExhausted: Boolean(exhaustedSignal)
      };
    };

    try {
      const baselineBootstrap = await inject({
        method: 'POST',
        url: '/api/onboarding/ceo-baseline',
        payload: {
          actor: 'continuity-certification'
        }
      });
      expect(baselineBootstrap.statusCode).toBe(200);
      await forceLocalHarnessRoutes();

      await updateContextAssemblyEnabled(false);
      const baselineApi = await runApiContinuityScenario('baseline_api');
      const baselineTelegram = await runTelegramContinuityScenario('baseline_telegram');
      const baselineOverflow = await runFaultScenario('OVERFLOW_CERT baseline path', 'baseline-overflow');
      const baselineLowRecall = await runFaultScenario('LOW_RECALL_CERT baseline path', 'baseline-low-recall');

      await updateContextAssemblyEnabled(true);
      const contextApi = await runApiContinuityScenario('context_api');
      const contextTelegram = await runTelegramContinuityScenario('context_telegram');
      const contextOverflow = await runFaultScenario('OVERFLOW_CERT context path', 'context-overflow');
      const contextLowRecall = await runFaultScenario('LOW_RECALL_CERT context path', 'context-low-recall');

      const baselineContinuityHitRate =
        [baselineApi.unresolvedIncluded, baselineTelegram.unresolvedIncluded].filter(Boolean).length / 2;
      const contextContinuityHitRate =
        [contextApi.unresolvedIncluded, contextTelegram.unresolvedIncluded].filter(Boolean).length / 2;
      const baselineOverflowRecoveryRate = baselineOverflow.status === 'completed' ? 1 : 0;
      const contextOverflowRecoveryRate = contextOverflow.status === 'completed' ? 1 : 0;
      const baselineLowRecallRecoveryRate = baselineLowRecall.status === 'completed' ? 1 : 0;
      const contextLowRecallRecoveryRate = contextLowRecall.status === 'completed' ? 1 : 0;

      const reportDir = path.join(root, '.ops', 'certifications', 'continuity');
      fs.mkdirSync(reportDir, { recursive: true });
      const reportPath = path.join(reportDir, 'certification-report.json');
      const report = {
        schema: 'ops.continuity.certification.v1',
        generatedAt: new Date().toISOString(),
        baseline: {
          continuityHitRate: baselineContinuityHitRate,
          overflowRecoveryRate: baselineOverflowRecoveryRate,
          lowRecallRecoveryRate: baselineLowRecallRecoveryRate
        },
        contextBuilder: {
          continuityHitRate: contextContinuityHitRate,
          overflowRecoveryRate: contextOverflowRecoveryRate,
          lowRecallRecoveryRate: contextLowRecallRecoveryRate
        },
        deltas: {
          continuityHitRate: Number((contextContinuityHitRate - baselineContinuityHitRate).toFixed(4)),
          overflowRecoveryRate: Number((contextOverflowRecoveryRate - baselineOverflowRecoveryRate).toFixed(4)),
          lowRecallRecoveryRate: Number((contextLowRecallRecoveryRate - baselineLowRecallRecoveryRate).toFixed(4))
        },
        scenarios: {
          baseline: {
            api: baselineApi,
            telegram: baselineTelegram,
            overflow: baselineOverflow,
            lowRecall: baselineLowRecall
          },
          contextBuilder: {
            api: contextApi,
            telegram: contextTelegram,
            overflow: contextOverflow,
            lowRecall: contextLowRecall
          }
        }
      };
      fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

      expect(fs.existsSync(reportPath)).toBe(true);
      expect(contextApi.unresolvedIncluded).toBe(true);
      expect(contextTelegram.unresolvedIncluded).toBe(true);
      expect(contextContinuityHitRate).toBeGreaterThan(baselineContinuityHitRate);
      expect(contextOverflowRecoveryRate).toBeGreaterThan(baselineOverflowRecoveryRate);
      expect(contextLowRecallRecoveryRate).toBeGreaterThan(baselineLowRecallRecoveryRate);
      expect(contextOverflow.remediationAction).toBe('window_shrink');
      expect(contextLowRecall.remediationAction).toBeTruthy();
      expect(contextOverflow.retryExhausted).toBe(false);
      expect(contextLowRecall.retryExhausted).toBe(false);
    } finally {
      await app.close();
    }
  }, 90_000);
});
