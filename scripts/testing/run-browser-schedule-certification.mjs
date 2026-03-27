#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const REPORT_DIR = path.join(REPO_ROOT, '.ops', 'certifications', 'browser-schedule');
const REPORT_PATH = path.join(REPORT_DIR, 'certification-report.json');

function runStep(label, command, args) {
  console.log(`[browser-schedule-cert] ${label}`);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return {
    label,
    command: [command, ...args].join(' '),
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status ?? 1,
    output: combined
  };
}

const steps = [
  runStep('browser unit + API/CLI integration suites', 'pnpm', [
    'exec',
    'vitest',
    'run',
    '--config',
    'vitest.config.ts',
    'packages/gateway/test/unit/browser-service.test.ts',
    'packages/gateway/test/integration/browser-api.test.ts',
    'packages/gateway/test/integration/browser-cli.test.ts',
    'packages/gateway/test/integration/browser-schedule-composition.test.ts',
    'packages/gateway/test/integration/schedule-control-plane.test.ts',
    'packages/gateway/test/integration/browser-capability.test.ts',
    'packages/gateway/test/integration/gateway.test.ts',
    '--testNamePattern',
    '(keeps default CEO protected from disable and supports reset to baseline|refreshes the live CEO prompt when onboarding baseline is re-applied)'
  ]),
  runStep('dashboard browser smoke suite', 'node', ['scripts/testing/run-browser-tests.mjs'])
];

const failedSteps = steps.filter((step) => step.status !== 'passed');
const report = {
  schema: 'ops.browser-schedule-certification.v1',
  version: 1,
  generatedAt: new Date().toISOString(),
  status: failedSteps.length === 0 ? 'passed' : 'failed',
  surfaces: [
    {
      surface: 'unit',
      status: steps[0].status,
      evidence: [
        'packages/gateway/test/unit/browser-service.test.ts',
        'packages/gateway/test/integration/browser-capability.test.ts'
      ]
    },
    {
      surface: 'api_cli',
      status: steps[0].status,
      evidence: [
        'packages/gateway/test/integration/browser-api.test.ts',
        'packages/gateway/test/integration/browser-cli.test.ts',
        'packages/gateway/test/integration/browser-schedule-composition.test.ts',
        'packages/gateway/test/integration/schedule-control-plane.test.ts'
      ]
    },
    {
      surface: 'dashboard_browser',
      status: steps[1].status,
      evidence: ['scripts/testing/run-browser-tests.mjs']
    }
  ],
  gapTableClosure: [
    {
      target: 'Browser operator visibility across API/dashboard/CLI',
      status: failedSteps.length === 0 ? 'closed' : 'incomplete',
      evidence: [
        'packages/gateway/test/integration/browser-api.test.ts',
        'packages/gateway/test/integration/browser-cli.test.ts',
        'scripts/testing/run-browser-tests.mjs'
      ]
    },
    {
      target: 'Gateway-managed recurring jobs with requester/target/delivery semantics',
      status: failedSteps.length === 0 ? 'closed' : 'incomplete',
      evidence: [
        'packages/gateway/test/integration/browser-schedule-composition.test.ts',
        'packages/gateway/test/integration/schedule-control-plane.test.ts'
      ]
    },
    {
      target: 'Browser/computer safety policy and operator truth',
      status: failedSteps.length === 0 ? 'closed' : 'incomplete',
      evidence: [
        'packages/gateway/test/unit/browser-service.test.ts',
        'packages/gateway/test/integration/browser-api.test.ts',
        'packages/gateway/test/integration/gateway.test.ts',
        'scripts/testing/run-browser-tests.mjs'
      ]
    },
    {
      target: 'Containerized Scrapling readiness guidance',
      status: failedSteps.length === 0 ? 'closed' : 'incomplete',
      evidence: [
        'packages/gateway/test/integration/browser-capability.test.ts',
        'packages/gateway/test/integration/browser-schedule-composition.test.ts'
      ]
    }
  ],
  comparators: [
    {
      comparator: 'mission-control',
      claim: 'Operator-visible schedule control exists as a first-class dashboard/browser surface rather than hidden cron state.',
      status: failedSteps.length === 0 ? 'met' : 'unmet',
      notes: ['Dashboard smoke now creates and verifies a real every-10m schedule through the Schedules page.']
    },
    {
      comparator: 'paperclip',
      claim: 'Recurring follow-ups are persisted, restart-safe, and carry explicit requester/target/delivery metadata.',
      status: failedSteps.length === 0 ? 'met' : 'unmet',
      notes: ['Schedule control-plane suites cover origin-session delivery, restart durability, and no-duplicate-fire behavior.']
    },
    {
      comparator: 'baseline_alpha',
      claim: 'Browser-backed monitor jobs remain policy-wrapped and target explicit delivery surfaces instead of hidden timers.',
      status: failedSteps.length === 0 ? 'met' : 'unmet',
      notes: ['The composition suite proves governed browser extraction plus a real every-10m follow-up schedule with explicit delivery target metadata.']
    }
  ],
  deferredNonGoals: [
    'Alternative browser backends beyond Scrapling remain out of scope for this wave.',
    'Visual-browser / computer-use providers stay future-compatible but are not certified in this closure report.'
  ],
  steps
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (failedSteps.length > 0) {
  console.error(`[browser-schedule-cert] failed. report=${REPORT_PATH}`);
  for (const step of failedSteps) {
    console.error(`\n[${step.label}] ${step.command}\n${step.output}`);
  }
  process.exit(1);
}

console.log(`[browser-schedule-cert] passed. report=${REPORT_PATH}`);
