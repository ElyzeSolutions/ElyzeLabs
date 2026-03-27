#!/usr/bin/env -S node
import path from 'node:path';

import { describeConfigError, loadConfig } from '../../packages/config/src/index.ts';

function parseArgs(argv: string[]): { configPath?: string } {
  const result: { configPath?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if ((token === '--config' || token === '-c') && argv[index + 1]) {
      result.configPath = argv[index + 1];
      index += 1;
    }
  }
  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  try {
    const config = loadConfig({ configPath: args.configPath ?? 'config/control-plane.yaml' });
    const summary = {
      configPath: path.resolve(args.configPath ?? 'config/control-plane.yaml'),
      server: `${config.server.host}:${config.server.port}`,
      runtime: config.runtime.defaultRuntime,
      workspaceRoot: path.resolve(config.runtime.workspaceRoot),
      workspaceStrategy: config.runtime.workspaceStrategy,
      sqlitePath: path.resolve(config.persistence.sqlitePath),
      telegramEnabled: config.channel.telegram.enabled,
      queueLanes: config.queue.laneConcurrency,
      embeddingProvider: config.memory.embedding.provider,
      embeddingVectorMode: config.memory.embedding.vectorMode,
      autoRemember: config.memory.autoRemember,
      vault: {
        enabled: config.vault.enabled,
        requireUnlockOnStartup: config.vault.requireUnlockOnStartup,
        autoUnlockFromEnv: config.vault.autoUnlockFromEnv,
        hasEnvKey: Boolean(config.vault.envKey)
      },
      skillCatalogStrict: config.skills.catalogStrict,
      skillInstaller: config.skills.installer
    };

    console.log('Configuration validated successfully.');
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(describeConfigError(error));
    process.exitCode = 1;
  }
}

void main();
