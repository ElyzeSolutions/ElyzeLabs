import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { describeConfigError, loadConfig, type ControlPlaneConfig } from '@ops/config';
import { ControlPlaneDatabase } from '@ops/db';

import { parseSecretReference } from './vault.js';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ConfigValidationIssue {
  severity: ValidationSeverity;
  code: string;
  path: string;
  message: string;
  hint?: string;
}

export interface ConfigValidationResult {
  ok: boolean;
  degraded: boolean;
  issues: ConfigValidationIssue[];
  errors: ConfigValidationIssue[];
  warnings: ConfigValidationIssue[];
  infos: ConfigValidationIssue[];
  migrationHints: ConfigValidationIssue[];
  binaryAvailability: Array<{
    name: string;
    command: string;
    installed: boolean;
    required: boolean;
    emitMissingIssue?: boolean;
  }>;
  checkedAt: string;
}

export interface ConfigValidationOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  resolveVaultSecret?: (vaultKeyPath: string) => boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function commandExists(command: string): boolean {
  const binary = command.trim().split(/\s+/)[0] ?? '';
  if (!binary) {
    return false;
  }
  if (binary.includes(path.sep) || binary.startsWith('.')) {
    try {
      fs.accessSync(path.resolve(binary), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [binary], { stdio: 'ignore' });
  return result.status === 0;
}

function describeMissingCommand(command: string, label = 'runtime command'): string {
  const binary = command.trim().split(/\s+/)[0] ?? '';
  if (!binary) {
    return `${label} is not configured`;
  }
  if (binary.includes(path.sep) || binary.startsWith('.')) {
    return `${label} "${command}" is not executable or does not exist`;
  }
  return `${label} "${command}" is not available on PATH`;
}

const KNOWN_PROCESS_ADAPTER_PLACEHOLDER_SNIPPETS = [
  'console.log("process adapter")',
  "console.log('process adapter')",
  'console.log("process runtime")',
  "console.log('process runtime')"
];
const DEFAULT_PROCESS_ADAPTER_PLACEHOLDER_SCRIPT = path.normalize('scripts/runtime/process-fail-closed.mjs');

function normalizeAdapterArgs(args: string[] | undefined): string[] {
  return Array.isArray(args) ? args.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0) : [];
}

export function isProcessAdapterPlaceholderConfig(command: string | undefined, args: string[] | undefined): boolean {
  const normalizedCommand = String(command ?? '').trim();
  const normalizedArgs = normalizeAdapterArgs(args);
  if (normalizedCommand !== 'node') {
    return false;
  }
  if (
    normalizedArgs.length >= 2 &&
    normalizedArgs[0] === '-e' &&
    KNOWN_PROCESS_ADAPTER_PLACEHOLDER_SNIPPETS.some((snippet) => (normalizedArgs[1] ?? '').includes(snippet))
  ) {
    return true;
  }
  if (normalizedArgs.length === 0) {
    return false;
  }
  const firstPathArg = normalizedArgs.find((entry) => !entry.startsWith('-'));
  if (!firstPathArg) {
    return false;
  }
  const normalizedPathArg = path.normalize(firstPathArg);
  return (
    normalizedPathArg === DEFAULT_PROCESS_ADAPTER_PLACEHOLDER_SCRIPT ||
    normalizedPathArg.endsWith(path.sep + DEFAULT_PROCESS_ADAPTER_PLACEHOLDER_SCRIPT)
  );
}

function normalizeDirectoryEntry(cwd: string, value: string): string {
  const expanded = value.startsWith('~/') ? path.join(process.env.HOME ?? '', value.slice(2)) : value;
  return path.resolve(cwd, expanded);
}

function looksLikeEnvSecret(value: string): boolean {
  return value.startsWith('env:');
}

function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return (
    normalized.includes('change-me') ||
    normalized.includes('replace-me') ||
    normalized.includes('placeholder') ||
    normalized.startsWith('your_')
  );
}

function pushIssue(target: ConfigValidationIssue[], issue: ConfigValidationIssue): void {
  target.push(issue);
}

function inspectSecretField(
  issues: ConfigValidationIssue[],
  input: {
    path: string;
    label: string;
    value: string | undefined;
    requiredWhenEnabled: boolean;
    enabled: boolean;
    vaultEnabled: boolean;
    resolveVaultSecret: (vaultKeyPath: string) => boolean;
    fallbackVaultKeyPath?: string;
  }
): void {
  const value = input.value?.trim() ?? '';
  if (!input.enabled) {
    return;
  }
  if (!value) {
    if (input.requiredWhenEnabled) {
      if (
        input.vaultEnabled &&
        input.fallbackVaultKeyPath &&
        input.resolveVaultSecret(input.fallbackVaultKeyPath)
      ) {
        return;
      }
      pushIssue(issues, {
        severity: 'error',
        code: 'missing_secret',
        path: input.path,
        message: `${input.label} is required when this feature is enabled.`
      });
    }
    return;
  }

  if (isPlaceholderSecret(value)) {
    pushIssue(issues, {
      severity: input.requiredWhenEnabled ? 'error' : 'warning',
      code: 'placeholder_secret',
      path: input.path,
      message: `${input.label} looks like a placeholder value.`,
      hint: 'Use env:NAME or vault://secret_name.'
    });
    return;
  }

  const vaultRef = parseSecretReference(value);
  if (vaultRef) {
    if (!input.vaultEnabled) {
      pushIssue(issues, {
        severity: 'error',
        code: 'vault_ref_with_vault_disabled',
        path: input.path,
        message: `${input.label} uses a vault reference, but vault is disabled.`
      });
      return;
    }
    if (!input.resolveVaultSecret(vaultRef)) {
      pushIssue(issues, {
        severity: 'warning',
        code: 'vault_secret_not_found',
        path: input.path,
        message: `${input.label} references vault secret "${vaultRef}" that is not present yet.`,
        hint: `Store it with /api/vault/secrets/${vaultRef} before production startup.`
      });
    }
    return;
  }

  if (!looksLikeEnvSecret(value)) {
    pushIssue(issues, {
      severity: 'warning',
      code: 'inline_secret_value',
      path: input.path,
      message: `${input.label} is configured as an inline value.`,
      hint: 'Prefer env:NAME or vault://secret_name.'
    });
  }
}

function secretLooksResolvedFromEnv(
  value: string | undefined,
  env: NodeJS.ProcessEnv,
  envKeys: string[]
): boolean {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    return false;
  }
  return envKeys.some((envKey) => {
    const envValue = env[envKey]?.trim() ?? '';
    return envValue.length > 0 && envValue === normalized;
  });
}

export function validateControlPlaneConfig(
  config: ControlPlaneConfig,
  options: ConfigValidationOptions = {}
): ConfigValidationResult {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const issues: ConfigValidationIssue[] = [];
  const resolveVaultSecret = options.resolveVaultSecret ?? (() => true);
  const telegramTokenFromEnv = secretLooksResolvedFromEnv(config.channel.telegram.botToken, env, [
    'OPS_TELEGRAM_BOT_TOKEN',
    'TELEGRAM_BOT_TOKEN'
  ]);
  const openrouterKeyFromEnv = secretLooksResolvedFromEnv(config.runtime.openrouterApiKey, env, [
    'OPS_OPENROUTER_API_KEY',
    'OPENROUTER_API_KEY'
  ]);
  const voyageKeyFromEnv = secretLooksResolvedFromEnv(config.memory.embedding.voyageApiKey, env, [
    'OPS_VOYAGE_API_KEY',
    'VOYAGE_API_KEY'
  ]);

  const uniqueSkillDirectories = new Map<string, number>();
  config.skills.directories.forEach((entry, index) => {
    const normalized = normalizeDirectoryEntry(cwd, entry);
    const existing = uniqueSkillDirectories.get(normalized);
    if (existing !== undefined) {
      pushIssue(issues, {
        severity: 'error',
        code: 'duplicate_directory',
        path: `skills.directories.${index}`,
        message: `duplicates skills.directories.${existing} (${normalized})`
      });
      return;
    }
    uniqueSkillDirectories.set(normalized, index);
  });

  const workspaceRoot = path.resolve(cwd, config.runtime.workspaceRoot);
  if (!fs.existsSync(workspaceRoot)) {
    pushIssue(issues, {
      severity: 'warning',
      code: 'workspace_missing',
      path: 'runtime.workspaceRoot',
      message: `workspace root does not exist yet (${workspaceRoot})`,
      hint: 'Gateway will create this directory on demand.'
    });
  }

  inspectSecretField(issues, {
    path: 'channel.telegram.botToken',
    label: 'Telegram bot token',
    value: telegramTokenFromEnv ? 'env:OPS_TELEGRAM_BOT_TOKEN' : config.channel.telegram.botToken,
    requiredWhenEnabled: config.channel.telegram.enabled,
    enabled: config.channel.telegram.enabled,
    vaultEnabled: config.vault.enabled,
    resolveVaultSecret,
    fallbackVaultKeyPath: 'telegram.bot_token'
  });

  inspectSecretField(issues, {
    path: 'runtime.openrouterApiKey',
    label: 'OpenRouter API key',
    value: openrouterKeyFromEnv ? 'env:OPS_OPENROUTER_API_KEY' : config.runtime.openrouterApiKey,
    requiredWhenEnabled: false,
    enabled: true,
    vaultEnabled: config.vault.enabled,
    resolveVaultSecret
  });

  inspectSecretField(issues, {
    path: 'memory.embedding.voyageApiKey',
    label: 'Voyage API key',
    value: voyageKeyFromEnv ? 'env:OPS_VOYAGE_API_KEY' : config.memory.embedding.voyageApiKey,
    requiredWhenEnabled: config.memory.embedding.provider === 'voyage',
    enabled: true,
    vaultEnabled: config.vault.enabled,
    resolveVaultSecret,
    fallbackVaultKeyPath: 'providers.voyage_api_key'
  });

  const binaryAvailability: ConfigValidationResult['binaryAvailability'] = [
    {
      name: 'codex',
      command: config.runtime.adapters.codex.command,
      installed: commandExists(config.runtime.adapters.codex.command),
      required: config.runtime.defaultRuntime === 'codex'
    },
    {
      name: 'claude',
      command: config.runtime.adapters.claude.command,
      installed: commandExists(config.runtime.adapters.claude.command),
      required: config.runtime.defaultRuntime === 'claude'
    },
    {
      name: 'gemini',
      command: config.runtime.adapters.gemini.command,
      installed: commandExists(config.runtime.adapters.gemini.command),
      required: config.runtime.defaultRuntime === 'gemini'
    },
    {
      name: 'process',
      command: config.runtime.adapters.process.command,
      installed: commandExists(config.runtime.adapters.process.command),
      required: true
    },
    {
      name: 'browser:scrapling',
      command: config.browser.executable,
      installed: commandExists(config.browser.executable),
      required: false,
      emitMissingIssue: false
    },
    {
      name: 'browser:python3',
      command: 'python3',
      installed: commandExists('python3'),
      required: false
    }
  ];

  binaryAvailability.forEach((entry) => {
    if (entry.installed || entry.emitMissingIssue === false) {
      return;
    }
    pushIssue(issues, {
      severity: entry.required ? 'error' : 'warning',
      code: 'runtime_binary_missing',
      path: `runtime.adapters.${entry.name}.command`,
      message: describeMissingCommand(entry.command)
    });
  });

  if (isProcessAdapterPlaceholderConfig(config.runtime.adapters.process.command, config.runtime.adapters.process.args)) {
    pushIssue(issues, {
      severity: 'warning',
      code: 'process_adapter_placeholder',
      path: 'runtime.adapters.process',
      message: 'Process adapter is still using the default fail-closed placeholder.',
      hint:
        'Provider-backed process runs may still work, but direct local process fallback is not bound to a real executor until runtime.adapters.process is replaced.'
    });
  }

  if (config.browser.enabled && config.browser.transport === 'http' && !config.browser.httpBaseUrl) {
    pushIssue(issues, {
      severity: 'error',
      code: 'browser_http_base_url_missing',
      path: 'browser.httpBaseUrl',
      message: 'browser.httpBaseUrl is required when the browser transport is http.'
    });
  }

  if (
    config.browser.policy.allowedDomains.length > 0 &&
    config.browser.policy.deniedDomains.some((entry) => config.browser.policy.allowedDomains.includes(entry))
  ) {
    pushIssue(issues, {
      severity: 'warning',
      code: 'browser_domain_overlap',
      path: 'browser.policy',
      message: 'browser policy contains domains present in both allow and deny lists.',
      hint: 'Remove overlapping domain entries to keep routing decisions deterministic.'
    });
  }

  if (config.browser.enabled && config.browser.transport === 'stdio' && !commandExists(config.browser.executable)) {
    pushIssue(issues, {
      severity: 'warning',
      code: 'browser_executable_missing',
      path: 'browser.executable',
      message: describeMissingCommand(config.browser.executable, 'browser executable'),
      hint: `Install with ${config.browser.installCommand} and run ${config.browser.bootstrapCommand}.`
    });
  }

  const migrationHints: ConfigValidationIssue[] = [];
  const autoDelegationMode = String(config.policy.autoDelegation.mode ?? 'model');
  if (autoDelegationMode !== 'model') {
    migrationHints.push({
      severity: 'info',
      code: 'deprecated_auto_delegation_mode',
      path: 'policy.autoDelegation.mode',
      message: `Mode "${autoDelegationMode}" is legacy and now coerced to "model".`,
      hint: 'Set policy.autoDelegation.mode: model explicitly.'
    });
  }
  if (
    config.runtime.openrouterApiKey &&
    !openrouterKeyFromEnv &&
    !config.runtime.openrouterApiKey.startsWith('env:') &&
    !config.runtime.openrouterApiKey.startsWith('vault://')
  ) {
    migrationHints.push({
      severity: 'info',
      code: 'migrate_inline_openrouter_key',
      path: 'runtime.openrouterApiKey',
      message: 'Inline OpenRouter key detected.',
      hint: 'Move this value to vault://providers.openrouter_api_key or env:OPS_OPENROUTER_API_KEY.'
    });
  }
  if (
    config.channel.telegram.botToken &&
    !telegramTokenFromEnv &&
    !config.channel.telegram.botToken.startsWith('env:') &&
    !config.channel.telegram.botToken.startsWith('vault://')
  ) {
    migrationHints.push({
      severity: 'info',
      code: 'migrate_inline_telegram_token',
      path: 'channel.telegram.botToken',
      message: 'Inline Telegram token detected.',
      hint: 'Move this value to vault://telegram.bot_token or env:OPS_TELEGRAM_BOT_TOKEN.'
    });
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const infos = issues.filter((issue) => issue.severity === 'info');
  const ok = errors.length === 0;

  return {
    ok,
    degraded: warnings.length > 0 || migrationHints.length > 0,
    issues,
    errors,
    warnings,
    infos,
    migrationHints,
    binaryAvailability,
    checkedAt: nowIso()
  };
}

export function formatValidationResult(result: ConfigValidationResult): string {
  const lines: string[] = [];
  lines.push(`Config validation ${result.ok ? 'PASSED' : 'FAILED'} at ${result.checkedAt}`);

  if (result.errors.length > 0) {
    lines.push('Errors:');
    for (const issue of result.errors) {
      lines.push(`- ERROR at ${issue.path}: ${issue.message}`);
    }
  }
  if (result.warnings.length > 0) {
    lines.push('Warnings:');
    for (const issue of result.warnings) {
      lines.push(`- WARNING at ${issue.path}: ${issue.message}`);
    }
  }
  if (result.migrationHints.length > 0) {
    lines.push('Migration hints:');
    for (const hint of result.migrationHints) {
      lines.push(`- ${hint.path}: ${hint.message}${hint.hint ? ` (${hint.hint})` : ''}`);
    }
  }
  lines.push('Binary probes:');
  for (const probe of result.binaryAvailability) {
    lines.push(
      `- ${probe.name}: ${probe.installed ? 'ok' : 'missing'} (${probe.command})${probe.required ? ' [required]' : ''}`
    );
  }
  return lines.join('\n');
}

export function validateConfigPath(
  configPath: string,
  options: ConfigValidationOptions = {}
): { config: ControlPlaneConfig; result: ConfigValidationResult } {
  const cwd = options.cwd ?? process.cwd();
  const resolved = path.resolve(cwd, configPath);
  let config: ControlPlaneConfig;
  try {
    config = loadConfig({
      configPath: resolved,
      cwd,
      env: options.env
    });
  } catch (error) {
    const issue: ConfigValidationIssue = {
      severity: 'error',
      code: 'schema_parse_failed',
      path: 'config',
      message: describeConfigError(error)
    };
    return {
      config: loadConfig({
        configPath: resolved,
        cwd,
        env: {
          ...(options.env ?? process.env),
          OPS_ALLOW_PLAIN_SECRETS: '1',
          OPS_DISABLE_PLAIN_SECRET_GUARD: '1'
        }
      }),
      result: {
        ok: false,
        degraded: false,
        issues: [issue],
        errors: [issue],
        warnings: [],
        infos: [],
        migrationHints: [],
        binaryAvailability: [],
        checkedAt: nowIso()
      }
    };
  }

  let sqliteResolverDb: ControlPlaneDatabase | null = null;
  let resolveVaultSecret = options.resolveVaultSecret;
  if (!resolveVaultSecret && config.vault.enabled) {
    const sqlitePath = path.resolve(path.dirname(resolved), config.persistence.sqlitePath);
    if (fs.existsSync(sqlitePath)) {
      try {
        sqliteResolverDb = new ControlPlaneDatabase(sqlitePath);
        resolveVaultSecret = (vaultKeyPath: string): boolean => {
          if (!sqliteResolverDb) {
            return false;
          }
          try {
            const record = sqliteResolverDb.getVaultSecret(vaultKeyPath);
            return Boolean(record && record.revokedAt === null);
          } catch {
            return false;
          }
        };
      } catch {
        sqliteResolverDb = null;
      }
    }
  }

  const result = validateControlPlaneConfig(config, {
    ...options,
    resolveVaultSecret
  });
  sqliteResolverDb?.close();
  return {
    config,
    result
  };
}
