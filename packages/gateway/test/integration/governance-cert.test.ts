import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';
import { buildGatewayApp } from '../../src/server.js';
import { installPortableRuntimeBinaryShims } from './runtime-binary-shims.js';

describe('governance certification integration', () => {
  const restoreRuntimeBinaryShims = installPortableRuntimeBinaryShims('ops-governance-cert');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-governance-cert-'));
  const runtimeConfigPath = path.join(root, 'runtime-config.json');
  const ensureRuntimeBinaryToolsInstalled = (): void => {
    const db = new ControlPlaneDatabase(sqlitePath);
    for (const runtime of ['codex', 'claude', 'gemini'] as const) {
      db.upsertTool({
        name: runtime,
        source: 'runtime',
        installed: true,
        enabled: true
      });
    }
    db.close();
  };
  const apiToken = 'integration-token';
  const sqlitePath = path.join(root, 'state.db');
  const webhookSecret = 'integration-governance-webhook-secret';
  const originalWebhookSecret = process.env.OPS_GITHUB_WEBHOOK_SECRET;
  const config = {
    server: {
      host: '127.0.0.1',
      port: 8788,
      companyName: 'Company',
      corsOrigin: '*',
      apiToken,
      logLevel: 'error'
    },
    channel: {
      telegram: {
        enabled: false,
        botToken: undefined,
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
        maxAttempts: 3,
        baseDelayMs: 50,
        maxDelayMs: 120
      }
    },
    runtime: {
      defaultRuntime: 'process',
      workspaceRoot: root,
      workspaceStrategy: 'session',
      adapters: {
        codex: { command: 'codex', args: [] },
        claude: { command: 'claude', args: [] },
        gemini: { command: 'gemini', args: [] },
        process: {
          command: 'node',
          args: ['-e', 'let p=\"\";process.stdin.on(\"data\",c=>p+=c);process.stdin.on(\"end\",()=>{process.stdout.write(p||\"ok\");process.exit(0)});']
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
      enabled: false,
      requireUnlockOnStartup: false,
      autoUnlockFromEnv: false,
      envKey: undefined,
      allowPassphraseUnlock: true,
      passphraseSalt: 'integration-vault-salt',
      passphraseIterations: 10000
    },
    skills: {
      directories: ['skills', '.ops/skills'],
      catalogStrict: false,
      sandboxDefault: true,
      installer: {
        enabled: false,
        allowedSources: ['*/*'],
        blockedSources: [],
        requireApproval: false,
        timeoutMs: 20_000,
        maxAttempts: 1,
        installRoot: '.ops/skills'
      }
    },
    policy: {
      requirePairing: false,
      allowElevatedExecution: false,
      elevatedApprover: 'operator',
      delegationGuards: {
        maxHops: 4,
        maxFanoutPerStep: 3,
        cycleDetection: true
      }
    },
    observability: {
      eventBufferSize: 400,
      metricsWindowSec: 60
    },
    office: {
      enabled: false,
      defaultLayoutName: 'Main'
    },
    persistence: {
      sqlitePath
    }
  } as const;

  let app: Awaited<ReturnType<typeof buildGatewayApp>>;
  let defaultAgentId = 'ceo-default';

  const authHeaders = (
    role: 'viewer' | 'operator' | 'admin' = 'operator',
    overrides: Record<string, string> = {}
  ) => ({
    Authorization: `Bearer ${apiToken}`,
    'x-ops-role': role,
    ...overrides
  });
  const runHeaders = (role?: 'viewer' | 'operator' | 'admin', overrides: Record<string, string> = {}) => ({
    ...authHeaders(role, overrides),
    'idempotency-key': randomUUID()
  });
  const fetchUrl = (input: unknown): string => {
    if (typeof input === 'string') {
      return input;
    }
    if (input instanceof URL) {
      return input.toString();
    }
    if (typeof Request !== 'undefined' && input instanceof Request) {
      return input.url;
    }
    if (typeof input === 'object' && input !== null && 'url' in input) {
      const url = (input as { url?: unknown }).url;
      return typeof url === 'string' ? url : String(url ?? '');
    }
    return String(input ?? '');
  };

  const waitForRunTerminal = async (runId: string, timeoutMs = 12_000): Promise<{ status: string; error: string | null }> => {
    const deadline = Date.now() + timeoutMs;
    const terminal = new Set(['completed', 'failed', 'aborted']);
    while (Date.now() < deadline) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/runs/${runId}`,
        headers: authHeaders()
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { run: { status: string; error: string | null } };
      if (terminal.has(body.run.status)) {
        return body.run;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`run ${runId} did not reach terminal state`);
  };

  beforeAll(async () => {
    process.env.OPENROUTER_API_KEY =
      process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim().length > 0
        ? process.env.OPENROUTER_API_KEY
        : 'integration-openrouter-key';
    process.env.GOOGLE_API_KEY =
      process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim().length > 0
        ? process.env.GOOGLE_API_KEY
        : 'integration-google-key';
    process.env.OPS_GITHUB_PAT = process.env.OPS_GITHUB_PAT ?? 'ghp_integration_test';
    process.env.OPS_GITHUB_WEBHOOK_SECRET = webhookSecret;
    fs.writeFileSync(runtimeConfigPath, JSON.stringify(config, null, 2));
    app = await buildGatewayApp(config as never, { runtimeConfigPath });
    ensureRuntimeBinaryToolsInstalled();
    const createAgent = await app.inject({
      method: 'POST',
      url: '/api/agents/profiles',
      headers: authHeaders()
      ,
      payload: {
        id: 'test-agent',
        name: 'test-agent',
        title: 'Test Agent',
        systemPrompt: 'integration test agent',
        defaultRuntime: 'process',
        allowedRuntimes: ['process', 'codex', 'claude', 'gemini']
      }
    });
    expect([200, 201]).toContain(createAgent.statusCode);
    const createAgentBody = createAgent.json() as {
      agent?: { id?: string };
    };
    if (typeof createAgentBody.agent?.id === 'string' && createAgentBody.agent.id.length > 0) {
      defaultAgentId = createAgentBody.agent.id;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    restoreRuntimeBinaryShims();
    if (originalWebhookSecret === undefined) {
      delete process.env.OPS_GITHUB_WEBHOOK_SECRET;
    } else {
      process.env.OPS_GITHUB_WEBHOOK_SECRET = originalWebhookSecret;
    }
  });

  it('serves OpenAPI/Scalar, enforces RBAC, and reconciles GitHub issue sync webhooks', async () => {
    const openapi = await app.inject({
      method: 'GET',
      url: '/api/openapi'
    });
    expect(openapi.statusCode).toBe(200);
    const openapiBody = openapi.json() as { openapi: string; paths: Record<string, unknown> };
    expect(openapiBody.openapi).toBe('3.1.0');
    expect(Object.keys(openapiBody.paths)).toContain('/api/sessions');
    expect(Object.keys(openapiBody.paths)).toContain('/api/backlog/items/{itemId}/issues/sync');

    const docs = await app.inject({
      method: 'GET',
      url: '/api/docs'
    });
    expect(docs.statusCode).toBe(200);
    expect(docs.headers['content-type']).toContain('text/html');
    expect(docs.body).toContain('@scalar/api-reference');
    expect(docs.body).toContain('data-url="/api/openapi"');

    const viewerRead = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: authHeaders('viewer')
    });
    expect(viewerRead.statusCode).toBe(200);

    const viewerWrite = await app.inject({
      method: 'POST',
      url: '/api/backlog/items',
      headers: authHeaders('viewer'),
      payload: {
        title: 'viewer-mutate-blocked',
        description: 'viewer should not mutate backlog',
        state: 'planned',
        priority: 50
      }
    });
    expect(viewerWrite.statusCode).toBe(403);
    expect((viewerWrite.json() as { details?: { reason?: string } }).details?.reason).toBe('rbac_forbidden');

    const operatorWrite = await app.inject({
      method: 'POST',
      url: '/api/backlog/items',
      headers: authHeaders('operator'),
      payload: {
        title: 'issue-sync-item',
        description: 'sync this with github issue',
        state: 'review',
        priority: 80,
        labels: ['feature'],
        repoRoot: root
      }
    });
    expect(operatorWrite.statusCode).toBe(201);
    const itemId = (operatorWrite.json() as { item: { id: string } }).item.id;

    const operatorRbacWrite = await app.inject({
      method: 'PUT',
      url: '/api/rbac/policy',
      headers: authHeaders('operator'),
      payload: {
        actor: 'operator',
        note: 'should fail'
      }
    });
    expect(operatorRbacWrite.statusCode).toBe(403);

    const adminRbacWrite = await app.inject({
      method: 'PUT',
      url: '/api/rbac/policy',
      headers: authHeaders('admin'),
      payload: {
        actor: 'admin',
        note: 'updated in test'
      }
    });
    expect(adminRbacWrite.statusCode).toBe(200);

    const remoteOperatorHeaderWrite = await app.inject({
      method: 'PUT',
      url: '/api/rbac/policy',
      headers: authHeaders('operator', {
        host: 'api.example.com'
      }),
      payload: {
        actor: 'remote-operator-header',
        note: 'explicitly downgraded operator role should remain blocked'
      }
    });
    expect(remoteOperatorHeaderWrite.statusCode).toBe(403);
    expect((remoteOperatorHeaderWrite.json() as { details?: { reason?: string } }).details?.reason).toBe(
      'rbac_forbidden'
    );

    const repoCreate = await app.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: authHeaders(),
      payload: {
        owner: 'elyzesolutions',
        repo: 'ugothere.ai',
        authSecretRef: 'env:OPS_GITHUB_PAT',
        authMode: 'pat_fallback',
        webhookSecretRef: 'env:OPS_GITHUB_WEBHOOK_SECRET',
        metadata: {
          patFallbackAllowed: true
        },
        enabled: true
      }
    });
    expect(repoCreate.statusCode).toBe(201);
    const repoConnectionId = (repoCreate.json() as { repo: { id: string } }).repo.id;

    const linkDelivery = await app.inject({
      method: 'PUT',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`,
      headers: authHeaders(),
      payload: {
        repoConnectionId,
        status: 'in_progress'
      }
    });
    expect(linkDelivery.statusCode).toBe(200);

    const configurePolicy = await app.inject({
      method: 'PUT',
      url: '/api/github/issues/config',
      headers: authHeaders(),
      payload: {
        mode: 'two_way',
        conflictResolution: 'github_wins',
        stateLabelMap: {
          planned: ['state:planned'],
          in_progress: ['state:in_progress'],
          review: ['state:review'],
          blocked: ['state:blocked'],
          done: ['state:done']
        },
        priorityLabelRules: [
          { minPriority: 90, label: 'priority:critical' },
          { minPriority: 70, label: 'priority:high' },
          { minPriority: 40, label: 'priority:medium' }
        ],
        assigneeByAgentId: {}
      }
    });
    expect(configurePolicy.statusCode).toBe(200);

    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: unknown, init?: unknown) => {
      const url = String(input ?? '');
      if (url.includes('/issues')) {
        return new Response(
          JSON.stringify({
            number: 123,
            state: 'open',
            html_url: 'https://github.com/elyzesolutions/ugothere.ai/issues/123'
          }),
          {
            status: 201,
            headers: {
              'content-type': 'application/json'
            }
          }
        );
      }
      return originalFetch(input as RequestInfo | URL, init as RequestInit);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const syncIssue = await app.inject({
        method: 'POST',
        url: `/api/backlog/items/${encodeURIComponent(itemId)}/issues/sync`,
        headers: authHeaders(),
        payload: {
          repoConnectionId
        }
      });
      expect(syncIssue.statusCode).toBe(200);
      const syncBody = syncIssue.json() as {
        issue: { number: number; labels: string[]; assignee: string | null };
      };
      expect(syncBody.issue.number).toBe(123);
      expect(syncBody.issue.labels).toContain('state:review');
      expect(syncBody.issue.labels).toContain('priority:high');
      expect(syncBody.issue.assignee).toBeNull();

      const webhookPayload = {
        action: 'closed',
        repository: {
          name: 'ugothere.ai',
          owner: {
            login: 'elyzesolutions'
          }
        },
        issue: {
          number: 123,
          state: 'closed',
          html_url: 'https://github.com/elyzesolutions/ugothere.ai/issues/123',
          labels: [{ name: 'state:done' }],
          assignees: [{ login: 'octocat' }]
        }
      };
      const webhookSignature = `sha256=${createHmac('sha256', webhookSecret).update(JSON.stringify(webhookPayload)).digest('hex')}`;
      const webhook = await app.inject({
        method: 'POST',
        url: '/api/github/webhooks',
        headers: {
          ...authHeaders(),
          'x-github-event': 'issues',
          'x-hub-signature-256': webhookSignature
        },
        payload: webhookPayload
      });
      expect(webhook.statusCode).toBe(200);

      const itemDetails = await app.inject({
        method: 'GET',
        url: `/api/backlog/items/${encodeURIComponent(itemId)}`,
        headers: authHeaders()
      });
      expect(itemDetails.statusCode).toBe(200);
      const detailsBody = itemDetails.json() as {
        item: {
          state: string;
          delivery: null | {
            metadata: {
              githubIssue?: {
                state?: string;
              };
            };
          };
        };
      };
      expect(detailsBody.item.state).toBe('done');
      expect(detailsBody.item.delivery?.metadata.githubIssue?.state).toBe('closed');
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('contains delegation loops (hop/cycle/fanout) and enforces strict-primary retry fail-fast evidence', async () => {
    const createProfile = async (id: string): Promise<void> => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/agents/profiles',
        headers: authHeaders(),
        payload: {
          id,
          name: id,
          title: id,
          systemPrompt: 'delegate test profile',
          defaultRuntime: 'process',
          allowedRuntimes: ['process']
        }
      });
      expect([201, 200]).toContain(response.statusCode);
    };

    await createProfile('hop-a');
    await createProfile('hop-b');
    await createProfile('hop-c');
    await createProfile('hop-d');
    await createProfile('hop-e');

    const rootSessionResponse = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: authHeaders(),
      payload: {
        label: 'hop-root',
        agentId: defaultAgentId,
        runtime: 'process'
      }
    });
    expect(rootSessionResponse.statusCode).toBe(201);
    const rootSessionPayload = rootSessionResponse.json() as { session: { id: string; agentId: string } };
    const rootSessionId = rootSessionPayload.session.id;
    const rootAgentId = rootSessionPayload.session.agentId;

    const delegate = async (sourceSessionId: string, targetAgentId: string, mode = 'hop-test') => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(sourceSessionId)}/delegate`,
        headers: authHeaders(),
        payload: {
          targetAgentId,
          prompt: `delegate to ${targetAgentId}`,
          runtime: 'process',
          mode
        }
      });
      return response;
    };

    const hop1 = await delegate(rootSessionId, 'hop-a');
    expect(hop1.statusCode).toBe(201);
    const hop1SessionId = (hop1.json() as { targetSession: { id: string } }).targetSession.id;

    const hop2 = await delegate(hop1SessionId, 'hop-b');
    expect(hop2.statusCode).toBe(201);
    const hop2SessionId = (hop2.json() as { targetSession: { id: string } }).targetSession.id;

    const hop3 = await delegate(hop2SessionId, 'hop-c');
    expect(hop3.statusCode).toBe(201);
    const hop3SessionId = (hop3.json() as { targetSession: { id: string } }).targetSession.id;

    const hop4 = await delegate(hop3SessionId, 'hop-d');
    expect(hop4.statusCode).toBe(201);
    const hop4SessionId = (hop4.json() as { targetSession: { id: string } }).targetSession.id;

    const hopExceeded = await delegate(hop4SessionId, 'hop-e');
    expect(hopExceeded.statusCode).toBe(409);
    expect((hopExceeded.json() as { details?: { reason?: string } }).details?.reason).toBe('hop_limit_exceeded');

    const cycleAttempt = await delegate(hop2SessionId, rootAgentId);
    expect(cycleAttempt.statusCode).toBe(409);
    expect((cycleAttempt.json() as { details?: { reason?: string } }).details?.reason).toBe('cycle_detected');

    const contractSession = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: authHeaders(),
      payload: {
        label: 'contract-fanout-root',
        agentId: defaultAgentId,
        runtime: 'process'
      }
    });
    expect(contractSession.statusCode).toBe(201);
    const contractSessionId = (contractSession.json() as { session: { id: string } }).session.id;

    const contractRun = await app.inject({
      method: 'POST',
      url: `/api/sessions/${encodeURIComponent(contractSessionId)}/runs`,
      headers: runHeaders(),
      payload: {
        prompt: 'contract host run',
        runtime: 'process'
      }
    });
    expect(contractRun.statusCode).toBe(201);
    const contractRunId = (contractRun.json() as { run: { id: string } }).run.id;
    await waitForRunTerminal(contractRunId);

    const db = new ControlPlaneDatabase(sqlitePath);
    db.upsertExecutionContract({
      runId: contractRunId,
      sessionId: contractSessionId,
      source: 'execution_contract_manual',
      status: 'parsed',
      contract: {
        schema: 'ops.execution-contract.v1',
        type: 'execution_contract',
        tasks: [
          { taskId: 'a', title: 'A', action: 'dispatch_subrun', prompt: 'A', targetAgentId: 'hop-a' },
          { taskId: 'b', title: 'B', action: 'dispatch_subrun', prompt: 'B', targetAgentId: 'hop-a' },
          { taskId: 'c', title: 'C', action: 'dispatch_subrun', prompt: 'C', targetAgentId: 'hop-a' },
          { taskId: 'd', title: 'D', action: 'dispatch_subrun', prompt: 'D', targetAgentId: 'hop-a' }
        ]
      }
    });

    const fanoutDispatch = await app.inject({
      method: 'POST',
      url: `/api/runs/${encodeURIComponent(contractRunId)}/control-actions`,
      headers: authHeaders(),
      payload: {
        action: 'dispatch_subrun',
        actor: 'integration-test'
      }
    });
    expect(fanoutDispatch.statusCode).toBe(200);
    const fanoutBody = fanoutDispatch.json() as {
      summary: { queued: number; blocked: number };
      dispatches: Array<{ taskId: string; status: string; reason: string }>;
    };
    expect(fanoutBody.summary.queued).toBe(3);
    expect(fanoutBody.summary.blocked).toBeGreaterThanOrEqual(1);
    expect(fanoutBody.dispatches.some((dispatch) => dispatch.taskId === 'd' && dispatch.reason === 'fanout_limit_exceeded')).toBe(
      true
    );
    db.close();

    const originalFetch = globalThis.fetch;
    let googleCalls = 0;
    const fetchMock = vi.fn(async (input: unknown, init?: unknown) => {
      const url = fetchUrl(input);
      if (url.includes('openrouter.ai/api/v1/chat/completions')) {
        return new Response(
          JSON.stringify({
            error: {
              message: 'service unavailable'
            }
          }),
          {
            status: 503,
            headers: {
              'content-type': 'application/json'
            }
          }
        );
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        googleCalls += 1;
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'google fallback result' }] } }],
            usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 8, totalTokenCount: 16 }
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json'
            }
          }
        );
      }
      return originalFetch(input as RequestInfo | URL, init as RequestInit);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const limits = await app.inject({
        method: 'PUT',
        url: '/api/llm/limits',
        headers: authHeaders(),
        payload: {
          limits: {
            providerCallBudgetDaily: { openrouter: 500, google: 500 },
            providerCallsPerMinute: {},
            providerCostBudgetUsdDaily: {},
            providerCostBudgetUsdMonthly: {},
            modelCallBudgetDaily: {},
            primaryModelByRuntime: {
              process: 'openrouter/openai/gpt-5-mini',
              codex: 'openrouter/openai/gpt-5-mini',
              claude: 'openrouter/openai/gpt-5-mini',
              gemini: 'openrouter/openai/gpt-5-mini'
            },
            fallbackByRuntime: {
              process: [{ runtime: 'process', model: 'gemini-3-flash-preview' }],
              codex: [],
              claude: [],
              gemini: []
            },
            strictPrimaryByRuntime: {
              process: true,
              codex: false,
              claude: false,
              gemini: false
            }
          }
        }
      });
      expect(limits.statusCode).toBe(200);

      const strictSession = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: authHeaders(),
        payload: {
          label: 'strict-primary-fail-fast',
          agentId: defaultAgentId,
          runtime: 'process'
        }
      });
      expect(strictSession.statusCode).toBe(201);
      const strictSessionId = (strictSession.json() as { session: { id: string } }).session.id;

      const strictRunCreate = await app.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(strictSessionId)}/runs`,
        headers: runHeaders(),
        payload: {
          prompt: 'strict primary should not fallback',
          runtime: 'process'
        }
      });
      expect(strictRunCreate.statusCode).toBe(201);
      const strictRunId = (strictRunCreate.json() as { run: { id: string } }).run.id;

      const strictRun = await waitForRunTerminal(strictRunId);
      expect(strictRun.status).toBe('failed');

      const strictEvents = await app.inject({
        method: 'GET',
        url: '/api/events?since=0&limit=500',
        headers: authHeaders()
      });
      expect(strictEvents.statusCode).toBe(200);
      const strictEventsBody = strictEvents.json() as {
        events: Array<{
          kind: string;
          runId: string | null;
          data: Record<string, unknown>;
        }>;
      };
      const retryEvents = strictEventsBody.events.filter(
        (event) => event.runId === strictRunId && event.kind === 'queue.retry'
      );
      expect(retryEvents.length).toBeGreaterThan(0);
      expect(
        retryEvents.every((event) => {
          const routeEvidence = (event.data?.routeEvidence ?? {}) as Record<string, unknown>;
          return routeEvidence.fallbackSkippedByPolicy === true;
        })
      ).toBe(true);

      const strictTimeline = await app.inject({
        method: 'GET',
        url: `/api/runs/${encodeURIComponent(strictRunId)}/timeline`,
        headers: authHeaders()
      });
      expect(strictTimeline.statusCode).toBe(200);
      expect(googleCalls).toBe(0);
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  }, 25_000);

  it('rotates to fallback routes on retry and preserves intended runtime across codex/claude/gemini paths', async () => {
    const originalFetch = globalThis.fetch;
    let googleCalls = 0;
    const fetchMock = vi.fn(async (input: unknown, init?: unknown) => {
      const url = fetchUrl(input);
      if (url.includes('openrouter.ai/api/v1/chat/completions')) {
        return new Response(
          JSON.stringify({
            error: {
              message: 'service unavailable'
            }
          }),
          {
            status: 503,
            headers: {
              'content-type': 'application/json'
            }
          }
        );
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        googleCalls += 1;
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'fallback complete' }] } }],
            usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 9, totalTokenCount: 15 }
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json'
            }
          }
        );
      }
      return originalFetch(input as RequestInfo | URL, init as RequestInit);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    try {
      const limits = await app.inject({
        method: 'PUT',
        url: '/api/llm/limits',
        headers: authHeaders(),
        payload: {
          limits: {
            providerCallBudgetDaily: { openrouter: 500, google: 500 },
            providerCallsPerMinute: {},
            providerCostBudgetUsdDaily: {},
            providerCostBudgetUsdMonthly: {},
            modelCallBudgetDaily: {},
            strictPrimaryByRuntime: {
              process: false,
              codex: false,
              claude: false,
              gemini: false
            },
            primaryModelByRuntime: {
              process: 'openrouter/openai/gpt-5-mini',
              codex: 'openrouter/openai/gpt-5-mini',
              claude: 'openrouter/openai/gpt-5-mini',
              gemini: 'openrouter/openai/gpt-5-mini'
            },
            fallbackByRuntime: {
              process: [{ runtime: 'process', model: 'gemini-3-flash-preview' }],
              codex: [{ runtime: 'process', model: 'gemini-3-flash-preview' }],
              claude: [{ runtime: 'process', model: 'gemini-3-flash-preview' }],
              gemini: [{ runtime: 'process', model: 'gemini-3-flash-preview' }]
            }
          }
        }
      });
      expect(limits.statusCode).toBe(200);

      const runtimes: Array<'codex' | 'claude' | 'gemini'> = ['codex', 'claude', 'gemini'];
      const runIds: string[] = [];
      const runtimeByRunId = new Map<string, string>();
      for (const runtime of runtimes) {
        const session = await app.inject({
          method: 'POST',
          url: '/api/sessions',
          headers: authHeaders(),
          payload: {
            label: `${runtime}-fallback-session`,
            agentId: defaultAgentId,
            runtime
          }
        });
        expect(session.statusCode).toBe(201);
        const sessionId = (session.json() as { session: { id: string } }).session.id;
        const queued = await app.inject({
          method: 'POST',
          url: `/api/sessions/${encodeURIComponent(sessionId)}/runs`,
          headers: runHeaders(),
          payload: {
            prompt: `${runtime} path should fallback`,
            runtime
          }
        });
        expect(queued.statusCode).toBe(201);
        const runId = (queued.json() as { run: { id: string } }).run.id;
        runIds.push(runId);
        runtimeByRunId.set(runId, runtime);
      }

      const settled = await Promise.all(runIds.map((runId) => waitForRunTerminal(runId, 18_000)));
      for (const run of settled) {
        expect(run.status).toBe('completed');
      }
      for (const runId of runIds) {
        const details = await app.inject({
          method: 'GET',
          url: `/api/runs/${encodeURIComponent(runId)}`,
          headers: authHeaders()
        });
        expect(details.statusCode).toBe(200);
        const detailsBody = details.json() as {
          run: {
            runtime: string;
            requestedRuntime?: string | null;
            effectiveRuntime?: string | null;
            effectiveModel?: string | null;
          };
        };
        expect(['codex', 'claude', 'gemini']).toContain(detailsBody.run.requestedRuntime ?? detailsBody.run.runtime);
        expect(detailsBody.run.effectiveRuntime ?? detailsBody.run.runtime).toBe('process');
        expect((detailsBody.run.effectiveModel ?? '').toLowerCase()).toContain('gemini');
      }

      const eventsResponse = await app.inject({
        method: 'GET',
        url: '/api/events?since=0&limit=500',
        headers: authHeaders()
      });
      expect(eventsResponse.statusCode).toBe(200);
      const eventsBody = eventsResponse.json() as {
        events: Array<{
          kind: string;
          message: string;
          runId: string | null;
          data: Record<string, unknown>;
        }>;
      };
      for (const runId of runIds) {
        const fallbackSwitchEvent = eventsBody.events.find(
          (event) => event.runId === runId && event.kind === 'system.info' && event.message === 'Retry route switched to fallback model'
        );
        expect(fallbackSwitchEvent).toBeTruthy();
        const previousRoute = (fallbackSwitchEvent?.data?.previousRoute ?? {}) as Record<string, unknown>;
        expect(previousRoute.model).toBe('openrouter/openai/gpt-5-mini');

        const retryEvent = eventsBody.events.find((event) => event.runId === runId && event.kind === 'queue.retry');
        expect(retryEvent).toBeTruthy();
        const routeEvidence = (retryEvent?.data?.routeEvidence ?? {}) as Record<string, unknown>;
        expect(routeEvidence.fallbackAttempted).toBe(true);
      }
      expect(googleCalls).toBeGreaterThanOrEqual(3);
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  }, 30_000);
});
