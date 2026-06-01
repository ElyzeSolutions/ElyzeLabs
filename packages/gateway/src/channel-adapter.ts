import { randomUUID } from 'node:crypto';

import { resolveSessionKey, type TelegramMessage } from '@ops/shared';

export type ChannelId = 'telegram';
export type ChannelChatType = 'direct' | 'group' | 'topic';
export type ChannelRouteScope = 'peer' | 'account' | 'group' | 'topic';

export interface ChannelAdapterContract {
  schema: 'ops.channel-adapter-contract.v1';
  channelId: ChannelId;
  displayName: string;
  version: 1;
  inbound: {
    normalizedFields: string[];
    attachmentSupport: boolean;
    mentionRequiredForGroups: boolean;
  };
  outbound: {
    deliveryModes: string[];
    supportsThreads: boolean;
    supportsSmokeTest: boolean;
  };
  routing: {
    accountId: boolean;
    peerId: boolean;
    threadId: boolean;
    agentId: boolean;
    sessionKey: boolean;
    dmScopes: Array<'peer' | 'account'>;
  };
  pairing: {
    supportsAllowlist: boolean;
    supportsPairingApproval: boolean;
    unknownSenderPolicy: 'block_or_request_pairing';
  };
  audit: {
    inboundMetadata: string[];
    outboundMetadata: string[];
    redactedFields: string[];
  };
}

export interface NormalizedChannelRoute {
  schema: 'ops.channel-route.v1';
  channelId: ChannelId;
  accountId: string;
  peerId: string;
  chatId: string;
  threadId: string | null;
  senderId: string;
  senderHandle: string;
  chatType: ChannelChatType;
  routeScope: ChannelRouteScope;
  sessionKey: string;
}

export type ChannelCommandHandlingMode = 'gateway_inline' | 'adapter_lifecycle';
export type ChannelLifecycleStatus = 'active' | 'disabled' | 'planned';
export type ChannelCommandKind = 'llm' | 'memory' | 'remember' | 'skill' | 'native' | 'unknown';

export interface NormalizedChannelCommand {
  schema: 'ops.channel-command.v1';
  channelId: ChannelId;
  rawText: string;
  command: string;
  botMention: string | null;
  argText: string;
  kind: ChannelCommandKind;
  lifecycleStage: 'parse_command';
}

export interface ChannelAdapterRegistration {
  schema: 'ops.channel-adapter-registration.v1';
  contract: ChannelAdapterContract;
  lifecycle: {
    status: ChannelLifecycleStatus;
    inboundStages: string[];
    outboundStages: string[];
    commandHandling: ChannelCommandHandlingMode;
  };
  runtime: {
    enabled: boolean;
    configured: boolean;
    webhookMode: boolean;
    smokeTestEndpoint: string | null;
  };
}

export interface TelegramChannelRegistryInput {
  enabled: boolean;
  configured: boolean;
  useWebhook: boolean;
}

export const TELEGRAM_CHANNEL_ADAPTER_CONTRACT: ChannelAdapterContract = {
  schema: 'ops.channel-adapter-contract.v1',
  channelId: 'telegram',
  displayName: 'Telegram',
  version: 1,
  inbound: {
    normalizedFields: [
      'updateId',
      'chatId',
      'chatType',
      'topicId',
      'senderId',
      'senderHandle',
      'text',
      'mentionBot',
      'attachments'
    ],
    attachmentSupport: true,
    mentionRequiredForGroups: true
  },
  outbound: {
    deliveryModes: ['sendMessage', 'editMessageText', 'sendChatAction'],
    supportsThreads: true,
    supportsSmokeTest: true
  },
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
  audit: {
    inboundMetadata: ['chatId', 'topicId', 'senderId', 'senderHandle', 'updateId', 'attachments'],
    outboundMetadata: ['chatId', 'topicId', 'messageId', 'deliveryStatus'],
    redactedFields: ['botToken', 'text']
  }
};

export class ChannelAdapterRegistry {
  private readonly registrations = new Map<ChannelId, ChannelAdapterRegistration>();

  register(registration: ChannelAdapterRegistration): void {
    const channelId = registration.contract.channelId;
    if (this.registrations.has(channelId)) {
      throw new Error(`Channel adapter already registered: ${channelId}`);
    }
    this.registrations.set(channelId, registration);
  }

  get(channelId: ChannelId): ChannelAdapterRegistration | null {
    return this.registrations.get(channelId) ?? null;
  }

  list(): ChannelAdapterRegistration[] {
    return Array.from(this.registrations.values()).sort((left, right) =>
      left.contract.channelId.localeCompare(right.contract.channelId)
    );
  }

  capabilities(): ChannelAdapterRegistration[] {
    return this.list();
  }
}

export function createChannelAdapterRegistry(input: {
  telegram: TelegramChannelRegistryInput;
}): ChannelAdapterRegistry {
  const registry = new ChannelAdapterRegistry();
  registry.register({
    schema: 'ops.channel-adapter-registration.v1',
    contract: TELEGRAM_CHANNEL_ADAPTER_CONTRACT,
    lifecycle: {
      status: input.telegram.enabled ? 'active' : 'disabled',
      inboundStages: ['normalize_inbound', 'derive_channel_route', 'pairing_or_allowlist_gate', 'parse_command', 'queue_or_command'],
      outboundStages: ['resolve_delivery_target', 'redact_payload', 'deliver', 'audit'],
      commandHandling: 'adapter_lifecycle'
    },
    runtime: {
      enabled: input.telegram.enabled,
      configured: input.telegram.configured,
      webhookMode: input.telegram.useWebhook,
      smokeTestEndpoint: '/api/telegram/smoke-test'
    }
  });
  return registry;
}

const TELEGRAM_NATIVE_COMMAND_NAMES: string[] = [
  'agent',
  'agents',
  'backlog',
  'browser',
  'clear',
  'compact',
  'idea',
  'link',
  'model',
  'new',
  'resume',
  'retention',
  'runtime',
  'schedule',
  'schedules',
  'session',
  'tail',
  'task',
  'turbo',
  'unlink'
];

function normalizeTelegramCommandName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32);
}

function resolveTelegramCommandKind(command: string, skillCommandNames: string[]): ChannelCommandKind {
  if (command === 'llm') {
    return 'llm';
  }
  if (command === 'memory') {
    return 'memory';
  }
  if (command === 'remember') {
    return 'remember';
  }
  if (command === 'skill' || skillCommandNames.includes(command)) {
    return 'skill';
  }
  if (TELEGRAM_NATIVE_COMMAND_NAMES.includes(command)) {
    return 'native';
  }
  return 'unknown';
}

export function parseTelegramChannelCommand(input: {
  text: string;
  skillCommandNames?: string[];
}): NormalizedChannelCommand | null {
  const rawText = input.text.trim();
  if (!rawText.startsWith('/')) {
    return null;
  }

  const match = rawText.match(/^\/([A-Za-z0-9_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]+))?$/);
  if (!match) {
    return null;
  }

  const command = normalizeTelegramCommandName(match[1] ?? '');
  if (!command) {
    return null;
  }

  const skillCommandNames = (input.skillCommandNames ?? [])
    .map((entry) => normalizeTelegramCommandName(entry))
    .filter((entry) => entry.length > 0);

  return {
    schema: 'ops.channel-command.v1',
    channelId: 'telegram',
    rawText,
    command,
    botMention: match[2] ?? null,
    argText: (match[3] ?? '').trim(),
    kind: resolveTelegramCommandKind(command, skillCommandNames),
    lifecycleStage: 'parse_command'
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecordField(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function readStringField(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function readOptionalStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function readBooleanField(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeTelegramChatType(value: string): ChannelChatType {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'group' || normalized === 'supergroup') {
    return 'group';
  }
  if (normalized === 'topic') {
    return 'topic';
  }
  return 'direct';
}

function normalizeAttachments(value: unknown): Array<{ name: string; url: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      name: readStringField(entry, 'name', 'attachment'),
      url: readStringField(entry, 'url', '')
    }));
}

export function normalizeTelegramMessage(payload: Record<string, unknown>): TelegramMessage {
  const message = isRecord(payload.message) ? payload.message : payload;
  const chat = readRecordField(message, 'chat');
  const from = readRecordField(message, 'from');
  const text = readStringField(message, 'text', '');
  const topicId = readOptionalStringField(message, 'message_thread_id');
  const baseChatType = normalizeTelegramChatType(readStringField(chat, 'type', 'private'));
  const chatType = baseChatType === 'group' && topicId ? 'topic' : baseChatType;

  return {
    updateId: readStringField(payload, 'update_id', readStringField(payload, 'updateId', randomUUID())),
    chatId: readStringField(chat, 'id', 'unknown-chat'),
    chatType,
    topicId,
    senderId: readStringField(from, 'id', 'unknown-sender'),
    senderHandle: readStringField(from, 'username', readStringField(from, 'first_name', 'unknown')),
    text,
    mentionBot: readBooleanField(message, 'mentioned', false) || text.includes('@'),
    attachments: normalizeAttachments(message.attachments)
  };
}

export function buildTelegramChannelRoute(input: {
  message: TelegramMessage;
  accountId: string;
  botId: string;
  dmScope: 'peer' | 'account';
}): NormalizedChannelRoute {
  const resolved = resolveSessionKey({
    channel: 'telegram',
    chatType: input.message.chatType,
    chatId: input.message.chatId,
    topicId: input.message.topicId,
    senderId: input.message.senderId,
    botId: input.botId,
    accountId: input.accountId,
    dmScope: input.dmScope
  });

  return {
    schema: 'ops.channel-route.v1',
    channelId: 'telegram',
    accountId: input.accountId,
    peerId: input.message.chatType === 'direct' ? input.message.senderId : input.message.chatId,
    chatId: input.message.chatId,
    threadId: input.message.topicId ?? null,
    senderId: input.message.senderId,
    senderHandle: input.message.senderHandle,
    chatType: input.message.chatType,
    routeScope: resolved.scope,
    sessionKey: resolved.key
  };
}
