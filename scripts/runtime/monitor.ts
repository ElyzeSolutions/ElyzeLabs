#!/usr/bin/env -S node
import process from 'node:process';

interface CliOptions {
  baseUrl: string;
  token: string;
  command: 'list' | 'tail' | 'follow' | 'abort';
  runId?: string;
  since: number;
}

interface ApiEnvelope {
  ok: boolean;
  error?: string;
}

interface TerminalChunk {
  id: string;
  runId: string;
  sessionId: string;
  offset: number;
  chunk: string;
  source: 'stdout' | 'stderr' | 'system';
  createdAt: string;
}

interface RunRecord {
  id: string;
  status: string;
  runtime: string;
  effectiveModel?: string | null;
  createdAt: string;
}

interface TerminalPayload extends ApiEnvelope {
  run: RunRecord;
  terminal: {
    status: 'active' | 'completed' | 'failed' | 'aborted';
    mode: 'direct' | 'tmux' | 'api';
    lastOffset: number;
  } | null;
  chunks: TerminalChunk[];
  nextOffset: number;
}

function usage(): string {
  return [
    'Usage:',
    '  pnpm monitor:runs -- list',
    '  pnpm monitor:runs -- tail <runId>',
    '  pnpm monitor:runs -- follow <runId>',
    '  pnpm monitor:runs -- abort <runId>',
    '',
    'Optional flags:',
    '  --base-url <url>   Gateway base URL (default: http://127.0.0.1:8788)',
    '  --token <token>    API token (or set OPS_API_TOKEN)',
    '  --since <offset>   Starting terminal offset for tail/follow'
  ].join('\n');
}

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  let baseUrl = 'http://127.0.0.1:8788';
  let token = process.env.OPS_API_TOKEN ?? '';
  let since = 0;

  const consumeFlag = (name: string): string | undefined => {
    const index = args.indexOf(name);
    if (index < 0) {
      return undefined;
    }
    const value = args[index + 1];
    args.splice(index, value ? 2 : 1);
    return value;
  };

  const baseUrlArg = consumeFlag('--base-url');
  if (baseUrlArg) {
    baseUrl = baseUrlArg;
  }

  const tokenArg = consumeFlag('--token');
  if (tokenArg) {
    token = tokenArg;
  }

  const sinceArg = consumeFlag('--since');
  if (sinceArg) {
    const parsed = Number(sinceArg);
    since = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  }

  const command = (args[0] ?? '').trim();
  const runId = args[1]?.trim();
  if (!['list', 'tail', 'follow', 'abort'].includes(command)) {
    throw new Error(usage());
  }
  if ((command === 'tail' || command === 'follow' || command === 'abort') && !runId) {
    throw new Error(`Missing runId.\n\n${usage()}`);
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    token,
    command: command as CliOptions['command'],
    runId,
    since
  };
}

async function request<T extends ApiEnvelope>(
  options: CliOptions,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${options.baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token
        ? {
            Authorization: `Bearer ${options.token}`,
            'x-ops-role': 'operator'
          }
        : {}),
      ...(init.headers ?? {})
    }
  });
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!payload || !response.ok || !payload.ok) {
    const message = payload?.error ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function printChunks(chunks: TerminalChunk[]): void {
  for (const chunk of chunks) {
    process.stdout.write(chunk.chunk);
  }
}

async function listRuns(options: CliOptions): Promise<void> {
  const response = await request<ApiEnvelope & { runs: RunRecord[] }>(options, '/api/runs?limit=30');
  if (response.runs.length === 0) {
    console.log('No runs found.');
    return;
  }
  for (const run of response.runs) {
    console.log(
      `${run.id}  status=${run.status.padEnd(12)} runtime=${run.runtime.padEnd(7)} model=${String(run.effectiveModel ?? 'default')}  created=${run.createdAt}`
    );
  }
}

async function tailRun(options: CliOptions, runId: string, since: number): Promise<{ nextOffset: number; active: boolean }> {
  const response = await request<TerminalPayload>(
    options,
    `/api/runs/${encodeURIComponent(runId)}/terminal?since=${String(since)}&limit=1200`
  );
  printChunks(response.chunks);
  if (response.chunks.length === 0) {
    console.log(`No new terminal chunks (status=${response.terminal?.status ?? response.run.status}).`);
  }
  return {
    nextOffset: response.nextOffset,
    active: response.terminal?.status === 'active'
  };
}

async function followRun(options: CliOptions, runId: string, since: number): Promise<void> {
  let offset = since;
  for (;;) {
    const result = await tailRun(options, runId, offset);
    offset = result.nextOffset;
    if (!result.active) {
      console.log('\nTerminal session is no longer active.');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

async function abortRun(options: CliOptions, runId: string): Promise<void> {
  await request<ApiEnvelope>(options, `/api/runs/${encodeURIComponent(runId)}/abort`, {
    method: 'POST',
    body: JSON.stringify({
      reason: 'cli_monitor_abort'
    })
  });
  console.log(`Abort requested for run ${runId}.`);
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  try {
    if (options.command === 'list') {
      await listRuns(options);
      return;
    }
    if (options.command === 'tail') {
      await tailRun(options, options.runId!, options.since);
      return;
    }
    if (options.command === 'follow') {
      await followRun(options, options.runId!, options.since);
      return;
    }
    await abortRun(options, options.runId!);
  } catch (error) {
    console.error(`[monitor] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

void main();
