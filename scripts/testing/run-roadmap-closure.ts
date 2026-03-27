#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { buildFrontierComparatorClosure, runFrontierComparatorHarness } from '../../packages/gateway/src/frontier-comparator.js';
import { createDefaultFrontierScorecard } from '../../packages/gateway/src/frontier-scorecard.js';
import { buildGithubComparativeEvidence } from '../../packages/gateway/src/github-delivery-comparator.js';

type LaneStatus = 'ready' | 'blocked';

interface CommandStepResult {
  lane: string;
  label: string;
  command: string;
  status: 'passed' | 'failed';
  exitCode: number;
  output: string;
}

function runStep(lane: string, label: string, command: string, args: string[]): CommandStepResult {
  console.log(`Roadmap closure: ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  return {
    lane,
    label,
    command: [command, ...args].join(' '),
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  };
}

function normalizeLaneStatus(passed: boolean): LaneStatus {
  return passed ? 'ready' : 'blocked';
}

const browserScheduleStep = runStep('browser_schedule', 'browser + schedule certification lane', 'node', [
  'scripts/testing/run-browser-schedule-certification.mjs'
]);

const runtimeStep = runStep('runtime', 'runtime certification lane', 'pnpm', [
  'exec',
  'vitest',
  'run',
  '--config',
  'vitest.config.ts',
  'packages/gateway/test/integration/runtime-certification.test.ts'
]);

const continuityStep = runStep('continuity', 'continuity certification lane', 'pnpm', [
  'exec',
  'vitest',
  'run',
  '--config',
  'vitest.config.ts',
  'packages/gateway/test/integration/continuity-certification.test.ts',
  'tests/integration/continuity-certification.test.ts'
]);

const architectureStep = runStep('architecture', 'architecture authority lane', 'pnpm', [
  'exec',
  'vitest',
  'run',
  '--config',
  'vitest.config.ts',
  'packages/gateway/test/integration/architecture-authority.test.ts'
]);

const githubApiStep = runStep('github_delivery', 'github comparative evidence api contract', 'pnpm', [
  'exec',
  'vitest',
  'run',
  '--config',
  'vitest.config.ts',
  'packages/gateway/test/integration/github-comparative-evidence.test.ts'
]);

const frontierScorecard = createDefaultFrontierScorecard(process.cwd());
const frontierRun = runFrontierComparatorHarness({
  baseDir: process.cwd(),
  scorecard: frontierScorecard
});
const frontierClosure = buildFrontierComparatorClosure({
  scorecard: frontierScorecard,
  run: frontierRun
});
const frontierReady =
  frontierClosure.followUpTasks.length === 0 &&
  frontierClosure.summary.remainingGaps.length === 0;

const githubEvidence = buildGithubComparativeEvidence(process.cwd());
const githubReady =
  githubApiStep.status === 'passed' &&
  githubEvidence.releaseGate.readyForBestInClassClaim === true &&
  githubEvidence.followUpTasks.length === 0;

const browserScheduleReportPath = path.join(
  process.cwd(),
  '.ops',
  'certifications',
  'browser-schedule',
  'certification-report.json'
);
const browserScheduleReport = fs.existsSync(browserScheduleReportPath)
  ? JSON.parse(fs.readFileSync(browserScheduleReportPath, 'utf8'))
  : null;

const lanes = [
  {
    id: 'browser_schedule',
    status: normalizeLaneStatus(
      browserScheduleStep.status === 'passed' && browserScheduleReport?.status === 'passed'
    ),
    evidence: [browserScheduleReportPath],
    summary:
      browserScheduleReport?.status === 'passed'
        ? ['Browser Ops, API, CLI, and Schedules dashboard flow passed with a closure report.']
        : ['Browser schedule certification report missing or failed.']
  },
  {
    id: 'runtime',
    status: normalizeLaneStatus(runtimeStep.status === 'passed'),
    evidence: ['packages/gateway/test/integration/runtime-certification.test.ts'],
    summary: [
      runtimeStep.status === 'passed'
        ? 'Shim-vs-live runtime certification passed.'
        : 'Runtime certification failed.'
    ]
  },
  {
    id: 'continuity',
    status: normalizeLaneStatus(continuityStep.status === 'passed'),
    evidence: [
      'packages/gateway/test/integration/continuity-certification.test.ts',
      'tests/integration/continuity-certification.test.ts'
    ],
    summary: [
      continuityStep.status === 'passed'
        ? 'Comparator-backed continuity certification passed.'
        : 'Continuity certification failed.'
    ]
  },
  {
    id: 'architecture',
    status: normalizeLaneStatus(architectureStep.status === 'passed'),
    evidence: ['packages/gateway/test/integration/architecture-authority.test.ts'],
    summary: [
      architectureStep.status === 'passed'
        ? 'Architecture authority certification passed.'
        : 'Architecture authority certification failed.'
    ]
  },
  {
    id: 'frontier_comparator',
    status: normalizeLaneStatus(frontierReady),
    evidence: ['packages/gateway/src/frontier-comparator.ts'],
    summary: frontierReady
      ? ['Frontier comparator closure has no remaining gaps or follow-up tasks.']
      : [
          ...frontierClosure.summary.remainingGaps,
          ...frontierClosure.followUpTasks.map((task) => task.description)
        ]
  },
  {
    id: 'github_delivery',
    status: normalizeLaneStatus(githubReady),
    evidence: [
      'packages/gateway/test/integration/github-comparative-evidence.test.ts',
      'packages/gateway/src/github-delivery-comparator.ts'
    ],
    summary: githubReady
      ? ['GitHub comparative evidence release gate is ready for a best-in-class claim.']
      : [...githubEvidence.releaseGate.reasons, ...githubEvidence.followUpTasks.map((task) => task.description)]
  }
];

const comparatorCoverage = {
  baseline_alpha: ['runtime', 'continuity', 'architecture', 'frontier_comparator'],
  baseline_beta: ['continuity', 'frontier_comparator'],
  baseline_gamma: ['continuity', 'frontier_comparator'],
  baseline_delta: ['continuity', 'frontier_comparator'],
  paperclip: ['runtime', 'architecture', 'browser_schedule', 'github_delivery', 'frontier_comparator'],
  mission_control: ['runtime', 'architecture', 'browser_schedule'],
  symphony: ['github_delivery']
};

const steps = [
  browserScheduleStep,
  runtimeStep,
  continuityStep,
  architectureStep,
  githubApiStep
];
const blockedLanes = lanes.filter((lane) => lane.status !== 'ready');

const report = {
  schema: 'ops.roadmap-closure.v1',
  version: 1,
  generatedAt: new Date().toISOString(),
  status: blockedLanes.length === 0 ? 'ready' : 'blocked',
  lanes,
  comparatorCoverage,
  comparatorArtifacts: {
    frontier: {
      schema: frontierClosure.schema,
      wins: frontierClosure.summary.wins,
      remainingGaps: frontierClosure.summary.remainingGaps,
      missingReferences: frontierClosure.summary.missingReferences,
      legacyJsonDecision: frontierClosure.legacyJsonDecision.mode
    },
    githubDelivery: {
      schema: githubEvidence.run.schema,
      releaseGate: githubEvidence.releaseGate,
      summary: githubEvidence.summary
    }
  },
  blockedReasons: blockedLanes.flatMap((lane) => lane.summary),
  steps
};

const reportDir = path.join(process.cwd(), '.ops', 'certifications', 'roadmap');
const reportPath = path.join(reportDir, 'closure-report.json');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (blockedLanes.length > 0) {
  console.error(`Roadmap closure blocked. report=${reportPath}`);
  for (const lane of blockedLanes) {
    console.error(`\n[${lane.id}] ${lane.summary.join('\n')}`);
  }
  process.exit(1);
}

console.log(`Roadmap closure ready. report=${reportPath}`);
