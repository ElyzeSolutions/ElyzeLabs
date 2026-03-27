#!/usr/bin/env -S node
import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';

import { loadConfig } from '../../packages/config/src/index.ts';
import { ControlPlaneDatabase } from '../../packages/db/src/index.ts';
import { utcNow } from '../../packages/shared/src/index.ts';

function parseArgs(argv: string[]): {
  out?: string;
  config?: string;
  includeVaultPayload: boolean;
  vaultPassphrase?: string;
} {
  const output: { out?: string; config?: string; includeVaultPayload: boolean; vaultPassphrase?: string } = {
    includeVaultPayload: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if ((token === '--out' || token === '-o') && argv[index + 1]) {
      output.out = argv[index + 1];
      index += 1;
    }
    if ((token === '--config' || token === '-c') && argv[index + 1]) {
      output.config = argv[index + 1];
      index += 1;
    }
    if (token === '--include-vault-payload') {
      output.includeVaultPayload = true;
    }
    if ((token === '--vault-passphrase' || token === '-p') && argv[index + 1]) {
      output.vaultPassphrase = argv[index + 1];
      index += 1;
    }
  }
  return output;
}

function encryptVaultPayload(payload: string, passphrase: string, salt: string, iterations: number): {
  algorithm: string;
  aad: string;
  nonce: string;
  ciphertext: string;
} {
  const key = pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256');
  const nonce = randomBytes(12);
  const aad = 'vault:backup:payload';
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(Buffer.from(payload, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: 'aes-256-gcm',
    aad,
    nonce: nonce.toString('base64'),
    ciphertext: Buffer.concat([encrypted, tag]).toString('base64')
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig({ configPath: args.config ?? 'config/control-plane.yaml' });

  const db = new ControlPlaneDatabase(path.resolve(config.persistence.sqlitePath));
  db.migrate();

  const allTables = db.exportAllTables();
  const vaultSecretsRaw = Array.isArray(allTables.vault_secrets) ? (allTables.vault_secrets as Array<Record<string, unknown>>) : [];
  if ('vault_secrets' in allTables) {
    delete allTables.vault_secrets;
  }

  const vaultMetadata = db.listVaultSecretMetadata(true).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    keyVersion: row.keyVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    rotatedAt: row.rotatedAt,
    revokedAt: row.revokedAt
  }));

  const encryptedVaultPayload =
    args.includeVaultPayload && args.vaultPassphrase
      ? encryptVaultPayload(
          JSON.stringify(vaultSecretsRaw),
          args.vaultPassphrase,
          config.vault.passphraseSalt,
          config.vault.passphraseIterations
        )
      : null;

  if (args.includeVaultPayload && !args.vaultPassphrase) {
    throw new Error('--vault-passphrase is required when --include-vault-payload is set.');
  }

  const snapshot = {
    meta: {
      createdAt: utcNow(),
      schemaVersion: '007_backlog_orchestration_and_github_delivery',
      sqlitePath: path.resolve(config.persistence.sqlitePath)
    },
    data: allTables,
    vault: {
      mode: encryptedVaultPayload ? 'encrypted_export' : 'metadata_only',
      metadata: vaultMetadata,
      encryptedPayload: encryptedVaultPayload
    }
  };

  const outputPath = path.resolve(args.out ?? `backups/control-plane-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  db.close();
  console.log(
    `Backup created at ${outputPath} (vault mode: ${encryptedVaultPayload ? 'encrypted_export' : 'metadata_only'})`
  );
}

void main();
