#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_INPUT_PATH = path.join(REPO_ROOT, '.ops/certifications/live-social-browser/certification-report.json');
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, 'docs/certifications/live-social-browser-latest.json');
const EXPECTED_SOCIAL_SITES = ['instagram', 'tiktok', 'pinterest', 'x', 'reddit'];
const truthyValues = new Set(['1', 'true', 'yes', 'y', 'on']);

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

function summarizePromptResult(result) {
  const profile = isRecord(result.profile) ? result.profile : {};
  const trace = isRecord(result.browserTrace) ? result.browserTrace : {};
  const terminal = isRecord(result.terminal) ? result.terminal : {};
  const timeline = isRecord(result.timeline) ? result.timeline : {};
  const auth = isRecord(timeline.authProfileResolution) ? timeline.authProfileResolution : {};
  return {
    id: readString(result.id),
    siteKey: readString(result.siteKey) ?? readString(profile.siteKey),
    status: readStatus(result.status),
    decision: readString(result.decision),
    profile: {
      visibility: readString(profile.visibility),
      verificationStatus: readString(profile.lastVerificationStatus),
      healthState: isRecord(profile.health) ? readString(profile.health.state) : null
    },
    browser: {
      ok: trace.ok === true,
      provider: readString(trace.provider),
      transport: readString(trace.transport),
      selectedTool: readString(trace.selectedTool),
      blockedReason: readString(trace.blockedReason),
      fallbackReason: readString(trace.fallbackReason)
    },
    terminal: {
      runStatus: readString(terminal.runStatus),
      terminalStatus: readString(terminal.terminalStatus)
    },
    authProfileResolution: {
      source: readString(auth.source),
      reason: readString(auth.reason),
      siteKey: readString(auth.siteKey),
      selectedSessionProfileStatus: readString(auth.selectedSessionProfileStatus)
    }
  };
}

function summarizeScenario(result) {
  const verification = isRecord(result.verification) ? result.verification : {};
  return {
    id: readString(result.id),
    siteKey: readString(result.siteKey),
    status: readStatus(result.status),
    decision: readString(result.decision),
    profileMatched: isRecord(result.profile),
    verification: {
      runStatus: readString(verification.runStatus),
      hasTrace: verification.hasTrace === true
    }
  };
}

function buildGates(report, promptResults) {
  const promptSites = new Map(promptResults.map((result) => [result.siteKey, result]));
  const expectedSiteResults = EXPECTED_SOCIAL_SITES.map((siteKey) => promptSites.get(siteKey) ?? null);
  const promptsPassed = expectedSiteResults.every((result) => result?.status === 'passed');
  const autoSelected = expectedSiteResults.every((result) => result?.authProfileResolution.source === 'auto_site');
  const scraplingFirst = expectedSiteResults.every((result) => result?.browser.provider === 'scrapling');
  const connectedProfiles = expectedSiteResults.every(
    (result) =>
      result?.profile.visibility === 'shared' &&
      result?.profile.verificationStatus === 'connected' &&
      result?.authProfileResolution.selectedSessionProfileStatus === 'connected'
  );
  const telegramSmoke = isRecord(report.telegram?.smoke) ? report.telegram.smoke : {};
  return {
    rawReportPassed: report.status === 'passed',
    telegramSmokePassed:
      report.telegram?.status === 'passed' &&
      telegramSmoke.overall === 'ok' &&
      telegramSmoke.identity?.status === 'ok' &&
      telegramSmoke.delivery?.status === 'ok',
    telegramPromptScenariosPassed: report.telegram?.promptScenarios?.status === 'passed' && promptsPassed,
    socialProfilesAutoSelected: autoSelected,
    scraplingProviderPreserved: scraplingFirst,
    connectedSharedProfilesUsed: connectedProfiles
  };
}

function allGatesPassed(gates) {
  return Object.values(gates).every((value) => value === true);
}

function makeArchive(report, inputPath, outputPath) {
  const promptResults = Array.isArray(report.telegram?.promptScenarios?.results)
    ? report.telegram.promptScenarios.results.filter(isRecord).map(summarizePromptResult)
    : [];
  const scenarioResults = Array.isArray(report.scenarios)
    ? report.scenarios.filter(isRecord).map(summarizeScenario)
    : [];
  const telegramSmoke = isRecord(report.telegram?.smoke) ? report.telegram.smoke : {};
  const gates = buildGates(report, promptResults);
  return {
    schema: 'ops.live-social-browser-certification-archive.v1',
    version: 1,
    archivedAt: new Date().toISOString(),
    sourceReport: {
      path: path.relative(REPO_ROOT, inputPath),
      schema: readString(report.schema),
      generatedAt: readString(report.generatedAt)
    },
    status: allGatesPassed(gates) ? 'passed' : 'failed',
    gates,
    command: [
      'OPS_RUN_LIVE_SOCIAL_BROWSER_CERT=1',
      'OPS_LIVE_SCENARIO_TELEGRAM=1',
      'OPS_LIVE_SCENARIO_TELEGRAM_PROMPTS=1',
      'OPS_LIVE_SCENARIO_SITES=instagram,tiktok,pinterest,x,reddit',
      'OPS_LIVE_SCENARIO_TIMEOUT_MS=120000',
      'pnpm test:live-social-browser'
    ].join(' '),
    summary: {
      scenariosTotal: Number(report.summary?.scenariosTotal ?? 0),
      scenariosSelected: Number(report.summary?.scenariosSelected ?? 0),
      profilesAvailable: Number(report.summary?.profilesAvailable ?? 0),
      profilesMatched: Number(report.summary?.profilesMatched ?? 0),
      telegramPromptScenarios: Number(report.summary?.telegramPromptScenarios ?? 0),
      telegramPromptPassed: Number(report.summary?.telegramPromptPassed ?? 0),
      passed: Number(report.summary?.passed ?? 0),
      blocked: Number(report.summary?.blocked ?? 0),
      failed: Number(report.summary?.failed ?? 0),
      skipped: Number(report.summary?.skipped ?? 0)
    },
    telegram: {
      status: readStatus(report.telegram?.status),
      smoke: {
        overall: readString(telegramSmoke.overall),
        identity: readString(telegramSmoke.identity?.status),
        delivery: readString(telegramSmoke.delivery?.status),
        targetSource: readString(telegramSmoke.target?.source)
      },
      promptScenarios: {
        status: readStatus(report.telegram?.promptScenarios?.status),
        ingressMode: readString(report.telegram?.promptScenarios?.ingressMode),
        results: promptResults
      }
    },
    scenarios: scenarioResults,
    redaction: {
      omitted:
        'Profile ids, profile labels, chat ids, sender ids, cookies, tokens, storage state, terminal text, artifact previews, base64 payloads, and social-site content are intentionally omitted.',
      outputPath: path.relative(REPO_ROOT, outputPath)
    },
    followUpTasks: Array.isArray(report.followUpTasks)
      ? report.followUpTasks.filter((task) => typeof task === 'string')
      : []
  };
}

function main() {
  const inputPath = resolvePath(process.env.OPS_LIVE_SOCIAL_BROWSER_ARCHIVE_INPUT, DEFAULT_INPUT_PATH);
  const outputPath = resolvePath(process.env.OPS_LIVE_SOCIAL_BROWSER_ARCHIVE_OUTPUT, DEFAULT_OUTPUT_PATH);
  if (!fs.existsSync(inputPath)) {
    console.error(`live social browser certification report not found: ${path.relative(REPO_ROOT, inputPath)}`);
    return 1;
  }
  const report = readJson(inputPath);
  const archive = makeArchive(report, inputPath, outputPath);
  if (archive.status !== 'passed' && fs.existsSync(outputPath) && !envFlag('OPS_LIVE_SOCIAL_BROWSER_ARCHIVE_ALLOW_FAILED')) {
    const existing = readJson(outputPath);
    if (existing.status === 'passed') {
      console.error(
        `refusing to overwrite passed live social browser archive with ${archive.status}; set OPS_LIVE_SOCIAL_BROWSER_ARCHIVE_ALLOW_FAILED=1 to keep a failed archive`
      );
      return 1;
    }
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(archive, null, 2)}\n`);
  console.log(`live social browser archive ${archive.status}; wrote ${path.relative(REPO_ROOT, outputPath)}`);
  return archive.status === 'passed' ? 0 : 1;
}

process.exitCode = main();
