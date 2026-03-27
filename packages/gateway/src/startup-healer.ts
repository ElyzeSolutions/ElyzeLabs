import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import type { ControlPlaneConfig } from '@ops/config';

export interface StartupPatch {
  id: string;
  description: string;
  apply: (context: { config: ControlPlaneConfig }) => Promise<void> | void;
}

export interface StartupSmokeResult {
  name: string;
  ok: boolean;
  level: 'info' | 'warn' | 'error';
  detail: string;
}

export interface StartupHealerRunResult {
  ok: boolean;
  degraded: boolean;
  appliedPatches: string[];
  skippedPatches: string[];
  smoke: StartupSmokeResult[];
  startedAt: string;
  finishedAt: string;
}

export interface StartupHealerOptions {
  patches?: StartupPatch[];
}

export interface StartupHealerRunInput {
  config: ControlPlaneConfig;
  emitAudit?: (status: string, details: Record<string, unknown>) => void;
  notifyOnFailure?: boolean;
  resolveTelegramBotToken?: () => string | undefined;
  hasTelegramBotTokenFallback?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isIndirectSecretReference(value: string): boolean {
  return value.startsWith('vault://') || value.startsWith('env:');
}

function commandExists(command: string): boolean {
  const binary = command.trim().split(/\s+/)[0] ?? '';
  if (!binary) {
    return false;
  }
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [binary], { stdio: 'ignore' });
  return result.status === 0;
}

async function telegramGetMe(botToken: string): Promise<{ ok: boolean; detail: string }> {
  if (typeof fetch !== 'function') {
    return {
      ok: false,
      detail: 'Fetch API unavailable in current runtime.'
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      method: 'GET',
      signal: controller.signal
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          description?: string;
        }
      | null;
    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        detail: payload?.description ?? `HTTP ${response.status}`
      };
    }
    return {
      ok: true,
      detail: 'Telegram getMe probe succeeded.'
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function deliverTelegramAlert(
  config: ControlPlaneConfig,
  content: string,
  resolvedToken?: string
): Promise<void> {
  if (!config.channel.telegram.enabled) {
    return;
  }
  const configuredToken = config.channel.telegram.botToken?.trim() ?? '';
  const token = resolvedToken?.trim() || configuredToken;
  if (!token || isIndirectSecretReference(token)) {
    return;
  }
  if (typeof fetch !== 'function') {
    return;
  }

  const chatIds = config.channel.telegram.allowlist
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && /^[0-9-]+$/.test(value));
  for (const chatId of chatIds.slice(0, 4)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7_000);
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: content.slice(0, 3900),
          disable_web_page_preview: true
        }),
        signal: controller.signal
      });
    } catch {
      // best effort
    } finally {
      clearTimeout(timeout);
    }
  }
}

const DEFAULT_PATCHES: StartupPatch[] = [
  {
    id: 'ensure_runtime_workspace_root',
    description: 'Ensure runtime workspace root exists',
    apply: async ({ config }) => {
      await fs.mkdir(path.resolve(config.runtime.workspaceRoot), { recursive: true });
    }
  },
  {
    id: 'ensure_ops_state_parent',
    description: 'Ensure SQLite parent directory exists',
    apply: async ({ config }) => {
      await fs.mkdir(path.dirname(path.resolve(config.persistence.sqlitePath)), { recursive: true });
    }
  }
];

export class StartupHealer {
  private readonly patches: StartupPatch[];
  private readonly appliedPatchIds = new Set<string>();

  constructor(options: StartupHealerOptions = {}) {
    this.patches = options.patches ?? DEFAULT_PATCHES;
  }

  async run(input: StartupHealerRunInput): Promise<StartupHealerRunResult> {
    const startedAt = nowIso();
    const appliedPatches: string[] = [];
    const skippedPatches: string[] = [];

    for (const patch of this.patches) {
      if (this.appliedPatchIds.has(patch.id)) {
        skippedPatches.push(patch.id);
        continue;
      }
      await patch.apply({ config: input.config });
      this.appliedPatchIds.add(patch.id);
      appliedPatches.push(patch.id);
    }

    const resolvedTelegramToken = this.resolveTelegramToken(input);
    const smoke = await this.runSmokeTests(input.config, {
      resolvedTelegramToken,
      hasTelegramBotTokenFallback: Boolean(input.hasTelegramBotTokenFallback)
    });
    const hasCritical = smoke.some((entry) => !entry.ok && entry.level === 'error');
    const degraded = hasCritical || smoke.some((entry) => !entry.ok && entry.level === 'warn');
    const finishedAt = nowIso();
    const result: StartupHealerRunResult = {
      ok: !hasCritical,
      degraded,
      appliedPatches,
      skippedPatches,
      smoke,
      startedAt,
      finishedAt
    };

    input.emitAudit?.(result.ok ? 'ok' : 'degraded', result as unknown as Record<string, unknown>);

    if (input.notifyOnFailure !== false && hasCritical) {
      const summary = smoke
        .filter((entry) => !entry.ok)
        .map((entry) => `${entry.name}: ${entry.detail}`)
        .join('\n');
      await deliverTelegramAlert(
        input.config,
        `Startup smoke failed on ${finishedAt}\n${summary || 'Unknown failure'}`,
        resolvedTelegramToken
      );
    }

    return result;
  }

  private resolveTelegramToken(input: StartupHealerRunInput): string {
    const configuredToken = input.config.channel.telegram.botToken?.trim() ?? '';
    if (configuredToken && !isIndirectSecretReference(configuredToken)) {
      return configuredToken;
    }
    try {
      const resolved = input.resolveTelegramBotToken?.();
      const normalized = resolved?.trim() ?? '';
      if (normalized && !isIndirectSecretReference(normalized)) {
        return normalized;
      }
    } catch {
      // best effort
    }
    return '';
  }

  private async runSmokeTests(
    config: ControlPlaneConfig,
    options: { resolvedTelegramToken: string; hasTelegramBotTokenFallback: boolean }
  ): Promise<StartupSmokeResult[]> {
    const checks: StartupSmokeResult[] = [];

    const workspaceRoot = path.resolve(config.runtime.workspaceRoot);
    const probeFile = path.join(workspaceRoot, '.startup-healer-probe');
    try {
      await fs.mkdir(workspaceRoot, { recursive: true });
      await fs.writeFile(probeFile, `${nowIso()}\n`, 'utf8');
      await fs.unlink(probeFile).catch(() => undefined);
      checks.push({
        name: 'workspace_write_access',
        ok: true,
        level: 'info',
        detail: workspaceRoot
      });
    } catch (error) {
      checks.push({
        name: 'workspace_write_access',
        ok: false,
        level: 'error',
        detail: error instanceof Error ? error.message : String(error)
      });
    }

    const cronIntervalOk = Number.isFinite(config.housekeeping.intervalSec) && config.housekeeping.intervalSec >= 60;
    checks.push({
      name: 'cron_schedule_parse',
      ok: cronIntervalOk,
      level: cronIntervalOk ? 'info' : 'error',
      detail: cronIntervalOk
        ? `housekeeping.intervalSec=${config.housekeeping.intervalSec}`
        : 'housekeeping.intervalSec must be >= 60 seconds'
    });

    if (config.channel.telegram.enabled) {
      const configuredToken = config.channel.telegram.botToken?.trim() ?? '';
      const tokenForProbe = options.resolvedTelegramToken.trim();
      if (tokenForProbe) {
        const probe = await telegramGetMe(tokenForProbe);
        checks.push({
          name: 'telegram_bot_probe',
          ok: probe.ok,
          level: probe.ok ? 'info' : 'error',
          detail: probe.detail
        });
      } else if (
        isIndirectSecretReference(configuredToken) ||
        options.hasTelegramBotTokenFallback
      ) {
        checks.push({
          name: 'telegram_bot_probe',
          ok: true,
          level: 'info',
          detail: 'Telegram token is sourced via env/vault fallback; live probe skipped.'
        });
      } else {
        checks.push({
          name: 'telegram_bot_probe',
          ok: false,
          level: 'error',
          detail: 'Telegram is enabled, but bot token is empty.'
        });
      }
    }

    (['codex', 'claude', 'gemini'] as const).forEach((runtime) => {
      const command = config.runtime.adapters[runtime].command;
      const installed = commandExists(command);
      checks.push({
        name: `runtime_binary_${runtime}`,
        ok: installed,
        level: installed ? 'info' : 'warn',
        detail: installed ? `${command} available` : `${command} missing on PATH`
      });
    });

    return checks;
  }
}
