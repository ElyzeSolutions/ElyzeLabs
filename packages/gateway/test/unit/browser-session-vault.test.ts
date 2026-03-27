import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';

import {
  BrowserSessionVault,
  cookiesToHeaderValue,
  inferDomainsFromCookies,
  parseCookieHeader,
  parseCookieJson,
  parseNetscapeCookies
} from '../../src/browser-session-vault.js';

function createDatabase(): { db: ControlPlaneDatabase; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-browser-vault-unit-'));
  const db = new ControlPlaneDatabase(path.join(root, 'state.db'));
  db.migrate();
  return { db, root };
}

describe('browser session vault', () => {
  const roots: string[] = [];
  const databases: ControlPlaneDatabase[] = [];

  afterEach(() => {
    while (databases.length > 0) {
      databases.pop()?.close();
    }
    while (roots.length > 0) {
      fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it('parses cookie header, json, and netscape formats into normalized entries', () => {
    const headerCookies = parseCookieHeader('sessionid=abc123; csrftoken=csrf-1', 'tiktok.com');
    expect(headerCookies).toEqual([
      expect.objectContaining({ name: 'sessionid', value: 'abc123', domain: 'tiktok.com', path: '/' }),
      expect.objectContaining({ name: 'csrftoken', value: 'csrf-1', domain: 'tiktok.com', path: '/' })
    ]);

    const jsonCookies = parseCookieJson(
      JSON.stringify({
        cookies: [{ name: 'sessionid', value: 'json-1', domain: '.instagram.com', path: '/', secure: true }]
      }),
      null
    );
    expect(jsonCookies).toEqual([
      expect.objectContaining({ name: 'sessionid', value: 'json-1', domain: '.instagram.com', secure: true })
    ]);

    const netscapeCookies = parseNetscapeCookies(
      ['.reddit.com\tTRUE\t/\tTRUE\t2200000000\treddit_session\treddit-1', ''].join('\n')
    );
    expect(netscapeCookies).toEqual([
      expect.objectContaining({ name: 'reddit_session', value: 'reddit-1', domain: '.reddit.com', secure: true })
    ]);

    expect(inferDomainsFromCookies([...headerCookies, ...jsonCookies, ...netscapeCookies])).toEqual([
      'tiktok.com',
      'instagram.com',
      'reddit.com'
    ]);
    expect(cookiesToHeaderValue(headerCookies)).toBe('sessionid=abc123; csrftoken=csrf-1');
  });

  it('resolves session profiles into request-ready cookies, headers, proxy, and locale metadata', () => {
    const { db, root } = createDatabase();
    databases.push(db);
    roots.push(root);

    const vault = new BrowserSessionVault(db);
    const cookieJar = vault.importCookieJar({
      id: 'jar-1',
      label: 'TikTok cookies',
      sourceKind: 'json_cookie_export',
      raw: JSON.stringify([{ name: 'sid_tt', value: 'cookie-1', domain: '.tiktok.com' }]),
      domains: ['tiktok.com']
    });
    const headerProfile = vault.upsertHeaderProfile({
      id: 'headers-1',
      label: 'Mobile headers',
      domains: ['tiktok.com'],
      headers: {
        'user-agent': 'elyze-test',
        accept: 'text/html'
      }
    });
    const proxyProfile = vault.upsertProxyProfile({
      id: 'proxy-1',
      label: 'Swiss proxy',
      domains: ['tiktok.com'],
      proxy: {
        server: 'http://proxy.local:8080'
      }
    });
    const storageState = vault.upsertStorageState({
      id: 'storage-1',
      label: 'TikTok state',
      domains: ['tiktok.com'],
      storageState: {
        cookies: []
      }
    });

    const sessionProfile = vault.upsertSessionProfile({
      id: 'profile-1',
      label: 'TikTok operator',
      domains: ['tiktok.com'],
      cookieJarId: cookieJar.id,
      headersProfileId: headerProfile.id,
      proxyProfileId: proxyProfile.id,
      storageStateId: storageState.id,
      useRealChrome: true,
      locale: 'en-US',
      countryCode: 'CH',
      timezoneId: 'Europe/Zurich'
    });

    const resolved = vault.resolveForRequest({
      url: 'https://www.tiktok.com/@minilanoy',
      sessionProfileId: sessionProfile.id,
      extraHeaders: {
        'x-extra-header': 'yes'
      },
      extraCookies: {
        sessionid: 'override-session'
      }
    });

    expect(resolved.sessionProfile?.id).toBe(sessionProfile.id);
    expect(resolved.cookieJar?.id).toBe(cookieJar.id);
    expect(resolved.headerProfile?.id).toBe(headerProfile.id);
    expect(resolved.proxyProfile?.id).toBe(proxyProfile.id);
    expect(resolved.storageState?.id).toBe(storageState.id);
    expect(resolved.proxyUrl).toBe('http://proxy.local:8080');
    expect(resolved.useRealChrome).toBe(true);
    expect(resolved.locale).toBe('en-US');
    expect(resolved.countryCode).toBe('CH');
    expect(resolved.timezoneId).toBe('Europe/Zurich');
    expect(resolved.headers).toMatchObject({
      accept: 'text/html',
      'user-agent': 'elyze-test',
      'x-extra-header': 'yes'
    });
    expect(resolved.cookies).toEqual([
      expect.objectContaining({ name: 'sid_tt', value: 'cookie-1' }),
      expect.objectContaining({ name: 'sessionid', value: 'override-session' })
    ]);
  });
});
