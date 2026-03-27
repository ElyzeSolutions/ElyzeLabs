import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';

import { buildGatewayApp } from '../../src/server.js';
import { installPortableRuntimeBinaryShims } from './runtime-binary-shims.js';
import { createBaseConfig, ensureRuntimeBinaryToolsInstalled } from './test-harness.js';

type GatewayApp = Awaited<ReturnType<typeof buildGatewayApp>>;
type GatewayInject = (options: Parameters<GatewayApp['inject']>[0]) => ReturnType<GatewayApp['inject']>;

interface RestartableGatewayContext {
  root: string;
  config: ReturnType<typeof createBaseConfig>;
  buildApp: () => Promise<{ app: GatewayApp; inject: GatewayInject }>;
  closeCurrentApp: () => Promise<void>;
  createDb: () => ControlPlaneDatabase;
  cleanup: () => Promise<void>;
}

const publicApiPrefixes = ['/api/hello', '/api/health/readiness', '/api/ingress/telegram', '/api/telegram/webhook'];

const buildInject = (app: GatewayApp, apiToken: string): GatewayInject => {
  return async (options) => {
    if (typeof options === 'string') {
      return app.inject(options);
    }

    const method = String(options.method ?? 'GET').toUpperCase();
    const url = String(options.url ?? '');
    const headers = { ...(options.headers ?? {}) } as Record<string, string>;
    const skipDefaultAuth = headers['x-test-no-default-auth'] === '1';
    const hasExplicitAuth = Boolean(headers.Authorization || headers.authorization || headers['x-api-token']);
    const isApiRoute = url.startsWith('/api/');
    const isPublicApiRoute = publicApiPrefixes.some(
      (prefix) => url === prefix || url.startsWith(`${prefix}?`) || url.startsWith(`${prefix}/`)
    );

    if (isApiRoute && !isPublicApiRoute && !skipDefaultAuth && !hasExplicitAuth) {
      headers.Authorization = `Bearer ${apiToken}`;
    }
    const hasAuth = Boolean(headers.Authorization || headers.authorization || headers['x-api-token']);
    if (isApiRoute && !isPublicApiRoute && hasAuth && !headers['x-ops-role']) {
      headers['x-ops-role'] = 'operator';
    }

    return app.inject({
      ...options,
      method,
      headers
    });
  };
};

const waitForCondition = async (
  description: string,
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 12_000
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}`);
};

const waitForRunStatus = async (
  inject: GatewayInject,
  runId: string,
  statuses: string[],
  timeoutMs = 12_000
): Promise<{
  id: string;
  status: string;
  error: string | null;
}> => {
  const accepted = new Set(statuses);
  let latest: { id: string; status: string; error: string | null } | null = null;
  await waitForCondition(
    `run ${runId} to reach ${statuses.join(', ')}`,
    async () => {
      const response = await inject({
        method: 'GET',
        url: `/api/runs/${runId}`
      });
      if (response.statusCode !== 200) {
        return false;
      }
      const body = response.json() as {
        run: { id: string; status: string; error: string | null };
      };
      latest = body.run;
      return accepted.has(body.run.status);
    },
    timeoutMs
  );
  return latest!;
};

const waitForTerminalRun = (inject: GatewayInject, runId: string, timeoutMs = 12_000) =>
  waitForRunStatus(inject, runId, ['completed', 'failed', 'aborted'], timeoutMs);

const waitForOutboundMessageByRun = async (
  inject: GatewayInject,
  sessionId: string,
  runId: string,
  timeoutMs = 12_000
): Promise<{ content: string; metadataJson: string }> => {
  let message: { content: string; metadataJson: string } | null = null;
  await waitForCondition(
    `outbound message for run ${runId}`,
    async () => {
      const response = await inject({
        method: 'GET',
        url: `/api/messages?sessionId=${encodeURIComponent(sessionId)}`
      });
      if (response.statusCode !== 200) {
        return false;
      }
      const body = response.json() as {
        messages: Array<{ direction: string; content: string; metadataJson: string }>;
      };
      message =
        body.messages
          .filter((entry) => entry.direction === 'outbound')
          .find((entry) => {
            const metadata = JSON.parse(entry.metadataJson) as { runId?: string };
            return metadata.runId === runId;
          }) ?? null;
      return message !== null;
    },
    timeoutMs
  );
  return message!;
};

const applyCeoBaseline = async (inject: GatewayInject): Promise<void> => {
  const response = await inject({
    method: 'POST',
    url: '/api/onboarding/ceo-baseline',
    payload: {
      actor: 'task-continuity-test'
    }
  });
  expect(response.statusCode).toBe(200);
};

const baseFrontierHeaders = (
  apiToken: string,
  input: {
    role?: 'viewer' | 'operator' | 'admin';
    principalId?: string;
    actorType?: 'agent' | 'board_user' | 'local_board_implicit';
    companyId?: string;
    host?: string;
    origin?: string;
  } = {}
): Record<string, string> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    'x-ops-role': input.role ?? 'admin',
    'x-ops-principal-id': input.principalId ?? 'local-board-implicit',
    'x-ops-actor-type': input.actorType ?? 'local_board_implicit',
    host: input.host ?? '127.0.0.1:8788'
  };
  if (input.companyId) {
    headers['x-ops-company-id'] = input.companyId;
  }
  headers['x-ops-frontier-proof'] = createHmac('sha256', apiToken)
    .update([headers['x-ops-principal-id']!, headers['x-ops-actor-type']!, headers['x-ops-company-id'] ?? ''].join('\n'))
    .digest('hex');
  if (input.origin) {
    headers.origin = input.origin;
  }
  return headers;
};

const writeMarkdownSkill = (skillDir: string, input: { name: string; description: string }): void => {
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      `name: ${input.name}`,
      `description: ${input.description}`,
      'enabled: true',
      '---',
      `# ${input.name}`,
      '',
      `Use ${input.name} as the verified control surface.`
    ].join('\n'),
    'utf8'
  );
};

const createRestartableGatewayContext = async (
  label: string,
  customize?: (config: ReturnType<typeof createBaseConfig>) => void
): Promise<RestartableGatewayContext> => {
  const restoreRuntimeBinaryShims = installPortableRuntimeBinaryShims(`ops-gateway-${label}`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ops-gateway-${label}-`));
  const config = createBaseConfig(root, label);
  fs.mkdirSync(config.runtime.workspaceRoot, { recursive: true });
  customize?.(config);

  let currentApp: GatewayApp | null = null;

  return {
    root,
    config,
    buildApp: async () => {
      if (currentApp) {
        await currentApp.close();
      }
      currentApp = await buildGatewayApp(config);
      ensureRuntimeBinaryToolsInstalled(config.persistence.sqlitePath);
      return {
        app: currentApp,
        inject: buildInject(currentApp, config.server.apiToken)
      };
    },
    closeCurrentApp: async () => {
      if (currentApp) {
        await currentApp.close();
        currentApp = null;
      }
    },
    createDb: () => new ControlPlaneDatabase(config.persistence.sqlitePath),
    cleanup: async () => {
      if (currentApp) {
        await currentApp.close();
      }
      restoreRuntimeBinaryShims();
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
};

describe('gateway task continuity certification', () => {
  const contexts: RestartableGatewayContext[] = [];
  const originalFetch = globalThis.fetch;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;

  afterEach(async () => {
    vi.stubGlobal('fetch', originalFetch);
    if (originalOpenRouterApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    }
    while (contexts.length > 0) {
      await contexts.pop()!.cleanup();
    }
  });

  it('captures bootstrap ordering and mixed synthetic plus file-backed prompt inputs in prompt assembly snapshots', async () => {
    const context = await createRestartableGatewayContext('continuity-bootstrap');
    contexts.push(context);
    const { inject } = await context.buildApp();
    await applyCeoBaseline(inject);

    const skillDir = path.join(context.root, 'skills', 'continuity-bootstrap-skill');
    writeMarkdownSkill(skillDir, {
      name: 'continuity-bootstrap-skill',
      description: 'Bootstrap provenance certification skill'
    });

    const upsertSkill = await inject({
      method: 'POST',
      url: '/api/skills/catalog/entries/upsert',
      payload: {
        path: skillDir,
        approved: true
      }
    });
    expect(upsertSkill.statusCode).toBe(200);

    const sessionDb = context.createDb();
    const session = sessionDb.upsertSessionByKey({
      sessionKey: 'internal:continuity-bootstrap',
      channel: 'internal',
      chatType: 'internal',
      agentId: 'ceo-default',
      preferredRuntime: 'codex',
      preferredModel: null,
      metadata: {
        source: 'task-continuity-test',
        label: 'continuity-bootstrap'
      }
    });
    sessionDb.close();

    const seedRun = await inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/runs`,
      headers: {
        'Idempotency-Key': 'continuity-bootstrap-seed'
      },
      payload: {
        prompt: 'Seed transcript continuity before the next restart-safe prompt assembly check.',
        runtime: 'codex',
        model: null,
        autoDelegate: false
      }
    });
    expect(seedRun.statusCode).toBe(201);
    const seedRunBody = seedRun.json() as { run: { id: string } };
    const seedTerminal = await waitForTerminalRun(inject, seedRunBody.run.id);
    expect(seedTerminal.status).toBe('completed');

    const db = context.createDb();
    db.insertMemory({
      agentId: 'ceo-default',
      sessionId: session.id,
      source: 'agent',
      content: 'Use continuity-bootstrap-skill for restart-safe continuity certification and preserve bootstrap provenance.',
      importance: 10,
      metadata: {
        significance: 10,
        citations: ['continuity-bootstrap-cert']
      }
    });
    db.close();

    const continuityRun = await inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/runs`,
      headers: {
        'Idempotency-Key': 'continuity-bootstrap-check'
      },
      payload: {
        prompt: 'Use continuity-bootstrap-skill for restart-safe continuity certification and preserve bootstrap provenance.',
        runtime: 'codex',
        model: null,
        autoDelegate: false
      }
    });
    expect(continuityRun.statusCode).toBe(201);
    const continuityRunBody = continuityRun.json() as { run: { id: string } };
    const continuityTerminal = await waitForTerminalRun(inject, continuityRunBody.run.id);
    expect(continuityTerminal.status).toBe('completed');

    const promptAssembly = await inject({
      method: 'GET',
      url: `/api/runs/${continuityRunBody.run.id}/prompt-assembly`
    });
    expect(promptAssembly.statusCode).toBe(200);
    const promptAssemblyBody = promptAssembly.json() as {
      snapshot: {
        promptPreview: string;
        segments: Array<{ id: string; included: boolean }>;
        continuityCoverage: {
          transcriptMessagesSelected: number;
          memoryCandidatesSelected: number;
        };
      };
    };

    const preview = promptAssemblyBody.snapshot.promptPreview;
    expect(preview).toContain('RECENT_TRANSCRIPT:');
    expect(preview).toContain('MEMORY_RECALL:');
    expect(preview).toContain('CURRENT_TASK:');
    expect(preview).toContain('AUTONOMOUS_SKILL_PROTOCOL:');
    expect(preview).toContain('<available_skills>');
    expect(preview).toContain('<name>continuity-bootstrap-skill</name>');
    expect(preview).toContain(skillDir);

    const transcriptIndex = preview.indexOf('RECENT_TRANSCRIPT:');
    const memoryIndex = preview.indexOf('MEMORY_RECALL:');
    const taskIndex = preview.indexOf('CURRENT_TASK:');
    expect(transcriptIndex).toBeGreaterThanOrEqual(0);
    expect(memoryIndex).toBeGreaterThan(transcriptIndex);
    expect(taskIndex).toBeGreaterThan(memoryIndex);

    expect(promptAssemblyBody.snapshot.continuityCoverage.transcriptMessagesSelected).toBeGreaterThan(0);
    expect(promptAssemblyBody.snapshot.continuityCoverage.memoryCandidatesSelected).toBeGreaterThan(0);
    expect(promptAssemblyBody.snapshot.segments.map((segment) => segment.id)).toEqual([
      'instructions',
      'task',
      'recent_transcript',
      'memory_recall'
    ]);
  }, 20_000);

  it('reuses the same native tool session across restart and keeps API plus outbound continuity receipts aligned', async () => {
    process.env.OPENROUTER_API_KEY = 'continuity-openrouter-key';
    let openRouterCalls = 0;
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input ?? '');
      if (!url.includes('openrouter.ai/api/v1/chat/completions')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      openRouterCalls += 1;
      const toolTurn = openRouterCalls % 2 === 1;
      return new Response(
        JSON.stringify({
          id: `chatcmpl-continuity-native-${openRouterCalls}`,
          choices: [
            {
              message: toolTurn
                ? {
                    content: '',
                    tool_calls: [
                      {
                        id: `call_continuity_native_${openRouterCalls}`,
                        function: {
                          name: 'skill_call',
                          arguments: JSON.stringify({
                            skill: 'continuity-native-skill',
                            payload: {
                              iteration: openRouterCalls
                            },
                            reason: toolTurn ? 'Need the continuity skill before answering.' : 'Resume the same skill session.'
                          })
                        }
                      }
                    ]
                  }
                : {
                    content: `Continuity answer ${openRouterCalls}.`
                  }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      );
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const context = await createRestartableGatewayContext('continuity-native-restart');
    contexts.push(context);
    let { inject } = await context.buildApp();
    await applyCeoBaseline(inject);

    const skillDir = path.join(context.root, 'skills', 'continuity-native-skill');
    writeMarkdownSkill(skillDir, {
      name: 'continuity-native-skill',
      description: 'Native continuity restart certification skill'
    });

    const upsertSkill = await inject({
      method: 'POST',
      url: '/api/skills/catalog/entries/upsert',
      payload: {
        path: skillDir,
        approved: true
      }
    });
    expect(upsertSkill.statusCode).toBe(200);

    const sessionDb = context.createDb();
    const session = sessionDb.upsertSessionByKey({
      sessionKey: 'internal:continuity-native-restart',
      channel: 'internal',
      chatType: 'internal',
      agentId: 'ceo-default',
      preferredRuntime: 'process',
      preferredModel: 'openrouter/free',
      metadata: {
        source: 'task-continuity-test',
        label: 'continuity-native-restart'
      }
    });
    sessionDb.close();

    const firstRunResponse = await inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/runs`,
      headers: {
        'Idempotency-Key': 'continuity-native-first'
      },
      payload: {
        prompt: 'Use continuity-native-skill before answering.',
        runtime: 'process',
        model: 'openrouter/free',
        autoDelegate: false
      }
    });
    expect(firstRunResponse.statusCode).toBe(201);
    const firstRunBody = firstRunResponse.json() as { run: { id: string } };
    const firstTerminal = await waitForTerminalRun(inject, firstRunBody.run.id);
    expect(firstTerminal.status).toBe('completed');

    const firstRunDetails = await inject({
      method: 'GET',
      url: `/api/runs/${firstRunBody.run.id}`
    });
    expect(firstRunDetails.statusCode).toBe(200);
    const firstRun = firstRunDetails.json() as {
      nativeToolSession: { handleId: string } | null;
    };
    expect(firstRun.nativeToolSession?.handleId).toBeTruthy();

    await context.closeCurrentApp();
    ({ inject } = await context.buildApp());

    const resumeDb = context.createDb();
    const resumeRun = resumeDb.createRun({
      sessionId: session.id,
      runtime: 'process',
      requestedRuntime: 'process',
      requestedModel: 'openrouter/free',
      effectiveRuntime: 'process',
      effectiveModel: 'openrouter/free',
      triggerSource: 'restart_resume_test',
      supersedesRunId: firstRunBody.run.id,
      prompt: 'Resume the same native tool session after restart.',
      status: 'waiting_input'
    });
    resumeDb.close();

    const resumed = await inject({
      method: 'POST',
      url: `/api/runs/${resumeRun.id}/resume`,
      payload: {
        actor: 'test',
        prompt: 'Resume the same native tool session after restart.'
      }
    });
    expect(resumed.statusCode).toBe(200);
    const resumedTerminal = await waitForTerminalRun(inject, resumeRun.id);
    expect(resumedTerminal.status).toBe('completed');

    const resumedRunResponse = await inject({
      method: 'GET',
      url: `/api/runs/${resumeRun.id}`
    });
    expect(resumedRunResponse.statusCode).toBe(200);
    const resumedRunBody = resumedRunResponse.json() as {
      nativeToolSession: {
        handleId: string;
        version: number;
        resumedFromRunId: string | null;
        resumeSource: string | null;
      } | null;
      lifecycle: {
        continuity: {
          rootRunId: string;
          lineageHeadRunId: string;
        };
        ownership: { gatewayAuthority: string };
        executorLane: {
          toolSessionMode: string | null;
          nativeToolSessionHandleId: string | null;
        };
      } | null;
      timeline: Array<{ type: string }>;
    };
    expect(resumedRunBody.nativeToolSession?.handleId).toBe(firstRun.nativeToolSession?.handleId);
    expect((resumedRunBody.nativeToolSession?.version ?? 0)).toBeGreaterThan(1);
    expect(resumedRunBody.nativeToolSession?.resumedFromRunId).toBe(firstRunBody.run.id);
    expect(resumedRunBody.nativeToolSession?.resumeSource).toBe('run_control_resume');
    expect(resumedRunBody.lifecycle?.continuity.rootRunId).toBe(firstRunBody.run.id);
    expect(resumedRunBody.lifecycle?.ownership.gatewayAuthority).toBe('service');
    expect(resumedRunBody.lifecycle?.executorLane.toolSessionMode).toBe('native_tool_session');
    expect(resumedRunBody.lifecycle?.executorLane.nativeToolSessionHandleId).toBe(firstRun.nativeToolSession?.handleId ?? null);
    expect(resumedRunBody.timeline.some((entry) => entry.type === 'session_resumed')).toBe(true);

    const sessionResponse = await inject({
      method: 'GET',
      url: `/api/sessions/${session.id}`
    });
    expect(sessionResponse.statusCode).toBe(200);
    const sessionBody = sessionResponse.json() as {
      session: {
        latestNativeToolSession: {
          handleId: string;
        } | null;
        lifecycle: {
          ownership: {
            gatewayAuthority: string;
            sessionContinuity: string;
          };
        };
      };
    };
    expect(sessionBody.session.latestNativeToolSession?.handleId).toBe(firstRun.nativeToolSession?.handleId);
    expect(sessionBody.session.lifecycle.ownership.gatewayAuthority).toBe('service');
    expect(sessionBody.session.lifecycle.ownership.sessionContinuity).toBe('on_demand');

    const outbound = await waitForOutboundMessageByRun(inject, session.id, resumeRun.id);
    const outboundMetadata = JSON.parse(outbound.metadataJson) as {
      nativeToolSession?: { handleId?: string | null; resumedFromRunId?: string | null; resumeSource?: string | null };
      lifecycle?: {
        continuity?: { rootRunId?: string | null };
        executorLane?: { nativeToolSessionHandleId?: string | null; toolSessionMode?: string | null };
      };
    };
    expect(outboundMetadata.nativeToolSession?.handleId).toBe(firstRun.nativeToolSession?.handleId);
    expect(outboundMetadata.nativeToolSession?.resumedFromRunId).toBe(firstRunBody.run.id);
    expect(outboundMetadata.nativeToolSession?.resumeSource).toBe('run_control_resume');
    expect(outboundMetadata.lifecycle?.continuity?.rootRunId).toBe(firstRunBody.run.id);
    expect(outboundMetadata.lifecycle?.executorLane?.nativeToolSessionHandleId).toBe(firstRun.nativeToolSession?.handleId);
    expect(outboundMetadata.lifecycle?.executorLane?.toolSessionMode).toBe('native_tool_session');
    expect(openRouterCalls).toBeGreaterThanOrEqual(3);
  }, 20_000);

  it('preserves legacy prompt continuity across restart without inventing native session state', async () => {
    const context = await createRestartableGatewayContext('continuity-legacy-restart');
    contexts.push(context);
    let { inject } = await context.buildApp();
    await applyCeoBaseline(inject);

    const sessionDb = context.createDb();
    const session = sessionDb.upsertSessionByKey({
      sessionKey: 'internal:continuity-legacy-restart',
      channel: 'internal',
      chatType: 'internal',
      agentId: 'ceo-default',
      preferredRuntime: 'codex',
      preferredModel: null,
      metadata: {
        source: 'task-continuity-test',
        label: 'continuity-legacy-restart'
      }
    });
    sessionDb.close();

    const firstRunResponse = await inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/runs`,
      headers: {
        'Idempotency-Key': 'continuity-legacy-first'
      },
      payload: {
        prompt: 'Initial legacy continuity seed that should survive restart and resume.',
        runtime: 'codex',
        model: null,
        autoDelegate: false
      }
    });
    expect(firstRunResponse.statusCode).toBe(201);
    const firstRunBody = firstRunResponse.json() as { run: { id: string } };
    const firstTerminal = await waitForTerminalRun(inject, firstRunBody.run.id);
    expect(firstTerminal.status).toBe('completed');

    await context.closeCurrentApp();
    ({ inject } = await context.buildApp());

    const resumeDb = context.createDb();
    const resumeRun = resumeDb.createRun({
      sessionId: session.id,
      runtime: 'codex',
      requestedRuntime: 'codex',
      effectiveRuntime: 'codex',
      triggerSource: 'restart_resume_test',
      supersedesRunId: firstRunBody.run.id,
      prompt: 'Resume the same legacy task after restart with transcript continuity.',
      status: 'waiting_input'
    });
    resumeDb.close();

    const resumed = await inject({
      method: 'POST',
      url: `/api/runs/${resumeRun.id}/resume`,
      payload: {
        actor: 'test',
        prompt: 'Resume the same legacy task after restart with transcript continuity.'
      }
    });
    expect(resumed.statusCode).toBe(200);
    const resumedTerminal = await waitForTerminalRun(inject, resumeRun.id);
    expect(resumedTerminal.status).toBe('completed');

    const resumedRunResponse = await inject({
      method: 'GET',
      url: `/api/runs/${resumeRun.id}`
    });
    expect(resumedRunResponse.statusCode).toBe(200);
    const resumedRunBody = resumedRunResponse.json() as {
      executionPath: {
        mode: string;
        toolInvocationPath: string | null;
        toolSessionMode: string | null;
      } | null;
      nativeToolSession: null;
      lifecycle: {
        continuity: {
          rootRunId: string;
          lineageHeadRunId: string;
        };
      } | null;
    };
    expect(resumedRunBody.executionPath?.mode).toBe('runtime_cli');
    expect(resumedRunBody.executionPath?.toolInvocationPath).toBe('plain_provider_response');
    expect(resumedRunBody.executionPath?.toolSessionMode).toBeNull();
    expect(resumedRunBody.nativeToolSession).toBeNull();
    expect(resumedRunBody.lifecycle?.continuity.rootRunId).toBe(firstRunBody.run.id);
    expect(resumedRunBody.lifecycle?.continuity.lineageHeadRunId).toBe(resumeRun.id);

    const promptAssembly = await inject({
      method: 'GET',
      url: `/api/runs/${resumeRun.id}/prompt-assembly`
    });
    expect(promptAssembly.statusCode).toBe(200);
    const promptAssemblyBody = promptAssembly.json() as {
      snapshot: {
        promptPreview: string;
        continuityCoverage: {
          transcriptMessagesSelected: number;
        };
      };
    };
    expect(promptAssemblyBody.snapshot.promptPreview).toContain('RECENT_TRANSCRIPT:');
    expect(promptAssemblyBody.snapshot.promptPreview).toContain(
      'Initial legacy continuity seed that should survive restart and resume.'
    );
    expect(promptAssemblyBody.snapshot.continuityCoverage.transcriptMessagesSelected).toBeGreaterThan(0);

    const sessionResponse = await inject({
      method: 'GET',
      url: `/api/sessions/${session.id}`
    });
    expect(sessionResponse.statusCode).toBe(200);
    const sessionBody = sessionResponse.json() as {
      session: {
        latestNativeToolSession: null;
      };
    };
    expect(sessionBody.session.latestNativeToolSession).toBeNull();

    const outbound = await waitForOutboundMessageByRun(inject, session.id, resumeRun.id);
    const outboundMetadata = JSON.parse(outbound.metadataJson) as {
      executionPath?: {
        mode?: string | null;
        toolInvocationPath?: string | null;
        toolSessionMode?: string | null;
      };
      nativeToolSession?: unknown;
      lifecycle?: {
        continuity?: {
          rootRunId?: string | null;
          lineageHeadRunId?: string | null;
        };
      };
    };
    expect(outboundMetadata.executionPath?.mode).toBe('runtime_cli');
    expect(outboundMetadata.executionPath?.toolInvocationPath).toBe('plain_provider_response');
    expect(outboundMetadata.executionPath?.toolSessionMode).toBeNull();
    expect(outboundMetadata.nativeToolSession ?? null).toBeNull();
    expect(outboundMetadata.lifecycle?.continuity?.rootRunId).toBe(firstRunBody.run.id);
    expect(outboundMetadata.lifecycle?.continuity?.lineageHeadRunId).toBe(resumeRun.id);
  }, 20_000);

  it('persists frontier wakeup coalescing and deferred promotion state across gateway restarts', async () => {
    const context = await createRestartableGatewayContext('continuity-frontier-restart');
    contexts.push(context);
    let { inject } = await context.buildApp();
    const frontierHeaders = baseFrontierHeaders(context.config.server.apiToken);

    const acquire = await inject({
      method: 'POST',
      url: '/api/frontier/issues/ISSUE-RESTART/wakeup',
      headers: frontierHeaders,
      payload: {
        companyId: 'company',
        requestedByAgentId: 'agent-a',
        requestedRunId: 'run-a',
        activeRunIds: ['run-a']
      }
    });
    expect(acquire.statusCode).toBe(201);
    expect((acquire.json() as { wakeup: { state: string } }).wakeup.state).toBe('acquired');

    await context.closeCurrentApp();
    ({ inject } = await context.buildApp());

    const coalesce = await inject({
      method: 'POST',
      url: '/api/frontier/issues/ISSUE-RESTART/wakeup',
      headers: frontierHeaders,
      payload: {
        companyId: 'company',
        requestedByAgentId: 'agent-a',
        requestedRunId: 'run-a-2',
        activeRunIds: ['run-a']
      }
    });
    expect(coalesce.statusCode).toBe(201);
    expect((coalesce.json() as { wakeup: { state: string } }).wakeup.state).toBe('coalesced_same_owner');

    const deferred = await inject({
      method: 'POST',
      url: '/api/frontier/issues/ISSUE-RESTART/wakeup',
      headers: frontierHeaders,
      payload: {
        companyId: 'company',
        requestedByAgentId: 'agent-b',
        requestedRunId: 'run-b',
        activeRunIds: ['run-a']
      }
    });
    expect(deferred.statusCode).toBe(201);
    expect((deferred.json() as { wakeup: { state: string } }).wakeup.state).toBe('deferred_issue_lock');

    const persistedLocks = await inject({
      method: 'GET',
      url: '/api/frontier/issues/locks?issueId=ISSUE-RESTART',
      headers: frontierHeaders
    });
    expect(persistedLocks.statusCode).toBe(200);
    const persistedLocksBody = persistedLocks.json() as {
      issueLocks: {
        locks: Array<{ ownerAgentId: string; ownerRunId: string }>;
        wakeups: Array<{ state: string }>;
      };
    };
    expect(persistedLocksBody.issueLocks.locks[0]?.ownerAgentId).toBe('agent-a');
    expect(persistedLocksBody.issueLocks.locks[0]?.ownerRunId).toBe('run-a');
    expect(persistedLocksBody.issueLocks.wakeups.map((entry) => entry.state)).toEqual(
      expect.arrayContaining(['acquired', 'coalesced_same_owner', 'deferred_issue_lock'])
    );

    await context.closeCurrentApp();
    ({ inject } = await context.buildApp());

    const release = await inject({
      method: 'POST',
      url: '/api/frontier/issues/ISSUE-RESTART/release',
      headers: frontierHeaders,
      payload: {
        companyId: 'company',
        ownerRunId: 'run-a'
      }
    });
    expect(release.statusCode).toBe(200);
    const releaseBody = release.json() as {
      promoted: { state: string; requestedByAgentId: string } | null;
      lock: { ownerAgentId: string; ownerRunId: string } | null;
    };
    expect(releaseBody.promoted?.state).toBe('promoted_after_release');
    expect(releaseBody.promoted?.requestedByAgentId).toBe('agent-b');
    expect(releaseBody.lock?.ownerAgentId).toBe('agent-b');
    expect(releaseBody.lock?.ownerRunId).toBe('run-b');

    const postReleaseLocks = await inject({
      method: 'GET',
      url: '/api/frontier/issues/locks?issueId=ISSUE-RESTART',
      headers: frontierHeaders
    });
    expect(postReleaseLocks.statusCode).toBe(200);
    const postReleaseLocksBody = postReleaseLocks.json() as {
      issueLocks: {
        locks: Array<{ ownerAgentId: string; ownerRunId: string }>;
        wakeups: Array<{ state: string; requestedByAgentId: string }>;
      };
    };
    expect(postReleaseLocksBody.issueLocks.locks[0]?.ownerAgentId).toBe('agent-b');
    expect(postReleaseLocksBody.issueLocks.locks[0]?.ownerRunId).toBe('run-b');
    expect(
      postReleaseLocksBody.issueLocks.wakeups.some(
        (entry) => entry.state === 'promoted_after_release' && entry.requestedByAgentId === 'agent-b'
      )
    ).toBe(true);
  }, 20_000);
});
