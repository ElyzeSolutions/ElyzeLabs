import { afterEach, describe, expect, it } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

interface TelegramIngressBody {
  status: string;
  sessionId?: string;
  sessionKey?: string;
  runId?: string;
  targetSessionId?: string;
  targetAgentId?: string;
  routeMode?: string;
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

const createAgentProfile = async (
  harness: GatewayTestHarness,
  input: {
    name: string;
    title: string;
    systemPrompt: string;
  }
): Promise<{ id: string; name: string; title: string }> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/agents/profiles',
    payload: {
      name: input.name,
      title: input.title,
      systemPrompt: input.systemPrompt,
      defaultRuntime: 'codex',
      defaultModel: 'default',
      allowedRuntimes: ['codex'],
      skills: ['testing'],
      tools: ['runtime:codex']
    }
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { agent: { id: string; name: string; title: string } }).agent;
};

const applyCeoBaseline = async (harness: GatewayTestHarness): Promise<void> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/onboarding/ceo-baseline',
    payload: {
      actor: 'collaboration-routing-test'
    }
  });
  expect(response.statusCode).toBe(200);
};

const listMessages = async (harness: GatewayTestHarness, sessionId: string) => {
  const response = await harness.inject({
    method: 'GET',
    url: `/api/messages?sessionId=${encodeURIComponent(sessionId)}`
  });
  expect(response.statusCode).toBe(200);
  return (response.json() as {
    messages: Array<{ direction: string; content: string; metadataJson: string }>;
  }).messages;
};

const waitForOutboundContaining = async (
  harness: GatewayTestHarness,
  sessionId: string,
  expected: string,
  timeoutMs = 12_000
): Promise<{ direction: string; content: string; metadataJson: string }> => {
  let matched: { direction: string; content: string; metadataJson: string } | null = null;
  await harness.waitForCondition(
    `outbound message containing ${expected}`,
    async () => {
      const messages = await listMessages(harness, sessionId);
      matched =
        messages.find((entry) => entry.direction === 'outbound' && entry.content.includes(expected)) ?? null;
      return matched !== null;
    },
    timeoutMs
  );
  return matched!;
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

describe('collaboration routing integration', () => {
  const harnesses: GatewayTestHarness[] = [];

  afterEach(async () => {
    while (harnesses.length > 0) {
      const harness = harnesses.pop();
      if (harness) {
        await harness.close();
      }
    }
  });

  it(
    'supports collaboration send/history APIs with reply-back receipts',
    async () => {
    const harness = await createGatewayTestHarness('collaboration-api-routing');
    harnesses.push(harness);
    await applyCeoBaseline(harness);

    const docsWriter = await createAgentProfile(harness, {
      name: 'Docs Writer',
      title: 'Technical Writer',
      systemPrompt: 'Write concise operator-facing updates.'
    });

    const sessionResponse = await harness.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        sessionKey: 'internal:collaboration-api-origin',
        label: 'collaboration-api-origin',
        agentId: 'ceo-default',
        runtime: 'process'
      }
    });
    expect(sessionResponse.statusCode).toBe(201);
    const sessionId = (sessionResponse.json() as { session: { id: string } }).session.id;

    const targetsResponse = await harness.inject({
      method: 'GET',
      url: `/api/sessions/${encodeURIComponent(sessionId)}/collaboration/targets`
    });
    expect(targetsResponse.statusCode).toBe(200);
    const targetsBody = targetsResponse.json() as {
      targets: Array<{ agentId: string }>;
    };
    expect(targetsBody.targets.some((target) => target.agentId === docsWriter.id)).toBe(true);

    const sendResponse = await harness.inject({
      method: 'POST',
      url: `/api/sessions/${encodeURIComponent(sessionId)}/collaboration/send`,
      payload: {
        actor: 'integration-test',
        target: docsWriter.id,
        prompt: 'Prepare the release note outline.'
      }
    });
    expect(sendResponse.statusCode).toBe(201);
    const sendBody = sendResponse.json() as {
      targetSessionId: string;
      run: { id: string };
    };

    const finalRun = await harness.waitForTerminalRun(sendBody.run.id);
    expect(finalRun.status).toBe('completed');

    const historyResponse = await harness.inject({
      method: 'GET',
      url: `/api/sessions/${encodeURIComponent(sessionId)}/collaboration/history?target=${encodeURIComponent(docsWriter.id)}`
    });
    expect(historyResponse.statusCode).toBe(200);
    const historyBody = historyResponse.json() as {
      targetSessionId: string;
      messages: Array<{ direction: string; content: string }>;
    };
    expect(historyBody.targetSessionId).toBe(sendBody.targetSessionId);
    expect(historyBody.messages.some((entry) => entry.direction === 'inbound' && entry.content.includes('Prepare the release note outline.'))).toBe(true);

    const receipt = await waitForOutboundContaining(harness, sessionId, `Specialist reply: ${docsWriter.id}`);
    const receiptMetadata = JSON.parse(receipt.metadataJson) as {
      command?: string;
      targetSessionId?: string;
      targetAgentId?: string;
    };
    expect(receiptMetadata.command).toBe('collaboration_receipt');
    expect(receiptMetadata.targetSessionId).toBe(sendBody.targetSessionId);
    expect(receiptMetadata.targetAgentId).toBe(docsWriter.id);
    },
    20_000
  );

  it(
    'routes Telegram messages through /agents, /agent use, mention targeting, and /agent back without rebinding the session',
    async () => {
    const harness = await createGatewayTestHarness('collaboration-telegram-routing');
    harnesses.push(harness);
    await applyCeoBaseline(harness);

    const docsWriter = await createAgentProfile(harness, {
      name: 'Docs Writer',
      title: 'Technical Writer',
      systemPrompt: 'Write operator documentation.'
    });
    const qaReviewer = await createAgentProfile(harness, {
      name: 'QA Reviewer',
      title: 'QA Reviewer',
      systemPrompt: 'Review outputs and identify regressions.'
    });

    const senderId = 9151;
    const listResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: createTelegramPayload({
        updateId: 91510,
        senderId,
        text: '/agents',
        username: 'collabops'
      })
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json() as TelegramIngressBody;
    expect(listBody.status).toBe('command_applied');
    const originSessionId = await findTelegramSessionId(harness);

    const routeResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: createTelegramPayload({
        updateId: 91511,
        senderId,
        text: `/agent use ${docsWriter.id}`,
        username: 'collabops'
      })
    });
    expect(routeResponse.statusCode).toBe(200);
    const routeBody = routeResponse.json() as {
      status: string;
      route: { targetAgentId: string | null };
    };
    expect(routeBody.status).toBe('command_applied');
    expect(routeBody.route.targetAgentId).toBe(docsWriter.id);

    const stickyRunResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: createTelegramPayload({
        updateId: 91512,
        senderId,
        text: 'Draft the operator release note.',
        username: 'collabops'
      })
    });
    expect(stickyRunResponse.statusCode).toBe(200);
    const stickyRunBody = stickyRunResponse.json() as TelegramIngressBody;
    expect(stickyRunBody.status).toBe('queued');
    expect(stickyRunBody.routeMode).toBe('telegram_switch');
    expect(stickyRunBody.sessionId).toBe(originSessionId);
    expect(stickyRunBody.targetAgentId).toBe(docsWriter.id);
    expect(stickyRunBody.runId).toBeTruthy();
    await harness.waitForTerminalRun(stickyRunBody.runId!);
    await waitForOutboundContaining(harness, originSessionId, `Specialist reply: ${docsWriter.id}`);

    const mentionRunResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: createTelegramPayload({
        updateId: 91513,
        senderId,
        text: `@${qaReviewer.id} Review the draft for regressions.`,
        username: 'collabops'
      })
    });
    expect(mentionRunResponse.statusCode).toBe(200);
    const mentionRunBody = mentionRunResponse.json() as TelegramIngressBody;
    expect(mentionRunBody.status).toBe('queued');
    expect(mentionRunBody.routeMode).toBe('telegram_mention');
    expect(mentionRunBody.sessionId).toBe(originSessionId);
    expect(mentionRunBody.targetAgentId).toBe(qaReviewer.id);
    expect(mentionRunBody.runId).toBeTruthy();
    await harness.waitForTerminalRun(mentionRunBody.runId!);
    await waitForOutboundContaining(harness, originSessionId, `Specialist reply: ${qaReviewer.id}`);

    const backResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: createTelegramPayload({
        updateId: 91514,
        senderId,
        text: '/agent back',
        username: 'collabops'
      })
    });
    expect(backResponse.statusCode).toBe(200);
    const backBody = backResponse.json() as {
      status: string;
      route: { targetAgentId: string | null };
    };
    expect(backBody.status).toBe('command_applied');
    expect(backBody.route.targetAgentId).toBeNull();

    const sessionStatusResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: createTelegramPayload({
        updateId: 91515,
        senderId,
        text: '/session',
        username: 'collabops'
      })
    });
    expect(sessionStatusResponse.statusCode).toBe(200);
    const sessionStatusBody = sessionStatusResponse.json() as TelegramIngressBody;
    expect(sessionStatusBody.status).toBe('command_applied');
    expect(sessionStatusBody.sessionId).toBe(originSessionId);

    const messages = await listMessages(harness, originSessionId);
    const outboundText = messages
      .filter((entry) => entry.direction === 'outbound')
      .map((entry) => entry.content)
      .join('\n');
    expect(outboundText).toContain(`Soft routing now targets ${docsWriter.title}`);
    expect(outboundText).toContain('Soft route: default');
    },
    20_000
  );

  it(
    'propagates multi-hop collaboration receipts back to the originating operator session',
    async () => {
    const harness = await createGatewayTestHarness('collaboration-multi-hop');
    harnesses.push(harness);
    await applyCeoBaseline(harness);

    const docsWriter = await createAgentProfile(harness, {
      name: 'Docs Writer',
      title: 'Technical Writer',
      systemPrompt: 'Summarize specialist work.'
    });

    const operatorSessionResponse = await harness.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        sessionKey: 'internal:collaboration-multi-hop-origin',
        label: 'collaboration-multi-hop-origin',
        agentId: 'ceo-default',
        runtime: 'process'
      }
    });
    expect(operatorSessionResponse.statusCode).toBe(201);
    const operatorSessionId = (operatorSessionResponse.json() as { session: { id: string } }).session.id;

    const firstHopResponse = await harness.inject({
      method: 'POST',
      url: `/api/sessions/${encodeURIComponent(operatorSessionId)}/collaboration/send`,
      payload: {
        actor: 'integration-test',
        target: 'software-engineer',
        prompt: 'Inspect the work and coordinate with docs if needed.'
      }
    });
    expect(firstHopResponse.statusCode).toBe(201);
    const firstHopBody = firstHopResponse.json() as {
      targetSessionId: string;
      run: { id: string };
    };
    await harness.waitForTerminalRun(firstHopBody.run.id);

    const secondHopResponse = await harness.inject({
      method: 'POST',
      url: `/api/sessions/${encodeURIComponent(firstHopBody.targetSessionId)}/collaboration/send`,
      payload: {
        actor: 'software-engineer',
        target: docsWriter.id,
        prompt: 'Summarize the release notes for the operator.'
      }
    });
    expect(secondHopResponse.statusCode).toBe(201);
    const secondHopBody = secondHopResponse.json() as {
      targetSessionId: string;
      run: { id: string };
    };
    await harness.waitForTerminalRun(secondHopBody.run.id);

    const specialistReceipt = await waitForOutboundContaining(harness, firstHopBody.targetSessionId, `Specialist reply: ${docsWriter.id}`);
    expect(JSON.parse(specialistReceipt.metadataJson) as { command?: string }).toMatchObject({
      command: 'collaboration_receipt'
    });

    const operatorReceipt = await waitForOutboundContaining(harness, operatorSessionId, `Specialist reply: ${docsWriter.id}`);
    const operatorReceiptMetadata = JSON.parse(operatorReceipt.metadataJson) as {
      command?: string;
      targetAgentId?: string;
    };
    expect(operatorReceiptMetadata.command).toBe('collaboration_receipt');
    expect(operatorReceiptMetadata.targetAgentId).toBe(docsWriter.id);
    },
    20_000
  );
});
