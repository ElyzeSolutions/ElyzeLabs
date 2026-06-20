#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, 'config/control-plane.yaml');
const DEFAULT_MANIFEST_PATH = path.join(SCRIPT_DIR, 'scenarios/live-social-browser.json');
const REPORT_DIR = path.join(REPO_ROOT, '.ops/certifications/live-social-browser');
const REPORT_PATH = path.join(REPORT_DIR, 'certification-report.json');

const PROFILE_HEALTH_RANK = new Map([
  ['healthy', 0],
  ['stale', 1],
  ['unverified', 2],
  ['expires_soon', 3],
  ['needs_reconnect', 4],
  ['disabled', 5]
]);

const truthyValues = new Set(['1', 'true', 'yes', 'y', 'on']);
const falsyValues = new Set(['0', 'false', 'no', 'n', 'off']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (truthyValues.has(normalized)) {
    return true;
  }
  if (falsyValues.has(normalized)) {
    return false;
  }
  return fallback;
}

function envList(name) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function readDotenvValue(name) {
  const dotenvPath = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(dotenvPath)) {
    return null;
  }
  const lines = fs.readFileSync(dotenvPath, 'utf8').split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    if (key !== name) {
      continue;
    }
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value.length > 0 ? value : null;
  }
  return null;
}

function readControlPlaneConfig(configPath = DEFAULT_CONFIG_PATH) {
  try {
    return readJsonFile(configPath);
  } catch {
    return {};
  }
}

function resolveApiToken(config) {
  const candidates = [
    process.env.OPS_LIVE_SCENARIO_API_TOKEN,
    process.env.BROWSER_API_TOKEN,
    process.env.OPS_API_TOKEN,
    readDotenvValue('OPS_API_TOKEN'),
    isRecord(config.server) ? config.server.apiToken : null
  ];
  for (const candidate of candidates) {
    const token = typeof candidate === 'string' ? candidate.trim() : '';
    if (token.length > 0 && !token.includes('change-me')) {
      return token;
    }
  }
  return null;
}

function resolveGatewayBaseUrl(config) {
  const explicit =
    process.env.OPS_LIVE_SCENARIO_BASE_URL?.trim() ||
    process.env.OPS_GATEWAY_BASE_URL?.trim() ||
    process.env.BROWSER_GATEWAY_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/u, '');
  }
  const server = isRecord(config.server) ? config.server : {};
  const hostValue = typeof server.host === 'string' && server.host.trim() ? server.host.trim() : '127.0.0.1';
  const host = hostValue === '0.0.0.0' ? '127.0.0.1' : hostValue;
  const port = Number.isFinite(Number(server.port)) ? Number(server.port) : 8788;
  return `http://${host}:${port.toString()}`;
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    'x-api-token': token,
    'x-ops-role': 'admin'
  };
}

function redactError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gu, 'Bearer [redacted]')
    .replace(/bot[0-9]+:[A-Za-z0-9_-]+/gu, 'bot[redacted]');
}

async function requestJson(url, { method = 'GET', headers = {}, body, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const raw = await response.text();
    let payload = {};
    if (raw.trim().length > 0) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { raw: raw.slice(0, 500) };
      }
    }
    if (!response.ok) {
      const message = isRecord(payload) && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
      const error = new Error(message);
      error.statusCode = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function makeReport(flags, manifestPath, gatewayBaseUrl) {
  return {
    schema: 'ops.live-social-browser-certification.v1',
    version: 1,
    generatedAt: new Date().toISOString(),
    status: 'skipped',
    strict: flags.strict,
    gatewayBaseUrl,
    manifestPath: path.relative(REPO_ROOT, manifestPath),
    flags,
    summary: {
      scenariosTotal: 0,
      scenariosSelected: 0,
      profilesAvailable: 0,
      profilesMatched: 0,
      passed: 0,
      blocked: 0,
      failed: 0,
      skipped: 0
    },
    telegram: {
      enabled: flags.telegram,
      status: flags.telegram ? 'pending' : 'skipped',
      smoke: null,
      error: null
    },
    scenarios: [],
    steps: [],
    redaction: {
      secrets: 'API tokens, cookies, storage state bodies, Telegram bot tokens, and artifact base64 payloads are never written to this report.',
      profileFields: 'Only profile id, label, site key, class, source presence, and health are recorded.'
    },
    followUpTasks: []
  };
}

async function recordStep(report, id, run) {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  try {
    const output = await run();
    report.steps.push({
      id,
      status: 'passed',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs
    });
    return output;
  } catch (error) {
    report.steps.push({
      id,
      status: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      error: redactError(error)
    });
    throw error;
  }
}

function writeReport(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

function profileHealthRank(profile) {
  const state = isRecord(profile.health) && typeof profile.health.state === 'string' ? profile.health.state : 'unverified';
  return PROFILE_HEALTH_RANK.get(state) ?? 9;
}

function normalizeDomain(value) {
  return value.toLowerCase().replace(/^www\./u, '');
}

function profileMatchesScenario(profile, scenario) {
  const siteKey = typeof profile.siteKey === 'string' ? profile.siteKey.toLowerCase() : null;
  const scenarioSiteKey = typeof scenario.siteKey === 'string' ? scenario.siteKey.toLowerCase() : '';
  if (siteKey && scenarioSiteKey && siteKey === scenarioSiteKey) {
    return true;
  }
  const domains = Array.isArray(profile.domains) ? profile.domains.map((entry) => normalizeDomain(String(entry))) : [];
  const scenarioDomains = Array.isArray(scenario.domains)
    ? scenario.domains.map((entry) => normalizeDomain(String(entry)))
    : [];
  if (
    domains.some((domain) =>
      scenarioDomains.some((scenarioDomain) => domain === scenarioDomain || domain.endsWith(`.${scenarioDomain}`))
    )
  ) {
    return true;
  }
  const label = typeof profile.label === 'string' ? profile.label.toLowerCase() : '';
  return Boolean(scenarioSiteKey && label.includes(scenarioSiteKey));
}

function summarizeProfile(profile) {
  const health = isRecord(profile.health) ? profile.health : {};
  return {
    id: typeof profile.id === 'string' ? profile.id : 'unknown',
    label: typeof profile.label === 'string' ? profile.label : 'Untitled profile',
    siteKey: typeof profile.siteKey === 'string' ? profile.siteKey : null,
    profileClass: typeof profile.profileClass === 'string' ? profile.profileClass : null,
    browserKind: typeof profile.browserKind === 'string' ? profile.browserKind : null,
    useRealChrome: profile.useRealChrome === true,
    hasCookieJar: typeof profile.cookieJarId === 'string' && profile.cookieJarId.length > 0,
    hasStorageState: typeof profile.storageStateId === 'string' && profile.storageStateId.length > 0,
    hasCdpEndpoint: typeof profile.cdpEndpoint === 'string' && profile.cdpEndpoint.length > 0,
    enabled: profile.enabled === true,
    lastVerifiedAt: typeof profile.lastVerifiedAt === 'string' ? profile.lastVerifiedAt : null,
    lastVerificationStatus:
      typeof profile.lastVerificationStatus === 'string' ? profile.lastVerificationStatus : 'unknown',
    health: {
      state: typeof health.state === 'string' ? health.state : 'unverified',
      summary: typeof health.summary === 'string' ? health.summary : null,
      needsReconnect: health.needsReconnect === true
    }
  };
}

function selectProfile(profiles, scenario) {
  const candidates = profiles
    .filter((profile) => isRecord(profile) && profile.enabled === true && profileMatchesScenario(profile, scenario))
    .sort((left, right) => {
      const rank = profileHealthRank(left) - profileHealthRank(right);
      if (rank !== 0) {
        return rank;
      }
      const leftVerified = typeof left.lastVerifiedAt === 'string' ? Date.parse(left.lastVerifiedAt) : 0;
      const rightVerified = typeof right.lastVerifiedAt === 'string' ? Date.parse(right.lastVerifiedAt) : 0;
      return rightVerified - leftVerified;
    });
  return {
    selected: candidates[0] ?? null,
    candidates
  };
}

function summarizeArtifacts(control) {
  if (!isRecord(control) || !Array.isArray(control.artifacts)) {
    return [];
  }
  return control.artifacts.map((artifact) => ({
    id: typeof artifact.id === 'string' ? artifact.id : null,
    kind: typeof artifact.kind === 'string' ? artifact.kind : null,
    mimeType: typeof artifact.mimeType === 'string' ? artifact.mimeType : null,
    sizeBytes: Number.isFinite(Number(artifact.sizeBytes)) ? Number(artifact.sizeBytes) : null,
    contentPreview: typeof artifact.contentPreview === 'string' ? artifact.contentPreview.slice(0, 1000) : null,
    hasBase64Content: typeof artifact.contentBase64 === 'string' && artifact.contentBase64.length > 0
  }));
}

function summarizeInteractiveControl(control) {
  if (!isRecord(control)) {
    return null;
  }
  return {
    provider: typeof control.provider === 'string' ? control.provider : null,
    ok: control.ok === true,
    startedUrl: typeof control.startedUrl === 'string' ? control.startedUrl : null,
    finalUrl: typeof control.finalUrl === 'string' ? control.finalUrl : null,
    actionCount: Array.isArray(control.actions) ? control.actions.length : 0,
    artifactCount: Array.isArray(control.artifacts) ? control.artifacts.length : 0,
    artifacts: summarizeArtifacts(control),
    error: typeof control.error === 'string' ? control.error : null
  };
}

function scenarioStatusFromError(error) {
  const statusCode = Number(error?.statusCode);
  if (statusCode === 401 || statusCode === 403 || statusCode === 404 || statusCode === 409) {
    return 'blocked';
  }
  return 'failed';
}

async function runScenario({ report, scenario, profiles, gatewayBaseUrl, headers, flags }) {
  const selected = selectProfile(profiles, scenario);
  const result = {
    id: scenario.id,
    label: scenario.label,
    siteKey: scenario.siteKey,
    verifyUrl: scenario.verifyUrl,
    status: 'skipped',
    profile: selected.selected ? summarizeProfile(selected.selected) : null,
    candidateCount: selected.candidates.length,
    verification: null,
    interactive: null,
    decision: null,
    error: null
  };

  if (!selected.selected) {
    result.decision = 'missing_session_profile';
    report.followUpTasks.push(`Create or import an enabled browser session profile for ${scenario.siteKey}.`);
    return result;
  }

  const profile = selected.selected;
  const healthState = isRecord(profile.health) && typeof profile.health.state === 'string' ? profile.health.state : 'unverified';
  if (healthState === 'disabled' || (healthState === 'needs_reconnect' && !flags.verify)) {
    result.status = 'blocked';
    result.decision = 'profile_needs_reconnect';
    report.followUpTasks.push(`Reconnect or re-verify ${scenario.siteKey} profile ${profile.id}.`);
    return result;
  }

  result.status = 'passed';
  result.decision =
    flags.verify && healthState === 'needs_reconnect'
      ? 'profile_selected_reverify_requested'
      : flags.verify
        ? 'profile_selected_verify_requested'
        : 'profile_selected';

  if (flags.verify) {
    try {
      const payload = await recordStep(report, `verify:${scenario.id}`, () =>
        requestJson(`${gatewayBaseUrl}/api/browser/session-profiles/${encodeURIComponent(profile.id)}/verify`, {
          method: 'POST',
          headers,
          body: {
            verifyUrl: scenario.verifyUrl
          },
          timeoutMs: flags.timeoutMs
        })
      );
      const verification = isRecord(payload.verification) ? payload.verification : {};
      const run = isRecord(verification.run) ? verification.run : {};
      const runStatus = typeof run.status === 'string' ? run.status : null;
      const runError = typeof run.error === 'string' ? run.error : null;
      const resultSummary = typeof run.resultSummary === 'string' ? run.resultSummary : null;
      result.verification = {
        summary: typeof verification.summary === 'string' ? verification.summary : null,
        hasTrace: isRecord(verification.trace),
        runStatus,
        runError,
        resultSummary
      };
      if (runStatus && runStatus !== 'completed') {
        result.status = 'failed';
        result.error = runError ?? resultSummary ?? `verification run status ${runStatus}`;
        result.decision = 'profile_verification_run_failed';
        return result;
      }
    } catch (error) {
      result.status = scenarioStatusFromError(error);
      result.error = redactError(error);
      result.decision = 'profile_verification_failed';
      return result;
    }
  }

  if (flags.interactive) {
    try {
      const payload = await recordStep(report, `interactive:${scenario.id}`, () =>
        requestJson(`${gatewayBaseUrl}/api/browser/interactive/run`, {
          method: 'POST',
          headers,
          body: {
            siteKey: scenario.siteKey,
            url: scenario.verifyUrl,
            prompt: scenario.prompt,
            sessionProfileId: profile.id,
            actions: [
              { type: 'wait', timeoutMs: 2500 },
              { type: 'read' }
            ],
            previewChars: 1200
          },
          timeoutMs: flags.timeoutMs
        })
      );
      result.interactive = summarizeInteractiveControl(payload.control);
      if (!result.interactive?.ok) {
        result.status = 'failed';
        result.decision = 'interactive_read_failed';
      }
    } catch (error) {
      result.status = scenarioStatusFromError(error);
      result.error = redactError(error);
      result.decision = 'interactive_read_failed';
      return result;
    }
  }

  return result;
}

async function runTelegramSmoke({ report, gatewayBaseUrl, headers, flags }) {
  if (!flags.telegram) {
    report.telegram.status = 'skipped';
    return;
  }
  try {
    const body = {
      sendMessage: true,
      text: `ElyzeLabs live social browser certification at ${new Date().toISOString()}.`
    };
    if (flags.telegramChatId) {
      body.chatId = flags.telegramChatId;
    }
    if (flags.telegramTopicId) {
      body.topicId = flags.telegramTopicId;
    }
    const payload = await recordStep(report, 'telegram:smoke-test', () =>
      requestJson(`${gatewayBaseUrl}/api/telegram/smoke-test`, {
        method: 'POST',
        headers,
        body,
        timeoutMs: flags.timeoutMs
      })
    );
    const smoke = isRecord(payload.smoke) ? payload.smoke : {};
    report.telegram.smoke = smoke;
    report.telegram.status =
      smoke.overall === 'ok' ? 'passed' : smoke.overall === 'failed' ? 'failed' : 'blocked';
  } catch (error) {
    report.telegram.status = scenarioStatusFromError(error);
    report.telegram.error = redactError(error);
  }
}

function updateSummary(report, profiles) {
  report.summary.profilesAvailable = profiles.length;
  report.summary.profilesMatched = report.scenarios.filter((scenario) => scenario.profile).length;
  report.summary.passed = report.scenarios.filter((scenario) => scenario.status === 'passed').length;
  report.summary.blocked = report.scenarios.filter((scenario) => scenario.status === 'blocked').length;
  report.summary.failed = report.scenarios.filter((scenario) => scenario.status === 'failed').length;
  report.summary.skipped = report.scenarios.filter((scenario) => scenario.status === 'skipped').length;
}

function finalizeStatus(report) {
  const scenarioStatuses = report.scenarios.map((scenario) => scenario.status);
  if (report.telegram.enabled) {
    scenarioStatuses.push(report.telegram.status);
  }
  if (scenarioStatuses.includes('failed')) {
    report.status = 'failed';
  } else if (scenarioStatuses.includes('blocked')) {
    report.status = 'blocked';
  } else if (scenarioStatuses.includes('passed')) {
    report.status = 'passed';
  } else {
    report.status = 'skipped';
  }
}

async function main() {
  const config = readControlPlaneConfig();
  const manifestPath = process.env.OPS_LIVE_SCENARIO_MANIFEST?.trim()
    ? path.resolve(process.env.OPS_LIVE_SCENARIO_MANIFEST.trim())
    : DEFAULT_MANIFEST_PATH;
  const gatewayBaseUrl = resolveGatewayBaseUrl(config);
  const flags = {
    enabled: envFlag('OPS_RUN_LIVE_SOCIAL_BROWSER_CERT'),
    strict: envFlag('OPS_LIVE_SCENARIO_STRICT'),
    verify: envFlag('OPS_LIVE_SCENARIO_VERIFY'),
    interactive: envFlag('OPS_LIVE_SCENARIO_INTERACTIVE'),
    telegram: envFlag('OPS_LIVE_SCENARIO_TELEGRAM'),
    siteFilter: envList('OPS_LIVE_SCENARIO_SITES'),
    telegramChatId: process.env.OPS_LIVE_SCENARIO_TELEGRAM_CHAT_ID?.trim() || null,
    telegramTopicId: process.env.OPS_LIVE_SCENARIO_TELEGRAM_TOPIC_ID?.trim() || null,
    timeoutMs: Number.isFinite(Number(process.env.OPS_LIVE_SCENARIO_TIMEOUT_MS))
      ? Math.max(5000, Number(process.env.OPS_LIVE_SCENARIO_TIMEOUT_MS))
      : 30000
  };
  const report = makeReport(flags, manifestPath, gatewayBaseUrl);

  if (!flags.enabled) {
    report.followUpTasks.push('Set OPS_RUN_LIVE_SOCIAL_BROWSER_CERT=1 to run live local certification.');
    writeReport(report);
    console.log(`live social browser certification skipped; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
    return 0;
  }

  const apiToken = resolveApiToken(config);
  if (!apiToken) {
    report.followUpTasks.push('Set OPS_API_TOKEN or OPS_LIVE_SCENARIO_API_TOKEN before running live certification.');
    writeReport(report);
    console.log(`live social browser certification skipped without API token; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
    return flags.strict ? 1 : 0;
  }

  const headers = authHeaders(apiToken);
  let manifest;
  try {
    manifest = await recordStep(report, 'manifest:load', () => Promise.resolve(readJsonFile(manifestPath)));
  } catch (error) {
    report.status = 'failed';
    report.followUpTasks.push('Fix the live social browser scenario manifest JSON.');
    writeReport(report);
    console.error(`live social browser certification failed: ${redactError(error)}`);
    return flags.strict ? 1 : 0;
  }

  const allScenarios = Array.isArray(manifest.scenarios) ? manifest.scenarios.filter(isRecord) : [];
  const scenarios = flags.siteFilter.length
    ? allScenarios.filter((scenario) => flags.siteFilter.includes(String(scenario.siteKey ?? '').toLowerCase()))
    : allScenarios;
  report.summary.scenariosTotal = allScenarios.length;
  report.summary.scenariosSelected = scenarios.length;

  let vault;
  try {
    await recordStep(report, 'gateway:readiness', () =>
      requestJson(`${gatewayBaseUrl}/api/health/readiness`, {
        headers,
        timeoutMs: 5000
      })
    );
    vault = await recordStep(report, 'browser:session-vault', () =>
      requestJson(`${gatewayBaseUrl}/api/browser/session-vault`, {
        headers,
        timeoutMs: flags.timeoutMs
      })
    );
  } catch (error) {
    report.status = 'skipped';
    report.followUpTasks.push('Start the gateway before running live certification.');
    report.followUpTasks.push('Use pnpm dev:gateway or pnpm start:gateway, then rerun with OPS_RUN_LIVE_SOCIAL_BROWSER_CERT=1.');
    writeReport(report);
    console.log(`live social browser certification skipped; gateway unavailable: ${redactError(error)}`);
    return flags.strict ? 1 : 0;
  }

  const profiles = Array.isArray(vault.sessionProfiles) ? vault.sessionProfiles.filter(isRecord) : [];
  report.scenarios = [];
  for (const scenario of scenarios) {
    const result = await runScenario({
      report,
      scenario,
      profiles,
      gatewayBaseUrl,
      headers,
      flags
    });
    report.scenarios.push(result);
  }

  await runTelegramSmoke({ report, gatewayBaseUrl, headers, flags });
  updateSummary(report, profiles);
  finalizeStatus(report);
  writeReport(report);
  console.log(`live social browser certification ${report.status}; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
  return flags.strict && (report.status === 'failed' || report.status === 'blocked') ? 1 : 0;
}

const exitCode = await main();
process.exitCode = exitCode;
