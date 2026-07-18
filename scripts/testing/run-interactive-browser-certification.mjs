#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const REPORT_DIR = path.join(REPO_ROOT, '.ops', 'certifications', 'interactive-browser');
const REPORT_PATH = path.join(REPORT_DIR, 'certification-report.json');

function runStep(id, label, command, args) {
  console.log(`[interactive-browser-cert] ${label}`);
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return {
    id,
    label,
    command: [command, ...args].join(' '),
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status ?? 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    output: output.slice(0, 20000)
  };
}

const vitestBase = ['exec', 'vitest', 'run', '--config', 'vitest.config.ts'];
const steps = [
  runStep('native_cdp_actions', 'native CDP actions and binary artifacts', 'pnpm', [
    ...vitestBase,
    'packages/gateway/test/unit/browser-interactive-service.test.ts'
  ]),
  runStep('interactive_api_profile_routing', 'interactive API profile/cookie/storage-state routing', 'pnpm', [
    ...vitestBase,
    'packages/gateway/test/integration/browser-api.test.ts',
    '--testNamePattern',
    'runs typed interactive browser actions through an injected provider and session profile cookies'
  ]),
  runStep('telegram_live_control', 'Telegram live browser command surface', 'pnpm', [
    ...vitestBase,
    'packages/gateway/test/integration/telegram-browser-live-control.test.ts'
  ])
];

const failedSteps = steps.filter((step) => step.status !== 'passed');
const passed = failedSteps.length === 0;
const report = {
  schema: 'ops.interactive-browser-certification.v1',
  version: 1,
  generatedAt: new Date().toISOString(),
  status: passed ? 'passed' : 'failed',
  summary: passed
    ? 'Interactive browser click/type/read/screenshot/PDF controls are certified across native CDP, API routing, and Telegram live-command surfaces.'
    : `${failedSteps.length.toString()} interactive browser certification step${failedSteps.length === 1 ? '' : 's'} failed.`,
  surfaces: [
    {
      id: 'native_cdp_provider',
      status: steps[0].status,
      evidence: ['packages/gateway/test/unit/browser-interactive-service.test.ts'],
      guarantees: [
        'open/reload/back/forward/read/snapshot/hover/click/type/upload/download/scroll/keypress actions',
        'screenshot and PDF binary artifact capture',
        'persistent live session start/action/close lifecycle'
      ]
    },
    {
      id: 'interactive_api',
      status: steps[1].status,
      evidence: ['packages/gateway/test/integration/browser-api.test.ts'],
      guarantees: [
        'session profile cookies are passed to the provider',
        'Playwright storage state and CDP profile metadata are routed to the provider',
        'provider artifacts stay surfaced through the API response'
      ]
    },
    {
      id: 'telegram_live_control',
      status: steps[2].status,
      evidence: ['packages/gateway/test/integration/telegram-browser-live-control.test.ts'],
      guarantees: [
        '/browser live starts persistent interactive sessions',
        '/browser click/type/read/screenshot/download/upload/scroll/key/wait commands route to provider actions',
        'operator command responses include artifact counts'
      ]
    }
  ],
  gapTableClosure: [
    {
      target: 'Deterministic interactive click/type/PDF provider coverage',
      status: passed ? 'closed' : 'incomplete',
      evidence: [
        'packages/gateway/src/browser-interactive-service.ts',
        'packages/gateway/test/unit/browser-interactive-service.test.ts',
        'packages/gateway/test/integration/browser-api.test.ts'
      ]
    },
    {
      target: 'Telegram-to-interactive-browser operation',
      status: passed ? 'closed' : 'incomplete',
      evidence: ['packages/gateway/test/integration/telegram-browser-live-control.test.ts']
    },
    {
      target: 'Scrapling remains default read path while interactive browser is complementary',
      status: 'preserved',
      evidence: [
        'scripts/testing/run-live-social-browser-certification.mjs',
        'packages/gateway/test/integration/browser-auth-routing.test.ts'
      ]
    }
  ],
  deferredNonGoals: [
    'This deterministic certification does not prove arbitrary live third-party click/write workflows.',
    'Live social authenticated reads remain certified through the Scrapling-first live social browser lane.'
  ],
  steps
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (!passed) {
  console.error(`[interactive-browser-cert] failed. report=${REPORT_PATH}`);
  for (const step of failedSteps) {
    console.error(`\n[${step.label}] ${step.command}\n${step.output}`);
  }
  process.exit(1);
}

console.log(`[interactive-browser-cert] passed. report=${REPORT_PATH}`);
