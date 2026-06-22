import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

let harness: GatewayTestHarness | null = null;

afterEach(async () => {
  if (harness) {
    await harness.close();
    harness = null;
  }
  vi.unstubAllGlobals();
});

describe('fake provider e2e certification', () => {
  it('normalizes Gemini tool calls and returns clean tool-result replies', async () => {
    const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
    process.env.GOOGLE_API_KEY = 'integration-google-key';
    const googleRequestBodies: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = fetchInputUrl(input);
      if (!url.includes('generativelanguage.googleapis.com')) {
        return jsonResponse({ ok: true });
      }
      if (typeof init?.body === 'string') {
        googleRequestBodies.push(readJsonRecord(init.body));
      }
      if (googleRequestBodies.length === 1) {
        return jsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      id: 'fake-provider-compact-tool-1',
                      name: 'execute_command',
                      args: {
                        command: 'echo',
                        args: ['fake-provider-e2e'],
                        reason: 'Prove compact provider tool-call compatibility.'
                      }
                    }
                  }
                ]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 22,
            candidatesTokenCount: 14,
            totalTokenCount: 36
          }
        });
      }
      return jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: [
                    'The command completed and printed fake-provider-e2e.',
                    '',
                    'For this execution, the active runtime is **process**, the model is **gemini-3-flash-preview**, and the provider is **google**.'
                  ].join('\n')
                }
              ]
            }
          }
        ],
        usageMetadata: {
          promptTokenCount: 24,
          candidatesTokenCount: 15,
          totalTokenCount: 39
        }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      harness = await createGatewayTestHarness('fake-provider-tool-call');
      await applyCeoBaseline(harness);
      await setAgentExecutionMode(harness, 'ceo-default', 'on_demand');

      const session = await createSession(harness, {
        label: 'fake-provider-tool-call',
        agentId: 'ceo-default',
        runtime: 'process',
        model: 'gemini-2.5-pro'
      });
      const runId = await queueRun(harness, session.id, {
        idempotencyKey: 'fake-provider-tool-call',
        prompt: 'Run echo fake-provider-e2e and answer directly.',
        runtime: 'process',
        model: 'gemini-2.5-pro'
      });

      const terminalRun = await harness.waitForTerminalRun(runId, 20_000);
      expect(terminalRun.status).toBe('completed');
      expect(googleRequestBodies.length).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(googleRequestBodies[0]?.tools)).toBe(true);

      const contract = await getExecutionContract(harness, runId);
      expect(contract.contract.status).toBe('completed');
      expect(contract.dispatches[0]?.details.executionPlan?.argv).toEqual(['echo', 'fake-provider-e2e']);

      const run = await getRun(harness, runId);
      expect(run.executionPath?.mode).toBe('provider_api');
      expect(run.executionPath?.toolSessionMode).toBe('native_tool_session');
      expect(run.executionPath?.toolInvocationPath).toBe('tool_first_native');
      expect(run.run.resultSummary ?? '').toContain('fake-provider-e2e');
      expect(run.run.resultSummary ?? '').not.toContain('For this execution, the active runtime is');

      const timeline = await getTimeline(harness, runId);
      const toolCall = timeline.find((entry) => entry.type === 'tool_call');
      expect(readStringField(parseJsonRecord(toolCall?.payloadJson ?? '{}'), 'toolName')).toBe('execute_command');
      const replyPath = timeline.find((entry) => entry.type === 'run.reply_path');
      expect(readStringField(parseJsonRecord(replyPath?.payloadJson ?? '{}'), 'mode')).toBe('llm_followup');

      const outbound = await waitForOutboundMessageByRun(harness, session.id, runId);
      expect(outbound.content).toContain('The command completed and printed fake-provider-e2e.');
      expect(outbound.content).not.toContain('No command was executed');
      expect(outbound.content).not.toContain('For this execution, the active runtime is');
    } finally {
      restoreEnv('GOOGLE_API_KEY', originalGoogleApiKey);
    }
  });

  it('recovers saturated primary providers through configured fake OpenRouter fallback', async () => {
    const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
    const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
    process.env.GOOGLE_API_KEY = 'integration-google-key';
    process.env.OPENROUTER_API_KEY = 'integration-openrouter-key';
    const highDemandMessage =
      'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.';
    const calledUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = fetchInputUrl(input);
      calledUrls.push(url);
      if (url.includes('generativelanguage.googleapis.com')) {
        return jsonResponse(
          {
            error: {
              message: highDemandMessage
            }
          },
          429
        );
      }
      if (url.includes('openrouter.ai/api/v1/chat/completions')) {
        return jsonResponse({
          id: 'chatcmpl-fake-provider-fallback',
          choices: [
            {
              message: {
                content: 'openrouter fallback recovered fake provider run'
              }
            }
          ],
          usage: {
            prompt_tokens: 14,
            completion_tokens: 9,
            total_tokens: 23,
            total_cost: 0.00001
          }
        });
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      harness = await createGatewayTestHarness('fake-provider-fallback');
      await applyCeoBaseline(harness);
      await setAgentExecutionMode(harness, 'software-engineer', 'on_demand');
      await configureProviderFallback(harness);

      const beforeEvents = await harness.inject({
        method: 'GET',
        url: '/api/events?limit=1'
      });
      expect(beforeEvents.statusCode).toBe(200);
      const beforeEventsBody = beforeEvents.json<{ events: Array<{ sequence: number }> }>();
      const sinceSequence = beforeEventsBody.events[0]?.sequence ?? 0;

      const session = await createSession(harness, {
        label: 'fake-provider-fallback',
        agentId: 'software-engineer',
        runtime: 'process',
        model: 'gemini-3.1-pro-preview'
      });
      const runId = await queueRun(harness, session.id, {
        idempotencyKey: 'fake-provider-fallback',
        prompt: 'recover via fake provider fallback when primary model is saturated',
        runtime: 'process',
        model: 'gemini-3.1-pro-preview'
      });

      const terminalRun = await harness.waitForTerminalRun(runId, 25_000);
      expect(terminalRun.status).toBe('completed');
      expect(calledUrls.some((url) => url.includes('generativelanguage.googleapis.com'))).toBe(true);
      expect(calledUrls.some((url) => url.includes('openrouter.ai/api/v1/chat/completions'))).toBe(true);

      const run = await getRun(harness, runId);
      expect(run.run.resultSummary ?? '').toContain('openrouter fallback recovered fake provider run');
      expect(run.run.effectiveModel ?? run.run.model ?? '').toContain('openrouter/');

      const retryEvents = await collectRetryEvents(harness, sinceSequence, runId);
      expect(retryEvents.length).toBeGreaterThanOrEqual(1);
      expect(
        retryEvents.some((event) => readNestedString(event.data, ['nextRoute', 'model'])?.includes('openrouter/') === true)
      ).toBe(true);

      const outbound = await waitForOutboundMessageByRun(harness, session.id, runId);
      expect(outbound.content).toContain('openrouter fallback recovered fake provider run');
      expect(outbound.content).not.toContain(highDemandMessage);
    } finally {
      restoreEnv('GOOGLE_API_KEY', originalGoogleApiKey);
      restoreEnv('OPENROUTER_API_KEY', originalOpenRouterApiKey);
    }
  });
});

async function applyCeoBaseline(input: GatewayTestHarness): Promise<void> {
  const response = await input.inject({
    method: 'POST',
    url: '/api/onboarding/ceo-baseline',
    payload: {
      actor: 'fake-provider-e2e'
    }
  });
  expect(response.statusCode).toBe(200);
}

async function setAgentExecutionMode(
  input: GatewayTestHarness,
  agentId: string,
  executionMode: 'on_demand' | 'persistent_harness' | 'dispatch_only'
): Promise<void> {
  const response = await input.inject({
    method: 'PATCH',
    url: `/api/agents/profiles/${encodeURIComponent(agentId)}`,
    payload: {
      executionMode
    }
  });
  expect(response.statusCode).toBe(200);
}

async function configureProviderFallback(input: GatewayTestHarness): Promise<void> {
  const response = await input.inject({
    method: 'PUT',
    url: '/api/llm/limits',
    payload: {
      limits: {
        providerCallBudgetDaily: {
          openrouter: 10000,
          google: 10000
        },
        providerCallsPerMinute: {},
        providerCostBudgetUsdDaily: {},
        providerCostBudgetUsdMonthly: {},
        modelCallBudgetDaily: {},
        primaryModelByRuntime: {
          codex: 'gemini-3.1-pro-preview',
          claude: 'gemini-3.1-pro-preview',
          gemini: 'gemini-3.1-pro-preview',
          process: 'gemini-3.1-pro-preview'
        },
        fallbackByRuntime: {
          codex: [{ runtime: 'process', model: 'openrouter/minimax/minimax-m2.5' }],
          claude: [],
          gemini: [],
          process: [{ runtime: 'process', model: 'openrouter/minimax/minimax-m2.5' }]
        }
      }
    }
  });
  expect(response.statusCode).toBe(200);
}

async function createSession(
  input: GatewayTestHarness,
  payload: {
    label: string;
    agentId: string;
    runtime: string;
    model: string;
  }
): Promise<{ id: string }> {
  const response = await input.inject({
    method: 'POST',
    url: '/api/sessions',
    payload
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ session: { id: string } }>().session;
}

async function queueRun(
  input: GatewayTestHarness,
  sessionId: string,
  run: {
    idempotencyKey: string;
    prompt: string;
    runtime: string;
    model: string;
  }
): Promise<string> {
  const response = await input.inject({
    method: 'POST',
    url: `/api/sessions/${encodeURIComponent(sessionId)}/runs`,
    headers: {
      'Idempotency-Key': run.idempotencyKey
    },
    payload: {
      prompt: run.prompt,
      runtime: run.runtime,
      model: run.model,
      autoDelegate: false
    }
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ run: { id: string } }>().run.id;
}

async function getRun(input: GatewayTestHarness, runId: string): Promise<{
  run: {
    status: string;
    model: string | null;
    effectiveModel: string | null;
    resultSummary: string | null;
  };
  executionPath: {
    mode: string;
    toolSessionMode: string | null;
    toolInvocationPath: string | null;
  } | null;
}> {
  const response = await input.inject({
    method: 'GET',
    url: `/api/runs/${encodeURIComponent(runId)}`
  });
  expect(response.statusCode).toBe(200);
  return response.json<{
    run: {
      status: string;
      model: string | null;
      effectiveModel: string | null;
      resultSummary: string | null;
    };
    executionPath: {
      mode: string;
      toolSessionMode: string | null;
      toolInvocationPath: string | null;
    } | null;
  }>();
}

async function getExecutionContract(input: GatewayTestHarness, runId: string): Promise<{
  contract: {
    status: string;
  };
  dispatches: Array<{
    status: string;
    details: {
      executionPlan?: {
        argv?: string[];
      };
    };
  }>;
}> {
  const response = await input.inject({
    method: 'GET',
    url: `/api/runs/${encodeURIComponent(runId)}/execution-contract`
  });
  expect(response.statusCode).toBe(200);
  return response.json<{
    contract: {
      status: string;
    };
    dispatches: Array<{
      status: string;
      details: {
        executionPlan?: {
          argv?: string[];
        };
      };
    }>;
  }>();
}

async function getTimeline(
  input: GatewayTestHarness,
  runId: string
): Promise<Array<{ type: string; payloadJson: string }>> {
  const response = await input.inject({
    method: 'GET',
    url: `/api/runs/${encodeURIComponent(runId)}/timeline`
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ timeline: Array<{ type: string; payloadJson: string }> }>().timeline;
}

async function waitForOutboundMessageByRun(
  input: GatewayTestHarness,
  sessionId: string,
  runId: string,
  timeoutMs = 10_000
): Promise<{ direction: string; content: string; metadataJson: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await input.inject({
      method: 'GET',
      url: `/api/messages?sessionId=${encodeURIComponent(sessionId)}`
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ messages: Array<{ direction: string; content: string; metadataJson: string }> }>();
    const message = body.messages
      .filter((entry) => entry.direction === 'outbound')
      .find((entry) => readStringField(parseJsonRecord(entry.metadataJson), 'runId') === runId);
    if (message) {
      return message;
    }
    await delay(100);
  }
  throw new Error(`Outbound message for run ${runId} not found within ${timeoutMs.toString()}ms`);
}

async function collectRetryEvents(
  input: GatewayTestHarness,
  sinceSequence: number,
  runId: string
): Promise<Array<{ data: Record<string, unknown> }>> {
  const collected: Array<{ sequence: number; kind: string; runId: string | null; data: Record<string, unknown> }> = [];
  let cursor = sinceSequence;
  for (let page = 0; page < 20; page += 1) {
    const response = await input.inject({
      method: 'GET',
      url: `/api/events?since=${cursor.toString()}&limit=500`
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      events: Array<{ sequence: number; kind: string; runId: string | null; data: Record<string, unknown> }>;
    }>();
    if (body.events.length === 0) {
      break;
    }
    collected.push(...body.events);
    cursor = body.events[body.events.length - 1]?.sequence ?? cursor;
    if (body.events.length < 500) {
      break;
    }
  }
  return collected.filter((event) => event.kind === 'queue.retry' && event.runId === runId);
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

function fetchInputUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    return readRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function readJsonRecord(value: string): Record<string, unknown> {
  return readRecord(JSON.parse(value));
}

function readRecord(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readStringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === 'string' ? field : null;
}

function readNestedString(value: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = value;
  for (const segment of path) {
    const record = readRecord(current);
    current = record[segment];
  }
  return typeof current === 'string' ? current : null;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
