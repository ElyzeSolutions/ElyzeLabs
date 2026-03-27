export interface SessionResolverInput {
  channel: 'telegram' | 'internal';
  chatType: 'direct' | 'group' | 'topic';
  chatId: string;
  topicId?: string | null;
  senderId: string;
  botId: string;
  accountId: string;
  dmScope: 'peer' | 'account';
}

export interface SessionResolverResult {
  key: string;
  scope: 'peer' | 'account' | 'group' | 'topic';
}

export function resolveSessionKey(input: SessionResolverInput): SessionResolverResult {
  const channel = sanitize(input.channel);
  const chatType = sanitize(input.chatType);

  if (chatType === 'direct') {
    if (input.dmScope === 'account') {
      return {
        key: `${channel}:account:${sanitize(input.accountId)}:${sanitize(input.botId)}`,
        scope: 'account'
      };
    }

    return {
      key: `${channel}:peer:${sanitize(input.senderId)}:${sanitize(input.botId)}`,
      scope: 'peer'
    };
  }

  if (chatType === 'topic') {
    return {
      key: `${channel}:topic:${sanitize(input.chatId)}:${sanitize(input.topicId ?? 'root')}`,
      scope: 'topic'
    };
  }

  return {
    key: `${channel}:group:${sanitize(input.chatId)}`,
    scope: 'group'
  };
}

export interface ParsedSessionKey {
  channel: string;
  scope: 'peer' | 'account' | 'group' | 'topic';
  primary: string;
  secondary?: string;
}

export function parseSessionKey(key: string): ParsedSessionKey {
  const parts = key.split(':').filter(Boolean);
  if (parts.length < 3) {
    throw new Error(`Invalid session key: ${key}`);
  }

  const [channel, scope, primary, secondary] = parts;
  if (scope !== 'peer' && scope !== 'account' && scope !== 'group' && scope !== 'topic') {
    throw new Error(`Invalid session key scope: ${scope}`);
  }
  if (!channel || !primary) {
    throw new Error(`Invalid session key shape: ${key}`);
  }

  const parsed: ParsedSessionKey = {
    channel,
    scope,
    primary
  };

  if (secondary) {
    parsed.secondary = secondary;
  }

  return parsed;
}

function sanitize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}
