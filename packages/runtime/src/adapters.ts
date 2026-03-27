/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { RuntimeKind } from '@ops/shared';
import { utcNow } from '@ops/shared';

import { normalizeReasoningEffort, type ReasoningEffort } from './reasoning.js';
import { loadRuntimeCapabilities, runtimeCapabilityById } from './runtime-capabilities.js';
import type {
  ProviderApiCallTrace,
  RuntimeAdapter,
  RuntimeAdapterInput,
  RuntimeAdapterResponse,
  RuntimeToolSessionEvent,
  RuntimeToolSessionHandle
} from './types.js';

interface RuntimeAdapterContext {
  runId: string;
  sessionId: string;
  workspacePath: string;
  prompt: string;
  metadata: Record<string, unknown>;
  onChunk?: (chunk: string, source: 'stdout' | 'stderr') => void;
  terminalMode?: 'direct' | 'tmux';
  terminalSessionName?: string | null;
  maxDurationMs?: number;
}

interface AdapterCommandConfig {
  command: string;
  args: string[];
}

type RuntimeHandle =
  | {
      kind: 'child';
      ref: ReturnType<typeof spawn>;
    }
  | {
      kind: 'tmux';
      sessionName: string;
      aborted: boolean;
    };

const WAITING_MARKERS = ['waiting_input', 'permission needed', 'approve'];
const OPENROUTER_MODEL_PREFIXES = ['openrouter:', 'openrouter/'];
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_OPENROUTER_MODEL = 'minimax/minimax-m2.5';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-pro-preview';
const GOOGLE_PROVIDER_API_ENV_KEYS = ['GOOGLE_API_KEY', 'OPS_GOOGLE_API_KEY'] as const;
const GITHUB_TOKEN_ENV_KEYS = ['OPS_GITHUB_PAT', 'GH_TOKEN', 'GITHUB_TOKEN'] as const;
const GIT_AUTOMATION_CLEAR_KEYS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_TERMINAL_PROMPT',
  'GCM_INTERACTIVE',
  'GIT_SSH_COMMAND',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_CONFIG_COUNT',
  ...Array.from({ length: 16 }, (_, index) => `GIT_CONFIG_KEY_${String(index)}`),
  ...Array.from({ length: 16 }, (_, index) => `GIT_CONFIG_VALUE_${String(index)}`)
] as const;
const GITHUB_GIT_CREDENTIAL_HELPER =
  '!f() { [ "$1" = get ] || exit 0; host=""; while IFS= read -r line; do case "$line" in host=*) host="${line#host=}" ;; esac; done; [ "$host" = "github.com" ] || exit 0; token="${OPS_GITHUB_PAT:-${GH_TOKEN:-${GITHUB_TOKEN:-}}}"; [ -n "$token" ] || exit 0; echo username=x-access-token; echo "password=$token"; }; f';

function commandExists(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) {
    return false;
  }
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [normalized], { stdio: 'ignore' });
  return result.status === 0;
}

function shellQuote(input: string): string {
  return `'${input.replace(/'/g, `'\\''`)}'`;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveTemperature(raw: unknown): number | undefined {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return Math.max(0, Math.min(2, numeric));
}

function resolveStructuredOutputConfig(metadata: Record<string, unknown>): {
  mode: 'json_object' | 'json_schema' | null;
  schema: Record<string, unknown> | null;
  schemaName: string;
} {
  const formatRaw = typeof metadata.responseFormat === 'string' ? metadata.responseFormat.trim().toLowerCase() : '';
  const mode = formatRaw === 'json_object' || formatRaw === 'json_schema' ? formatRaw : null;
  const schema = isRecord(metadata.responseJsonSchema) ? metadata.responseJsonSchema : null;
  const schemaNameRaw = typeof metadata.responseJsonSchemaName === 'string' ? metadata.responseJsonSchemaName.trim() : '';
  return {
    mode,
    schema,
    schemaName: schemaNameRaw || 'structured_output'
  };
}

function shouldRetryWithoutStructuredFormat(status: number, reason: string | null): boolean {
  if (status !== 400 && status !== 422) {
    return false;
  }
  const normalized = (reason ?? '').toLowerCase();
  return (
    normalized.includes('response_format') ||
    normalized.includes('json_schema') ||
    normalized.includes('not supported') ||
    normalized.includes('unsupported')
  );
}

function sanitizeGeminiResponseSchemaNode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeGeminiResponseSchemaNode(entry));
  }
  if (!isRecord(value)) {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    // Gemini `generationConfig.responseSchema` rejects this keyword.
    if (key === 'additionalProperties') {
      continue;
    }
    next[key] = sanitizeGeminiResponseSchemaNode(entry);
  }
  return next;
}

function inferOpenRouterModel(rawModel: unknown): string | null {
  if (typeof rawModel !== 'string') {
    return null;
  }
  const model = rawModel.trim();
  if (!model || model.toLowerCase() === 'default') {
    return null;
  }

  const normalized = model.toLowerCase();
  const normalizeAlias = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    // Polybot-compatible shorthand: openrouter/free -> openrouter/free payload model.
    return trimmed.includes('/') ? trimmed : `openrouter/${trimmed}`;
  };

  for (const prefix of OPENROUTER_MODEL_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      const unwrapped = model.slice(prefix.length).trim();
      return normalizeAlias(unwrapped);
    }
  }

  if (normalized.startsWith('or:')) {
    const unwrapped = model.slice('or:'.length).trim();
    return normalizeAlias(unwrapped);
  }

  if (normalized.startsWith('openrouter|')) {
    const unwrapped = model.slice('openrouter|'.length).trim();
    return normalizeAlias(unwrapped);
  }

  return null;
}

function resolveOpenRouterModel(rawModel: unknown, providerHint: unknown): string | null {
  const provider = typeof providerHint === 'string' ? providerHint.trim().toLowerCase() : '';
  const explicit = inferOpenRouterModel(rawModel);
  if (explicit) {
    return explicit;
  }
  if (provider !== 'openrouter') {
    return null;
  }

  if (typeof rawModel === 'string') {
    const candidate = rawModel.trim();
    if (candidate && candidate.toLowerCase() !== 'default') {
      return candidate;
    }
  }

  const envDefault =
    process.env.OPS_OPENROUTER_DEFAULT_MODEL?.trim() ||
    process.env.OPENROUTER_DEFAULT_MODEL?.trim() ||
    '';
  return envDefault || DEFAULT_OPENROUTER_MODEL;
}

function resolveGeminiModel(rawModel: unknown, providerHint: unknown): string | null {
  const provider = typeof providerHint === 'string' ? providerHint.trim().toLowerCase() : '';
  if (typeof rawModel === 'string') {
    const candidate = rawModel.trim();
    if (candidate && candidate.toLowerCase().startsWith('gemini')) {
      return candidate;
    }
  }
  if (provider !== 'google') {
    return null;
  }
  const envDefault =
    process.env.OPS_GEMINI_DEFAULT_MODEL?.trim() ||
    process.env.GEMINI_DEFAULT_MODEL?.trim() ||
    '';
  return envDefault || DEFAULT_GEMINI_MODEL;
}

function resolveGithubTokenFromEnv(): string | null {
  for (const envKey of GITHUB_TOKEN_ENV_KEYS) {
    const value = process.env[envKey];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function resolveGeminiApiKeyFromEnv(): string | null {
  for (const envKey of GOOGLE_PROVIDER_API_ENV_KEYS) {
    const value = process.env[envKey];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function buildGitAutomationEnvironment(): Record<string, string> {
  const env: Record<string, string> = {
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    GIT_SSH_COMMAND: 'ssh -oBatchMode=yes -oStrictHostKeyChecking=accept-new',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_COUNT: '3',
    GIT_CONFIG_KEY_0: 'url.https://github.com/.insteadof',
    GIT_CONFIG_VALUE_0: 'git@github.com:',
    GIT_CONFIG_KEY_1: 'url.https://github.com/.insteadof',
    GIT_CONFIG_VALUE_1: 'ssh://git@github.com/',
    GIT_CONFIG_KEY_2: 'credential.helper',
    GIT_CONFIG_VALUE_2: GITHUB_GIT_CREDENTIAL_HELPER
  };
  const token = resolveGithubTokenFromEnv();
  if (token) {
    env.OPS_GITHUB_PAT = token;
    env.GH_TOKEN = token;
    env.GITHUB_TOKEN = token;
  }
  return env;
}

function buildRuntimeEnvironment(extraEntries: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of GIT_AUTOMATION_CLEAR_KEYS) {
    delete env[key];
  }
  return {
    ...env,
    ...buildGitAutomationEnvironment(),
    ...extraEntries
  };
}

function buildGitAutomationShellLines(envEntries: Record<string, string>): string[] {
  const lines = GIT_AUTOMATION_CLEAR_KEYS.map((key) => `unset ${key}`);
  for (const [key, value] of Object.entries(envEntries)) {
    lines.push(`export ${key}=${shellQuote(value)}`);
  }
  return lines;
}

function buildTmuxEnvironmentArgs(envEntries: Record<string, string>): string[] {
  const args: string[] = [];
  for (const [key, value] of Object.entries(envEntries)) {
    if (!key || value.length === 0) {
      continue;
    }
    args.push('-e', `${key}=${value}`);
  }
  return args;
}

function resolveRuntimeAdapterBaseDir(metadata: Record<string, unknown>): string {
  const candidate =
    typeof metadata.runtimeAdapterBaseDir === 'string' && metadata.runtimeAdapterBaseDir.trim().length > 0
      ? metadata.runtimeAdapterBaseDir.trim()
      : process.cwd();
  return path.resolve(candidate);
}

function resolveRuntimeAdapterLaunchCommand(config: AdapterCommandConfig, metadata: Record<string, unknown>): string {
  const baseDir = resolveRuntimeAdapterBaseDir(metadata);
  const resolveIfRelative = (value: string): string => {
    if (!value.trim()) {
      return value;
    }
    if (path.isAbsolute(value)) {
      return value;
    }
    if (!value.startsWith('.') && !value.includes(path.sep) && !value.includes('/')) {
      return value;
    }
    return path.resolve(baseDir, value);
  };
  return resolveIfRelative(config.command);
}

function resolveRuntimeAdapterLaunchArgs(args: string[], metadata: Record<string, unknown>): string[] {
  const baseDir = resolveRuntimeAdapterBaseDir(metadata);
  return args.map((entry) => {
    if (!entry.trim() || entry.startsWith('-') || path.isAbsolute(entry)) {
      return entry;
    }
    if (!entry.startsWith('.') && !entry.includes(path.sep) && !entry.includes('/')) {
      return entry;
    }
    const resolved = path.resolve(baseDir, entry);
    return fsSync.existsSync(resolved) ? resolved : entry;
  });
}

function extractOpenRouterText(payload: Record<string, unknown> | null): string {
  if (!payload) {
    return '';
  }
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  if (choices.length === 0) {
    return '';
  }

  const firstChoice = choices[0];
  if (typeof firstChoice !== 'object' || firstChoice === null) {
    return '';
  }
  const message = (firstChoice as Record<string, unknown>).message;
  if (typeof message !== 'object' || message === null) {
    return '';
  }
  const content = (message as Record<string, unknown>).content;

  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const fragments = content
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry;
        }
        if (isRecord(entry)) {
          if (typeof entry.text === 'string') {
            return entry.text;
          }
          if (typeof entry.content === 'string') {
            return entry.content;
          }
          if (typeof entry.value === 'string') {
            return entry.value;
          }
        }
        return '';
      })
      .filter((entry) => entry.trim().length > 0);
    return fragments.join('\n').trim();
  }

  return '';
}

function resolveNativeSkillCallCatalog(metadata: Record<string, unknown>): Array<{
  name: string;
  description: string;
}> {
  const raw = Array.isArray(metadata.nativeSkillCallCatalog) ? metadata.nativeSkillCallCatalog : [];
  return raw
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      if (!name) {
        return null;
      }
      const description = typeof entry.description === 'string' ? entry.description.trim() : '';
      return {
        name,
        description
      };
    })
    .filter((entry): entry is { name: string; description: string } => entry !== null);
}

interface NativeToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

function buildNativeToolDefinitions(metadata: Record<string, unknown>): NativeToolDefinition[] {
  const catalog = resolveNativeSkillCallCatalog(metadata);
  const tools: NativeToolDefinition[] = [];
  if (catalog.length > 0) {
    tools.push({
      name: 'skill_call',
      description:
        'Consult an installed skill runbook before inventing raw commands. Use this when a named skill or exactly one relevant skill should guide the next step.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          skill: {
            type: 'string',
            enum: catalog.map((entry) => entry.name)
          },
          payload: {
            type: 'object',
            additionalProperties: true
          },
          reason: {
            type: 'string'
          }
        },
        required: ['skill']
      }
    });
  }
  if (metadata.nativeCommandToolEnabled === true) {
    tools.push({
      name: 'execute_command',
      description:
        'Execute a direct local command for simple operator tasks like status, health, start, stop, list, or search when a known tool is available. Prefer structured argv for normal commands.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        oneOf: [{ required: ['argv'] }, { required: ['command'] }],
        properties: {
          argv: {
            type: 'array',
            description:
              'Preferred explicit argv form, for example `["polybot", "status"]`. Use this unless shell operators are genuinely required. If a command has one free-form query/path/target argument, keep that full value as one argv item instead of splitting it into multiple words.',
            items: {
              type: 'string'
            },
            minItems: 1
          },
          command: {
            type: 'string',
            description:
              'Compatibility shell-style command string, for example `polybot status`. Use this only when shell syntax such as `||`, `&&`, pipes, redirects, or quoted one-liners is required. Do not use this for ordinary natural-language queries that fit cleanly in argv.'
          },
          cwd: {
            type: 'string',
            description: 'Optional working directory for the command.'
          },
          envProfile: {
            type: 'string',
            enum: ['inherit', 'minimal', 'restricted']
          },
          timeoutMs: {
            type: 'number'
          },
          riskClass: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical']
          },
          approved: {
            type: 'boolean'
          },
          reason: {
            type: 'string'
          }
        }
      }
    });
  }
  return tools;
}

function buildOpenRouterNativeTools(metadata: Record<string, unknown>): Record<string, unknown>[] {
  return buildNativeToolDefinitions(metadata).map((tool) => ({
    type: 'function',
    function: tool
  }));
}

function buildGeminiNativeTools(metadata: Record<string, unknown>): Record<string, unknown>[] {
  const declarations = buildNativeToolDefinitions(metadata);
  if (declarations.length === 0) {
    return [];
  }
  return [
    {
      functionDeclarations: declarations.map((tool) => ({
        ...tool,
        parameters: sanitizeGeminiResponseSchemaNode(tool.parameters)
      }))
    }
  ];
}

function parseRuntimeToolPayload(
  toolName: string,
  rawArguments: unknown
): { payload?: Record<string, unknown>; error?: string } {
  if (isRecord(rawArguments)) {
    return { payload: rawArguments };
  }
  if (typeof rawArguments !== 'string' || rawArguments.trim().length === 0) {
    if (rawArguments === undefined || rawArguments === null) {
      return {};
    }
    return {
      error: `Tool ${toolName} arguments must be an object.`
    };
  }
  try {
    const parsed = JSON.parse(rawArguments) as unknown;
    if (!isRecord(parsed)) {
      return {
        error: `Tool ${toolName} arguments must decode to an object.`
      };
    }
    return { payload: parsed };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildRuntimeToolCallEvent(input: {
  toolName: string;
  callId?: string;
  payload?: Record<string, unknown>;
}): RuntimeToolSessionEvent {
  return {
    type: 'tool_call',
    toolName: input.toolName,
    callId: input.callId,
    ...(input.payload ? { payload: input.payload } : {}),
    native: true
  };
}

function buildRuntimeToolErrorEvent(input: {
  toolName: string;
  callId?: string;
  error: string;
}): RuntimeToolSessionEvent {
  return {
    type: 'tool_error',
    toolName: input.toolName,
    callId: input.callId,
    error: input.error,
    native: true
  };
}

function extractOpenRouterToolEvents(payload: Record<string, unknown> | null): RuntimeToolSessionEvent[] {
  if (!payload) {
    return [];
  }
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0];
  if (!isRecord(firstChoice)) {
    return [];
  }
  const message = isRecord(firstChoice.message) ? firstChoice.message : null;
  if (!message) {
    return [];
  }
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const events: RuntimeToolSessionEvent[] = [];
  for (const entry of toolCalls) {
    if (!isRecord(entry)) {
      continue;
    }
    const functionCall = isRecord(entry.function) ? entry.function : null;
    const toolName = typeof functionCall?.name === 'string' ? functionCall.name.trim() : '';
    if (!toolName) {
      continue;
    }
    const callId = typeof entry.id === 'string' ? entry.id : undefined;
    const parsed = parseRuntimeToolPayload(
      toolName,
      typeof functionCall?.arguments === 'string' ? functionCall.arguments.trim() : undefined
    );
    if (parsed.error) {
      events.push(
        buildRuntimeToolErrorEvent({
          toolName,
          callId,
          error: parsed.error
        })
      );
      continue;
    }
    events.push(
      buildRuntimeToolCallEvent({
        toolName,
        callId,
        payload: parsed.payload
      })
    );
  }
  return events;
}

function parseRuntimeToolSessionHandle(value: unknown): RuntimeToolSessionHandle | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.schema !== 'ops.native-tool-session-handle.v1') {
    return null;
  }
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const runtime = typeof value.runtime === 'string' ? value.runtime.trim() : '';
  if (!id || (runtime !== 'codex' && runtime !== 'claude' && runtime !== 'gemini' && runtime !== 'process')) {
    return null;
  }
  const providerRaw = typeof value.provider === 'string' ? value.provider.trim() : '';
  const provider = providerRaw === 'openrouter' || providerRaw === 'google' ? providerRaw : null;
  const transportRaw = typeof value.transport === 'string' ? value.transport.trim() : '';
  const transport = transportRaw === 'provider_bridge' || transportRaw === 'none' ? transportRaw : 'none';
  const toolSessionModeRaw = typeof value.toolSessionMode === 'string' ? value.toolSessionMode.trim() : '';
  const toolSessionMode =
    toolSessionModeRaw === 'native_tool_session' || toolSessionModeRaw === 'direct_runtime'
      ? toolSessionModeRaw
      : 'direct_runtime';
  const version = Number(value.version);
  const eventCount = Number(value.eventCount);
  return {
    schema: 'ops.native-tool-session-handle.v1',
    id,
    runtime: runtime as RuntimeKind,
    provider,
    model: typeof value.model === 'string' ? value.model.trim() || null : null,
    transport,
    resumable: value.resumable === true,
    version: Number.isFinite(version) && version > 0 ? Math.floor(version) : 1,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : utcNow(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : utcNow(),
    toolSessionMode,
    lastToolName: typeof value.lastToolName === 'string' ? value.lastToolName : null,
    lastToolCallId: typeof value.lastToolCallId === 'string' ? value.lastToolCallId : null,
    eventCount: Number.isFinite(eventCount) && eventCount >= 0 ? Math.floor(eventCount) : 0
  };
}

function buildRuntimeToolSessionHandle(input: {
  existing: RuntimeToolSessionHandle | null;
  runtime: RuntimeKind;
  provider: 'openrouter' | 'google' | null;
  model: string | null;
  toolSessionMode: RuntimeToolSessionHandle['toolSessionMode'];
  transport: RuntimeToolSessionHandle['transport'];
  resumable: boolean;
  events: RuntimeToolSessionEvent[];
}): RuntimeToolSessionHandle {
  const now = utcNow();
  const latestEvent = [...input.events].reverse().find((entry) => entry.type !== 'session_resumed') ?? null;
  return {
    schema: 'ops.native-tool-session-handle.v1',
    id: input.existing?.id ?? randomUUID(),
    runtime: input.runtime,
    provider: input.provider,
    model: input.model,
    transport: input.transport,
    resumable: input.resumable,
    version: (input.existing?.version ?? 0) + 1,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
    toolSessionMode: input.toolSessionMode,
    lastToolName: latestEvent?.toolName ?? input.existing?.lastToolName ?? null,
    lastToolCallId: latestEvent?.callId ?? input.existing?.lastToolCallId ?? null,
    eventCount: (input.existing?.eventCount ?? 0) + input.events.length
  };
}

function extractOpenRouterUsage(payload: Record<string, unknown> | null): RuntimeAdapterResponse['usage'] | undefined {
  if (!payload || typeof payload.usage !== 'object' || payload.usage === null) {
    return undefined;
  }
  const usage = payload.usage as Record<string, unknown>;
  const promptTokens = Number(usage.prompt_tokens);
  const completionTokens = Number(usage.completion_tokens);
  const totalTokens = Number(usage.total_tokens);
  const hasValue = [promptTokens, completionTokens, totalTokens].some((value) => Number.isFinite(value));
  if (!hasValue) {
    return undefined;
  }
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : undefined,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : undefined,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : undefined
  };
}

function extractOpenRouterError(payload: Record<string, unknown> | null): string | null {
  if (!payload) {
    return null;
  }
  if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
    return payload.error.trim();
  }
  if (typeof payload.error === 'object' && payload.error !== null) {
    const maybeMessage = (payload.error as Record<string, unknown>).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim().length > 0) {
      return maybeMessage.trim();
    }
  }
  if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
    return payload.message.trim();
  }
  return null;
}

function extractGeminiText(payload: Record<string, unknown> | null): string {
  if (!payload) {
    return '';
  }
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const first = candidates[0];
  if (typeof first !== 'object' || first === null) {
    return '';
  }
  const content = (first as Record<string, unknown>).content;
  if (typeof content !== 'object' || content === null) {
    return '';
  }
  const parts = Array.isArray((content as Record<string, unknown>).parts)
    ? ((content as Record<string, unknown>).parts as unknown[])
    : [];
  const text = parts
    .map((entry) => (typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>).text : ''))
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .join('\n')
    .trim();
  return text;
}

function extractGeminiToolEvents(payload: Record<string, unknown> | null): RuntimeToolSessionEvent[] {
  if (!payload) {
    return [];
  }
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const first = candidates[0];
  if (!isRecord(first)) {
    return [];
  }
  const content = isRecord(first.content) ? first.content : null;
  if (!content) {
    return [];
  }
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const events: RuntimeToolSessionEvent[] = [];
  for (const entry of parts) {
    if (!isRecord(entry)) {
      continue;
    }
    const functionCall = isRecord(entry.functionCall) ? entry.functionCall : null;
    const toolName = typeof functionCall?.name === 'string' ? functionCall.name.trim() : '';
    if (!toolName) {
      continue;
    }
    const callId = typeof functionCall?.id === 'string' ? functionCall.id : undefined;
    const parsed = parseRuntimeToolPayload(toolName, functionCall?.args);
    if (parsed.error) {
      events.push(
        buildRuntimeToolErrorEvent({
          toolName,
          callId,
          error: parsed.error
        })
      );
      continue;
    }
    events.push(
      buildRuntimeToolCallEvent({
        toolName,
        callId,
        payload: parsed.payload
      })
    );
  }
  return events;
}

function extractGeminiUsage(payload: Record<string, unknown> | null): RuntimeAdapterResponse['usage'] | undefined {
  if (!payload || typeof payload.usageMetadata !== 'object' || payload.usageMetadata === null) {
    return undefined;
  }
  const usage = payload.usageMetadata as Record<string, unknown>;
  const promptTokens = Number(usage.promptTokenCount);
  const completionTokens = Number(usage.candidatesTokenCount);
  const totalTokens = Number(usage.totalTokenCount);
  const hasValue = [promptTokens, completionTokens, totalTokens].some((value) => Number.isFinite(value));
  if (!hasValue) {
    return undefined;
  }
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : undefined,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : undefined,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : undefined
  };
}

function extractGeminiError(payload: Record<string, unknown> | null): string | null {
  if (!payload) {
    return null;
  }
  if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
    return payload.error.trim();
  }
  if (typeof payload.error === 'object' && payload.error !== null) {
    const maybeMessage = (payload.error as Record<string, unknown>).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim().length > 0) {
      return maybeMessage.trim();
    }
  }
  if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
    return payload.message.trim();
  }
  return null;
}

class ProcessBackedAdapter implements RuntimeAdapter {
  private readonly processes = new Map<string, RuntimeHandle>();

  constructor(
    readonly kind: RuntimeKind,
    private readonly command: AdapterCommandConfig,
    private readonly waitingMode: 'marker' | 'prompt-keyword'
  ) {}

  async launch(request: RuntimeAdapterInput): Promise<RuntimeAdapterResponse> {
    return this.runCommand(toAdapterContext(request));
  }

  async send(request: RuntimeAdapterInput): Promise<RuntimeAdapterResponse> {
    return this.runCommand(toAdapterContext(request));
  }

  async abort(runId: string): Promise<void> {
    const handle = this.processes.get(runId);
    if (!handle) {
      return;
    }

    if (handle.kind === 'child') {
      handle.ref.kill('SIGTERM');
      this.processes.delete(runId);
      return;
    }

    handle.aborted = true;
    await this.killTmuxSession(handle.sessionName);
    this.processes.delete(runId);
  }

  async heartbeat(runId: string): Promise<'running' | 'waiting_input' | 'completed' | 'failed' | 'unknown'> {
    const handle = this.processes.get(runId);
    if (!handle) {
      return 'unknown';
    }

    if (handle.kind === 'child') {
      return handle.ref.killed ? 'failed' : 'running';
    }

    if (handle.aborted) {
      return 'failed';
    }
    return (await this.hasTmuxSession(handle.sessionName)) ? 'running' : 'unknown';
  }

  async resume(request: RuntimeAdapterInput): Promise<RuntimeAdapterResponse> {
    return this.runCommand({
      ...toAdapterContext(request),
      prompt: request.prompt || 'resume'
    });
  }

  private async runCommand(context: RuntimeAdapterContext): Promise<RuntimeAdapterResponse> {
    const syntheticPrompt = context.prompt.trim();
    const metadata = isRecord(context.metadata) ? context.metadata : {};
    const reasoningPreparation = await this.prepareReasoningEffort(context, metadata);
    try {
      const openRouterModel = resolveOpenRouterModel(metadata.model, metadata.provider);
      const geminiModel = resolveGeminiModel(metadata.model, metadata.provider);
      const processCommandFallbackAllowed =
        this.kind === 'process' && metadata.processCommandFallbackAllowed === true;
      const allowProviderApiShortcut =
        (this.kind === 'process' && (openRouterModel !== null || geminiModel !== null)) ||
        metadata.allowProviderApiShortcut === true ||
        metadata.providerApiShortcut === true;
      if (allowProviderApiShortcut) {
        if (openRouterModel) {
          return this.runOpenRouterPrompt(context, syntheticPrompt, openRouterModel);
        }
        if (geminiModel) {
          return this.runGeminiPrompt(context, syntheticPrompt, geminiModel);
        }
      }

      if (this.kind === 'process' && !processCommandFallbackAllowed) {
        return this.processFailClosedResponse(
          'Process runtime requires a provider-backed model route unless the gateway explicitly enables local executor fallback.'
        );
      }

      if (!this.command.command) {
        if (this.kind === 'process') {
          return this.processFailClosedResponse(
            'Process runtime local executor fallback was selected, but runtime.adapters.process.command is not configured.'
          );
        }
        return this.mockResponse(syntheticPrompt);
      }

      const commandArgs = this.resolveCommandArgs(context, reasoningPreparation.extraArgs);
      const useTmux = context.terminalMode === 'tmux' && commandExists('tmux');
      if (useTmux) {
        try {
          return await this.runCommandViaTmux(context, syntheticPrompt, commandArgs);
        } catch {
          return this.runCommandDirect(context, syntheticPrompt, commandArgs);
        }
      }

      return this.runCommandDirect(context, syntheticPrompt, commandArgs);
    } finally {
      await reasoningPreparation.cleanup();
    }
  }

  private async runGeminiPrompt(
    context: RuntimeAdapterContext,
    prompt: string,
    model: string
  ): Promise<RuntimeAdapterResponse> {
    const apiKey = resolveGeminiApiKeyFromEnv() ?? '';
    if (!apiKey) {
      return {
        status: 'failed',
        error: 'Gemini model selected, but GOOGLE_API_KEY is not configured.'
      };
    }

    const timeoutMs = context.maxDurationMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = utcNow();
    const metadata = isRecord(context.metadata) ? context.metadata : {};
    const existingToolSessionHandle = parseRuntimeToolSessionHandle(metadata.nativeToolSessionHandle);
    const shouldResumeNativeToolSession =
      metadata.nativeToolSessionResume === true &&
      existingToolSessionHandle?.runtime === this.kind &&
      existingToolSessionHandle.provider === 'google' &&
      existingToolSessionHandle.model === model;
    const structured = resolveStructuredOutputConfig(metadata);
    const temperature = resolveTemperature(metadata.temperature);
    const providerApiCalls: ProviderApiCallTrace[] = [];

    try {
      const nativeTools = buildGeminiNativeTools(metadata);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const requestBody: Record<string, unknown> = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      };
      if (nativeTools.length > 0) {
        requestBody.tools = nativeTools;
        requestBody.toolConfig = {
          functionCallingConfig: {
            mode: 'AUTO'
          }
        };
      }

      if (structured.mode !== null || temperature !== undefined) {
        const generationConfig: Record<string, unknown> = {};
        if (structured.mode !== null) {
          generationConfig.responseMimeType = 'application/json';
        }
        if (structured.mode === 'json_schema' && structured.schema) {
          generationConfig.responseSchema = sanitizeGeminiResponseSchemaNode(structured.schema);
        }
        if (temperature !== undefined) {
          generationConfig.temperature = temperature;
        }
        requestBody.generationConfig = generationConfig;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      const payload = await response.json().catch(() => null);
      const usage = extractGeminiUsage(payload);
      if (!response.ok) {
        const reason = extractGeminiError(payload) ?? `Gemini request failed with HTTP ${response.status}`;
        providerApiCalls.push({
          provider: 'google',
          model,
          status: 'failed',
          error: reason,
          ...(payload ? { raw: JSON.stringify(payload) } : { raw: reason }),
          ...(usage ? { usage } : {})
        });
        return {
          status: 'failed',
          error: reason,
          raw: payload ? JSON.stringify(payload) : reason,
          providerApiCalls
        };
      }

      const toolEvents = extractGeminiToolEvents(payload);
      if (toolEvents.length > 0) {
        const normalizedToolEvents =
          shouldResumeNativeToolSession && existingToolSessionHandle
            ? [
                {
                  type: 'session_resumed',
                  toolName: existingToolSessionHandle.lastToolName ?? 'skill_call',
                  callId: existingToolSessionHandle.lastToolCallId ?? undefined,
                  payload: {
                    handleId: existingToolSessionHandle.id,
                    previousVersion: existingToolSessionHandle.version
                  },
                  summary: `Resumed native tool session ${existingToolSessionHandle.id}.`,
                  native: true
                } satisfies RuntimeToolSessionEvent,
                ...toolEvents
              ]
            : toolEvents;
        const toolSessionHandle = buildRuntimeToolSessionHandle({
          existing: shouldResumeNativeToolSession ? existingToolSessionHandle : null,
          runtime: this.kind,
          provider: 'google',
          model,
          toolSessionMode: 'native_tool_session',
          transport: 'provider_bridge',
          resumable: true,
          events: normalizedToolEvents
        });
        context.onChunk?.(
          `[native_tool_session:${toolSessionHandle.id}] ${toolEvents.map((entry) => entry.toolName).join(', ')}\n`,
          'stdout'
        );
        return {
          status: 'completed',
          summary: `Native tool session requested: ${toolEvents.map((entry) => entry.toolName).join(', ')}`,
          raw: payload
            ? JSON.stringify({
                ts: startedAt,
                model,
                payload
              })
            : 'Native tool session requested.',
          toolSessionMode: 'native_tool_session',
          toolEvents: normalizedToolEvents,
          toolSessionHandle,
          providerApiCalls,
          usage
        };
      }

      const summary = extractGeminiText(payload) || 'Gemini completed with no text output.';
      context.onChunk?.(`${summary}\n`, 'stdout');
      providerApiCalls.push({
        provider: 'google',
        model,
        status: 'completed',
        ...(payload ? { raw: JSON.stringify(payload) } : {}),
        ...(usage ? { usage } : {})
      });

      return {
        status: 'completed',
        summary: summary.slice(0, 4000),
        raw: payload
          ? JSON.stringify({
              ts: startedAt,
              model,
              payload
            })
          : summary,
        toolSessionMode: 'direct_runtime',
        providerApiCalls,
        usage
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fallbackTrace: ProviderApiCallTrace = {
        provider: 'google',
        model,
        status: 'failed',
        error: message,
        raw: message
      };
      return {
        status: 'failed',
        error: `Gemini execution failed: ${message}`,
        providerApiCalls: providerApiCalls.length > 0 ? providerApiCalls : [fallbackTrace]
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async runOpenRouterPrompt(
    context: RuntimeAdapterContext,
    prompt: string,
    model: string
  ): Promise<RuntimeAdapterResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim() || process.env.OPS_OPENROUTER_API_KEY?.trim() || '';
    if (!apiKey) {
      return {
        status: 'failed',
        error: 'OpenRouter model selected, but OPENROUTER_API_KEY is not configured.'
      };
    }

    const timeoutMs = context.maxDurationMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = utcNow();
    const metadata = isRecord(context.metadata) ? context.metadata : {};
    const existingToolSessionHandle = parseRuntimeToolSessionHandle(metadata.nativeToolSessionHandle);
    const shouldResumeNativeToolSession =
      metadata.nativeToolSessionResume === true &&
      existingToolSessionHandle?.runtime === this.kind &&
      existingToolSessionHandle.provider === 'openrouter' &&
      existingToolSessionHandle.model === model;
    const structured = resolveStructuredOutputConfig(metadata);
    const temperature = resolveTemperature(metadata.temperature);
    const providerApiCalls: ProviderApiCallTrace[] = [];

    try {
      const nativeTools = buildOpenRouterNativeTools(metadata);
      const requestBody: Record<string, unknown> = {
        model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      };
      if (nativeTools.length > 0) {
        requestBody.tools = nativeTools;
        requestBody.tool_choice = 'auto';
      }
      if (temperature !== undefined) {
        requestBody.temperature = temperature;
      }
      if (structured.mode === 'json_schema' && structured.schema) {
        requestBody.response_format = {
          type: 'json_schema',
          json_schema: {
            name: structured.schemaName,
            strict: true,
            schema: structured.schema
          }
        };
      } else if (structured.mode === 'json_object') {
        requestBody.response_format = {
          type: 'json_object'
        };
      }

      const sendRequest = async (payloadBody: Record<string, unknown>): Promise<{
        response: Response;
        payload: Record<string, unknown> | null;
      }> => {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPS_OPENROUTER_REFERER ?? 'https://ops-control-plane.local',
            'X-Title': process.env.OPS_OPENROUTER_TITLE ?? 'Ops Control Plane'
          },
          body: JSON.stringify(payloadBody),
          signal: controller.signal
        });
        const payload = await response.json().catch(() => null);
        return { response, payload };
      };

      const captureOpenRouterCall = (response: Response, payload: Record<string, unknown> | null): void => {
        const reason = !response.ok ? extractOpenRouterError(payload) ?? `OpenRouter request failed with HTTP ${response.status}` : undefined;
        const usage = extractOpenRouterUsage(payload);
        providerApiCalls.push({
          provider: 'openrouter',
          model,
          status: response.ok ? 'completed' : 'failed',
          ...(reason ? { error: reason } : {}),
          ...(payload ? { raw: JSON.stringify(payload) } : reason ? { raw: reason } : {}),
          ...(usage ? { usage } : {})
        });
      };

      let { response, payload } = await sendRequest(requestBody);
      captureOpenRouterCall(response, payload);
      if (
        !response.ok &&
        structured.mode !== null &&
        shouldRetryWithoutStructuredFormat(response.status, extractOpenRouterError(payload))
      ) {
        const fallbackBody = { ...requestBody };
        delete fallbackBody.response_format;
        ({ response, payload } = await sendRequest(fallbackBody));
        captureOpenRouterCall(response, payload);
      }

      if (!response.ok) {
        const reason = extractOpenRouterError(payload) ?? `OpenRouter request failed with HTTP ${response.status}`;
        return {
          status: 'failed',
          error: reason,
          raw: payload ? JSON.stringify(payload) : reason,
          providerApiCalls
        };
      }

      const toolEvents = extractOpenRouterToolEvents(payload);
      if (toolEvents.length > 0) {
        const normalizedToolEvents =
          shouldResumeNativeToolSession && existingToolSessionHandle
            ? [
                {
                  type: 'session_resumed',
                  toolName: existingToolSessionHandle.lastToolName ?? 'skill_call',
                  callId: existingToolSessionHandle.lastToolCallId ?? undefined,
                  payload: {
                    handleId: existingToolSessionHandle.id,
                    previousVersion: existingToolSessionHandle.version
                  },
                  summary: `Resumed native tool session ${existingToolSessionHandle.id}.`,
                  native: true
                } satisfies RuntimeToolSessionEvent,
                ...toolEvents
              ]
            : toolEvents;
        const toolSessionHandle = buildRuntimeToolSessionHandle({
          existing: shouldResumeNativeToolSession ? existingToolSessionHandle : null,
          runtime: this.kind,
          provider: 'openrouter',
          model,
          toolSessionMode: 'native_tool_session',
          transport: 'provider_bridge',
          resumable: true,
          events: normalizedToolEvents
        });
        context.onChunk?.(
          `[native_tool_session:${toolSessionHandle.id}] ${toolEvents.map((entry) => entry.toolName).join(', ')}\n`,
          'stdout'
        );
        return {
          status: 'completed',
          summary: `Native tool session requested: ${toolEvents.map((entry) => entry.toolName).join(', ')}`,
          raw: payload
            ? JSON.stringify({
                ts: startedAt,
                model,
                payload
              })
            : 'Native tool session requested.',
          toolSessionMode: 'native_tool_session',
          toolEvents: normalizedToolEvents,
          toolSessionHandle,
          providerApiCalls,
          usage: extractOpenRouterUsage(payload)
        };
      }

      const summary = extractOpenRouterText(payload) || 'OpenRouter completed with no text output.';
      context.onChunk?.(`${summary}\n`, 'stdout');

      return {
        status: 'completed',
        summary: summary.slice(0, 4000),
        raw: payload
          ? JSON.stringify({
              ts: startedAt,
              model,
              payload
            })
          : summary,
        toolSessionMode: 'direct_runtime',
        providerApiCalls,
        usage: extractOpenRouterUsage(payload)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fallbackTrace: ProviderApiCallTrace = {
        provider: 'openrouter',
        model,
        status: 'failed',
        error: message,
        raw: message
      };
      return {
        status: 'failed',
        error: `OpenRouter execution failed: ${message}`,
        providerApiCalls: providerApiCalls.length > 0 ? providerApiCalls : [fallbackTrace]
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async runCommandDirect(
    context: RuntimeAdapterContext,
    prompt: string,
    commandArgs: string[]
  ): Promise<RuntimeAdapterResponse> {
    return new Promise<RuntimeAdapterResponse>((resolve) => {
      const processCommandFallbackAllowed =
        this.kind === 'process' && context.metadata.processCommandFallbackAllowed === true;
      const launchCommand = resolveRuntimeAdapterLaunchCommand(this.command, context.metadata);
      const launchArgs = resolveRuntimeAdapterLaunchArgs(commandArgs, context.metadata);
      let stdout = '';
      let stderr = '';
      let resolved = false;
      const complete = (response: RuntimeAdapterResponse): void => {
        if (resolved) {
          return;
        }
        resolved = true;
        this.processes.delete(context.runId);
        resolve(response);
      };

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(launchCommand, launchArgs, {
          cwd: context.workspacePath,
          env: buildRuntimeEnvironment({
            OPS_RUN_ID: context.runId,
            OPS_SESSION_ID: context.sessionId,
            OPS_RUNTIME: this.kind,
            OPS_RUNTIME_MODEL:
              typeof context.metadata.model === 'string' && context.metadata.model.trim().length > 0
                ? context.metadata.model.trim()
                : 'default',
            OPS_RUNTIME_PROVIDER:
              typeof context.metadata.provider === 'string' && context.metadata.provider.trim().length > 0
                ? context.metadata.provider.trim()
                : 'local'
          }),
          stdio: 'pipe'
        });
      } catch (error) {
        if (processCommandFallbackAllowed) {
          const message = error instanceof Error ? error.message : String(error);
          resolve(this.processFailClosedResponse(`Process runtime local executor failed to launch: ${message}`));
          return;
        }
        resolve(this.mockResponse(prompt));
        return;
      }

      this.processes.set(context.runId, {
        kind: 'child',
        ref: child
      });

      child.stdout?.on('data', (chunk: Buffer) => {
        const value = chunk.toString('utf8');
        stdout += value;
        context.onChunk?.(value, 'stdout');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const value = chunk.toString('utf8');
        stderr += value;
        context.onChunk?.(value, 'stderr');
      });

      child.on('error', (error: Error) => {
        if (processCommandFallbackAllowed) {
          complete(this.processFailClosedResponse(`Process runtime local executor failed to launch: ${error.message}`));
          return;
        }
        complete(this.mockResponse(prompt));
      });

      child.on('close', (code) => {
        complete(this.resolveFinalStatus(prompt, `${stdout}\n${stderr}`.trim(), code));
      });

      const stdin = child.stdin;
      if (stdin) {
        stdin.on('error', (error: Error) => {
          const errno = error as NodeJS.ErrnoException;
          if (errno.code === 'EPIPE') {
            // Child exited before stdin write completed; close handler resolves final status.
            return;
          }
          complete({
            status: 'failed',
            error: `${this.kind} stdin error: ${error.message}`,
            raw: `${stdout}\n${stderr}`.trim()
          });
        });

        try {
          stdin.write(`${prompt}\n`);
          stdin.end();
        } catch (error) {
          const errno = error as NodeJS.ErrnoException;
          if (errno.code !== 'EPIPE') {
            const message = error instanceof Error ? error.message : String(error);
            complete({
              status: 'failed',
              error: `${this.kind} stdin error: ${message}`,
              raw: `${stdout}\n${stderr}`.trim()
            });
          }
        }
      }

      const timeoutMs = context.maxDurationMs ?? DEFAULT_TIMEOUT_MS;
      setTimeout(() => {
        if (resolved) {
          return;
        }
        child.kill('SIGTERM');
        complete({
          status: 'failed',
          error: `${this.kind} execution timeout after ${Math.ceil(timeoutMs / 1000)}s`,
          raw: `${stdout}\n${stderr}`.trim()
        });
      }, timeoutMs);
    });
  }

  private async runCommandViaTmux(
    context: RuntimeAdapterContext,
    prompt: string,
    commandArgs: string[]
  ): Promise<RuntimeAdapterResponse> {
    const runSlug = context.runId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'run';
    const requestedSessionName = context.terminalSessionName?.trim() || `ops-${this.kind}-${runSlug}`;
    const sessionName = requestedSessionName.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 48) || `ops-${runSlug}`;
    const persistentHarness = context.metadata.persistentHarness === true;
    const runtimeDir = path.join(context.workspacePath, '.ops-runtime');
    const outputFile = path.join(runtimeDir, `tmux-${context.runId}.log`);
    const promptFile = path.join(runtimeDir, `prompt-${context.runId}.txt`);
    const statusFile = path.join(runtimeDir, `status-${context.runId}.txt`);
    const scriptFile = path.join(runtimeDir, `launch-${context.runId}.sh`);
    const gitAutomationEnv = buildGitAutomationEnvironment();

    await fs.mkdir(runtimeDir, { recursive: true });
    await fs.writeFile(outputFile, '', 'utf8');
    await fs.writeFile(promptFile, `${prompt}\n`, 'utf8');

    const launchCommand = resolveRuntimeAdapterLaunchCommand(this.command, context.metadata);
    const launchArgs = resolveRuntimeAdapterLaunchArgs(commandArgs, context.metadata);
    const commandScript = [shellQuote(launchCommand), ...launchArgs.map((entry) => shellQuote(entry))].join(' ');
    const script = [
      '#!/usr/bin/env bash',
      'set +e',
      ...buildGitAutomationShellLines(gitAutomationEnv),
      `export OPS_RUN_ID=${shellQuote(context.runId)}`,
      `export OPS_SESSION_ID=${shellQuote(context.sessionId)}`,
      `export OPS_RUNTIME=${shellQuote(this.kind)}`,
      `export OPS_RUNTIME_MODEL=${shellQuote(
        typeof context.metadata.model === 'string' && context.metadata.model.trim().length > 0
          ? context.metadata.model.trim()
          : 'default'
      )}`,
      `${commandScript} < ${shellQuote(promptFile)}`,
      'exit_code=$?',
      `printf "%s" "$exit_code" > ${shellQuote(statusFile)}`,
      'exit "$exit_code"'
    ].join('\n');
    await fs.writeFile(scriptFile, `${script}\n`, { mode: 0o700 });

    if (persistentHarness && (await this.hasTmuxSession(sessionName))) {
      return this.runCommandInExistingTmuxSession(context, prompt, commandArgs, {
        sessionName,
        runtimeDir,
        outputFile,
        promptFile,
        statusFile
      });
    }

    const launchCode = await this.execTmux(
      [
        'new-session',
        '-d',
        ...buildTmuxEnvironmentArgs(gitAutomationEnv),
        '-s',
        sessionName,
        '-c',
        context.workspacePath,
        `bash -lc ${shellQuote(scriptFile)}`
      ],
      context.workspacePath
    );
    if (launchCode !== 0) {
      throw new Error(`Unable to launch tmux session: ${sessionName}`);
    }

    this.processes.set(context.runId, {
      kind: 'tmux',
      sessionName,
      aborted: false
    });

    await this.execTmux(['pipe-pane', '-o', '-t', sessionName, `cat >> ${shellQuote(outputFile)}`], context.workspacePath);

    let offset = 0;
    let output = '';
    const timeoutMs = context.maxDurationMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const handle = this.processes.get(context.runId);
      if (!handle || (handle.kind === 'tmux' && handle.aborted)) {
        await this.killTmuxSession(sessionName);
        return {
          status: 'aborted',
          error: `${this.kind} tmux session aborted by operator`,
          raw: output
        };
      }

      const chunk = await this.readOutputChunk(outputFile, offset);
      if (chunk.chunk.length > 0) {
        offset = chunk.nextOffset;
        output += chunk.chunk;
        context.onChunk?.(chunk.chunk, 'stdout');
      }

      const exitCode = await this.readExitCode(statusFile);
      if (exitCode !== null) {
        const finalChunk = await this.readOutputChunk(outputFile, offset);
        if (finalChunk.chunk.length > 0) {
          offset = finalChunk.nextOffset;
          output += finalChunk.chunk;
          context.onChunk?.(finalChunk.chunk, 'stdout');
        }
        this.processes.delete(context.runId);
        await this.killTmuxSession(sessionName);
        return this.resolveFinalStatus(prompt, output.trim(), exitCode);
      }

      await sleep(250);
    }

    this.processes.delete(context.runId);
    await this.killTmuxSession(sessionName);
    return {
      status: 'failed',
      error: `${this.kind} tmux execution timeout after ${Math.ceil(timeoutMs / 1000)}s`,
      raw: output.trim()
    };
  }

  private async runCommandInExistingTmuxSession(
    context: RuntimeAdapterContext,
    prompt: string,
    commandArgs: string[],
    files: {
      sessionName: string;
      runtimeDir: string;
      outputFile: string;
      promptFile: string;
      statusFile: string;
    }
  ): Promise<RuntimeAdapterResponse> {
    const { sessionName, runtimeDir, outputFile, promptFile, statusFile } = files;
    const gitAutomationEnv = buildGitAutomationEnvironment();
    const scriptFile = path.join(runtimeDir, `send-${context.runId}.sh`);
    const commandScript = [shellQuote(this.command.command), ...commandArgs.map((entry) => shellQuote(entry))].join(' ');
    const script = [
      '#!/usr/bin/env bash',
      'set +e',
      ...buildGitAutomationShellLines(gitAutomationEnv),
      `export OPS_RUN_ID=${shellQuote(context.runId)}`,
      `export OPS_SESSION_ID=${shellQuote(context.sessionId)}`,
      `export OPS_RUNTIME=${shellQuote(this.kind)}`,
      `export OPS_RUNTIME_MODEL=${shellQuote(
        typeof context.metadata.model === 'string' && context.metadata.model.trim().length > 0
          ? context.metadata.model.trim()
          : 'default'
      )}`,
      `${commandScript} < ${shellQuote(promptFile)}`,
      'exit_code=$?',
      `printf "%s" "$exit_code" > ${shellQuote(statusFile)}`
    ].join('\n');
    await fs.writeFile(scriptFile, `${script}\n`, { mode: 0o700 });
    await fs.writeFile(outputFile, '', 'utf8');
    await fs.writeFile(statusFile, '', 'utf8');

    this.processes.set(context.runId, {
      kind: 'tmux',
      sessionName,
      aborted: false
    });

    await this.syncTmuxSessionEnvironment(sessionName, gitAutomationEnv, context.workspacePath);
    await this.execTmux(['pipe-pane', '-t', sessionName, `cat >> ${shellQuote(outputFile)}`], context.workspacePath);

    const sendCommand = `bash -lc ${shellQuote(scriptFile)}`;
    const sendCode = await this.execTmux(['send-keys', '-t', sessionName, sendCommand, 'C-m'], context.workspacePath);
    if (sendCode !== 0) {
      this.processes.delete(context.runId);
      return {
        status: 'failed',
        error: `Unable to dispatch command to persistent harness session: ${sessionName}`
      };
    }

    let offset = 0;
    let output = '';
    const timeoutMs = context.maxDurationMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const handle = this.processes.get(context.runId);
      if (!handle || (handle.kind === 'tmux' && handle.aborted)) {
        await this.execTmux(['send-keys', '-t', sessionName, 'C-c'], context.workspacePath);
        await this.execTmux(['pipe-pane', '-t', sessionName], context.workspacePath);
        this.processes.delete(context.runId);
        return {
          status: 'aborted',
          error: `${this.kind} persistent harness command aborted by operator`,
          raw: output
        };
      }

      const chunk = await this.readOutputChunk(outputFile, offset);
      if (chunk.chunk.length > 0) {
        offset = chunk.nextOffset;
        output += chunk.chunk;
        context.onChunk?.(chunk.chunk, 'stdout');
      }

      const exitCode = await this.readExitCode(statusFile);
      if (exitCode !== null) {
        const finalChunk = await this.readOutputChunk(outputFile, offset);
        if (finalChunk.chunk.length > 0) {
          output += finalChunk.chunk;
          context.onChunk?.(finalChunk.chunk, 'stdout');
        }
        await this.execTmux(['pipe-pane', '-t', sessionName], context.workspacePath);
        this.processes.delete(context.runId);
        return this.resolveFinalStatus(prompt, output.trim(), exitCode);
      }

      await sleep(250);
    }

    await this.execTmux(['send-keys', '-t', sessionName, 'C-c'], context.workspacePath);
    await this.execTmux(['pipe-pane', '-t', sessionName], context.workspacePath);
    this.processes.delete(context.runId);
    return {
      status: 'failed',
      error: `${this.kind} persistent harness timeout after ${Math.ceil(timeoutMs / 1000)}s`,
      raw: output.trim()
    };
  }

  private resolveFinalStatus(prompt: string, output: string, code: number | null): RuntimeAdapterResponse {
    const lower = output.toLowerCase();
    const waitingByOutput = WAITING_MARKERS.some((token) =>
      token === 'approve' ? /\bapprove\b/i.test(output) : lower.includes(token)
    );
    const waitingByPrompt = this.waitingMode === 'prompt-keyword' && /\bapprove\b/i.test(prompt);

    if (waitingByOutput || waitingByPrompt) {
      return {
        status: 'waiting_input',
        waitingPrompt: 'Runtime requested operator approval before continuing.',
        raw: output
      };
    }

    if (code === 0) {
      return {
        status: 'completed',
        summary: output.slice(0, 2000) || `${this.kind} completed successfully`,
        raw: output
      };
    }

    return {
      status: 'failed',
      error: output || `${this.kind} exited with code ${String(code)}`,
      raw: output
    };
  }

  private async readExitCode(statusFile: string): Promise<number | null> {
    try {
      const value = (await fs.readFile(statusFile, 'utf8')).trim();
      if (!value) {
        return null;
      }
      const parsed = Number(value);
      return Number.isInteger(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private async readOutputChunk(outputFile: string, fromOffset: number): Promise<{ chunk: string; nextOffset: number }> {
    try {
      const stat = await fs.stat(outputFile);
      if (stat.size <= fromOffset) {
        return { chunk: '', nextOffset: fromOffset };
      }

      const fd = await fs.open(outputFile, 'r');
      try {
        const length = stat.size - fromOffset;
        const buffer = Buffer.alloc(length);
        await fd.read(buffer, 0, length, fromOffset);
        return {
          chunk: buffer.toString('utf8'),
          nextOffset: stat.size
        };
      } finally {
        await fd.close();
      }
    } catch {
      return {
        chunk: '',
        nextOffset: fromOffset
      };
    }
  }

  private async execTmux(args: string[], cwd: string): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn('tmux', args, {
        cwd,
        env: buildRuntimeEnvironment({}),
        stdio: 'ignore'
      });
      child.on('close', (code) => {
        resolve(code ?? 1);
      });
      child.on('error', () => {
        resolve(1);
      });
    });
  }

  private async syncTmuxSessionEnvironment(
    sessionName: string,
    envEntries: Record<string, string>,
    cwd: string
  ): Promise<void> {
    for (const key of GIT_AUTOMATION_CLEAR_KEYS) {
      await this.execTmux(['set-environment', '-t', sessionName, '-u', key], cwd);
    }
    for (const [key, value] of Object.entries(envEntries)) {
      if (!key || value.length === 0) {
        continue;
      }
      await this.execTmux(['set-environment', '-t', sessionName, key, value], cwd);
    }
  }

  private async hasTmuxSession(sessionName: string): Promise<boolean> {
    const code = await this.execTmux(['has-session', '-t', sessionName], process.cwd());
    return code === 0;
  }

  private async killTmuxSession(sessionName: string): Promise<void> {
    await this.execTmux(['kill-session', '-t', sessionName], process.cwd());
  }

  private async prepareReasoningEffort(
    context: RuntimeAdapterContext,
    metadata: Record<string, unknown>
  ): Promise<{ extraArgs: string[]; cleanup: () => Promise<void> }> {
    const reasoningEffort =
      normalizeReasoningEffort(String(metadata.reasoningEffort ?? '').trim()) ??
      normalizeReasoningEffort(String(metadata.preferredReasoningEffort ?? '').trim());
    if (!reasoningEffort) {
      return {
        extraArgs: [],
        cleanup: async () => {}
      };
    }

    const capabilities = loadRuntimeCapabilities({ rootDir: context.workspacePath });
    const capability = runtimeCapabilityById(capabilities, this.kind);
    if (!capability) {
      return {
        extraArgs: [],
        cleanup: async () => {}
      };
    }

    const support = capability.reasoningEffortSupport;
    if (support.mechanism === 'config_toml' && this.kind === 'codex') {
      const cleanup = await this.injectCodexReasoningConfig(context, reasoningEffort, metadata);
      return {
        extraArgs: [],
        cleanup
      };
    }

    if (support.mechanism === 'flag' && support.flag) {
      return {
        extraArgs: [support.flag, reasoningEffort],
        cleanup: async () => {}
      };
    }

    context.onChunk?.(
      `[runtime] reasoning effort "${reasoningEffort}" is not supported on ${this.kind}; continuing without injection.\n`,
      'stderr'
    );
    return {
      extraArgs: [],
      cleanup: async () => {}
    };
  }

  private async injectCodexReasoningConfig(
    context: RuntimeAdapterContext,
    reasoningEffort: ReasoningEffort,
    metadata: Record<string, unknown>
  ): Promise<() => Promise<void>> {
    const configPath = path.join(context.workspacePath, 'config.toml');
    const startMarker = `# ops_reasoning_start:${context.runId}`;
    const endMarker = `# ops_reasoning_end:${context.runId}`;
    const pattern = new RegExp(`${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}\\n?`, 'g');

    let existing = '';
    let existedBefore = true;
    try {
      existing = await fs.readFile(configPath, 'utf8');
    } catch {
      existedBefore = false;
    }

    const cleaned = existing.replace(pattern, '').trimEnd();
    const planModeRequested = metadata.planMode === true;
    const lines = [
      cleaned,
      startMarker,
      `model_reasoning_effort = "${reasoningEffort}"`,
      ...(planModeRequested ? [`plan_mode_reasoning_effort = "${reasoningEffort}"`] : []),
      endMarker,
      ''
    ]
      .filter((line, index, collection) => !(line === '' && index === 0 && collection.length > 1))
      .join('\n');
    await fs.writeFile(configPath, lines, 'utf8');

    return async () => {
      try {
        const afterRun = await fs.readFile(configPath, 'utf8');
        const restored = afterRun.replace(pattern, '').trim();
        if (!restored) {
          if (existedBefore) {
            await fs.writeFile(configPath, '', 'utf8');
          } else {
            await fs.unlink(configPath).catch(() => undefined);
          }
          return;
        }
        await fs.writeFile(configPath, `${restored}\n`, 'utf8');
      } catch {
        // Cleanup best-effort only.
      }
    };
  }

  private mockResponse(prompt: string): RuntimeAdapterResponse {
    const lower = prompt.toLowerCase();
    const waiting = lower.includes('approve') || lower.includes('permission');

    if (waiting) {
      return {
        status: 'waiting_input',
        waitingPrompt: 'Approval required. Send explicit approval to continue.',
        raw: `[${utcNow()}] ${this.kind} mock waiting_input`
      };
    }

    if (lower.includes('fail')) {
      return {
        status: 'failed',
        error: `${this.kind} mock adapter simulated failure`,
        raw: `[${utcNow()}] ${this.kind} mock failed`
      };
    }

    return {
      status: 'completed',
      summary: `${this.kind} mock adapter completed prompt: ${prompt.slice(0, 160)}`,
      raw: `[${utcNow()}] ${this.kind} mock completed`
    };
  }

  private processFailClosedResponse(message: string): RuntimeAdapterResponse {
    return {
      status: 'failed',
      error: message,
      raw: `[${utcNow()}] process fail_closed`
    };
  }

  private resolveCommandArgs(context: RuntimeAdapterContext, extraArgs: string[] = []): string[] {
    const args = [...extraArgs, ...this.command.args];
    const rawModel = context.metadata.model;
    const model = typeof rawModel === 'string' ? rawModel.trim() : '';
    if (!model || model === 'default') {
      return args;
    }

    const normalized = model.toLowerCase();
    if (
      normalized.startsWith('openrouter:') ||
      normalized.startsWith('openrouter/') ||
      normalized.startsWith('openrouter|') ||
      normalized.startsWith('or:')
    ) {
      return args;
    }

    const hasModelFlag = args.some(
      (token) => token === '-m' || token === '--model' || token.startsWith('--model=')
    );
    if (hasModelFlag) {
      return args;
    }

    if (this.kind === 'codex') {
      return ['-m', model, ...args];
    }
    if (this.kind === 'claude' || this.kind === 'gemini') {
      return ['--model', model, ...args];
    }
    return args;
  }
}

function toAdapterContext(request: RuntimeAdapterInput): RuntimeAdapterContext {
  return {
    runId: request.runId,
    sessionId: request.sessionId,
    workspacePath: request.workspacePath,
    prompt: request.prompt,
    metadata: request.metadata ?? {},
    onChunk: request.onChunk,
    terminalMode: request.terminal?.mode,
    terminalSessionName: request.terminal?.sessionName ?? null,
    maxDurationMs: request.terminal?.maxDurationMs
  };
}

export interface AdapterFactoryConfig {
  codex: AdapterCommandConfig;
  claude: AdapterCommandConfig;
  gemini: AdapterCommandConfig;
  process: AdapterCommandConfig;
}

export function createDefaultAdapters(config: AdapterFactoryConfig): Record<RuntimeKind, RuntimeAdapter> {
  return {
    codex: new ProcessBackedAdapter('codex', config.codex, 'prompt-keyword'),
    claude: new ProcessBackedAdapter('claude', config.claude, 'marker'),
    gemini: new ProcessBackedAdapter('gemini', config.gemini, 'marker'),
    process: new ProcessBackedAdapter('process', config.process, 'marker')
  };
}
