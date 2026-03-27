#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function runStep(label, args) {
  console.log(`\n[e2e] ${label}`);
  const result = spawnSync('pnpm', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.env.E2E_WITH_BROWSER === '1') {
  runStep('browser smoke suite', ['test:browser']);
} else {
  console.log('\n[e2e] no dedicated end-to-end suite configured. Set E2E_WITH_BROWSER=1 to include browser smoke.');
}
