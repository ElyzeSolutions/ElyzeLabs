#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const REPORT_DIR = path.join(REPO_ROOT, '.ops', 'certifications', 'kanban-workboard');
const REPORT_PATH = path.join(REPORT_DIR, 'certification-report.json');
const VISUAL_REPORT_PATH = path.join(REPORT_DIR, 'browser-visual-report.json');

function runStep(id, label, command, args, envOverrides = {}) {
  console.log(`[kanban-workboard-cert] ${label}`);
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
fs.rmSync(REPORT_DIR, { force: true, recursive: true });
const browserPort = 10400 + Math.floor(Math.random() * 1000);
const browserBaseUrl = `http://127.0.0.1:${String(browserPort)}`;
const steps = [
  runStep('dashboard_kanban_ui', 'dashboard Kanban and delivery cockpit UI contracts', 'pnpm', [
    ...vitestBase,
    'dashboard/src/pages/BacklogPage.test.tsx',
    'dashboard/src/components/backlog/GithubDeliveryCockpit.test.tsx'
  ]),
  runStep('gateway_kanban_delivery', 'Telegram task creation and GitHub delivery truth contracts', 'pnpm', [
    ...vitestBase,
    'packages/gateway/test/integration/telegram-backlog-kanban.test.ts',
    'packages/gateway/test/integration/github-delivery-certification.test.ts'
  ]),
  runStep('browser_visual_workboard', 'Backlog workboard browser screenshots and overflow checks', 'pnpm', [
    'test:browser'
  ], {
    BROWSER_BASE_URL: browserBaseUrl,
    BROWSER_GATEWAY_URL: browserBaseUrl,
    BROWSER_ONLY_KANBAN_WORKBOARD: '1',
    BROWSER_REQUIRE_FULL_SHELL: '1'
  })
];

const visualReport = readVisualReport();
const visualViewports = Array.isArray(visualReport?.viewports) ? visualReport.viewports : [];
const failedSteps = steps.filter((step) => step.status !== 'passed');
const passed = failedSteps.length === 0 && visualReport?.status === 'passed';
const report = {
  schema: 'ops.kanban-workboard-certification.v1',
  version: 1,
  generatedAt: new Date().toISOString(),
  status: passed ? 'passed' : 'failed',
  summary: passed
    ? 'Operator Kanban workboard is certified across UI contracts, Telegram task intake, GitHub delivery truth, browser screenshots, and responsive overflow checks.'
    : `${failedSteps.length.toString()} Kanban certification step${failedSteps.length === 1 ? '' : 's'} failed.`,
  surfaces: [
    {
      id: 'dashboard_kanban',
      status: steps[0].status,
      evidence: ['dashboard/src/pages/BacklogPage.test.tsx'],
      guarantees: [
        'contract-aware transition buttons',
        'drag/drop task transitions',
        'operator task creation from the board',
        'Telegram task handoff command generation',
        'operator focus strip counts and lane filters'
      ]
    },
    {
      id: 'github_delivery_cockpit',
      status: steps[0].status,
      evidence: ['dashboard/src/components/backlog/GithubDeliveryCockpit.test.tsx'],
      guarantees: [
        'delivery journal parity with API truth',
        'blocker diagnostics',
        'operator repair preview and execution receipts'
      ]
    },
    {
      id: 'telegram_and_github_delivery',
      status: steps[1].status,
      evidence: [
        'packages/gateway/test/integration/telegram-backlog-kanban.test.ts',
        'packages/gateway/test/integration/github-delivery-certification.test.ts'
      ],
      guarantees: [
        'Telegram-created tasks enter the backlog workflow',
        'GitHub delivery certification keeps scoped truth labels and repair evidence explicit'
      ]
    },
    {
      id: 'responsive_visual_workboard',
      status: visualReport?.status === 'passed' ? 'passed' : 'failed',
      evidence: [
        'scripts/testing/run-browser-tests.mjs',
        '.ops/certifications/kanban-workboard/browser-visual-report.json',
        '.ops/certifications/kanban-workboard/screenshots/backlog-desktop.png',
        '.ops/certifications/kanban-workboard/screenshots/backlog-tablet.png',
        '.ops/certifications/kanban-workboard/screenshots/backlog-mobile.png'
      ],
      guarantees: [
        'desktop, tablet, and mobile Backlog screenshots are archived',
        'core workboard text is present in every viewport',
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
    'This lane does not exercise a live GitHub repository token; live delivery sync remains a separate release-evidence run.',
    'This lane does not replace live operator review of final naming and density; it protects the current UI from functional and responsive regressions.'
  ],
  steps
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (!passed) {
  console.error(`[kanban-workboard-cert] failed. report=${REPORT_PATH}`);
  if (!visualReport) {
    console.error(`[kanban-workboard-cert] missing visual report at ${VISUAL_REPORT_PATH}`);
  }
  for (const step of failedSteps) {
    console.error(`\n[${step.label}] ${step.command}\n${step.output}`);
  }
  process.exit(1);
}

console.log(`[kanban-workboard-cert] passed. report=${REPORT_PATH}`);
