import { describe, expect, it } from 'vitest';

import { parseSessionKey, resolveSessionKey } from '../../src/index.ts';

describe('session key resolver', () => {
  it('returns stable topic keys for equivalent inputs', () => {
    const one = resolveSessionKey({
      channel: 'telegram',
      chatType: 'topic',
      chatId: '-1001234',
      topicId: '999',
      senderId: 'u-1',
      botId: 'b',
      accountId: 'acct',
      dmScope: 'peer'
    });

    const two = resolveSessionKey({
      channel: 'telegram',
      chatType: 'topic',
      chatId: '-1001234',
      topicId: '999',
      senderId: 'u-2',
      botId: 'b',
      accountId: 'acct',
      dmScope: 'peer'
    });

    expect(one.key).toEqual(two.key);
    expect(one.scope).toEqual('topic');
  });

  it('separates secure DM keys by peer in peer mode', () => {
    const alpha = resolveSessionKey({
      channel: 'telegram',
      chatType: 'direct',
      chatId: 'dm-a',
      senderId: 'alice',
      botId: 'bot',
      accountId: 'main',
      dmScope: 'peer'
    });
    const beta = resolveSessionKey({
      channel: 'telegram',
      chatType: 'direct',
      chatId: 'dm-b',
      senderId: 'bob',
      botId: 'bot',
      accountId: 'main',
      dmScope: 'peer'
    });

    expect(alpha.key).not.toEqual(beta.key);
    expect(parseSessionKey(alpha.key).scope).toEqual('peer');
  });
});
