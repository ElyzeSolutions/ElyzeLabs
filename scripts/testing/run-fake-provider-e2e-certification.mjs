#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const REPORT_DIR = path.join(REPO_ROOT, '.ops', 'certifications', 'fake-provider-e2e');
const REPORT_PATH = path.join(REPORT_DIR, 'certification-report.json');
const ARCHIVE_PATH = path.join(REPO_ROOT, 'docs', 'certifications', 'fake-provider-e2e-latest.json');
const SCENARIO_PATH = path.join(REPO_ROOT, 'scripts', 'testing', 'scenarios', 'fake-provider-e2e.json');
const TEST_PATH = 'packages/gateway/test/integration/fake-provider-e2e.test.ts';

const truthyValues = new Set(['1', 'true', 'yes', 'y', 'on']);

function envFlag(name) {
  const value = process.env[name];
  return typeof value === 'string' && truthyValues.has(value.trim().toLowerCase());
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function redactOutput(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gu, 'Bearer [redacted]')
    .replace(/(?:GOOGLE|OPENROUTER|OPS_GOOGLE|OPS_OPENROUTER)_API_KEY[^\s]*/gu, '[redacted_api_key]')
    .replace(/integration-(?:google|openrouter)-key/gu, '[redacted_api_key]')
    .replace(/sk-[A-Za-z0-9_-]+/gu, 'sk-[redacted]');
}

function runVitestStep() {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.config.ts', TEST_PATH], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 30 * 1024 * 1024
  });
  const output = redactOutput(`${result.stdout ?? ''}${result.stderr ?? ''}`.trim());
  return {
    id: 'fake_provider_e2e_vitest',
    label: 'Fake OpenAI-compatible provider E2E scenarios',
    command: `pnpm exec vitest run --config vitest.config.ts ${TEST_PATH}`,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status ?? 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    output: output.slice(0, 25000)
  };
}

function buildScenarioSummaries(registry, passed) {
  const scenarios = Array.isArray(registry.scenarios) ? registry.scenarios : [];
  return scenarios.map((scenario) => ({
    id: typeof scenario.id === 'string' ? scenario.id : 'unknown',
    provider: typeof scenario.provider === 'string' ? scenario.provider : 'unknown',
    model: typeof scenario.model === 'string' ? scenario.model : null,
    status: passed ? 'passed' : 'failed',
    claims: Array.isArray(scenario.claims) ? scenario.claims.filter((claim) => typeof claim === 'string') : [],
    evidence: [TEST_PATH]
  }));
}

function makeReport(registry, step) {
  const passed = step.status === 'passed';
  const scenarios = buildScenarioSummaries(registry, passed);
  return {
    schema: 'ops.fake-provider-e2e-certification.v1',
    version: 1,
    generatedAt: new Date().toISOString(),
    status: passed ? 'passed' : 'failed',
    registry: {
      path: path.relative(REPO_ROOT, SCENARIO_PATH),
      schema: typeof registry.schema === 'string' ? registry.schema : null,
      scenarioCount: scenarios.length
    },
    summary: passed
      ? 'Fake OpenAI-compatible provider E2E is certified for provider-specific tool-call quirks, tool-result reply formatting, redacted archives, and configured fallback recovery.'
      : 'Fake provider E2E certification failed; inspect the local report output.',
    gates: {
      scenarioRegistryLoaded: scenarios.length >= 2,
      googleToolCallNormalized: passed,
      toolResultReplyFormatted: passed,
      providerFallbackRecovered: passed,
      trackedArchiveRedacted: true
    },
    scenarios,
    redaction: {
      localReport: 'Local report keeps a redacted Vitest output preview only.',
      trackedArchive:
        'Tracked archive omits provider HTTP payload contents, API keys, bearer tokens, and full test logs.'
    },
    steps: [step],
    followUpTasks: passed
      ? []
      : ['Inspect packages/gateway/test/integration/fake-provider-e2e.test.ts and rerun pnpm test:fake-provider-e2e:cert.']
  };
}

function makeArchive(report) {
  return {
    schema: 'ops.fake-provider-e2e-certification-archive.v1',
    version: 1,
    archivedAt: new Date().toISOString(),
    sourceReport: {
      path: path.relative(REPO_ROOT, REPORT_PATH),
      schema: report.schema,
      generatedAt: report.generatedAt
    },
    status: report.status,
    registry: report.registry,
    summary: report.summary,
    gates: report.gates,
    scenarios: report.scenarios,
    command: `pnpm test:fake-provider-e2e:cert`,
    evidence: [
      TEST_PATH,
      path.relative(REPO_ROOT, SCENARIO_PATH),
      'scripts/testing/run-fake-provider-e2e-certification.mjs'
    ],
    redaction: report.redaction,
    followUpTasks: report.followUpTasks
  };
}

function maybeWriteArchive(report) {
  if (report.status !== 'passed' && fs.existsSync(ARCHIVE_PATH) && !envFlag('OPS_FAKE_PROVIDER_E2E_ARCHIVE_ALLOW_FAILED')) {
    const existing = readJson(ARCHIVE_PATH);
    if (existing.status === 'passed') {
      return;
    }
  }
  writeJson(ARCHIVE_PATH, makeArchive(report));
}

const registry = readJson(SCENARIO_PATH);
fs.rmSync(REPORT_DIR, { force: true, recursive: true });
const step = runVitestStep();
const report = makeReport(registry, step);
writeJson(REPORT_PATH, report);
maybeWriteArchive(report);

if (report.status !== 'passed') {
  console.error(`[fake-provider-e2e-cert] failed. report=${REPORT_PATH}`);
  console.error(step.output);
  process.exit(1);
}

console.log(`[fake-provider-e2e-cert] passed. report=${REPORT_PATH}`);
