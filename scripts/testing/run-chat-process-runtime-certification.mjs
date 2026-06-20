#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const REPORT_DIR = path.join(REPO_ROOT, '.ops', 'certifications', 'chat-process-runtime');
const REPORT_PATH = path.join(REPORT_DIR, 'certification-report.json');
const VISUAL_REPORT_PATH = path.join(REPORT_DIR, 'browser-visual-report.json');

function assertSupportedNodeRuntime() {
  const major = Number(process.versions.node.split('.')[0] ?? '0');
  if (major === 22) {
    return;
  }
  console.error(
    `[chat-process-runtime-cert] Node ${process.versions.node} is unsupported for this repo. Use Node 22 from .node-version before running this certification.`
  );
  process.exit(1);
}

function runStep(id, label, command, args, envOverrides = {}) {
  console.log(`[chat-process-runtime-cert] ${label}`);
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...envOverrides
    },
    maxBuffer: 30 * 1024 * 1024
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
    output: output.slice(0, 25000)
  };
}

function readVisualReport() {
  if (!fs.existsSync(VISUAL_REPORT_PATH)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(VISUAL_REPORT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

const vitestBase = ['exec', 'vitest', 'run', '--config', 'vitest.config.ts'];
assertSupportedNodeRuntime();
fs.rmSync(REPORT_DIR, { force: true, recursive: true });
const browserPort = 11500 + Math.floor(Math.random() * 1000);
const browserBaseUrl = `http://127.0.0.1:${String(browserPort)}`;
const steps = [
  runStep('dashboard_mission_control_ui', 'Mission Control chat/runtime UI contract', 'pnpm', [
    ...vitestBase,
    'dashboard/src/pages/MissionControlPage.test.tsx'
  ]),
  runStep('gateway_runtime_and_browser_auth', 'runtime routing and browser auth profile contracts', 'pnpm', [
    ...vitestBase,
    'packages/gateway/test/integration/runtime-certification.test.ts',
    'packages/gateway/test/integration/browser-auth-routing.test.ts'
  ]),
  runStep('browser_visual_mission_control', 'Mission Control browser screenshots and overflow checks', 'pnpm', [
    'test:browser'
  ], {
    BROWSER_BASE_URL: browserBaseUrl,
    BROWSER_GATEWAY_URL: browserBaseUrl,
    BROWSER_FORCE_DASHBOARD_BUILD: '1',
    BROWSER_ONLY_CHAT_PROCESS_RUNTIME: '1',
    BROWSER_REQUIRE_FULL_SHELL: '1'
  })
];

const visualReport = readVisualReport();
const visualViewports = Array.isArray(visualReport?.viewports) ? visualReport.viewports : [];
const failedSteps = steps.filter((step) => step.status !== 'passed');
const passed = failedSteps.length === 0 && visualReport?.status === 'passed';
const report = {
  schema: 'ops.chat-process-runtime-certification.v1',
  version: 1,
  generatedAt: new Date().toISOString(),
  status: passed ? 'passed' : 'failed',
  summary: passed
    ? 'Chat/process runtime is certified across Mission Control UI contracts, runtime routing, browser auth profile routing, Telegram-seeded process conversation state, and responsive screenshots.'
    : `${failedSteps.length.toString()} chat/process certification step${failedSteps.length === 1 ? '' : 's'} failed.`,
  surfaces: [
    {
      id: 'mission_control_ui',
      status: steps[0].status,
      evidence: ['dashboard/src/pages/MissionControlPage.test.tsx'],
      guarantees: [
        'Mission Control renders active session telemetry',
        'browser-auth posture is visible outside the composer',
        'chat/process state remains query-backed through the page harness'
      ]
    },
    {
      id: 'runtime_and_browser_auth_contracts',
      status: steps[1].status,
      evidence: [
        'packages/gateway/test/integration/runtime-certification.test.ts',
        'packages/gateway/test/integration/browser-auth-routing.test.ts'
      ],
      guarantees: [
        'runtime certification separates shim/live readiness truthfully',
        'Telegram routing exercises process/provider runtime paths',
        'browser auth profile routing and selected-profile persistence remain explicit'
      ]
    },
    {
      id: 'responsive_visual_chat_process',
      status: visualReport?.status === 'passed' ? 'passed' : 'failed',
      evidence: [
        'scripts/testing/run-browser-tests.mjs',
        '.ops/certifications/chat-process-runtime/browser-visual-report.json',
        '.ops/certifications/chat-process-runtime/screenshots/mission-control-desktop.png',
        '.ops/certifications/chat-process-runtime/screenshots/mission-control-tablet.png',
        '.ops/certifications/chat-process-runtime/screenshots/mission-control-mobile.png'
      ],
      guarantees: [
        'desktop, tablet, and mobile Mission Control screenshots are archived',
        'Telegram chat, process runtime posture, selected browser profile, and Scrapling evidence receipt are visible',
        'global horizontal overflow, clipped watched elements, and unusably small controls fail the gate'
      ],
      viewports: visualViewports.map((viewport) => ({
        id: viewport.viewport?.id,
        status: viewport.status,
        screenshotPath: viewport.screenshotPath,
        screenshotBytes: viewport.screenshotBytes,
        globalOverflowX: viewport.scroll?.globalOverflowX
      }))
    }
  ],
  remainingNonGoals: [
    'This deterministic lane does not send messages through the live Telegram Bot API; run the opt-in live Telegram scenario before claiming live delivery parity.',
    'This lane uses a managed fake process runtime so browser artifacts are stable; it does not replace the live authenticated social-site certification lane.',
    'Scrapling/cookie-backed authenticated reads remain the default low-detection route; full click/type/PDF browser control is certified separately.'
  ],
  steps
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (!passed) {
  console.error(`[chat-process-runtime-cert] failed. report=${REPORT_PATH}`);
  if (!visualReport) {
    console.error(`[chat-process-runtime-cert] missing visual report at ${VISUAL_REPORT_PATH}`);
  }
  for (const step of failedSteps) {
    console.error(`\n[${step.label}] ${step.command}\n${step.output}`);
  }
  process.exit(1);
}

console.log(`[chat-process-runtime-cert] passed. report=${REPORT_PATH}`);
