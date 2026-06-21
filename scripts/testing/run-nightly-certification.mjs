#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const REPORT_DIR = path.join(REPO_ROOT, '.ops', 'certifications', 'nightly');
const REPORT_PATH = path.join(REPORT_DIR, 'certification-report.json');
const ARCHIVE_PATH = path.join(REPO_ROOT, 'docs', 'certifications', 'nightly-certification-latest.json');

const truthyValues = new Set(['1', 'true', 'yes', 'y', 'on']);
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || envFlag('OPS_NIGHTLY_CERT_DRY_RUN');
const includeLive = args.has('--include-live') || envFlag('OPS_NIGHTLY_CERT_INCLUDE_LIVE');
const strictLive = args.has('--strict-live') || envFlag('OPS_NIGHTLY_CERT_STRICT_LIVE');

function envFlag(name) {
  const value = process.env[name];
  return typeof value === 'string' && truthyValues.has(value.trim().toLowerCase());
}

function readJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function redactOutput(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gu, 'Bearer [redacted]')
    .replace(/bot[0-9]+:[A-Za-z0-9_-]+/gu, 'bot[redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/gu, 'sk-[redacted]')
    .replace(/(?:TELEGRAM|OPENROUTER|GOOGLE|GITHUB|OPS_[A-Z0-9_]+)_TOKEN[^\s]*/gu, '[redacted_token]')
    .replace(/(?:TELEGRAM|OPENROUTER|GOOGLE|GITHUB|OPS_[A-Z0-9_]+)_API_KEY[^\s]*/gu, '[redacted_api_key]');
}

function runStep(lane) {
  const startedAt = new Date().toISOString();
  if (dryRun) {
    return {
      id: lane.id,
      label: lane.label,
      kind: lane.kind,
      trigger: lane.trigger,
      command: lane.command.join(' '),
      status: lane.selected ? 'planned' : 'skipped',
      reportStatus: null,
      reportPath: lane.reportPath ? path.relative(REPO_ROOT, lane.reportPath) : null,
      exitCode: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      output: dryRun ? 'Dry run: command was not executed.' : ''
    };
  }

  if (!lane.selected) {
    return {
      id: lane.id,
      label: lane.label,
      kind: lane.kind,
      trigger: lane.trigger,
      command: lane.command.join(' '),
      status: 'skipped',
      reportStatus: null,
      reportPath: lane.reportPath ? path.relative(REPO_ROOT, lane.reportPath) : null,
      exitCode: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      output: 'Skipped because this opt-in live lane was not selected.'
    };
  }

  console.log(`[nightly-cert] ${lane.label}`);
  const startMs = Date.now();
  const result = spawnSync(lane.command[0], lane.command.slice(1), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...lane.env
    },
    maxBuffer: 40 * 1024 * 1024
  });
  const childReport = readJsonIfPresent(lane.reportPath);
  const reportStatus = typeof childReport?.status === 'string' ? childReport.status : null;
  const status =
    result.status !== 0
      ? 'failed'
      : reportStatus === 'failed' || reportStatus === 'blocked' || reportStatus === 'skipped'
        ? reportStatus
        : 'passed';

  return {
    id: lane.id,
    label: lane.label,
    kind: lane.kind,
    trigger: lane.trigger,
    command: lane.command.join(' '),
    status,
    reportStatus,
    reportPath: lane.reportPath ? path.relative(REPO_ROOT, lane.reportPath) : null,
    exitCode: result.status ?? 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    output: redactOutput(`${result.stdout ?? ''}${result.stderr ?? ''}`.trim()).slice(0, 25000)
  };
}

function finalStatus(steps) {
  if (dryRun) {
    return 'planned';
  }
  if (steps.some((step) => step.status === 'failed')) {
    return 'failed';
  }
  if (steps.some((step) => step.status === 'blocked')) {
    return 'blocked';
  }
  if (steps.some((step) => step.status === 'passed')) {
    return 'passed';
  }
  return 'skipped';
}

function makeArchive(report) {
  return {
    schema: 'ops.nightly-certification-archive.v1',
    version: 1,
    archivedAt: new Date().toISOString(),
    sourceReport: {
      path: path.relative(REPO_ROOT, REPORT_PATH),
      schema: report.schema,
      generatedAt: report.generatedAt
    },
    status: report.status,
    mode: report.mode,
    summary: report.summary,
    gates: report.gates,
    lanes: report.lanes.map((lane) => ({
      id: lane.id,
      kind: lane.kind,
      trigger: lane.trigger,
      status: lane.status,
      reportStatus: lane.reportStatus,
      reportPath: lane.reportPath,
      command: lane.command
    })),
    redaction: report.redaction,
    followUpTasks: report.followUpTasks
  };
}

const lanes = [
  {
    id: 'best_in_class_matrix',
    label: 'Best-in-class matrix freshness',
    kind: 'deterministic',
    trigger: 'always',
    selected: true,
    command: ['pnpm', 'best-in-class:matrix:check'],
    reportPath: path.join(REPO_ROOT, 'docs', 'generated', 'best-in-class-capability-matrix.json')
  },
  {
    id: 'fake_provider_e2e',
    label: 'Fake provider E2E certification',
    kind: 'deterministic',
    trigger: 'always',
    selected: true,
    command: ['pnpm', 'test:fake-provider-e2e:cert'],
    reportPath: path.join(REPO_ROOT, '.ops', 'certifications', 'fake-provider-e2e', 'certification-report.json')
  },
  {
    id: 'interactive_browser',
    label: 'Interactive browser deterministic certification',
    kind: 'deterministic',
    trigger: 'always',
    selected: true,
    command: ['pnpm', 'test:interactive-browser:cert'],
    reportPath: path.join(REPO_ROOT, '.ops', 'certifications', 'interactive-browser', 'certification-report.json')
  },
  {
    id: 'kanban_workboard',
    label: 'Kanban workboard certification',
    kind: 'deterministic',
    trigger: 'always',
    selected: true,
    command: ['pnpm', 'test:kanban-workboard:cert'],
    reportPath: path.join(REPO_ROOT, '.ops', 'certifications', 'kanban-workboard', 'certification-report.json')
  },
  {
    id: 'chat_process_runtime',
    label: 'Chat/process runtime certification',
    kind: 'deterministic',
    trigger: 'always',
    selected: true,
    command: ['pnpm', 'test:chat-process:cert'],
    reportPath: path.join(REPO_ROOT, '.ops', 'certifications', 'chat-process-runtime', 'certification-report.json')
  },
  {
    id: 'browser_schedule',
    label: 'Browser schedule certification',
    kind: 'deterministic',
    trigger: 'always',
    selected: true,
    command: ['pnpm', 'test:browser-schedule:cert'],
    reportPath: path.join(REPO_ROOT, '.ops', 'certifications', 'browser-schedule', 'certification-report.json')
  },
  {
    id: 'interactive_browser_live',
    label: 'Live interactive browser certification',
    kind: 'live',
    trigger: 'opt_in',
    selected: includeLive,
    command: ['pnpm', 'test:interactive-browser:live'],
    reportPath: path.join(REPO_ROOT, '.ops', 'certifications', 'interactive-browser-live', 'certification-report.json'),
    env: {
      OPS_RUN_LIVE_INTERACTIVE_BROWSER_CERT: includeLive ? '1' : undefined,
      OPS_LIVE_INTERACTIVE_BROWSER_STRICT: strictLive ? '1' : '0'
    }
  },
  {
    id: 'live_social_browser',
    label: 'Live social browser certification',
    kind: 'live',
    trigger: 'opt_in',
    selected: includeLive,
    command: ['pnpm', 'test:live-social-browser'],
    reportPath: path.join(REPO_ROOT, '.ops', 'certifications', 'live-social-browser', 'certification-report.json'),
    env: {
      OPS_RUN_LIVE_SOCIAL_BROWSER_CERT: includeLive ? '1' : undefined,
      OPS_LIVE_SCENARIO_STRICT: strictLive ? '1' : '0'
    }
  },
  {
    id: 'live_telegram_process',
    label: 'Live Telegram process certification',
    kind: 'live',
    trigger: 'opt_in',
    selected: includeLive,
    command: ['pnpm', 'test:live-telegram-process'],
    reportPath: path.join(REPO_ROOT, '.ops', 'certifications', 'live-telegram-process', 'certification-report.json'),
    env: {
      OPS_RUN_LIVE_TELEGRAM_PROCESS_CERT: includeLive ? '1' : undefined,
      OPS_LIVE_TELEGRAM_PROCESS_STRICT: strictLive ? '1' : '0'
    }
  },
  {
    id: 'live_github_delivery',
    label: 'Live GitHub delivery certification',
    kind: 'live',
    trigger: 'opt_in',
    selected: includeLive,
    command: ['pnpm', 'test:live-github-delivery'],
    reportPath: path.join(REPO_ROOT, '.ops', 'certifications', 'live-github-delivery', 'certification-report.json'),
    env: {
      OPS_RUN_LIVE_GITHUB_DELIVERY_CERT: includeLive ? '1' : undefined,
      OPS_LIVE_GITHUB_DELIVERY_STRICT: strictLive ? '1' : '0'
    }
  }
];

fs.rmSync(REPORT_DIR, { force: true, recursive: true });
const steps = lanes.map(runStep);
const status = finalStatus(steps);
const liveSteps = steps.filter((step) => step.kind === 'live');
const report = {
  schema: 'ops.nightly-certification.v1',
  version: 1,
  generatedAt: new Date().toISOString(),
  status,
  mode: {
    dryRun,
    includeLive,
    strictLive
  },
  summary: {
    total: steps.length,
    deterministic: steps.filter((step) => step.kind === 'deterministic').length,
    live: liveSteps.length,
    passed: steps.filter((step) => step.status === 'passed').length,
    failed: steps.filter((step) => step.status === 'failed').length,
    blocked: steps.filter((step) => step.status === 'blocked').length,
    skipped: steps.filter((step) => step.status === 'skipped').length,
    planned: steps.filter((step) => step.status === 'planned').length
  },
  gates: {
    deterministicLanesRequired: true,
    liveLanesOptIn: true,
    liveLanesSelected: includeLive,
    liveLanesPassed: includeLive && liveSteps.every((step) => step.status === 'passed'),
    redactedArchiveWritten: true
  },
  lanes: steps,
  redaction: {
    localReport: 'Local report keeps redacted command output previews only.',
    trackedArchive: 'Tracked archive omits command output and any live artifact payloads.'
  },
  followUpTasks: dryRun
    ? ['Run pnpm test:nightly-cert to execute deterministic lanes, or add OPS_NIGHTLY_CERT_INCLUDE_LIVE=1 for live lanes.']
    : status === 'passed'
      ? includeLive
        ? []
        : ['Run with OPS_NIGHTLY_CERT_INCLUDE_LIVE=1 after stable live credentials and browser session profiles are available.']
      : ['Inspect the failed or blocked lane reports under .ops/certifications and rerun pnpm test:nightly-cert.']
};

writeJson(REPORT_PATH, report);
writeJson(ARCHIVE_PATH, makeArchive(report));

if (status === 'failed' || (strictLive && status === 'blocked')) {
  console.error(`[nightly-cert] ${status}. report=${REPORT_PATH}`);
  process.exit(1);
}

console.log(`[nightly-cert] ${status}. report=${REPORT_PATH}`);
