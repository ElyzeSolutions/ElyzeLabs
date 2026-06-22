#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { redactError, redactEvidenceText } from './redaction.mjs';

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
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs.toString()}ms`);
    }
    throw error;
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
      telegramPromptScenarios: 0,
      telegramPromptPassed: 0,
      passed: 0,
      blocked: 0,
      failed: 0,
      skipped: 0
    },
    telegram: {
      enabled: flags.telegram,
      status: flags.telegram ? 'pending' : 'skipped',
      smoke: null,
      error: null,
      promptScenarios: {
        enabled: flags.telegramPrompts,
        status: flags.telegramPrompts ? 'pending' : 'skipped',
        ingressMode: flags.telegramIngressMode,
        senderId: flags.telegramSenderId,
        results: []
      }
    },
    scenarios: [],
    steps: [],
    redaction: {
      secrets: 'API tokens, cookies, storage state bodies, Telegram bot tokens, and artifact base64 payloads are never written to this report.',
      profileFields: 'Only profile id, label, site key, class, source presence, and health are recorded.',
      evidencePreviews: 'Browser artifact and terminal previews are length-limited and token/cookie patterns are redacted.'
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
    visibility: typeof profile.visibility === 'string' ? profile.visibility : null,
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
    contentPreview: typeof artifact.contentPreview === 'string' ? redactEvidenceText(artifact.contentPreview, 1000) : null,
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

function parsePayloadJson(entry) {
  if (isRecord(entry.payload)) {
    return entry.payload;
  }
  if (typeof entry.payloadJson !== 'string') {
    return {};
  }
  try {
    const parsed = JSON.parse(entry.payloadJson);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function summarizeAuthProfileResolution(timeline) {
  const events = Array.isArray(timeline) ? timeline.filter(isRecord) : [];
  const authEvent = [...events].reverse().find((event) => event.type === 'browser.auth_profile.resolved');
  if (!authEvent) {
    return null;
  }
  const payload = parsePayloadJson(authEvent);
  return {
    source: typeof payload.source === 'string' ? payload.source : null,
    reason: typeof payload.reason === 'string' ? payload.reason : null,
    siteKey: typeof payload.siteKey === 'string' ? payload.siteKey : null,
    selectedSessionProfileId:
      typeof payload.selectedSessionProfileId === 'string' ? payload.selectedSessionProfileId : null,
    selectedSessionProfileLabel:
      typeof payload.selectedSessionProfileLabel === 'string'
        ? payload.selectedSessionProfileLabel
        : typeof payload.selectedLabel === 'string'
          ? payload.selectedLabel
          : null,
    selectedSessionProfileStatus:
      typeof payload.selectedSessionProfileStatus === 'string' ? payload.selectedSessionProfileStatus : null,
    ignoredStickySessionProfileId:
      typeof payload.ignoredStickySessionProfileId === 'string' ? payload.ignoredStickySessionProfileId : null
  };
}

function summarizeTimeline(timeline) {
  const events = Array.isArray(timeline) ? timeline.filter(isRecord) : [];
  return {
    eventTypes: events.map((event) => (typeof event.type === 'string' ? event.type : 'unknown')).slice(0, 80),
    authProfileResolution: summarizeAuthProfileResolution(events)
  };
}

function summarizeBrowserTrace(trace) {
  if (!isRecord(trace)) {
    return null;
  }
  const route = isRecord(trace.route) ? trace.route : {};
  const artifacts = Array.isArray(trace.artifacts) ? trace.artifacts.filter(isRecord) : [];
  return {
    runStatus: typeof trace.runStatus === 'string' ? trace.runStatus : null,
    ok: trace.ok === true,
    provider: typeof trace.provider === 'string' ? trace.provider : null,
    transport: typeof trace.transport === 'string' ? trace.transport : null,
    healthState: typeof trace.healthState === 'string' ? trace.healthState : null,
    selectedTool: typeof trace.selectedTool === 'string' ? trace.selectedTool : null,
    attemptedTools: Array.isArray(trace.attemptedTools) ? trace.attemptedTools.map((entry) => String(entry)) : [],
    blockedReason: typeof trace.blockedReason === 'string' ? trace.blockedReason : null,
    fallbackReason: typeof trace.fallbackReason === 'string' ? trace.fallbackReason : null,
    error: typeof trace.error === 'string' ? redactEvidenceText(trace.error, 600) : null,
    promptInjectionDetected: trace.promptInjectionDetected === true,
    requiresApproval: trace.requiresApproval === true,
    route: {
      primaryTool: typeof route.primaryTool === 'string' ? route.primaryTool : null,
      riskClass: typeof route.riskClass === 'string' ? route.riskClass : null,
      requiresApproval: route.requiresApproval === true,
      urlCount: Array.isArray(route.urls) ? route.urls.length : 0
    },
    artifactCount: artifacts.length,
    artifacts: artifacts.slice(0, 3).map((artifact) => ({
      url: typeof artifact.url === 'string' ? artifact.url : null,
      tool: typeof artifact.tool === 'string' ? artifact.tool : null,
      extractionMode: typeof artifact.extractionMode === 'string' ? artifact.extractionMode : null,
      previewText: redactEvidenceText(artifact.previewText, 1000)
    }))
  };
}

function summarizeTerminalPayload(payload) {
  const run = isRecord(payload.run) ? payload.run : {};
  const terminal = isRecord(payload.terminal) ? payload.terminal : {};
  const chunks = Array.isArray(payload.chunks) ? payload.chunks.filter(isRecord) : [];
  return {
    runStatus: typeof run.status === 'string' ? run.status : null,
    resultSummary: typeof run.resultSummary === 'string' ? redactEvidenceText(run.resultSummary, 800) : null,
    error: typeof run.error === 'string' ? redactEvidenceText(run.error, 800) : null,
    terminalStatus: typeof terminal.status === 'string' ? terminal.status : null,
    chunkCount: chunks.length,
    outputPreview: redactEvidenceText(
      chunks
        .map((chunk) => (typeof chunk.chunk === 'string' ? chunk.chunk : ''))
        .join('')
        .slice(-1200),
      1200
    )
  };
}

function summarizeSessionPayload(payload) {
  const session = isRecord(payload.session) ? payload.session : {};
  const profile = isRecord(session.browserSessionProfile) ? session.browserSessionProfile : null;
  const messages = Array.isArray(payload.messages) ? payload.messages.filter(isRecord) : [];
  return {
    sessionId: typeof session.id === 'string' ? session.id : null,
    sessionKey: typeof session.sessionKey === 'string' ? session.sessionKey : null,
    channel: typeof session.channel === 'string' ? session.channel : null,
    preferredRuntime: typeof session.preferredRuntime === 'string' ? session.preferredRuntime : null,
    stickyBrowserSessionProfile: profile ? summarizeProfile(profile) : null,
    messageCount: messages.length,
    latestMessages: messages.slice(-4).map((message) => ({
      direction: typeof message.direction === 'string' ? message.direction : null,
      source: typeof message.source === 'string' ? message.source : null,
      sender: typeof message.sender === 'string' ? message.sender : null,
      contentPreview: redactEvidenceText(message.content, 800)
    }))
  };
}

function createTelegramIngressPayload({ updateId, senderId, text, username }) {
  return {
    update_id: updateId,
    message: {
      text,
      chat: { id: senderId, type: 'private' },
      from: {
        id: senderId,
        username
      },
      mentioned: true
    }
  };
}

async function waitForRunTerminalStatus(gatewayBaseUrl, headers, runId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latestPayload = null;
  while (Date.now() < deadline) {
    latestPayload = await requestJson(`${gatewayBaseUrl}/api/runs/${encodeURIComponent(runId)}/terminal`, {
      headers,
      timeoutMs: Math.min(timeoutMs, 15000)
    });
    const status = String(latestPayload?.terminal?.status ?? latestPayload?.run?.status ?? '').trim();
    if (['completed', 'failed', 'aborted'].includes(status)) {
      return latestPayload;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`run ${runId} terminal did not finish within ${timeoutMs.toString()}ms`);
}

async function waitForBrowserTrace(gatewayBaseUrl, headers, runId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latestError = null;
  while (Date.now() < deadline) {
    try {
      const payload = await requestJson(`${gatewayBaseUrl}/api/browser/history/${encodeURIComponent(runId)}`, {
        headers,
        timeoutMs: Math.min(timeoutMs, 15000)
      });
      if (isRecord(payload.trace)) {
        return payload.trace;
      }
    } catch (error) {
      latestError = error;
      const statusCode = Number(error?.statusCode);
      if (Number.isFinite(statusCode) && statusCode !== 404) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(latestError ? `browser trace unavailable: ${redactError(latestError)}` : `browser trace unavailable for ${runId}`);
}

function resolveScenarioTimeoutMs(scenario, fallbackTimeoutMs) {
  const timeoutMs = Number(scenario.timeoutMs);
  if (Number.isFinite(timeoutMs) && timeoutMs >= 5000) {
    return timeoutMs;
  }
  return fallbackTimeoutMs;
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
  const timeoutMs = resolveScenarioTimeoutMs(scenario, flags.timeoutMs);
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
          timeoutMs
        })
      );
      const verification = isRecord(payload.verification) ? payload.verification : {};
      const run = isRecord(verification.run) ? verification.run : {};
      const runStatus = typeof run.status === 'string' ? run.status : null;
      const runError = typeof run.error === 'string' ? redactEvidenceText(run.error, 800) : null;
      const resultSummary = typeof run.resultSummary === 'string' ? redactEvidenceText(run.resultSummary, 800) : null;
      result.verification = {
        summary: typeof verification.summary === 'string' ? redactEvidenceText(verification.summary, 800) : null,
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
          timeoutMs
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

async function runTelegramPromptScenarios({ report, scenarios, profiles, gatewayBaseUrl, headers, flags }) {
  if (!flags.telegramPrompts) {
    report.telegram.promptScenarios.status = 'skipped';
    return;
  }

  const results = [];
  const baseSenderId = flags.telegramSenderId;
  const username = `live_social_cert_${Date.now().toString(36)}`;

  for (const [index, scenario] of scenarios.entries()) {
    const selected = selectProfile(profiles, scenario);
    const telegramCandidates = selected.candidates.filter((candidate) => candidate.visibility !== 'session_only');
    const profile = telegramCandidates[0] ?? selected.selected;
    const timeoutMs = resolveScenarioTimeoutMs(scenario, flags.timeoutMs);
    const result = {
      id: scenario.id,
      label: scenario.label,
      siteKey: scenario.siteKey,
      verifyUrl: scenario.verifyUrl,
      status: 'skipped',
      decision: null,
      profile: profile ? summarizeProfile(profile) : null,
      candidateCount: selected.candidates.length,
      telegramVisibleCandidateCount: telegramCandidates.length,
      ingress: null,
      terminal: null,
      browserTrace: null,
      timeline: null,
      session: null,
      error: null
    };

    if (!profile) {
      result.status = 'blocked';
      result.decision = 'missing_session_profile';
      report.followUpTasks.push(`Create or import an enabled browser session profile for Telegram ${scenario.siteKey} prompts.`);
      results.push(result);
      continue;
    }

    if (profile.lastVerificationStatus !== 'connected') {
      result.status = 'blocked';
      result.decision = 'profile_not_connected_for_auto_select';
      report.followUpTasks.push(`Verify ${scenario.siteKey} profile ${profile.id} before Telegram prompt certification.`);
      results.push(result);
      continue;
    }

    if (profile.visibility === 'session_only') {
      result.status = 'blocked';
      result.decision = 'profile_not_visible_to_fresh_telegram_session';
      report.followUpTasks.push(`Use a shared browser session profile for Telegram prompt certification of ${scenario.siteKey}.`);
      results.push(result);
      continue;
    }

    const senderId = `${baseSenderId}-${String(index + 1).padStart(2, '0')}`;
    const prompt = [
      `Live certification ${scenario.id}.`,
      `${scenario.prompt}`,
      `Open ${scenario.verifyUrl} with the matching saved ${scenario.siteKey} login through Scrapling/cookies.`,
      'Infer the login automatically; do not ask for /browser use unless no matching profile is available.',
      'Reply with a short redacted status only. Do not include private feed contents, tokens, cookies, emails, or account identifiers.'
    ].join(' ');

    try {
      const ingressPath = flags.telegramIngressMode === 'webhook' ? '/api/telegram/webhook' : '/api/ingress/telegram';
      const ingressHeaders =
        flags.telegramIngressMode === 'webhook'
          ? {}
          : {
              'x-ops-telegram-mode': flags.telegramIngressMode
            };
      const ingressPayload = await recordStep(report, `telegram-prompt:${scenario.id}:ingress`, () =>
        requestJson(`${gatewayBaseUrl}${ingressPath}`, {
          method: 'POST',
          headers: ingressHeaders,
          body: createTelegramIngressPayload({
            updateId: Date.now() + index,
            senderId,
            username,
            text: prompt
          }),
          timeoutMs
        })
      );
      result.ingress = {
        status: typeof ingressPayload.status === 'string' ? ingressPayload.status : null,
        sessionId: typeof ingressPayload.sessionId === 'string' ? ingressPayload.sessionId : null,
        runId: typeof ingressPayload.runId === 'string' ? ingressPayload.runId : null,
        sessionKey: typeof ingressPayload.sessionKey === 'string' ? ingressPayload.sessionKey : null,
        delegationDecision: isRecord(ingressPayload.delegationDecision) ? ingressPayload.delegationDecision : null
      };

      if (!result.ingress.runId || !result.ingress.sessionId) {
        result.status = 'blocked';
        result.decision = result.ingress.status ? `telegram_ingress_${result.ingress.status}` : 'telegram_ingress_missing_run';
        result.error = redactEvidenceText(JSON.stringify(ingressPayload), 1000);
        results.push(result);
        continue;
      }

      const terminalPayload = await recordStep(report, `telegram-prompt:${scenario.id}:terminal`, () =>
        waitForRunTerminalStatus(gatewayBaseUrl, headers, result.ingress.runId, timeoutMs)
      );
      result.terminal = summarizeTerminalPayload(terminalPayload);

      const trace = await recordStep(report, `telegram-prompt:${scenario.id}:browser-trace`, () =>
        waitForBrowserTrace(gatewayBaseUrl, headers, result.ingress.runId, Math.min(timeoutMs, 45000))
      );
      result.browserTrace = summarizeBrowserTrace(trace);

      const timelinePayload = await recordStep(report, `telegram-prompt:${scenario.id}:timeline`, () =>
        requestJson(`${gatewayBaseUrl}/api/runs/${encodeURIComponent(result.ingress.runId)}/timeline`, {
          headers,
          timeoutMs: Math.min(timeoutMs, 15000)
        })
      );
      result.timeline = summarizeTimeline(timelinePayload.timeline);

      const sessionPayload = await recordStep(report, `telegram-prompt:${scenario.id}:session`, () =>
        requestJson(`${gatewayBaseUrl}/api/sessions/${encodeURIComponent(result.ingress.sessionId)}`, {
          headers,
          timeoutMs: Math.min(timeoutMs, 15000)
        })
      );
      result.session = summarizeSessionPayload(sessionPayload);

      const terminalStatus = result.terminal?.terminalStatus ?? result.terminal?.runStatus;
      const authResolution = result.timeline?.authProfileResolution;
      const selectedProfileId = authResolution?.selectedSessionProfileId ?? null;
      if (selectedProfileId !== profile.id) {
        result.status = 'failed';
        result.decision = 'telegram_prompt_browser_profile_mismatch';
        result.error = `Expected auto-selected profile ${profile.id}, got ${selectedProfileId ?? 'none'}.`;
      } else if (result.browserTrace?.ok && terminalStatus === 'completed') {
        result.status = 'passed';
        result.decision = authResolution?.source === 'auto_site' ? 'telegram_prompt_auto_selected_profile' : `telegram_prompt_profile_${authResolution?.source ?? 'selected'}`;
      } else if (result.browserTrace?.blockedReason === 'dynamic_render_required') {
        result.status = 'blocked';
        result.decision = 'scrapling_requires_interactive_fallback';
        report.followUpTasks.push(`Run ${scenario.siteKey} through the interactive fallback lane; Scrapling reached a dynamic-render barrier.`);
      } else {
        result.status = 'failed';
        result.decision = 'telegram_prompt_browser_trace_failed';
        result.error = result.browserTrace?.error ?? result.terminal?.error ?? result.terminal?.resultSummary ?? 'Telegram prompt did not complete with browser evidence.';
      }
    } catch (error) {
      result.status = scenarioStatusFromError(error);
      result.decision = 'telegram_prompt_failed';
      result.error = redactError(error);
    }
    results.push(result);
  }

  report.telegram.promptScenarios.results = results;
  if (results.some((result) => result.status === 'failed')) {
    report.telegram.promptScenarios.status = 'failed';
  } else if (results.some((result) => result.status === 'blocked')) {
    report.telegram.promptScenarios.status = 'blocked';
  } else if (results.some((result) => result.status === 'passed')) {
    report.telegram.promptScenarios.status = 'passed';
  } else {
    report.telegram.promptScenarios.status = 'skipped';
  }
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
  report.summary.telegramPromptScenarios = report.telegram.promptScenarios.results.length;
  report.summary.telegramPromptPassed = report.telegram.promptScenarios.results.filter((scenario) => scenario.status === 'passed').length;
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
  if (report.telegram.promptScenarios.enabled) {
    scenarioStatuses.push(report.telegram.promptScenarios.status);
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

function markPendingLiveSectionsSkipped(report) {
  if (report.telegram.status === 'pending') {
    report.telegram.status = 'skipped';
  }
  if (report.telegram.promptScenarios.status === 'pending') {
    report.telegram.promptScenarios.status = 'skipped';
  }
}

async function main() {
  const config = readControlPlaneConfig();
  const manifestPath = process.env.OPS_LIVE_SCENARIO_MANIFEST?.trim()
    ? path.resolve(process.env.OPS_LIVE_SCENARIO_MANIFEST.trim())
    : DEFAULT_MANIFEST_PATH;
  const gatewayBaseUrl = resolveGatewayBaseUrl(config);
  const telegramConfig = isRecord(config.channel) && isRecord(config.channel.telegram) ? config.channel.telegram : {};
  const telegramIngressModeInput = process.env.OPS_LIVE_SCENARIO_TELEGRAM_MODE?.trim().toLowerCase();
  const telegramIngressMode =
    telegramIngressModeInput === 'webhook' || telegramIngressModeInput === 'ingress'
      ? telegramIngressModeInput
      : telegramConfig.useWebhook === true
        ? 'webhook'
        : 'ingress';
  const telegramSenderId =
    process.env.OPS_LIVE_SCENARIO_TELEGRAM_SENDER_ID?.trim() || `live-cert-${Date.now().toString(36)}`;
  const flags = {
    enabled: envFlag('OPS_RUN_LIVE_SOCIAL_BROWSER_CERT'),
    strict: envFlag('OPS_LIVE_SCENARIO_STRICT'),
    verify: envFlag('OPS_LIVE_SCENARIO_VERIFY'),
    interactive: envFlag('OPS_LIVE_SCENARIO_INTERACTIVE'),
    telegram: envFlag('OPS_LIVE_SCENARIO_TELEGRAM'),
    telegramPrompts: envFlag('OPS_LIVE_SCENARIO_TELEGRAM_PROMPTS'),
    telegramIngressMode,
    telegramSenderId,
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
    markPendingLiveSectionsSkipped(report);
    writeReport(report);
    console.log(`live social browser certification skipped; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
    return 0;
  }

  const apiToken = resolveApiToken(config);
  if (!apiToken) {
    report.followUpTasks.push('Set OPS_API_TOKEN or OPS_LIVE_SCENARIO_API_TOKEN before running live certification.');
    markPendingLiveSectionsSkipped(report);
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
    markPendingLiveSectionsSkipped(report);
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
    markPendingLiveSectionsSkipped(report);
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

  await runTelegramPromptScenarios({ report, scenarios, profiles, gatewayBaseUrl, headers, flags });
  await runTelegramSmoke({ report, gatewayBaseUrl, headers, flags });
  updateSummary(report, profiles);
  finalizeStatus(report);
  writeReport(report);
  console.log(`live social browser certification ${report.status}; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
  return flags.strict && (report.status === 'failed' || report.status === 'blocked') ? 1 : 0;
}

const exitCode = await main();
process.exitCode = exitCode;
