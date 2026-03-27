import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';

import { buildGatewayApp } from '../../src/server.js';
import { installPortableRuntimeBinaryShims } from './runtime-binary-shims.js';
import { createBaseConfig, createGatewayTestHarness, ensureRuntimeBinaryToolsInstalled, type GatewayTestHarness } from './test-harness.js';

describe('gateway queue/watchdog integration', () => {
  const harnesses: GatewayTestHarness[] = [];

  const createHarness = async (
    label: string,
    customize?: Parameters<typeof createGatewayTestHarness>[1]
  ): Promise<GatewayTestHarness> => {
    const harness = await createGatewayTestHarness(label, customize);
    harnesses.push(harness);
    return harness;
  };

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()!.close();
    }
  });

  it('replays persisted watchdog recovery jobs after restart without duplicate dispatch', async () => {
    const restoreRuntimeBinaryShims = installPortableRuntimeBinaryShims('ops-gateway-watchdog-restart');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-gateway-watchdog-restart-'));
    const config = createBaseConfig(root, 'watchdog-restart');
    config.runtime.adapters.process = {
      command: 'node',
      args: [
        '-e',
        [
          'process.stdin.resume();',
          'const timer = setTimeout(() => { process.stdout.write("long-running-finished\\n"); process.exit(0); }, 30000);',
          "process.on('SIGTERM', () => { clearTimeout(timer); process.stdout.write('aborted\\n'); process.exit(143); });",
          "process.on('SIGINT', () => { clearTimeout(timer); process.stdout.write('aborted\\n'); process.exit(130); });"
        ].join(' ')
      ]
    };
    fs.mkdirSync(config.runtime.workspaceRoot, { recursive: true });

    let app = await buildGatewayApp(config);
    ensureRuntimeBinaryToolsInstalled(config.persistence.sqlitePath);

    const inject = (options: Parameters<typeof app.inject>[0]) =>
      app.inject(
        typeof options === 'string'
          ? options
          : {
              ...options,
              headers: {
                Authorization: `Bearer ${config.server.apiToken}`,
                'x-ops-role': 'operator',
                ...(options.headers ?? {})
              }
            }
      );

    const db = new ControlPlaneDatabase(config.persistence.sqlitePath);

    try {
      const limitsResponse = await inject({
        method: 'PUT',
        url: '/api/llm/limits',
        payload: {
          limits: {
            localHarnessByRuntime: {
              process: true
            },
            orchestratorLocalHarnessByRuntime: {
              process: true
            }
          }
        }
      });
      expect(limitsResponse.statusCode).toBe(200);

      const session = db.upsertSessionByKey({
        sessionKey: 'watchdog-restart-replay',
        channel: 'internal',
        chatType: 'internal',
        agentId: 'ceo-default',
        preferredRuntime: 'process'
      });

      const runResponse = await inject({
        method: 'POST',
        url: `/api/sessions/${session.id}/runs`,
        headers: {
          'Idempotency-Key': 'watchdog-restart-replay'
        },
        payload: {
          prompt: 'Keep this run alive so watchdog recovery can replay after restart.',
          runtime: 'process'
        }
      });
      expect(runResponse.statusCode).toBe(201);
      const runBody = runResponse.json() as { run: { id: string } };

      const waitForRunning = async (): Promise<void> => {
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          const current = await inject({
            method: 'GET',
            url: `/api/runs/${runBody.run.id}`
          });
          expect(current.statusCode).toBe(200);
          const currentBody = current.json() as {
            run: {
              status: string;
            };
          };
          if (currentBody.run.status === 'running') {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('Run did not reach running state');
      };

      await waitForRunning();

      const simulateResponse = await inject({
        method: 'POST',
        url: '/api/watchdog/simulate',
        payload: {
          runId: runBody.run.id,
          runtime: 'process',
          status: 'quota_exceeded',
          recommendation: 'abort_and_retry',
          detectedPattern: '429',
          matchedSignature: 'rate_limit',
          lastOutputAgeMs: 250,
          metadata: {
            sessionId: session.id
          }
        }
      });
      expect(simulateResponse.statusCode).toBe(200);

      const recoveryDeadline = Date.now() + 10_000;
      while (Date.now() < recoveryDeadline) {
        const jobs = db.listWatchdogRecoveryJobs({ rootRunId: runBody.run.id });
        if (jobs.length > 0 && jobs[0]?.status === 'scheduled') {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const scheduledJobs = db.listWatchdogRecoveryJobs({ rootRunId: runBody.run.id });
      expect(scheduledJobs).toHaveLength(1);
      expect(scheduledJobs[0]?.status).toBe('scheduled');

      await app.close();
      await new Promise((resolve) => setTimeout(resolve, 11_000));

      app = await buildGatewayApp(config);
      ensureRuntimeBinaryToolsInstalled(config.persistence.sqlitePath);

      const restartedInject = (options: Parameters<typeof app.inject>[0]) =>
        app.inject(
          typeof options === 'string'
            ? options
            : {
                ...options,
                headers: {
                  Authorization: `Bearer ${config.server.apiToken}`,
                  'x-ops-role': 'operator',
                  ...(options.headers ?? {})
                }
              }
        );

      const dispatchDeadline = Date.now() + 15_000;
      while (Date.now() < dispatchDeadline) {
        const jobs = db.listWatchdogRecoveryJobs({ rootRunId: runBody.run.id });
        if (jobs[0]?.status === 'dispatched') {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      const jobsAfterRestart = db.listWatchdogRecoveryJobs({ rootRunId: runBody.run.id });
      expect(jobsAfterRestart).toHaveLength(1);
      expect(jobsAfterRestart[0]?.status).toBe('dispatched');
      expect(jobsAfterRestart[0]?.replacementRunId).toBeTruthy();
      expect(db.findLatestRunSuperseding(runBody.run.id)?.id).toBe(jobsAfterRestart[0]?.replacementRunId);

      const replacementRunResponse = await restartedInject({
        method: 'GET',
        url: `/api/runs/${jobsAfterRestart[0]!.replacementRunId}`
      });
      expect(replacementRunResponse.statusCode).toBe(200);
      const replacementRunBody = replacementRunResponse.json() as {
        run: {
          status: string;
        };
      };
      expect(['queued', 'accepted', 'running', 'completed', 'failed', 'aborted']).toContain(replacementRunBody.run.status);
    } finally {
      db.close();
      await app.close();
      restoreRuntimeBinaryShims();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 35_000);

  it('uses warning and degraded readiness tiers for dead-letter thresholds and supports dry-run/apply purge', async () => {
    const harness = await createHarness('readiness-dead-letter');
    const db = harness.createDb();
    const session = db.upsertSessionByKey({
      sessionKey: 'dead-letter-thresholds',
      channel: 'internal',
      chatType: 'internal',
      agentId: 'software-engineer',
      preferredRuntime: 'process'
    });
    const run = db.createRun({
      sessionId: session.id,
      runtime: 'process',
      requestedRuntime: 'process',
      effectiveRuntime: 'process',
      prompt: 'seed dead letter queue',
      status: 'failed'
    });

    const seedDeadLetter = (count: number): void => {
      for (let index = 0; index < count; index += 1) {
        const item = db.enqueueQueueItem({
          lane: harness.config.queue.defaultLane,
          sessionId: session.id,
          runId: run.id,
          payload: {
            seed: index
          },
          priority: 50,
          maxAttempts: harness.config.queue.retry.maxAttempts
        });
        db.markQueueDeadLetter(item.id, `seed-${index}`);
      }
    };

    seedDeadLetter(3);

    const warningReadiness = await harness.inject({
      method: 'GET',
      url: '/api/health/readiness'
    });
    expect(warningReadiness.statusCode).toBe(200);
    const warningBody = warningReadiness.json() as {
      readiness: {
        tier: string;
        checks: Array<{
          name: string;
          tier: string;
        }>;
      };
    };
    expect(warningBody.readiness.tier).toBe('warning');
    expect(warningBody.readiness.checks.find((check) => check.name === 'queue_dead_letter_budget')?.tier).toBe('warning');

    seedDeadLetter(5);

    const degradedReadiness = await harness.inject({
      method: 'GET',
      url: '/api/health/readiness'
    });
    expect(degradedReadiness.statusCode).toBe(200);
    const degradedBody = degradedReadiness.json() as {
      readiness: {
        tier: string;
        checks: Array<{
          name: string;
          tier: string;
        }>;
      };
    };
    expect(degradedBody.readiness.tier).toBe('degraded');
    expect(degradedBody.readiness.checks.find((check) => check.name === 'queue_dead_letter_budget')?.tier).toBe('degraded');

    const preview = await harness.inject({
      method: 'POST',
      url: '/api/housekeeping/dead-letter/purge',
      payload: {
        actor: 'test',
        dryRun: true
      }
    });
    expect(preview.statusCode).toBe(200);
    const previewBody = preview.json() as {
      cleanup: {
        dryRun: boolean;
        count: number;
      };
    };
    expect(previewBody.cleanup.dryRun).toBe(true);
    expect(previewBody.cleanup.count).toBe(8);

    const apply = await harness.inject({
      method: 'POST',
      url: '/api/housekeeping/dead-letter/purge',
      payload: {
        actor: 'test',
        dryRun: false
      }
    });
    expect(apply.statusCode).toBe(200);
    const applyBody = apply.json() as {
      cleanup: {
        dryRun: boolean;
        purged: number;
      };
    };
    expect(applyBody.cleanup.dryRun).toBe(false);
    expect(applyBody.cleanup.purged).toBe(8);

    const readyReadiness = await harness.inject({
      method: 'GET',
      url: '/api/health/readiness'
    });
    expect(readyReadiness.statusCode).toBe(200);
    expect((readyReadiness.json() as { readiness: { tier: string } }).readiness.tier).toBe('ready');
    db.close();
  });

  it('restricts runtime artifact cleanup to allowlisted roots and targeted artifact directories', async () => {
    const harness = await createHarness('artifact-cleanup');
    const insideWorkspace = path.join(harness.config.runtime.workspaceRoot, 'session-a');
    const insideOpsRuntime = path.join(insideWorkspace, '.ops-runtime');
    const insideRouting = path.join(insideWorkspace, '.routing');
    const insideNormalDir = path.join(insideWorkspace, 'src');
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-artifact-outside-'));
    const outsideOpsRuntime = path.join(outsideRoot, '.ops-runtime');

    fs.mkdirSync(insideOpsRuntime, { recursive: true });
    fs.mkdirSync(insideRouting, { recursive: true });
    fs.mkdirSync(insideNormalDir, { recursive: true });
    fs.mkdirSync(outsideOpsRuntime, { recursive: true });
    fs.writeFileSync(path.join(insideOpsRuntime, 'trace.log'), 'inside runtime artifact');
    fs.writeFileSync(path.join(insideRouting, 'route.json'), '{}');
    fs.writeFileSync(path.join(insideNormalDir, 'safe.txt'), 'keep me');
    fs.writeFileSync(path.join(outsideOpsRuntime, 'outside.log'), 'outside runtime artifact');

    try {
      const preview = await harness.inject({
        method: 'POST',
        url: '/api/housekeeping/artifacts/cleanup',
        payload: {
          actor: 'test',
          dryRun: true
        }
      });
      expect(preview.statusCode).toBe(200);
      const previewBody = preview.json() as {
        cleanup: {
          count: number;
          candidates: Array<{
            target: string;
          }>;
        };
      };
      expect(previewBody.cleanup.count).toBe(2);
      expect(previewBody.cleanup.candidates.some((candidate) => candidate.target === insideOpsRuntime)).toBe(true);
      expect(previewBody.cleanup.candidates.some((candidate) => candidate.target === insideRouting)).toBe(true);
      expect(previewBody.cleanup.candidates.some((candidate) => candidate.target === outsideOpsRuntime)).toBe(false);

      const blocked = await harness.inject({
        method: 'POST',
        url: '/api/housekeeping/artifacts/cleanup',
        payload: {
          actor: 'test',
          dryRun: true,
          scopeRoot: outsideRoot
        }
      });
      expect(blocked.statusCode).toBe(400);
      expect((blocked.json() as { error: string }).error).toContain('scopeRoot must stay inside approved runtime/simulation roots');

      const apply = await harness.inject({
        method: 'POST',
        url: '/api/housekeeping/artifacts/cleanup',
        payload: {
          actor: 'test',
          dryRun: false
        }
      });
      expect(apply.statusCode).toBe(200);
      expect(fs.existsSync(insideOpsRuntime)).toBe(false);
      expect(fs.existsSync(insideRouting)).toBe(false);
      expect(fs.existsSync(path.join(insideNormalDir, 'safe.txt'))).toBe(true);
      expect(fs.existsSync(outsideOpsRuntime)).toBe(true);
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});
