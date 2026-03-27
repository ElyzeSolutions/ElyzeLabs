#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { loadConfig } from '../../packages/config/dist/index.js';
import { ControlPlaneDatabase } from '../../packages/db/dist/index.js';

const lanes = [
  { lane: 'design', command: ['pnpm', ['--filter', 'dashboard', 'build']] },
  { lane: 'state', command: ['pnpm', ['test:unit']] },
  { lane: 'realtime', command: ['pnpm', ['test:integration']] },
  { lane: 'browser', command: ['pnpm', ['test:browser']] },
  { lane: 'performance', command: ['pnpm', ['test:perf']] },
  { lane: 'refactor', command: ['pnpm', ['refactor:pass']] }
];

const config = loadConfig({ configPath: 'config/control-plane.yaml' });
const db = new ControlPlaneDatabase(path.resolve(config.persistence.sqlitePath));
db.migrate();

let failed = false;

for (const lane of lanes) {
  const [command, args] = lane.command;
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  const status = result.status === 0 ? 'passed' : 'failed';
  db.recordGateResult({
    lane: lane.lane,
    status,
    summary:
      status === 'passed'
        ? `${lane.lane} lane passed`
        : `${lane.lane} lane failed with exit code ${String(result.status)}`,
    artifacts: [
      {
        label: 'command',
        path: `${command} ${args.join(' ')}`
      }
    ]
  });

  if (status === 'failed') {
    failed = true;
  }
}

db.close();

if (failed) {
  process.exitCode = 1;
}
