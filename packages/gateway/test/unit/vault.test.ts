import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';

import { VaultService } from '../../src/vault.js';

describe('vault service', () => {
  it('encrypts secrets at rest and decrypts only through unlocked vault paths', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-vault-unit-'));
    const db = new ControlPlaneDatabase(path.join(root, 'state.db'));
    db.migrate();

    const vault = new VaultService(db, {
      enabled: true,
      passphraseSalt: 'unit-salt',
      passphraseIterations: 10000
    });

    vault.bootstrap('unit-material');
    vault.unlock('unit-material');

    vault.setSecret({
      name: 'telegram.bot_token',
      value: 'token-abc-123',
      category: 'telegram'
    });

    const row = db.getVaultSecret('telegram.bot_token');
    expect(row).toBeDefined();
    expect(row?.ciphertext.includes('token-abc-123')).toBe(false);
    expect(vault.resolveSecret('telegram.bot_token')).toBe('token-abc-123');

    vault.lock();
    expect(() => vault.resolveSecret('telegram.bot_token')).toThrowError(/Vault is locked/i);

    db.close();
  });

  it('detects ciphertext tampering and keeps decryption guarded', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-vault-unit-'));
    const db = new ControlPlaneDatabase(path.join(root, 'state.db'));
    db.migrate();

    const vault = new VaultService(db, {
      enabled: true,
      passphraseSalt: 'unit-salt',
      passphraseIterations: 10000
    });

    vault.bootstrap('unit-material');
    vault.unlock('unit-material');
    vault.setSecret({
      name: 'provider.key',
      value: 'provider-secret',
      category: 'llm'
    });

    const before = db.getVaultSecret('provider.key');
    expect(before).toBeDefined();
    db.db.prepare('UPDATE vault_secrets SET ciphertext = ? WHERE name = ?').run('AAAA', 'provider.key');
    expect(() => vault.resolveSecret('provider.key')).toThrowError();

    db.close();
  });

  it('rotates master key and rewires active secrets without data loss', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-vault-unit-'));
    const db = new ControlPlaneDatabase(path.join(root, 'state.db'));
    db.migrate();

    const vault = new VaultService(db, {
      enabled: true,
      passphraseSalt: 'unit-salt',
      passphraseIterations: 10000
    });

    vault.bootstrap('old-material');
    vault.unlock('old-material');
    vault.setSecret({
      name: 'runtime.token',
      value: 'runtime-secret',
      category: 'runtime'
    });

    const before = db.getVaultSecret('runtime.token');
    expect(before?.keyVersion).toBe(1);

    const rotated = vault.rotateMasterKey('new-material');
    expect(rotated.toVersion).toBeGreaterThan(rotated.fromVersion);

    const after = db.getVaultSecret('runtime.token');
    expect(after?.keyVersion).toBe(rotated.toVersion);
    expect(vault.resolveSecret('runtime.token')).toBe('runtime-secret');

    db.close();
  });
});
