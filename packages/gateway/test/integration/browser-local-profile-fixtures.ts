import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

type LocalProfileFixtureOptions = {
  sessionCookie?: string;
  domain?: string;
};

export function createChromeLocalProfileFixture(homeDir: string, options?: LocalProfileFixtureOptions): { profilePath: string } {
  const chromeRoot = path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome');
  const profilePath = path.join(chromeRoot, 'Default');
  const domain = options?.domain ?? '.example.com';
  fs.mkdirSync(profilePath, { recursive: true });
  fs.writeFileSync(
    path.join(chromeRoot, 'Local State'),
    JSON.stringify({
      profile: {
        info_cache: {
          Default: {
            name: 'Personal Chrome'
          }
        }
      }
    }),
    'utf8'
  );
  const db = new DatabaseSync(path.join(profilePath, 'Cookies'));
  db.exec(`
    CREATE TABLE cookies (
      host_key TEXT,
      name TEXT,
      value TEXT,
      encrypted_value BLOB,
      path TEXT,
      expires_utc INTEGER,
      is_httponly INTEGER,
      is_secure INTEGER,
      samesite INTEGER
    );
  `);
  const insert = db.prepare(
    'INSERT INTO cookies (host_key, name, value, encrypted_value, path, expires_utc, is_httponly, is_secure, samesite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insert.run(domain, 'sessionid', options?.sessionCookie ?? 'chrome-session', new Uint8Array(), '/', 2_200_000_000_000_000, 1, 1, 2);
  insert.run(domain, 'csrftoken', 'csrf-token', new Uint8Array(), '/', 2_200_000_000_000_000, 0, 1, 2);
  db.close();
  return {
    profilePath
  };
}

export function createFirefoxLocalProfileFixture(homeDir: string, options?: LocalProfileFixtureOptions): { profilePath: string } {
  const firefoxRoot = path.join(homeDir, 'Library', 'Application Support', 'Firefox');
  const profileRelativePath = path.join('Profiles', 'wife.default-release');
  const profilePath = path.join(firefoxRoot, profileRelativePath);
  const domain = options?.domain ?? '.example.com';
  fs.mkdirSync(profilePath, { recursive: true });
  fs.writeFileSync(
    path.join(firefoxRoot, 'profiles.ini'),
    ['[Profile0]', 'Name=Personal Firefox', `Path=${profileRelativePath}`, 'IsRelative=1', 'Default=1', ''].join('\n'),
    'utf8'
  );
  const db = new DatabaseSync(path.join(profilePath, 'cookies.sqlite'));
  db.exec(`
    CREATE TABLE moz_cookies (
      host TEXT,
      name TEXT,
      value TEXT,
      path TEXT,
      expiry INTEGER,
      isHttpOnly INTEGER,
      isSecure INTEGER,
      sameSite INTEGER
    );
  `);
  const insert = db.prepare(
    'INSERT INTO moz_cookies (host, name, value, path, expiry, isHttpOnly, isSecure, sameSite) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insert.run(domain, 'sessionid', options?.sessionCookie ?? 'firefox-session', '/', 2_200_000_000, 1, 1, 1);
  insert.run(domain, 'csrftoken', 'csrf-token', '/', 2_200_000_000, 0, 1, 1);
  db.close();
  return {
    profilePath
  };
}

export function installFakeOpenCommand(root: string): { binDir: string; logPath: string } {
  const binDir = path.join(root, 'fake-open-bin');
  const logPath = path.join(root, 'fake-open.log');
  fs.mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, 'open');
  fs.writeFileSync(
    scriptPath,
    `#!/bin/sh\nprintf '%s\\n' "$@" >> "${logPath}"\nexit 0\n`,
    'utf8'
  );
  fs.chmodSync(scriptPath, 0o755);
  return {
    binDir,
    logPath
  };
}
