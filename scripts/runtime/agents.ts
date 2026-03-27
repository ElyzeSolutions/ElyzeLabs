#!/usr/bin/env -S node
import fs from 'node:fs/promises';
import path from 'node:path';

import YAML from 'yaml';

type RuntimeKind = 'codex' | 'claude' | 'gemini' | 'process';
type AgentExecutionMode = 'on_demand' | 'persistent_harness' | 'dispatch_only';
const BROWSER_TOOL_NAME = 'browser:scrapling';

interface AgentProfileRow {
  id: string;
  name: string;
  title: string;
  defaultRuntime: RuntimeKind;
  defaultModel: string | null;
  executionMode: AgentExecutionMode;
  harnessRuntime: RuntimeKind | null;
  harnessAutoStart: boolean;
  harnessSessionName: string | null;
  harnessSessionReady: boolean;
  tools: string[];
  enabled: boolean;
}

interface CliArgs {
  command: string;
  host: string;
  token?: string;
  configPath: string;
  includeDisabled: boolean;
  positional: string[];
}

const RUNTIMES: RuntimeKind[] = ['codex', 'claude', 'gemini', 'process'];
const MODES: AgentExecutionMode[] = ['on_demand', 'persistent_harness', 'dispatch_only'];

function parseRuntime(value: string | undefined): RuntimeKind | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (RUNTIMES.includes(normalized as RuntimeKind)) {
    return normalized as RuntimeKind;
  }
  return null;
}

function parseMode(value: string | undefined): AgentExecutionMode | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (MODES.includes(normalized as AgentExecutionMode)) {
    return normalized as AgentExecutionMode;
  }
  return null;
}

function normalizeModelInput(value: string | undefined): string | null {
  if (!value) {
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

function parseEnabledState(value: string | undefined): boolean | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return null;
  }
  if (['enabled', 'enable', 'true', 'on', '1', 'yes'].includes(normalized)) {
    return true;
  }
  if (['disabled', 'disable', 'false', 'off', '0', 'no'].includes(normalized)) {
    return false;
  }
  return null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: argv[0] ?? 'list',
    host: process.env.OPS_GATEWAY_URL ?? 'http://127.0.0.1:8788',
    token: process.env.OPS_API_TOKEN,
    configPath: 'config/control-plane.yaml',
    includeDisabled: false,
    positional: []
  };

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if ((token === '--host' || token === '-h') && argv[index + 1]) {
      args.host = argv[index + 1]!;
      index += 1;
      continue;
    }
    if ((token === '--token' || token === '-t') && argv[index + 1]) {
      args.token = argv[index + 1]!;
      index += 1;
      continue;
    }
    if ((token === '--config' || token === '-c') && argv[index + 1]) {
      args.configPath = argv[index + 1]!;
      index += 1;
      continue;
    }
    if (token === '--include-disabled') {
      args.includeDisabled = true;
      continue;
    }
    args.positional.push(token);
  }

  return args;
}

async function resolveToken(args: CliArgs): Promise<string> {
  if (args.token && args.token.trim().length > 0) {
    return args.token.trim();
  }

  const configPath = path.resolve(args.configPath);
  const raw = await fs.readFile(configPath, 'utf8');
  let parsed: Record<string, unknown> = {};

  try {
    parsed = YAML.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  }

  const server = parsed.server as Record<string, unknown> | undefined;
  const token = typeof server?.apiToken === 'string' ? server.apiToken.trim() : '';
  if (!token) {
    throw new Error('Unable to resolve API token. Provide --token or set server.apiToken in config.');
  }
  return token;
}

async function apiRequest<T>(args: CliArgs, method: string, endpoint: string, body?: unknown): Promise<T> {
  const token = await resolveToken(args);
  const hasBody = body !== undefined;
  const response = await fetch(`${args.host}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-ops-role': 'operator',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {})
    },
    body: hasBody ? JSON.stringify(body) : undefined
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : typeof payload.message === 'string'
          ? payload.message
          : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

function printAgents(agents: AgentProfileRow[]): void {
  if (agents.length === 0) {
    console.log('No agents found.');
    return;
  }
  const lines = agents.map((agent) => {
    const harnessState =
      agent.executionMode === 'persistent_harness'
        ? `${agent.harnessRuntime ?? 'none'} (${agent.harnessSessionReady ? 'ready' : 'stopped'})`
        : `on-demand (${agent.harnessRuntime ?? 'none'})`;
    return `${agent.id}
  name=${agent.name}
  title=${agent.title}
  mode=${agent.executionMode}
  runtime=${agent.defaultRuntime}
  model=${agent.defaultModel ?? 'default'}
  harness=${harnessState}
  browser=${agent.tools.includes(BROWSER_TOOL_NAME) ? 'enabled' : 'disabled'}
  enabled=${agent.enabled ? 'yes' : 'no'}`;
  });
  console.log(lines.join('\n\n'));
}

function resolveAgent(agents: AgentProfileRow[], query: string): AgentProfileRow | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const slug = (value: string): string =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const exact = agents.find((agent) => agent.id.toLowerCase() === normalized);
  if (exact) {
    return exact;
  }

  const byName = agents.find((agent) => agent.name.toLowerCase() === normalized);
  if (byName) {
    return byName;
  }

  const normalizedSlug = slug(normalized);
  const bySlug = agents.find((agent) => {
    const idSlug = slug(agent.id);
    const nameSlug = slug(agent.name);
    const titleSlug = slug(agent.title);
    return (
      normalizedSlug === idSlug ||
      normalizedSlug === nameSlug ||
      normalizedSlug === titleSlug ||
      (normalizedSlug.length > 0 && nameSlug.startsWith(normalizedSlug))
    );
  });
  if (bySlug) {
    return bySlug;
  }

  return null;
}

async function fetchAgents(args: CliArgs): Promise<AgentProfileRow[]> {
  const payload = await apiRequest<{ agents: AgentProfileRow[] }>(
    args,
    'GET',
    `/api/agents/profiles?includeDisabled=${args.includeDisabled ? 'true' : 'false'}`
  );
  return payload.agents;
}

function printHelp(): void {
  console.log('Usage:');
  console.log('  pnpm agent:config list');
  console.log('  pnpm agent:config show <agent-id-or-name>');
  console.log('  pnpm agent:config set-mode <agent> <on_demand|dispatch_only|persistent_harness>');
  console.log('  pnpm agent:config set-runtime <agent> <codex|claude|gemini|process>');
  console.log('  pnpm agent:config set-model <agent> <model|default>');
  console.log('  pnpm agent:config set-browser <agent> <enabled|disabled>');
  console.log('  pnpm agent:config set-harness <agent> <codex|claude|gemini|process>');
  console.log('  pnpm agent:config start-harness <agent>');
  console.log('  pnpm agent:config stop-harness <agent>');
  console.log('');
  console.log('Flags: --host --token --config --include-disabled');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args.command.toLowerCase();

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const agents = await fetchAgents(args);

  if (command === 'list') {
    printAgents(agents);
    return;
  }

  if (command === 'show') {
    const query = args.positional[0] ?? '';
    const agent = resolveAgent(agents, query);
    if (!agent) {
      throw new Error(`Agent not found: ${query}`);
    }
    printAgents([agent]);
    return;
  }

  const query = args.positional[0] ?? '';
  const agent = resolveAgent(agents, query);
  if (!agent) {
    throw new Error(`Agent not found: ${query}`);
  }

  if (command === 'set-mode') {
    const mode = parseMode(args.positional[1]);
    if (!mode) {
      throw new Error('Invalid mode. Use on_demand or persistent_harness.');
    }
    const payload = await apiRequest<{ agent: AgentProfileRow }>(
      args,
      'PATCH',
      `/api/agents/profiles/${encodeURIComponent(agent.id)}`,
      { executionMode: mode }
    );
    printAgents([payload.agent]);
    return;
  }

  if (command === 'set-runtime') {
    const runtime = parseRuntime(args.positional[1]);
    if (!runtime) {
      throw new Error('Invalid runtime. Use codex|claude|gemini|process.');
    }
    const payload = await apiRequest<{ agent: AgentProfileRow }>(
      args,
      'PATCH',
      `/api/agents/profiles/${encodeURIComponent(agent.id)}`,
      { defaultRuntime: runtime }
    );
    printAgents([payload.agent]);
    return;
  }

  if (command === 'set-model') {
    const nextModel = normalizeModelInput(args.positional.slice(1).join(' '));
    const payload = await apiRequest<{ agent: AgentProfileRow }>(
      args,
      'PATCH',
      `/api/agents/profiles/${encodeURIComponent(agent.id)}`,
      { defaultModel: nextModel }
    );
    printAgents([payload.agent]);
    return;
  }

  if (command === 'set-browser') {
    const enabled = parseEnabledState(args.positional[1]);
    if (enabled === null) {
      throw new Error('Invalid browser state. Use enabled|disabled.');
    }
    const nextTools = enabled
      ? Array.from(new Set([...agent.tools, BROWSER_TOOL_NAME]))
      : agent.tools.filter((tool) => tool !== BROWSER_TOOL_NAME);
    const payload = await apiRequest<{ agent: AgentProfileRow }>(
      args,
      'PATCH',
      `/api/agents/profiles/${encodeURIComponent(agent.id)}`,
      { tools: nextTools }
    );
    printAgents([payload.agent]);
    return;
  }

  if (command === 'set-harness') {
    const runtime = parseRuntime(args.positional[1]);
    if (!runtime) {
      throw new Error('Invalid harness runtime. Use codex|claude|gemini|process.');
    }
    const payload = await apiRequest<{ agent: AgentProfileRow }>(
      args,
      'PATCH',
      `/api/agents/profiles/${encodeURIComponent(agent.id)}`,
      { harnessRuntime: runtime }
    );
    printAgents([payload.agent]);
    return;
  }

  if (command === 'start-harness') {
    const payload = await apiRequest<{ agent: AgentProfileRow | null }>(
      args,
      'POST',
      `/api/agents/profiles/${encodeURIComponent(agent.id)}/harness/start`
    );
    if (!payload.agent) {
      throw new Error('Harness start did not return an updated agent profile.');
    }
    printAgents([payload.agent]);
    return;
  }

  if (command === 'stop-harness') {
    const payload = await apiRequest<{ agent: AgentProfileRow | null }>(
      args,
      'POST',
      `/api/agents/profiles/${encodeURIComponent(agent.id)}/harness/stop`
    );
    if (!payload.agent) {
      throw new Error('Harness stop did not return an updated agent profile.');
    }
    printAgents([payload.agent]);
    return;
  }

  throw new Error(`Unknown command: ${args.command}`);
}

void main();
