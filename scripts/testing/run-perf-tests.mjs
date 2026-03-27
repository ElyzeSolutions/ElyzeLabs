#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ControlPlaneDatabase } from '../../packages/db/dist/index.js';
import { QueueEngine } from '../../packages/queue/dist/index.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-perf-'));
const db = new ControlPlaneDatabase(path.join(temp, 'state.db'));
db.migrate();

for (let index = 0; index < 80; index += 1) {
  const session = db.upsertSessionByKey({
    sessionKey: `perf:session:${index}`,
    channel: 'internal',
    chatType: 'internal',
    agentId: 'codex'
  });

  const run = db.createRun({
    sessionId: session.id,
    runtime: 'codex',
    prompt: `prompt-${index}`,
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
}

let completed = 0;
const start = performance.now();

const engine = new QueueEngine(
  db,
  {
    laneConcurrency: { default: 8 },
    defaultLane: 'default',
    leaseMs: 1000,
    pollMs: 10,
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 20,
      maxDelayMs: 120
    }
  },
  async () => {
    completed += 1;
  }
);

engine.start();

for (let i = 0; i < 120; i += 1) {
  if (completed >= 80) {
    break;
  }
  await wait(20);
}

engine.stop();

const elapsed = performance.now() - start;
const throughput = (completed / elapsed) * 1000;

if (throughput < 25) {
  throw new Error(`Perf regression: throughput ${throughput.toFixed(2)} items/s below 25 items/s budget`);
}

db.close();
console.log(`perf test passed: ${throughput.toFixed(2)} items/s`);
