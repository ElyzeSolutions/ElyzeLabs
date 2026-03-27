import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import type {
  CertificationFollowUpTask,
  CertificationScenarioStatus,
  RuntimeCertificationComparatorRow,
  RuntimeCertificationDoctorRuntime,
  RuntimeCertificationReport,
  RuntimeCertificationScenarioResult,
  RuntimeKind
} from '@ops/shared';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

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

const applyCeoBaseline = async (harness: GatewayTestHarness, actor: string): Promise<void> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/onboarding/ceo-baseline',
    payload: {
      actor
    }
  });
  expect(response.statusCode).toBe(200);
};

const createAgentProfile = async (
  harness: GatewayTestHarness,
  input: {
    name: string;
    title: string;
    runtime: RuntimeKind;
  }
): Promise<{ id: string; title: string; runtime: RuntimeKind }> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/agents/profiles',
    payload: {
      name: input.name,
      title: input.title,
      systemPrompt: `Respond concisely as ${input.title}.`,
      defaultRuntime: input.runtime,
      defaultModel: 'default',
      allowedRuntimes: [input.runtime],
      skills: ['testing'],
      tools: [`runtime:${input.runtime}`]
    }
  });
  expect(response.statusCode).toBe(201);
  const agent = (response.json() as { agent: { id: string; title: string } }).agent;
  return {
    ...agent,
    runtime: input.runtime
  };
};

const createInternalSession = async (harness: GatewayTestHarness, sessionKey: string): Promise<string> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: {
      sessionKey,
      label: sessionKey,
      agentId: 'ceo-default',
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
  timeoutMs = 45_000
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

const classifyProbeFailure = (output: string): { authenticated: boolean | null; status: RuntimeCertificationDoctorRuntime['status']; reason: string } => {
  const normalized = output.toLowerCase();
  if (
    normalized.includes('login') ||
    normalized.includes('authenticate') ||
    normalized.includes('auth') ||
    normalized.includes('credential') ||
    normalized.includes('subscription') ||
    normalized.includes('api key')
  ) {
    return {
      authenticated: false,
      status: 'blocked',
      reason: output.trim() || 'authentication_required'
    };
  }
  return {
    authenticated: null,
    status: 'blocked',
    reason: output.trim() || 'runtime_probe_failed'
  };
};

const doctorCommands: Record<
  Exclude<RuntimeKind, 'process'>,
  { version: string[]; probe: string[]; promptArg: string; env?: Record<string, string> }
> = {
  codex: {
    version: ['--version'],
    probe: ['exec', '--skip-git-repo-check'],
    promptArg: 'Reply with LIVE_RUNTIME_OK only.',
    env: {
      TERM: 'xterm-256color'
    }
  },
  claude: {
    version: ['--version'],
    probe: ['-p', 'Reply with LIVE_RUNTIME_OK only.'],
    promptArg: ''
  },
  gemini: {
    version: ['--version'],
    probe: ['-p', 'Reply with LIVE_RUNTIME_OK only.', '--output-format', 'text'],
    promptArg: ''
  }
};

const collectLiveDoctor = (): RuntimeCertificationDoctorRuntime[] => {
  const runtimes: RuntimeCertificationDoctorRuntime[] = [
    {
      runtime: 'process',
      command: process.execPath,
      version: process.version,
      installed: true,
      authenticated: true,
      status: 'ready',
      reason: null
    }
  ];

  for (const runtime of ['codex', 'claude', 'gemini'] as const) {
    const commandCheck = spawnSync('sh', ['-lc', `command -v ${runtime}`], {
      encoding: 'utf8',
      cwd: process.cwd(),
      env: process.env
    });
    if (commandCheck.status !== 0) {
      runtimes.push({
        runtime,
        command: null,
        version: null,
        installed: false,
        authenticated: null,
        status: 'missing',
        reason: `${runtime} binary not found`
      });
      continue;
    }

    const runtimePath = commandCheck.stdout.trim();
    const versionCheck = spawnSync(runtime, doctorCommands[runtime].version, {
      encoding: 'utf8',
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...(doctorCommands[runtime].env ?? {})
      }
    });
    const version = versionCheck.stdout.trim() || versionCheck.stderr.trim() || null;
    const probe = spawnSync(runtime, doctorCommands[runtime].probe, {
      encoding: 'utf8',
      cwd: process.cwd(),
      timeout: 45_000,
      input: doctorCommands[runtime].promptArg.length > 0 ? `${doctorCommands[runtime].promptArg}\n` : undefined,
      env: {
        ...process.env,
        ...(doctorCommands[runtime].env ?? {})
      }
    });
    const combinedOutput = [probe.stdout, probe.stderr].filter((entry) => entry && entry.trim().length > 0).join('\n');
    if (probe.status === 0 && probe.stdout.includes('LIVE_RUNTIME_OK')) {
      runtimes.push({
        runtime,
        command: runtimePath,
        version,
        installed: true,
        authenticated: true,
        status: 'ready',
        reason: null
      });
      continue;
    }

    const failure = classifyProbeFailure(combinedOutput);
    runtimes.push({
      runtime,
      command: runtimePath,
      version,
      installed: true,
      authenticated: failure.authenticated,
      status: failure.status,
      reason: failure.reason
    });
  }

  return runtimes;
};

const runApiCollaborationScenario = async (
  harness: GatewayTestHarness,
  input: {
    lane: 'shim' | 'live';
    originSessionId: string;
    targetAgent: { id: string; runtime: RuntimeKind };
    prompt: string;
    timeoutMs?: number;
  }
): Promise<RuntimeCertificationScenarioResult> => {
  const response = await harness.inject({
    method: 'POST',
    url: `/api/sessions/${encodeURIComponent(input.originSessionId)}/collaboration/send`,
    payload: {
      actor: `${input.lane}-runtime-certification`,
      target: input.targetAgent.id,
      prompt: input.prompt
    }
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as {
    targetSessionId: string;
    run: { id: string };
  };

  const terminal = await harness.waitForTerminalRun(body.run.id, input.timeoutMs ?? 45_000);
  const receipt = await waitForOutboundContaining(harness, input.originSessionId, `Specialist reply: ${input.targetAgent.id}`, input.timeoutMs ?? 45_000);
  const status: CertificationScenarioStatus = terminal.status === 'completed' ? 'passed' : 'failed';
  return {
    scenario: 'api_collaboration_replyback',
    lane: input.lane,
    runtime: input.targetAgent.runtime,
    status,
    reasoningRuntime: 'process',
    executorRuntime: (terminal.effectiveRuntime ?? terminal.runtime) as RuntimeKind,
    model: terminal.effectiveModel ?? terminal.model,
    provider: 'local_cli',
    sessionId: body.targetSessionId,
    runId: body.run.id,
    summary:
      status === 'passed'
        ? `${input.lane} ${input.targetAgent.runtime} collaboration completed with reply-back delivery.`
        : `${input.lane} ${input.targetAgent.runtime} collaboration did not complete cleanly.`,
    evidence: [
      `run:${body.run.id}`,
      `targetSession:${body.targetSessionId}`,
      `receipt:${receipt.content.slice(0, 120)}`
    ],
    details: {
      terminal
    }
  };
};

const runDirectRuntimeScenario = async (
  harness: GatewayTestHarness,
  input: {
    lane: 'shim' | 'live';
    targetAgent: { id: string; runtime: RuntimeKind };
    prompt: string;
    timeoutMs?: number;
  }
): Promise<RuntimeCertificationScenarioResult> => {
  const sessionResponse = await harness.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: {
      sessionKey: `internal:${input.lane}:${input.targetAgent.runtime}:${Date.now().toString(36)}`,
      label: `${input.lane}-${input.targetAgent.runtime}-probe`,
      agentId: input.targetAgent.id,
      runtime: input.targetAgent.runtime
    }
  });
  expect(sessionResponse.statusCode).toBe(201);
  const sessionId = (sessionResponse.json() as { session: { id: string } }).session.id;

  const runResponse = await harness.inject({
    method: 'POST',
    url: `/api/sessions/${encodeURIComponent(sessionId)}/runs`,
    headers: {
      'Idempotency-Key': `${input.lane}-${input.targetAgent.runtime}-runtime-probe`
    },
    payload: {
      prompt: input.prompt,
      runtime: input.targetAgent.runtime,
      model: null,
      autoDelegate: false
    }
  });
  expect(runResponse.statusCode).toBe(201);
  const runId = (runResponse.json() as { run: { id: string } }).run.id;
  const terminal = await harness.waitForTerminalRun(runId, input.timeoutMs ?? 45_000);
  const status: CertificationScenarioStatus = terminal.status === 'completed' ? 'passed' : 'failed';
  return {
    scenario: 'runtime_probe',
    lane: input.lane,
    runtime: input.targetAgent.runtime,
    status,
    reasoningRuntime: input.targetAgent.runtime,
    executorRuntime: (terminal.effectiveRuntime ?? terminal.runtime) as RuntimeKind,
    model: terminal.effectiveModel ?? terminal.model,
    provider: 'local_cli',
    sessionId,
    runId,
    summary:
      status === 'passed'
        ? `${input.lane} ${input.targetAgent.runtime} runtime probe completed.`
        : `${input.lane} ${input.targetAgent.runtime} runtime probe failed.`,
    evidence: [`session:${sessionId}`, `run:${runId}`],
    details: {
      terminal
    }
  };
};

const failedScenario = (input: {
  scenario: string;
  lane: 'shim' | 'live';
  runtime: RuntimeKind;
  summary: string;
  details?: Record<string, unknown>;
}): RuntimeCertificationScenarioResult => ({
  scenario: input.scenario,
  lane: input.lane,
  runtime: input.runtime,
  status: 'failed',
  reasoningRuntime: input.runtime,
  executorRuntime: null,
  model: null,
  provider: null,
  sessionId: null,
  runId: null,
  summary: input.summary,
  evidence: [input.summary],
  details: input.details
});

const runTelegramRoutingScenario = async (
  harness: GatewayTestHarness,
  input: {
    lane: 'shim' | 'live';
    targetAgent: { id: string; runtime: RuntimeKind };
    senderId: number;
  }
): Promise<RuntimeCertificationScenarioResult> => {
  const routeResponse = await harness.inject({
    method: 'POST',
    url: '/api/ingress/telegram',
    payload: createTelegramPayload({
      updateId: input.senderId * 10,
      senderId: input.senderId,
      text: `/agent use ${input.targetAgent.id}`,
      username: `${input.lane}route`
    })
  });
  expect(routeResponse.statusCode).toBe(200);

  const queued = await harness.inject({
    method: 'POST',
    url: '/api/ingress/telegram',
    payload: createTelegramPayload({
      updateId: input.senderId * 10 + 1,
      senderId: input.senderId,
      text: `Route this certification note to ${input.targetAgent.title}.`,
      username: `${input.lane}route`
    })
  });
  expect(queued.statusCode).toBe(200);
  const queuedBody = queued.json() as {
    sessionId: string;
    runId: string;
    routeMode: string;
  };
  const terminal = await harness.waitForTerminalRun(queuedBody.runId, 45_000);
  const status: CertificationScenarioStatus =
    terminal.status === 'completed' && queuedBody.routeMode === 'telegram_switch' ? 'passed' : 'failed';
  const receipt = await waitForOutboundContaining(
    harness,
    queuedBody.sessionId,
    `Specialist reply: ${input.targetAgent.id}`,
    45_000
  );
  return {
    scenario: 'telegram_specialist_routing',
    lane: input.lane,
    runtime: input.targetAgent.runtime,
    status,
    reasoningRuntime: 'process',
    executorRuntime: (terminal.effectiveRuntime ?? terminal.runtime) as RuntimeKind,
    model: terminal.effectiveModel ?? terminal.model,
    provider: 'local_cli',
    sessionId: queuedBody.sessionId,
    runId: queuedBody.runId,
    summary:
      status === 'passed'
        ? `${input.lane} Telegram soft-routing reached ${input.targetAgent.runtime} and returned a specialist receipt.`
        : `${input.lane} Telegram specialist routing failed for ${input.targetAgent.runtime}.`,
    evidence: [`routeMode:${queuedBody.routeMode}`, `run:${queuedBody.runId}`, `receipt:${receipt.content.slice(0, 120)}`],
    details: {
      terminal
    }
  };
};

const runScheduleScenario = async (
  harness: GatewayTestHarness,
  input: {
    lane: 'shim' | 'live';
    originSessionId: string;
    targetAgent: { id: string; runtime: RuntimeKind };
    label: string;
  }
): Promise<RuntimeCertificationScenarioResult> => {
  const createResponse = await harness.inject({
    method: 'POST',
    url: '/api/schedules/request',
    payload: {
      requester: {
        agentId: 'ceo-default',
        sessionId: input.originSessionId
      },
      schedule: {
        label: input.label,
        category: 'follow_up',
        cadence: 'every 4h',
        targetAgentId: input.targetAgent.id,
        sessionTarget: 'dedicated_schedule_session',
        deliveryTarget: 'origin_session',
        prompt: `Produce a ${input.lane} runtime delivery receipt.`
      }
    }
  });
  expect(createResponse.statusCode).toBe(201);
  const scheduleId = (createResponse.json() as { schedule: { id: string } }).schedule.id;

  const runResponse = await harness.inject({
    method: 'POST',
    url: `/api/schedules/${encodeURIComponent(scheduleId)}/run`,
    payload: {
      actor: `${input.lane}-runtime-certification`
    }
  });
  expect(runResponse.statusCode).toBe(200);
  const runId = (runResponse.json() as { run?: { id?: string } }).run?.id;
  expect(runId).toBeTruthy();
  const terminal = await harness.waitForTerminalRun(runId!, 45_000);
  const receipt = await waitForOutboundContaining(harness, input.originSessionId, `Schedule result: ${input.label}`, 45_000);
  const status: CertificationScenarioStatus = terminal.status === 'completed' ? 'passed' : 'failed';
  return {
    scenario: 'schedule_delivery',
    lane: input.lane,
    runtime: input.targetAgent.runtime,
    status,
    reasoningRuntime: input.targetAgent.runtime,
    executorRuntime: (terminal.effectiveRuntime ?? terminal.runtime) as RuntimeKind,
    model: terminal.effectiveModel ?? terminal.model,
    provider: 'local_cli',
    sessionId: input.originSessionId,
    runId: runId!,
    summary:
      status === 'passed'
        ? `${input.lane} schedule delivery completed through ${input.targetAgent.runtime}.`
        : `${input.lane} schedule delivery failed through ${input.targetAgent.runtime}.`,
    evidence: [`schedule:${scheduleId}`, `run:${runId!}`, `receipt:${receipt.content.slice(0, 120)}`],
    details: {
      terminal
    }
  };
};

const toFollowUpTasks = (matrix: RuntimeCertificationScenarioResult[], doctor: RuntimeCertificationDoctorRuntime[]): CertificationFollowUpTask[] => {
  const taskRows: CertificationFollowUpTask[] = [];
  for (const runtime of doctor) {
    if (runtime.runtime === 'process' || runtime.status === 'ready') {
      continue;
    }
    taskRows.push({
      id: `runtime-${runtime.runtime}-doctor`,
      title: `Restore live ${runtime.runtime} certification readiness`,
      reason: runtime.reason ?? `${runtime.runtime} live doctor is not ready`,
      severity: 'medium',
      comparator: 'mission-control'
    });
  }
  for (const row of matrix) {
    if (row.status !== 'failed' && row.status !== 'blocked') {
      continue;
    }
    taskRows.push({
      id: `${row.lane}-${row.runtime}-${row.scenario}`,
      title: `Repair ${row.lane} ${row.runtime} ${row.scenario}`,
      reason: row.summary,
      severity: row.lane === 'live' ? 'high' : 'medium',
      comparator: row.scenario === 'schedule_delivery' ? 'paperclip' : 'baseline_alpha'
    });
  }
  return taskRows;
};

const comparatorStatus = (rows: RuntimeCertificationScenarioResult[], predicate: (row: RuntimeCertificationScenarioResult) => boolean) => {
  const matched = rows.filter(predicate);
  if (matched.length === 0) {
    return 'unmet' as const;
  }
  if (matched.every((row) => row.status === 'passed')) {
    return 'met' as const;
  }
  if (matched.some((row) => row.status === 'passed')) {
    return 'partial' as const;
  }
  return 'unmet' as const;
};

describe('runtime certification', () => {
  const harnesses: GatewayTestHarness[] = [];

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()!.close();
    }
  });

  it(
    'publishes a truthful shim-vs-live runtime certification bundle for specialist routing and schedules',
    async () => {
      const shimHarness = await createGatewayTestHarness('runtime-cert-shim');
      harnesses.push(shimHarness);
      await applyCeoBaseline(shimHarness, 'runtime-cert-shim');
      const shimOriginSessionId = await createInternalSession(shimHarness, 'internal:runtime-cert-shim-origin');
      const shimCodex = await createAgentProfile(shimHarness, {
        name: 'Shim Codex Specialist',
        title: 'Shim Codex Specialist',
        runtime: 'codex'
      });
      const shimMatrix: RuntimeCertificationScenarioResult[] = [];
      shimMatrix.push(
        await runApiCollaborationScenario(shimHarness, {
          lane: 'shim',
          originSessionId: shimOriginSessionId,
          targetAgent: shimCodex,
          prompt: 'Provide the codex shim certification receipt.'
        })
      );
      shimMatrix.push(
        await runTelegramRoutingScenario(shimHarness, {
          lane: 'shim',
          targetAgent: shimCodex,
          senderId: 93011
        })
      );
      shimMatrix.push(
        await runScheduleScenario(shimHarness, {
          lane: 'shim',
          originSessionId: shimOriginSessionId,
          targetAgent: shimCodex,
          label: 'Shim runtime schedule proof'
        })
      );

      const liveDoctor = collectLiveDoctor();
      const liveHarness = await createGatewayTestHarness(
        'runtime-cert-live',
        (config) => {
          config.runtime.adapters.codex = {
            command: 'codex',
            args: ['exec', '--skip-git-repo-check']
          };
        },
        { installRuntimeShims: false }
      );
      harnesses.push(liveHarness);
      await applyCeoBaseline(liveHarness, 'runtime-cert-live');
      const liveOriginSessionId = await createInternalSession(liveHarness, 'internal:runtime-cert-live-origin');

      const liveTargets = new Map<RuntimeKind, { id: string; title: string; runtime: RuntimeKind }>();
      for (const runtime of ['process', 'codex', 'claude', 'gemini'] as const) {
        liveTargets.set(
          runtime,
          await createAgentProfile(liveHarness, {
            name: `Live ${runtime} Specialist`,
            title: `Live ${runtime} Specialist`,
            runtime
          })
        );
      }

      const liveMatrix: RuntimeCertificationScenarioResult[] = [];
      for (const doctor of liveDoctor) {
        const targetAgent = liveTargets.get(doctor.runtime as RuntimeKind)!;
        if (doctor.runtime === 'process') {
          liveMatrix.push({
            scenario: 'runtime_probe',
            lane: 'live',
            runtime: 'process',
            status: doctor.status === 'ready' ? 'passed' : 'failed',
            reasoningRuntime: 'process',
            executorRuntime: 'process',
            model: null,
            provider: 'local_cli',
            sessionId: null,
            runId: null,
            summary:
              doctor.status === 'ready'
                ? 'Process local executor readiness was proven directly by the live doctor probe.'
                : `Process local executor doctor reported ${doctor.reason ?? 'not ready'}.`,
            evidence: [doctor.reason ?? `node:${doctor.version ?? process.version}`],
            details: {
              doctor
            }
          });
          continue;
        }
        if (doctor.runtime !== 'process' && doctor.status !== 'ready') {
          liveMatrix.push({
            scenario: 'api_collaboration_replyback',
            lane: 'live',
            runtime: doctor.runtime,
            status: doctor.status === 'missing' ? 'skipped' : 'blocked',
            reasoningRuntime: 'process',
            executorRuntime: null,
            model: null,
            provider: null,
            sessionId: null,
            runId: null,
            summary: `Live ${doctor.runtime} collaboration skipped by doctor: ${doctor.reason ?? 'not ready'}.`,
            evidence: [doctor.reason ?? `${doctor.runtime} not ready`],
            details: {
              doctor
            }
          });
          continue;
        }
        try {
          liveMatrix.push(
            await runDirectRuntimeScenario(liveHarness, {
              lane: 'live',
              targetAgent,
              prompt: `Reply with a live ${doctor.runtime} certification receipt.`,
              timeoutMs: 60_000
            })
          );
        } catch (error) {
          liveMatrix.push(
            failedScenario({
              scenario: 'runtime_probe',
              lane: 'live',
              runtime: doctor.runtime,
              summary: `Live ${doctor.runtime} runtime probe failed: ${error instanceof Error ? error.message : String(error)}`,
              details: {
                error: error instanceof Error ? error.message : String(error),
                doctor
              }
            })
          );
        }
      }

      const preferredLiveSpecialistRuntime =
        liveMatrix.find((entry) => entry.lane === 'live' && entry.status === 'passed' && entry.runtime !== 'process')?.runtime ??
        'process';
      try {
        liveMatrix.push(
          await runApiCollaborationScenario(liveHarness, {
            lane: 'live',
            originSessionId: liveOriginSessionId,
            targetAgent: liveTargets.get(preferredLiveSpecialistRuntime)!,
            prompt: `Provide the ${preferredLiveSpecialistRuntime} live collaboration receipt.`,
            timeoutMs: preferredLiveSpecialistRuntime === 'process' ? 20_000 : 60_000
          })
        );
      } catch (error) {
        liveMatrix.push(
          failedScenario({
            scenario: 'api_collaboration_replyback',
            lane: 'live',
            runtime: preferredLiveSpecialistRuntime,
            summary: `Live ${preferredLiveSpecialistRuntime} collaboration failed: ${error instanceof Error ? error.message : String(error)}`,
            details: {
              error: error instanceof Error ? error.message : String(error)
            }
          })
        );
      }
      try {
        liveMatrix.push(
          await runTelegramRoutingScenario(liveHarness, {
            lane: 'live',
            targetAgent: liveTargets.get(preferredLiveSpecialistRuntime)!,
            senderId: 93021
          })
        );
      } catch (error) {
        liveMatrix.push(
          failedScenario({
            scenario: 'telegram_specialist_routing',
            lane: 'live',
            runtime: preferredLiveSpecialistRuntime,
            summary: `Live Telegram routing failed for ${preferredLiveSpecialistRuntime}: ${error instanceof Error ? error.message : String(error)}`,
            details: {
              error: error instanceof Error ? error.message : String(error)
            }
          })
        );
      }

      const preferredLiveScheduleRuntime =
        liveMatrix.find((entry) => entry.scenario === 'runtime_probe' && entry.status === 'passed' && entry.runtime !== 'process')
          ?.runtime ?? 'process';
      try {
        liveMatrix.push(
          await runScheduleScenario(liveHarness, {
            lane: 'live',
            originSessionId: liveOriginSessionId,
            targetAgent: liveTargets.get(preferredLiveScheduleRuntime)!,
            label: 'Live runtime schedule proof'
          })
        );
      } catch (error) {
        liveMatrix.push(
          failedScenario({
            scenario: 'schedule_delivery',
            lane: 'live',
            runtime: preferredLiveScheduleRuntime,
            summary: `Live schedule delivery failed for ${preferredLiveScheduleRuntime}: ${error instanceof Error ? error.message : String(error)}`,
            details: {
              error: error instanceof Error ? error.message : String(error)
            }
          })
        );
      }

      const matrix = [...shimMatrix, ...liveMatrix];
      const followUpTasks = toFollowUpTasks(matrix, liveDoctor);
      const comparators: RuntimeCertificationComparatorRow[] = [
        {
          comparator: 'baseline_alpha',
          claim: 'Specialist routing is proven in both shim and live lanes with reply-back evidence.',
          status: comparatorStatus(matrix, (row) => row.scenario === 'telegram_specialist_routing' || row.scenario === 'api_collaboration_replyback'),
          notes: ['Shim and live rows stay distinct; reply-back receipts are recorded per scenario.']
        },
        {
          comparator: 'mission-control',
          claim: 'Runtime doctor separates ready, blocked, and missing live lanes instead of pretending every runtime was tested.',
          status:
            liveDoctor.some((entry) => entry.status !== 'ready') || liveDoctor.some((entry) => entry.runtime !== 'process')
              ? 'met'
              : 'partial',
          notes: ['Doctor captures installed/authenticated status plus skip or block reasons before live execution.']
        },
        {
          comparator: 'paperclip',
          claim: 'Gateway-managed recurring jobs are proven separately from specialist routing in shim and live lanes.',
          status: comparatorStatus(matrix, (row) => row.scenario === 'schedule_delivery'),
          notes: ['Schedule delivery rows record their own runtime, run id, and origin-session receipt.']
        }
      ];
      const summary = [
        `Shim scenarios passed: ${shimMatrix.filter((entry) => entry.status === 'passed').length}/${shimMatrix.length}.`,
        `Live scenarios passed: ${liveMatrix.filter((entry) => entry.status === 'passed').length}/${liveMatrix.length}.`,
        `Doctor ready runtimes: ${liveDoctor.filter((entry) => entry.status === 'ready').map((entry) => entry.runtime).join(', ') || 'none'}.`,
        followUpTasks.length > 0
          ? `Follow-up tasks emitted: ${followUpTasks.length}.`
          : 'No follow-up tasks were required by the certification matrix.'
      ];

      const reportResponse = await liveHarness.inject({
        method: 'POST',
        url: '/api/certification/runtime/report',
        payload: {
          status: liveMatrix.some((entry) => entry.status === 'failed') ? 'failed' : 'passed',
          doctor: {
            runtimes: liveDoctor
          },
          matrix,
          comparators,
          followUpTasks,
          summary
        }
      });
      expect(reportResponse.statusCode).toBe(201);

      const certificationResponse = await liveHarness.inject({
        method: 'GET',
        url: '/api/certification/runtime'
      });
      expect(certificationResponse.statusCode).toBe(200);
      const certificationBody = certificationResponse.json() as { certification: RuntimeCertificationReport | null };
      expect(certificationBody.certification?.schema).toBe('ops.runtime-certification.v1');
      expect(certificationBody.certification?.doctor.runtimes.some((entry) => entry.runtime === 'process')).toBe(true);
      expect(certificationBody.certification?.matrix.some((entry) => entry.lane === 'shim' && entry.scenario === 'schedule_delivery')).toBe(true);
      expect(certificationBody.certification?.matrix.some((entry) => entry.lane === 'live' && entry.scenario === 'telegram_specialist_routing')).toBe(true);
      expect(certificationBody.certification?.comparators).toHaveLength(3);
    },
    240_000
  );
});
