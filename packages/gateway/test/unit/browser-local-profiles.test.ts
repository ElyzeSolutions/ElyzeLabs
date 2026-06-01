import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  getLocalBrowserProfileById,
  importCookiesFromLocalBrowserProfile,
  listLocalBrowserProfiles,
  resolveDefaultLocalBrowserProfile,
  startVisibleBrowserLogin
} from '../../src/browser-local-profiles.js';
import {
  createChromeLocalProfileFixture,
  createEdgeLocalProfileFixture,
  createFirefoxLocalProfileFixture,
  installFakeOpenCommand
} from '../integration/browser-local-profile-fixtures.js';

describe('browser local profiles', () => {
  const roots: string[] = [];
  const originalPath = process.env.PATH;
  const originalChromeRoot = process.env.OPS_BROWSER_CHROME_PROFILE_ROOT;
  const originalEdgeRoot = process.env.OPS_BROWSER_EDGE_PROFILE_ROOT;
  const originalFirefoxRoot = process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT;
  const originalZenRoot = process.env.OPS_BROWSER_ZEN_PROFILE_ROOT;
  const originalChromeBinary = process.env.OPS_BROWSER_VISIBLE_CHROME_BIN;
  const originalEdgeBinary = process.env.OPS_BROWSER_VISIBLE_EDGE_BIN;
  const originalZenBinary = process.env.OPS_BROWSER_VISIBLE_ZEN_BIN;

  afterEach(() => {
    process.env.PATH = originalPath;
    if (originalChromeRoot === undefined) {
      delete process.env.OPS_BROWSER_CHROME_PROFILE_ROOT;
    } else {
      process.env.OPS_BROWSER_CHROME_PROFILE_ROOT = originalChromeRoot;
    }
    if (originalEdgeRoot === undefined) {
      delete process.env.OPS_BROWSER_EDGE_PROFILE_ROOT;
    } else {
      process.env.OPS_BROWSER_EDGE_PROFILE_ROOT = originalEdgeRoot;
    }
    if (originalFirefoxRoot === undefined) {
      delete process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT;
    } else {
      process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT = originalFirefoxRoot;
    }
    if (originalZenRoot === undefined) {
      delete process.env.OPS_BROWSER_ZEN_PROFILE_ROOT;
    } else {
      process.env.OPS_BROWSER_ZEN_PROFILE_ROOT = originalZenRoot;
    }
    if (originalChromeBinary === undefined) {
      delete process.env.OPS_BROWSER_VISIBLE_CHROME_BIN;
    } else {
      process.env.OPS_BROWSER_VISIBLE_CHROME_BIN = originalChromeBinary;
    }
    if (originalEdgeBinary === undefined) {
      delete process.env.OPS_BROWSER_VISIBLE_EDGE_BIN;
    } else {
      process.env.OPS_BROWSER_VISIBLE_EDGE_BIN = originalEdgeBinary;
    }
    if (originalZenBinary === undefined) {
      delete process.env.OPS_BROWSER_VISIBLE_ZEN_BIN;
    } else {
      process.env.OPS_BROWSER_VISIBLE_ZEN_BIN = originalZenBinary;
    }
    while (roots.length > 0) {
      fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it('lists default Chrome, Edge, and Firefox profiles and imports cookies from each store', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-local-browser-profiles-'));
    roots.push(root);
    createChromeLocalProfileFixture(root, { domain: '.tiktok.com', sessionCookie: 'chrome-cookie' });
    createEdgeLocalProfileFixture(root, { domain: '.pinterest.com', sessionCookie: 'edge-cookie' });
    createFirefoxLocalProfileFixture(root, { domain: '.instagram.com', sessionCookie: 'firefox-cookie' });

    process.env.OPS_BROWSER_CHROME_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'Google', 'Chrome');
    process.env.OPS_BROWSER_EDGE_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'Microsoft Edge');
    process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'Firefox');
    process.env.OPS_BROWSER_ZEN_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'missing-zen');

    const profiles = listLocalBrowserProfiles();
    expect(profiles.map((profile) => profile.browserKind)).toEqual(['chrome', 'edge', 'firefox']);
    expect(resolveDefaultLocalBrowserProfile('chrome')).toMatchObject({ profileName: 'Default', isDefault: true });
    expect(resolveDefaultLocalBrowserProfile('edge')).toMatchObject({ profileName: 'Default', isDefault: true });
    expect(resolveDefaultLocalBrowserProfile('firefox')).toMatchObject({ profileName: 'Personal Firefox', isDefault: true });

    const chromeProfile = profiles.find((profile) => profile.browserKind === 'chrome');
    const edgeProfile = profiles.find((profile) => profile.browserKind === 'edge');
    const firefoxProfile = profiles.find((profile) => profile.browserKind === 'firefox');
    expect(chromeProfile).toBeTruthy();
    expect(edgeProfile).toBeTruthy();
    expect(firefoxProfile).toBeTruthy();
    expect(getLocalBrowserProfileById(chromeProfile!.id)?.profilePath).toBe(chromeProfile!.profilePath);

    expect(importCookiesFromLocalBrowserProfile({ profile: chromeProfile!, domains: ['tiktok.com'] })).toEqual([
      expect.objectContaining({ name: 'sessionid', value: 'chrome-cookie', domain: '.tiktok.com' }),
      expect.objectContaining({ name: 'csrftoken', value: 'csrf-token', domain: '.tiktok.com' })
    ]);
    expect(importCookiesFromLocalBrowserProfile({ profile: edgeProfile!, domains: ['pinterest.com'] })).toEqual([
      expect.objectContaining({ name: 'sessionid', value: 'edge-cookie', domain: '.pinterest.com' }),
      expect.objectContaining({ name: 'csrftoken', value: 'csrf-token', domain: '.pinterest.com' })
    ]);
    expect(importCookiesFromLocalBrowserProfile({ profile: firefoxProfile!, domains: ['instagram.com'] })).toEqual([
      expect.objectContaining({ name: 'sessionid', value: 'firefox-cookie', domain: '.instagram.com' }),
      expect.objectContaining({ name: 'csrftoken', value: 'csrf-token', domain: '.instagram.com' })
    ]);
  });

  it('normalizes Firefox-family session cookie expiry values for browser runtimes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-local-browser-expiry-'));
    roots.push(root);
    createFirefoxLocalProfileFixture(root, {
      domain: '.instagram.com',
      sessionCookie: 'firefox-session-cookie',
      expirySeconds: 0
    });

    process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'Firefox');
    process.env.OPS_BROWSER_EDGE_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'missing-edge');
    process.env.OPS_BROWSER_ZEN_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'missing-zen');

    const firefoxProfile = resolveDefaultLocalBrowserProfile('firefox');
    expect(firefoxProfile).toBeTruthy();
    if (!firefoxProfile) {
      throw new Error('Expected Firefox profile fixture to be discoverable.');
    }

    const cookies = importCookiesFromLocalBrowserProfile({ profile: firefoxProfile, domains: ['instagram.com'] });
    expect(cookies).toEqual([
      expect.objectContaining({ name: 'sessionid', value: 'firefox-session-cookie', expires: null }),
      expect.objectContaining({ name: 'csrftoken', value: 'csrf-token', expires: null })
    ]);
  });

  it('converts Firefox-family millisecond cookie expiry values to Unix seconds', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-local-browser-ms-expiry-'));
    roots.push(root);
    createFirefoxLocalProfileFixture(root, {
      domain: '.instagram.com',
      sessionCookie: 'firefox-ms-cookie',
      expirySeconds: 1_814_218_730_603
    });

    process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'Firefox');
    process.env.OPS_BROWSER_EDGE_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'missing-edge');
    process.env.OPS_BROWSER_ZEN_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'missing-zen');

    const firefoxProfile = resolveDefaultLocalBrowserProfile('firefox');
    expect(firefoxProfile).toBeTruthy();
    if (!firefoxProfile) {
      throw new Error('Expected Firefox profile fixture to be discoverable.');
    }

    const cookies = importCookiesFromLocalBrowserProfile({ profile: firefoxProfile, domains: ['instagram.com'] });
    expect(cookies).toEqual([
      expect.objectContaining({ name: 'sessionid', value: 'firefox-ms-cookie', expires: 1_814_218_730 }),
      expect.objectContaining({ name: 'csrftoken', value: 'csrf-token', expires: 1_814_218_730 })
    ]);
  });

  it('imports Chrome cookies with oversized Chromium timestamp values', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-local-browser-chrome-expiry-'));
    roots.push(root);
    createChromeLocalProfileFixture(root, {
      domain: '.tiktok.com',
      sessionCookie: 'chrome-large-expiry-cookie',
      chromeExpiresUtc: '13433510502970669'
    });

    process.env.OPS_BROWSER_CHROME_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'Google', 'Chrome');
    process.env.OPS_BROWSER_EDGE_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'missing-edge');
    process.env.OPS_BROWSER_ZEN_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'missing-zen');

    const chromeProfile = resolveDefaultLocalBrowserProfile('chrome');
    expect(chromeProfile).toBeTruthy();
    if (!chromeProfile) {
      throw new Error('Expected Chrome profile fixture to be discoverable.');
    }

    const cookies = importCookiesFromLocalBrowserProfile({ profile: chromeProfile, domains: ['tiktok.com'] });
    expect(cookies).toEqual([
      expect.objectContaining({ name: 'sessionid', value: 'chrome-large-expiry-cookie', expires: 1_789_036_902 }),
      expect.objectContaining({ name: 'csrftoken', value: 'csrf-token', expires: 1_789_036_902 })
    ]);
  });

  it('falls back to the macOS open command when no explicit browser binary is available', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-local-browser-launch-'));
    roots.push(root);
    createChromeLocalProfileFixture(root, { domain: '.tiktok.com' });
    const { binDir, logPath } = installFakeOpenCommand(root);

    process.env.OPS_BROWSER_CHROME_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'Google', 'Chrome');
    process.env.OPS_BROWSER_EDGE_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'missing-edge');
    process.env.OPS_BROWSER_ZEN_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'missing-zen');
    process.env.OPS_BROWSER_VISIBLE_CHROME_BIN = path.join(root, 'missing-chrome');
    process.env.PATH = `${binDir}:${originalPath ?? ''}`;

    const profile = resolveDefaultLocalBrowserProfile('chrome');
    expect(profile).toBeTruthy();

    const launched = startVisibleBrowserLogin({
      profile: profile!,
      url: 'https://www.tiktok.com/login'
    });

    expect(launched.command).toContain('Chrome profile');

    let openArgs = '';
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (fs.existsSync(logPath)) {
        openArgs = fs.readFileSync(logPath, 'utf8');
        if (openArgs.trim().length > 0) {
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(openArgs).toBeTruthy();
    expect(openArgs).toContain('-a');
    expect(openArgs).toContain('Google Chrome');
    expect(openArgs).toContain('https://www.tiktok.com/login');
  });
});
