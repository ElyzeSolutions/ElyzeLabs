import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

const validTelegramBotToken = '123456:ABCDEFGHIJKLMNOPQRSTUVWXyz_123456789';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  expect(isRecord(value), `${label} should be an object`).toBe(true);
  return isRecord(value) ? value : {};
}

function responseRecord(response: { json: () => unknown }, label: string): Record<string, unknown> {
  return expectRecord(response.json(), label);
}

function recordField(record: Record<string, unknown>, key: string, label: string): Record<string, unknown> {
  return expectRecord(record[key], label);
}

function stringField(record: Record<string, unknown>, key: string, label: string): string {
  expect(typeof record[key], `${label} should be a string`).toBe('string');
  return typeof record[key] === 'string' ? record[key] : '';
}

function booleanField(record: Record<string, unknown>, key: string, label: string): boolean {
  expect(typeof record[key], `${label} should be a boolean`).toBe('boolean');
  return typeof record[key] === 'boolean' ? record[key] : false;
}

function recordArrayField(record: Record<string, unknown>, key: string, label: string): Array<Record<string, unknown>> {
  expect(Array.isArray(record[key]), `${label} should be an array`).toBe(true);
  if (!Array.isArray(record[key])) {
    return [];
  }
  return record[key].filter((entry) => isRecord(entry));
}

function fetchInputUrl(input: URL | RequestInfo): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function parseFetchBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (!body) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(String(body));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

describe('telegram smoke test integration', () => {
  const harnesses: GatewayTestHarness[] = [];
  const originalFetch = globalThis.fetch;

  afterEach(async () => {
    vi.stubGlobal('fetch', originalFetch);
    while (harnesses.length > 0) {
      const harness = harnesses.pop();
      if (harness) {
        await harness.close();
      }
    }
  });

  it('probes bot identity and sends a redacted delivery smoke message', async () => {
    const telegramBodies: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      const methodName = url.split('/').pop() ?? '';
      telegramBodies.push(parseFetchBody(init?.body));
      if (methodName === 'getMe') {
        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              id: 424242,
              username: 'elyze_smoke_bot',
              first_name: 'Elyze'
            }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
      if (methodName === 'sendMessage') {
        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              message_id: 77,
              date: 1_800_000_000
            }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
      return new Response(JSON.stringify({ ok: false, description: 'unexpected method' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const harness = await createGatewayTestHarness('telegram-smoke-test', (localConfig) => {
      localConfig.channel.telegram.botToken = validTelegramBotToken;
    });
    harnesses.push(harness);

    const capabilitiesResponse = await harness.inject({
      method: 'GET',
      url: '/api/capabilities'
    });
    expect(capabilitiesResponse.statusCode).toBe(200);
    const capabilitiesBody = responseRecord(capabilitiesResponse, 'capabilities body');
    const channel = recordField(capabilitiesBody, 'channel', 'channel capabilities');
    const registry = recordField(channel, 'registry', 'channel registry');
    expect(registry.schema).toBe('ops.channel-registry.v1');
    const registrations = recordArrayField(registry, 'adapters', 'channel registrations');
    const telegramRegistration = registrations.find((entry) => recordField(entry, 'contract', 'registered contract').channelId === 'telegram');
    expect(telegramRegistration).toBeDefined();
    expect(recordField(telegramRegistration ?? {}, 'lifecycle', 'telegram lifecycle').commandHandling).toBe('adapter_lifecycle');
    const adapters = recordArrayField(channel, 'adapters', 'channel adapters');
    const telegramAdapter = adapters.find((entry) => entry.channelId === 'telegram');
    expect(telegramAdapter).toBeDefined();
    expect(telegramAdapter?.schema).toBe('ops.channel-adapter-contract.v1');
    expect(recordField(telegramAdapter ?? {}, 'routing', 'telegram routing').sessionKey).toBe(true);

    const response = await harness.inject({
      method: 'POST',
      url: '/api/telegram/smoke-test',
      payload: {
        chatId: '-100123456',
        topicId: '55',
        text: 'Elyze smoke diagnostic'
      }
    });
    expect(response.statusCode).toBe(200);

    const body = responseRecord(response, 'smoke response body');
    const smoke = recordField(body, 'smoke', 'smoke diagnostics');
    expect(stringField(smoke, 'schema', 'smoke schema')).toBe('ops.telegram-smoke-test.v1');
    expect(stringField(smoke, 'overall', 'smoke overall')).toBe('ok');
    expect(booleanField(smoke, 'botTokenConfigured', 'bot token configured')).toBe(true);
    expect(booleanField(smoke, 'botTokenLooksValid', 'bot token shape')).toBe(true);

    const target = recordField(smoke, 'target', 'smoke target');
    expect(stringField(target, 'source', 'target source')).toBe('request');
    expect(booleanField(target, 'chatIdConfigured', 'target chat configured')).toBe(true);
    expect(booleanField(target, 'topicIdConfigured', 'target topic configured')).toBe(true);

    const identity = recordField(smoke, 'identity', 'identity check');
    expect(stringField(identity, 'status', 'identity status')).toBe('ok');
    const identityResult = recordField(identity, 'result', 'identity result');
    expect(stringField(identityResult, 'username', 'identity username')).toBe('elyze_smoke_bot');

    const delivery = recordField(smoke, 'delivery', 'delivery check');
    expect(stringField(delivery, 'status', 'delivery status')).toBe('ok');
    const deliveryResult = recordField(delivery, 'result', 'delivery result');
    expect(stringField(deliveryResult, 'messageId', 'delivery message id')).toBe('77');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sentMessageBody = telegramBodies[1] ?? {};
    expect(sentMessageBody.chat_id).toBe('-100123456');
    expect(sentMessageBody.message_thread_id).toBe(55);
    expect(sentMessageBody.text).toBe('Elyze smoke diagnostic');

    const auditResponse = await harness.inject({
      method: 'GET',
      url: '/api/audit'
    });
    expect(auditResponse.statusCode).toBe(200);
    const auditBody = responseRecord(auditResponse, 'audit body');
    const audit = recordArrayField(auditBody, 'audit', 'audit rows');
    const smokeAudit = audit.find((row) => row.action === 'telegram.smoke_test');
    expect(smokeAudit).toBeDefined();
    expect(smokeAudit?.decision).toBe('allowed');
    expect(smokeAudit?.reason).toBe('ok');
  });

  it('degrades explicitly when no Telegram delivery target is configured', async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = fetchInputUrl(input);
      const methodName = url.split('/').pop() ?? '';
      if (methodName === 'getMe') {
        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              id: 424242,
              username: 'elyze_smoke_bot'
            }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
      return new Response(JSON.stringify({ ok: false, description: 'unexpected send' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const harness = await createGatewayTestHarness('telegram-smoke-test-missing-target', (localConfig) => {
      localConfig.channel.telegram.botToken = validTelegramBotToken;
    });
    harnesses.push(harness);

    const response = await harness.inject({
      method: 'POST',
      url: '/api/telegram/smoke-test'
    });
    expect(response.statusCode).toBe(200);

    const body = responseRecord(response, 'smoke response body');
    const smoke = recordField(body, 'smoke', 'smoke diagnostics');
    expect(stringField(smoke, 'overall', 'smoke overall')).toBe('degraded');
    const target = recordField(smoke, 'target', 'smoke target');
    expect(stringField(target, 'source', 'target source')).toBe('none');
    expect(booleanField(target, 'chatIdConfigured', 'target chat configured')).toBe(false);
    const delivery = recordField(smoke, 'delivery', 'delivery check');
    expect(stringField(delivery, 'status', 'delivery status')).toBe('missing');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
