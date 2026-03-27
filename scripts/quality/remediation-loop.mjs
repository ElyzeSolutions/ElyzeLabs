#!/usr/bin/env node
import path from 'node:path';

import { loadConfig } from '../../packages/config/dist/index.js';
import { ControlPlaneDatabase } from '../../packages/db/dist/index.js';

const config = loadConfig({ configPath: 'config/control-plane.yaml' });
const db = new ControlPlaneDatabase(path.resolve(config.persistence.sqlitePath));
db.migrate();

const gates = db.listGateResults(200);
const failed = gates.filter((gate) => gate.status === 'failed');

for (const gate of failed) {
  db.createRemediationTask({
    source: 'quality_gate',
    severity: gate.lane === 'performance' ? 'high' : 'medium',
    title: `Fix failing lane: ${gate.lane}`,
    details: gate.summary,
    evidence: {
      lane: gate.lane,
      artifacts: gate.artifacts,
      createdAt: gate.createdAt
    }
  });
}

const tasks = db.listRemediationTasks(50);
console.log(`remediation queue updated. open tasks: ${tasks.filter((task) => task.status === 'open').length}`);

db.close();
