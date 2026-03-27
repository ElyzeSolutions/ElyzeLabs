import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig } from '@ops/config';

import { validateControlPlaneConfig } from '../../src/config-validator.ts';

describe('config validator browser diagnostics', () => {
  it('surfaces missing scrapling dependencies as explicit diagnostics instead of deferring failure to first use', () => {
    const config = loadConfig({
      cwd: process.cwd(),
      env: {
        OPS_API_TOKEN: 'test-token-12345',
        OPS_TELEGRAM_ENABLED: 'false',
        OPS_BROWSER_ENABLED: 'true',
        OPS_BROWSER_TRANSPORT: 'stdio',
        OPS_BROWSER_EXECUTABLE: 'definitely-missing-scrapling'
      }
    });

    const result = validateControlPlaneConfig(config, {
      cwd: process.cwd(),
      env: {
        OPS_API_TOKEN: 'test-token-12345'
      }
    });

    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.warnings.some((issue) => issue.code === 'browser_executable_missing')).toBe(true);
    expect(result.errors.some((issue) => issue.path === 'runtime.adapters.browser:scrapling.command')).toBe(false);
    expect(result.binaryAvailability.some((entry) => entry.name === 'browser:scrapling' && entry.required)).toBe(false);
  });

  it('fails clearly when http transport is selected without a base url', () => {
    const config = loadConfig({
      cwd: process.cwd(),
      env: {
        OPS_API_TOKEN: 'test-token-12345',
        OPS_TELEGRAM_ENABLED: 'false',
        OPS_BROWSER_ENABLED: 'false'
      }
    });

    config.browser.enabled = true;
    config.browser.transport = 'http';
    config.browser.httpBaseUrl = undefined;

    const result = validateControlPlaneConfig(config, {
      cwd: process.cwd(),
      env: {
        OPS_API_TOKEN: 'test-token-12345'
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.code === 'browser_http_base_url_missing')).toBe(true);
  });

  it('treats executable browser wrapper paths as installed in doctor diagnostics', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-browser-config-validator-'));
    const executable = path.join(root, 'fake-scrapling.sh');
    fs.writeFileSync(executable, '#!/bin/sh\nexit 0\n', 'utf8');
    fs.chmodSync(executable, 0o755);

    const config = loadConfig({
      cwd: root,
      env: {
        OPS_API_TOKEN: 'test-token-12345',
        OPS_TELEGRAM_ENABLED: 'false',
        OPS_BROWSER_ENABLED: 'true',
        OPS_BROWSER_TRANSPORT: 'stdio',
        OPS_BROWSER_EXECUTABLE: executable
      }
    });

    const result = validateControlPlaneConfig(config, {
      cwd: root,
      env: {
        OPS_API_TOKEN: 'test-token-12345'
      }
    });

    expect(result.binaryAvailability.find((entry) => entry.name === 'browser:scrapling')?.installed).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'browser_executable_missing')).toBe(false);
  });
});
