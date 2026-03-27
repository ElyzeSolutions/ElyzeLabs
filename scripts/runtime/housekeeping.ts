#!/usr/bin/env -S node
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

interface CliArgs {
  command: 'show' | 'set' | 'run' | 'help';
  path?: string;
  value?: string;
  host: string;
  token?: string;
  configPath: string;
}

function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = [];
  const output: CliArgs = {
    command: 'show',
    host: process.env.OPS_GATEWAY_URL ?? 'http://127.0.0.1:8788',
    token: process.env.OPS_API_TOKEN,
    configPath: 'config/control-plane.yaml'
  };

  for (let index = 0; index < argv.length; index += 1) {
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
    positional.push(token);
  }

  const command = (positional[0] ?? 'show').trim().toLowerCase();
  if (command === 'show' || command === 'run' || command === 'help') {
    output.command = command;
  } else if (command === 'set') {
    output.command = 'set';
    output.path = positional[1];
    output.value = positional[2];
  } else {
    output.command = 'help';
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
    const message = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

function usage(): string {
  return [
    'Usage:',
    '  pnpm ops:housekeeping -- show',
    '  pnpm ops:housekeeping -- set runRetentionHours 12',
    '  pnpm ops:housekeeping -- set sessionRetentionHours.telegram 48',
    '  pnpm ops:housekeeping -- run',
    '',
    'Flags:',
    '  --host <url>    Gateway base URL (default http://127.0.0.1:8788)',
    '  --token <token> API token (or set OPS_API_TOKEN)',
    '  --config <path> Config path used to resolve token fallback'
  ].join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'help') {
    console.log(usage());
    return;
  }

  if (args.command === 'show') {
    const response = await apiRequest<{ housekeeping: Record<string, unknown> }>(args, 'GET', '/api/housekeeping');
    console.log(JSON.stringify(response.housekeeping, null, 2));
    return;
  }

  if (args.command === 'set') {
    if (!args.path || args.path.trim().length === 0 || !args.value || args.value.trim().length === 0) {
      throw new Error('Usage: set <path> <value>');
    }
    const numeric = Number(args.value);
    const value: unknown = Number.isFinite(numeric) ? numeric : args.value;
    const response = await apiRequest<{ changed: Array<{ path: string; value: unknown }> }>(
      args,
      'PATCH',
      '/api/housekeeping/retention',
      {
        actor: 'cli',
        updates: {
          [args.path]: value
        }
      }
    );
    console.log(`Updated ${response.changed.map((entry) => `${entry.path}=${String(entry.value)}`).join(', ')}`);
    return;
  }

  const response = await apiRequest<{ housekeeping: Record<string, unknown> }>(args, 'POST', '/api/housekeeping/run', {
    actor: 'cli'
  });
  console.log(JSON.stringify(response.housekeeping, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
