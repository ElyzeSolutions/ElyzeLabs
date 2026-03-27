#!/usr/bin/env -S node
import fs from 'node:fs/promises';
import path from 'node:path';

import YAML from 'yaml';

interface CliArgs {
  command: string;
  host: string;
  token?: string;
  configPath: string;
  approved: boolean;
  depth?: number;
  name?: string;
  skills: string[];
  positional: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: argv[0] ?? 'show',
    host: process.env.OPS_GATEWAY_URL ?? 'http://127.0.0.1:8788',
    token: process.env.OPS_API_TOKEN,
    configPath: 'config/control-plane.yaml',
    approved: false,
    skills: [],
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
    if (token === '--approved' || token === '-y') {
      args.approved = true;
      continue;
    }
    if (token === '--name' && argv[index + 1]) {
      args.name = argv[index + 1]!;
      index += 1;
      continue;
    }
    if (token === '--skill' && argv[index + 1]) {
      args.skills.push(argv[index + 1]!);
      index += 1;
      continue;
    }
    if (token === '--depth' && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed)) {
        args.depth = Math.max(1, Math.min(12, Math.floor(parsed)));
      }
      index += 1;
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

function printHelp(): void {
  console.log('Usage:');
  console.log('  pnpm skills:config show');
  console.log('  pnpm skills:config catalog-list');
  console.log('  pnpm skills:config catalog-add <path> [--name <name>] --approved');
  console.log('  pnpm skills:config catalog-remove <path> --approved');
  console.log('  pnpm skills:config install <skills.sh-url|owner/repo|github-url> [--skill <name>] --approved');
  console.log('  pnpm skills:config remove <skill-name> --approved');
  console.log('  pnpm skills:config resync --approved');
  console.log('  pnpm skills:config autodiscover [root] --approved [--depth 6]');
  console.log('  pnpm skills:config reload');
  console.log('');
  console.log('Flags: --host --token --config --approved|-y --name --skill --depth');
}

function formatCatalog(payload: {
  catalogBackend?: string;
  catalogStrict: boolean;
  directories: string[];
  entries: Array<{ path: string; name?: string }>;
  skills: Array<{ name: string; version: string; enabled: boolean }>;
}): string {
  const lines: string[] = [];
  lines.push(`catalogBackend: ${payload.catalogBackend ?? 'sqlite'}`);
  lines.push(`catalogStrict: ${payload.catalogStrict ? 'true' : 'false'}`);
  lines.push(`directories: ${payload.directories.join(', ')}`);
  lines.push('');
  lines.push('entries:');
  if (payload.entries.length === 0) {
    lines.push('  (none)');
  } else {
    for (const entry of payload.entries) {
      lines.push(`  - ${entry.path}${entry.name ? ` (name=${entry.name})` : ''}`);
    }
  }
  lines.push('');
  lines.push(`loaded skills: ${payload.skills.length}`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args.command.toLowerCase();

  if (command === 'help' || command === '--help' || command === '-?') {
    printHelp();
    return;
  }

  if (command === 'show' || command === 'catalog-list') {
    const payload = await apiRequest<{
      catalogBackend?: string;
      catalogStrict: boolean;
      directories: string[];
      entries: Array<{ path: string; name?: string }>;
      skills: Array<{ name: string; version: string; enabled: boolean }>;
    }>(args, 'GET', '/api/skills/catalog');
    console.log(formatCatalog(payload));
    return;
  }

  if (command === 'catalog-add') {
    const targetPath = args.positional[0]?.trim();
    if (!targetPath) {
      throw new Error('Missing path. Example: pnpm skills:config catalog-add /abs/path/to/skill --approved');
    }
    const payload = await apiRequest<{
      entries: Array<{ path: string; name?: string }>;
      skills: Array<{ name: string }>;
    }>(args, 'POST', '/api/skills/catalog/entries/upsert', {
      path: targetPath,
      name: args.name?.trim() || undefined,
      approved: args.approved,
      actor: 'cli'
    });
    console.log(`Catalog upserted: ${targetPath}`);
    console.log(`Entries: ${payload.entries.length}; Skills loaded: ${payload.skills.length}`);
    return;
  }

  if (command === 'catalog-remove') {
    const targetPath = args.positional[0]?.trim();
    if (!targetPath) {
      throw new Error('Missing path. Example: pnpm skills:config catalog-remove /abs/path/to/skill --approved');
    }
    const payload = await apiRequest<{
      entries: Array<{ path: string }>;
      skills: Array<{ name: string }>;
    }>(args, 'POST', '/api/skills/catalog/entries/remove', {
      path: targetPath,
      approved: args.approved,
      actor: 'cli'
    });
    console.log(`Catalog entry removed: ${targetPath}`);
    console.log(`Entries: ${payload.entries.length}; Skills loaded: ${payload.skills.length}`);
    return;
  }

  if (command === 'install') {
    const source = args.positional[0]?.trim();
    if (!source) {
      throw new Error(
        'Missing source. Example: pnpm skills:config install https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices --approved'
      );
    }
    const payload = await apiRequest<{
      installation: {
        source: { canonical: string };
        selectedSkills: string[];
        installedSkills: Array<{ name: string }>;
      };
    }>(args, 'POST', '/api/skills/install', {
      source,
      selectedSkills: args.skills,
      approved: args.approved,
      actor: 'cli'
    });
    console.log(`Installed source: ${payload.installation.source.canonical}`);
    if (payload.installation.selectedSkills.length > 0) {
      console.log(`Selected skills: ${payload.installation.selectedSkills.join(', ')}`);
    }
    console.log(`Installed skills: ${payload.installation.installedSkills.map((entry) => entry.name).join(', ') || '(none)'}`);
    return;
  }

  if (command === 'remove') {
    const skillName = args.positional[0]?.trim();
    if (!skillName) {
      throw new Error('Missing skill name. Example: pnpm skills:config remove installed-skill --approved');
    }
    await apiRequest(args, 'POST', '/api/skills/remove', {
      skillName,
      approved: args.approved,
      actor: 'cli'
    });
    console.log(`Removed skill: ${skillName}`);
    return;
  }

  if (command === 'resync') {
    const payload = await apiRequest<{ skills: Array<{ name: string }> }>(args, 'POST', '/api/skills/resync', {
      approved: args.approved,
      actor: 'cli'
    });
    console.log(`Resynced catalog. Loaded skills: ${payload.skills.length}`);
    return;
  }

  if (command === 'autodiscover') {
    const root = args.positional[0]?.trim();
    const payload = await apiRequest<{
      discovery: {
        roots: string[];
        depth: number;
        discoveredDirectories: string[];
        addedEntries: number;
      };
      skills: Array<{ name: string }>;
    }>(args, 'POST', '/api/skills/autodiscover', {
      roots: root ? [root] : undefined,
      depth: args.depth,
      approved: args.approved,
      actor: 'cli'
    });
    console.log(`Autodiscover roots: ${payload.discovery.roots.join(', ')}`);
    console.log(`Discovered directories: ${payload.discovery.discoveredDirectories.length}`);
    console.log(`Added entries: ${payload.discovery.addedEntries}`);
    console.log(`Loaded skills: ${payload.skills.length}`);
    return;
  }

  if (command === 'reload') {
    const payload = await apiRequest<{ count: number }>(args, 'POST', '/api/skills/reload');
    console.log(`Reloaded skills: ${payload.count}`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[skills:config] ${message}`);
  process.exitCode = 1;
});
