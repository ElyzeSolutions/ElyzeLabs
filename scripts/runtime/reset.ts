#!/usr/bin/env -S node
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig } from '../../packages/config/src/index.ts';

interface CliArgs {
  configPath?: string;
  yes: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = { yes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if ((token === '--config' || token === '-c') && argv[index + 1]) {
      result.configPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--yes' || token === '-y') {
      result.yes = true;
    }
  }
  return result;
}

function isDangerousTarget(target: string, cwd: string): boolean {
  const resolved = path.resolve(target);
  const root = path.parse(resolved).root;
  return resolved === root || resolved === cwd;
}

function removeTarget(target: string): boolean {
  if (!fs.existsSync(target)) {
    return false;
  }
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 });
  return true;
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.configPath ?? 'config/control-plane.yaml';
  const config = loadConfig({ configPath, cwd });

  const stateDir = path.dirname(path.resolve(cwd, config.persistence.sqlitePath));
  const workspaceRoot = path.resolve(cwd, config.runtime.workspaceRoot);
  const memoryDailyDir = path.resolve(cwd, config.memory.dailyMemoryDir);
  const installerRoot = path.resolve(cwd, config.skills.installer.installRoot);
  const logsDir = path.resolve(cwd, '.ops/logs');

  const targets = Array.from(new Set([stateDir, workspaceRoot, memoryDailyDir, installerRoot, logsDir]));
  const unsafeTarget = targets.find((target) => isDangerousTarget(target, cwd));
  if (unsafeTarget) {
    throw new Error(`Refusing to reset dangerous path: ${unsafeTarget}`);
  }

  if (!args.yes) {
    console.log('This command will remove runtime state to restart onboarding from scratch.');
    console.log('');
    console.log('Targets:');
    for (const target of targets) {
      console.log(`- ${target}`);
    }
    console.log('');
    console.log('Re-run with --yes to execute the reset.');
    process.exitCode = 1;
    return;
  }

  let removed = 0;
  for (const target of targets) {
    if (removeTarget(target)) {
      removed += 1;
      console.log(`removed: ${target}`);
    } else {
      console.log(`skipped (not found): ${target}`);
    }
  }

  console.log('');
  console.log(`Reset complete. Removed ${removed} path(s).`);
  console.log('Next: start ElyzeLabs on http://localhost:8788 and complete onboarding from a clean state.');
}

void main();
