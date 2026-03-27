#!/usr/bin/env -S node
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import { loadConfig } from '../../packages/config/src/index.ts';
import { ControlPlaneDatabase } from '../../packages/db/src/index.ts';
import { VaultService } from '../../packages/gateway/src/vault.ts';

function parseArgs(argv: string[]): { command: string; config?: string; material?: string } {
  const output: { command: string; config?: string; material?: string } = {
    command: argv[0] ?? 'status'
  };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if ((token === '--config' || token === '-c') && argv[index + 1]) {
      output.config = argv[index + 1];
      index += 1;
    }
    if ((token === '--material' || token === '-m') && argv[index + 1]) {
      output.material = argv[index + 1];
      index += 1;
    }
  }
  return output;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig({ configPath: args.config ?? 'config/control-plane.yaml' });
  const db = new ControlPlaneDatabase(path.resolve(config.persistence.sqlitePath));
  db.migrate();

  const vault = new VaultService(db, {
    enabled: config.vault.enabled,
    passphraseSalt: config.vault.passphraseSalt,
    passphraseIterations: config.vault.passphraseIterations
  });

  try {
    switch (args.command) {
      case 'keygen': {
        const material = randomBytes(32).toString('base64');
        console.log(material);
        break;
      }
      case 'bootstrap': {
        const material = args.material ?? config.vault.envKey;
        if (!material) {
          throw new Error('Missing material. Provide --material or set vault.envKey.');
        }
        const result = vault.bootstrap(material);
        console.log(`Vault bootstrapped with key version ${result.version}`);
        break;
      }
      case 'unlock': {
        const material = args.material ?? config.vault.envKey;
        if (!material) {
          throw new Error('Missing material. Provide --material or set vault.envKey.');
        }
        const status = vault.unlock(material);
        console.log(`Vault unlocked. Active key version: ${status.activeKeyVersion ?? 'none'}`);
        break;
      }
      case 'rotate-master': {
        const material = args.material;
        if (!material) {
          throw new Error('Missing --material for rotate-master.');
        }
        const unlockMaterial = config.vault.envKey ?? args.material;
        if (unlockMaterial && vault.isInitialized() && vault.isLocked()) {
          vault.unlock(unlockMaterial);
        }
        const result = vault.rotateMasterKey(material);
        console.log(
          `Vault master key rotated from v${result.fromVersion} to v${result.toVersion}; rewired secrets=${result.rewiredSecrets}`
        );
        break;
      }
      case 'status':
      default: {
        console.log(JSON.stringify(vault.status(), null, 2));
      }
    }
  } finally {
    db.close();
  }
}

void main();
