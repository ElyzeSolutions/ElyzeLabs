import fs from 'node:fs';
import path from 'node:path';

import { config as loadDotenv } from 'dotenv';
import YAML from 'yaml';
import { ZodError } from 'zod';

import { controlPlaneConfigSchema, type ControlPlaneConfig } from './schema.js';

const DEFAULT_CONFIG_PATH = 'config/control-plane.yaml';

function parseBoolean(raw: string | undefined): boolean | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return undefined;
}

function parseNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseCsv(raw: string | undefined): string[] | undefined {
  if (!raw) {
    return undefined;
  }

  const items = raw
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

function buildAdapterOverride(command: string | undefined, args: string[] | undefined): Record<string, unknown> | undefined {
  if (command === undefined && args === undefined) {
    return undefined;
  }

  return {
    command,
    args
  };
}

function hasAnyOverride(input: Record<string, unknown>): boolean {
  return Object.values(input).some((value) => value !== undefined);
}

const PLAIN_SECRET_GUARD_PATHS = [
  'server.apiToken',
  'channel.telegram.botToken',
  'runtime.openrouterApiKey',
  'memory.embedding.voyageApiKey',
  'vault.envKey'
] as const;

const PLACEHOLDER_SECRET_PATTERNS = [
  /^change[-_]?me/i,
  /^replace[-_]?me/i,
  /^your[-_]/i,
  /^example/i,
  /^test[-_]/i,
  /^local[-_]?dev/i,
  /^dummy/i,
  /^placeholder/i,
  /^not[-_]?set/i,
  /^\$\{[^}]+\}$/,
  /^<[^>]+>$/
];

function getAtPath(source: Record<string, unknown>, dotPath: string): unknown {
  const segments = dotPath.split('.');
  let cursor: unknown = source;
  for (const segment of segments) {
    if (!isObject(cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function isSecretReference(raw: string): boolean {
  return raw.startsWith('vault://') || raw.startsWith('env:');
}

function isPlaceholderSecret(raw: string): boolean {
  if (raw.length === 0) {
    return true;
  }
  return PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(raw));
}

function assertNoPlainSecretsInDiskConfig(
  diskConfig: Record<string, unknown>,
  absolutePath: string,
  env: NodeJS.ProcessEnv
): void {
  const guardDisabled = parseBoolean(env.OPS_DISABLE_PLAIN_SECRET_GUARD) === true || env.NODE_ENV === 'test';
  if (guardDisabled) {
    return;
  }
  if (parseBoolean(env.OPS_ALLOW_PLAIN_SECRETS) === true) {
    return;
  }

  const diagnostics: string[] = [];
  for (const dotPath of PLAIN_SECRET_GUARD_PATHS) {
    const value = getAtPath(diskConfig, dotPath);
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed || isSecretReference(trimmed) || isPlaceholderSecret(trimmed)) {
      continue;
    }
    diagnostics.push(
      `${dotPath}: plaintext secret detected in config file. Use env vars or vault references (set OPS_ALLOW_PLAIN_SECRETS=1 to bypass intentionally).`
    );
  }

  if (diagnostics.length > 0) {
    throw new ConfigError(`Refusing to load plaintext secrets from ${absolutePath}`, diagnostics);
  }
}

export class ConfigError extends Error {
  readonly diagnostics: string[];

  constructor(message: string, diagnostics: string[]) {
    super(message);
    this.name = 'ConfigError';
    this.diagnostics = diagnostics;
  }
}

export interface LoadConfigOptions {
  configPath?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function loadConfig(options: LoadConfigOptions = {}): ControlPlaneConfig {
  const cwd = options.cwd ?? process.cwd();
  const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;
  if (!options.env) {
    loadDotenvFile(cwd);
  }
  const env = options.env ?? process.env;

  const absolutePath = path.isAbsolute(configPath) ? configPath : path.join(cwd, configPath);
  const diskConfig = fs.existsSync(absolutePath)
    ? (YAML.parse(fs.readFileSync(absolutePath, 'utf8')) as Record<string, unknown>)
    : {};
  assertNoPlainSecretsInDiskConfig(diskConfig, absolutePath, env);

  const runtimeAdaptersOverride = {
    codex: buildAdapterOverride(env.OPS_RUNTIME_CODEX_COMMAND, parseCsv(env.OPS_RUNTIME_CODEX_ARGS)),
    claude: buildAdapterOverride(env.OPS_RUNTIME_CLAUDE_COMMAND, parseCsv(env.OPS_RUNTIME_CLAUDE_ARGS)),
    gemini: buildAdapterOverride(env.OPS_RUNTIME_GEMINI_COMMAND, parseCsv(env.OPS_RUNTIME_GEMINI_ARGS)),
    process: buildAdapterOverride(env.OPS_RUNTIME_PROCESS_COMMAND, parseCsv(env.OPS_RUNTIME_PROCESS_ARGS))
  };

  const envOverrides: Record<string, unknown> = {
    server: {
      host: env.OPS_SERVER_HOST,
      port: parseNumber(env.OPS_SERVER_PORT),
      companyName: env.OPS_COMPANY_NAME,
      apiToken: env.OPS_API_TOKEN,
      logLevel: env.OPS_LOG_LEVEL,
      corsOrigin: env.OPS_CORS_ORIGIN
    },
    channel: {
      telegram: {
        enabled: parseBoolean(env.OPS_TELEGRAM_ENABLED),
        botToken: env.OPS_TELEGRAM_BOT_TOKEN ?? env.TELEGRAM_BOT_TOKEN,
        useWebhook: parseBoolean(env.OPS_TELEGRAM_USE_WEBHOOK),
        debugRawOutput: parseBoolean(env.OPS_TELEGRAM_DEBUG_RAW_OUTPUT),
        dmScope: env.OPS_TELEGRAM_DM_SCOPE,
        requireMentionInGroups: parseBoolean(env.OPS_TELEGRAM_REQUIRE_MENTION),
        allowlist: parseCsv(env.OPS_TELEGRAM_ALLOWLIST)
      }
    },
    runtime: {
      defaultRuntime: env.OPS_RUNTIME_DEFAULT,
      workspaceRoot: env.OPS_RUNTIME_WORKSPACE_ROOT,
      workspaceStrategy: env.OPS_RUNTIME_WORKSPACE_STRATEGY,
      contextAssembly: {
        enabled: parseBoolean(env.OPS_CONTEXT_ASSEMBLY_ENABLED),
        totalTokenBudget: parseNumber(env.OPS_CONTEXT_ASSEMBLY_TOTAL_TOKENS),
        overflowStrategy: env.OPS_CONTEXT_ASSEMBLY_OVERFLOW_STRATEGY,
        transcriptWindowTurns: parseNumber(env.OPS_CONTEXT_ASSEMBLY_TRANSCRIPT_TURNS),
        transcriptMaxMessages: parseNumber(env.OPS_CONTEXT_ASSEMBLY_TRANSCRIPT_MESSAGES),
        memoryTopK: parseNumber(env.OPS_CONTEXT_ASSEMBLY_MEMORY_TOP_K),
        memoryMinScore: parseNumber(env.OPS_CONTEXT_ASSEMBLY_MEMORY_MIN_SCORE),
        reserves: {
          instructions: parseNumber(env.OPS_CONTEXT_ASSEMBLY_RESERVE_INSTRUCTIONS),
          task: parseNumber(env.OPS_CONTEXT_ASSEMBLY_RESERVE_TASK),
          recentTranscript: parseNumber(env.OPS_CONTEXT_ASSEMBLY_RESERVE_TRANSCRIPT),
          memoryRecall: parseNumber(env.OPS_CONTEXT_ASSEMBLY_RESERVE_MEMORY)
        },
        dropOrder: parseCsv(env.OPS_CONTEXT_ASSEMBLY_DROP_ORDER)
      },
      openrouterApiKey: env.OPS_OPENROUTER_API_KEY ?? env.OPENROUTER_API_KEY,
      adapters: hasAnyOverride(runtimeAdaptersOverride) ? runtimeAdaptersOverride : undefined
    },
    queue: {
      defaultLane: env.OPS_QUEUE_DEFAULT_LANE,
      laneConcurrency: env.OPS_QUEUE_LANE_CONCURRENCY
        ? Object.fromEntries(
            env.OPS_QUEUE_LANE_CONCURRENCY.split(',')
              .map((chunk) => chunk.trim())
              .filter(Boolean)
              .map((chunk) => {
                const [lane, rawValue] = chunk.split(':');
                return [lane?.trim() ?? 'default', Number(rawValue ?? 1)];
              })
          )
        : undefined,
      retry: {
        maxAttempts: parseNumber(env.OPS_QUEUE_MAX_ATTEMPTS),
        baseDelayMs: parseNumber(env.OPS_QUEUE_BASE_DELAY_MS),
        maxDelayMs: parseNumber(env.OPS_QUEUE_MAX_DELAY_MS)
      }
    },
    browser: {
      enabled: parseBoolean(env.OPS_BROWSER_ENABLED),
      provider: env.OPS_BROWSER_PROVIDER,
      transport: env.OPS_BROWSER_TRANSPORT,
      defaultExtraction: env.OPS_BROWSER_DEFAULT_EXTRACTION,
      executable: env.OPS_BROWSER_EXECUTABLE,
      healthcheckCommand: env.OPS_BROWSER_HEALTHCHECK_COMMAND,
      installCommand: env.OPS_BROWSER_INSTALL_COMMAND,
      bootstrapCommand: env.OPS_BROWSER_BOOTSTRAP_COMMAND,
      httpBaseUrl: env.OPS_BROWSER_HTTP_BASE_URL,
      allowedAgents: parseCsv(env.OPS_BROWSER_ALLOWED_AGENTS),
      policy: {
        allowedDomains: parseCsv(env.OPS_BROWSER_ALLOWED_DOMAINS),
        deniedDomains: parseCsv(env.OPS_BROWSER_DENIED_DOMAINS),
        allowProxy: parseBoolean(env.OPS_BROWSER_ALLOW_PROXY),
        allowStealth: parseBoolean(env.OPS_BROWSER_ALLOW_STEALTH),
        allowVisibleBrowser: parseBoolean(env.OPS_BROWSER_ALLOW_VISIBLE_BROWSER),
        allowFileDownloads: parseBoolean(env.OPS_BROWSER_ALLOW_DOWNLOADS),
        distrustThirdPartyContent: parseBoolean(env.OPS_BROWSER_DISTRUST_THIRD_PARTY_CONTENT),
        promptInjectionEscalation: env.OPS_BROWSER_PROMPT_INJECTION_ESCALATION,
        requireApprovalForStealth: parseBoolean(env.OPS_BROWSER_REQUIRE_APPROVAL_FOR_STEALTH),
        requireApprovalForDownloads: parseBoolean(env.OPS_BROWSER_REQUIRE_APPROVAL_FOR_DOWNLOADS),
        requireApprovalForVisibleBrowser: parseBoolean(env.OPS_BROWSER_REQUIRE_APPROVAL_FOR_VISIBLE_BROWSER),
        requireApprovalForProxy: parseBoolean(env.OPS_BROWSER_REQUIRE_APPROVAL_FOR_PROXY)
      }
    },
    memory: {
      enabled: parseBoolean(env.OPS_MEMORY_ENABLED),
      writeStructured: parseBoolean(env.OPS_MEMORY_WRITE_STRUCTURED),
      workspaceMemoryFile: env.OPS_MEMORY_WORKSPACE_FILE,
      dailyMemoryDir: env.OPS_MEMORY_DAILY_DIR,
      retentionDays: parseNumber(env.OPS_MEMORY_RETENTION_DAYS),
      autoRemember: {
        enabled: parseBoolean(env.OPS_MEMORY_AUTO_REMEMBER_ENABLED),
        triggerStatuses: parseCsv(env.OPS_MEMORY_AUTO_REMEMBER_TRIGGER_STATUSES),
        minSignificance: parseNumber(env.OPS_MEMORY_AUTO_REMEMBER_MIN_SIGNIFICANCE),
        maxEntryChars: parseNumber(env.OPS_MEMORY_AUTO_REMEMBER_MAX_ENTRY_CHARS),
        dedupeWindowRuns: parseNumber(env.OPS_MEMORY_AUTO_REMEMBER_DEDUPE_WINDOW_RUNS),
        cooldownMinutes: parseNumber(env.OPS_MEMORY_AUTO_REMEMBER_COOLDOWN_MINUTES),
        includeChannels: parseCsv(env.OPS_MEMORY_AUTO_REMEMBER_INCLUDE_CHANNELS),
        includeAgents: parseCsv(env.OPS_MEMORY_AUTO_REMEMBER_INCLUDE_AGENTS),
        excludeAgents: parseCsv(env.OPS_MEMORY_AUTO_REMEMBER_EXCLUDE_AGENTS)
      },
      embedding: {
        provider: env.OPS_MEMORY_EMBEDDING_PROVIDER,
        vectorMode: env.OPS_MEMORY_EMBEDDING_VECTOR_MODE,
        annExtensionName: env.OPS_MEMORY_EMBEDDING_ANN_EXTENSION,
        annProbeIntervalSec: parseNumber(env.OPS_MEMORY_EMBEDDING_ANN_PROBE_INTERVAL_SEC),
        adaptive: {
          minSamples: parseNumber(env.OPS_MEMORY_EMBEDDING_ADAPTIVE_MIN_SAMPLES),
          stabilityWindowSec: parseNumber(env.OPS_MEMORY_EMBEDDING_ADAPTIVE_STABILITY_WINDOW_SEC),
          promoteP95Ms: parseNumber(env.OPS_MEMORY_EMBEDDING_ADAPTIVE_PROMOTE_P95_MS),
          demoteP95Ms: parseNumber(env.OPS_MEMORY_EMBEDDING_ADAPTIVE_DEMOTE_P95_MS),
          minCandidateVolume: parseNumber(env.OPS_MEMORY_EMBEDDING_ADAPTIVE_MIN_VOLUME),
          rollbackErrorThreshold: parseNumber(env.OPS_MEMORY_EMBEDDING_ADAPTIVE_ROLLBACK_ERRORS)
        },
        voyageApiKey: env.OPS_VOYAGE_API_KEY ?? env.VOYAGE_API_KEY,
        voyageModel: env.OPS_VOYAGE_MODEL
      }
    },
    vault: {
      enabled: parseBoolean(env.OPS_VAULT_ENABLED),
      requireUnlockOnStartup: parseBoolean(env.OPS_VAULT_REQUIRE_UNLOCK_ON_STARTUP),
      autoUnlockFromEnv: parseBoolean(env.OPS_VAULT_AUTO_UNLOCK_FROM_ENV),
      envKey: env.OPS_VAULT_ENV_KEY,
      allowPassphraseUnlock: parseBoolean(env.OPS_VAULT_ALLOW_PASSPHRASE_UNLOCK),
      passphraseSalt: env.OPS_VAULT_PASSPHRASE_SALT,
      passphraseIterations: parseNumber(env.OPS_VAULT_PASSPHRASE_ITERATIONS)
    },
    skills: {
      directories: parseCsv(env.OPS_SKILLS_DIRECTORIES),
      catalogStrict: parseBoolean(env.OPS_SKILLS_CATALOG_STRICT),
      sandboxDefault: parseBoolean(env.OPS_SKILLS_SANDBOX_DEFAULT),
      installer: {
        enabled: parseBoolean(env.OPS_SKILLS_INSTALLER_ENABLED),
        allowedSources: parseCsv(env.OPS_SKILLS_INSTALLER_ALLOWED_SOURCES),
        blockedSources: parseCsv(env.OPS_SKILLS_INSTALLER_BLOCKED_SOURCES),
        requireApproval: parseBoolean(env.OPS_SKILLS_INSTALLER_REQUIRE_APPROVAL),
        timeoutMs: parseNumber(env.OPS_SKILLS_INSTALLER_TIMEOUT_MS),
        maxAttempts: parseNumber(env.OPS_SKILLS_INSTALLER_MAX_ATTEMPTS),
        installRoot: env.OPS_SKILLS_INSTALLER_INSTALL_ROOT
      }
    },
    policy: {
      requirePairing: parseBoolean(env.OPS_POLICY_REQUIRE_PAIRING),
      allowElevatedExecution: parseBoolean(env.OPS_POLICY_ALLOW_ELEVATED),
      elevatedApprover: env.OPS_POLICY_ELEVATED_APPROVER,
      autoDelegation: {
        mode: env.OPS_POLICY_AUTO_DELEGATION_MODE,
        minConfidence: parseNumber(env.OPS_POLICY_AUTO_DELEGATION_MIN_CONFIDENCE),
        timeoutMs: parseNumber(env.OPS_POLICY_AUTO_DELEGATION_TIMEOUT_MS),
        maxTargets: parseNumber(env.OPS_POLICY_AUTO_DELEGATION_MAX_TARGETS)
      }
    },
    observability: {
      eventBufferSize: parseNumber(env.OPS_OBSERVABILITY_EVENT_BUFFER_SIZE),
      metricsWindowSec: parseNumber(env.OPS_OBSERVABILITY_METRICS_WINDOW_SEC)
    },
    housekeeping: {
      enabled: parseBoolean(env.OPS_HOUSEKEEPING_ENABLED),
      intervalSec: parseNumber(env.OPS_HOUSEKEEPING_INTERVAL_SEC),
      sessionRetentionHours: {
        delegate: parseNumber(env.OPS_HOUSEKEEPING_SESSION_DELEGATE_HOURS),
        dashboard: parseNumber(env.OPS_HOUSEKEEPING_SESSION_DASHBOARD_HOURS),
        agent: parseNumber(env.OPS_HOUSEKEEPING_SESSION_AGENT_HOURS),
        internal: parseNumber(env.OPS_HOUSEKEEPING_SESSION_INTERNAL_HOURS),
        telegram: parseNumber(env.OPS_HOUSEKEEPING_SESSION_TELEGRAM_HOURS),
        office: parseNumber(env.OPS_HOUSEKEEPING_SESSION_OFFICE_HOURS),
        unknown: parseNumber(env.OPS_HOUSEKEEPING_SESSION_UNKNOWN_HOURS)
      },
      runRetentionHours: parseNumber(env.OPS_HOUSEKEEPING_RUN_RETENTION_HOURS),
      terminalRetentionHours: parseNumber(env.OPS_HOUSEKEEPING_TERMINAL_RETENTION_HOURS),
      messageRetentionHours: parseNumber(env.OPS_HOUSEKEEPING_MESSAGE_RETENTION_HOURS),
      realtimeRetentionHours: parseNumber(env.OPS_HOUSEKEEPING_REALTIME_RETENTION_HOURS),
      officePresenceRetentionHours: parseNumber(env.OPS_HOUSEKEEPING_OFFICE_PRESENCE_RETENTION_HOURS),
      waitingInputStaleMinutes: parseNumber(env.OPS_HOUSEKEEPING_WAITING_INPUT_STALE_MINUTES),
      llmUsageRetentionDays: parseNumber(env.OPS_HOUSEKEEPING_LLM_USAGE_RETENTION_DAYS),
      memoryRetentionDays: parseNumber(env.OPS_HOUSEKEEPING_MEMORY_RETENTION_DAYS),
      memoryMarkdownRetentionDays: parseNumber(env.OPS_HOUSEKEEPING_MEMORY_MARKDOWN_RETENTION_DAYS),
      auditRetentionDays: parseNumber(env.OPS_HOUSEKEEPING_AUDIT_RETENTION_DAYS),
      protectedSessionKeys: parseCsv(env.OPS_HOUSEKEEPING_PROTECTED_SESSION_KEYS)
    },
    office: {
      enabled: parseBoolean(env.OPS_OFFICE_ENABLED),
      defaultLayoutName: env.OPS_OFFICE_DEFAULT_LAYOUT_NAME
    },
    persistence: {
      sqlitePath: env.OPS_SQLITE_PATH
    }
  };

  const merged = deepMerge({}, diskConfig, envOverrides);
  scrubUndefinedInPlace(merged);

  try {
    return controlPlaneConfigSchema.parse(merged);
  } catch (error) {
    if (error instanceof ZodError) {
      const diagnostics = error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
      throw new ConfigError(`Invalid configuration at ${absolutePath}`, diagnostics);
    }
    throw error;
  }
}

export function describeConfigError(error: unknown): string {
  if (error instanceof ConfigError) {
    const lines = ['Configuration validation failed:'];
    for (const issue of error.diagnostics) {
      lines.push(`- ${issue}`);
    }
    return lines.join('\n');
  }
  return error instanceof Error ? error.message : 'Unknown config error';
}

function deepMerge<T extends Record<string, unknown>>(...sources: Array<Record<string, unknown>>): T {
  const output: Record<string, unknown> = {};

  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) {
        continue;
      }

      const existing = output[key];
      if (isObject(existing) && isObject(value)) {
        output[key] = deepMerge(existing, value);
      } else {
        output[key] = value;
      }
    }
  }

  return output as T;
}

function scrubUndefinedInPlace(payload: unknown): void {
  if (!isObject(payload) && !Array.isArray(payload)) {
    return;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      scrubUndefinedInPlace(item);
    }
    return;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      delete payload[key];
      continue;
    }

    scrubUndefinedInPlace(value);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadDotenvFile(cwd: string): void {
  const dotenvPath = path.join(cwd, '.env');
  if (!fs.existsSync(dotenvPath)) {
    return;
  }
  loadDotenv({ path: dotenvPath, override: false });
}
