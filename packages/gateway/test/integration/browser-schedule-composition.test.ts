import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

function installFakeScraplingExecutable(root: string): string {
  const executablePath = path.join(root, 'fake-scrapling.mjs');
  fs.writeFileSync(
    executablePath,
    [
      '#!/usr/bin/env node',
      'import fs from "node:fs";',
      'import path from "node:path";',
      '',
      'const args = process.argv.slice(2);',
      'const buildBody = ({ tool, url, selector = "" }) => [',
      '  `Tool: ${tool}`,',
      '  `URL: ${url}`,',
      '  selector ? `Selector: ${selector}` : "",',
      '  "Result: browser certification fixture content"',
      '].filter(Boolean).join("\\n");',
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
      '} else if ((args[0] ?? "") === "mcp") {',
      '  let buffer = "";',
      '  process.stdin.setEncoding("utf8");',
      '  process.stdin.on("data", (chunk) => {',
      '    buffer += chunk;',
      '    const lines = buffer.split(/\\r?\\n/);',
      '    buffer = lines.pop() ?? "";',
      '    for (const rawLine of lines) {',
      '      const line = rawLine.trim();',
      '      if (!line) continue;',
      '      let message = null;',
      '      try {',
      '        message = JSON.parse(line);',
      '      } catch {',
      '        continue;',
      '      }',
      '      if (message?.method === "initialize" && message.id != null) {',
      '        process.stdout.write(`${JSON.stringify({',
      '          jsonrpc: "2.0",',
      '          id: message.id,',
      '          result: {',
      '            protocolVersion: "2024-11-05",',
      '            capabilities: { tools: {} },',
      '            serverInfo: { name: "fake-scrapling", version: "1.0.0" }',
      '          }',
      '        })}\\n`);',
      '        continue;',
      '      }',
      '      if (message?.method === "tools/call" && message.id != null) {',
      '        const tool = String(message?.params?.name ?? "get");',
      '        const toolArgs = message?.params?.arguments ?? {};',
      '        const url = String(toolArgs.url ?? (Array.isArray(toolArgs.urls) ? toolArgs.urls[0] ?? "" : ""));',
      '        const selector = String(toolArgs.css_selector ?? toolArgs.selector ?? "");',
      '        const body = buildBody({ tool, url, selector });',
      '        process.stdout.write(`${JSON.stringify({',
      '          jsonrpc: "2.0",',
      '          id: message.id,',
      '          result: {',
      '            structuredContent: {',
      '              status: 200,',
      '              content: body.split("\\n")',
      '            },',
      '            content: [{ type: "text", text: body }],',
      '            isError: false',
      '          }',
      '        })}\\n`);',
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
      actor: 'browser-schedule-certification'
    }
  });
  expect(response.statusCode).toBe(200);
};

const createAgentProfile = async (
  harness: GatewayTestHarness,
  input: {
    name: string;
    title: string;
    systemPrompt: string;
  }
): Promise<{ id: string; title: string }> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/agents/profiles',
    payload: {
      name: input.name,
      title: input.title,
      systemPrompt: input.systemPrompt,
      defaultRuntime: 'process',
      defaultModel: 'openrouter/free',
      allowedRuntimes: ['process'],
      skills: ['testing'],
      tools: ['runtime:process', 'browser:scrapling']
    }
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { agent: { id: string; title: string } }).agent;
};

const createInternalSession = async (
  harness: GatewayTestHarness,
  input: { sessionKey: string; agentId: string; model?: string | null }
): Promise<string> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: {
      sessionKey: input.sessionKey,
      label: input.sessionKey,
      agentId: input.agentId,
      runtime: 'process',
      model: input.model ?? null
    }
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { session: { id: string } }).session.id;
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
  timeoutMs = 20_000
) => {
  let matched: { direction: string; content: string; metadataJson: string } | null = null;
  await harness.waitForCondition(
    `outbound containing ${expected}`,
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

describe('browser + schedule composition certification', () => {
  const harnesses: GatewayTestHarness[] = [];
  const originalFetch = globalThis.fetch;
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;

  afterEach(async () => {
    vi.stubGlobal('fetch', originalFetch);
    if (originalOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    }
    while (harnesses.length > 0) {
      await harnesses.pop()!.close();
    }
  });

  it(
    'composes delegated browser extraction with every-10m follow-up schedules, policy truth, and readiness evidence',
    async () => {
      process.env.OPENROUTER_API_KEY = 'browser-schedule-openrouter-key';

      let completionCalls = 0;
      const fetchMock = vi.fn(async (input: unknown) => {
        const url = String(input ?? '');
        if (!url.includes('openrouter.ai/api/v1/chat/completions')) {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        completionCalls += 1;
        return new Response(
          JSON.stringify(
            completionCalls === 1
              ? {
                  id: 'chatcmpl-browser-skill-1',
                  choices: [
                    {
                      message: {
                        content: '',
                        tool_calls: [
                          {
                            id: 'call_browser_skill_1',
                            function: {
                              name: 'skill_call',
                              arguments: JSON.stringify({
                                skill: 'scrapling-browser',
                                payload: {
                                  url: 'https://example.com/report',
                                  selector: '#main',
                                  extractionMode: 'markdown'
                                },
                                reason: 'Need a governed website extraction before composing the operator reply.'
                              })
                            }
                          }
                        ]
                      }
                    }
                  ],
                  usage: {
                    prompt_tokens: 16,
                    completion_tokens: 8,
                    total_tokens: 24
                  }
                }
              : {
                  id: 'chatcmpl-browser-skill-2',
                  choices: [
                    {
                      message: {
                        content: 'Delegated browser artifact captured. Cite the governed browser artifact instead of trusting the page directly.'
                      }
                    }
                  ],
                  usage: {
                    prompt_tokens: 18,
                    completion_tokens: 11,
                    total_tokens: 29
                  }
                }
          ),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        );
      });
      vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

      const harness = await createGatewayTestHarness('browser-schedule-composition', (config) => {
        const root = path.dirname(config.persistence.sqlitePath);
        config.browser.enabled = true;
        config.browser.transport = 'stdio';
        config.browser.executable = installFakeScraplingExecutable(root);
      });
      harnesses.push(harness);
      await applyCeoBaseline(harness);

      const browserResearcher = await createAgentProfile(harness, {
        name: 'Browser Researcher',
        title: 'Browser Research Specialist',
        systemPrompt: 'Use governed browser captures and summarize only verifiable findings.'
      });
      const operatorSessionId = await createInternalSession(harness, {
        sessionKey: 'internal:browser-schedule-origin',
        agentId: 'ceo-default',
        model: 'openrouter/free'
      });
      const delegatedSessionId = await createInternalSession(harness, {
        sessionKey: 'internal:browser-delegated',
        agentId: browserResearcher.id,
        model: 'openrouter/free'
      });

      const queued = await harness.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(delegatedSessionId)}/runs`,
        headers: {
          Authorization: `Bearer ${harness.config.server.apiToken}`,
          'Idempotency-Key': 'browser-schedule-composition'
        },
        payload: {
          prompt: 'Extract https://example.com/report with the governed browser capability and cite the resulting artifact.',
          runtime: 'process',
          model: 'openrouter/free',
          autoDelegate: false
        }
      });
      expect(queued.statusCode).toBe(201);
      const delegatedRunId = (queued.json() as { run: { id: string } }).run.id;

      const delegatedRun = await harness.waitForTerminalRun(delegatedRunId, 25_000);
      expect(delegatedRun.status).toBe('completed');

      const historyResponse = await harness.inject({
        method: 'GET',
        url: '/api/browser/history?limit=5'
      });
      expect(historyResponse.statusCode).toBe(200);
      const historyBody = historyResponse.json() as {
        history: {
          rows: Array<{
            runId: string;
            sessionId: string;
            selectedTool: string | null;
            promptInjectionDetected: boolean;
            artifacts: Array<{ handle: string; previewText: string }>;
          }>;
        };
      };
      const browserHistoryRow = historyBody.history.rows.find((entry) => entry.runId === delegatedRunId);
      expect(browserHistoryRow?.sessionId).toBe(delegatedSessionId);
      expect(browserHistoryRow?.selectedTool).toBe('get');
      expect(browserHistoryRow?.promptInjectionDetected).toBe(false);
      expect(browserHistoryRow?.artifacts[0]?.previewText).toContain('browser certification fixture content');

      const artifactHandle = browserHistoryRow?.artifacts[0]?.handle ?? null;
      expect(artifactHandle).toBeTruthy();

      const traceResponse = await harness.inject({
        method: 'GET',
        url: `/api/browser/history/${encodeURIComponent(delegatedRunId)}`
      });
      expect(traceResponse.statusCode).toBe(200);
      const traceBody = traceResponse.json() as {
        trace: {
          sessionId: string;
          route: {
            primaryTool: string;
            selectorStrategy: string;
            policyReasons: string[];
          } | null;
        };
      };
      expect(traceBody.trace.sessionId).toBe(delegatedSessionId);
      expect(traceBody.trace.route?.primaryTool).toBe('get');
      expect(['selector_first', 'document']).toContain(traceBody.trace.route?.selectorStrategy);
      expect(traceBody.trace.route?.policyReasons).toEqual([]);

      const artifactResponse = await harness.inject({
        method: 'GET',
        url: `/api/browser/artifacts/${encodeURIComponent(artifactHandle!)}`
      });
      expect(artifactResponse.statusCode).toBe(200);
      const artifactBody = artifactResponse.json() as {
        artifact: {
          contentPreview: string;
          fileName: string;
        };
      };
      expect(artifactBody.artifact.fileName).toContain('.md');
      expect(artifactBody.artifact.contentPreview).toContain('URL: https://example.com/report');

      const scheduleCreateResponse = await harness.inject({
        method: 'POST',
        url: '/api/schedules/request',
        payload: {
          requester: {
            agentId: 'ceo-default',
            sessionId: operatorSessionId
          },
          schedule: {
            label: 'Browser monitor follow-up',
            category: 'browser_monitor',
            cadence: 'every 10m',
            targetAgentId: browserResearcher.id,
            sessionTarget: 'dedicated_schedule_session',
            deliveryTarget: 'origin_session',
            prompt: 'Re-check https://example.com/report and report only actionable drift.',
            concurrencyPolicy: 'queue'
          }
        }
      });
      expect(scheduleCreateResponse.statusCode).toBe(201);
      const scheduleId = (scheduleCreateResponse.json() as { schedule: { id: string } }).schedule.id;

      const scheduleDetailResponse = await harness.inject({
        method: 'GET',
        url: `/api/schedules/${encodeURIComponent(scheduleId)}`
      });
      expect(scheduleDetailResponse.statusCode).toBe(200);
      const scheduleDetailBody = scheduleDetailResponse.json() as {
        schedule: {
          cadence: string;
          requestedBy: string | null;
          requestingSessionId: string | null;
          targetAgentId: string | null;
          deliveryTarget: string;
          nextRunAt: string | null;
        };
      };
      expect(scheduleDetailBody.schedule.cadence).toBe('every 10m');
      expect(scheduleDetailBody.schedule.requestedBy).toBe('agent:ceo-default');
      expect(scheduleDetailBody.schedule.requestingSessionId).toBe(operatorSessionId);
      expect(scheduleDetailBody.schedule.targetAgentId).toBe(browserResearcher.id);
      expect(scheduleDetailBody.schedule.deliveryTarget).toBe('origin_session');
      expect(scheduleDetailBody.schedule.nextRunAt).toBeTruthy();

      const scheduleRunResponse = await harness.inject({
        method: 'POST',
        url: `/api/schedules/${encodeURIComponent(scheduleId)}/run`,
        payload: {
          actor: 'operator'
        }
      });
      expect(scheduleRunResponse.statusCode).toBe(200);
      const scheduleRunId = (scheduleRunResponse.json() as { run?: { id?: string } }).run?.id;
      expect(scheduleRunId).toBeTruthy();
      const scheduleRun = await harness.waitForTerminalRun(scheduleRunId!, 25_000);
      expect(scheduleRun.status).toBe('completed');

      await harness.waitForCondition(
        `schedule ${scheduleId} completion history`,
        async () => {
          const detailResponse = await harness.inject({
            method: 'GET',
            url: `/api/schedules/${encodeURIComponent(scheduleId)}`
          });
          const detailBody = detailResponse.json() as {
            history: Array<{ status: string; summary: string | null; runId: string | null }>;
          };
          return detailBody.history.some((entry) => entry.status === 'completed' && entry.runId === scheduleRunId);
        },
        25_000
      );

      const receipt = await waitForOutboundContaining(harness, operatorSessionId, 'Schedule result: Browser monitor follow-up');
      expect(receipt.content).toContain('Status: completed');
      expect(receipt.content).toContain('Run:');

      const riskyResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/test',
        payload: {
          agentId: browserResearcher.id,
          url: 'https://example.com/report',
          requiresProxy: true,
          requiresStealth: true
        }
      });
      expect(riskyResponse.statusCode).toBe(200);
      const riskyBody = riskyResponse.json() as {
        test: {
          ok: boolean;
          blockedReason: string | null;
          requiresApproval: boolean;
          artifacts: Array<unknown>;
        };
        run: {
          status: string;
        };
      };
      expect(riskyBody.test.ok).toBe(false);
      expect(riskyBody.run.status).toBe('failed');
      expect(['proxy_blocked', 'stealth_blocked']).toContain(String(riskyBody.test.blockedReason));
      expect(riskyBody.test.requiresApproval).toBe(false);
      expect(riskyBody.test.artifacts).toHaveLength(0);

      const doctorResponse = await harness.inject({
        method: 'GET',
        url: '/api/browser/doctor'
      });
      expect(doctorResponse.statusCode).toBe(200);
      const doctorBody = doctorResponse.json() as {
        contract: {
          installDoctor: {
            dockerSupport: string[];
          };
        };
        status: {
          ready: boolean;
        };
      };
      expect(doctorBody.status.ready).toBe(true);
      expect(doctorBody.contract.installDoctor.dockerSupport).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Bake Scrapling plus browser dependencies into the image'),
          expect.stringContaining('Keep browser capability optional')
        ])
      );
    },
    60_000
  );
});
