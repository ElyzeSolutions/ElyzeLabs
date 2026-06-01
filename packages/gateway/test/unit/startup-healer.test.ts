import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ControlPlaneConfig } from '@ops/config';

import { StartupHealer } from '../../src/startup-healer.js';

function createConfig(): ControlPlaneConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-startup-healer-'));
  return {
    server: {
      host: '127.0.0.1',
      port: 8788,
      companyName: 'TestCo',
      corsOrigin: '*',
      apiToken: 'test-token',
      logLevel: 'info'
    },
    channel: {
      telegram: {
        enabled: true,
        botToken: '',
        useWebhook: false,
        debugRawOutput: false,
        dmScope: 'peer',
        requireMentionInGroups: false,
        allowlist: []
      }
    },
    queue: {
      defaultLane: 'default',
      laneConcurrency: {
        default: 1,
        critical: 1,
        background: 1
      },
      retry: {
        maxAttempts: 1,
        baseDelayMs: 100,
        maxDelayMs: 1000
      }
    },
    runtime: {
      defaultRuntime: 'codex',
      workspaceRoot: path.join(root, 'workspaces'),
      workspaceStrategy: 'session',
      openrouterApiKey: '',
      adapters: {
        codex: { command: 'node', args: [] },
        claude: { command: 'node', args: [] },
        gemini: { command: 'node', args: [] },
        process: { command: 'node', args: ['-e', 'console.log("ok")'] }
      }
    },
    memory: {
      enabled: true,
      writeStructured: true,
      workspaceMemoryFile: 'MEMORY.md',
      dailyMemoryDir: '.ops/memory-daily',
      retentionDays: 7,
      embedding: {
        provider: 'noop',
        voyageModel: 'voyage-4-large',
        voyageApiKey: ''
      }
    },
    vault: {
      enabled: true,
      requireUnlockOnStartup: false,
      autoUnlockFromEnv: false,
      envKey: '',
      allowPassphraseUnlock: true,
      passphraseSalt: 'unit-salt',
      passphraseIterations: 10000
    },
    skills: {
      directories: ['skills'],
      catalogStrict: false,
      sandboxDefault: true
    },
    policy: {
      requirePairing: false,
      allowElevatedExecution: false,
      elevatedApprover: 'operator',
      delegationGuards: {
        maxHops: 4,
        maxFanoutPerStep: 3,
        cycleDetection: true
      },
      autoDelegation: {
        mode: 'model',
        minConfidence: 0.45,
        timeoutMs: 20000,
        maxTargets: 3
      }
    },
    observability: {
      eventBufferSize: 1000,
      metricsWindowSec: 300
    },
    housekeeping: {
      enabled: true,
      intervalSec: 180,
      sessionRetentionHours: {
        delegate: 1,
        dashboard: 1,
        agent: 1,
        internal: 1,
        telegram: 72,
        office: 72,
        unknown: 1
      },
      runRetentionHours: 24,
      messageRetentionHours: 24,
      realtimeRetentionHours: 8,
      officePresenceRetentionHours: 8,
      llmUsageRetentionDays: 7,
      memoryRetentionDays: 14,
      auditRetentionDays: 14,
      protectedSessionKeys: []
    },
    office: {
      enabled: true,
      defaultLayoutName: 'main'
    },
    persistence: {
      sqlitePath: path.join(root, 'state.db')
    }
  };
}

describe('startup healer telegram probe', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips hard failure when token is supplied via fallback source', async () => {
    const healer = new StartupHealer({ patches: [] });
    const result = await healer.run({
      config: createConfig(),
      hasTelegramBotTokenFallback: true
    });
    const telegramProbe = result.smoke.find((entry) => entry.name === 'telegram_bot_probe');
    expect(telegramProbe).toBeDefined();
    expect(telegramProbe?.ok).toBe(true);
    expect(telegramProbe?.level).toBe('info');
    expect(result.ok).toBe(true);
  });

  it('reports hard failure when telegram is enabled and no token source exists', async () => {
    const healer = new StartupHealer({ patches: [] });
    const result = await healer.run({
      config: createConfig()
    });
    const telegramProbe = result.smoke.find((entry) => entry.name === 'telegram_bot_probe');
    expect(telegramProbe).toBeDefined();
    expect(telegramProbe?.ok).toBe(false);
    expect(telegramProbe?.level).toBe('error');
    expect(result.ok).toBe(false);
  });

  it('treats invalid telegram credentials as a hard failure', async () => {
    const config = createConfig();
    config.channel.telegram.botToken = 'bad-token';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, description: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      )
    );

    const healer = new StartupHealer({ patches: [] });
    const result = await healer.run({ config });

    const telegramProbe = result.smoke.find((entry) => entry.name === 'telegram_bot_probe');
    expect(telegramProbe).toBeDefined();
    expect(telegramProbe?.ok).toBe(false);
    expect(telegramProbe?.level).toBe('error');
    expect(telegramProbe?.detail).toContain('invalid_token');
    expect(result.ok).toBe(false);
  });

  it('treats transient telegram network failures as degraded startup', async () => {
    const config = createConfig();
    config.channel.telegram.botToken = '123456:test-token';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );

    const healer = new StartupHealer({ patches: [] });
    const result = await healer.run({ config });

    const telegramProbe = result.smoke.find((entry) => entry.name === 'telegram_bot_probe');
    expect(telegramProbe).toBeDefined();
    expect(telegramProbe?.ok).toBe(false);
    expect(telegramProbe?.level).toBe('warn');
    expect(telegramProbe?.detail).toContain('network_unreachable');
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
  });
});
