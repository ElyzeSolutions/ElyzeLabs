import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildGatewayApp } from '../../src/server.js';
import { installPortableRuntimeBinaryShims } from './runtime-binary-shims.js';

describe('backlog/frontier hardening integration', () => {
  const restoreRuntimeBinaryShims = installPortableRuntimeBinaryShims('ops-backlog-frontier');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-backlog-frontier-'));
  const runtimeConfigPath = path.join(root, 'runtime-config.json');
  const apiToken = 'backlog-frontier-token';
  const sqlitePath = path.join(root, 'state.db');
  const webhookSecret = 'integration-webhook-secret';

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
          args: ['-e', 'let p="";process.stdin.on("data",c=>p+=c);process.stdin.on("end",()=>{process.stdout.write(p||"ok");process.exit(0)});']
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
      passphraseIterations: 10_000
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
      elevatedApprover: 'operator'
    },
    observability: {
      eventBufferSize: 400,
      metricsWindowSec: 60
    },
    office: {
      enabled: true,
      defaultLayoutName: 'Main'
    },
    persistence: {
      sqlitePath
    }
  } as const;

  let app: Awaited<ReturnType<typeof buildGatewayApp>>;

  const authHeaders = (): Record<string, string> => ({
    Authorization: `Bearer ${apiToken}`,
    'x-ops-role': 'admin'
  });

  beforeAll(async () => {
    process.env.OPS_GITHUB_WEBHOOK_SECRET = webhookSecret;
    fs.writeFileSync(runtimeConfigPath, JSON.stringify(config, null, 2));
    app = await buildGatewayApp(config as never, { runtimeConfigPath });
  });

  afterAll(async () => {
    await app.close();
    restoreRuntimeBinaryShims();
    delete process.env.OPS_GITHUB_WEBHOOK_SECRET;
  });

  it('serves backlog contracts, decision stream, and override dry-run previews', async () => {
    const contracts = await app.inject({
      method: 'GET',
      url: '/api/backlog/contracts',
      headers: authHeaders()
    });
    expect(contracts.statusCode).toBe(200);
    const contractsBody = contracts.json() as {
      contracts: {
        backlogUx: { schema: string };
        deliveryEvidence: { schema: string };
      };
    };
    expect(contractsBody.contracts.backlogUx.schema).toBe('ops.backlog-ux-contract.v1');
    expect(contractsBody.contracts.deliveryEvidence.schema).toBe('ops.backlog-delivery-evidence-contract.v1');

    const created = await app.inject({
      method: 'POST',
      url: '/api/backlog/items',
      headers: authHeaders(),
      payload: {
        title: 'Dry-run override candidate',
        description: 'Exercise override preview and decision stream endpoint.',
        state: 'planned',
        priority: 82,
        actor: 'test'
      }
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as { item: { id: string } };

    const dryRun = await app.inject({
      method: 'POST',
      url: '/api/backlog/orchestration/override',
      headers: authHeaders(),
      payload: {
        itemId: createdBody.item.id,
        action: 'block',
        dryRun: true,
        reason: 'preview block transition'
      }
    });
    expect(dryRun.statusCode).toBe(200);
    const dryRunBody = dryRun.json() as {
      dryRun: boolean;
      preview: {
        schema: string;
        action: string;
        allowed: boolean;
      };
    };
    expect(dryRunBody.dryRun).toBe(true);
    expect(dryRunBody.preview.schema).toBe('ops.backlog-override-preview.v1');
    expect(dryRunBody.preview.action).toBe('block');

    const apply = await app.inject({
      method: 'POST',
      url: '/api/backlog/orchestration/override',
      headers: authHeaders(),
      payload: {
        itemId: createdBody.item.id,
        action: 'block',
        reason: 'apply block transition'
      }
    });
    expect(apply.statusCode).toBe(200);

    const decisions = await app.inject({
      method: 'GET',
      url: '/api/backlog/orchestration/decisions?limit=20&action=block',
      headers: authHeaders()
    });
    expect(decisions.statusCode).toBe(200);
    const decisionsBody = decisions.json() as {
      schema: string;
      events: Array<{ action: string; reasonCode: string }>;
    };
    expect(decisionsBody.schema).toBe('ops.backlog-orchestration-decision-stream.v1');
    expect(decisionsBody.events.some((entry) => entry.action === 'block')).toBe(true);
  });

  it('requires delivery evidence before review for execution-contract backlog items', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/backlog/items',
      headers: authHeaders(),
      payload: {
        title: 'Execution contract evidence gate',
        description: 'Should not move to review without repo evidence.',
        state: 'in_progress',
        source: 'execution_contract',
        actor: 'test',
        metadata: {
          autoCreatedFromExecutionContract: true,
          executionContract: {
            schema: 'ops.execution-contract.v1',
            taskCount: 1
          }
        }
      }
    });
    expect(created.statusCode).toBe(201);
    const itemId = (created.json() as { item: { id: string } }).item.id;

    const blocked = await app.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/transition`,
      headers: authHeaders(),
      payload: {
        toState: 'review',
        actor: 'test',
        reason: 'advance without artifacts'
      }
    });
    expect(blocked.statusCode).toBe(409);
    const blockedBody = blocked.json() as { details?: { reason?: string; reasonCode?: string } };
    expect(blockedBody.details?.reason ?? blockedBody.details?.reasonCode).toBe('missing_repo_link');
  });

  it('indexes project and unscoped backlog slices for board filtering', async () => {
    const repoRoot = path.join(root, 'atlas-web');
    fs.mkdirSync(repoRoot, { recursive: true });

    const scoped = await app.inject({
      method: 'POST',
      url: '/api/backlog/items',
      headers: authHeaders(),
      payload: {
        title: 'Atlas scoped work',
        description: 'Project-scoped card with repo root.',
        state: 'planned',
        projectId: 'atlas-web',
        repoRoot,
        actor: 'test'
      }
    });
    expect(scoped.statusCode).toBe(201);
    const scopedItemId = (scoped.json() as { item: { id: string } }).item.id;

    const unscoped = await app.inject({
      method: 'POST',
      url: '/api/backlog/items',
      headers: authHeaders(),
      payload: {
        title: 'Legacy unscoped work',
        description: 'No project or repo metadata.',
        state: 'idea',
        actor: 'test'
      }
    });
    expect(unscoped.statusCode).toBe(201);
    const unscopedItemId = (unscoped.json() as { item: { id: string } }).item.id;

    const scopedBoard = await app.inject({
      method: 'GET',
      url: `/api/backlog/board?projectId=atlas-web`,
      headers: authHeaders()
    });
    expect(scopedBoard.statusCode).toBe(200);
    const scopedBoardBody = scopedBoard.json() as {
      total: number;
      columns: Record<string, Array<{ id: string }>>;
      projectScope: { projectId: string | null; repoRoot: string | null; unscopedOnly: boolean };
      availableScopes: Array<{ projectId: string | null; repoRoot: string | null; itemCount: number }>;
    };
    expect(scopedBoardBody.total).toBeGreaterThanOrEqual(1);
    expect(scopedBoardBody.projectScope.projectId).toBe('atlas-web');
    expect(scopedBoardBody.projectScope.unscopedOnly).toBe(false);
    expect(scopedBoardBody.availableScopes.some((entry) => entry.projectId === 'atlas-web' && entry.repoRoot === repoRoot)).toBe(true);
    expect(Object.values(scopedBoardBody.columns).flat().some((entry) => entry.id === scopedItemId)).toBe(true);

    const unscopedBoard = await app.inject({
      method: 'GET',
      url: '/api/backlog/board?unscoped=true',
      headers: authHeaders()
    });
    expect(unscopedBoard.statusCode).toBe(200);
    const unscopedBoardBody = unscopedBoard.json() as {
      total: number;
      columns: Record<string, Array<{ id: string }>>;
      projectScope: { projectId: string | null; repoRoot: string | null; unscopedOnly: boolean };
    };
    expect(unscopedBoardBody.total).toBeGreaterThanOrEqual(1);
    expect(unscopedBoardBody.projectScope.unscopedOnly).toBe(true);
    expect(Object.values(unscopedBoardBody.columns).flat().some((entry) => entry.id === unscopedItemId)).toBe(true);
  });

  it('deduplicates github webhook deliveries and supports replay', async () => {
    const repo = await app.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: authHeaders(),
      payload: {
        owner: 'acme',
        repo: 'portal',
        authSecretRef: 'env:GITHUB_TOKEN',
        webhookSecretRef: 'env:OPS_GITHUB_WEBHOOK_SECRET',
        enabled: true
      }
    });
    expect(repo.statusCode).toBe(201);
    const repoBody = repo.json() as { repo: { id: string } };

    const item = await app.inject({
      method: 'POST',
      url: '/api/backlog/items',
      headers: authHeaders(),
      payload: {
        title: 'Webhook dedupe candidate',
        description: 'Validate dedupe and replay control plane',
        state: 'review',
        priority: 75,
        actor: 'test'
      }
    });
    expect(item.statusCode).toBe(201);
    const itemId = (item.json() as { item: { id: string } }).item.id;

    const delivery = await app.inject({
      method: 'PUT',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`,
      headers: authHeaders(),
      payload: {
        repoConnectionId: repoBody.repo.id,
        prNumber: 7,
        status: 'review'
      }
    });
    expect(delivery.statusCode).toBe(200);

    const payload = {
      action: 'closed',
      number: 7,
      repository: {
        name: 'portal',
        owner: {
          login: 'acme'
        }
      },
      pull_request: {
        number: 7,
        state: 'closed',
        merged: true,
        html_url: 'https://github.com/acme/portal/pull/7'
      }
    };
    const signature = `sha256=${createHmac('sha256', webhookSecret).update(JSON.stringify(payload)).digest('hex')}`;

    const first = await app.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        ...authHeaders(),
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-1',
        'x-hub-signature-256': signature
      },
      payload
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json() as { processed: boolean; deduplicated: boolean; updates: number };
    expect(firstBody.processed).toBe(true);
    expect(firstBody.deduplicated).toBe(false);
    expect(firstBody.updates).toBeGreaterThan(0);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        ...authHeaders(),
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-1',
        'x-hub-signature-256': signature
      },
      payload
    });
    expect(duplicate.statusCode).toBe(200);
    const duplicateBody = duplicate.json() as { deduplicated: boolean; reason: string; updates: number };
    expect(duplicateBody.deduplicated).toBe(true);
    expect(duplicateBody.reason).toBe('duplicate_delivery');
    expect(duplicateBody.updates).toBe(0);

    const events = await app.inject({
      method: 'GET',
      url: '/api/github/webhooks/events?limit=20',
      headers: authHeaders()
    });
    expect(events.statusCode).toBe(200);
    const eventsBody = events.json() as {
      schema: string;
      entries: Array<{ deliveryId: string | null; deduplicated: boolean }>;
    };
    expect(eventsBody.schema).toBe('ops.github-webhook-events.v1');
    expect(eventsBody.entries.some((entry) => entry.deliveryId === 'delivery-1')).toBe(true);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/github/webhooks/replay',
      headers: authHeaders(),
      payload: {
        deliveryId: 'delivery-1'
      }
    });
    expect(replay.statusCode).toBe(200);
    const replayBody = replay.json() as { replayedFromDeliveryId: string; result: { processed?: boolean } };
    expect(replayBody.replayedFromDeliveryId).toBe('delivery-1');
    expect(replayBody.result.processed).toBe(true);
  });

  it('supports telegram /clear and /new soft reset commands', async () => {
    const ensureCeo = await app.inject({
      method: 'POST',
      url: '/api/agents/profiles',
      headers: authHeaders(),
      payload: {
        id: 'ceo-default',
        name: 'CEO',
        title: 'Chief Executive Agent',
        systemPrompt: 'Lead intake and route work safely.',
        defaultRuntime: 'process',
        defaultModel: null,
        enabled: true
      }
    });
    expect(ensureCeo.statusCode).toBe(201);

    const ingress = await app.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: {
        update_id: 990001,
        message: {
          text: 'hello before reset',
          chat: { id: 990001, type: 'private' },
          from: { id: 990001, username: 'reset-tester' },
          mentioned: true
        }
      }
    });
    expect(ingress.statusCode).toBe(200);
    const ingressBody = ingress.json() as { sessionId: string };

    const clear = await app.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: {
        update_id: 990002,
        message: {
          text: '/clear',
          chat: { id: 990001, type: 'private' },
          from: { id: 990001, username: 'reset-tester' },
          mentioned: true
        }
      }
    });
    expect(clear.statusCode).toBe(200);
    const clearBody = clear.json() as { command: string; status: string; sessionId: string };
    expect(clearBody.command).toBe('clear');
    expect(clearBody.status).toBe('command_applied');

    const oldSession = await app.inject({
      method: 'GET',
      url: `/api/sessions/${encodeURIComponent(ingressBody.sessionId)}`,
      headers: authHeaders()
    });
    expect(oldSession.statusCode).toBe(200);
    const oldSessionBody = oldSession.json() as { session: { metadata: { transcriptResetAt?: string } } };
    expect(typeof oldSessionBody.session.metadata.transcriptResetAt).toBe('string');

    const newThread = await app.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: {
        update_id: 990003,
        message: {
          text: '/new',
          chat: { id: 990001, type: 'private' },
          from: { id: 990001, username: 'reset-tester' },
          mentioned: true
        }
      }
    });
    expect(newThread.statusCode).toBe(200);
    const newThreadBody = newThread.json() as { command: string; status: string; sessionId: string; previousSessionId: string };
    expect(newThreadBody.command).toBe('new');
    expect(newThreadBody.status).toBe('command_applied');
    expect(newThreadBody.sessionId).not.toBe(ingressBody.sessionId);
    expect(newThreadBody.previousSessionId).toBe(ingressBody.sessionId);

    const followup = await app.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: {
        update_id: 990004,
        message: {
          text: 'hello after new',
          chat: { id: 990001, type: 'private' },
          from: { id: 990001, username: 'reset-tester' },
          mentioned: true
        }
      }
    });
    expect(followup.statusCode).toBe(200);
    const followupBody = followup.json() as { sessionId: string; status: string };
    expect(followupBody.status).toBe('queued');
    expect(followupBody.sessionId).toBe(newThreadBody.sessionId);
  });
});
