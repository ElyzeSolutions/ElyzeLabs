import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../../src/index.ts';

describe('config loader', () => {
  it('rejects plaintext secrets in disk config by default', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-config-plain-secret-'));
    const configPath = path.join(directory, 'config.yaml');

    fs.writeFileSync(
      configPath,
      [
        'server:',
        '  apiToken: super-secret-token-value-123456',
        'memory:',
        '  embedding:',
        '    provider: noop'
      ].join('\n')
    );

    expect(() =>
      loadConfig({
        configPath,
        cwd: directory,
        env: {
          NODE_ENV: 'production'
        }
      })
    ).toThrowError(ConfigError);
  });

  it('supports server company name override for seeded CEO profile branding', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-config-company-'));
    const loaded = loadConfig({
      cwd: directory,
      env: {
        OPS_API_TOKEN: 'test-token-12345',
        OPS_COMPANY_NAME: 'Acme Labs'
      }
    });

    expect(loaded.server.companyName).toBe('Acme Labs');
  });

  it('accepts canonical telegram and voyage env aliases', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-config-env-aliases-'));
    const loaded = loadConfig({
      cwd: directory,
      env: {
        OPS_API_TOKEN: 'test-token-12345',
        TELEGRAM_BOT_TOKEN: '123456:abcdefghijklmnopqrstuvwxyzABCD',
        VOYAGE_API_KEY: 'voyage-test-key-000000'
      }
    });

    expect(loaded.channel.telegram.botToken).toBe('123456:abcdefghijklmnopqrstuvwxyzABCD');
    expect(loaded.memory.embedding.voyageApiKey).toBe('voyage-test-key-000000');
  });

  it('includes global agent-skills path in default discovery directories', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-config-defaults-'));
    const loaded = loadConfig({
      cwd: directory,
      env: {
        OPS_API_TOKEN: 'test-token-12345'
      }
    });

    expect(loaded.skills.directories).toEqual(['skills', '.ops/skills', '~/.agents/skills']);
  });

  it('supports browser capability env overrides for provider, transport, and domain policy', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-config-browser-overrides-'));
    const loaded = loadConfig({
      cwd: directory,
      env: {
        OPS_API_TOKEN: 'test-token-12345',
        OPS_TELEGRAM_ENABLED: 'false',
        OPS_BROWSER_ENABLED: 'true',
        OPS_BROWSER_PROVIDER: 'scrapling',
        OPS_BROWSER_TRANSPORT: 'http',
        OPS_BROWSER_HTTP_BASE_URL: 'http://127.0.0.1:3001',
        OPS_BROWSER_ALLOWED_DOMAINS: 'example.com,docs.example.com',
        OPS_BROWSER_DENIED_DOMAINS: 'blocked.example.com',
        OPS_BROWSER_ALLOW_STEALTH: 'true'
      }
    });

    expect(loaded.browser.enabled).toBe(true);
    expect(loaded.browser.provider).toBe('scrapling');
    expect(loaded.browser.transport).toBe('http');
    expect(loaded.browser.httpBaseUrl).toBe('http://127.0.0.1:3001');
    expect(loaded.browser.policy.allowedDomains).toEqual(['example.com', 'docs.example.com']);
    expect(loaded.browser.policy.deniedDomains).toEqual(['blocked.example.com']);
    expect(loaded.browser.policy.allowStealth).toBe(true);
  });

  it('fails with precise field diagnostics when required token missing', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-config-'));
    const configPath = path.join(directory, 'config.yaml');

    fs.writeFileSync(
      configPath,
      [
        'server:',
        '  host: 127.0.0.1',
        '  port: 8788',
        '  corsOrigin: \"*\"',
        '  apiToken: test-token-12345',
        '  logLevel: info',
        'channel:',
        '  telegram:',
        '    enabled: true',
        '    useWebhook: false',
        '    dmScope: peer',
        '    requireMentionInGroups: true',
        '    allowlist: []',
        'queue:',
        '  defaultLane: default',
        '  laneConcurrency:',
        '    default: 1',
        '  retry:',
        '    maxAttempts: 3',
        '    baseDelayMs: 100',
        '    maxDelayMs: 1000',
        'runtime:',
        '  defaultRuntime: codex',
        '  workspaceRoot: .',
        '  adapters:',
        '    codex: { command: codex, args: [] }',
        '    claude: { command: claude, args: [] }',
        '    gemini: { command: gemini, args: [] }',
        '    process: { command: node, args: [\"-e\", \"console.log(1)\"] }',
        'memory:',
        '  enabled: true',
        '  writeStructured: true',
        '  workspaceMemoryFile: MEMORY.md',
        '  dailyMemoryDir: .daily',
        '  retentionDays: 30',
        '  embedding:',
        '    provider: noop',
        'vault:',
        '  enabled: false',
        'skills:',
        '  directories: [skills]',
        '  sandboxDefault: true',
        'policy:',
        '  requirePairing: true',
        '  allowElevatedExecution: false',
        '  elevatedApprover: operator',
        'observability:',
        '  eventBufferSize: 100',
        '  metricsWindowSec: 60',
        'office:',
        '  enabled: true',
        '  defaultLayoutName: Main',
        'persistence:',
        '  sqlitePath: state.db'
      ].join('\n')
    );

    expect(() => loadConfig({ configPath, cwd: directory })).toThrowError(ConfigError);

    try {
      loadConfig({ configPath, cwd: directory });
    } catch (error) {
      const configError = error as ConfigError;
      expect(configError.diagnostics.some((item) => item.toLowerCase().includes('channel.telegram.enabled=true and vault.enabled=false'))).toBe(true);
    }
  });

  it('rejects unknown keys instead of silently ignoring them', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-config-'));
    const configPath = path.join(directory, 'config.yaml');

    fs.writeFileSync(
      configPath,
      [
        'server:',
        '  apiToken: test-token-12345',
        'mysteryKey: true',
        'memory:',
        '  embedding:',
        '    provider: noop'
      ].join('\n')
    );

    expect(() => loadConfig({ configPath, cwd: directory })).toThrowError(ConfigError);
  });

  it('allows vault-first config without explicit secret pointers when vault is enabled', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-config-'));
    const configPath = path.join(directory, 'config.yaml');

    fs.writeFileSync(
      configPath,
      [
        'server:',
        '  host: 127.0.0.1',
        '  port: 8788',
        '  corsOrigin: \"*\"',
        '  apiToken: test-token-12345',
        'channel:',
        '  telegram:',
        '    enabled: true',
        '    useWebhook: false',
        '    dmScope: peer',
        '    requireMentionInGroups: true',
        '    allowlist: []',
        'queue:',
        '  defaultLane: default',
        '  laneConcurrency:',
        '    default: 1',
        '  retry:',
        '    maxAttempts: 3',
        '    baseDelayMs: 100',
        '    maxDelayMs: 1000',
        'runtime:',
        '  defaultRuntime: codex',
        '  workspaceRoot: .',
        '  adapters:',
        '    codex: { command: codex, args: [] }',
        '    claude: { command: claude, args: [] }',
        '    gemini: { command: gemini, args: [] }',
        '    process: { command: node, args: [\"-e\", \"console.log(1)\"] }',
        'memory:',
        '  enabled: true',
        '  writeStructured: true',
        '  workspaceMemoryFile: MEMORY.md',
        '  dailyMemoryDir: .daily',
        '  retentionDays: 30',
        '  embedding:',
        '    provider: voyage',
        'skills:',
        '  directories: [skills]',
        '  sandboxDefault: true',
        'policy:',
        '  requirePairing: true',
        '  allowElevatedExecution: false',
        '  elevatedApprover: operator',
        'observability:',
        '  eventBufferSize: 100',
        '  metricsWindowSec: 60',
        'office:',
        '  enabled: true',
        '  defaultLayoutName: Main',
        'persistence:',
        '  sqlitePath: state.db',
        'vault:',
        '  enabled: true'
      ].join('\n')
    );

    const loaded = loadConfig({ configPath, cwd: directory });
    expect(loaded.channel.telegram.enabled).toBe(true);
    expect(loaded.channel.telegram.botToken).toBeUndefined();
    expect(loaded.memory.embedding.provider).toBe('voyage');
    expect(loaded.memory.embedding.voyageApiKey).toBeUndefined();
    expect(loaded.vault.enabled).toBe(true);
  });

  it('supports env overrides for workspace strategy and skill catalog controls', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-config-'));
    const configPath = path.join(directory, 'config.yaml');

    fs.writeFileSync(
      configPath,
      [
        'server:',
        '  host: 127.0.0.1',
        '  port: 8788',
        '  corsOrigin: \"*\"',
        '  apiToken: test-token-12345',
        '  logLevel: info',
        'channel:',
        '  telegram:',
        '    enabled: false',
        '    botToken: \"\"',
        '    useWebhook: false',
        '    dmScope: peer',
        '    requireMentionInGroups: true',
        '    allowlist: []',
        'queue:',
        '  defaultLane: default',
        '  laneConcurrency:',
        '    default: 1',
        '  retry:',
        '    maxAttempts: 3',
        '    baseDelayMs: 100',
        '    maxDelayMs: 1000',
        'runtime:',
        '  defaultRuntime: codex',
        '  workspaceRoot: .',
        '  adapters:',
        '    codex: { command: codex, args: [] }',
        '    claude: { command: claude, args: [] }',
        '    gemini: { command: gemini, args: [] }',
        '    process: { command: node, args: [\"-e\", \"console.log(1)\"] }',
        'memory:',
        '  enabled: true',
        '  writeStructured: true',
        '  workspaceMemoryFile: MEMORY.md',
        '  dailyMemoryDir: .daily',
        '  retentionDays: 30',
        '  embedding:',
        '    provider: noop',
        'skills:',
        '  directories: [skills]',
        '  sandboxDefault: true',
        'policy:',
        '  requirePairing: true',
        '  allowElevatedExecution: false',
        '  elevatedApprover: operator',
        'observability:',
        '  eventBufferSize: 100',
        '  metricsWindowSec: 60',
        'office:',
        '  enabled: true',
        '  defaultLayoutName: Main',
        'persistence:',
        '  sqlitePath: state.db'
      ].join('\n')
    );

    const loaded = loadConfig({
      configPath,
      cwd: directory,
      env: {
        OPS_RUNTIME_WORKSPACE_STRATEGY: 'shared',
        OPS_RUNTIME_WORKSPACE_ROOT: '/tmp/workspaces',
        OPS_OPENROUTER_API_KEY: 'vault://providers.openrouter_api_key',
        OPS_SKILLS_DIRECTORIES: 'skills,/opt/skills',
        OPS_SKILLS_CATALOG_STRICT: 'true',
        OPS_TELEGRAM_ENABLED: 'false',
        OPS_OBSERVABILITY_EVENT_BUFFER_SIZE: '750',
        OPS_OBSERVABILITY_METRICS_WINDOW_SEC: '120',
        OPS_OFFICE_ENABLED: 'false',
        OPS_OFFICE_DEFAULT_LAYOUT_NAME: 'Night Shift'
      }
    });

    expect(loaded.runtime.workspaceStrategy).toBe('shared');
    expect(loaded.runtime.workspaceRoot).toBe('/tmp/workspaces');
    expect(loaded.runtime.openrouterApiKey).toBe('vault://providers.openrouter_api_key');
    expect(loaded.skills.directories).toEqual(['skills', '/opt/skills']);
    expect(loaded.skills.catalogStrict).toBe(true);
    expect(loaded.observability.eventBufferSize).toBe(750);
    expect(loaded.observability.metricsWindowSec).toBe(120);
    expect(loaded.office.enabled).toBe(false);
    expect(loaded.office.defaultLayoutName).toBe('Night Shift');
  });

  it('accepts vault references for required secret fields', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-config-'));
    const configPath = path.join(directory, 'config.yaml');

    fs.writeFileSync(
      configPath,
      [
        'server:',
        '  apiToken: test-token-12345',
        'channel:',
        '  telegram:',
        '    enabled: true',
        '    botToken: vault://telegram.bot_token',
        '    useWebhook: false',
        '    dmScope: peer',
        '    requireMentionInGroups: true',
        '    allowlist: []',
        'queue:',
        '  defaultLane: default',
        '  laneConcurrency:',
        '    default: 1',
        '  retry:',
        '    maxAttempts: 3',
        '    baseDelayMs: 100',
        '    maxDelayMs: 1000',
        'runtime:',
        '  defaultRuntime: codex',
        '  workspaceRoot: .',
        '  openrouterApiKey: vault://providers.openrouter_api_key',
        '  adapters:',
        '    codex: { command: codex, args: [] }',
        '    claude: { command: claude, args: [] }',
        '    gemini: { command: gemini, args: [] }',
        '    process: { command: node, args: [\"-e\", \"console.log(1)\"] }',
        'memory:',
        '  enabled: true',
        '  writeStructured: true',
        '  workspaceMemoryFile: MEMORY.md',
        '  dailyMemoryDir: .daily',
        '  retentionDays: 30',
        '  embedding:',
        '    provider: voyage',
        '    voyageApiKey: vault://providers.voyage_api_key',
        'skills:',
        '  directories: [skills]',
        '  sandboxDefault: true',
        'policy:',
        '  requirePairing: true',
        '  allowElevatedExecution: false',
        '  elevatedApprover: operator',
        'observability:',
        '  eventBufferSize: 100',
        '  metricsWindowSec: 60',
        'office:',
        '  enabled: true',
        '  defaultLayoutName: Main',
        'persistence:',
        '  sqlitePath: state.db'
      ].join('\n')
    );

    const loaded = loadConfig({ configPath, cwd: directory });
    expect(loaded.channel.telegram.botToken).toBe('vault://telegram.bot_token');
    expect(loaded.memory.embedding.voyageApiKey).toBe('vault://providers.voyage_api_key');
    expect(loaded.runtime.openrouterApiKey).toBe('vault://providers.openrouter_api_key');
  });

  it('supports installer policy, auto-remember policy, and embedding vector mode overrides', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-config-'));
    const configPath = path.join(directory, 'config.yaml');

    fs.writeFileSync(
      configPath,
      [
        'server:',
        '  apiToken: test-token-12345',
        'memory:',
        '  embedding:',
        '    provider: noop',
        'skills:',
        '  directories: [skills]',
        '  sandboxDefault: true'
      ].join('\n')
    );

    const loaded = loadConfig({
      configPath,
      cwd: directory,
      env: {
        OPS_MEMORY_AUTO_REMEMBER_ENABLED: 'true',
        OPS_MEMORY_AUTO_REMEMBER_TRIGGER_STATUSES: 'completed,failed',
        OPS_MEMORY_AUTO_REMEMBER_MIN_SIGNIFICANCE: '5',
        OPS_MEMORY_AUTO_REMEMBER_MAX_ENTRY_CHARS: '1800',
        OPS_MEMORY_AUTO_REMEMBER_INCLUDE_CHANNELS: 'telegram',
        OPS_MEMORY_EMBEDDING_VECTOR_MODE: 'sqlite_ann',
        OPS_SKILLS_INSTALLER_ENABLED: 'true',
        OPS_SKILLS_INSTALLER_ALLOWED_SOURCES: 'vercel-labs/*,openai/*',
        OPS_SKILLS_INSTALLER_BLOCKED_SOURCES: 'bad-actor/*',
        OPS_SKILLS_INSTALLER_REQUIRE_APPROVAL: 'true',
        OPS_SKILLS_INSTALLER_TIMEOUT_MS: '60000',
        OPS_SKILLS_INSTALLER_MAX_ATTEMPTS: '3',
        OPS_SKILLS_INSTALLER_INSTALL_ROOT: '.ops/skills'
      }
    });

    expect(loaded.memory.autoRemember.enabled).toBe(true);
    expect(loaded.memory.autoRemember.triggerStatuses).toEqual(['completed', 'failed']);
    expect(loaded.memory.autoRemember.minSignificance).toBe(5);
    expect(loaded.memory.autoRemember.maxEntryChars).toBe(1800);
    expect(loaded.memory.autoRemember.includeChannels).toEqual(['telegram']);
    expect(loaded.memory.embedding.vectorMode).toBe('sqlite_ann');
    expect(loaded.skills.installer.enabled).toBe(true);
    expect(loaded.skills.installer.allowedSources).toEqual(['vercel-labs/*', 'openai/*']);
    expect(loaded.skills.installer.blockedSources).toEqual(['bad-actor/*']);
    expect(loaded.skills.installer.timeoutMs).toBe(60000);
    expect(loaded.skills.installer.maxAttempts).toBe(3);
    expect(loaded.skills.installer.installRoot).toBe('.ops/skills');
  });

});
