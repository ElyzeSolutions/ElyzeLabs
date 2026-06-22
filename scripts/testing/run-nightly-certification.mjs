#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const REPORT_DIR = path.join(REPO_ROOT, '.ops', 'certifications', 'nightly');
const REPORT_PATH = path.join(REPORT_DIR, 'certification-report.json');
const ARCHIVE_PATH = path.join(REPO_ROOT, 'docs', 'certifications', 'nightly-certification-latest.json');

const truthyValues = new Set(['1', 'true', 'yes', 'y', 'on']);
const falsyValues = new Set(['0', 'false', 'no', 'n', 'off']);
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || envFlag('OPS_NIGHTLY_CERT_DRY_RUN');
const includeLive = args.has('--include-live') || envFlag('OPS_NIGHTLY_CERT_INCLUDE_LIVE');
const strictLive = args.has('--strict-live') || envFlag('OPS_NIGHTLY_CERT_STRICT_LIVE');
const liveEvidenceDisabled =
  args.has('--no-live-evidence') || envOptionalFlag('OPS_NIGHTLY_CERT_REQUIRE_LIVE_EVIDENCE', true) === false;
const requireLiveEvidence = !liveEvidenceDisabled;
const liveEvidenceMaxAgeHours = envPositiveNumber('OPS_NIGHTLY_CERT_LIVE_EVIDENCE_MAX_AGE_HOURS', 168);
const liveTelegramProcessArchiveFollowUp =
  'Run OPS_RUN_PROVIDER_READINESS_CERT=1 pnpm test:provider-readiness first. When it passes, pnpm test:live-telegram-process automatically uses the selected provider model; then run OPS_RUN_LIVE_TELEGRAM_PROCESS_CERT=1 pnpm test:live-telegram-process and pnpm archive:live-telegram-process.';

function envFlag(name) {
  const value = process.env[name];
  return typeof value === 'string' && truthyValues.has(value.trim().toLowerCase());
}

function envOptionalFlag(name, fallback) {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (truthyValues.has(normalized)) {
    return true;
  }
  if (falsyValues.has(normalized)) {
    return false;
  }
  return fallback;
}

function envPositiveNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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

function boolAtPath(payload, dottedPath) {
  let current = payload;
  for (const part of dottedPath.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return false;
    }
    current = current[part];
  }
  return current === true;
}

function resolveArchiveTime(payload) {
  const candidates = [payload?.archivedAt, payload?.sourceReport?.generatedAt, payload?.generatedAt];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const timestamp = Date.parse(candidate);
    if (Number.isFinite(timestamp)) {
      return {
        value: candidate,
        timestamp
      };
    }
  }
  return null;
}

function evaluateLiveEvidenceGate(expectation, nowMs) {
  const startedAt = new Date().toISOString();
  if (dryRun) {
    return {
      id: expectation.id,
      label: expectation.label,
      kind: 'live_evidence',
      trigger: 'archive_freshness',
      command: 'read tracked live archive',
      status: requireLiveEvidence ? 'planned' : 'skipped',
      reportStatus: null,
      reportPath: path.relative(REPO_ROOT, expectation.archivePath),
      exitCode: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      archiveStatus: null,
      archiveAgeHours: null,
      maxAgeHours: liveEvidenceMaxAgeHours,
      requiredGates: expectation.requiredGates,
      output: dryRun ? 'Dry run: tracked archive was not evaluated.' : ''
    };
  }

  if (!requireLiveEvidence) {
    return {
      id: expectation.id,
      label: expectation.label,
      kind: 'live_evidence',
      trigger: 'archive_freshness',
      command: 'read tracked live archive',
      status: 'skipped',
      reportStatus: null,
      reportPath: path.relative(REPO_ROOT, expectation.archivePath),
      exitCode: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      archiveStatus: null,
      archiveAgeHours: null,
      maxAgeHours: liveEvidenceMaxAgeHours,
      requiredGates: expectation.requiredGates,
      output: 'Skipped because OPS_NIGHTLY_CERT_REQUIRE_LIVE_EVIDENCE=0 or --no-live-evidence was set.'
    };
  }

  const archive = readJsonIfPresent(expectation.archivePath);
  if (!archive && expectation.optionalUntilPresent === true) {
    return {
      id: expectation.id,
      label: expectation.label,
      kind: 'live_evidence',
      trigger: 'archive_freshness',
      command: 'read tracked live archive',
      status: 'skipped',
      reportStatus: null,
      reportPath: path.relative(REPO_ROOT, expectation.archivePath),
      exitCode: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      archiveStatus: null,
      archiveAgeHours: null,
      maxAgeHours: liveEvidenceMaxAgeHours,
      requiredGates: expectation.requiredGates,
      missingGates: expectation.requiredGates,
      output:
        expectation.id === 'live_telegram_process_archive'
          ? `Skipped until the first passed live Telegram process archive is created. ${liveTelegramProcessArchiveFollowUp}`
          : 'Skipped until the first passed live archive is created.'
    };
  }
  const time = archive ? resolveArchiveTime(archive) : null;
  const ageHours = time ? (nowMs - time.timestamp) / (60 * 60 * 1000) : null;
  const missingGates = archive
    ? expectation.requiredGates.filter((gatePath) => !boolAtPath(archive, gatePath))
    : expectation.requiredGates;
  const archiveFailed =
    !archive ||
    archive.status !== 'passed' ||
    !time ||
    ageHours < 0 ||
    ageHours > liveEvidenceMaxAgeHours ||
    missingGates.length > 0;
  const status = archiveFailed ? 'failed' : 'passed';
  const output =
    status === 'passed'
      ? `Tracked archive is passed and ${ageHours.toFixed(1)}h old.`
      : [
          archive ? null : 'Tracked archive is missing.',
          archive && archive.status !== 'passed' ? `Archive status is ${String(archive.status ?? 'unknown')}.` : null,
          time ? null : 'Archive has no valid archivedAt/generatedAt timestamp.',
          ageHours !== null && ageHours < 0 ? 'Archive timestamp is in the future.' : null,
          ageHours !== null && ageHours > liveEvidenceMaxAgeHours
            ? `Archive is ${ageHours.toFixed(1)}h old; max is ${liveEvidenceMaxAgeHours.toString()}h.`
            : null,
          missingGates.length > 0 ? `Missing required gates: ${missingGates.join(', ')}.` : null
        ]
          .filter(Boolean)
          .join(' ');

  return {
    id: expectation.id,
    label: expectation.label,
    kind: 'live_evidence',
    trigger: 'archive_freshness',
    command: 'read tracked live archive',
    status,
    reportStatus: archive && typeof archive.status === 'string' ? archive.status : null,
    reportPath: path.relative(REPO_ROOT, expectation.archivePath),
    exitCode: status === 'passed' ? 0 : 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    archiveStatus: archive && typeof archive.status === 'string' ? archive.status : null,
    archiveTimestamp: time ? time.value : null,
    archiveAgeHours: ageHours === null ? null : Number(ageHours.toFixed(2)),
    maxAgeHours: liveEvidenceMaxAgeHours,
    requiredGates: expectation.requiredGates,
    missingGates,
    output
  };
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

const liveEvidenceExpectations = [
  {
    id: 'interactive_browser_live_archive',
    label: 'Live interactive browser archived evidence',
    archivePath: path.join(REPO_ROOT, 'docs', 'certifications', 'interactive-browser-live-latest.json'),
    requiredGates: [
      'gates.externalLiveRunPassed',
      'gates.providerIsCdpChrome',
      'gates.clickPassed',
      'gates.typePassed',
      'gates.screenshotPersisted',
      'gates.pdfPersisted'
    ]
  },
  {
    id: 'live_social_browser_archive',
    label: 'Live social browser archived evidence',
    archivePath: path.join(REPO_ROOT, 'docs', 'certifications', 'live-social-browser-latest.json'),
    requiredGates: [
      'gates.rawReportPassed',
      'gates.telegramSmokePassed',
      'gates.telegramPromptScenariosPassed',
      'gates.socialProfilesAutoSelected',
      'gates.scraplingProviderPreserved',
      'gates.connectedSharedProfilesUsed'
    ]
  },
  {
    id: 'live_github_delivery_archive',
    label: 'Live GitHub delivery archived evidence',
    archivePath: path.join(REPO_ROOT, 'docs', 'certifications', 'live-github-delivery-latest.json'),
    requiredGates: [
      'gates.gatewayReachable',
      'gates.repoCredentialsAccepted',
      'gates.issueWriteAccepted',
      'gates.kanbanDeliveryLinked',
      'gates.repairReceiptRecorded',
      'gates.trackedArchiveRedacted'
    ]
  },
  {
    id: 'live_telegram_process_archive',
    label: 'Live Telegram process archived evidence',
    archivePath: path.join(REPO_ROOT, 'docs', 'certifications', 'live-telegram-process-latest.json'),
    optionalUntilPresent: true,
    requiredGates: [
      'gates.telegramSmokeDelivered',
      'gates.runtimeCommandApplied',
      'gates.processModelCommandApplied',
      'gates.processProviderChatReady',
      'gates.processRunCompleted',
      'gates.processRuntimeUsed',
      'gates.processReplyContainedMarker',
      'gates.kanbanTaskCreatedFromTelegram',
      'gates.backlogSnapshotReturned',
      'gates.trackedArchiveRedacted'
    ]
  }
];

fs.rmSync(REPORT_DIR, { force: true, recursive: true });
const nowMs = Date.now();
const steps = [...lanes.map(runStep), ...liveEvidenceExpectations.map((expectation) => evaluateLiveEvidenceGate(expectation, nowMs))];
const status = finalStatus(steps);
const liveSteps = steps.filter((step) => step.kind === 'live');
const liveEvidenceSteps = steps.filter((step) => step.kind === 'live_evidence');
const liveEvidenceRequiredFresh = requireLiveEvidence && liveEvidenceSteps.every((step) => step.status !== 'failed');
const liveEvidencePending = liveEvidenceSteps.some((step) => step.status === 'skipped');
const report = {
  schema: 'ops.nightly-certification.v1',
  version: 1,
  generatedAt: new Date().toISOString(),
  status,
  mode: {
    dryRun,
    includeLive,
    strictLive,
    requireLiveEvidence,
    liveEvidenceMaxAgeHours
  },
  summary: {
    total: steps.length,
    deterministic: steps.filter((step) => step.kind === 'deterministic').length,
    live: liveSteps.length,
    liveEvidence: liveEvidenceSteps.length,
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
    liveEvidenceRequired: requireLiveEvidence,
    liveEvidenceMaxAgeHours,
    liveEvidenceFresh: liveEvidenceRequiredFresh,
    liveEvidencePending,
    redactedArchiveWritten: true
  },
  lanes: steps,
  redaction: {
    localReport: 'Local report keeps redacted command output previews only.',
    trackedArchive: 'Tracked archive omits command output and any live artifact payloads.'
  },
  followUpTasks: dryRun
    ? ['Run pnpm test:nightly-cert to execute deterministic lanes, or add OPS_NIGHTLY_CERT_INCLUDE_LIVE=1 for live lanes.']
    : requireLiveEvidence && liveEvidenceSteps.some((step) => step.status === 'failed')
      ? [
          'Refresh failed live evidence archives by rerunning the matching live certification and archive command.',
          'Live Telegram process is still tracked separately until provider credentials produce a passing archive.'
        ]
    : status === 'passed'
      ? includeLive
        ? liveEvidencePending
          ? [liveTelegramProcessArchiveFollowUp]
          : []
        : [
            ...(liveEvidencePending
              ? [liveTelegramProcessArchiveFollowUp]
              : []),
            'Run with OPS_NIGHTLY_CERT_INCLUDE_LIVE=1 to refresh live lanes before archived evidence reaches its max age.'
          ]
      : ['Inspect the failed or blocked lane reports under .ops/certifications and rerun pnpm test:nightly-cert.']
};

writeJson(REPORT_PATH, report);
writeJson(ARCHIVE_PATH, makeArchive(report));

if (status === 'failed' || (strictLive && status === 'blocked')) {
  console.error(`[nightly-cert] ${status}. report=${REPORT_PATH}`);
  process.exit(1);
}

console.log(`[nightly-cert] ${status}. report=${REPORT_PATH}`);
