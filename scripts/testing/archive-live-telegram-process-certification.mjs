#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_INPUT_PATH = path.join(REPO_ROOT, '.ops/certifications/live-telegram-process/certification-report.json');
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, 'docs/certifications/live-telegram-process-latest.json');
const truthyValues = new Set(['1', 'true', 'yes', 'y', 'on']);
const REQUIRED_GATES = [
  'telegramSmokeDelivered',
  'runtimeCommandApplied',
  'processModelCommandApplied',
  'processProviderChatReady',
  'processRunCompleted',
  'processRuntimeUsed',
  'processReplyContainedMarker',
  'processReplyWithinLatencySlo',
  'kanbanTaskCreatedFromTelegram',
  'backlogSnapshotReturned',
  'endToEndWithinLatencySlo',
  'trackedArchiveRedacted'
];

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function envFlag(name) {
  const raw = process.env[name];
  return typeof raw === 'string' && truthyValues.has(raw.trim().toLowerCase());
}

function readString(value) {
  return typeof value === 'string' ? value : null;
}

function readStatus(value) {
  return readString(value) ?? 'unknown';
}

function resolvePath(input, fallback) {
  const raw = input?.trim();
  if (!raw) {
    return fallback;
  }
  return path.isAbsolute(raw) ? raw : path.join(REPO_ROOT, raw);
}

function summarizeScenario(scenario) {
  return {
    id: readString(scenario.id),
    label: readString(scenario.label),
    status: readStatus(scenario.status)
  };
}

function summarizeProcessModelSelection(selection) {
  const failureSummary = isRecord(selection.failureSummary) ? selection.failureSummary : {};
  return {
    candidateCount: Number(selection.candidateCount ?? 0),
    selectedProvider: readString(selection.selectedProvider),
    selectedModel: readString(selection.selectedModel),
    explicitModelRequested: selection.explicitModelRequested === true,
    rawModelStoredInTrackedArchive: false,
    routingPreflight: isRecord(selection.routingPreflight)
      ? {
          enabled: selection.routingPreflight.enabled === true,
          endpoint: readString(selection.routingPreflight.endpoint)
        }
      : null,
    failureSummary: {
      attempted: Number(failureSummary.attempted ?? 0),
      byReason: isRecord(failureSummary.byReason) ? failureSummary.byReason : {},
      recommendations: Array.isArray(failureSummary.recommendations)
        ? failureSummary.recommendations.filter((entry) => typeof entry === 'string')
        : []
    }
  };
}

function summarizeLatency(latency) {
  const thresholds = isRecord(latency.thresholds) ? latency.thresholds : {};
  const observations = Array.isArray(latency.observations)
    ? latency.observations.filter(isRecord).map((observation) => ({
        id: readString(observation.id),
        observedMs: Number(observation.observedMs ?? 0),
        maxMs: Number(observation.maxMs ?? 0),
        status: readStatus(observation.status)
      }))
    : [];
  return {
    status: readStatus(latency.status),
    thresholds: {
      processReplyMaxMs: Number(thresholds.processReplyMaxMs ?? 0),
      endToEndMaxMs: Number(thresholds.endToEndMaxMs ?? 0)
    },
    observations
  };
}

function buildGates(report) {
  const gates = isRecord(report.gates) ? report.gates : {};
  return Object.fromEntries(REQUIRED_GATES.map((gate) => [gate, gates[gate] === true]));
}

function allGatesPassed(gates) {
  return Object.values(gates).every((value) => value === true);
}

function makeArchive(report, inputPath, outputPath) {
  const gates = buildGates(report);
  const target = isRecord(report.target) ? report.target : {};
  const marker = isRecord(report.marker) ? report.marker : {};
  return {
    schema: 'ops.live-telegram-process-certification-archive.v1',
    version: 1,
    archivedAt: new Date().toISOString(),
    sourceReport: {
      path: path.relative(REPO_ROOT, inputPath),
      schema: readString(report.schema),
      generatedAt: readString(report.generatedAt)
    },
    status: report.status === 'passed' && allGatesPassed(gates) ? 'passed' : 'failed',
    registry: isRecord(report.registry)
      ? {
          path: readString(report.registry.path),
          schema: readString(report.registry.schema),
          scenarioCount: Number(report.registry.scenarioCount ?? 0)
        }
      : null,
    marker: {
      hash: readString(marker.hash),
      rawStoredInTrackedArchive: false
    },
    target: {
      configured: target.configured === true,
      topicConfigured: target.topicConfigured === true,
      rawIdentifiersStored: false
    },
    processModelSelection: summarizeProcessModelSelection(
      isRecord(report.processModelSelection) ? report.processModelSelection : {}
    ),
    latency: summarizeLatency(isRecord(report.latency) ? report.latency : {}),
    summary: {
      scenariosTotal: Number(report.summary?.scenariosTotal ?? 0),
      passed: Number(report.summary?.passed ?? 0),
      failed: Number(report.summary?.failed ?? 0),
      blocked: Number(report.summary?.blocked ?? 0),
      skipped: Number(report.summary?.skipped ?? 0)
    },
    gates,
    scenarios: Array.isArray(report.scenarios) ? report.scenarios.filter(isRecord).map(summarizeScenario) : [],
    command: 'OPS_RUN_LIVE_TELEGRAM_PROCESS_CERT=1 pnpm test:live-telegram-process',
    evidence: [
      'scripts/testing/run-live-telegram-process-certification.mjs',
      'scripts/testing/scenarios/live-telegram-process.json',
      'docs/runbooks/chat-process-runtime-certification.md'
    ],
    redaction: {
      omitted:
        'Telegram chat ids, sender ids, raw prompts, message bodies, bot tokens, API tokens, provider outputs, cookies, storage state, terminal text, and raw model credential material are intentionally omitted.',
      outputPath: path.relative(REPO_ROOT, outputPath)
    },
    followUpTasks: Array.isArray(report.followUpTasks)
      ? report.followUpTasks.filter((entry) => typeof entry === 'string')
      : []
  };
}

function main() {
  const inputPath = resolvePath(process.env.OPS_LIVE_TELEGRAM_PROCESS_ARCHIVE_INPUT, DEFAULT_INPUT_PATH);
  const outputPath = resolvePath(process.env.OPS_LIVE_TELEGRAM_PROCESS_ARCHIVE_OUTPUT, DEFAULT_OUTPUT_PATH);
  if (!fs.existsSync(inputPath)) {
    console.error(`live Telegram process certification report not found: ${path.relative(REPO_ROOT, inputPath)}`);
    return 1;
  }
  const report = readJson(inputPath);
  const archive = makeArchive(report, inputPath, outputPath);
  if (archive.status !== 'passed' && fs.existsSync(outputPath) && !envFlag('OPS_LIVE_TELEGRAM_PROCESS_ARCHIVE_ALLOW_FAILED')) {
    const existing = readJson(outputPath);
    if (existing.status === 'passed') {
      console.error(
        `refusing to overwrite passed live Telegram process archive with ${archive.status}; set OPS_LIVE_TELEGRAM_PROCESS_ARCHIVE_ALLOW_FAILED=1 to keep a failed archive`
      );
      return 1;
    }
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(archive, null, 2)}\n`);
  console.log(`live Telegram process archive ${archive.status}; wrote ${path.relative(REPO_ROOT, outputPath)}`);
  return archive.status === 'passed' ? 0 : 1;
}

process.exitCode = main();
