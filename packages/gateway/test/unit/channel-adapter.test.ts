import { describe, expect, it } from 'vitest';

import {
  TELEGRAM_CHANNEL_ADAPTER_CONTRACT,
  buildTelegramChannelRoute,
  createChannelAdapterRegistry,
  normalizeTelegramMessage,
  parseTelegramChannelCommand
} from '../../src/channel-adapter.js';

describe('channel adapter contract', () => {
  it('declares Telegram routing, pairing, delivery, and audit capabilities', () => {
    expect(TELEGRAM_CHANNEL_ADAPTER_CONTRACT).toMatchObject({
      schema: 'ops.channel-adapter-contract.v1',
      channelId: 'telegram',
      routing: {
        accountId: true,
        peerId: true,
        threadId: true,
        agentId: true,
        sessionKey: true,
        dmScopes: ['peer', 'account']
      },
      pairing: {
        supportsAllowlist: true,
        supportsPairingApproval: true,
        unknownSenderPolicy: 'block_or_request_pairing'
      },
      outbound: {
        supportsThreads: true,
        supportsSmokeTest: true
      }
    });
    expect(TELEGRAM_CHANNEL_ADAPTER_CONTRACT.audit.redactedFields).toContain('botToken');
  });

  it('registers Telegram with explicit shared channel lifecycle metadata', () => {
    const registry = createChannelAdapterRegistry({
      telegram: {
        enabled: true,
        configured: true,
        useWebhook: false
      }
    });

    const registrations = registry.capabilities();
    expect(registrations).toHaveLength(1);
    expect(registrations[0]).toMatchObject({
      schema: 'ops.channel-adapter-registration.v1',
      contract: {
        channelId: 'telegram'
      },
      lifecycle: {
        status: 'active',
        inboundStages: ['normalize_inbound', 'derive_channel_route', 'pairing_or_allowlist_gate', 'parse_command', 'queue_or_command'],
        outboundStages: ['resolve_delivery_target', 'redact_payload', 'deliver', 'audit'],
        commandHandling: 'adapter_lifecycle'
      },
      runtime: {
        enabled: true,
        configured: true,
        webhookMode: false,
        smokeTestEndpoint: '/api/telegram/smoke-test'
      }
    });
    expect(registry.get('telegram')?.contract.schema).toBe('ops.channel-adapter-contract.v1');
  });

  it('parses Telegram commands through the adapter lifecycle, including bot mentions and skill aliases', () => {
    expect(
      parseTelegramChannelCommand({
        text: '/memory@elyze_ops_bot deployment checklist'
      })
    ).toMatchObject({
      schema: 'ops.channel-command.v1',
      channelId: 'telegram',
      command: 'memory',
      botMention: 'elyze_ops_bot',
      argText: 'deployment checklist',
      kind: 'memory',
      lifecycleStage: 'parse_command'
    });

    expect(
      parseTelegramChannelCommand({
        text: '/remember preferred runtime is codex'
      })
    ).toMatchObject({
      command: 'remember',
      argText: 'preferred runtime is codex',
      kind: 'remember'
    });

    expect(
      parseTelegramChannelCommand({
        text: '/security_scan check auth routes',
        skillCommandNames: ['security_scan']
      })
    ).toMatchObject({
      command: 'security_scan',
      argText: 'check auth routes',
      kind: 'skill'
    });

    expect(parseTelegramChannelCommand({ text: 'plain request' })).toBeNull();
  });

  it('normalizes Telegram inbound payloads into deterministic channel route keys', () => {
    const message = normalizeTelegramMessage({
      update_id: 123,
      message: {
        text: 'hello @bot',
        message_thread_id: 55,
        chat: {
          id: -100123,
          type: 'supergroup'
        },
        from: {
          id: 93142,
          username: 'operator'
        },
        attachments: [
          {
            name: 'report.txt',
            url: 'https://example.test/report.txt'
          }
        ]
      }
    });

    expect(message).toMatchObject({
      updateId: '123',
      chatId: '-100123',
      chatType: 'topic',
      topicId: '55',
      senderId: '93142',
      senderHandle: 'operator',
      text: 'hello @bot',
      mentionBot: true,
      attachments: [
        {
          name: 'report.txt',
          url: 'https://example.test/report.txt'
        }
      ]
    });

    const route = buildTelegramChannelRoute({
      message,
      accountId: 'default',
      botId: 'telegram-bot',
      dmScope: 'peer'
    });

    expect(route).toMatchObject({
      schema: 'ops.channel-route.v1',
      channelId: 'telegram',
      accountId: 'default',
      peerId: '-100123',
      chatId: '-100123',
      threadId: '55',
      senderId: '93142',
      senderHandle: 'operator',
      chatType: 'topic',
      routeScope: 'topic',
      sessionKey: 'telegram:topic:-100123:55'
    });
  });

  it('supports account-scoped Telegram DMs without changing normalized message shape', () => {
    const message = normalizeTelegramMessage({
      updateId: 'abc',
      text: 'status',
      chat: {
        id: 42,
        type: 'private'
      },
      from: {
        id: 42,
        first_name: 'Ada'
      }
    });

    const route = buildTelegramChannelRoute({
      message,
      accountId: 'ops',
      botId: 'telegram-bot',
      dmScope: 'account'
    });

    expect(message.chatType).toBe('direct');
    expect(message.senderHandle).toBe('Ada');
    expect(route.routeScope).toBe('account');
    expect(route.sessionKey).toBe('telegram:account:ops:telegram-bot');
  });
});
