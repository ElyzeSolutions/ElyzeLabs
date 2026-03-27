#!/usr/bin/env -S node
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

type RuntimeKind = 'codex' | 'claude' | 'gemini' | 'process';

interface LlmFallbackTarget {
  runtime: RuntimeKind;
  model: string | null;
}

interface LlmLimitsState {
  providerCallBudgetDaily: Record<string, number>;
  providerCallsPerMinute: Record<string, number>;
  providerCostBudgetUsdDaily: Record<string, number>;
  providerCostBudgetUsdMonthly: Record<string, number>;
  modelCallBudgetDaily: Record<string, number>;
  primaryModelByRuntime: Record<RuntimeKind, string | null>;
  fallbackByRuntime: Record<RuntimeKind, LlmFallbackTarget[]>;
  localHarnessByRuntime: Record<RuntimeKind, boolean>;
  orchestratorPrimaryModelByRuntime: Record<RuntimeKind, string | null>;
  orchestratorFallbackByRuntime: Record<RuntimeKind, LlmFallbackTarget[]>;
  orchestratorLocalHarnessByRuntime: Record<RuntimeKind, boolean>;
}

interface CliArgs {
  command: string;
  runtime?: RuntimeKind;
  model?: string;
  chain?: string;
  policy: 'worker' | 'orchestrator';
  host: string;
  token?: string;
  configPath: string;
}

const RUNTIMES: RuntimeKind[] = ['codex', 'claude', 'gemini', 'process'];

function normalizeModelInput(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const lowered = trimmed.toLowerCase();
  if (lowered === 'default' || lowered === 'none' || lowered === 'null') {
    return null;
  }
  if (
    lowered.startsWith('openrouter/') ||
    lowered.startsWith('openrouter:') ||
    lowered.startsWith('openrouter|') ||
    lowered.startsWith('or:')
  ) {
    const separatorIndex = trimmed.indexOf(':') >= 0 ? trimmed.indexOf(':') : trimmed.indexOf('/');
    const rawRemainder =
      lowered.startsWith('openrouter|') ? trimmed.slice('openrouter|'.length) : separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : trimmed;
    const remainder = rawRemainder.trim();
    if (!remainder) {
      return 'openrouter/openrouter/free';
    }
    return remainder.includes('/') ? `openrouter/${remainder}` : `openrouter/openrouter/${remainder}`;
  }
  return trimmed;
}

function parseRuntime(value: string | undefined): RuntimeKind | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return RUNTIMES.includes(normalized as RuntimeKind) ? (normalized as RuntimeKind) : undefined;
}

function parseFallbackChain(value: string): LlmFallbackTarget[] {
  const tokens = value
    .split(/[,\n]/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const parsed: LlmFallbackTarget[] = [];
  for (const token of tokens) {
    const [runtimeRaw, ...modelParts] = token.split(':');
    const runtime = parseRuntime(runtimeRaw);
    if (!runtime) {
      throw new Error(`Invalid runtime in fallback chain: ${runtimeRaw}`);
    }
    parsed.push({
      runtime,
      model: normalizeModelInput(modelParts.join(':'))
    });
  }
  return parsed;
}

function parseArgs(argv: string[]): CliArgs {
  const output: CliArgs = {
    command: argv[0] ?? 'show',
    policy: 'worker',
    host: process.env.OPS_GATEWAY_URL ?? 'http://127.0.0.1:8788',
    token: process.env.OPS_API_TOKEN,
    configPath: 'config/control-plane.yaml'
  };

  const positional: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if ((token === '--host' || token === '-h') && argv[index + 1]) {
      output.host = argv[index + 1]!;
      index += 1;
      continue;
    }
    if ((token === '--token' || token === '-t') && argv[index + 1]) {
      output.token = argv[index + 1]!;
      index += 1;
      continue;
    }
    if ((token === '--config' || token === '-c') && argv[index + 1]) {
      output.configPath = argv[index + 1]!;
      index += 1;
      continue;
    }
    if (token === '--runtime' && argv[index + 1]) {
      output.runtime = parseRuntime(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--model' && argv[index + 1]) {
      output.model = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--chain' && argv[index + 1]) {
      output.chain = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--policy' && argv[index + 1]) {
      const policy = argv[index + 1]?.trim().toLowerCase();
      if (policy === 'worker' || policy === 'orchestrator' || policy === 'router') {
        output.policy = policy === 'router' ? 'orchestrator' : policy;
      }
      index += 1;
      continue;
    }
    positional.push(token);
  }

  if (!output.runtime && positional[0]) {
    output.runtime = parseRuntime(positional[0]);
  }
  if (!output.model && positional.length > 1) {
    output.model = positional.slice(1).join(' ');
  }
  if (!output.chain && positional.length > 1) {
    output.chain = positional.slice(1).join(' ');
  }

  return output;
}

async function resolveToken(args: CliArgs): Promise<string> {
  if (args.token && args.token.trim().length > 0) {
    return args.token.trim();
  }
  const configPath = path.resolve(args.configPath);
  const raw = await fs.readFile(configPath, 'utf8');
  let parsed: { server?: { apiToken?: string } } = {};
  try {
    parsed = YAML.parse(raw) as { server?: { apiToken?: string } };
  } catch {
    parsed = JSON.parse(raw) as { server?: { apiToken?: string } };
  }
  const token = parsed.server?.apiToken?.trim();
  if (!token) {
    throw new Error('Unable to resolve API token. Provide --token or set server.apiToken in config.');
  }
  return token;
}

async function apiRequest<T>(args: CliArgs, method: string, endpoint: string, body?: unknown): Promise<T> {
  const token = await resolveToken(args);
  const response = await fetch(`${args.host}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-ops-role': 'operator',
      'Content-Type': 'application/json'
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.message === 'string' ? payload.message : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

function formatLimits(limits: LlmLimitsState): string {
  const lines: string[] = ['LLM Routing', '', 'Worker routes'];
  for (const runtime of RUNTIMES) {
    const primary = limits.primaryModelByRuntime[runtime] ?? 'default';
    const fallback = limits.fallbackByRuntime[runtime]
      .map((entry) => `${entry.runtime}:${entry.model ?? 'default'}`)
      .join(', ');
    const localHarness = limits.localHarnessByRuntime[runtime] ? 'on' : 'off';
    lines.push(`${runtime}: primary=${primary}; localHarness=${localHarness}; fallback=${fallback || '(none)'}`);
  }
  lines.push('', 'Orchestrator routes');
  for (const runtime of RUNTIMES) {
    const primary = limits.orchestratorPrimaryModelByRuntime[runtime] ?? 'default';
    const fallback = limits.orchestratorFallbackByRuntime[runtime]
      .map((entry) => `${entry.runtime}:${entry.model ?? 'default'}`)
      .join(', ');
    const localHarness = limits.orchestratorLocalHarnessByRuntime[runtime] ? 'on' : 'off';
    lines.push(`${runtime}: primary=${primary}; localHarness=${localHarness}; fallback=${fallback || '(none)'}`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args.command.toLowerCase();

  if (command === 'help' || command === '--help' || command === '-?') {
    console.log('Usage:');
    console.log('  pnpm llm:config show');
    console.log('  pnpm llm:config primary codex gemini-pro-latest');
    console.log('  pnpm llm:config fallback codex "gemini:gemini-3-flash-preview,process:openrouter/minimax/minimax-m2.5"');
    console.log('  pnpm llm:config primary process gemini-flash-lite-latest --policy orchestrator');
    console.log('Flags: --host --token --config --runtime --model --chain --policy(worker|orchestrator)');
    return;
  }

  const current = await apiRequest<{ limits: LlmLimitsState }>(args, 'GET', '/api/llm/limits');
  const currentLimits = current.limits;

  if (command === 'show') {
    console.log(formatLimits(currentLimits));
    return;
  }

  if (command === 'primary') {
    if (!args.runtime) {
      throw new Error('Missing runtime. Example: primary codex openrouter/minimax/minimax-m2.5');
    }
    const nextModel = normalizeModelInput(args.model);
    if (!nextModel) {
      throw new Error('Primary model is required for every runtime. Provide an explicit model identifier.');
    }
    const nextLimits: LlmLimitsState =
      args.policy === 'orchestrator'
        ? {
            ...currentLimits,
            orchestratorPrimaryModelByRuntime: {
              ...currentLimits.orchestratorPrimaryModelByRuntime,
              [args.runtime]: nextModel
            }
          }
        : {
            ...currentLimits,
            primaryModelByRuntime: {
              ...currentLimits.primaryModelByRuntime,
              [args.runtime]: nextModel
            }
          };
    const updated = await apiRequest<{ limits: LlmLimitsState }>(args, 'PUT', '/api/llm/limits', {
      actor: 'cli',
      limits: nextLimits
    });
    console.log(formatLimits(updated.limits));
    return;
  }

  if (command === 'fallback') {
    if (!args.runtime) {
      throw new Error(
        'Missing runtime. Example: fallback codex "gemini:gemini-3-flash-preview,process:openrouter/minimax/minimax-m2.5"'
      );
    }
    const chain = args.chain ?? '';
    const parsed = parseFallbackChain(chain);
    const nextLimits: LlmLimitsState =
      args.policy === 'orchestrator'
        ? {
            ...currentLimits,
            orchestratorFallbackByRuntime: {
              ...currentLimits.orchestratorFallbackByRuntime,
              [args.runtime]: parsed
            }
          }
        : {
            ...currentLimits,
            fallbackByRuntime: {
              ...currentLimits.fallbackByRuntime,
              [args.runtime]: parsed
            }
          };
    const updated = await apiRequest<{ limits: LlmLimitsState }>(args, 'PUT', '/api/llm/limits', {
      actor: 'cli',
      limits: nextLimits
    });
    console.log(formatLimits(updated.limits));
    return;
  }

  throw new Error(`Unknown command: ${args.command}`);
}

void main();
