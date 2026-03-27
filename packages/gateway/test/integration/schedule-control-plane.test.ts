import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createGatewayTestHarness,
  createRestartableGatewayTestHarness,
  type GatewayTestHarness,
  type RestartableGatewayTestHarness
} from './test-harness.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const TSX_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

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
  const executablePath = path.join(root, 'fake-scrapling.mjs');
  fs.writeFileSync(
    executablePath,
    [
      '#!/usr/bin/env node',
      'import fs from "node:fs";',
      'import path from "node:path";',
      '',
      'const args = process.argv.slice(2);',
      'const normalizeTool = (value) => String(value ?? "").replace(/-/g, "_");',
      'const buildBody = ({ tool, url }) => {',
      '  const normalizedTool = normalizeTool(tool);',
      '  const dynamicStealth = url.includes("dynamic-stealth");',
      '  const tiktokProfileMetrics = url.includes("tiktok-profile-metrics");',
      '  const xProfileMetrics = url.includes("x-profile-metrics");',
      '  return tiktokProfileMetrics',
      '    ? normalizedTool === "get"',
      '      ? "TikTok - Make Your Day"',
      '      : [',
      '          `Tool: ${normalizedTool}`,',
      '          `URL: ${url}`,',
      '          "minilanoy (@minilanoy) | TikTok",',
      '          "### **514**Following **3699**Followers **114.8K**Likes"',
      '        ].join("\\n")',
      '    : xProfileMetrics',
      '      ? normalizedTool === "get"',
      '        ? "Profile / X\\n\\nJavaScript is not available."',
      '        : [',
      '            `Tool: ${normalizedTool}`,',
      '            `URL: ${url}`,',
      '            "OpenAI (@OpenAI) / X",',
      '            "JavaScript is not available.",',
      '            "1,714 posts",',
      '            "[4 Following](/OpenAI/following)",',
      '            "[4.6M Followers](/OpenAI/verified_followers)",',
      '            "",',
      '            "OpenAI’s posts",',
      '            "==============",',
      '            "",',
      '            "GPT-5.4 Thinking and GPT-5.4 Pro are rolling out now in ChatGPT."',
      '          ].join("\\n")',
      '      : dynamicStealth',
      '        ? normalizedTool === "get"',
      '          ? "Dynamic Page Title"',
      '          : normalizedTool === "fetch"',
      '            ? "Login wall"',
      '            : [',
      '                `Tool: ${normalizedTool}`,',
      '                `URL: ${url}`,',
      '                "Dynamic content loaded with stealth",',
      '                "**25.5K** likes",',
      '                "**3264** comments",',
      '                "**1818** shares",',
      '                "**66** saves"',
      '              ].join("\\n")',
      '        : [',
      '            `Tool: ${normalizedTool}`,',
      '            `URL: ${url}`,',
      '            "Result: schedule browser fixture content"',
      '          ].join("\\n");',
      '};',
      '',
      'if ((args[0] ?? "") === "extract") {',
      '  const tool = args[1] ?? "get";',
      '  const url = args[2] ?? "";',
      '  const artifactPath = args[3] ?? "";',
      '  const body = buildBody({ tool, url });',
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
      '        const body = buildBody({ tool, url });',
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
      actor: 'schedule-control-plane-test'
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
      defaultRuntime: 'codex',
      defaultModel: 'default',
      allowedRuntimes: ['codex'],
      skills: ['testing'],
      tools: ['runtime:codex']
    }
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { agent: { id: string; title: string } }).agent;
};

const createBrowserAgentProfile = async (
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
      defaultModel: null,
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
  input: { sessionKey: string; agentId?: string }
): Promise<string> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: {
      sessionKey: input.sessionKey,
      label: input.sessionKey,
      agentId: input.agentId ?? 'ceo-default',
      runtime: 'process'
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

const getScheduleDetail = async (harness: GatewayTestHarness, scheduleId: string) => {
  const response = await harness.inject({
    method: 'GET',
    url: `/api/schedules/${encodeURIComponent(scheduleId)}`
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    schedule: {
      id: string;
      label: string;
      cadence: string;
      deliveryTarget: string;
      deliveryTargetSessionId: string | null;
      sessionTarget: string;
      requestedBy: string | null;
      requestingSessionId: string | null;
      concurrencyPolicy: string;
      domainPolicy: Record<string, unknown>;
      rateLimitPolicy: Record<string, unknown>;
    };
    history: Array<{
      id: string;
      status: string;
      summary: string | null;
      runId: string | null;
      sessionId: string | null;
    }>;
  };
};

const waitForScheduleHistoryStatus = async (
  harness: GatewayTestHarness,
  scheduleId: string,
  status: string,
  count: number
) => {
  let latest = await getScheduleDetail(harness, scheduleId);
  await harness.waitForCondition(
    `schedule ${scheduleId} to reach ${status} ${count} time(s)`,
    async () => {
      latest = await getScheduleDetail(harness, scheduleId);
      return latest.history.filter((entry) => entry.status === status).length >= count;
    },
    12_000
  );
  return latest;
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
  const telegramSession = body.sessions.find((entry) => entry.channel === 'telegram');
  expect(telegramSession?.id).toBeTruthy();
  return telegramSession!.id;
};

const runOps = async (args: string[]) => {
  const child = spawn(TSX_BIN, ['scripts/runtime/ops.ts', ...args], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`ops command failed: ${stderr || stdout}`);
  }
  return stdout;
};

describe('schedule control plane certification', () => {
  const harnesses: GatewayTestHarness[] = [];
  const restartableHarnesses: RestartableGatewayTestHarness[] = [];
  const originalLocalRuntimeRoots = {
    codex: process.env.OPS_LOCAL_CODEX_ROOT,
    claude: process.env.OPS_LOCAL_CLAUDE_PROJECTS_ROOT,
    gemini: process.env.OPS_LOCAL_GEMINI_ROOT
  };

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()!.close();
    }
    while (restartableHarnesses.length > 0) {
      await restartableHarnesses.pop()!.cleanup();
    }
    if (originalLocalRuntimeRoots.codex === undefined) {
      delete process.env.OPS_LOCAL_CODEX_ROOT;
    } else {
      process.env.OPS_LOCAL_CODEX_ROOT = originalLocalRuntimeRoots.codex;
    }
    if (originalLocalRuntimeRoots.claude === undefined) {
      delete process.env.OPS_LOCAL_CLAUDE_PROJECTS_ROOT;
    } else {
      process.env.OPS_LOCAL_CLAUDE_PROJECTS_ROOT = originalLocalRuntimeRoots.claude;
    }
    if (originalLocalRuntimeRoots.gemini === undefined) {
      delete process.env.OPS_LOCAL_GEMINI_ROOT;
    } else {
      process.env.OPS_LOCAL_GEMINI_ROOT = originalLocalRuntimeRoots.gemini;
    }
  });

  it(
    'supports typed schedule requests, CRUD mutations, manual runs, and origin-session delivery receipts',
    async () => {
      const harness = await createGatewayTestHarness('schedule-api-control-plane');
      harnesses.push(harness);
      await applyCeoBaseline(harness);

      const docsWriter = await createAgentProfile(harness, {
        name: 'Docs Writer',
        title: 'Technical Writer',
        systemPrompt: 'Produce concise follow-up notes.'
      });
      const originSessionId = await createInternalSession(harness, {
        sessionKey: 'internal:schedule-origin'
      });

      const createResponse = await harness.inject({
        method: 'POST',
        url: '/api/schedules/request',
        payload: {
          requester: {
            agentId: 'ceo-default',
            sessionId: originSessionId
          },
          schedule: {
            label: 'README follow-up',
            category: 'follow_up',
            cadence: 'every 30m',
            targetAgentId: docsWriter.id,
            sessionTarget: 'dedicated_schedule_session',
            deliveryTarget: 'origin_session',
            prompt: 'Prepare an actionable README drift summary.',
            concurrencyPolicy: 'queue'
          }
        }
      });
      expect(createResponse.statusCode).toBe(201);
      const createBody = createResponse.json() as {
        schedule: { id: string; requestedBy: string | null; requestingSessionId: string | null; deliveryTarget: string };
      };
      const scheduleId = createBody.schedule.id;
      expect(createBody.schedule.requestedBy).toBe('agent:ceo-default');
      expect(createBody.schedule.requestingSessionId).toBe(originSessionId);
      expect(createBody.schedule.deliveryTarget).toBe('origin_session');

      const duplicateResponse = await harness.inject({
        method: 'POST',
        url: '/api/schedules/request',
        payload: {
          requester: {
            agentId: 'ceo-default',
            sessionId: originSessionId
          },
          schedule: {
            label: 'README follow-up',
            category: 'follow_up',
            cadence: 'every 30m',
            targetAgentId: docsWriter.id,
            sessionTarget: 'dedicated_schedule_session',
            deliveryTarget: 'origin_session',
            prompt: 'Prepare an actionable README drift summary.'
          }
        }
      });
      expect(duplicateResponse.statusCode).toBe(409);

      const updateResponse = await harness.inject({
        method: 'PATCH',
        url: `/api/schedules/${encodeURIComponent(scheduleId)}`,
        payload: {
          actor: 'operator',
          cadence: 'every 45m',
          concurrencyPolicy: 'replace',
          domainPolicy: {
            allowedDomains: ['example.com']
          },
          rateLimitPolicy: {
            maxRunsPerHour: 4
          }
        }
      });
      expect(updateResponse.statusCode).toBe(200);

      const detailAfterUpdate = await getScheduleDetail(harness, scheduleId);
      expect(detailAfterUpdate.schedule.cadence).toBe('every 45m');
      expect(detailAfterUpdate.schedule.concurrencyPolicy).toBe('replace');
      expect(detailAfterUpdate.schedule.domainPolicy).toMatchObject({
        allowedDomains: ['example.com']
      });
      expect(detailAfterUpdate.schedule.rateLimitPolicy).toMatchObject({
        maxRunsPerHour: 4
      });

      const pauseResponse = await harness.inject({
        method: 'POST',
        url: `/api/schedules/${encodeURIComponent(scheduleId)}/pause`,
        payload: {
          actor: 'operator'
        }
      });
      expect(pauseResponse.statusCode).toBe(200);

      const resumeResponse = await harness.inject({
        method: 'POST',
        url: `/api/schedules/${encodeURIComponent(scheduleId)}/resume`
      });
      expect(resumeResponse.statusCode).toBe(200);

      const runResponse = await harness.inject({
        method: 'POST',
        url: `/api/schedules/${encodeURIComponent(scheduleId)}/run`,
        payload: {
          actor: 'operator'
        }
      });
      expect(runResponse.statusCode).toBe(200);
      const runBody = runResponse.json() as {
        run?: { id?: string };
      };
      expect(runBody.run?.id).toBeTruthy();
      await harness.waitForTerminalRun(runBody.run!.id!);

      const detailAfterRun = await waitForScheduleHistoryStatus(harness, scheduleId, 'completed', 1);
      expect(detailAfterRun.history.some((entry) => entry.summary?.includes('README drift summary.'))).toBe(true);

      const receipt = await waitForOutboundContaining(harness, originSessionId, 'Schedule result: README follow-up');
      expect(receipt.content).toContain('Status: completed');

      const cronStatusResponse = await harness.inject({
        method: 'GET',
        url: '/api/cron/status'
      });
      expect(cronStatusResponse.statusCode).toBe(200);
      const cronStatusBody = cronStatusResponse.json() as {
        jobs: Array<{ jobName: string }>;
      };
      expect(cronStatusBody.jobs.some((job) => job.jobName === 'housekeeping')).toBe(true);
    },
    25_000
  );

  it(
    'runs browser_capture schedules directly, records browser history, and delivers origin receipts without an llm lane',
    async () => {
      const harness = await createGatewayTestHarness('schedule-browser-capture', (config) => {
        const root = path.dirname(config.persistence.sqlitePath);
        config.browser.enabled = true;
        config.browser.transport = 'stdio';
        config.browser.executable = installFakeScraplingExecutable(root);
        config.browser.policy.allowStealth = true;
        config.browser.policy.requireApprovalForStealth = false;
      });
      harnesses.push(harness);
      await applyCeoBaseline(harness);

      const browserResearcher = await createBrowserAgentProfile(harness, {
        name: 'Browser Researcher',
        title: 'Browser Researcher',
        systemPrompt: 'Use the governed browser capability and summarize only verifiable findings.'
      });
      const originSessionId = await createInternalSession(harness, {
        sessionKey: 'internal:schedule-browser-origin'
      });

      const createResponse = await harness.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: {
          actor: 'operator',
          label: 'TikTok profile pulse',
          category: 'browser_monitor',
          cadence: 'every 1m',
          targetAgentId: browserResearcher.id,
          requestingSessionId: originSessionId,
          sessionTarget: 'dedicated_schedule_session',
          deliveryTarget: 'origin_session',
          jobMode: 'browser_capture',
          metadata: {
            browserRequest: {
              url: 'https://example.com/dynamic-stealth',
              intent: 'monitor',
              dynamicLikely: true,
              previewChars: 400
            }
          }
        }
      });
      expect(createResponse.statusCode).toBe(201);
      const createBody = createResponse.json() as {
        schedule: { id: string; prompt: string | null };
      };
      expect(createBody.schedule.prompt).toContain('Capture https://example.com/dynamic-stealth');

      const runResponse = await harness.inject({
        method: 'POST',
        url: `/api/schedules/${encodeURIComponent(createBody.schedule.id)}/run`,
        payload: {
          actor: 'operator'
        }
      });
      expect(runResponse.statusCode).toBe(200);
      const runBody = runResponse.json() as {
        run?: { id?: string };
      };
      expect(runBody.run?.id).toBeTruthy();
      await harness.waitForTerminalRun(runBody.run!.id!);

      const detailAfterRun = await waitForScheduleHistoryStatus(harness, createBody.schedule.id, 'completed', 1);
      expect(detailAfterRun.history.some((entry) => entry.summary?.includes('Browser schedule: TikTok profile pulse'))).toBe(true);
      expect(detailAfterRun.history.some((entry) => entry.summary?.includes('Tool: stealthy_fetch • Transport: stdio'))).toBe(true);

      const browserHistoryResponse = await harness.inject({
        method: 'GET',
        url: '/api/browser/history?limit=10'
      });
      expect(browserHistoryResponse.statusCode).toBe(200);
      const browserHistory = browserHistoryResponse.json() as {
        history: {
          rows: Array<{
            runId: string;
            selectedTool: string | null;
          }>;
        };
      };
      expect(
        browserHistory.history.rows.find((entry) => entry.runId === runBody.run?.id)?.selectedTool
      ).toBe('stealthy_fetch');

      const receipt = await waitForOutboundContaining(harness, originSessionId, 'Schedule result: TikTok profile pulse');
      expect(receipt.content).toContain('Status: completed');
      expect(receipt.content).toContain('Tool: stealthy_fetch • Transport: stdio');
    },
    25_000
  );

  it(
    'finalizes origin-session browser_capture schedules with completed history and same-session output',
    async () => {
      const harness = await createGatewayTestHarness('schedule-browser-origin-session', (config) => {
        const root = path.dirname(config.persistence.sqlitePath);
        config.browser.enabled = true;
        config.browser.transport = 'stdio';
        config.browser.executable = installFakeScraplingExecutable(root);
        config.browser.policy.allowStealth = true;
        config.browser.policy.requireApprovalForStealth = false;
      });
      harnesses.push(harness);
      await applyCeoBaseline(harness);

      const browserResearcher = await createBrowserAgentProfile(harness, {
        name: 'Origin Browser Researcher',
        title: 'Origin Browser Researcher',
        systemPrompt: 'Use the governed browser capability and summarize only verifiable findings.'
      });
      const originSessionId = await createInternalSession(harness, {
        sessionKey: 'internal:schedule-browser-origin-direct',
        agentId: browserResearcher.id
      });

      const createResponse = await harness.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: {
          actor: 'operator',
          label: 'Origin TikTok pulse',
          category: 'browser_monitor',
          cadence: 'every 1m',
          targetAgentId: browserResearcher.id,
          requestingSessionId: originSessionId,
          sessionTarget: 'origin_session',
          deliveryTarget: 'origin_session',
          jobMode: 'browser_capture',
          metadata: {
            browserRequest: {
              url: 'https://example.com/dynamic-stealth',
              intent: 'monitor',
              dynamicLikely: true,
              previewChars: 400
            }
          }
        }
      });
      expect(createResponse.statusCode).toBe(201);
      const createBody = createResponse.json() as {
        schedule: { id: string };
      };

      const runResponse = await harness.inject({
        method: 'POST',
        url: `/api/schedules/${encodeURIComponent(createBody.schedule.id)}/run`,
        payload: {
          actor: 'operator'
        }
      });
      expect(runResponse.statusCode).toBe(200);
      const runBody = runResponse.json() as {
        run?: { id?: string };
      };
      expect(runBody.run?.id).toBeTruthy();
      await harness.waitForTerminalRun(runBody.run!.id!);

      const detailAfterRun = await waitForScheduleHistoryStatus(harness, createBody.schedule.id, 'completed', 1);
      expect(detailAfterRun.history.some((entry) => entry.runId === runBody.run?.id && entry.status === 'completed')).toBe(true);
      expect(detailAfterRun.history.some((entry) => entry.summary?.includes('Browser schedule: Origin TikTok pulse'))).toBe(true);
      expect(detailAfterRun.history.some((entry) => entry.summary?.includes('Tool: stealthy_fetch • Transport: stdio'))).toBe(true);

      const originMessages = await listMessages(harness, originSessionId);
      expect(
        originMessages.some(
          (entry) => entry.direction === 'outbound' && entry.content.includes('Browser schedule: Origin TikTok pulse')
        )
      ).toBe(true);
    },
    25_000
  );

  it(
    'renders browser_capture schedule receipts from structured Scrapling metrics instead of raw preview dumps',
    async () => {
      const harness = await createGatewayTestHarness('schedule-browser-structured-summary', (config) => {
        const root = path.dirname(config.persistence.sqlitePath);
        config.browser.enabled = true;
        config.browser.transport = 'stdio';
        config.browser.executable = installFakeScraplingExecutable(root);
        config.browser.policy.allowStealth = true;
        config.browser.policy.requireApprovalForStealth = false;
      });
      harnesses.push(harness);
      await applyCeoBaseline(harness);

      const browserResearcher = await createBrowserAgentProfile(harness, {
        name: 'Metrics Browser Researcher',
        title: 'Metrics Browser Researcher',
        systemPrompt: 'Use the governed browser capability and summarize only verifiable findings.'
      });
      const originSessionId = await createInternalSession(harness, {
        sessionKey: 'internal:schedule-browser-structured'
      });

      const createResponse = await harness.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: {
          actor: 'operator',
          label: 'TikTok metrics pulse',
          category: 'browser_monitor',
          cadence: 'every 1m',
          targetAgentId: browserResearcher.id,
          requestingSessionId: originSessionId,
          sessionTarget: 'dedicated_schedule_session',
          deliveryTarget: 'origin_session',
          jobMode: 'browser_capture',
          metadata: {
            browserRequest: {
              url: 'https://example.com/tiktok-profile-metrics',
              intent: 'structured_extract',
              dynamicLikely: true,
              previewChars: 400
            }
          }
        }
      });
      expect(createResponse.statusCode).toBe(201);
      const createBody = createResponse.json() as {
        schedule: { id: string };
      };

      const runResponse = await harness.inject({
        method: 'POST',
        url: `/api/schedules/${encodeURIComponent(createBody.schedule.id)}/run`,
        payload: {
          actor: 'operator'
        }
      });
      expect(runResponse.statusCode).toBe(200);
      const runBody = runResponse.json() as {
        run?: { id?: string };
      };
      expect(runBody.run?.id).toBeTruthy();
      await harness.waitForTerminalRun(runBody.run!.id!);

      const detailAfterRun = await waitForScheduleHistoryStatus(harness, createBody.schedule.id, 'completed', 1);
      const completedSummary = detailAfterRun.history.find((entry) => entry.runId === runBody.run?.id)?.summary ?? '';
      expect(completedSummary).toContain('Verified browser capture for @minilanoy');
      expect(completedSummary).toContain('Following 514');
      expect(completedSummary).toContain('Followers 3699');
      expect(completedSummary).toContain('Likes 114.8K');
      expect(completedSummary).not.toContain('Preview:');
      expect(completedSummary).not.toContain('TikTok - Make Your Day');

      const receipt = await waitForOutboundContaining(harness, originSessionId, 'Schedule result: TikTok metrics pulse');
      expect(receipt.content).toContain('Verified browser capture for @minilanoy');
      expect(receipt.content).toContain('Following 514');
      expect(receipt.content).toContain('Followers 3699');
      expect(receipt.content).toContain('Likes 114.8K');
      expect(receipt.content).not.toContain('Preview:');
    },
    25_000
  );

  it(
    'renders X browser_capture schedule receipts from structured profile metrics instead of interstitial noise',
    async () => {
      const harness = await createGatewayTestHarness('schedule-browser-x-structured-summary', (config) => {
        const root = path.dirname(config.persistence.sqlitePath);
        config.browser.enabled = true;
        config.browser.transport = 'stdio';
        config.browser.executable = installFakeScraplingExecutable(root);
        config.browser.policy.allowStealth = true;
        config.browser.policy.requireApprovalForStealth = false;
      });
      harnesses.push(harness);
      await applyCeoBaseline(harness);

      const browserResearcher = await createBrowserAgentProfile(harness, {
        name: 'X Metrics Browser Researcher',
        title: 'X Metrics Browser Researcher',
        systemPrompt: 'Use the governed browser capability and summarize only verifiable findings.'
      });
      const originSessionId = await createInternalSession(harness, {
        sessionKey: 'internal:schedule-browser-x-structured'
      });

      const createResponse = await harness.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: {
          actor: 'operator',
          label: 'X metrics pulse',
          category: 'browser_monitor',
          cadence: 'every 1m',
          targetAgentId: browserResearcher.id,
          requestingSessionId: originSessionId,
          sessionTarget: 'dedicated_schedule_session',
          deliveryTarget: 'origin_session',
          jobMode: 'browser_capture',
          metadata: {
            browserRequest: {
              url: 'https://x.com/openai?fixture=x-profile-metrics',
              intent: 'monitor',
              dynamicLikely: true,
              previewChars: 400
            }
          }
        }
      });
      expect(createResponse.statusCode).toBe(201);
      const createBody = createResponse.json() as {
        schedule: { id: string };
      };

      const runResponse = await harness.inject({
        method: 'POST',
        url: `/api/schedules/${encodeURIComponent(createBody.schedule.id)}/run`,
        payload: {
          actor: 'operator'
        }
      });
      expect(runResponse.statusCode).toBe(200);
      const runBody = runResponse.json() as {
        run?: { id?: string };
      };
      expect(runBody.run?.id).toBeTruthy();
      await harness.waitForTerminalRun(runBody.run!.id!);

      const detailAfterRun = await waitForScheduleHistoryStatus(harness, createBody.schedule.id, 'completed', 1);
      const completedSummary = detailAfterRun.history.find((entry) => entry.runId === runBody.run?.id)?.summary ?? '';
      expect(completedSummary).toContain('Verified browser capture for @openai');
      expect(completedSummary).toContain('Posts 1,714');
      expect(completedSummary).toContain('Following 4');
      expect(completedSummary).toContain('Followers 4.6M');
      expect(completedSummary).not.toContain('Create account');
      expect(completedSummary).not.toContain('GPT-5.4 Thinking');

      const receipt = await waitForOutboundContaining(harness, originSessionId, 'Schedule result: X metrics pulse');
      expect(receipt.content).toContain('Verified browser capture for @openai');
      expect(receipt.content).toContain('Posts 1,714');
      expect(receipt.content).toContain('Following 4');
      expect(receipt.content).toContain('Followers 4.6M');
      expect(receipt.content).not.toContain('Create account');
      expect(receipt.content).not.toContain('GPT-5.4 Thinking');
    },
    25_000
  );

  it(
    'runs browser-backed workflow schedules through the direct governed browser lane with template metadata preserved',
    async () => {
      const harness = await createGatewayTestHarness('schedule-workflow-browser-template', (config) => {
        const root = path.dirname(config.persistence.sqlitePath);
        config.browser.enabled = true;
        config.browser.transport = 'stdio';
        config.browser.executable = installFakeScraplingExecutable(root);
        config.browser.policy.allowStealth = true;
        config.browser.policy.requireApprovalForStealth = false;
      });
      harnesses.push(harness);
      await applyCeoBaseline(harness);

      const browserResearcher = await createBrowserAgentProfile(harness, {
        name: 'Workflow Browser Researcher',
        title: 'Workflow Browser Researcher',
        systemPrompt: 'Use the governed browser capability and summarize only verifiable findings.'
      });
      const originSessionId = await createInternalSession(harness, {
        sessionKey: 'internal:schedule-browser-workflow'
      });

      const createResponse = await harness.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: {
          actor: 'operator',
          label: 'TikTok workflow watch',
          category: 'browser_monitor',
          cadence: 'every 15m',
          targetAgentId: browserResearcher.id,
          requestingSessionId: originSessionId,
          sessionTarget: 'dedicated_schedule_session',
          deliveryTarget: 'origin_session',
          jobMode: 'workflow',
          metadata: {
            workflow: {
              templateId: 'social_profile_watch',
              focus: '@minilanoy growth watch',
              browserRequest: {
                url: 'https://example.com/tiktok-profile-metrics',
                intent: 'structured_extract',
                dynamicLikely: true,
                extractorId: 'tiktok_profile',
                mainContentOnly: true,
                previewChars: 400
              }
            }
          }
        }
      });
      expect(createResponse.statusCode).toBe(201);
      const createBody = createResponse.json() as {
        schedule: {
          id: string;
          prompt: string | null;
          runtime: string | null;
          model: string | null;
          jobMode: string | null;
        };
      };
      expect(createBody.schedule.jobMode).toBe('workflow');
      expect(createBody.schedule.runtime).toBe('process');
      expect(createBody.schedule.model).toBeNull();
      expect(createBody.schedule.prompt).toContain('Capture https://example.com/tiktok-profile-metrics');

      const runResponse = await harness.inject({
        method: 'POST',
        url: `/api/schedules/${encodeURIComponent(createBody.schedule.id)}/run`,
        payload: {
          actor: 'operator'
        }
      });
      expect(runResponse.statusCode).toBe(200);
      const runBody = runResponse.json() as {
        run?: { id?: string };
      };
      expect(runBody.run?.id).toBeTruthy();
      await harness.waitForTerminalRun(runBody.run!.id!);

      const detailAfterRun = await waitForScheduleHistoryStatus(harness, createBody.schedule.id, 'completed', 1);
      const completedSummary = detailAfterRun.history.find((entry) => entry.runId === runBody.run?.id)?.summary ?? '';
      expect(completedSummary).toContain('Verified browser capture for @minilanoy');
      expect(completedSummary).toContain('Following 514');
      expect(completedSummary).toContain('Followers 3699');
      expect(completedSummary).toContain('Likes 114.8K');

      const browserHistoryResponse = await harness.inject({
        method: 'GET',
        url: '/api/browser/history?limit=10'
      });
      expect(browserHistoryResponse.statusCode).toBe(200);
      const browserHistory = browserHistoryResponse.json() as {
        history: {
          rows: Array<{
            runId: string;
            selectedTool: string | null;
          }>;
        };
      };
      const browserEntry = browserHistory.history.rows.find((entry) => entry.runId === runBody.run?.id);
      expect(browserEntry?.selectedTool).toBe('fetch');

      const receipt = await waitForOutboundContaining(harness, originSessionId, 'Schedule result: TikTok workflow watch');
      expect(receipt.content).toContain('Verified browser capture for @minilanoy');
      expect(receipt.content).not.toContain('Preview:');
    },
    25_000
  );

  it(
    'supports Telegram schedule controls and CLI parity for request, route, show, and history flows',
    async () => {
      const harness = await createGatewayTestHarness('schedule-telegram-cli');
      harnesses.push(harness);
      await applyCeoBaseline(harness);

      const docsWriter = await createAgentProfile(harness, {
        name: 'Docs Writer',
        title: 'Technical Writer',
        systemPrompt: 'Produce concise operator follow-ups.'
      });

      const senderId = 91234;
      const bootstrapResponse = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 912340,
          senderId,
          text: '/schedules',
          username: 'scheduleops'
        })
      });
      expect(bootstrapResponse.statusCode).toBe(200);
      const telegramSessionId = await findTelegramSessionId(harness);

      const createResponse = await harness.inject({
        method: 'POST',
        url: '/api/schedules/request',
        payload: {
          requester: {
            agentId: 'ceo-default',
            sessionId: telegramSessionId
          },
          schedule: {
            label: 'Telegram README follow-up',
            category: 'follow_up',
            cadence: 'every 1h',
            targetAgentId: docsWriter.id,
            sessionTarget: 'dedicated_schedule_session',
            deliveryTarget: 'origin_session',
            prompt: 'Prepare the Telegram control-plane proof.'
          }
        }
      });
      expect(createResponse.statusCode).toBe(201);
      const scheduleId = (createResponse.json() as { schedule: { id: string } }).schedule.id;

      for (const [updateId, text] of [
        [912341, `/schedule show ${scheduleId}`],
        [912342, `/schedule route ${scheduleId} origin_session ${telegramSessionId}`],
        [912343, `/schedule run ${scheduleId}`],
        [912344, `/schedule history ${scheduleId}`]
      ] as const) {
        const response = await harness.inject({
          method: 'POST',
          url: '/api/ingress/telegram',
          payload: createTelegramPayload({
            updateId,
            senderId,
            text,
            username: 'scheduleops'
          })
        });
        expect(response.statusCode).toBe(200);
      }

      await waitForOutboundContaining(harness, telegramSessionId, `Schedule ${scheduleId} queued run`);
      await waitForOutboundContaining(harness, telegramSessionId, `Schedule history for ${scheduleId}`);

      const host = await harness.app.listen({
        host: harness.config.server.host,
        port: 0
      });
      const token = harness.config.server.apiToken;

      const cliCreate = await runOps([
        '--host',
        host,
        '--token',
        token,
        'schedule',
        'request',
        '--requester-agent',
        'ceo-default',
        '--requester-session',
        telegramSessionId,
        '--label',
        'CLI follow-up',
        '--category',
        'follow_up',
        '--cadence',
        'every 2h',
        '--target-agent',
        docsWriter.id,
        '--prompt',
        'Prepare the CLI parity proof.'
      ]);
      const cliScheduleId = cliCreate.match(/^Schedule (.+)$/m)?.[1]?.trim();
      expect(cliScheduleId).toBeTruthy();

      const cliRoute = await runOps([
        '--host',
        host,
        '--token',
        token,
        'schedule',
        'route',
        cliScheduleId!,
        'artifact_only'
      ]);
      expect(cliRoute).toContain('delivery_target=artifact_only');

      const cliShow = await runOps([
        '--host',
        host,
        '--token',
        token,
        'schedule',
        'show',
        cliScheduleId!
      ]);
      expect(cliShow).toContain('label=CLI follow-up');
      expect(cliShow).toContain('delivery_target=artifact_only');

      const cliHistory = await runOps([
        '--host',
        host,
        '--token',
        token,
        'schedule',
        'history',
        cliScheduleId!
      ]);
      expect(cliHistory).toContain('Schedule history');
    },
    35_000
  );

  it(
    'survives restart without duplicate due fires and suppresses heartbeat-only silent deliveries while still delivering actionable ones',
    async () => {
      const restartable = await createRestartableGatewayTestHarness('schedule-restart-durability');
      restartableHarnesses.push(restartable);
      const localRuntimeRoots = {
        codex: path.join(restartable.root, 'local-runtime', 'codex'),
        claude: path.join(restartable.root, 'local-runtime', 'claude'),
        gemini: path.join(restartable.root, 'local-runtime', 'gemini')
      };
      for (const localRoot of Object.values(localRuntimeRoots)) {
        fs.mkdirSync(localRoot, { recursive: true });
      }
      process.env.OPS_LOCAL_CODEX_ROOT = localRuntimeRoots.codex;
      process.env.OPS_LOCAL_CLAUDE_PROJECTS_ROOT = localRuntimeRoots.claude;
      process.env.OPS_LOCAL_GEMINI_ROOT = localRuntimeRoots.gemini;
      let harness = await restartable.buildApp();
      await harness.app.listen({
        host: harness.config.server.host,
        port: 0
      });
      await applyCeoBaseline(harness);

      const docsWriter = await createAgentProfile(harness, {
        name: 'Docs Writer',
        title: 'Technical Writer',
        systemPrompt: 'Produce actionable follow-up notes.'
      });
      const originSessionId = await createInternalSession(harness, {
        sessionKey: 'internal:schedule-restart-origin'
      });

      const createResponse = await harness.inject({
        method: 'POST',
        url: '/api/schedules/request',
        payload: {
          requester: {
            agentId: 'ceo-default',
            sessionId: originSessionId
          },
          schedule: {
            label: 'Restart-safe follow-up',
            category: 'follow_up',
            cadence: 'every 4h',
            targetAgentId: docsWriter.id,
            sessionTarget: 'dedicated_schedule_session',
            deliveryTarget: 'origin_session',
            prompt: 'Produce the restart-safe proof.'
          }
        }
      });
      expect(createResponse.statusCode).toBe(201);
      const restartScheduleId = (createResponse.json() as { schedule: { id: string } }).schedule.id;

      let db = restartable.createDb();
      db.updateScheduleJob(restartScheduleId, {
        nextRunAt: new Date(Date.now() - 60_000).toISOString()
      });
      db.close();

      await harness.waitForCondition(
        'initial scheduled run completion',
        async () => (await getScheduleDetail(harness, restartScheduleId)).history.filter((entry) => entry.status === 'completed').length >= 1,
        15_000
      );
      await waitForOutboundContaining(harness, originSessionId, 'Schedule result: Restart-safe follow-up');

      await restartable.closeCurrentApp();
      db = restartable.createDb();
      db.updateScheduleJob(restartScheduleId, {
        nextRunAt: new Date(Date.now() - 60_000).toISOString()
      });
      db.close();

      harness = await restartable.buildApp();
      await harness.app.listen({
        host: harness.config.server.host,
        port: 0
      });
      await waitForScheduleHistoryStatus(harness, restartScheduleId, 'completed', 2);
      await new Promise((resolve) => setTimeout(resolve, 600));
      const detailAfterRestart = await getScheduleDetail(harness, restartScheduleId);
      expect(detailAfterRestart.history.filter((entry) => entry.status === 'completed')).toHaveLength(2);

      const heartbeatScheduleResponse = await harness.inject({
        method: 'POST',
        url: '/api/schedules/request',
        payload: {
          requester: {
            agentId: 'ceo-default',
            sessionId: originSessionId
          },
          schedule: {
            label: 'Heartbeat probe',
            category: 'follow_up',
            cadence: 'every 12h',
            targetAgentId: docsWriter.id,
            sessionTarget: 'dedicated_schedule_session',
            deliveryTarget: 'silent_on_heartbeat',
            prompt: 'HEARTBEAT_OK'
          }
        }
      });
      expect(heartbeatScheduleResponse.statusCode).toBe(201);
      const heartbeatScheduleId = (heartbeatScheduleResponse.json() as { schedule: { id: string } }).schedule.id;

      const actionableScheduleResponse = await harness.inject({
        method: 'POST',
        url: '/api/schedules/request',
        payload: {
          requester: {
            agentId: 'ceo-default',
            sessionId: originSessionId
          },
          schedule: {
            label: 'Actionable probe',
            category: 'follow_up',
            cadence: 'every 12h',
            targetAgentId: docsWriter.id,
            sessionTarget: 'dedicated_schedule_session',
            deliveryTarget: 'silent_on_heartbeat',
            prompt: 'Actionable drift detected.'
          }
        }
      });
      expect(actionableScheduleResponse.statusCode).toBe(201);
      const actionableScheduleId = (actionableScheduleResponse.json() as { schedule: { id: string } }).schedule.id;

      const messagesBefore = await listMessages(harness, originSessionId);
      const runHeartbeatResponse = await harness.inject({
        method: 'POST',
        url: `/api/schedules/${encodeURIComponent(heartbeatScheduleId)}/run`
      });
      expect(runHeartbeatResponse.statusCode).toBe(200);
      const heartbeatRunId = (runHeartbeatResponse.json() as { run?: { id?: string } }).run?.id;
      expect(heartbeatRunId).toBeTruthy();
      await harness.waitForTerminalRun(heartbeatRunId!);
      await waitForScheduleHistoryStatus(harness, heartbeatScheduleId, 'completed', 1);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const messagesAfterHeartbeat = await listMessages(harness, originSessionId);
      expect(
        messagesAfterHeartbeat.filter((entry) => entry.content.includes('Schedule result: Heartbeat probe')).length
      ).toBe(
        messagesBefore.filter((entry) => entry.content.includes('Schedule result: Heartbeat probe')).length
      );

      const runActionableResponse = await harness.inject({
        method: 'POST',
        url: `/api/schedules/${encodeURIComponent(actionableScheduleId)}/run`
      });
      expect(runActionableResponse.statusCode).toBe(200);
      const actionableRunId = (runActionableResponse.json() as { run?: { id?: string } }).run?.id;
      expect(actionableRunId).toBeTruthy();
      await harness.waitForTerminalRun(actionableRunId!);
      await waitForScheduleHistoryStatus(harness, actionableScheduleId, 'completed', 1);
      const actionableReceipt = await waitForOutboundContaining(harness, originSessionId, 'Schedule result: Actionable probe');
      expect(actionableReceipt.content).toContain('Actionable drift detected.');
    },
    40_000
  );
});
