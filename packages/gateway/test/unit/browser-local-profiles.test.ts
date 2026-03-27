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
  createFirefoxLocalProfileFixture,
  installFakeOpenCommand
} from '../integration/browser-local-profile-fixtures.js';

describe('browser local profiles', () => {
  const roots: string[] = [];
  const originalPath = process.env.PATH;
  const originalChromeRoot = process.env.OPS_BROWSER_CHROME_PROFILE_ROOT;
  const originalFirefoxRoot = process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT;
  const originalChromeBinary = process.env.OPS_BROWSER_VISIBLE_CHROME_BIN;

  afterEach(() => {
    process.env.PATH = originalPath;
    if (originalChromeRoot === undefined) {
      delete process.env.OPS_BROWSER_CHROME_PROFILE_ROOT;
    } else {
      process.env.OPS_BROWSER_CHROME_PROFILE_ROOT = originalChromeRoot;
    }
    if (originalFirefoxRoot === undefined) {
      delete process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT;
    } else {
      process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT = originalFirefoxRoot;
    }
    if (originalChromeBinary === undefined) {
      delete process.env.OPS_BROWSER_VISIBLE_CHROME_BIN;
    } else {
      process.env.OPS_BROWSER_VISIBLE_CHROME_BIN = originalChromeBinary;
    }
    while (roots.length > 0) {
      fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it('lists default Chrome and Firefox profiles and imports cookies from both stores', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-local-browser-profiles-'));
    roots.push(root);
    createChromeLocalProfileFixture(root, { domain: '.tiktok.com', sessionCookie: 'chrome-cookie' });
    createFirefoxLocalProfileFixture(root, { domain: '.instagram.com', sessionCookie: 'firefox-cookie' });

    process.env.OPS_BROWSER_CHROME_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'Google', 'Chrome');
    process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'Firefox');

    const profiles = listLocalBrowserProfiles();
    expect(profiles.map((profile) => profile.browserKind)).toEqual(['chrome', 'firefox']);
    expect(resolveDefaultLocalBrowserProfile('chrome')).toMatchObject({ profileName: 'Default', isDefault: true });
    expect(resolveDefaultLocalBrowserProfile('firefox')).toMatchObject({ profileName: 'Personal Firefox', isDefault: true });

    const chromeProfile = profiles.find((profile) => profile.browserKind === 'chrome');
    const firefoxProfile = profiles.find((profile) => profile.browserKind === 'firefox');
    expect(chromeProfile).toBeTruthy();
    expect(firefoxProfile).toBeTruthy();
    expect(getLocalBrowserProfileById(chromeProfile!.id)?.profilePath).toBe(chromeProfile!.profilePath);

    expect(importCookiesFromLocalBrowserProfile({ profile: chromeProfile!, domains: ['tiktok.com'] })).toEqual([
      expect.objectContaining({ name: 'sessionid', value: 'chrome-cookie', domain: '.tiktok.com' }),
      expect.objectContaining({ name: 'csrftoken', value: 'csrf-token', domain: '.tiktok.com' })
    ]);
    expect(importCookiesFromLocalBrowserProfile({ profile: firefoxProfile!, domains: ['instagram.com'] })).toEqual([
      expect.objectContaining({ name: 'sessionid', value: 'firefox-cookie', domain: '.instagram.com' }),
      expect.objectContaining({ name: 'csrftoken', value: 'csrf-token', domain: '.instagram.com' })
    ]);
  });

  it('falls back to the macOS open command when no explicit browser binary is available', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-local-browser-launch-'));
    roots.push(root);
    createChromeLocalProfileFixture(root, { domain: '.tiktok.com' });
    const { binDir, logPath } = installFakeOpenCommand(root);

    process.env.OPS_BROWSER_CHROME_PROFILE_ROOT = path.join(root, 'Library', 'Application Support', 'Google', 'Chrome');
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
