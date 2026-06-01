import { afterEach, describe, expect, it } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

function telegramPayload(input: { updateId: number; senderId: number; text: string }) {
  return {
    update_id: input.updateId,
    message: {
      text: input.text,
      chat: { id: input.senderId, type: 'private' },
      from: { id: input.senderId, username: `tasker${input.senderId}` },
      mentioned: true
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

describe('telegram backlog Kanban intake', () => {
  const harnesses: GatewayTestHarness[] = [];

  afterEach(async () => {
    while (harnesses.length > 0) {
      const harness = harnesses.pop();
      if (harness) {
        await harness.close();
      }
    }
  });

  it('creates planned Kanban tasks from Telegram /task commands with origin metadata', async () => {
    const harness = await createGatewayTestHarness('telegram-backlog-kanban');
    harnesses.push(harness);

    const onboardingResponse = await harness.inject({
      method: 'POST',
      url: '/api/onboarding/ceo-baseline',
      headers: {
        Authorization: `Bearer ${harness.config.server.apiToken}`,
        'x-ops-role': 'operator'
      },
      payload: {
        actor: 'telegram-kanban-test'
      }
    });
    expect(onboardingResponse.statusCode).toBe(200);

    const senderId = 44091;
    const response = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 440910,
        senderId,
        text: '/task Implement OpenClaw live browser controls'
      })
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(isRecord(body) ? body.status : null).toBe('command_applied');
    expect(isRecord(body) ? body.command : null).toBe('task');

    const boardResponse = await harness.inject({
      method: 'GET',
      url: '/api/backlog/board',
      headers: {
        Authorization: `Bearer ${harness.config.server.apiToken}`
      }
    });
    expect(boardResponse.statusCode).toBe(200);
    const boardBody = boardResponse.json();
    const columns = isRecord(boardBody) && isRecord(boardBody.columns) ? boardBody.columns : {};
    const planned = recordArray(columns.planned);
    const task = planned.find((entry) => entry.title === 'Implement OpenClaw live browser controls');
    expect(task).toBeDefined();
    expect(task?.state).toBe('planned');
    expect(task?.source).toBe('telegram');
    expect(task?.originChannel).toBe('telegram');
    expect(task?.originChatId).toBe(String(senderId));
  });

  it('creates scoped operator tasks from Telegram /task metadata flags', async () => {
    const harness = await createGatewayTestHarness('telegram-backlog-kanban-rich-task');
    harnesses.push(harness);

    const onboardingResponse = await harness.inject({
      method: 'POST',
      url: '/api/onboarding/ceo-baseline',
      headers: {
        Authorization: `Bearer ${harness.config.server.apiToken}`,
        'x-ops-role': 'operator'
      },
      payload: {
        actor: 'telegram-kanban-test'
      }
    });
    expect(onboardingResponse.statusCode).toBe(200);

    const repoResponse = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        Authorization: `Bearer ${harness.config.server.apiToken}`
      },
      payload: {
        owner: 'example',
        repo: 'elyze',
        authSecretRef: 'vault://github/example-elyze'
      }
    });
    expect(repoResponse.statusCode).toBe(201);
    const repoBody = repoResponse.json();
    const repo = isRecord(repoBody) && isRecord(repoBody.repo) ? repoBody.repo : {};
    const repoConnectionId = typeof repo.id === 'string' ? repo.id : '';
    expect(repoConnectionId.length).toBeGreaterThan(0);

    const senderId = 44092;
    const response = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 440920,
        senderId,
        text: [
          '/task Ship Pinterest authenticated capture repo=example/elyze labels=browser,auth #telegram priority=88 project=browser-ops agent=software-engineer state=triage',
          'description: Verify imported sessions through Scrapling and CDP fallback.'
        ].join('\n')
      })
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(isRecord(body) ? body.status : null).toBe('command_applied');
    expect(isRecord(body) ? body.command : null).toBe('task');
    expect(isRecord(body) ? body.state : null).toBe('triage');
    expect(isRecord(body) ? body.projectId : null).toBe('browser-ops');

    const boardResponse = await harness.inject({
      method: 'GET',
      url: '/api/backlog/board?projectId=browser-ops',
      headers: {
        Authorization: `Bearer ${harness.config.server.apiToken}`
      }
    });
    expect(boardResponse.statusCode).toBe(200);
    const boardBody = boardResponse.json();
    const columns = isRecord(boardBody) && isRecord(boardBody.columns) ? boardBody.columns : {};
    const triage = recordArray(columns.triage);
    const task = triage.find((entry) => entry.title === 'Ship Pinterest authenticated capture');
    expect(task).toBeDefined();
    expect(task?.description).toBe('Verify imported sessions through Scrapling and CDP fallback.');
    expect(task?.priority).toBe(88);
    expect(task?.projectId).toBe('browser-ops');
    expect(task?.assignedAgentId).toBe('software-engineer');
    expect(task?.originChannel).toBe('telegram');
    expect(task?.originChatId).toBe(String(senderId));
    expect(task?.labels).toEqual(['auth', 'browser', 'telegram']);
    const metadata = isRecord(task?.metadata) ? task.metadata : {};
    const githubRepoHint = isRecord(metadata.githubRepoHint) ? metadata.githubRepoHint : {};
    const delivery = isRecord(task?.delivery) ? task.delivery : {};
    expect(githubRepoHint.owner).toBe('example');
    expect(githubRepoHint.repo).toBe('elyze');
    expect(delivery.repoConnectionId).toBe(repoConnectionId);
  });
});
