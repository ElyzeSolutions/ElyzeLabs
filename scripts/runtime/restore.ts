#!/usr/bin/env -S node
import fs from 'node:fs';
import path from 'node:path';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';

import { loadConfig } from '../../packages/config/src/index.ts';
import { ControlPlaneDatabase } from '../../packages/db/src/index.ts';

interface BackupFile {
  meta: {
    schemaVersion: string;
    createdAt: string;
  };
  data: Record<string, unknown[]>;
  vault?: {
    mode?: 'metadata_only' | 'encrypted_export';
    encryptedPayload?: {
      algorithm: string;
      aad: string;
      nonce: string;
      ciphertext: string;
    } | null;
  };
}

function parseArgs(argv: string[]): { file?: string; config?: string; vaultPassphrase?: string } {
  const output: { file?: string; config?: string; vaultPassphrase?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if ((token === '--file' || token === '-f') && argv[index + 1]) {
      output.file = argv[index + 1];
      index += 1;
    }
    if ((token === '--config' || token === '-c') && argv[index + 1]) {
      output.config = argv[index + 1];
      index += 1;
    }
    if ((token === '--vault-passphrase' || token === '-p') && argv[index + 1]) {
      output.vaultPassphrase = argv[index + 1];
      index += 1;
    }
  }
  return output;
}

function parseBackup(filePath: string): BackupFile {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as BackupFile;
}

function decryptVaultPayload(input: {
  payload: { aad: string; nonce: string; ciphertext: string };
  passphrase: string;
  salt: string;
  iterations: number;
}): string {
  const key = pbkdf2Sync(input.passphrase, input.salt, input.iterations, 32, 'sha256');
  const data = Buffer.from(input.payload.ciphertext, 'base64');
  const body = data.subarray(0, data.length - 16);
  const tag = data.subarray(data.length - 16);

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(input.payload.nonce, 'base64'));
  decipher.setAAD(Buffer.from(input.payload.aad));
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(body), decipher.final()]);
  return decrypted.toString('utf8');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('Usage: pnpm backup:restore -- --file backups/snapshot.json');
    process.exitCode = 1;
    return;
  }

  const backupPath = path.resolve(args.file);
  const backup = parseBackup(backupPath);

  if (backup.meta.schemaVersion !== '007_backlog_orchestration_and_github_delivery') {
    console.error(
      `Restore blocked: expected schema version 007_backlog_orchestration_and_github_delivery, got ${backup.meta.schemaVersion}`
    );
    process.exitCode = 1;
    return;
  }

  const config = loadConfig({ configPath: args.config ?? 'config/control-plane.yaml' });
  const db = new ControlPlaneDatabase(path.resolve(config.persistence.sqlitePath));
  db.migrate();

  const existingTables = new Set<string>(
    db.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`
      )
      .all()
      .map((row) => String((row as { name: string }).name))
  );

  const transaction = db.db.transaction(() => {
    for (const [table, rows] of Object.entries(backup.data)) {
      if (!existingTables.has(table)) {
        throw new Error(`Restore blocked: unknown table in backup -> ${table}`);
      }

      db.db.prepare(`DELETE FROM ${table}`).run();

      for (const row of rows) {
        const keys = Object.keys(row);
        if (keys.length === 0) {
          continue;
        }

        const placeholders = keys.map(() => '?').join(', ');
        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
        db.db
          .prepare(sql)
          .run(...keys.map((key) => (row as Record<string, unknown>)[key]));
      }
    }
  });

  transaction();

  if (backup.vault?.encryptedPayload) {
    if (!args.vaultPassphrase) {
      console.error('Restore blocked: --vault-passphrase is required for encrypted vault payload import.');
      process.exitCode = 1;
      db.close();
      return;
    }

    const decrypted = decryptVaultPayload({
      payload: backup.vault.encryptedPayload,
      passphrase: args.vaultPassphrase,
      salt: config.vault.passphraseSalt,
      iterations: config.vault.passphraseIterations
    });
    const rows = JSON.parse(decrypted) as Array<Record<string, unknown>>;

    const vaultTransaction = db.db.transaction(() => {
      db.db.prepare('DELETE FROM vault_secrets').run();
      for (const row of rows) {
        const keys = Object.keys(row);
        if (keys.length === 0) {
          continue;
        }
        const placeholders = keys.map(() => '?').join(', ');
        const sql = `INSERT INTO vault_secrets (${keys.join(', ')}) VALUES (${placeholders})`;
        db.db.prepare(sql).run(...keys.map((key) => row[key]));
      }
    });

    vaultTransaction();
  }

  db.close();
  console.log(`Restore completed from ${backupPath}`);
}

void main();
