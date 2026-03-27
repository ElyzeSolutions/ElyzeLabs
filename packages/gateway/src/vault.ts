import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';

import type { ControlPlaneDatabase } from '@ops/db';
import type { VaultKeyVersionRecord, VaultSecretMetadataRecord, VaultSecretRecord } from '@ops/shared';
import { parseJsonSafe } from '@ops/shared';

interface VaultServiceOptions {
  enabled: boolean;
  passphraseSalt: string;
  passphraseIterations: number;
}

interface EncryptResult {
  ciphertext: string;
  nonce: string;
}

export interface VaultStatus {
  enabled: boolean;
  initialized: boolean;
  locked: boolean;
  activeKeyVersion: number | null;
  secretCount: number;
  revokedSecretCount: number;
  keyVersions: Array<{ version: number; status: VaultKeyVersionRecord['status']; createdAt: string; revokedAt: string | null }>;
}

export class VaultService {
  private readonly options: VaultServiceOptions;
  private readonly unlockedDekByVersion = new Map<number, Buffer>();

  constructor(
    private readonly database: ControlPlaneDatabase,
    options: VaultServiceOptions
  ) {
    this.options = options;
  }

  isEnabled(): boolean {
    return this.options.enabled;
  }

  isInitialized(): boolean {
    return this.database.listVaultKeyVersions().length > 0;
  }

  isLocked(): boolean {
    if (!this.options.enabled) {
      return false;
    }
    return this.unlockedDekByVersion.size === 0;
  }

  lock(): void {
    this.unlockedDekByVersion.clear();
  }

  bootstrap(material: string): { version: number } {
    if (!this.options.enabled) {
      throw new Error('Vault is disabled.');
    }
    if (this.isInitialized()) {
      throw new Error('Vault already initialized.');
    }

    const kek = this.deriveKek(material);
    const dek = randomBytes(32);
    const wrapped = this.encrypt(kek, dek.toString('base64'), 'vault:dek:v1');
    const created = this.database.createVaultKeyVersion({
      wrappedKey: wrapped.ciphertext,
      wrapNonce: wrapped.nonce,
      wrapAad: 'vault:dek:v1',
      status: 'active',
      rotatedFrom: null
    });
    this.unlockedDekByVersion.set(created.version, dek);
    return { version: created.version };
  }

  unlock(material: string): VaultStatus {
    if (!this.options.enabled) {
      throw new Error('Vault is disabled.');
    }
    const versions = this.database.listVaultKeyVersions();
    if (versions.length === 0) {
      throw new Error('Vault is not initialized.');
    }

    const kek = this.deriveKek(material);
    const nextMap = new Map<number, Buffer>();
    for (const keyVersion of versions) {
      if (keyVersion.status === 'revoked') {
        continue;
      }

      try {
        const raw = this.decrypt(kek, keyVersion.wrappedKey, keyVersion.wrapNonce, keyVersion.wrapAad);
        nextMap.set(keyVersion.version, Buffer.from(raw, 'base64'));
      } catch {
        // Ignore non-decryptable key versions; active version must decrypt.
      }
    }

    const active = this.database.getActiveVaultKeyVersion() ?? versions[0];
    if (!active || !nextMap.has(active.version)) {
      throw new Error('Vault unlock failed: unable to decrypt active key version with supplied material.');
    }

    this.unlockedDekByVersion.clear();
    for (const [version, value] of nextMap.entries()) {
      this.unlockedDekByVersion.set(version, value);
    }
    return this.status();
  }

  status(): VaultStatus {
    const allSecrets = this.database.listVaultSecretMetadata(true);
    const keyVersions = this.database.listVaultKeyVersions();
    const active = keyVersions.find((row) => row.status === 'active') ?? null;
    return {
      enabled: this.options.enabled,
      initialized: keyVersions.length > 0,
      locked: this.isLocked(),
      activeKeyVersion: active?.version ?? null,
      secretCount: allSecrets.filter((item) => item.revokedAt === null).length,
      revokedSecretCount: allSecrets.filter((item) => item.revokedAt !== null).length,
      keyVersions: keyVersions.map((row) => ({
        version: row.version,
        status: row.status,
        createdAt: row.createdAt,
        revokedAt: row.revokedAt
      }))
    };
  }

  listSecretMetadata(includeRevoked = false): VaultSecretMetadataRecord[] {
    return this.database.listVaultSecretMetadata(includeRevoked);
  }

  setSecret(input: {
    name: string;
    value: string;
    category: string;
    metadata?: Record<string, unknown>;
  }): VaultSecretMetadataRecord {
    this.assertUnlocked();
    const active = this.database.getActiveVaultKeyVersion();
    if (!active) {
      throw new Error('No active vault key version.');
    }
    const dek = this.unlockedDekByVersion.get(active.version);
    if (!dek) {
      throw new Error('Active vault key is not unlocked.');
    }

    const secretKey = randomBytes(32);
    const aad = `vault:secret:${input.name}:${input.category}`;
    const encryptedSecret = this.encrypt(secretKey, input.value, aad);
    const wrappedSecretKey = this.encrypt(dek, secretKey.toString('base64'), `vault:wrap:${input.name}:v${active.version}`);

    const updated = this.database.upsertVaultSecret({
      name: input.name,
      category: input.category,
      ciphertext: encryptedSecret.ciphertext,
      cipherNonce: encryptedSecret.nonce,
      cipherAad: aad,
      wrappedKey: wrappedSecretKey.ciphertext,
      wrappedNonce: wrappedSecretKey.nonce,
      keyVersion: active.version,
      metadata: input.metadata
    });

    const metadata = this.database.listVaultSecretMetadata(true).find((item) => item.name === updated.name);
    if (!metadata) {
      throw new Error(`Failed to read metadata for ${updated.name}`);
    }
    return metadata;
  }

  resolveSecret(name: string): string {
    this.assertUnlocked();
    const secret = this.database.getVaultSecret(name);
    if (!secret || secret.revokedAt) {
      throw new Error(`Vault secret not found or revoked: ${name}`);
    }
    return this.decryptSecret(secret);
  }

  rotateSecret(input: {
    name: string;
    nextValue: string;
    metadata?: Record<string, unknown>;
  }): VaultSecretMetadataRecord {
    const existing = this.database.getVaultSecret(input.name);
    if (!existing) {
      throw new Error(`Secret not found: ${input.name}`);
    }
    return this.setSecret({
      name: existing.name,
      value: input.nextValue,
      category: existing.category,
      metadata: {
        ...parseJsonSafe<Record<string, unknown>>(existing.metadataJson, {}),
        ...(input.metadata ?? {}),
        rotatedFromVersion: existing.keyVersion
      }
    });
  }

  revokeSecret(name: string): VaultSecretMetadataRecord {
    const row = this.database.revokeVaultSecret(name);
    if (!row) {
      throw new Error(`Secret not found: ${name}`);
    }
    return row;
  }

  deleteSecret(name: string): void {
    const deleted = this.database.deleteVaultSecret(name);
    if (!deleted) {
      throw new Error(`Secret not found: ${name}`);
    }
  }

  rotateMasterKey(newMaterial: string): { fromVersion: number; toVersion: number; rewiredSecrets: number } {
    this.assertUnlocked();
    const active = this.database.getActiveVaultKeyVersion();
    if (!active) {
      throw new Error('No active key version to rotate.');
    }
    const oldDek = this.unlockedDekByVersion.get(active.version);
    if (!oldDek) {
      throw new Error('Current active key is locked.');
    }

    const newDek = randomBytes(32);
    const kek = this.deriveKek(newMaterial);
    const wrapped = this.encrypt(kek, newDek.toString('base64'), `vault:dek:v${active.version + 1}`);
    const nextVersion = this.database.createVaultKeyVersion({
      wrappedKey: wrapped.ciphertext,
      wrapNonce: wrapped.nonce,
      wrapAad: `vault:dek:v${active.version + 1}`,
      status: 'active',
      rotatedFrom: active.version
    });
    this.database.setVaultKeyVersionStatus(active.version, 'retired');

    let rewiredSecrets = 0;
    const activeSecrets = this.database.listVaultSecretMetadata().map((item) => item.name);
    for (const name of activeSecrets) {
      const secret = this.database.getVaultSecret(name);
      if (!secret || secret.revokedAt) {
        continue;
      }
      const plaintext = this.decryptSecret(secret);
      const secretKey = randomBytes(32);
      const cipher = this.encrypt(secretKey, plaintext, secret.cipherAad);
      const wrappedSecret = this.encrypt(newDek, secretKey.toString('base64'), `vault:wrap:${secret.name}:v${nextVersion.version}`);
      this.database.upsertVaultSecret({
        name: secret.name,
        category: secret.category,
        ciphertext: cipher.ciphertext,
        cipherNonce: cipher.nonce,
        cipherAad: secret.cipherAad,
        wrappedKey: wrappedSecret.ciphertext,
        wrappedNonce: wrappedSecret.nonce,
        keyVersion: nextVersion.version,
        metadata: {
          ...parseJsonSafe<Record<string, unknown>>(secret.metadataJson, {}),
          previousKeyVersion: active.version
        }
      });
      rewiredSecrets += 1;
    }

    this.unlockedDekByVersion.set(nextVersion.version, newDek);
    this.unlockedDekByVersion.set(active.version, oldDek);

    return {
      fromVersion: active.version,
      toVersion: nextVersion.version,
      rewiredSecrets
    };
  }

  exportEncryptedPayload(passphrase: string): string {
    this.assertUnlocked();
    const payload = this.database
      .listVaultSecretMetadata(true)
      .map((row) => this.database.getVaultSecret(row.name))
      .filter((row): row is VaultSecretRecord => row !== undefined);

    const key = this.deriveKek(passphrase);
    const serialized = JSON.stringify(payload);
    const encrypted = this.encrypt(key, serialized, 'vault:backup:payload');
    return JSON.stringify(
      {
        algorithm: 'aes-256-gcm',
        aad: 'vault:backup:payload',
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext
      },
      null,
      2
    );
  }

  importEncryptedPayload(encryptedPayload: string, passphrase: string): { restored: number } {
    this.assertUnlocked();
    const parsed = JSON.parse(encryptedPayload) as {
      aad: string;
      nonce: string;
      ciphertext: string;
    };
    const key = this.deriveKek(passphrase);
    const raw = this.decrypt(key, parsed.ciphertext, parsed.nonce, parsed.aad);
    const payload = JSON.parse(raw) as VaultSecretRecord[];
    let restored = 0;
    for (const row of payload) {
      if (row.revokedAt) {
        continue;
      }
      this.database.upsertVaultSecret({
        name: row.name,
        category: row.category,
        ciphertext: row.ciphertext,
        cipherNonce: row.cipherNonce,
        cipherAad: row.cipherAad,
        wrappedKey: row.wrappedKey,
        wrappedNonce: row.wrappedNonce,
        keyVersion: row.keyVersion,
        metadata: parseJsonSafe<Record<string, unknown>>(row.metadataJson, {})
      });
      restored += 1;
    }
    return { restored };
  }

  private decryptSecret(secret: VaultSecretRecord): string {
    const dek = this.unlockedDekByVersion.get(secret.keyVersion);
    if (!dek) {
      throw new Error(`Vault key version ${secret.keyVersion} is locked.`);
    }
    const wrappedAad = `vault:wrap:${secret.name}:v${secret.keyVersion}`;
    const secretKeyBase64 = this.decrypt(dek, secret.wrappedKey, secret.wrappedNonce, wrappedAad);
    const secretKey = Buffer.from(secretKeyBase64, 'base64');
    return this.decrypt(secretKey, secret.ciphertext, secret.cipherNonce, secret.cipherAad);
  }

  private deriveKek(material: string): Buffer {
    return pbkdf2Sync(material, this.options.passphraseSalt, this.options.passphraseIterations, 32, 'sha256');
  }

  private encrypt(key: Buffer, plainText: string, aad: string): EncryptResult {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(aad));
    const encrypted = Buffer.concat([cipher.update(Buffer.from(plainText, 'utf8')), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      nonce: nonce.toString('base64'),
      ciphertext: Buffer.concat([encrypted, authTag]).toString('base64')
    };
  }

  private decrypt(key: Buffer, ciphertext: string, nonce: string, aad: string): string {
    const payload = Buffer.from(ciphertext, 'base64');
    const body = payload.subarray(0, payload.length - 16);
    const tag = payload.subarray(payload.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(body), decipher.final()]);
    return decrypted.toString('utf8');
  }

  private assertUnlocked(): void {
    if (!this.options.enabled) {
      throw new Error('Vault is disabled.');
    }
    if (this.isLocked()) {
      throw new Error('Vault is locked.');
    }
  }
}

export function parseSecretReference(value: string | undefined | null): string | null {
  if (!value || !value.startsWith('vault://')) {
    return null;
  }
  const secretName = value.slice('vault://'.length).trim();
  return secretName.length > 0 ? secretName : null;
}

export function stableSignalKey(parts: string[]): string {
  return createHash('sha256')
    .update(parts.join('::'))
    .digest('hex')
    .slice(0, 20);
}
