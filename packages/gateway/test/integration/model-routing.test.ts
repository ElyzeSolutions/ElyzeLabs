import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';

import { buildGatewayApp } from '../../src/server.js';
import { installPortableRuntimeBinaryShims } from './runtime-binary-shims.js';
import { createBaseConfig, createGatewayTestHarness, ensureRuntimeBinaryToolsInstalled, type GatewayTestHarness } from './test-harness.js';

describe('gateway model routing integration', () => {
  const originalStartupMode = process.env.OPS_LLM_STARTUP_VALIDATION_MODE;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
  const validTelegramBotToken = '123456:ABCDEFGHIJKLMNOPQRSTUVWXyz_123456789';
  const harnesses: GatewayTestHarness[] = [];

  const createHarness = async (label: string): Promise<GatewayTestHarness> => {
    const harness = await createGatewayTestHarness(label);
    harnesses.push(harness);
    return harness;
  };

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  const expectRecord = (value: unknown): Record<string, unknown> => {
    if (!isRecord(value)) {
      throw new Error('Expected object payload');
    }
    return value;
  };

  const expectArray = (value: unknown): unknown[] => {
    if (!Array.isArray(value)) {
      throw new Error('Expected array payload');
    }
    return value;
  };

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()!.close();
    }
    if (originalStartupMode === undefined) {
      delete process.env.OPS_LLM_STARTUP_VALIDATION_MODE;
    } else {
      process.env.OPS_LLM_STARTUP_VALIDATION_MODE = originalStartupMode;
    }
    if (originalOpenRouterApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    }
    if (originalGoogleApiKey === undefined) {
      delete process.env.GOOGLE_API_KEY;
    } else {
      process.env.GOOGLE_API_KEY = originalGoogleApiKey;
    }
  });

  it('rejects unknown primary models at save time with field-specific diagnostics', async () => {
    const harness = await createHarness('llm-save-unknown');

    const response = await harness.inject({
      method: 'PUT',
      url: '/api/llm/limits',
      payload: {
        limits: {
          primaryModelByRuntime: {
            codex: 'imaginary-model-9000'
          }
        }
      }
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      ok: boolean;
      error: string;
      details?: {
        validation?: {
          valid: boolean;
          diagnostics: Array<{
            field: string;
            issue: string;
            message: string;
          }>;
        };
      };
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Invalid LLM model routing policy');
    expect(body.details?.validation?.valid).toBe(false);
    expect(body.details?.validation?.diagnostics[0]?.field).toBe('primaryModelByRuntime.codex');
    expect(body.details?.validation?.diagnostics[0]?.issue).toBe('unknown_model');
    expect(body.details?.validation?.diagnostics[0]?.message).toContain('imaginary-model-9000');
  });

  it('rejects fallback entries that point runtime-native models at the wrong runtime', async () => {
    const harness = await createHarness('llm-save-mismatch');

    const response = await harness.inject({
      method: 'PUT',
      url: '/api/llm/limits',
      payload: {
        limits: {
          fallbackByRuntime: {
            process: [{ runtime: 'process', model: 'gpt-5.3-codex' }]
          }
        }
      }
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as {
      details?: {
        validation?: {
          diagnostics: Array<{
            field: string;
            issue: string;
            expectedRuntimes?: string[];
          }>;
        };
      };
    };
    expect(body.details?.validation?.diagnostics[0]?.field).toBe('fallbackByRuntime.process[0].model');
    expect(body.details?.validation?.diagnostics[0]?.issue).toBe('cross_runtime_model_mismatch');
    expect(body.details?.validation?.diagnostics[0]?.expectedRuntimes).toContain('codex');
  });

  it('accepts Gemini provider aliases even when they are not pinned in the local registry', async () => {
    const harness = await createHarness('llm-save-gemini-alias');

    const response = await harness.inject({
      method: 'PUT',
      url: '/api/llm/limits',
      payload: {
        limits: {
          fallbackByRuntime: {
            process: [{ runtime: 'process', model: 'gemini-flash-latest' }]
          }
        }
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      limits: {
        fallbackByRuntime: Record<string, Array<{ runtime: string; model: string | null }>>;
      };
      validation: {
        valid: boolean;
      };
    };
    expect(body.validation.valid).toBe(true);
    expect(body.limits.fallbackByRuntime.process[0]?.model).toBe('gemini-flash-latest');
  });

  it('persists auth profile cooldowns and excludes cooled profiles from effective routing', async () => {
    process.env.OPENROUTER_API_KEY = 'test-openrouter';
    const harness = await createHarness('llm-auth-profile-cooldown');

    const limitsResponse = await harness.inject({
      method: 'PUT',
      url: '/api/llm/limits',
      payload: {
        limits: {
          primaryModelByRuntime: {
            process: 'openrouter/minimax/minimax-m2.5'
          },
          fallbackByRuntime: {
            process: []
          },
          strictPrimaryByRuntime: {
            process: true
          }
        }
      }
    });
    expect(limitsResponse.statusCode).toBe(200);

    const profileResponse = await harness.inject({
      method: 'GET',
      url: '/api/llm/auth-profiles'
    });
    expect(profileResponse.statusCode).toBe(200);
    const profileBody = expectRecord(profileResponse.json());
    const profilePayload = expectRecord(profileBody.authProfiles);
    const profiles = expectArray(profilePayload.profiles).map(expectRecord);
    const openrouterProfile = profiles.find((profile) => profile.id === 'openrouter:default');
    expect(openrouterProfile?.configured).toBe(true);
    expect(openrouterProfile?.eligible).toBe(true);

    const cooldownUntil = '2100-01-01T00:00:00.000Z';
    const updateResponse = await harness.inject({
      method: 'PUT',
      url: '/api/llm/auth-profiles/openrouter:default',
      payload: {
        status: 'cooldown',
        cooldownUntil,
        actor: 'integration-test'
      }
    });
    expect(updateResponse.statusCode).toBe(200);

    const routingResponse = await harness.inject({
      method: 'GET',
      url: '/api/llm/routing/effective?runtime=process&model=openrouter/minimax/minimax-m2.5'
    });
    expect(routingResponse.statusCode).toBe(200);
    const routingBody = expectRecord(routingResponse.json());
    const routes = expectArray(routingBody.routes).map(expectRecord);
    const route = expectRecord(routes[0]);
    expect(route.selected).toBe(null);
    const checks = expectArray(route.checks).map(expectRecord);
    const openrouterCheck = checks.find((check) => check.provider === 'openrouter');
    expect(openrouterCheck?.eligible).toBe(false);
    expect(openrouterCheck?.reason).toBe('provider_auth_profile_cooldown:openrouter:default');

    const refreshedResponse = await harness.inject({
      method: 'GET',
      url: '/api/llm/auth-profiles'
    });
    const refreshedBody = expectRecord(refreshedResponse.json());
    const refreshedPayload = expectRecord(refreshedBody.authProfiles);
    const refreshedProfiles = expectArray(refreshedPayload.profiles).map(expectRecord);
    const cooledProfile = refreshedProfiles.find((profile) => profile.id === 'openrouter:default');
    expect(cooledProfile?.eligible).toBe(false);
    expect(cooledProfile?.blockReason).toBe('provider_auth_profile_cooldown:openrouter:default');
  });

  it('recovers Telegram process chat by switching provider after identity failures', async () => {
    process.env.GOOGLE_API_KEY = 'test-google';
    process.env.OPENROUTER_API_KEY = 'test-openrouter';

    const previousFetch = globalThis.fetch;
    const telegramSends: string[] = [];
    let googleCalls = 0;
    let openrouterCalls = 0;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.telegram.org')) {
        const method = url.split('/').pop() ?? '';
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (method === 'sendMessage') {
          telegramSends.push(String(body.text ?? ''));
          return new Response(JSON.stringify({ ok: true, result: { message_id: telegramSends.length } }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        googleCalls += 1;
        return new Response(JSON.stringify({ error: { message: 'User not found.' } }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.includes('openrouter.ai/api/v1/chat/completions')) {
        openrouterCalls += 1;
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-process-identity-fallback',
            choices: [{ message: { content: 'process fallback recovered Telegram chat' } }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15
            }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    const harness = await createGatewayTestHarness('telegram-process-identity-fallback', (localConfig) => {
      localConfig.channel.telegram.botToken = validTelegramBotToken;
      localConfig.runtime.defaultRuntime = 'process';
    });
    harnesses.push(harness);

    try {
      const limitsResponse = await harness.inject({
        method: 'PUT',
        url: '/api/llm/limits',
        payload: {
          limits: {
            orchestratorPrimaryModelByRuntime: {
              process: 'gemini-3.1-pro-preview'
            },
            orchestratorFallbackByRuntime: {
              process: [
                { runtime: 'process', model: 'gemini-3-flash-preview' },
                { runtime: 'process', model: 'openrouter/openrouter/free' }
              ]
            }
          }
        }
      });
      expect(limitsResponse.statusCode).toBe(200);

      const baselineResponse = await harness.inject({
        method: 'POST',
        url: '/api/onboarding/ceo-baseline',
        payload: {
          actor: 'telegram-process-identity-fallback-test'
        }
      });
      expect(baselineResponse.statusCode).toBe(200);

      const queued = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: {
          update_id: 880001,
          message: {
            text: 'Give me a one line process runtime health ping.',
            chat: { id: 880001, type: 'private' },
            from: { id: 880001, username: 'processfallback' },
            mentioned: true
          }
        }
      });
      expect(queued.statusCode).toBe(200);
      const queuedBody = expectRecord(queued.json());
      const runId = queuedBody.runId;
      if (typeof runId !== 'string') {
        throw new Error('Telegram ingress did not return runId');
      }

      const finalRun = await harness.waitForTerminalRun(runId, 20_000);
      expect(finalRun.status).toBe('completed');
      expect(finalRun.effectiveRuntime ?? finalRun.runtime).toBe('process');
      expect(finalRun.effectiveModel).toBe('openrouter/openrouter/free');

      await harness.waitForCondition(
        'Telegram recovery message delivery',
        () => telegramSends.some((message) => message.includes('process fallback recovered Telegram chat')),
        5_000
      );
      expect(googleCalls).toBe(1);
      expect(openrouterCalls).toBe(1);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it('falls back to runtime-native Codex when process provider identities keep failing', async () => {
    process.env.GOOGLE_API_KEY = 'test-google';
    process.env.OPENROUTER_API_KEY = 'test-openrouter';

    const previousFetch = globalThis.fetch;
    const telegramSends: string[] = [];
    let googleCalls = 0;
    let openrouterCalls = 0;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.telegram.org')) {
        const method = url.split('/').pop() ?? '';
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (method === 'sendMessage') {
          telegramSends.push(String(body.text ?? ''));
          return new Response(JSON.stringify({ ok: true, result: { message_id: telegramSends.length } }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        googleCalls += 1;
        return new Response(JSON.stringify({ error: { message: 'User not found.' } }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.includes('openrouter.ai/api/v1/chat/completions')) {
        openrouterCalls += 1;
        return new Response(JSON.stringify({ error: { message: 'User not found.' } }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    const harness = await createGatewayTestHarness('telegram-process-native-fallback', (localConfig) => {
      localConfig.channel.telegram.botToken = validTelegramBotToken;
      localConfig.runtime.defaultRuntime = 'process';
    });
    harnesses.push(harness);

    try {
      const marker = 'native-codex-fallback-marker';
      const limitsResponse = await harness.inject({
        method: 'PUT',
        url: '/api/llm/limits',
        payload: {
          limits: {
            orchestratorPrimaryModelByRuntime: {
              process: 'gemini-3.1-pro-preview'
            },
            orchestratorFallbackByRuntime: {
              process: [
                { runtime: 'process', model: 'openrouter/openrouter/free' },
                { runtime: 'codex', model: null }
              ]
            }
          }
        }
      });
      expect(limitsResponse.statusCode).toBe(200);

      const baselineResponse = await harness.inject({
        method: 'POST',
        url: '/api/onboarding/ceo-baseline',
        payload: {
          actor: 'telegram-process-native-fallback-test'
        }
      });
      expect(baselineResponse.statusCode).toBe(200);

      const queued = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: {
          update_id: 880101,
          message: {
            text: `Reply with ${marker}.`,
            chat: { id: 880101, type: 'private' },
            from: { id: 880101, username: 'nativefallback' },
            mentioned: true
          }
        }
      });
      expect(queued.statusCode).toBe(200);
      const queuedBody = expectRecord(queued.json());
      const runId = queuedBody.runId;
      if (typeof runId !== 'string') {
        throw new Error('Telegram ingress did not return runId');
      }

      const finalRun = await harness.waitForTerminalRun(runId, 20_000);
      expect(finalRun.status).toBe('completed');
      expect(finalRun.effectiveRuntime ?? finalRun.runtime).toBe('codex');
      expect(finalRun.effectiveModel).toBe(null);
      expect(googleCalls).toBe(1);
      expect(openrouterCalls).toBe(1);
      await harness.waitForCondition(
        'Telegram native fallback delivery',
        () => telegramSends.some((message) => message.includes(marker)),
        5_000
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it('surfaces persisted invalid limits in warn mode without silently rewriting them', async () => {
    process.env.OPS_LLM_STARTUP_VALIDATION_MODE = 'warn';
    process.env.OPENROUTER_API_KEY = 'test-openrouter';
    process.env.GOOGLE_API_KEY = 'test-google';

    const restoreRuntimeBinaryShims = installPortableRuntimeBinaryShims('ops-gateway-llm-warn');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-gateway-llm-warn-'));
    const config = createBaseConfig(root, 'llm-warn');
    fs.mkdirSync(config.runtime.workspaceRoot, { recursive: true });

    const bootstrapApp = await buildGatewayApp(config);
    ensureRuntimeBinaryToolsInstalled(config.persistence.sqlitePath);
    await bootstrapApp.close();

    const db = new ControlPlaneDatabase(config.persistence.sqlitePath);
    db.upsertLlmLimits({
      primaryModelByRuntime: {
        codex: 'imaginary-model-9000'
      }
    });
    db.close();

    const app = await buildGatewayApp(config);
    ensureRuntimeBinaryToolsInstalled(config.persistence.sqlitePath);

    try {
      const limitsResponse = await app.inject({
        method: 'GET',
        url: '/api/llm/limits',
        headers: {
          Authorization: `Bearer ${config.server.apiToken}`,
          'x-ops-role': 'operator'
        }
      });
      expect(limitsResponse.statusCode).toBe(200);
      const limitsBody = limitsResponse.json() as {
        limits: {
          primaryModelByRuntime: Record<string, string | null>;
        };
        validation: {
          valid: boolean;
          startupMode: string;
          diagnostics: Array<{
            field: string;
            issue: string;
          }>;
        };
      };
      expect(limitsBody.limits.primaryModelByRuntime.codex).toBe('imaginary-model-9000');
      expect(limitsBody.validation.valid).toBe(false);
      expect(limitsBody.validation.startupMode).toBe('warn');
      expect(limitsBody.validation.diagnostics.some((diagnostic) => diagnostic.field === 'primaryModelByRuntime.codex')).toBe(true);

      const routingResponse = await app.inject({
        method: 'GET',
        url: '/api/llm/routing/effective?runtime=codex',
        headers: {
          Authorization: `Bearer ${config.server.apiToken}`,
          'x-ops-role': 'operator'
        }
      });
      expect(routingResponse.statusCode).toBe(200);
      const routingBody = routingResponse.json() as {
        validation: {
          valid: boolean;
        };
        routes: Array<{
          validation: {
            valid: boolean;
            diagnostics: Array<{
              field: string;
            }>;
          };
        }>;
      };
      expect(routingBody.validation.valid).toBe(false);
      expect(routingBody.routes[0]?.validation.valid).toBe(false);
      expect(routingBody.routes[0]?.validation.diagnostics.some((diagnostic) => diagnostic.field === 'primaryModelByRuntime.codex')).toBe(true);
    } finally {
      await app.close();
      restoreRuntimeBinaryShims();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails startup in hard-error mode when persisted limits contain invalid models', async () => {
    process.env.OPS_LLM_STARTUP_VALIDATION_MODE = 'hard_error';

    const restoreRuntimeBinaryShims = installPortableRuntimeBinaryShims('ops-gateway-llm-hard-error');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-gateway-llm-hard-error-'));
    const config = createBaseConfig(root, 'llm-hard-error');
    fs.mkdirSync(config.runtime.workspaceRoot, { recursive: true });

    const bootstrapApp = await buildGatewayApp(config);
    ensureRuntimeBinaryToolsInstalled(config.persistence.sqlitePath);
    await bootstrapApp.close();

    const db = new ControlPlaneDatabase(config.persistence.sqlitePath);
    db.upsertLlmLimits({
      primaryModelByRuntime: {
        process: 'unknown-process-route'
      }
    });
    db.close();

    await expect(buildGatewayApp(config)).rejects.toThrow('Invalid persisted LLM limits configuration');

    restoreRuntimeBinaryShims();
    fs.rmSync(root, { recursive: true, force: true });
  });
});
