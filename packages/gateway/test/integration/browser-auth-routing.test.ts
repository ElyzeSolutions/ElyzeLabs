import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createFirefoxLocalProfileFixture,
  installFakeOpenCommand
} from './browser-local-profile-fixtures.js';
import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

interface TelegramIngressBody {
  status: string;
  sessionId?: string;
  runId?: string;
}

const createTelegramPayload = (input: {
  updateId: number;
  senderId: number;
  text: string;
  username?: string;
}) => ({
  update_id: input.updateId,
  message: {
    text: input.text,
    chat: { id: input.senderId, type: 'private' },
    from: {
      id: input.senderId,
      username: input.username ?? `user${input.senderId}`
    },
    mentioned: true
  }
});

function installFakeScraplingExecutable(root: string): string {
  const executablePath = path.join(root, 'fake-scrapling-auth-routing.mjs');
  fs.writeFileSync(
    executablePath,
    [
      '#!/usr/bin/env node',
      'import fs from "node:fs";',
      'import path from "node:path";',
      '',
      'const args = process.argv.slice(2);',
      'const normalizeTool = (value) => String(value ?? "").replace(/-/g, "_");',
      'const buildBody = ({ tool, url, selector = "", cookies = {}, headers = {} }) => {',
      '  const normalizedTool = normalizeTool(tool);',
      '  const cookieNames = Array.isArray(cookies) ? cookies.map((entry) => entry?.name).filter(Boolean).sort() : Object.keys(cookies).sort();',
      '  const sessionCookie = Array.isArray(cookies) ? (cookies.find((entry) => entry?.name === "sessionid" || entry?.name === "sid_tt")?.value ?? "missing") : (cookies.sessionid ?? cookies.sid_tt ?? "missing");',
      '  if (url.includes("dynamic-session-profile-proof") && normalizedTool === "get") {',
      '    return "Dynamic Page Title";',
      '  }',
      '  return [',
      '    `Tool: ${normalizedTool}`,',
      '    `URL: ${url}`,',
      '    selector ? `Selector: ${selector}` : "",',
      '    `HeaderKeys: ${Object.keys(headers).sort().join(",") || "none"}`,',
      '    `CookieKeys: ${cookieNames.join(",") || "none"}`,',
      '    `SessionCookie: ${sessionCookie}`,',
      '    "Followers: 15.2K",',
      '    "Following: 182",',
      '    "Likes: 128.4K"',
      '  ].filter(Boolean).join("\\n");',
      '};',
      '',
      'if ((args[0] ?? "") === "extract") {',
      '  const tool = args[1] ?? "get";',
      '  const url = args[2] ?? "";',
      '  const artifactPath = args[3] ?? "";',
      '  const selectorIndex = args.indexOf("--css-selector");',
      '  const selector = selectorIndex >= 0 ? (args[selectorIndex + 1] ?? "") : "";',
      '  const body = buildBody({ tool, url, selector });',
      '  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });',
      '  fs.writeFileSync(artifactPath, body, "utf8");',
      '  process.stdout.write(body);',
      '  process.exit(0);',
      '}',
      '',
      'if ((args[0] ?? "") === "mcp") {',
      '  let buffer = "";',
      '  const write = (payload) => process.stdout.write(`${JSON.stringify(payload)}\\n`);',
      '  process.stdin.on("data", (chunk) => {',
      '    buffer += chunk.toString("utf8");',
      '    const lines = buffer.split(/\\r?\\n/);',
      '    buffer = lines.pop() ?? "";',
      '    for (const line of lines) {',
      '      if (!line.trim()) continue;',
      '      const message = JSON.parse(line);',
      '      if (message.method === "initialize" && message.id) {',
      '        write({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake-scrapling", version: "1.0.0" } } });',
      '        continue;',
      '      }',
      '      if (message.method === "tools/call" && message.id) {',
      '        const tool = message.params?.name ?? "get";',
      '        const toolArgs = message.params?.arguments ?? {};',
      '        const url = toolArgs.url ?? toolArgs.urls?.[0] ?? "";',
      '        const selector = toolArgs.css_selector ?? "";',
      '        const headers = toolArgs.headers ?? toolArgs.extra_headers ?? {};',
      '        const cookies = toolArgs.cookies ?? {};',
      '        const body = buildBody({ tool, url, selector, headers, cookies });',
      '        write({',
      '          jsonrpc: "2.0",',
      '          id: message.id,',
      '          result: {',
      '            content: [{ type: "text", text: body }],',
      '            structuredContent: { status: 200, content: [body], url },',
      '            isError: false',
      '          }',
      '        });',
      '      }',
      '    }',
      '  });',
      '  process.stdin.resume();',
      '  process.on("SIGTERM", () => process.exit(0));',
      '  process.on("SIGINT", () => process.exit(0));',
      '} else {',
      '  console.error("unsupported command");',
      '  process.exit(1);',
      '}'
    ].join('\n'),
    'utf8'
  );
  fs.chmodSync(executablePath, 0o755);
  return executablePath;
}

const applyCeoBaseline = async (harness: GatewayTestHarness): Promise<void> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/onboarding/ceo-baseline',
    payload: {
      actor: 'browser-auth-routing-test'
    }
  });
  expect(response.statusCode).toBe(200);
};

const findTelegramSessionId = async (harness: GatewayTestHarness): Promise<string> => {
  const response = await harness.inject({
    method: 'GET',
    url: '/api/sessions'
  });
  expect(response.statusCode).toBe(200);
  const body = response.json() as {
    sessions: Array<{ id: string; channel: string }>;
  };
  const telegramSession = body.sessions.find((session) => session.channel === 'telegram');
  expect(telegramSession?.id).toBeTruthy();
  return telegramSession!.id;
};

describe('browser auth routing integration', () => {
  const harnesses: GatewayTestHarness[] = [];
  const originalFetch = globalThis.fetch;
  const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
  const originalPath = process.env.PATH;
  const originalFirefoxProfileRoot = process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT;
  const originalFirefoxBinary = process.env.OPS_BROWSER_VISIBLE_FIREFOX_BIN;

  afterEach(async () => {
    if (originalGoogleApiKey === undefined) {
      delete process.env.GOOGLE_API_KEY;
    } else {
      process.env.GOOGLE_API_KEY = originalGoogleApiKey;
    }
    process.env.PATH = originalPath;
    if (originalFirefoxProfileRoot === undefined) {
      delete process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT;
    } else {
      process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT = originalFirefoxProfileRoot;
    }
    if (originalFirefoxBinary === undefined) {
      delete process.env.OPS_BROWSER_VISIBLE_FIREFOX_BIN;
    } else {
      process.env.OPS_BROWSER_VISIBLE_FIREFOX_BIN = originalFirefoxBinary;
    }
    vi.stubGlobal(
      'fetch',
      (originalFetch ?? (async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))) as typeof fetch
    );
    while (harnesses.length > 0) {
      await harnesses.pop()!.close();
    }
  });

  it(
    'applies sticky Telegram browser auth profiles to governed Scrapling requests',
    async () => {
    process.env.GOOGLE_API_KEY = 'integration-google-key';
    const telegramSends: string[] = [];
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.telegram.org')) {
        const method = url.split('/').pop() ?? '';
        const body = init?.body ? (JSON.parse(String(init.body)) as { text?: string }) : {};
        if (method === 'getUpdates' || method === 'sendChatAction' || method === 'sendMessageDraft') {
          return new Response(JSON.stringify({ ok: true, result: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        if (method === 'sendMessage') {
          telegramSends.push(String(body.text ?? ''));
          return new Response(JSON.stringify({ ok: true, result: { message_id: telegramSends.length || 1 } }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        if (method === 'editMessageText' || method === 'deleteMyCommands' || method === 'setMyCommands') {
          return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const harness = await createGatewayTestHarness('browser-auth-routing-telegram', (config) => {
      config.channel.telegram.botToken = '123456:ABCDEFGHIJKLMNOPQRSTUVWXyz_123456789';
      config.browser.enabled = true;
      config.browser.transport = 'stdio';
      config.browser.executable = installFakeScraplingExecutable(config.runtime.workspaceRoot);
      config.browser.allowedAgents = ['ceo-default'];
    });
    harnesses.push(harness);

    await applyCeoBaseline(harness);

    const runtimeResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: createTelegramPayload({
        updateId: 83010,
        senderId: 8301,
        text: '/runtime process',
        username: 'browserauth'
      })
    });
    expect(runtimeResponse.statusCode).toBe(200);

    const telegramSessionId = await findTelegramSessionId(harness);

    const importCookieResponse = await harness.inject({
      method: 'POST',
      url: '/api/browser/cookie-jars/import',
      payload: {
        sessionId: telegramSessionId,
        label: 'Example auth cookies',
        domains: ['example.com'],
        sourceKind: 'raw_cookie_header',
        raw: 'sessionid=abc123; csrftoken=csrf456'
      }
    });
    expect(importCookieResponse.statusCode).toBe(200);
    const cookieJarId = (importCookieResponse.json() as { cookieJar: { id: string } }).cookieJar.id;

    const sessionProfileResponse = await harness.inject({
      method: 'POST',
      url: '/api/browser/session-profiles/upsert',
      payload: {
        sessionId: telegramSessionId,
        label: 'Example authenticated session',
        domains: ['example.com'],
        cookieJarId,
        enabled: true
      }
    });
    expect(sessionProfileResponse.statusCode).toBe(200);
    const sessionProfileId = (sessionProfileResponse.json() as { sessionProfile: { id: string } }).sessionProfile.id;

    const selectResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: createTelegramPayload({
        updateId: 83011,
        senderId: 8301,
        text: '/browser use Example authenticated session',
        username: 'browserauth'
      })
    });
    expect(selectResponse.statusCode).toBe(200);
    const selectBody = selectResponse.json() as { status: string; sessionProfileId?: string };
    expect(selectBody.status).toBe('command_applied');
    expect(selectBody.sessionProfileId).toBe(sessionProfileId);

    const db = harness.createDb();
    const telegramSession = db.getSessionById(telegramSessionId);
    expect(telegramSession).toBeDefined();
    const metadata = JSON.parse(telegramSession!.metadataJson) as {
      browserSessionProfileId?: string;
    };
    expect(metadata.browserSessionProfileId).toBe(sessionProfileId);
    db.close();

    const queuedResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: createTelegramPayload({
        updateId: 83012,
        senderId: 8301,
        text: 'Go to https://example.com/dynamic-session-profile-proof and fetch main stats.',
        username: 'browserauth'
      })
    });
    expect(queuedResponse.statusCode).toBe(200);
    const queuedBody = queuedResponse.json() as TelegramIngressBody;
    expect(queuedBody.status).toBe('queued');
    expect(queuedBody.runId).toBeTruthy();

    let traceBody:
      | {
          trace: {
            selectedTool: string | null;
            artifacts: Array<{
              previewText: string;
            }>;
          };
        }
      | null = null;
    await harness.waitForCondition(
      `browser trace for ${queuedBody.runId}`,
      async () => {
        const traceResponse = await harness.inject({
          method: 'GET',
          url: `/api/browser/history/${encodeURIComponent(queuedBody.runId!)}`
        });
        if (traceResponse.statusCode !== 200) {
          return false;
        }
        traceBody = traceResponse.json() as {
          trace: {
            selectedTool: string | null;
            artifacts: Array<{
              previewText: string;
            }>;
          };
        };
        return (traceBody?.trace.artifacts.length ?? 0) > 0;
      },
      15_000
    );
    expect(traceBody).not.toBeNull();
    expect(traceBody.trace.selectedTool).toBe('fetch');
    expect(traceBody.trace.artifacts[0]?.previewText).toContain('CookieKeys:');
    expect(traceBody.trace.artifacts[0]?.previewText).toContain('sessionid');
    expect(traceBody.trace.artifacts[0]?.previewText).toContain('SessionCookie: abc123');
    expect(telegramSends.join('\n')).toContain('Example authenticated session');

    const clearResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: createTelegramPayload({
        updateId: 83013,
        senderId: 8301,
        text: '/browser clear',
        username: 'browserauth'
      })
    });
    expect(clearResponse.statusCode).toBe(200);

    const dbAfterClear = harness.createDb();
    const clearedSession = dbAfterClear.getSessionById(telegramSessionId);
    const clearedMetadata = JSON.parse(clearedSession!.metadataJson) as {
      browserSessionProfileId?: string;
    };
    expect(clearedMetadata.browserSessionProfileId).toBeUndefined();
    dbAfterClear.close();
    },
    20_000
  );

  it(
    'guides Telegram login capture and saves a session-only imported browser profile for the active chat',
    async () => {
      process.env.GOOGLE_API_KEY = 'integration-google-key';
      const telegramSends: string[] = [];
      const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('api.telegram.org')) {
          const method = url.split('/').pop() ?? '';
          const body = init?.body ? (JSON.parse(String(init.body)) as { text?: string }) : {};
          if (method === 'getUpdates' || method === 'sendChatAction' || method === 'sendMessageDraft') {
            return new Response(JSON.stringify({ ok: true, result: true }), {
              status: 200,
              headers: { 'content-type': 'application/json' }
            });
          }
          if (method === 'sendMessage') {
            telegramSends.push(String(body.text ?? ''));
            return new Response(JSON.stringify({ ok: true, result: { message_id: telegramSends.length || 1 } }), {
              status: 200,
              headers: { 'content-type': 'application/json' }
            });
          }
          if (method === 'editMessageText' || method === 'deleteMyCommands' || method === 'setMyCommands') {
            return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
              status: 200,
              headers: { 'content-type': 'application/json' }
            });
          }
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      });
      vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

      const harness = await createGatewayTestHarness('browser-auth-routing-connect-save', (config) => {
        const localProfileHome = path.join(config.runtime.workspaceRoot, 'local-browser-home');
        createFirefoxLocalProfileFixture(localProfileHome, {
          sessionCookie: 'reddit-session',
          domain: '.reddit.com'
        });
        const fakeOpen = installFakeOpenCommand(config.runtime.workspaceRoot);
        process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT = path.join(
          localProfileHome,
          'Library',
          'Application Support',
          'Firefox'
        );
        process.env.OPS_BROWSER_VISIBLE_FIREFOX_BIN = path.join(config.runtime.workspaceRoot, 'missing-firefox');
        process.env.PATH = `${fakeOpen.binDir}:${process.env.PATH ?? ''}`;
        config.channel.telegram.botToken = '123456:ABCDEFGHIJKLMNOPQRSTUVWXyz_123456789';
        config.browser.enabled = true;
        config.browser.transport = 'stdio';
        config.browser.executable = installFakeScraplingExecutable(config.runtime.workspaceRoot);
        config.browser.allowedAgents = ['ceo-default'];
      });
      harnesses.push(harness);

      await applyCeoBaseline(harness);

      const runtimeResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 84010,
          senderId: 8401,
          text: '/runtime process',
          username: 'browserconnect'
        })
      });
      expect(runtimeResponse.statusCode).toBe(200);

      const connectResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 84011,
          senderId: 8401,
          text: '/browser connect reddit firefox',
          username: 'browserconnect'
        })
      });
      expect(connectResponse.statusCode).toBe(200);
      const connectBody = connectResponse.json() as { status: string };
      expect(connectBody.status).toBe('command_applied');
      const fakeOpenLogPath = path.join(harness.config.runtime.workspaceRoot, 'fake-open.log');
      await harness.waitForCondition(
        'telegram browser connect fake open log',
        async () => fs.existsSync(fakeOpenLogPath) && fs.readFileSync(fakeOpenLogPath, 'utf8').includes('https://www.reddit.com/'),
        5_000
      );
      const fakeOpenLog = fs.readFileSync(fakeOpenLogPath, 'utf8');
      expect(fakeOpenLog).toContain('-a');
      expect(fakeOpenLog).toContain('Firefox');
      expect(fakeOpenLog).toContain('https://www.reddit.com/');

      const telegramSessionId = await findTelegramSessionId(harness);
      const dbAfterConnect = harness.createDb();
      const telegramSessionAfterConnect = dbAfterConnect.getSessionById(telegramSessionId);
      expect(telegramSessionAfterConnect).toBeDefined();
      const connectMetadata = JSON.parse(telegramSessionAfterConnect!.metadataJson) as {
        browserConnectDraft?: {
          siteKey?: string;
          browserKind?: string;
        };
      };
      expect(connectMetadata.browserConnectDraft).toMatchObject({
        siteKey: 'reddit',
        browserKind: 'firefox'
      });
      dbAfterConnect.close();

      const saveResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 84012,
          senderId: 8401,
          text: '/browser save reddit firefox',
          username: 'browserconnect'
        })
      });
      expect(saveResponse.statusCode).toBe(200);
      const saveBody = saveResponse.json() as { status: string; sessionProfileId?: string };
      expect(saveBody.status).toBe('command_applied');
      expect(saveBody.sessionProfileId).toBeTruthy();

      const dbAfterSave = harness.createDb();
      const savedSession = dbAfterSave.getSessionById(telegramSessionId);
      const savedMetadata = JSON.parse(savedSession!.metadataJson) as {
        browserSessionProfileId?: string;
        browserConnectDraft?: unknown;
      };
      expect(savedMetadata.browserSessionProfileId).toBe(saveBody.sessionProfileId);
      expect(savedMetadata.browserConnectDraft).toBeUndefined();
      const savedProfile = dbAfterSave.getBrowserSessionProfileById(saveBody.sessionProfileId!);
      expect(savedProfile).toBeDefined();
      expect(savedProfile?.visibility).toBe('session_only');
      expect(JSON.parse(savedProfile?.allowedSessionIdsJson ?? '[]')).toEqual([telegramSessionId]);
      expect(savedProfile?.browserKind).toBe('firefox');
      expect(savedProfile?.browserProfileName).toBe('Personal Firefox');
      expect(savedProfile?.lastVerificationStatus).toBe('connected');
      dbAfterSave.close();

      expect(telegramSends.join('\n')).toContain('Finish logging in');
      expect(telegramSends.join('\n')).toContain('Saved Reddit');
    },
    20_000
  );
});
