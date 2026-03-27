import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ControlPlaneDatabase } from '@ops/db';

import { buildGatewayApp } from '../../src/server.js';
import { installPortableRuntimeBinaryShims } from './runtime-binary-shims.js';

type GatewayApp = Awaited<ReturnType<typeof buildGatewayApp>>;
const publicApiPrefixes = ['/api/hello', '/api/health/readiness', '/api/ingress/telegram', '/api/telegram/webhook'];

export interface GatewayTestHarness {
  root: string;
  config: {
    server: {
      host: string;
      apiToken: string;
      port: number;
    };
    queue: {
      defaultLane: string;
      retry: {
        maxAttempts: number;
      };
    };
    runtime: {
      workspaceRoot: string;
    };
    browser: {
      enabled: boolean;
      transport: 'stdio' | 'http';
      executable: string;
      defaultExtraction: 'markdown' | 'html' | 'text';
      allowedAgents: string[];
      httpBaseUrl?: string;
    };
    persistence: {
      sqlitePath: string;
    };
  } & Record<string, unknown>;
  app: GatewayApp;
  inject: (options: Parameters<GatewayApp['inject']>[0]) => ReturnType<GatewayApp['inject']>;
  createDb: () => ControlPlaneDatabase;
  waitForCondition: (description: string, predicate: () => boolean | Promise<boolean>, timeoutMs?: number) => Promise<void>;
  waitForRunStatus: (runId: string, statuses: string[], timeoutMs?: number) => Promise<{
    runtime: string;
    effectiveRuntime: string | null;
    model: string | null;
    effectiveModel: string | null;
    status: string;
    error: string | null;
  }>;
  waitForTerminalRun: (runId: string, timeoutMs?: number) => Promise<{
    runtime: string;
    effectiveRuntime: string | null;
    model: string | null;
    effectiveModel: string | null;
    status: string;
    error: string | null;
  }>;
  close: () => Promise<void>;
}

export interface RestartableGatewayTestHarness {
  root: string;
  config: ReturnType<typeof createBaseConfig>;
  buildApp: () => Promise<GatewayTestHarness>;
  closeCurrentApp: () => Promise<void>;
  createDb: () => ControlPlaneDatabase;
  cleanup: () => Promise<void>;
}

function nextPort(seed: string): number {
  const hash = Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0);
  return 8800 + (hash % 200);
}

export function createBaseConfig(root: string, label: string) {
  return {
    server: {
      host: '127.0.0.1',
      port: nextPort(label),
      companyName: 'Company',
      corsOrigin: '*',
      apiToken: 'integration-token',
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
        maxDelayMs: 100
      }
    },
    runtime: {
      defaultRuntime: 'codex',
      workspaceRoot: path.join(root, 'workspaces'),
      workspaceStrategy: 'session',
      adapters: {
        codex: { command: 'codex', args: ['exec', '--skip-git-repo-check'] },
        claude: { command: 'claude', args: [] },
        gemini: { command: 'gemini', args: [] },
        process: {
          command: 'node',
          args: [
            '-e',
            'const f=require("node:fs");let p="";const extract=s=>{const i=s.lastIndexOf("CURRENT_TASK:\\n");if(i>=0)return s.slice(i+14).trim();const t=s.lastIndexOf("TASK:");return t>=0?s.slice(t+5).trim():s.trim()};const finish=o=>{f.writeFileSync(1,o);process.exit(0)};process.stdin.on("data",c=>p+=c);process.stdin.on("end",()=>finish(extract(p)||"process"));'
          ]
        }
      }
    },
    browser: {
      enabled: false,
      provider: 'scrapling',
      transport: 'stdio',
      defaultExtraction: 'markdown',
      executable: 'scrapling',
      healthcheckCommand: 'scrapling',
      installCommand: 'pip install "scrapling[ai]"',
      bootstrapCommand: 'scrapling install',
      allowedAgents: [],
      policy: {
        allowedDomains: [],
        deniedDomains: [],
        allowProxy: false,
        allowStealth: false,
        allowVisibleBrowser: false,
        allowFileDownloads: false,
        distrustThirdPartyContent: true,
        promptInjectionEscalation: 'require_confirmation',
        requireApprovalForStealth: true,
        requireApprovalForDownloads: true,
        requireApprovalForVisibleBrowser: true,
        requireApprovalForProxy: true
      }
    },
    memory: {
      enabled: true,
      writeStructured: true,
      workspaceMemoryFile: 'MEMORY.md',
      dailyMemoryDir: '.daily',
      retentionDays: 30,
      autoRemember: {
        enabled: false,
        triggerStatuses: ['completed'],
        minSignificance: 6,
        maxEntryChars: 2400,
        dedupeWindowRuns: 8,
        cooldownMinutes: 180,
        includeChannels: [],
        includeAgents: [],
        excludeAgents: []
      },
      embedding: {
        provider: 'noop',
        voyageModel: 'voyage-3-lite',
        voyageApiKey: undefined,
        vectorMode: 'sqlite_exact',
        annExtensionName: 'vector0',
        adaptive: {
          minSamples: 24,
          stabilityWindowSec: 900,
          promoteP95Ms: 140,
          demoteP95Ms: 100,
          minCandidateVolume: 40,
          rollbackErrorThreshold: 2
        },
        annProbeIntervalSec: 60
      }
    },
    vault: {
      enabled: true,
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
        enabled: true,
        allowedSources: ['vercel-labs/*'],
        blockedSources: ['evil/*'],
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
      eventBufferSize: 200,
      metricsWindowSec: 60
    },
    office: {
      enabled: true,
      defaultLayoutName: 'Main'
    },
    housekeeping: {
      enabled: true,
      intervalSec: 3600,
      sessionRetentionHours: {
        delegate: 24,
        dashboard: 24,
        agent: 24,
        internal: 24,
        telegram: 24,
        office: 24,
        unknown: 24
      },
      runRetentionHours: 72,
      terminalRetentionHours: 72,
      waitingInputStaleMinutes: 30,
      messageRetentionHours: 168,
      realtimeRetentionHours: 24,
      officePresenceRetentionHours: 24,
      llmUsageRetentionDays: 30,
      memoryRetentionDays: 30,
      memoryMarkdownRetentionDays: 30,
      auditRetentionDays: 30,
      protectedSessionKeys: []
    },
    persistence: {
      sqlitePath: path.join(root, 'state.db')
    }
  } as const;
}

export function ensureRuntimeBinaryToolsInstalled(sqlitePath: string): void {
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
}

function createInject(
  app: GatewayApp,
  config: ReturnType<typeof createBaseConfig>
): GatewayTestHarness['inject'] {
  return async (options) => {
    if (typeof options === 'string') {
      return app.inject(options);
    }

    const url = String(options.url ?? '');
    const headers = { ...(options.headers ?? {}) } as Record<string, string>;
    const skipDefaultAuth = headers['x-test-no-default-auth'] === '1';
    const hasExplicitAuth = Boolean(headers.Authorization || headers.authorization || headers['x-api-token']);
    const isApiRoute = url.startsWith('/api/');
    const isPublicApiRoute = publicApiPrefixes.some(
      (prefix) => url === prefix || url.startsWith(`${prefix}?`) || url.startsWith(`${prefix}/`)
    );

    if (isApiRoute && !isPublicApiRoute && !skipDefaultAuth && !hasExplicitAuth) {
      headers.Authorization = `Bearer ${config.server.apiToken}`;
    }
    const hasAuth = Boolean(headers.Authorization || headers.authorization || headers['x-api-token']);
    if (isApiRoute && !isPublicApiRoute && hasAuth && !headers['x-ops-role']) {
      headers['x-ops-role'] = 'operator';
    }

    return app.inject({
      ...options,
      headers
    });
  };
}

function createWaitForCondition(): GatewayTestHarness['waitForCondition'] {
  return async (description, predicate, timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${description}`);
  };
}

function createRunWaiters(
  inject: GatewayTestHarness['inject'],
  waitForCondition: GatewayTestHarness['waitForCondition']
): Pick<GatewayTestHarness, 'waitForRunStatus' | 'waitForTerminalRun'> {
  const waitForRunStatus: GatewayTestHarness['waitForRunStatus'] = async (runId, statuses, timeoutMs = 10_000) => {
    const accepted = new Set(statuses);
    let latest: {
      runtime: string;
      effectiveRuntime: string | null;
      model: string | null;
      effectiveModel: string | null;
      status: string;
      error: string | null;
    } | null = null;
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
          run: {
            runtime: string;
            effectiveRuntime?: string | null;
            model?: string | null;
            effectiveModel?: string | null;
            status: string;
            error: string | null;
          };
        };
        latest = {
          runtime: body.run.runtime,
          effectiveRuntime: body.run.effectiveRuntime ?? null,
          model: body.run.model ?? null,
          effectiveModel: body.run.effectiveModel ?? null,
          status: body.run.status,
          error: body.run.error
        };
        return accepted.has(body.run.status);
      },
      timeoutMs
    );

    return latest!;
  };

  return {
    waitForRunStatus,
    waitForTerminalRun: (runId, timeoutMs = 10_000) =>
      waitForRunStatus(runId, ['completed', 'failed', 'aborted'], timeoutMs)
  };
}

export async function createGatewayTestHarness(
  label: string,
  customize?: (config: ReturnType<typeof createBaseConfig>) => void,
  options?: { installRuntimeShims?: boolean }
): Promise<GatewayTestHarness> {
  const restoreRuntimeBinaryShims =
    options?.installRuntimeShims === false ? () => {} : installPortableRuntimeBinaryShims(`ops-gateway-${label}`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ops-gateway-${label}-`));
  const config = createBaseConfig(root, label);
  fs.mkdirSync(config.runtime.workspaceRoot, { recursive: true });
  customize?.(config);

  const app = await buildGatewayApp(config);
  ensureRuntimeBinaryToolsInstalled(config.persistence.sqlitePath);
  const inject = createInject(app, config);
  const waitForCondition = createWaitForCondition();
  const { waitForRunStatus, waitForTerminalRun } = createRunWaiters(inject, waitForCondition);

  return {
    root,
    config,
    app,
    inject,
    createDb: () => new ControlPlaneDatabase(config.persistence.sqlitePath),
    waitForCondition,
    waitForRunStatus,
    waitForTerminalRun,
    close: async () => {
      await app.close();
      restoreRuntimeBinaryShims();
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

export async function createRestartableGatewayTestHarness(
  label: string,
  customize?: (config: ReturnType<typeof createBaseConfig>) => void,
  options?: { installRuntimeShims?: boolean }
): Promise<RestartableGatewayTestHarness> {
  const restoreRuntimeBinaryShims =
    options?.installRuntimeShims === false ? () => {} : installPortableRuntimeBinaryShims(`ops-gateway-${label}`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ops-gateway-${label}-`));
  const config = createBaseConfig(root, label);
  fs.mkdirSync(config.runtime.workspaceRoot, { recursive: true });
  customize?.(config);

  let currentApp: GatewayApp | null = null;

  const closeCurrentApp = async (): Promise<void> => {
    if (currentApp) {
      await currentApp.close();
      currentApp = null;
    }
  };

  return {
    root,
    config,
    buildApp: async () => {
      await closeCurrentApp();
      currentApp = await buildGatewayApp(config);
      ensureRuntimeBinaryToolsInstalled(config.persistence.sqlitePath);
      const inject = createInject(currentApp, config);
      const waitForCondition = createWaitForCondition();
      const { waitForRunStatus, waitForTerminalRun } = createRunWaiters(inject, waitForCondition);
      return {
        root,
        config,
        app: currentApp,
        inject,
        createDb: () => new ControlPlaneDatabase(config.persistence.sqlitePath),
        waitForCondition,
        waitForRunStatus,
        waitForTerminalRun,
        close: closeCurrentApp
      };
    },
    closeCurrentApp,
    createDb: () => new ControlPlaneDatabase(config.persistence.sqlitePath),
    cleanup: async () => {
      await closeCurrentApp();
      restoreRuntimeBinaryShims();
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}
