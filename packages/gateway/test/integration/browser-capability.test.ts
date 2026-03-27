import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

describe('gateway browser capability integration', () => {
  const harnesses: GatewayTestHarness[] = [];
  const originalPath = process.env.PATH;
  const originalRuntimeToolBinDir = process.env.OPS_RUNTIME_TOOL_BIN_DIR;

  const createHarness = async (
    label: string,
    customize?: Parameters<typeof createGatewayTestHarness>[1]
  ): Promise<GatewayTestHarness> => {
    const harness = await createGatewayTestHarness(label, customize);
    harnesses.push(harness);
    return harness;
  };

  afterEach(async () => {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalRuntimeToolBinDir === undefined) {
      delete process.env.OPS_RUNTIME_TOOL_BIN_DIR;
    } else {
      process.env.OPS_RUNTIME_TOOL_BIN_DIR = originalRuntimeToolBinDir;
    }
    while (harnesses.length > 0) {
      await harnesses.pop()!.close();
    }
  });

  it('surfaces browser tool registry and readiness state when Scrapling is unavailable', async () => {
    const harness = await createHarness('browser-missing-dependency', (config) => {
      config.browser.enabled = true;
      config.browser.transport = 'stdio';
      config.browser.executable = 'definitely-missing-browser';
    });

    const toolsResponse = await harness.inject({
      method: 'GET',
      url: '/api/tools'
    });
    expect(toolsResponse.statusCode).toBe(200);
    const toolsBody = toolsResponse.json() as {
      tools: Array<{ name: string; source: string; installed: boolean; enabled: boolean }>;
    };
    const browserTool = toolsBody.tools.find((tool) => tool.name === 'browser:scrapling');
    expect(browserTool).toMatchObject({
      name: 'browser:scrapling',
      source: 'browser',
      installed: false
    });

    const readinessResponse = await harness.inject({
      method: 'GET',
      url: '/api/health/readiness'
    });
    expect(readinessResponse.statusCode).toBe(200);
    const readinessBody = readinessResponse.json() as {
      readiness: {
        tier: string;
        checks: Array<{
          name: string;
          tier: string;
          ok: boolean;
          summary: string;
        }>;
      };
    };
    const browserCheck = readinessBody.readiness.checks.find((check) => check.name === 'browser_capability');
    expect(browserCheck).toMatchObject({
      name: 'browser_capability',
      tier: 'degraded',
      ok: false
    });
    expect(browserCheck?.summary).toContain('missing_dependency');
  });

  it(
    'exposes browser entitlement to agents and includes capability truth in assembled prompts',
    async () => {
      const harness = await createHarness('browser-prompt-surface', (config) => {
        config.browser.enabled = true;
        config.browser.transport = 'stdio';
        config.browser.executable = 'node';
      });

      const onboardingResponse = await harness.inject({
        method: 'POST',
        url: '/api/onboarding/ceo-baseline',
        payload: {
          actor: 'browser-capability-test'
        }
      });
      expect(onboardingResponse.statusCode).toBe(200);

      const toolsResponse = await harness.inject({
        method: 'GET',
        url: '/api/tools'
      });
      expect(toolsResponse.statusCode).toBe(200);
      const toolsBody = toolsResponse.json() as {
        tools: Array<{ name: string; source: string; installed: boolean; enabled: boolean }>;
      };
      const browserTool = toolsBody.tools.find((tool) => tool.name === 'browser:scrapling');
      expect(browserTool).toMatchObject({
        name: 'browser:scrapling',
        source: 'browser',
        installed: true,
        enabled: true
      });

      const profilesResponse = await harness.inject({
        method: 'GET',
        url: '/api/agents/profiles?includeDisabled=true'
      });
      expect(profilesResponse.statusCode).toBe(200);
      const profilesBody = profilesResponse.json() as {
        agents: Array<{ id: string; tools: string[] }>;
      };
      expect(profilesBody.agents.find((agent) => agent.id === 'ceo-default')?.tools).toContain('browser:scrapling');
      expect(profilesBody.agents.find((agent) => agent.id === 'software-engineer')?.tools).toContain('browser:scrapling');

      const sessionResponse = await harness.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {
          label: 'browser-capability-prompt',
          agentId: 'ceo-default',
          runtime: 'process'
        }
      });
      expect(sessionResponse.statusCode).toBe(201);
      const sessionBody = sessionResponse.json() as {
        session: {
          id: string;
        };
      };

      const runResponse = await harness.inject({
        method: 'POST',
        url: `/api/sessions/${sessionBody.session.id}/runs`,
        headers: {
          'Idempotency-Key': 'browser-capability-prompt'
        },
        payload: {
          prompt: 'Summarize the available browser capability in one sentence.',
          runtime: 'process'
        }
      });
      expect(runResponse.statusCode).toBe(201);
      const runBody = runResponse.json() as {
        run: {
          id: string;
          prompt: string;
        };
      };

      expect(runBody.run.prompt).toContain('BROWSER_CAPABILITY:');
      expect(runBody.run.prompt).toContain('browser_capability=enabled');
      expect(runBody.run.prompt).toContain('tool=browser:scrapling');
      expect(runBody.run.prompt).toContain('entitled=yes');
    },
    10_000
  );

  it('detects a PATH-installed Scrapling binary even when the runtime tool bin is empty', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-browser-path-fallback-'));
    const fakeBinDir = path.join(root, 'bin');
    const runtimeToolBinDir = path.join(root, 'runtime-tools');
    fs.mkdirSync(fakeBinDir, { recursive: true });
    fs.mkdirSync(runtimeToolBinDir, { recursive: true });

    const scraplingPath = path.join(fakeBinDir, 'scrapling');
    fs.writeFileSync(scraplingPath, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    fs.chmodSync(scraplingPath, 0o755);

    process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath ?? ''}`;
    process.env.OPS_RUNTIME_TOOL_BIN_DIR = runtimeToolBinDir;

    const harness = await createHarness('browser-path-installed', (config) => {
      config.browser.enabled = true;
      config.browser.transport = 'stdio';
      config.browser.executable = 'scrapling';
    });

    const toolsResponse = await harness.inject({
      method: 'GET',
      url: '/api/tools'
    });
    expect(toolsResponse.statusCode).toBe(200);
    const toolsBody = toolsResponse.json() as {
      tools: Array<{ name: string; source: string; installed: boolean; enabled: boolean }>;
    };
    expect(toolsBody.tools.find((tool) => tool.name === 'browser:scrapling')).toMatchObject({
      name: 'browser:scrapling',
      source: 'browser',
      installed: true,
      enabled: true
    });

    const statusResponse = await harness.inject({
      method: 'GET',
      url: '/api/browser/status'
    });
    expect(statusResponse.statusCode).toBe(200);
    const statusBody = statusResponse.json() as {
      status: {
        ready: boolean;
        healthState: string;
        executable: string | null;
      };
    };
    expect(statusBody.status.ready).toBe(true);
    expect(statusBody.status.healthState).toBe('ready');
    expect(statusBody.status.executable).toBe('scrapling');
  });
});
