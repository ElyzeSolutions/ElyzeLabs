import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import type { BrowserCookieEntry } from './browser-session-vault.js';

type SqliteRow = Record<string, unknown>;

interface SqliteStatement {
  all(...params: unknown[]): SqliteRow[];
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

type DatabaseSyncConstructor = new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase;

const require = createRequire(import.meta.url);
const DatabaseSync = loadDatabaseSync();

function loadSqliteModule(): unknown {
  return require('node:sqlite');
}

function isSqliteModule(value: unknown): value is { DatabaseSync: DatabaseSyncConstructor } {
  return typeof value === 'object' && value !== null && 'DatabaseSync' in value && typeof value.DatabaseSync === 'function';
}

function loadDatabaseSync(): DatabaseSyncConstructor {
  const sqliteModule = loadSqliteModule();
  if (!isSqliteModule(sqliteModule)) {
    throw new Error('node:sqlite DatabaseSync is unavailable.');
  }
  return sqliteModule.DatabaseSync;
}

export type BrowserLocalProfileKind = 'chrome' | 'edge' | 'firefox';

export interface LocalBrowserProfileRow {
  id: string;
  browserKind: BrowserLocalProfileKind;
  label: string;
  profileName: string;
  profilePath: string;
  isDefault: boolean;
  importStrategy: 'cookie_import' | 'cookie_import_and_real_chrome';
  browserDisplayName?: string;
  browserAppName?: string;
  browserBinaryPath?: string;
  chromiumSafeStorageService?: string;
}

export function listLocalBrowserProfiles(): LocalBrowserProfileRow[] {
  return [...listChromeProfiles(), ...listEdgeProfiles(), ...listFirefoxProfiles()].sort((left, right) => {
    if (left.browserKind !== right.browserKind) {
      return left.browserKind.localeCompare(right.browserKind);
    }
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
}

export function getLocalBrowserProfileById(profileId: string): LocalBrowserProfileRow | null {
  return listLocalBrowserProfiles().find((profile) => profile.id === profileId) ?? null;
}

export function resolveDefaultLocalBrowserProfile(kind: BrowserLocalProfileKind): LocalBrowserProfileRow | null {
  const profiles = listLocalBrowserProfiles().filter((profile) => profile.browserKind === kind);
  return profiles.find((profile) => profile.isDefault) ?? profiles[0] ?? null;
}

export function importCookiesFromLocalBrowserProfile(input: {
  profile: LocalBrowserProfileRow;
  domains?: string[];
}): BrowserCookieEntry[] {
  if (input.profile.browserKind === 'firefox') {
    return readFirefoxCookies(input.profile.profilePath, input.domains ?? []);
  }
  return readChromeCookies(
    input.profile.profilePath,
    input.domains ?? [],
    input.profile.chromiumSafeStorageService ?? chromiumSafeStorageService(input.profile.browserKind)
  );
}

export function startVisibleBrowserLogin(input: {
  profile: LocalBrowserProfileRow;
  url: string;
}): { command: string; url: string } {
  const normalizedUrl = input.url.trim();
  if (!normalizedUrl) {
    throw new Error('A login URL is required.');
  }
  if (input.profile.browserKind === 'firefox') {
    const launch = resolveFirefoxLaunch(input.profile);
    launchDetached(launch.binaryPath, ['-P', input.profile.profileName, '-new-window', normalizedUrl], [
      'open',
      '-a',
      launch.appName,
      normalizedUrl
    ]);
    return {
      command: `${launch.displayName} profile ${input.profile.profileName}`,
      url: normalizedUrl
    };
  }

  const launch = resolveChromiumLaunch(input.profile);
  launchDetached(launch.binaryPath, [`--profile-directory=${input.profile.profileName}`, '--new-window', normalizedUrl], [
    'open',
    '-a',
    launch.appName,
    normalizedUrl
  ]);
  return {
    command: `${launch.displayName} profile ${input.profile.profileName}`,
    url: normalizedUrl
  };
}

function listChromeProfiles(): LocalBrowserProfileRow[] {
  return listChromiumProfiles({
    browserKind: 'chrome',
    profilesDir: resolveChromeProfilesDir(),
    displayName: 'Chrome',
    appName: 'Google Chrome',
    binaryPath: resolveChromeBinary(),
    defaultProfileLabel: 'Chrome default',
    importStrategy: 'cookie_import_and_real_chrome',
    safeStorageService: 'Chrome Safe Storage'
  });
}

function listEdgeProfiles(): LocalBrowserProfileRow[] {
  return listChromiumProfiles({
    browserKind: 'edge',
    profilesDir: resolveEdgeProfilesDir(),
    displayName: 'Edge',
    appName: 'Microsoft Edge',
    binaryPath: resolveEdgeBinary(),
    defaultProfileLabel: 'Edge default',
    importStrategy: 'cookie_import',
    safeStorageService: 'Microsoft Edge Safe Storage'
  });
}

function listChromiumProfiles(input: {
  browserKind: 'chrome' | 'edge';
  profilesDir: string;
  displayName: string;
  appName: string;
  binaryPath: string;
  defaultProfileLabel: string;
  importStrategy: LocalBrowserProfileRow['importStrategy'];
  safeStorageService: string;
}): LocalBrowserProfileRow[] {
  if (!fs.existsSync(input.profilesDir)) {
    return [];
  }

  const localStatePath = path.join(input.profilesDir, 'Local State');
  const localState = readJsonFile(localStatePath);
  const profile = localState && isRecord(localState.profile) ? localState.profile : null;
  const profileInfoCache = profile && isRecord(profile.info_cache) ? profile.info_cache : {};

  const results: LocalBrowserProfileRow[] = [];
  for (const entry of fs.readdirSync(input.profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || (entry.name !== 'Default' && !/^Profile \d+$/i.test(entry.name))) {
      continue;
    }
    const profilePath = path.join(input.profilesDir, entry.name);
    if (!fs.existsSync(path.join(profilePath, 'Cookies'))) {
      continue;
    }
    const rawInfo = profileInfoCache[entry.name];
    const info = isRecord(rawInfo) ? rawInfo : null;
    const infoName = info && typeof info.name === 'string' ? info.name.trim() : '';
    results.push({
      id: buildLocalProfileId(input.browserKind, profilePath),
      browserKind: input.browserKind,
      label: infoName || (entry.name === 'Default' ? input.defaultProfileLabel : `${input.displayName} ${entry.name}`),
      profileName: entry.name,
      profilePath,
      isDefault: entry.name === 'Default',
      importStrategy: input.importStrategy,
      browserDisplayName: input.displayName,
      browserAppName: input.appName,
      browserBinaryPath: input.binaryPath,
      chromiumSafeStorageService: input.safeStorageService
    });
  }
  return results;
}

function listFirefoxProfiles(): LocalBrowserProfileRow[] {
  const results: LocalBrowserProfileRow[] = [];
  for (const root of resolveFirefoxProfileRoots()) {
    const profilesIniPath = path.join(root.profilesDir, 'profiles.ini');
    if (!fs.existsSync(profilesIniPath)) {
      continue;
    }

    const parsed = parseIni(fs.readFileSync(profilesIniPath, 'utf8'));
    for (const section of parsed) {
      if (!/^Profile/i.test(section.name)) {
        continue;
      }
      const profileName = typeof section.values.Name === 'string' ? section.values.Name.trim() : '';
      const configuredPath = typeof section.values.Path === 'string' ? section.values.Path.trim() : '';
      if (!profileName || !configuredPath) {
        continue;
      }
      const isRelative = String(section.values.IsRelative ?? '1').trim() !== '0';
      const profilePath = isRelative ? path.join(root.profilesDir, configuredPath) : configuredPath;
      if (!fs.existsSync(path.join(profilePath, 'cookies.sqlite'))) {
        continue;
      }
      results.push({
        id: buildLocalProfileId('firefox', profilePath),
        browserKind: 'firefox',
        label: root.displayName === 'Firefox' ? profileName : `${root.displayName} ${profileName}`,
        profileName,
        profilePath,
        isDefault: String(section.values.Default ?? '0').trim() === '1',
        importStrategy: 'cookie_import',
        browserDisplayName: root.displayName,
        browserAppName: root.appName,
        browserBinaryPath: root.binaryPath
      });
    }
  }
  return results;
}

function readChromeCookies(profilePath: string, domains: string[], safeStorageService: string): BrowserCookieEntry[] {
  const sourcePath = path.join(profilePath, 'Cookies');
  const tempCopy = copyDatabaseToTemp(sourcePath);
  const allowedDomains = normalizeDomains(domains);
  try {
    let secret: string | null = null;
    const database = new DatabaseSync(tempCopy, { readOnly: true });
    try {
      const rows = database
        .prepare(
          `SELECT host_key, name, value, encrypted_value, path, CAST(expires_utc AS TEXT) AS expires_utc, is_httponly, is_secure, samesite
           FROM cookies`
        )
        .all();
      const cookies: BrowserCookieEntry[] = [];
      for (const row of rows) {
        const hostKey = String(row.host_key ?? '').trim();
        if (allowedDomains.length > 0 && !matchesAnyDomain(hostKey, allowedDomains)) {
          continue;
        }
        const cookieName = String(row.name ?? '').trim();
        if (!cookieName) {
          continue;
        }
        const plaintextValue = String(row.value ?? '').trim();
        const encryptedValue =
          row.encrypted_value instanceof Uint8Array
            ? Buffer.from(row.encrypted_value)
            : Buffer.isBuffer(row.encrypted_value)
              ? row.encrypted_value
              : Buffer.alloc(0);
        const cookieValue =
          plaintextValue.length > 0
            ? plaintextValue
            : encryptedValue.length > 0
              ? decryptChromeCookieValue(
                  encryptedValue,
                  hostKey,
                  secret ?? (secret = resolveMacSafeStorageSecret(safeStorageService))
                )
              : '';
        if (!cookieValue) {
          continue;
        }
        cookies.push({
          name: cookieName,
          value: cookieValue,
          domain: hostKey || null,
          path: String(row.path ?? '/').trim() || '/',
          expires: chromeTimestampToUnix(row.expires_utc),
          httpOnly: Number(row.is_httponly ?? 0) === 1,
          secure: Number(row.is_secure ?? 0) === 1,
          sameSite: chromeSameSite(Number(row.samesite ?? 0))
        });
      }
      return cookies;
    } finally {
      database.close();
    }
  } finally {
    fs.rmSync(tempCopy, { force: true });
  }
}

function readFirefoxCookies(profilePath: string, domains: string[]): BrowserCookieEntry[] {
  const sourcePath = path.join(profilePath, 'cookies.sqlite');
  const tempCopy = copyDatabaseToTemp(sourcePath);
  const allowedDomains = normalizeDomains(domains);
  try {
    const database = new DatabaseSync(tempCopy, { readOnly: true });
    try {
      const rows = database
        .prepare(
          `SELECT host, name, value, path, expiry, isHttpOnly, isSecure, sameSite
           FROM moz_cookies`
        )
        .all();
      const cookies: BrowserCookieEntry[] = [];
      for (const row of rows) {
        const hostKey = String(row.host ?? '').trim();
        if (allowedDomains.length > 0 && !matchesAnyDomain(hostKey, allowedDomains)) {
          continue;
        }
        const cookieName = String(row.name ?? '').trim();
        const cookieValue = String(row.value ?? '').trim();
        if (!cookieName || !cookieValue) {
          continue;
        }
        cookies.push({
          name: cookieName,
          value: cookieValue,
          domain: hostKey || null,
          path: String(row.path ?? '/').trim() || '/',
          expires: unixCookieExpiry(Number(row.expiry)),
          httpOnly: Number(row.isHttpOnly ?? 0) === 1,
          secure: Number(row.isSecure ?? 0) === 1,
          sameSite: firefoxSameSite(Number(row.sameSite ?? 0))
        });
      }
      return cookies;
    } finally {
      database.close();
    }
  } finally {
    fs.rmSync(tempCopy, { force: true });
  }
}

function decryptChromeCookieValue(value: Buffer, hostKey: string, secret: string): string {
  let encrypted = value;
  if (encrypted.subarray(0, 3).equals(Buffer.from('v10')) || encrypted.subarray(0, 3).equals(Buffer.from('v11'))) {
    encrypted = encrypted.subarray(3);
  }
  const key = crypto.pbkdf2Sync(secret, 'saltysalt', 1003, 16, 'sha1');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20));
  let decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const padding = decrypted.length > 0 ? Number(decrypted[decrypted.length - 1] ?? 0) : 0;
  if (padding > 0 && padding <= 16) {
    decrypted = decrypted.subarray(0, decrypted.length - padding);
  }
  const hostDigest = crypto.createHash('sha256').update(hostKey).digest();
  if (decrypted.length > 32 && decrypted.subarray(0, 32).equals(hostDigest)) {
    decrypted = decrypted.subarray(32);
  }
  return decrypted.toString('utf8').trim();
}

function resolveMacSafeStorageSecret(service: string): string {
  return execFileSync('security', ['find-generic-password', '-w', '-s', service], {
    encoding: 'utf8'
  }).trim();
}

function copyDatabaseToTemp(sourcePath: string): string {
  const tempPath = path.join(os.tmpdir(), `browser-profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.sqlite`);
  fs.copyFileSync(sourcePath, tempPath);
  return tempPath;
}

function launchDetached(primaryCommand: string, primaryArgs: string[], fallbackCommand: string[]): void {
  try {
    if (primaryCommand && fs.existsSync(primaryCommand)) {
      const child = spawn(primaryCommand, primaryArgs, {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore']
      });
      child.unref();
      return;
    }
  } catch {
    // Fall through to the macOS open-based fallback.
  }
  const command = fallbackCommand[0];
  if (!command) {
    throw new Error('No browser launch command is available.');
  }
  const args = fallbackCommand.slice(1);
  const child = spawn(command, args, {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore']
  });
  child.unref();
}

function resolveChromeBinary(): string {
  const configured = process.env.OPS_BROWSER_VISIBLE_CHROME_BIN?.trim();
  return configured && configured.length > 0 ? configured : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

function resolveEdgeBinary(): string {
  const configured = process.env.OPS_BROWSER_VISIBLE_EDGE_BIN?.trim();
  return configured && configured.length > 0 ? configured : '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
}

function resolveChromiumLaunch(profile: LocalBrowserProfileRow): { displayName: string; appName: string; binaryPath: string } {
  const displayName = profile.browserDisplayName ?? (profile.browserKind === 'edge' ? 'Edge' : 'Chrome');
  const appName = profile.browserAppName ?? (profile.browserKind === 'edge' ? 'Microsoft Edge' : 'Google Chrome');
  const binaryPath = profile.browserBinaryPath ?? (profile.browserKind === 'edge' ? resolveEdgeBinary() : resolveChromeBinary());
  return { displayName, appName, binaryPath };
}

function resolveFirefoxLaunch(profile: LocalBrowserProfileRow): { displayName: string; appName: string; binaryPath: string } {
  const displayName = profile.browserDisplayName ?? 'Firefox';
  const appName = profile.browserAppName ?? 'Firefox';
  const binaryPath = profile.browserBinaryPath ?? resolveFirefoxBinary();
  return { displayName, appName, binaryPath };
}

function resolveFirefoxBinary(): string {
  const configured = process.env.OPS_BROWSER_VISIBLE_FIREFOX_BIN?.trim();
  return configured && configured.length > 0 ? configured : '/Applications/Firefox.app/Contents/MacOS/firefox';
}

function resolveChromeProfilesDir(): string {
  const configured = process.env.OPS_BROWSER_CHROME_PROFILE_ROOT?.trim();
  return configured && configured.length > 0
    ? configured
    : path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
}

function resolveEdgeProfilesDir(): string {
  const configured = process.env.OPS_BROWSER_EDGE_PROFILE_ROOT?.trim();
  return configured && configured.length > 0
    ? configured
    : path.join(os.homedir(), 'Library', 'Application Support', 'Microsoft Edge');
}

function resolveFirefoxProfilesDir(): string {
  const configured = process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT?.trim();
  return configured && configured.length > 0
    ? configured
    : path.join(os.homedir(), 'Library', 'Application Support', 'Firefox');
}

function resolveZenProfilesDir(): string {
  const configured = process.env.OPS_BROWSER_ZEN_PROFILE_ROOT?.trim();
  return configured && configured.length > 0 ? configured : path.join(os.homedir(), 'Library', 'Application Support', 'zen');
}

function resolveZenBinary(): string {
  const configured = process.env.OPS_BROWSER_VISIBLE_ZEN_BIN?.trim();
  return configured && configured.length > 0 ? configured : '/Applications/Zen.app/Contents/MacOS/zen';
}

function chromiumSafeStorageService(browserKind: BrowserLocalProfileKind): string {
  return browserKind === 'edge' ? 'Microsoft Edge Safe Storage' : 'Chrome Safe Storage';
}

function resolveFirefoxProfileRoots(): Array<{
  displayName: string;
  appName: string;
  profilesDir: string;
  binaryPath: string;
}> {
  return [
    {
      displayName: 'Firefox',
      appName: 'Firefox',
      profilesDir: resolveFirefoxProfilesDir(),
      binaryPath: resolveFirefoxBinary()
    },
    {
      displayName: 'Zen',
      appName: 'Zen',
      profilesDir: resolveZenProfilesDir(),
      binaryPath: resolveZenBinary()
    }
  ];
}

function chromeTimestampToUnix(value: unknown): number | null {
  const timestampMicros = readIntegerLike(value);
  if (timestampMicros === null || timestampMicros <= 0n) {
    return null;
  }
  const unixMicros = timestampMicros - 11_644_473_600_000_000n;
  if (unixMicros <= 0n) {
    return null;
  }
  const unixSeconds = unixMicros / 1_000_000n;
  if (unixSeconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(unixSeconds);
}

function unixCookieExpiry(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const seconds = value > 9_999_999_999 ? value / 1000 : value;
  return Math.floor(seconds);
}

function readIntegerLike(value: unknown): bigint | null {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }
  return BigInt(trimmed);
}

function chromeSameSite(value: number): BrowserCookieEntry['sameSite'] {
  if (value === 1) {
    return 'None';
  }
  if (value === 2) {
    return 'Lax';
  }
  if (value === 3) {
    return 'Strict';
  }
  return null;
}

function firefoxSameSite(value: number): BrowserCookieEntry['sameSite'] {
  if (value === 1) {
    return 'Lax';
  }
  if (value === 2) {
    return 'Strict';
  }
  return null;
}

function buildLocalProfileId(browserKind: BrowserLocalProfileKind, profilePath: string): string {
  return `${browserKind}:${crypto.createHash('sha1').update(profilePath).digest('hex').slice(0, 12)}`;
}

function normalizeDomains(domains: string[]): string[] {
  return Array.from(
    new Set(
      domains
        .map((entry) => entry.trim().replace(/^\./, '').toLowerCase())
        .filter((entry) => entry.length > 0)
    )
  );
}

function matchesAnyDomain(hostKey: string, domains: string[]): boolean {
  const normalizedHost = hostKey.trim().replace(/^\./, '').toLowerCase();
  return domains.some((domain) => normalizedHost === domain || normalizedHost.endsWith(`.${domain}`));
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseIni(value: string): Array<{ name: string; values: Record<string, string> }> {
  const sections: Array<{ name: string; values: Record<string, string> }> = [];
  let current: { name: string; values: Record<string, string> } | null = null;
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) {
      continue;
    }
    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      current = {
        name: header[1] ?? '',
        values: {}
      };
      sections.push(current);
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0 || !current) {
      continue;
    }
    current.values[line.slice(0, separatorIndex).trim()] = line.slice(separatorIndex + 1).trim();
  }
  return sections;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
