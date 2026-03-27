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
  const harnesses: GatewayTestHarness[] = [];

  const createHarness = async (label: string): Promise<GatewayTestHarness> => {
    const harness = await createGatewayTestHarness(label);
    harnesses.push(harness);
    return harness;
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
