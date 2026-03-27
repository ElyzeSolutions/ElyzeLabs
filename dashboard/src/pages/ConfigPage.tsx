import { CheckCircle, FloppyDisk, GearSix, LockKey, WarningCircle } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer } from 'react';

import { approvePairing, revokePairing, saveRuntimeConfig } from '../app/api';
import { invalidateConfigReadQueries, pairingsQueryOptions, runtimeConfigQueryOptions } from '../app/queryOptions';
import { useAppStore } from '../app/store';
import type { CardMetric, PairingRow, RuntimeConfigState } from '../app/types';
import { clampCount } from '../lib/format';
import { buildIndexedKey } from '../lib/listKeys';
import { useRouteHeaderMetrics } from '../components/shell/RouteHeaderContext';
import { PageDisclosure, PageIntro } from '../components/ops/PageHeader';

const REDACTED_VALUE = '__REDACTED__';

type FieldKind = 'text' | 'number' | 'boolean' | 'select' | 'csv' | 'kv';

interface ConfigFieldSpec {
  path: string;
  label: string;
  description: string;
  kind: FieldKind;
  placeholder?: string;
  options?: string[];
  min?: number;
  step?: number;
  fullWidth?: boolean;
  secret?: boolean;
}

interface ConfigSectionSpec {
  id: string;
  title: string;
  description: string;
  fields: ConfigFieldSpec[];
}

const CONFIG_SECTIONS: ConfigSectionSpec[] = [
  {
    id: 'server',
    title: 'Server',
    description: 'HTTP host, API auth token, logs, and CORS.',
    fields: [
      { path: 'server.host', label: 'Host', description: 'Gateway bind address.', kind: 'text', placeholder: '0.0.0.0' },
      { path: 'server.port', label: 'Port', description: 'Gateway listen port.', kind: 'number', min: 1, step: 1 },
      {
        path: 'server.companyName',
        label: 'Company Name',
        description: 'Brand/company label used by seeded CEO prompt and naming.',
        kind: 'text',
        placeholder: 'Company'
      },
      {
        path: 'server.corsOrigin',
        label: 'CORS Origin',
        description: 'Allowed origin for dashboard/API.',
        kind: 'text',
        placeholder: '*'
      },
      { path: 'server.logLevel', label: 'Log Level', description: 'Runtime log verbosity.', kind: 'select', options: ['debug', 'info', 'warn', 'error'] },
      {
        path: 'server.apiToken',
        label: 'API Token',
        description: 'Bearer token used by dashboard and CLI calls.',
        kind: 'text',
        secret: true
      }
    ]
  },
  {
    id: 'telegram',
    title: 'Telegram',
    description: 'Ingress behavior, scope, and bot credentials.',
    fields: [
      { path: 'channel.telegram.enabled', label: 'Enabled', description: 'Accept Telegram ingress.', kind: 'boolean' },
      { path: 'channel.telegram.useWebhook', label: 'Use Webhook', description: 'Use webhook mode instead of polling.', kind: 'boolean' },
      {
        path: 'channel.telegram.debugRawOutput',
        label: 'Debug Raw Output',
        description: 'When enabled, Telegram receives full raw runtime output (including CLI logs).',
        kind: 'boolean'
      },
      {
        path: 'channel.telegram.dmScope',
        label: 'DM Scope',
        description: 'How direct messages are scoped to sessions.',
        kind: 'select',
        options: ['peer', 'account']
      },
      {
        path: 'channel.telegram.requireMentionInGroups',
        label: 'Require Mention In Groups',
        description: 'Only react when bot is mentioned in group chats.',
        kind: 'boolean'
      },
      {
        path: 'channel.telegram.allowlist',
        label: 'Allowlist',
        description: 'Comma-separated chat or sender IDs.',
        kind: 'csv',
        placeholder: '12345, 67890',
        fullWidth: true
      },
      {
        path: 'channel.telegram.botToken',
        label: 'Bot Token',
        description: 'Bot credential or secret reference.',
        kind: 'text',
        secret: true,
        fullWidth: true
      }
    ]
  },
  {
    id: 'queue',
    title: 'Queue',
    description: 'Lane defaults, concurrency, and retry policy.',
    fields: [
      { path: 'queue.defaultLane', label: 'Default Lane', description: 'Default lane for queued runs.', kind: 'text', placeholder: 'default' },
      { path: 'queue.retry.maxAttempts', label: 'Retry Max Attempts', description: 'Total retry attempts per job.', kind: 'number', min: 1, step: 1 },
      { path: 'queue.retry.baseDelayMs', label: 'Retry Base Delay (ms)', description: 'Initial retry backoff in milliseconds.', kind: 'number', min: 50, step: 10 },
      { path: 'queue.retry.maxDelayMs', label: 'Retry Max Delay (ms)', description: 'Upper retry backoff cap.', kind: 'number', min: 100, step: 50 },
      {
        path: 'queue.laneConcurrency',
        label: 'Lane Concurrency',
        description: 'One lane per line, format lane:concurrency.',
        kind: 'kv',
        placeholder: 'default:3\npriority:1',
        fullWidth: true
      }
    ]
  },
  {
    id: 'runtime',
    title: 'Runtime',
    description: 'Default runtime, workspace strategy, and adapter commands.',
    fields: [
      {
        path: 'runtime.defaultRuntime',
        label: 'Default Runtime',
        description: 'Fallback runtime when not set per session.',
        kind: 'select',
        options: ['codex', 'claude', 'gemini', 'process']
      },
      {
        path: 'runtime.workspaceRoot',
        label: 'Workspace Root',
        description: 'Root folder for runtime workspaces.',
        kind: 'text',
        placeholder: '.ops/workspaces'
      },
      {
        path: 'runtime.workspaceStrategy',
        label: 'Workspace Strategy',
        description: 'Shared workspace or one per session.',
        kind: 'select',
        options: ['shared', 'session']
      },
      {
        path: 'runtime.openrouterApiKey',
        label: 'OpenRouter API Key',
        description: 'Optional credential or vault reference for OpenRouter-backed runtime routing.',
        kind: 'text',
        secret: true,
        fullWidth: true
      },
      {
        path: 'runtime.adapters.codex.command',
        label: 'Codex Command',
        description: 'Executable for codex runtime.',
        kind: 'text',
        placeholder: 'codex'
      },
      {
        path: 'runtime.adapters.codex.args',
        label: 'Codex Args',
        description: 'Comma-separated args for codex runtime.',
        kind: 'csv',
        placeholder: '--model,gpt-5'
      },
      {
        path: 'runtime.adapters.claude.command',
        label: 'Claude Command',
        description: 'Executable for claude runtime.',
        kind: 'text',
        placeholder: 'claude'
      },
      {
        path: 'runtime.adapters.claude.args',
        label: 'Claude Args',
        description: 'Comma-separated args for claude runtime.',
        kind: 'csv',
        placeholder: '--model,sonnet'
      },
      {
        path: 'runtime.adapters.gemini.command',
        label: 'Gemini Command',
        description: 'Executable for gemini runtime.',
        kind: 'text',
        placeholder: 'gemini'
      },
      {
        path: 'runtime.adapters.gemini.args',
        label: 'Gemini Args',
        description: 'Comma-separated args for gemini runtime.',
        kind: 'csv',
        placeholder: '--model,gemini-2.5-pro'
      },
      {
        path: 'runtime.adapters.process.command',
        label: 'Process Command',
        description: 'Fallback process runtime command.',
        kind: 'text',
        placeholder: 'node'
      },
      {
        path: 'runtime.adapters.process.args',
        label: 'Process Args',
        description: 'Comma-separated args for process runtime.',
        kind: 'csv',
        placeholder: 'scripts/runtime/process-fail-closed.mjs'
      }
    ]
  },
  {
    id: 'memory',
    title: 'Memory',
    description: 'Memory writing, retention, and embedding provider.',
    fields: [
      { path: 'memory.enabled', label: 'Enabled', description: 'Enable memory persistence.', kind: 'boolean' },
      { path: 'memory.writeStructured', label: 'Write Structured', description: 'Write structured memory artifacts.', kind: 'boolean' },
      {
        path: 'memory.workspaceMemoryFile',
        label: 'Workspace Memory File',
        description: 'Per-workspace memory filename.',
        kind: 'text',
        placeholder: 'MEMORY.md'
      },
      {
        path: 'memory.dailyMemoryDir',
        label: 'Daily Memory Dir',
        description: 'Directory used for daily memory files.',
        kind: 'text',
        placeholder: '.ops/memory-daily'
      },
      { path: 'memory.retentionDays', label: 'Retention Days', description: 'Memory retention horizon.', kind: 'number', min: 1, step: 1 },
      {
        path: 'memory.embedding.provider',
        label: 'Embedding Provider',
        description: 'Use noop for no embeddings, voyage for semantic recall.',
        kind: 'select',
        options: ['noop', 'voyage']
      },
      {
        path: 'memory.embedding.voyageModel',
        label: 'Voyage Model',
        description: 'Voyage model identifier.',
        kind: 'text',
        placeholder: 'voyage-4-large'
      },
      {
        path: 'memory.embedding.voyageApiKey',
        label: 'Voyage API Key',
        description: 'Voyage credential or secret reference.',
        kind: 'text',
        secret: true
      }
    ]
  },
  {
    id: 'vault',
    title: 'Vault',
    description: 'Vault behavior, unlock strategy, and passphrase controls.',
    fields: [
      { path: 'vault.enabled', label: 'Enabled', description: 'Enable encrypted local vault.', kind: 'boolean' },
      {
        path: 'vault.requireUnlockOnStartup',
        label: 'Require Unlock On Startup',
        description: 'Require unlock before runtime starts.',
        kind: 'boolean'
      },
      {
        path: 'vault.autoUnlockFromEnv',
        label: 'Auto Unlock From Env',
        description: 'Attempt auto-unlock from configured material.',
        kind: 'boolean'
      },
      {
        path: 'vault.allowPassphraseUnlock',
        label: 'Allow Passphrase Unlock',
        description: 'Allow manual passphrase unlock.',
        kind: 'boolean'
      },
      {
        path: 'vault.envKey',
        label: 'Vault Env Key Material',
        description: 'Unlock material or secret reference used for startup unlock.',
        kind: 'text',
        secret: true,
        fullWidth: true
      },
      {
        path: 'vault.passphraseSalt',
        label: 'Passphrase Salt',
        description: 'PBKDF2 salt for passphrase-derived keys.',
        kind: 'text',
        placeholder: 'ops-control-plane-vault'
      },
      {
        path: 'vault.passphraseIterations',
        label: 'Passphrase Iterations',
        description: 'PBKDF2 iteration count.',
        kind: 'number',
        min: 10000,
        step: 1000
      }
    ]
  },
  {
    id: 'skills',
    title: 'Skills',
    description: 'Skill catalog, directories, and sandbox defaults.',
    fields: [
      {
        path: 'skills.directories',
        label: 'Skill Directories',
        description: 'Comma-separated skill directories.',
        kind: 'csv',
        placeholder: 'skills'
      },
      { path: 'skills.catalogStrict', label: 'Catalog Strict', description: 'Fail if catalog issues are detected.', kind: 'boolean' },
      { path: 'skills.sandboxDefault', label: 'Sandbox Default', description: 'Default sandbox posture for skills.', kind: 'boolean' }
    ]
  },
  {
    id: 'policy',
    title: 'Policy',
    description: 'Pairing, elevated execution, and auto-delegation routing policy.',
    fields: [
      { path: 'policy.requirePairing', label: 'Require Pairing', description: 'Require pairing before direct channel actions.', kind: 'boolean' },
      { path: 'policy.allowElevatedExecution', label: 'Allow Elevated Execution', description: 'Allow elevated actions when approved.', kind: 'boolean' },
      {
        path: 'policy.elevatedApprover',
        label: 'Elevated Approver',
        description: 'Policy approver identifier.',
        kind: 'text',
        placeholder: 'operator'
      },
      {
        path: 'policy.autoDelegation.mode',
        label: 'Auto-Delegation Mode',
        description: 'Deterministic model router (heuristic routing removed).',
        kind: 'select',
        options: ['model']
      },
      {
        path: 'policy.autoDelegation.minConfidence',
        label: 'Delegation Min Confidence',
        description: 'Minimum model confidence before accepting model-routed delegations.',
        kind: 'number',
        min: 0,
        step: 0.05
      },
      {
        path: 'policy.autoDelegation.timeoutMs',
        label: 'Delegation Router Timeout (ms)',
        description: 'Max time allowed for model-based delegation planning.',
        kind: 'number',
        min: 1000,
        step: 500
      },
      {
        path: 'policy.autoDelegation.maxTargets',
        label: 'Delegation Max Targets',
        description: 'Maximum subagents selected per delegated request.',
        kind: 'number',
        min: 1,
        step: 1
      }
    ]
  },
  {
    id: 'operations',
    title: 'Operations',
    description: 'Observability, office layout defaults, and persistence.',
    fields: [
      {
        path: 'observability.eventBufferSize',
        label: 'Event Buffer Size',
        description: 'Maximum retained runtime events.',
        kind: 'number',
        min: 50,
        step: 10
      },
      {
        path: 'observability.metricsWindowSec',
        label: 'Metrics Window (sec)',
        description: 'Rolling metrics window.',
        kind: 'number',
        min: 5,
        step: 5
      },
      { path: 'office.enabled', label: 'Office Enabled', description: 'Enable virtual office presence view.', kind: 'boolean' },
      {
        path: 'office.defaultLayoutName',
        label: 'Default Office Layout',
        description: 'Default office layout name.',
        kind: 'text',
        placeholder: 'Main Ops Floor'
      },
      {
        path: 'persistence.sqlitePath',
        label: 'SQLite Path',
        description: 'Control-plane SQLite database location.',
        kind: 'text',
        placeholder: '.ops/state/control-plane.db',
        fullWidth: true
      }
    ]
  },
  {
    id: 'housekeeping',
    title: 'Housekeeping',
    description: 'Aggressive automatic retention and pruning policy.',
    fields: [
      { path: 'housekeeping.enabled', label: 'Enabled', description: 'Enable automatic cleanup scheduler.', kind: 'boolean' },
      {
        path: 'housekeeping.intervalSec',
        label: 'Interval (sec)',
        description: 'Scheduler cadence for automatic pruning.',
        kind: 'number',
        min: 60,
        step: 60
      },
      {
        path: 'housekeeping.sessionRetentionHours.delegate',
        label: 'Delegate Sessions (h)',
        description: 'Retention for delegated worker sessions.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.sessionRetentionHours.dashboard',
        label: 'Dashboard Sessions (h)',
        description: 'Retention for dashboard-created internal sessions.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.sessionRetentionHours.agent',
        label: 'Agent Sessions (h)',
        description: 'Retention for profile-spawned internal sessions.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.sessionRetentionHours.internal',
        label: 'Internal Sessions (h)',
        description: 'Fallback retention for internal sessions.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.sessionRetentionHours.telegram',
        label: 'Telegram Sessions (h)',
        description: 'Retention for Telegram-linked sessions.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.sessionRetentionHours.office',
        label: 'Office Sessions (h)',
        description: 'Retention for office/internal anchor sessions.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.sessionRetentionHours.unknown',
        label: 'Unknown Sessions (h)',
        description: 'Fallback retention for unknown session patterns.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.runRetentionHours',
        label: 'Run Retention (h)',
        description: 'Retention for completed/failed/aborted runs.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.messageRetentionHours',
        label: 'Message Retention (h)',
        description: 'Retention for inbound/outbound chat messages.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.realtimeRetentionHours',
        label: 'Realtime Retention (h)',
        description: 'Retention for realtime event stream rows.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.officePresenceRetentionHours',
        label: 'Presence Retention (h)',
        description: 'Retention for office presence snapshots.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.llmUsageRetentionDays',
        label: 'LLM Usage Retention (d)',
        description: 'Retention for cost/usage event rows.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.memoryRetentionDays',
        label: 'Structured Memory Retention (d)',
        description: 'Retention for structured memory items.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.auditRetentionDays',
        label: 'Audit Retention (d)',
        description: 'Retention for audit log rows.',
        kind: 'number',
        min: 1,
        step: 1
      },
      {
        path: 'housekeeping.protectedSessionKeys',
        label: 'Protected Session Keys',
        description: 'Comma-separated session keys never auto-pruned.',
        kind: 'csv',
        placeholder: 'office:ceo-hq',
        fullWidth: true
      }
    ]
  }
];

function prettyJson(input: Record<string, unknown>): string {
  return JSON.stringify(input, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPathValue(payload: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let cursor: unknown = payload;
  for (const segment of segments) {
    if (!isRecord(cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function setPathValue(payload: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const next = structuredClone(payload);
  const segments = path.split('.');
  let cursor = next;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const child = cursor[segment];
    if (!isRecord(child)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }

  const tail = segments[segments.length - 1];
  cursor[tail] = value;
  return next;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCsv(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }
  return value
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0)
    .join(', ');
}

function fromCsv(value: string): string[] {
  return value
    .split(',')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function toKeyValueLines(value: unknown): string {
  if (!isRecord(value)) {
    return '';
  }

  return Object.entries(value)
    .map(([key, entry]) => `${key}:${String(entry)}`)
    .join('\n');
}

function fromKeyValueLines(value: string): Record<string, number> {
  const output: Record<string, number> = {};
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const [keyRaw, valueRaw] = line.split(':');
    const key = keyRaw?.trim();
    if (!key) {
      continue;
    }

    const parsed = Number((valueRaw ?? '').trim());
    output[key] = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  }

  return output;
}

function describeSecretState(meta: RuntimeConfigState['sensitive'][string] | undefined): string {
  if (!meta || !meta.configured) {
    return 'Not configured.';
  }

  if (meta.source === 'vault') {
    return 'Configured from Vault (hidden).';
  }
  if (meta.source === 'env') {
    return 'Configured from environment reference (hidden).';
  }
  return 'Configured with direct value (hidden).';
}

type ConfigPageState = {
  saving: boolean;
  draft: Record<string, unknown> | null;
  configPath: string | null;
  writable: boolean;
  status: string;
  error: string;
  sensitive: RuntimeConfigState['sensitive'];
  pairingsError: string;
  pairingsBusyKey: string;
  showAdvanced: boolean;
  advancedText: string;
  syncedDraftSignature: string | null;
};

type ConfigPageAction = {
  type: 'patch';
  patch: Partial<ConfigPageState>;
};

const INITIAL_CONFIG_PAGE_STATE: ConfigPageState = {
  saving: false,
  draft: null,
  configPath: null,
  writable: false,
  status: '',
  error: '',
  sensitive: {},
  pairingsError: '',
  pairingsBusyKey: '',
  showAdvanced: false,
  advancedText: '',
  syncedDraftSignature: null
};

function configPageReducer(state: ConfigPageState, action: ConfigPageAction): ConfigPageState {
  switch (action.type) {
    case 'patch':
      return {
        ...state,
        ...action.patch
      };
    default:
      return state;
  }
}

function useConfigPageModel() {
  const token = useAppStore((state) => state.token);
  const queryClient = useQueryClient();
  const [pageState, dispatchPageState] = useReducer(configPageReducer, INITIAL_CONFIG_PAGE_STATE);
  const {
    saving,
    draft,
    configPath,
    writable,
    status,
    error,
    sensitive,
    pairingsError,
    pairingsBusyKey,
    showAdvanced,
    advancedText,
    syncedDraftSignature
  } = pageState;
  const runtimeConfigResult = useQuery(runtimeConfigQueryOptions(token));
  const pairingsResult = useQuery(pairingsQueryOptions(token));
  const loading = runtimeConfigResult.isLoading;
  const pairings = useMemo(
    () => (pairingsResult.data ?? []).filter((row): row is PairingRow => row.channel === 'telegram'),
    [pairingsResult.data]
  );
  const pairingsLoading = pairingsResult.isLoading || pairingsResult.isFetching;

  const parsedAdvanced = useMemo(() => {
    if (advancedText.trim().length === 0) {
      return { ok: false, parsed: null as Record<string, unknown> | null };
    }

    try {
      return { ok: true, parsed: JSON.parse(advancedText) as Record<string, unknown> };
    } catch {
      return { ok: false, parsed: null as Record<string, unknown> | null };
    }
  }, [advancedText]);
  const secretSourceCounts = useMemo(
    () =>
      Object.values(sensitive).reduce(
        (acc, meta) => {
          if (!meta?.configured) {
            return acc;
          }
          acc[meta.source] += 1;
          return acc;
        },
        {
          unset: 0,
          plain: 0,
          env: 0,
          vault: 0
        } satisfies Record<'unset' | 'plain' | 'env' | 'vault', number>
      ),
    [sensitive]
  );
  const headerMetrics = useMemo<CardMetric[]>(
    () => [
      {
        id: 'config_sections',
        label: 'Sections',
        value: CONFIG_SECTIONS.length,
        displayValue: clampCount(CONFIG_SECTIONS.length),
        tone: 'neutral'
      },
      {
        id: 'config_writable',
        label: 'Config File',
        value: writable ? 1 : 0,
        displayValue: writable ? 'Writable' : 'Read-only',
        tone: writable ? 'positive' : 'warn'
      },
      {
        id: 'config_vault_sources',
        label: 'Vault Sourced',
        value: secretSourceCounts.vault,
        displayValue: clampCount(secretSourceCounts.vault),
        tone: secretSourceCounts.vault > 0 ? 'positive' : 'neutral'
      },
      {
        id: 'config_plain_sources',
        label: 'Direct Values',
        value: secretSourceCounts.plain,
        displayValue: clampCount(secretSourceCounts.plain),
        tone: secretSourceCounts.plain > 0 ? 'warn' : 'neutral'
      },
      {
        id: 'pairing_requests',
        label: 'Pending Pairings',
        value: pairings.length,
        displayValue: clampCount(pairings.length),
        tone: pairings.length > 0 ? 'warn' : 'neutral'
      }
    ],
    [pairings.length, secretSourceCounts.plain, secretSourceCounts.vault, writable]
  );

  useRouteHeaderMetrics(headerMetrics);

  const patchPageState = useCallback((patch: Partial<ConfigPageState>) => {
    dispatchPageState({ type: 'patch', patch });
  }, []);

  useEffect(() => {
    if (!runtimeConfigResult.data) {
      return;
    }
    const payload = runtimeConfigResult.data;
    const nextSignature = JSON.stringify(payload.config);
    const currentDraftSignature = draft ? JSON.stringify(draft) : null;
    const shouldHydrateDraft = draft === null || currentDraftSignature === syncedDraftSignature;
    if (draft === null || currentDraftSignature === syncedDraftSignature) {
      patchPageState({
        draft: payload.config,
        advancedText: prettyJson(payload.config)
      });
    }
    patchPageState({
      draft: shouldHydrateDraft ? payload.config : draft,
      advancedText: shouldHydrateDraft ? prettyJson(payload.config) : advancedText,
      sensitive: payload.sensitive ?? {},
      configPath: payload.configMeta.runtimeConfigPath,
      writable: payload.configMeta.writable,
      syncedDraftSignature: nextSignature,
      error: ''
    });
  }, [advancedText, draft, patchPageState, runtimeConfigResult.data, syncedDraftSignature]);

  useEffect(() => {
    if (!runtimeConfigResult.error) {
      return;
    }
    patchPageState({
      error: runtimeConfigResult.error instanceof Error ? runtimeConfigResult.error.message : 'Failed to load runtime config.'
    });
  }, [patchPageState, runtimeConfigResult.error]);

  useEffect(() => {
    if (!pairingsResult.error) {
      return;
    }
    patchPageState({
      pairingsError: pairingsResult.error instanceof Error ? pairingsResult.error.message : 'Failed to load pairings.'
    });
  }, [pairingsResult.error, patchPageState]);

  const load = useCallback(async (): Promise<void> => {
    patchPageState({
      status: '',
      error: '',
      pairingsError: ''
    });
    await Promise.all([runtimeConfigResult.refetch(), pairingsResult.refetch()]);
  }, [pairingsResult, patchPageState, runtimeConfigResult]);

  const updateField = (path: string, value: unknown): void => {
    patchPageState({
      draft: draft ? setPathValue(draft, path, value) : draft
    });
  };

  const applyAdvancedJson = (): void => {
    if (!parsedAdvanced.ok || !parsedAdvanced.parsed) {
      patchPageState({ error: 'Advanced JSON is invalid.' });
      return;
    }
    patchPageState({
      draft: parsedAdvanced.parsed,
      status: 'Advanced JSON applied to form.',
      error: ''
    });
  };

  const syncAdvancedFromForm = (): void => {
    if (!draft) {
      return;
    }
    patchPageState({
      advancedText: prettyJson(draft),
      status: 'Advanced JSON synced from form.',
      error: ''
    });
  };

  const handleSave = (): void => {
    if (!token) {
      patchPageState({ error: 'Save API token in Settings first.' });
      return;
    }
    if (!draft) {
      patchPageState({ error: 'No config loaded.' });
      return;
    }

    patchPageState({
      saving: true,
      error: '',
      status: ''
    });
    void saveRuntimeConfig(token, draft)
      .then(async (payload) => {
        patchPageState({
          draft: payload.config,
          sensitive: payload.sensitive ?? {},
          configPath: payload.configMeta.runtimeConfigPath,
          writable: payload.configMeta.writable,
          advancedText: prettyJson(payload.config),
          syncedDraftSignature: JSON.stringify(payload.config),
          status: 'Config saved. Restart gateway to apply all components.'
        });
        await invalidateConfigReadQueries(queryClient, token);
      })
      .catch((nextError: unknown) => {
        patchPageState({ error: nextError instanceof Error ? nextError.message : 'Failed to save runtime config.' });
      })
      .finally(() => {
        patchPageState({ saving: false });
      });
  };

  const refreshPairings = useCallback(() => {
    patchPageState({ pairingsError: '' });
    void pairingsResult.refetch();
  }, [pairingsResult, patchPageState]);

  const mutatePairing = useCallback(
    (pairing: PairingRow, action: 'approve' | 'revoke') => {
      if (!token) {
        return;
      }
      const actionKey = `${pairing.channel}:${pairing.senderId}`;
      patchPageState({
        pairingsBusyKey: actionKey,
        pairingsError: ''
      });
      const mutation = action === 'approve' ? approvePairing(pairing.channel, pairing.senderId, token) : revokePairing(pairing.channel, pairing.senderId, token);
      void mutation
        .then(async () => {
          patchPageState({
            status: `${action === 'approve' ? 'Approved' : 'Revoked'} Telegram pairing for ${pairing.senderId}.`
          });
          await invalidateConfigReadQueries(queryClient, token);
        })
        .catch((nextError: unknown) => {
          patchPageState({
            pairingsError: nextError instanceof Error ? nextError.message : `Failed to ${action} pairing.`
          });
        })
        .finally(() => {
          patchPageState({ pairingsBusyKey: '' });
        });
    },
    [patchPageState, queryClient, token]
  );

  return {
    token,
    loading,
    saving,
    draft,
    configPath,
    writable,
    status,
    error,
    pairings,
    pairingsError,
    pairingsBusyKey,
    pairingsLoading,
    showAdvanced,
    advancedText,
    parsedAdvanced,
    sensitive,
    load,
    handleSave,
    refreshPairings,
    mutatePairing,
    toggleAdvanced: () => patchPageState({ showAdvanced: !showAdvanced }),
    setAdvancedText: (value: string) => patchPageState({ advancedText: value }),
    applyAdvancedJson,
    syncAdvancedFromForm,
    renderField: (field: ConfigFieldSpec) =>
      renderConfigField({
        draft,
        sensitive,
        field,
        updateField
      })
  };
}

export function ConfigPage() {
  const {
    token,
    loading,
    saving,
    draft,
    configPath,
    writable,
    status,
    error,
    pairings,
    pairingsError,
    pairingsBusyKey,
    pairingsLoading,
    showAdvanced,
    advancedText,
    parsedAdvanced,
    load,
    handleSave,
    refreshPairings,
    mutatePairing,
    toggleAdvanced,
    setAdvancedText,
    applyAdvancedJson,
    syncAdvancedFromForm,
    renderField
  } = useConfigPageModel();

  return (
    <section className="shell-page shell-page-wide">
      <PageIntro
        eyebrow="Infrastructure"
        title="Control plane"
        description="Use this page for runtime and queue settings. Dashboard auth and local operator checks stay in Access."
        actions={
          <>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !draft || !writable}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-white hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FloppyDisk size={14} weight="duotone" />
              Save Config
            </button>
          </>
        }
        stats={[
          {
            label: 'Sections',
            value: CONFIG_SECTIONS.length
          },
          {
            label: 'Config file',
            value: writable ? 'Writable' : 'Read only',
            tone: writable ? 'positive' : 'warn'
          },
          {
            label: 'Sensitive fields',
            value: 'Hidden'
          }
        ]}
      />

      <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="shell-chip px-2 py-1 text-slate-300">
            <GearSix size={12} weight="duotone" />
            <span className="select-text">path {configPath ?? 'unavailable'}</span>
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${
              writable ? 'border-emerald-700/70 text-emerald-200' : 'border-amber-700/70 text-amber-200'
            }`}
          >
            {writable ? <CheckCircle size={12} weight="duotone" /> : <WarningCircle size={12} weight="duotone" />}
            {writable ? 'writable' : 'read-only'}
          </span>
          <span className="shell-chip px-2 py-1 text-slate-300">
            <LockKey size={12} weight="duotone" />
            secrets hidden
          </span>
        </div>

        {status ? (
          <p className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-950/25 p-3 text-xs text-emerald-200">{status}</p>
        ) : null}
        {error ? <p className="mt-3 rounded-xl border border-rose-700/40 bg-rose-950/25 p-3 text-xs text-rose-200">{error}</p> : null}
      </article>

      {!draft ? (
        <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
          Load runtime config to begin editing.
        </article>
      ) : (
        CONFIG_SECTIONS.map((section, index) => (
          <PageDisclosure
            key={section.id}
            title={section.title}
            description={section.description}
            defaultOpen={index < 2}
            action={<span className="shell-chip px-2 py-1 text-[0.72rem]">{section.fields.length} fields</span>}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{section.fields.map((field) => renderField(field))}</div>
          </PageDisclosure>
        ))
      )}

      <PageDisclosure
        title="Telegram pairings"
        description="Review pending, approved, and revoked Telegram senders without crowding the main config editor."
        action={
          <button
            type="button"
            onClick={refreshPairings}
            disabled={pairingsLoading || !token}
            className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
          >
            Refresh
          </button>
        }
      >
        {pairingsError ? <p className="mt-3 text-xs text-rose-300">{pairingsError}</p> : null}
        {pairingsLoading ? <p className="mt-3 text-sm text-slate-400">Loading pairings…</p> : null}
        {!pairingsLoading && pairings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No Telegram pairings recorded yet.</p>
        ) : null}
        {pairings.length > 0 ? (
          <div className="mt-3 space-y-3">
            {pairings.map((pairing) => {
              const actionKey = `${pairing.channel}:${pairing.senderId}`;
              const busy = pairingsBusyKey === actionKey;
              const statusClass =
                pairing.status === 'approved'
                  ? 'border-emerald-700/60 text-emerald-200'
                  : pairing.status === 'pending'
                    ? 'border-amber-700/60 text-amber-200'
                    : 'border-slate-700/60 text-slate-300';
              return (
                <div key={pairing.id} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100">{pairing.senderHandle || 'Unknown sender'}</span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] ${statusClass}`}>
                          {pairing.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-400">Sender ID: {pairing.senderId}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        Requested {new Date(pairing.requestedAt).toLocaleString()}
                        {pairing.decidedAt ? ` • Decided ${new Date(pairing.decidedAt).toLocaleString()}` : ''}
                        {pairing.decidedBy ? ` • By ${pairing.decidedBy}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!token || busy || pairing.status === 'approved'}
                        onClick={() => mutatePairing(pairing, 'approve')}
                        className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={!token || busy || pairing.status === 'revoked'}
                        onClick={() => mutatePairing(pairing, 'revoke')}
                        className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </PageDisclosure>

      <PageDisclosure
        title="Advanced JSON"
        description="Expert mode only. The form editor remains the default path for day-to-day changes."
        open={showAdvanced}
        onToggle={toggleAdvanced}
      >
        <textarea
          value={advancedText}
          onChange={(event) => setAdvancedText(event.target.value)}
          className="shell-field h-[36dvh] w-full rounded-xl px-3 py-2 font-mono text-xs"
          placeholder="Paste JSON config..."
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={applyAdvancedJson}
            disabled={!parsedAdvanced.ok}
            className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
          >
            Apply JSON To Form
          </button>
          <button
            type="button"
            onClick={syncAdvancedFromForm}
            disabled={!draft}
            className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
          >
            Sync JSON From Form
          </button>
        </div>
      </PageDisclosure>
    </section>
  );
}

function renderConfigField(input: {
  draft: Record<string, unknown> | null;
  sensitive: ConfigPageState['sensitive'];
  field: ConfigFieldSpec;
  updateField: (path: string, value: unknown) => void;
}) {
  const { draft, sensitive, field, updateField } = input;
  if (!draft) {
    return null;
  }

  const value = getPathValue(draft, field.path);
  const secretMeta = field.secret ? sensitive?.[field.path] : undefined;
  const columnClass = field.fullWidth ? 'md:col-span-2' : '';

  if (field.kind === 'boolean') {
    const checked = toBoolean(value);
    return (
      <div key={field.path} className={`p-4 rounded-xl border border-white/5 bg-white/[0.01] ${columnClass}`}>
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-semibold text-slate-100">{field.label}</span>
            <span className="mt-1 block text-sm text-slate-400">{field.description}</span>
          </span>
          <button
            type="button"
            onClick={() => updateField(field.path, !checked)}
            className={`inline-flex h-7 w-14 items-center rounded-full border px-1 transition-colors ${
              checked ? 'border-emerald-600/70 bg-emerald-900/45 justify-end' : 'border-white/10 bg-transparent justify-start'
            }`}
          >
            <span className="h-5 w-5 rounded-full bg-slate-100 shadow" />
          </button>
        </div>
      </div>
    );
  }

  if (field.kind === 'select') {
    const currentValue = typeof value === 'string' ? value : '';
    return (
      <label key={field.path} className={`p-4 rounded-xl border border-white/5 bg-white/[0.01] block ${columnClass}`}>
        <span className="block text-sm font-semibold text-slate-100">{field.label}</span>
        <span className="mt-1 block text-sm text-slate-400">{field.description}</span>
        <select
          value={currentValue}
          onChange={(event) => updateField(field.path, event.target.value)}
          className="shell-field mt-2 w-full rounded-xl px-3 py-2 text-sm"
        >
          {(field.options ?? []).map((option, index) => (
            <option key={buildIndexedKey(field.path, option, index)} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.kind === 'csv') {
    return (
      <label key={field.path} className={`p-4 rounded-xl border border-white/5 bg-white/[0.01] block ${columnClass}`}>
        <span className="block text-sm font-semibold text-slate-100">{field.label}</span>
        <span className="mt-1 block text-sm text-slate-400">{field.description}</span>
        <input
          value={toCsv(value)}
          onChange={(event) => updateField(field.path, fromCsv(event.target.value))}
          className="shell-field mt-2 w-full rounded-xl px-3 py-2 text-sm"
          placeholder={field.placeholder}
        />
      </label>
    );
  }

  if (field.kind === 'kv') {
    return (
      <label key={field.path} className={`p-4 rounded-xl border border-white/5 bg-white/[0.01] block ${columnClass}`}>
        <span className="block text-sm font-semibold text-slate-100">{field.label}</span>
        <span className="mt-1 block text-sm text-slate-400">{field.description}</span>
        <textarea
          value={toKeyValueLines(value)}
          onChange={(event) => updateField(field.path, fromKeyValueLines(event.target.value))}
          className="shell-field mt-2 h-24 w-full rounded-xl px-3 py-2 font-mono text-xs"
          placeholder={field.placeholder}
        />
      </label>
    );
  }

  if (field.kind === 'number') {
    return (
      <label key={field.path} className={`p-4 rounded-xl border border-white/5 bg-white/[0.01] block ${columnClass}`}>
        <span className="block text-sm font-semibold text-slate-100">{field.label}</span>
        <span className="mt-1 block text-sm text-slate-400">{field.description}</span>
        <input
          type="number"
          value={toNumber(value)}
          min={field.min}
          step={field.step ?? 1}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) {
              updateField(field.path, next);
            }
          }}
          className="shell-field mt-2 w-full rounded-xl px-3 py-2 text-sm"
        />
      </label>
    );
  }

  const textValue = typeof value === 'string' ? value : '';
  const visibleValue = textValue === REDACTED_VALUE ? '' : textValue;
  return (
    <label key={field.path} className={`p-4 rounded-xl border border-white/5 bg-white/[0.01] block ${columnClass}`}>
      <span className="block text-sm font-semibold text-slate-100">{field.label}</span>
      <span className="mt-1 block text-sm text-slate-400">{field.description}</span>
      <input
        type={field.secret ? 'password' : 'text'}
        value={visibleValue}
        onChange={(event) => updateField(field.path, event.target.value)}
        className="shell-field mt-2 w-full rounded-xl px-3 py-2 text-sm"
        placeholder={
          field.secret && secretMeta?.configured
            ? 'Hidden. Enter new value/reference to replace.'
            : field.placeholder ?? ''
        }
      />
      {field.secret ? (
        <p className="mt-2 inline-flex items-center gap-1 text-sm text-slate-400">
          <LockKey size={12} weight="duotone" />
          {describeSecretState(secretMeta)}
        </p>
      ) : null}
    </label>
  );
}
