import { z } from 'zod';

export const runtimeKindSchema = z.enum(['codex', 'claude', 'gemini', 'process']);
const runTerminalStatusSchema = z.enum(['completed', 'failed', 'aborted']);
const browserTransportSchema = z.enum(['stdio', 'http']);
const browserExtractionSchema = z.enum(['markdown', 'html', 'text']);
const browserPromptInjectionEscalationSchema = z.enum(['annotate', 'require_confirmation', 'block']);

const retrySchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(20).default(5),
    baseDelayMs: z.number().int().min(50).max(120_000).default(300),
    maxDelayMs: z.number().int().min(100).max(600_000).default(20_000)
  })
  .strict();

const adapterSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).default([])
  })
  .strict();

const autoDelegationModeSchema = z
  .enum(['heuristic', 'model', 'hybrid'])
  .default('model')
  .transform(() => 'model' as const);

export const controlPlaneConfigSchema = z
  .object({
    server: z
      .object({
        host: z.string().default('0.0.0.0'),
        port: z.number().int().min(1).max(65535).default(8788),
        companyName: z.string().min(1).max(120).default('Company'),
        corsOrigin: z.string().default('*'),
        apiToken: z.string().min(8).default('change-me-local-token'),
        logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info')
      })
      .strict(),
    channel: z
      .object({
        telegram: z
          .object({
            enabled: z.boolean().default(true),
            botToken: z.string().optional(),
            useWebhook: z.boolean().default(false),
            debugRawOutput: z.boolean().default(false),
            dmScope: z.enum(['peer', 'account']).default('peer'),
            requireMentionInGroups: z.boolean().default(true),
            allowlist: z.array(z.string()).default([])
          })
          .strict()
      })
      .strict(),
    queue: z
      .object({
        defaultLane: z.string().default('default'),
        laneConcurrency: z.record(z.string(), z.number().int().min(1)).default({ default: 3 }),
        retry: retrySchema
      })
      .strict(),
    runtime: z
      .object({
        defaultRuntime: runtimeKindSchema.default('process'),
        workspaceRoot: z.string().default('.ops/workspaces'),
        workspaceStrategy: z.enum(['shared', 'session']).default('session'),
        contextAssembly: z
          .object({
            enabled: z.boolean().default(true),
            totalTokenBudget: z.number().int().min(256).max(512_000).default(8192),
            overflowStrategy: z.enum(['shrink', 'fail_fast']).default('shrink'),
            transcriptWindowTurns: z.number().int().min(1).max(100).default(12),
            transcriptMaxMessages: z.number().int().min(2).max(400).default(48),
            memoryTopK: z.number().int().min(0).max(50).default(6),
            memoryMinScore: z.number().min(0).max(1).default(0.15),
            reserves: z
              .object({
                instructions: z.number().int().min(32).max(128_000).default(2200),
                task: z.number().int().min(32).max(128_000).default(2200),
                recentTranscript: z.number().int().min(0).max(128_000).default(2200),
                memoryRecall: z.number().int().min(0).max(128_000).default(1200)
              })
              .strict()
              .prefault({}),
            dropOrder: z
              .array(z.enum(['memory_recall', 'recent_transcript', 'instructions']))
              .min(1)
              .max(3)
              .default(['memory_recall', 'recent_transcript', 'instructions'])
          })
          .strict()
          .prefault({}),
        openrouterApiKey: z.string().optional(),
        adapters: z
          .object({
            codex: adapterSchema.default({
              command: 'codex',
              args: ['-a', 'never', '-s', 'workspace-write', 'exec', '--skip-git-repo-check', '--json']
            }),
            claude: adapterSchema.default({ command: 'claude', args: [] }),
            gemini: adapterSchema.default({ command: 'gemini', args: [] }),
            process: adapterSchema.default({ command: 'node', args: ['scripts/runtime/process-fail-closed.mjs'] })
          })
          .strict()
          .prefault({})
      })
      .strict(),
    browser: z
      .object({
        enabled: z.boolean().default(true),
        provider: z.enum(['scrapling']).default('scrapling'),
        transport: browserTransportSchema.default('stdio'),
        defaultExtraction: browserExtractionSchema.default('markdown'),
        executable: z.string().default('scrapling'),
        healthcheckCommand: z.string().default('scrapling'),
        installCommand: z.string().default('pip install "scrapling[ai]"'),
        bootstrapCommand: z.string().default('scrapling install'),
        httpBaseUrl: z.string().url().optional(),
        allowedAgents: z.array(z.string().min(1)).default([]),
        policy: z
          .object({
            allowedDomains: z.array(z.string().min(1)).default([]),
            deniedDomains: z.array(z.string().min(1)).default([]),
            allowProxy: z.boolean().default(false),
            allowStealth: z.boolean().default(true),
            allowVisibleBrowser: z.boolean().default(false),
            allowFileDownloads: z.boolean().default(false),
            distrustThirdPartyContent: z.boolean().default(true),
            promptInjectionEscalation: browserPromptInjectionEscalationSchema.default('annotate'),
            requireApprovalForStealth: z.boolean().default(false),
            requireApprovalForDownloads: z.boolean().default(true),
            requireApprovalForVisibleBrowser: z.boolean().default(true),
            requireApprovalForProxy: z.boolean().default(true)
          })
          .strict()
          .prefault({})
      })
      .strict()
      .superRefine((value, ctx) => {
        if (value.transport === 'http' && !value.httpBaseUrl) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['httpBaseUrl'],
            message: 'browser.httpBaseUrl is required when browser.transport=http.'
          });
        }
      })
      .prefault({}),
    memory: z
      .object({
        enabled: z.boolean().default(true),
        writeStructured: z.boolean().default(true),
        workspaceMemoryFile: z.string().default('MEMORY.md'),
        dailyMemoryDir: z.string().default('.ops/memory-daily'),
        retentionDays: z.number().int().min(1).default(180),
        autoRemember: z
          .object({
            enabled: z.boolean().default(true),
            triggerStatuses: z.array(runTerminalStatusSchema).default(['completed']),
            minSignificance: z.number().min(0).max(10).default(6),
            maxEntryChars: z.number().int().min(160).max(32_000).default(2_400),
            dedupeWindowRuns: z.number().int().min(0).max(100).default(8),
            cooldownMinutes: z.number().int().min(0).max(7 * 24 * 60).default(180),
            includeChannels: z.array(z.enum(['telegram', 'internal'])).default([]),
            includeAgents: z.array(z.string().min(1)).default([]),
            excludeAgents: z.array(z.string().min(1)).default([])
          })
          .strict()
          .prefault({}),
        embedding: z
          .object({
            provider: z.enum(['noop', 'voyage']).default('noop'),
            vectorMode: z.enum(['sqlite_exact', 'sqlite_ann', 'auto']).default('sqlite_exact'),
            annExtensionName: z.string().default('sqlite-vector'),
            annProbeIntervalSec: z.number().int().min(30).max(86_400).default(300),
            adaptive: z
              .object({
                minSamples: z.number().int().min(1).max(10_000).default(24),
                stabilityWindowSec: z.number().int().min(30).max(86_400).default(900),
                promoteP95Ms: z.number().int().min(1).max(600_000).default(140),
                demoteP95Ms: z.number().int().min(1).max(600_000).default(100),
                minCandidateVolume: z.number().int().min(1).max(100_000).default(40),
                rollbackErrorThreshold: z.number().int().min(1).max(100).default(2)
              })
              .strict()
              .prefault({}),
            voyageModel: z.string().default('voyage-4-large'),
            voyageApiKey: z.string().optional()
          })
          .strict()
      })
      .strict(),
    vault: z
      .object({
        enabled: z.boolean().default(true),
        requireUnlockOnStartup: z.boolean().default(false),
        autoUnlockFromEnv: z.boolean().default(true),
        envKey: z.string().optional(),
        allowPassphraseUnlock: z.boolean().default(true),
        passphraseSalt: z.string().default('ops-control-plane-vault'),
        passphraseIterations: z.number().int().min(10_000).max(1_000_000).default(120_000)
      })
      .strict()
      .prefault({}),
    skills: z
      .object({
        directories: z.array(z.string()).default(['skills', '.ops/skills', '~/.agents/skills']),
        catalogStrict: z.boolean().default(false),
        sandboxDefault: z.boolean().default(true),
        installer: z
          .object({
            enabled: z.boolean().default(true),
            allowedSources: z.array(z.string().min(1)).default(['*/*']),
            blockedSources: z.array(z.string().min(1)).default([]),
            requireApproval: z.boolean().default(true),
            timeoutMs: z.number().int().min(1_000).max(15 * 60_000).default(3 * 60_000),
            maxAttempts: z.number().int().min(1).max(10).default(2),
            installRoot: z.string().default('.ops/skills')
          })
          .strict()
          .prefault({})
      })
      .strict(),
    policy: z
      .object({
        requirePairing: z.boolean().default(true),
        allowElevatedExecution: z.boolean().default(false),
        elevatedApprover: z.string().default('operator'),
        delegationGuards: z
          .object({
            maxHops: z.number().int().min(1).max(12).default(4),
            maxFanoutPerStep: z.number().int().min(1).max(16).default(3),
            cycleDetection: z.boolean().default(true)
          })
          .strict()
          .prefault({}),
        autoDelegation: z
          .object({
            mode: autoDelegationModeSchema,
            minConfidence: z.number().min(0).max(1).default(0.55),
            timeoutMs: z.number().int().min(1000).max(60_000).default(12_000),
            maxTargets: z.number().int().min(1).max(8).default(3)
          })
          .prefault({})
      })
      .strict(),
    observability: z
      .object({
        eventBufferSize: z.number().int().min(50).max(50_000).default(2000),
        metricsWindowSec: z.number().int().min(5).max(3600).default(300)
      })
      .strict(),
    housekeeping: z
      .object({
        enabled: z.boolean().default(true),
        intervalSec: z.number().int().min(60).max(86_400).default(180),
        sessionRetentionHours: z
          .object({
            delegate: z.number().int().min(1).max(24 * 365).default(1),
            dashboard: z.number().int().min(1).max(24 * 365).default(6),
            agent: z.number().int().min(1).max(24 * 365).default(6),
            internal: z.number().int().min(1).max(24 * 365).default(4),
            telegram: z.number().int().min(1).max(24 * 365).default(72),
            office: z.number().int().min(1).max(24 * 365).default(24 * 7),
            unknown: z.number().int().min(1).max(24 * 365).default(4)
          })
          .strict()
          .prefault({}),
        runRetentionHours: z.number().int().min(1).max(24 * 365).default(24),
        terminalRetentionHours: z.number().int().min(1).max(24 * 365).default(24),
        messageRetentionHours: z.number().int().min(1).max(24 * 365).default(24),
        realtimeRetentionHours: z.number().int().min(1).max(24 * 365).default(8),
        officePresenceRetentionHours: z.number().int().min(1).max(24 * 365).default(8),
        waitingInputStaleMinutes: z.number().int().min(5).max(60 * 24 * 365).default(360),
        llmUsageRetentionDays: z.number().int().min(1).max(3650).default(7),
        memoryRetentionDays: z.number().int().min(1).max(3650).default(14),
        memoryMarkdownRetentionDays: z.number().int().min(1).max(3650).default(14),
        auditRetentionDays: z.number().int().min(1).max(3650).default(14),
        protectedSessionKeys: z.array(z.string().min(1)).default(['office:ceo-hq'])
      })
      .strict()
      .prefault({}),
    office: z
      .object({
        enabled: z.boolean().default(true),
        defaultLayoutName: z.string().default('Main Ops Floor')
      })
      .strict(),
    persistence: z
      .object({
        sqlitePath: z.string().default('.ops/state/control-plane.db')
      })
      .strict()
  })
  .strict()
  .superRefine((value, ctx) => {
    const isVaultRef = (input: string | undefined): boolean => typeof input === 'string' && input.startsWith('vault://');

    if (
      value.channel.telegram.enabled &&
      !value.channel.telegram.botToken &&
      !isVaultRef(value.channel.telegram.botToken) &&
      !value.vault.enabled
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['channel', 'telegram', 'botToken'],
        message: 'Telegram bot token is required when channel.telegram.enabled=true and vault.enabled=false.'
      });
    }

    if (
      value.memory.embedding.provider === 'voyage' &&
      !value.memory.embedding.voyageApiKey &&
      !isVaultRef(value.memory.embedding.voyageApiKey) &&
      !value.vault.enabled
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['memory', 'embedding', 'voyageApiKey'],
        message: 'Voyage API key is required when memory.embedding.provider=voyage and vault.enabled=false.'
      });
    }

    if (value.browser.enabled && value.browser.transport === 'http' && !value.browser.httpBaseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['browser', 'httpBaseUrl'],
        message: 'browser.httpBaseUrl is required when browser.enabled=true and browser.transport=http.'
      });
    }

    if (value.vault.enabled && value.vault.requireUnlockOnStartup && !value.vault.envKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vault', 'envKey'],
        message: 'vault.envKey is required when vault.requireUnlockOnStartup=true.'
      });
    }
  });

export type ControlPlaneConfig = z.infer<typeof controlPlaneConfigSchema>;
