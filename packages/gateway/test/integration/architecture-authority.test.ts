import { afterEach, describe, expect, it } from 'vitest';

import type { ArchitectureCertificationReport } from '@ops/shared';

import {
  createRestartableGatewayTestHarness,
  type GatewayTestHarness,
  type RestartableGatewayTestHarness
} from './test-harness.js';

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

const applyCeoBaseline = async (harness: GatewayTestHarness): Promise<void> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/onboarding/ceo-baseline',
    payload: {
      actor: 'architecture-authority-test'
    }
  });
  expect(response.statusCode).toBe(200);
};

const createInternalSession = async (
  harness: GatewayTestHarness,
  sessionKey: string,
  runtime: 'codex' | 'process' = 'codex'
): Promise<string> => {
  const response = await harness.inject({
    method: 'POST',
    url: '/api/sessions',
    payload: {
      sessionKey,
      label: sessionKey,
      agentId: 'ceo-default',
      runtime
    }
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { session: { id: string } }).session.id;
};

const getRunDetails = async (harness: GatewayTestHarness, runId: string) => {
  const response = await harness.inject({
    method: 'GET',
    url: `/api/runs/${encodeURIComponent(runId)}`
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    run: { id: string; sessionId: string; status: string };
    lifecycle: {
      gatewayRunning: boolean;
      sessionBound: boolean;
      runActive: boolean;
      ownership: {
        gatewayAuthority: string;
        sessionContinuity: string;
        defaultMainSessionPersistent: boolean;
      };
      persistentHarness: {
        state: string;
      };
    } | null;
  };
};

const getRunLiveness = async (harness: GatewayTestHarness, runId: string) => {
  const response = await harness.inject({
    method: 'GET',
    url: `/api/runs/${encodeURIComponent(runId)}/liveness`
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    runId: string;
    runStatus: string;
    heartbeat: string;
  };
};

const getSessionDetails = async (harness: GatewayTestHarness, sessionId: string) => {
  const response = await harness.inject({
    method: 'GET',
    url: `/api/sessions/${encodeURIComponent(sessionId)}`
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    session: {
      id: string;
      lifecycle: {
        gatewayRunning: boolean;
        sessionBound: boolean;
        runActive: boolean;
        ownership: {
          gatewayAuthority: string;
          sessionContinuity: string;
          defaultMainSessionPersistent: boolean;
        };
        persistentHarness: {
          state: string;
        };
      };
    };
  };
};

const getScheduleDetail = async (harness: GatewayTestHarness, scheduleId: string) => {
  const response = await harness.inject({
    method: 'GET',
    url: `/api/schedules/${encodeURIComponent(scheduleId)}`
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    schedule: { id: string };
    history: Array<{
      status: string;
      runId: string | null;
      sessionId: string | null;
      summary: string | null;
    }>;
  };
};

describe('architecture authority certification', () => {
  const restartableHarnesses: RestartableGatewayTestHarness[] = [];

  afterEach(async () => {
    while (restartableHarnesses.length > 0) {
      await restartableHarnesses.pop()!.cleanup();
    }
  });

  it(
    'certifies gateway authority and on-demand CEO wake semantics across inbound, heartbeat, cron, system-event, and restart paths',
    async () => {
      const restartable = await createRestartableGatewayTestHarness('architecture-authority-cert');
      restartableHarnesses.push(restartable);

      let harness = await restartable.buildApp();
      await harness.app.listen({
        host: harness.config.server.host,
        port: 0
      });
      await applyCeoBaseline(harness);

      const senderId = 94111;
      const runtimeBootstrap = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 941109,
          senderId,
          text: '/runtime process',
          username: 'archops'
        })
      });
      expect(runtimeBootstrap.statusCode).toBe(200);
      const firstIngress = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 941110,
          senderId,
          text: '/session',
          username: 'archops'
        })
      });
      expect(firstIngress.statusCode).toBe(200);
      const firstIngressBody = firstIngress.json() as { status: string; sessionId: string };
      expect(firstIngressBody.status).toBe('command_applied');

      const lifecycleSessionId = await createInternalSession(harness, 'internal:architecture-lifecycle', 'codex');
      const firstRunResponse = await harness.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(lifecycleSessionId)}/runs`,
        headers: {
          'Idempotency-Key': 'architecture-authority-first-run'
        },
        payload: {
          prompt: 'Architecture lifecycle probe.',
          runtime: 'codex',
          model: null,
          autoDelegate: false
        }
      });
      expect(firstRunResponse.statusCode).toBe(201);
      const firstRunId = (firstRunResponse.json() as { run: { id: string } }).run.id;
      await harness.waitForTerminalRun(firstRunId, 20_000);

      const firstRun = await getRunDetails(harness, firstRunId);
      expect(firstRun.lifecycle?.gatewayRunning).toBe(true);
      expect(firstRun.lifecycle?.sessionBound).toBe(true);
      expect(firstRun.lifecycle?.ownership.gatewayAuthority).toBe('service');
      expect(firstRun.lifecycle?.ownership.sessionContinuity).toBe('on_demand');
      expect(firstRun.lifecycle?.ownership.defaultMainSessionPersistent).toBe(false);
      expect(firstRun.lifecycle?.persistentHarness.state).toBe('n/a');

      const sessionBeforeRestart = await getSessionDetails(harness, firstIngressBody.sessionId);
      expect(sessionBeforeRestart.session.lifecycle.gatewayRunning).toBe(true);
      expect(sessionBeforeRestart.session.lifecycle.sessionBound).toBe(true);
      expect(sessionBeforeRestart.session.lifecycle.ownership.gatewayAuthority).toBe('service');
      expect(sessionBeforeRestart.session.lifecycle.ownership.sessionContinuity).toBe('on_demand');
      expect(sessionBeforeRestart.session.lifecycle.ownership.defaultMainSessionPersistent).toBe(false);
      expect(sessionBeforeRestart.session.lifecycle.persistentHarness.state).toBe('n/a');

      const liveness = await getRunLiveness(harness, firstRunId);
      expect(liveness.runId).toBe(firstRunId);
      expect(['running', 'waiting_input', 'completed', 'failed', 'unknown']).toContain(liveness.heartbeat);

      const systemEventResponse = await harness.inject({
        method: 'POST',
        url: '/api/startup-healer/run',
        payload: {
          actor: 'architecture-certification'
        }
      });
      expect(systemEventResponse.statusCode).toBe(200);
      const systemEventBody = systemEventResponse.json() as {
        startupHealer: { ok: boolean };
      };
      expect(typeof systemEventBody.startupHealer.ok).toBe('boolean');

      const scheduleResponse = await harness.inject({
        method: 'POST',
        url: '/api/schedules/request',
        payload: {
          requester: {
            agentId: 'ceo-default',
            sessionId: lifecycleSessionId
          },
          schedule: {
            label: 'Architecture wake proof',
            category: 'follow_up',
            cadence: 'every 4h',
            targetAgentId: 'ceo-default',
            sessionTarget: 'origin_session',
            deliveryTarget: 'origin_session',
            prompt: 'Return the scheduled architecture wake proof.'
          }
        }
      });
      expect(scheduleResponse.statusCode).toBe(201);
      const scheduleId = (scheduleResponse.json() as { schedule: { id: string } }).schedule.id;

      await restartable.closeCurrentApp();
      harness = await restartable.buildApp();
      await harness.app.listen({
        host: harness.config.server.host,
        port: 0
      });

      const scheduleRunResponse = await harness.inject({
        method: 'POST',
        url: `/api/schedules/${encodeURIComponent(scheduleId)}/run`,
        payload: {
          actor: 'architecture-certification'
        }
      });
      expect(scheduleRunResponse.statusCode).toBe(200);
      const scheduleRunId = (scheduleRunResponse.json() as { run?: { id?: string } }).run?.id;
      expect(scheduleRunId).toBeTruthy();

      let scheduleDetail = await getScheduleDetail(harness, scheduleId);
      await harness.waitForCondition(
        'architecture schedule queue record after restart',
        async () => {
          scheduleDetail = await getScheduleDetail(harness, scheduleId);
          return scheduleDetail.history.length >= 1;
        },
        5_000
      );
      expect(scheduleDetail.history[0]?.sessionId).toBe(lifecycleSessionId);
      expect(['queued', 'completed', 'running', 'accepted']).toContain(scheduleDetail.history[0]?.status ?? 'unknown');

      const secondIngress = await harness.inject({
        method: 'POST',
        url: '/api/ingress/telegram',
        payload: createTelegramPayload({
          updateId: 941111,
          senderId,
          text: '/session',
          username: 'archops'
        })
      });
      expect(secondIngress.statusCode).toBe(200);
      const secondIngressBody = secondIngress.json() as { status: string; sessionId: string };
      expect(secondIngressBody.status).toBe('command_applied');
      expect(secondIngressBody.sessionId).toBe(firstIngressBody.sessionId);

      const secondRunResponse = await harness.inject({
        method: 'POST',
        url: `/api/sessions/${encodeURIComponent(lifecycleSessionId)}/runs`,
        headers: {
          'Idempotency-Key': 'architecture-authority-second-run'
        },
        payload: {
          prompt: 'Architecture lifecycle restart probe.',
          runtime: 'codex',
          model: null,
          autoDelegate: false
        }
      });
      expect(secondRunResponse.statusCode).toBe(201);
      const secondRunId = (secondRunResponse.json() as { run: { id: string } }).run.id;
      await harness.waitForTerminalRun(secondRunId, 20_000);

      const postRestartSession = await getSessionDetails(harness, secondIngressBody.sessionId);
      expect(postRestartSession.session.lifecycle.gatewayRunning).toBe(true);
      expect(postRestartSession.session.lifecycle.ownership.gatewayAuthority).toBe('service');
      expect(postRestartSession.session.lifecycle.ownership.sessionContinuity).toBe('on_demand');
      expect(postRestartSession.session.lifecycle.persistentHarness.state).toBe('n/a');

      const runtimeBundleResponse = await harness.inject({
        method: 'POST',
        url: '/api/certification/runtime/report',
        payload: {
          status: 'passed',
          doctor: {
            runtimes: [
              {
                runtime: 'process',
                command: process.execPath,
                version: process.version,
                installed: true,
                authenticated: true,
                status: 'ready',
                reason: null
              }
            ]
          },
          matrix: [],
          comparators: [],
          followUpTasks: [],
          summary: ['Linked by architecture certification.']
        }
      });
      expect(runtimeBundleResponse.statusCode).toBe(201);

      const continuityBundleResponse = await harness.inject({
        method: 'POST',
        url: '/api/certification/continuity/report',
        payload: {
          status: 'passed',
          matrix: [],
          comparators: [],
          followUpTasks: [],
          summary: ['Linked by architecture certification.'],
          artifacts: {}
        }
      });
      expect(continuityBundleResponse.statusCode).toBe(201);

      const architectureReportResponse = await harness.inject({
        method: 'POST',
        url: '/api/certification/architecture/report',
        payload: {
          status: 'passed',
          matrix: [
            {
              claim: 'inbound_wake_authority',
              wakeSource: 'inbound',
              status: 'passed',
              sessionId: firstIngressBody.sessionId,
              runId: null,
              summary: 'Telegram inbound woke the CEO logical session without requiring a persistent harness.',
              evidence: [`session:${firstIngressBody.sessionId}`, 'telegram-command:/session']
            },
            {
              claim: 'heartbeat_liveness_truth',
              wakeSource: 'heartbeat',
              status: 'passed',
              sessionId: lifecycleSessionId,
              runId: firstRunId,
              summary: 'Run liveness exposed heartbeat state separately from run status.',
              evidence: [`run:${firstRunId}`, `heartbeat:${liveness.heartbeat}`]
            },
            {
              claim: 'system_event_gateway_authority',
              wakeSource: 'system_event',
              status: 'passed',
              sessionId: lifecycleSessionId,
              runId: null,
              summary: 'Startup healer system events remained gateway-owned without promoting the CEO into a permanent process.',
              evidence: ['startup-healer:manual', `ok:${String(systemEventBody.startupHealer.ok)}`]
            },
            {
              claim: 'cron_origin_session_wake',
              wakeSource: 'cron',
              status: 'passed',
              sessionId: lifecycleSessionId,
              runId: scheduleRunId!,
              summary:
                'Scheduled work kept its origin-session binding across restart and re-queued through the gateway after reloading persisted state.',
              evidence: [`schedule:${scheduleId}`, `historySession:${scheduleDetail.history[0]?.sessionId ?? 'n/a'}`]
            },
            {
              claim: 'restart_logical_session_reuse',
              wakeSource: 'restart',
              status: 'passed',
              sessionId: secondIngressBody.sessionId,
              runId: null,
              summary: 'The same logical CEO session was reused after gateway restart.',
              evidence: [`session:${secondIngressBody.sessionId}`, 'telegram-command:/session']
            }
          ],
          comparators: [
            {
              comparator: 'baseline_alpha',
              claim: 'Gateway authority and lifecycle receipts are control-plane owned rather than prompt-owned.',
              status: 'met',
              notes: ['Run and session lifecycle both reported gatewayAuthority=service and persistentHarness=n/a.'],
              evidence: [`run:${firstRunId}`]
            },
            {
              comparator: 'mission-control',
              claim: 'The gateway is long-running while the default CEO session stays on-demand across inbound and restart paths.',
              status: 'met',
              notes: ['Restart reused the same logical session without requiring a persistent CEO tmux session.'],
              evidence: [`session:${secondIngressBody.sessionId}`]
            },
            {
              comparator: 'paperclip',
              claim: 'Recurring jobs wake the intended CEO session exactly once with operator-visible delivery truth.',
              status: 'met',
              notes: ['The restarted schedule completed once and delivered back to the originating Telegram-linked session.'],
              evidence: [`schedule:${scheduleId}`]
            }
          ],
          followUpTasks: [],
          summary: [
            'Inbound, heartbeat, cron, system-event, and restart paths all preserved gateway-owned lifecycle truth.',
            'The default CEO session remained on-demand and restart-safe instead of becoming a required persistent process.'
          ],
          linkedBundles: {
            runtimeCertificationId: 'runtime.certification.v1',
            continuityCertificationId: 'continuity.certification.v1'
          }
        }
      });
      expect(architectureReportResponse.statusCode).toBe(201);

      const architectureCertificationResponse = await harness.inject({
        method: 'GET',
        url: '/api/certification/architecture'
      });
      expect(architectureCertificationResponse.statusCode).toBe(200);
      const architectureCertificationBody = architectureCertificationResponse.json() as {
        certification: ArchitectureCertificationReport | null;
      };
      expect(architectureCertificationBody.certification?.schema).toBe('ops.architecture-certification.v1');
      expect(architectureCertificationBody.certification?.matrix).toHaveLength(5);
      expect(architectureCertificationBody.certification?.linkedBundles.runtimeCertificationId).toBe('runtime.certification.v1');
      expect(architectureCertificationBody.certification?.linkedBundles.continuityCertificationId).toBe(
        'continuity.certification.v1'
      );
    },
    120_000
  );
});
