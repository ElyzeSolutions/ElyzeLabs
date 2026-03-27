#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ControlPlaneDatabase } from '../../packages/db/dist/index.js';
import { QueueEngine } from '../../packages/queue/dist/index.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-chaos-'));
const db = new ControlPlaneDatabase(path.join(temp, 'state.db'));
db.migrate();

const session = db.upsertSessionByKey({
  sessionKey: 'chaos:session',
  channel: 'internal',
  chatType: 'internal',
  agentId: 'codex'
});

const run = db.createRun({
  sessionId: session.id,
  runtime: 'codex',
  prompt: 'chaos prompt',
  status: 'queued'
});

db.enqueueQueueItem({
  lane: 'default',
  sessionId: session.id,
  runId: run.id,
  payload: {},
  priority: 1,
  maxAttempts: 3
});

let invocations = 0;
const engine = new QueueEngine(
  db,
  {
    laneConcurrency: { default: 1 },
    defaultLane: 'default',
    leaseMs: 200,
    pollMs: 20,
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 30,
      maxDelayMs: 60
    }
  },
  async () => {
    invocations += 1;
    throw new Error('simulated crash');
  }
);

engine.start();
await wait(220);
engine.stop();

const before = db.queueMetrics();
if (before.queued + before.deadLetter === 0) {
  throw new Error('Chaos test failed: queue item disappeared after crash simulation');
}

const recovery = new QueueEngine(
  db,
  {
    laneConcurrency: { default: 1 },
    defaultLane: 'default',
    leaseMs: 200,
    pollMs: 20,
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 20,
      maxDelayMs: 50
    }
  },
  async () => {
    // Successful recovery pass.
  }
);

recovery.start();
await wait(180);
recovery.stop();

const after = db.queueMetrics();
if (after.completed < 1 && after.deadLetter < 1) {
  throw new Error('Chaos test failed: item never reached completed or dead-letter state');
}

db.close();
console.log(`chaos test passed with ${invocations} crash invocations`);
