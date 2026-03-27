import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';

import { QueueEngine } from '../../src/index.ts';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('queue engine', () => {
  it('serializes same-session items while allowing parallel session processing', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-queue-'));
    const db = new ControlPlaneDatabase(path.join(directory, 'state.db'));
    db.migrate();

    const sessionA = db.upsertSessionByKey({
      sessionKey: 's:a',
      channel: 'internal',
      chatType: 'internal',
      agentId: 'codex'
    });

    const sessionB = db.upsertSessionByKey({
      sessionKey: 's:b',
      channel: 'internal',
      chatType: 'internal',
      agentId: 'codex'
    });

    const runA1 = db.createRun({ sessionId: sessionA.id, runtime: 'codex', prompt: 'a1', status: 'queued' });
    const runA2 = db.createRun({ sessionId: sessionA.id, runtime: 'codex', prompt: 'a2', status: 'queued' });
    const runB = db.createRun({ sessionId: sessionB.id, runtime: 'codex', prompt: 'b', status: 'queued' });

    db.enqueueQueueItem({ lane: 'default', sessionId: sessionA.id, runId: runA1.id, payload: {}, priority: 1, maxAttempts: 3 });
    db.enqueueQueueItem({ lane: 'default', sessionId: sessionA.id, runId: runA2.id, payload: {}, priority: 2, maxAttempts: 3 });
    db.enqueueQueueItem({ lane: 'default', sessionId: sessionB.id, runId: runB.id, payload: {}, priority: 1, maxAttempts: 3 });

    const starts: Array<{ runId: string; at: number }> = [];
    const finishes: Array<{ runId: string; at: number }> = [];

    const engine = new QueueEngine(
      db,
      {
        laneConcurrency: { default: 2 },
        defaultLane: 'default',
        leaseMs: 1000,
        pollMs: 20,
        retryPolicy: {
          maxAttempts: 3,
          baseDelayMs: 50,
          maxDelayMs: 200
        }
      },
      async (item) => {
        starts.push({ runId: item.runId, at: Date.now() });
        await wait(item.runId === runA1.id ? 120 : 30);
        finishes.push({ runId: item.runId, at: Date.now() });
      }
    );

    engine.start();
    await wait(450);
    engine.stop();

    expect(starts.length).toBeGreaterThanOrEqual(3);

    const finishA1 = finishes.find((row) => row.runId === runA1.id)!;
    const startA2 = starts.find((row) => row.runId === runA2.id)!;
    const startB = starts.find((row) => row.runId === runB.id)!;

    expect(startA2.at).toBeGreaterThanOrEqual(finishA1.at);
    expect(startB.at).toBeLessThan(finishA1.at);

    db.close();
  });

  it('renews queue leases for long-running handlers so items do not get re-queued mid-flight', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-queue-lease-'));
    const db = new ControlPlaneDatabase(path.join(directory, 'state.db'));
    db.migrate();

    const session = db.upsertSessionByKey({
      sessionKey: 'lease:session',
      channel: 'internal',
      chatType: 'internal',
      agentId: 'codex'
    });
    const run = db.createRun({ sessionId: session.id, runtime: 'codex', prompt: 'long', status: 'queued' });
    const queueItem = db.enqueueQueueItem({
      lane: 'default',
      sessionId: session.id,
      runId: run.id,
      payload: {},
      priority: 1,
      maxAttempts: 3
    });

    let startedResolve: (() => void) | null = null;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    let finishResolve: (() => void) | null = null;
    const finish = new Promise<void>((resolve) => {
      finishResolve = resolve;
    });
    let handlerCalls = 0;

    const engine = new QueueEngine(
      db,
      {
        laneConcurrency: { default: 1 },
        defaultLane: 'default',
        leaseMs: 80,
        pollMs: 10,
        retryPolicy: {
          maxAttempts: 3,
          baseDelayMs: 20,
          maxDelayMs: 50
        }
      },
      async () => {
        handlerCalls += 1;
        startedResolve?.();
        await finish;
      }
    );

    engine.start();
    await started;
    await wait(220);

    const midFlight = db.getQueueItemById(queueItem.id);
    expect(midFlight?.status).toBe('processing');
    expect(handlerCalls).toBe(1);

    finishResolve?.();
    await wait(80);
    engine.stop();

    const completed = db.getQueueItemById(queueItem.id);
    expect(completed?.status).toBe('done');
    expect(handlerCalls).toBe(1);

    db.close();
  });

  it.each(['completed', 'waiting_input'] as const)(
    'does not replay queue work after the run is already %s',
    async (terminalStatus) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), `ops-queue-terminal-${terminalStatus}-`));
      const db = new ControlPlaneDatabase(path.join(directory, 'state.db'));
      db.migrate();

      const session = db.upsertSessionByKey({
        sessionKey: `terminal:${terminalStatus}`,
        channel: 'internal',
        chatType: 'internal',
        agentId: 'codex'
      });
      const run = db.createRun({ sessionId: session.id, runtime: 'codex', prompt: 'terminal', status: 'queued' });
      const queueItem = db.enqueueQueueItem({
        lane: 'default',
        sessionId: session.id,
        runId: run.id,
        payload: {},
        priority: 1,
        maxAttempts: 3
      });

      let handlerCalls = 0;
      const engine = new QueueEngine(
        db,
        {
          laneConcurrency: { default: 1 },
          defaultLane: 'default',
          leaseMs: 80,
          pollMs: 10,
          retryPolicy: {
            maxAttempts: 3,
            baseDelayMs: 20,
            maxDelayMs: 50
          }
        },
        async () => {
          handlerCalls += 1;
          db.updateRunStatus({
            runId: run.id,
            status: terminalStatus,
            resultSummary: `run became ${terminalStatus} before post-run cleanup finished`
          });
          throw new Error(`post-${terminalStatus}-cleanup failed`);
        }
      );

      engine.start();
      await wait(180);
      engine.stop();

      expect(handlerCalls).toBe(1);
      expect(db.getRunById(run.id)?.status).toBe(terminalStatus);
      expect(db.getQueueItemById(queueItem.id)?.status).toBe('done');

      db.close();
    }
  );
});
