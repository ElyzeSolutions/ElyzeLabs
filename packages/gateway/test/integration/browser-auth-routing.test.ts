import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createFirefoxLocalProfileFixture,
  createZenLocalProfileFixture,
  installFakeOpenCommand
} from './browser-local-profile-fixtures.js';
import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';
import type { BrowserInteractiveProvider } from '../../src/browser-interactive-service.js';

interface TelegramIngressBody {
  status: string;
  sessionId?: string;
  runId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  expect(isRecord(value), `${label} should be an object`).toBe(true);
  if (isRecord(value)) {
    return value;
  }
  return {};
}

function recordsField(record: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = record[key];
  expect(Array.isArray(value), `${key} should be an array`).toBe(true);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry, index) => expectRecord(entry, `${key}[${index}]`));
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
      '  if (url.includes("x.com/home")) {',
      '    return ["(2) Home / X", "JavaScript is not available.", "Please enable JavaScript or switch to a supported browser to continue using x.com."].join("\\n");',
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

const stubTelegramFetch = (telegramSends: string[]): void => {
  const fetchMock = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('api.telegram.org')) {
      const method = url.split('/').pop() ?? '';
      const body = init?.body ? JSON.parse(String(init.body)) : {};
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
  };
  vi.stubGlobal('fetch', fetchMock);
};

describe('browser auth routing integration', () => {
  const harnesses: GatewayTestHarness[] = [];
  const originalFetch = globalThis.fetch;
  const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
  const originalPath = process.env.PATH;
  const originalFirefoxProfileRoot = process.env.OPS_BROWSER_FIREFOX_PROFILE_ROOT;
  const originalFirefoxBinary = process.env.OPS_BROWSER_VISIBLE_FIREFOX_BIN;
  const originalZenProfileRoot = process.env.OPS_BROWSER_ZEN_PROFILE_ROOT;
  const originalZenBinary = process.env.OPS_BROWSER_VISIBLE_ZEN_BIN;

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
    if (originalZenProfileRoot === undefined) {
      delete process.env.OPS_BROWSER_ZEN_PROFILE_ROOT;
    } else {
      process.env.OPS_BROWSER_ZEN_PROFILE_ROOT = originalZenProfileRoot;
    }
    if (originalZenBinary === undefined) {
      delete process.env.OPS_BROWSER_VISIBLE_ZEN_BIN;
    } else {
      process.env.OPS_BROWSER_VISIBLE_ZEN_BIN = originalZenBinary;
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
    'auto-selects a connected site browser profile from Telegram without /browser use',
    async () => {
      process.env.GOOGLE_API_KEY = 'integration-google-key';
      const telegramSends: string[] = [];
      stubTelegramFetch(telegramSends);

      const harness = await createGatewayTestHarness('browser-auth-routing-auto-site', (config) => {
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
          updateId: 82010,
          senderId: 8201,
          text: '/runtime process',
          username: 'browserauto'
        })
      });
      expect(runtimeResponse.statusCode).toBe(200);

      const telegramSessionId = await findTelegramSessionId(harness);

      const instagramCookieResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/cookie-jars/import',
        payload: {
          sessionId: telegramSessionId,
          label: 'Instagram auth cookies',
          domains: ['instagram.com', 'www.instagram.com'],
          sourceKind: 'raw_cookie_header',
          raw: 'sessionid=ig-session; csrftoken=ig-csrf'
        }
      });
      expect(instagramCookieResponse.statusCode).toBe(200);
      const instagramCookieBody = instagramCookieResponse.json();
      const instagramCookieJarId =
        typeof instagramCookieBody.cookieJar?.id === 'string' ? instagramCookieBody.cookieJar.id : '';
      expect(instagramCookieJarId).toBeTruthy();

      const xCookieResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/cookie-jars/import',
        payload: {
          sessionId: telegramSessionId,
          label: 'X auth cookies',
          domains: ['x.com'],
          sourceKind: 'raw_cookie_header',
          raw: 'sessionid=x-session; ct0=x-csrf'
        }
      });
      expect(xCookieResponse.statusCode).toBe(200);
      const xCookieBody = xCookieResponse.json();
      const xCookieJarId = typeof xCookieBody.cookieJar?.id === 'string' ? xCookieBody.cookieJar.id : '';
      expect(xCookieJarId).toBeTruthy();

      const instagramProfileResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/session-profiles/upsert',
        payload: {
          sessionId: telegramSessionId,
          label: 'Instagram personal login',
          domains: ['instagram.com', 'www.instagram.com'],
          cookieJarId: instagramCookieJarId,
          siteKey: 'instagram',
          useRealChrome: true,
          enabled: true,
          lastVerifiedAt: '2026-05-31T10:00:00.000Z',
          lastVerificationStatus: 'connected'
        }
      });
      expect(instagramProfileResponse.statusCode).toBe(200);
      const instagramProfileBody = instagramProfileResponse.json();
      const instagramProfileId =
        typeof instagramProfileBody.sessionProfile?.id === 'string' ? instagramProfileBody.sessionProfile.id : '';
      expect(instagramProfileId).toBeTruthy();

      const expiringInstagramCookieResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/cookie-jars/import',
        payload: {
          sessionId: telegramSessionId,
          label: 'Instagram expiring auth cookies',
          domains: ['instagram.com', 'www.instagram.com'],
          sourceKind: 'json_cookie_export',
          raw: JSON.stringify([
            {
              name: 'sessionid',
              value: 'ig-expiring-session',
              domain: '.instagram.com',
              path: '/',
              expires: Math.floor((Date.now() + 60 * 60 * 1000) / 1000)
            }
          ])
        }
      });
      expect(expiringInstagramCookieResponse.statusCode).toBe(200);
      const expiringInstagramCookieBody = expiringInstagramCookieResponse.json();
      const expiringInstagramCookieJarId =
        typeof expiringInstagramCookieBody.cookieJar?.id === 'string' ? expiringInstagramCookieBody.cookieJar.id : '';
      expect(expiringInstagramCookieJarId).toBeTruthy();

      const expiringInstagramProfileResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/session-profiles/upsert',
        payload: {
          sessionId: telegramSessionId,
          label: 'Instagram expiring login',
          domains: ['instagram.com', 'www.instagram.com'],
          cookieJarId: expiringInstagramCookieJarId,
          siteKey: 'instagram',
          enabled: true,
          lastVerifiedAt: '2026-05-31T12:00:00.000Z',
          lastVerificationStatus: 'connected'
        }
      });
      expect(expiringInstagramProfileResponse.statusCode).toBe(200);

      const xProfileResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/session-profiles/upsert',
        payload: {
          sessionId: telegramSessionId,
          label: 'X sticky login',
          domains: ['x.com'],
          cookieJarId: xCookieJarId,
          siteKey: 'x',
          enabled: true,
          lastVerifiedAt: '2026-05-31T09:00:00.000Z',
          lastVerificationStatus: 'connected'
        }
      });
      expect(xProfileResponse.statusCode).toBe(200);

      const selectXResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 82011,
          senderId: 8201,
          text: '/browser use X sticky login',
          username: 'browserauto'
        })
      });
      expect(selectXResponse.statusCode).toBe(200);
      expect(selectXResponse.json().status).toBe('command_applied');

      const queuedResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 82012,
          senderId: 8201,
          text: 'Go to Instagram and say whether the logged-in home page is reachable.',
          username: 'browserauto'
        })
      });
      expect(queuedResponse.statusCode).toBe(200);
      const queuedBody = queuedResponse.json();
      const runId = typeof queuedBody.runId === 'string' ? queuedBody.runId : '';
      expect(queuedBody.status).toBe('queued');
      expect(runId).toBeTruthy();

      const runStatus = await harness.waitForTerminalRun(runId, 20_000);
      expect(runStatus.status).toBe('completed');

      let traceBody = null;
      await harness.waitForCondition(
        `auto-selected Instagram browser trace for ${runId}`,
        async () => {
          const traceResponse = await harness.inject({
            method: 'GET',
            url: `/api/browser/history/${encodeURIComponent(runId)}`
          });
          if (traceResponse.statusCode !== 200) {
            return false;
          }
          traceBody = traceResponse.json();
          return (traceBody?.trace?.artifacts?.length ?? 0) > 0;
        },
        15_000
      );
      expect(traceBody?.trace?.artifacts?.[0]?.url).toBe('https://www.instagram.com/');
      expect(traceBody?.trace?.artifacts?.[0]?.previewText).toContain('SessionCookie: ig-session');
      expect(traceBody?.trace?.artifacts?.[0]?.previewText).not.toContain('ig-expiring-session');

      const timelineResponse = await harness.inject({
        method: 'GET',
        url: `/api/runs/${encodeURIComponent(runId)}/timeline`
      });
      expect(timelineResponse.statusCode).toBe(200);
      const timelineBody = timelineResponse.json();
      const timeline = Array.isArray(timelineBody.timeline) ? timelineBody.timeline : [];
      const authEvent = timeline.find((entry) => entry.type === 'browser.auth_profile.resolved');
      expect(authEvent).toBeDefined();
      const authPayload = JSON.parse(String(authEvent?.payloadJson ?? '{}'));
      expect(authPayload.source).toBe('auto_site');
      expect(authPayload.reason).toBe('sticky_profile_mismatched_target_site');
      expect(authPayload.siteKey).toBe('instagram');
      expect(authPayload.selectedSessionProfileId).toBe(instagramProfileId);
      expect(authPayload.targetUrl).toBe('https://www.instagram.com/');
    },
    20_000
  );

  it(
    'reports X JavaScript interstitial captures as browser fallback requirements',
    async () => {
      process.env.GOOGLE_API_KEY = 'integration-google-key';
      const telegramSends: string[] = [];
      stubTelegramFetch(telegramSends);

      const harness = await createGatewayTestHarness('browser-auth-routing-x-dynamic-required', (config) => {
        config.channel.telegram.botToken = '123456:ABCDEFGHIJKLMNOPQRSTUVWXyz_123456789';
        config.browser.enabled = true;
        config.browser.transport = 'stdio';
        config.browser.executable = installFakeScraplingExecutable(config.runtime.workspaceRoot);
        config.browser.allowedAgents = ['ceo-default'];
        config.browser.policy.allowStealth = true;
        config.runtime.adapters.process = {
          command: 'node',
          args: ['-e', 'process.stdin.resume(); process.stdin.on("end", () => process.stdout.write("model should not run"));']
        };
      });
      harnesses.push(harness);
      await applyCeoBaseline(harness);

      const runtimeResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 82099,
          senderId: 8210,
          text: '/runtime process',
          username: 'browserx'
        })
      });
      expect(runtimeResponse.statusCode).toBe(200);

      const seedResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 82100,
          senderId: 8210,
          text: '/browser clear',
          username: 'browserx'
        })
      });
      expect(seedResponse.statusCode).toBe(200);
      const telegramSessionId = await findTelegramSessionId(harness);

      const cookieResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/cookie-jars/import',
        payload: {
          label: 'X interstitial login jar',
          sourceKind: 'manual',
          raw: 'auth_token=x-token',
          sessionId: telegramSessionId
        }
      });
      expect(cookieResponse.statusCode).toBe(200);
      const cookieBody = cookieResponse.json();
      const cookieJarId = typeof cookieBody.cookieJar?.id === 'string' ? cookieBody.cookieJar.id : '';
      expect(cookieJarId).toBeTruthy();

      const profileResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/session-profiles/upsert',
        payload: {
          sessionId: telegramSessionId,
          label: 'X personal login',
          domains: ['x.com'],
          cookieJarId,
          siteKey: 'x',
          enabled: true,
          lastVerifiedAt: '2026-05-31T09:00:00.000Z',
          lastVerificationStatus: 'connected'
        }
      });
      expect(profileResponse.statusCode).toBe(200);
      const profileBody = profileResponse.json();
      const sessionProfileId = typeof profileBody.sessionProfile?.id === 'string' ? profileBody.sessionProfile.id : '';
      expect(sessionProfileId).toBeTruthy();

      const testResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/test',
        payload: {
          url: 'https://x.com/home',
          intent: 'monitor',
          dynamicLikely: true,
          requiresStealth: true,
          sessionProfileId
        }
      });
      expect(testResponse.statusCode).toBe(200);
      const testBody = testResponse.json();
      expect(testBody.run?.status).toBe('failed');
      expect(testBody.run?.error).toBe('dynamic_render_required');
      expect(testBody.test?.blockedReason).toBe('dynamic_render_required');
      expect(testBody.test?.artifacts?.[0]?.previewText).toContain('JavaScript is not available');
    },
    20_000
  );

  it(
    'falls back from Scrapling to interactive rendered reads for Telegram dynamic browser requests',
    async () => {
      process.env.GOOGLE_API_KEY = 'integration-google-key';
      const telegramSends: string[] = [];
      stubTelegramFetch(telegramSends);

      const interactiveProvider = {
        run: vi.fn(async (input) => ({
          schema: 'ops.browser-interactive-run.v1',
          provider: 'test',
          ok: true,
          startedUrl: input.url,
          finalUrl: input.url,
          actions: input.actions.map((action, index) => ({
            index,
            type: action.type,
            ok: true,
            summary: `rendered:${action.type}`,
            selector: action.selector ?? null,
            url: action.url ?? null,
            textPreview: 'Rendered X home page is reachable.',
            error: null
          })),
          artifacts: [
            {
              id: 'interactive_artifact:0:read',
              actionIndex: 0,
              kind: 'read',
              mimeType: 'text/plain',
              sizeBytes: 86,
              contentPreview: 'Rendered X home page\nLogged in account shell visible\nFollowers: 21K\nLatest follower: Example User',
              contentBase64: Buffer.from(
                'Rendered X home page\nLogged in account shell visible\nFollowers: 21K\nLatest follower: Example User',
                'utf8'
              ).toString('base64')
            }
          ],
          error: null
        }))
      } satisfies BrowserInteractiveProvider;

      const harness = await createGatewayTestHarness(
        'browser-auth-routing-interactive-fallback',
        (config) => {
          config.channel.telegram.botToken = '123456:ABCDEFGHIJKLMNOPQRSTUVWXyz_123456789';
          config.browser.enabled = true;
          config.browser.transport = 'stdio';
          config.browser.executable = installFakeScraplingExecutable(config.runtime.workspaceRoot);
          config.browser.allowedAgents = ['ceo-default'];
          config.browser.policy.allowStealth = true;
          config.browser.policy.requireApprovalForStealth = false;
          config.runtime.adapters.process = {
            command: 'node',
            args: ['-e', 'process.stdin.resume(); process.stdin.on("end", () => process.stdout.write("model should not run"));']
          };
        },
        {
          buildOptions: {
            interactiveBrowserProvider: interactiveProvider
          }
        }
      );
      harnesses.push(harness);
      await applyCeoBaseline(harness);

      const runtimeResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 82200,
          senderId: 8220,
          text: '/runtime process',
          username: 'browserfallback'
        })
      });
      expect(runtimeResponse.statusCode).toBe(200);

      const telegramSessionId = await findTelegramSessionId(harness);
      const cookieResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/cookie-jars/import',
        payload: {
          sessionId: telegramSessionId,
          label: 'X interactive fallback cookies',
          domains: ['x.com'],
          sourceKind: 'raw_cookie_header',
          raw: 'auth_token=x-live-token; ct0=x-csrf'
        }
      });
      expect(cookieResponse.statusCode).toBe(200);
      const cookieBody = expectRecord(cookieResponse.json(), 'cookie response');
      const cookieJar = expectRecord(cookieBody.cookieJar, 'cookie jar');
      const cookieJarId = typeof cookieJar.id === 'string' ? cookieJar.id : '';
      expect(cookieJarId).toBeTruthy();

      const profileResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/session-profiles/upsert',
        payload: {
          sessionId: telegramSessionId,
          label: 'X rendered personal login',
          domains: ['x.com'],
          cookieJarId,
          siteKey: 'x',
          browserKind: 'chrome',
          cdpEndpoint: 'http://127.0.0.1:9339',
          enabled: true,
          lastVerifiedAt: '2026-05-31T09:00:00.000Z',
          lastVerificationStatus: 'connected'
        }
      });
      expect(profileResponse.statusCode).toBe(200);
      const profileBody = expectRecord(profileResponse.json(), 'profile response');
      const sessionProfile = expectRecord(profileBody.sessionProfile, 'session profile');
      const sessionProfileId = typeof sessionProfile.id === 'string' ? sessionProfile.id : '';
      expect(sessionProfileId).toBeTruthy();

      const queuedResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 82201,
          senderId: 8220,
          text: 'Go to X and tell me whether my logged-in home page is reachable.',
          username: 'browserfallback'
        })
      });
      expect(queuedResponse.statusCode).toBe(200);
      const queuedBody = expectRecord(queuedResponse.json(), 'queued response');
      const runId = typeof queuedBody.runId === 'string' ? queuedBody.runId : '';
      expect(runId).toBeTruthy();

      const runStatus = await harness.waitForTerminalRun(runId, 20_000);
      expect(runStatus.status).toBe('completed');
      expect(runStatus.error).toBeNull();

      expect(interactiveProvider.run).toHaveBeenCalledTimes(1);
      const firstInteractiveCall = interactiveProvider.run.mock.calls[0];
      expect(firstInteractiveCall).toBeDefined();
      const interactiveInput = firstInteractiveCall?.[0];
      expect(interactiveInput?.url).toBe('https://x.com/home');
      expect(interactiveInput?.actions).toEqual([{ type: 'wait', timeoutMs: 2500 }, { type: 'read' }]);
      expect(interactiveInput?.cookies.some((cookie) => cookie.name === 'auth_token' && cookie.value === 'x-live-token')).toBe(true);
      expect(interactiveInput?.browserProfile?.cdpEndpoint).toBe('http://127.0.0.1:9339');

      const timelineResponse = await harness.inject({
        method: 'GET',
        url: `/api/runs/${encodeURIComponent(runId)}/timeline`
      });
      expect(timelineResponse.statusCode).toBe(200);
      const timelineBody = expectRecord(timelineResponse.json(), 'timeline response');
      const timeline = recordsField(timelineBody, 'timeline');
      const fallbackEvent = timeline.find((entry) => entry.type === 'browser.interactive_fallback.result');
      expect(fallbackEvent).toBeDefined();
      const fallbackPayload = expectRecord(JSON.parse(String(fallbackEvent?.payloadJson ?? '{}')), 'fallback payload');
      expect(fallbackPayload.ok).toBe(true);
      expect(fallbackPayload.sessionProfileId).toBe(sessionProfileId);
      expect(telegramSends.join('\n')).toContain('Verified browser capture for @home: Followers 21K.');
    },
    20_000
  );

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

  it(
    'treats Zen as a Firefox-compatible local profile in Telegram browser connect and save commands',
    async () => {
      const telegramSends: string[] = [];
      stubTelegramFetch(telegramSends);

      const harness = await createGatewayTestHarness('browser-auth-routing-connect-save-zen', (config) => {
        const localProfileHome = path.join(config.runtime.workspaceRoot, 'local-browser-home');
        createZenLocalProfileFixture(localProfileHome, {
          sessionCookie: 'reddit-zen-session',
          domain: '.reddit.com'
        });
        const fakeOpen = installFakeOpenCommand(config.runtime.workspaceRoot);
        process.env.OPS_BROWSER_ZEN_PROFILE_ROOT = path.join(
          localProfileHome,
          'Library',
          'Application Support',
          'zen'
        );
        process.env.OPS_BROWSER_VISIBLE_ZEN_BIN = path.join(config.runtime.workspaceRoot, 'missing-zen');
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
          updateId: 84020,
          senderId: 8402,
          text: '/runtime process',
          username: 'browserzen'
        })
      });
      expect(runtimeResponse.statusCode).toBe(200);

      const connectResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 84021,
          senderId: 8402,
          text: '/browser connect reddit zen',
          username: 'browserzen'
        })
      });
      expect(connectResponse.statusCode).toBe(200);
      const connectBody = expectRecord(connectResponse.json(), 'connect response');
      expect(connectBody.status).toBe('command_applied');

      const fakeOpenLogPath = path.join(harness.config.runtime.workspaceRoot, 'fake-open.log');
      await harness.waitForCondition(
        'telegram browser connect Zen fake open log',
        async () => fs.existsSync(fakeOpenLogPath) && fs.readFileSync(fakeOpenLogPath, 'utf8').includes('https://www.reddit.com/'),
        5_000
      );
      const fakeOpenLog = fs.readFileSync(fakeOpenLogPath, 'utf8');
      expect(fakeOpenLog).toContain('-a');
      expect(fakeOpenLog).toContain('Zen');
      expect(fakeOpenLog).toContain('https://www.reddit.com/');

      const telegramSessionId = await findTelegramSessionId(harness);
      const dbAfterConnect = harness.createDb();
      const telegramSessionAfterConnect = dbAfterConnect.getSessionById(telegramSessionId);
      expect(telegramSessionAfterConnect).toBeDefined();
      const connectMetadata = expectRecord(JSON.parse(telegramSessionAfterConnect?.metadataJson ?? '{}'), 'connect metadata');
      const browserConnectDraft = expectRecord(connectMetadata.browserConnectDraft, 'browser connect draft');
      expect(browserConnectDraft.siteKey).toBe('reddit');
      expect(browserConnectDraft.browserKind).toBe('firefox');
      expect(String(browserConnectDraft.browserProfileId ?? '')).toMatch(/^firefox:/);
      dbAfterConnect.close();

      const saveResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 84022,
          senderId: 8402,
          text: '/browser save reddit zen',
          username: 'browserzen'
        })
      });
      expect(saveResponse.statusCode).toBe(200);
      const saveBody = expectRecord(saveResponse.json(), 'save response');
      expect(saveBody.status).toBe('command_applied');
      expect(typeof saveBody.sessionProfileId).toBe('string');

      const dbAfterSave = harness.createDb();
      const savedProfile = dbAfterSave.getBrowserSessionProfileById(String(saveBody.sessionProfileId));
      expect(savedProfile).toBeDefined();
      expect(savedProfile?.visibility).toBe('session_only');
      expect(savedProfile?.browserKind).toBe('firefox');
      expect(savedProfile?.browserProfileName).toBe('Default (release)');
      expect(savedProfile?.browserProfilePath).toContain(path.join('Application Support', 'zen'));
      expect(savedProfile?.lastVerificationStatus).toBe('connected');
      dbAfterSave.close();

      expect(telegramSends.join('\n')).toContain('Opened Reddit in Zen');
      expect(telegramSends.join('\n')).toContain('/browser save reddit zen');
      expect(telegramSends.join('\n')).toContain('Saved Reddit');
    },
    20_000
  );
});
