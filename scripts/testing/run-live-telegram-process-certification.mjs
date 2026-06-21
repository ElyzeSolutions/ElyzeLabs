#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, 'config/control-plane.yaml');
const SCENARIO_PATH = path.join(SCRIPT_DIR, 'scenarios/live-telegram-process.json');
const REPORT_DIR = path.join(REPO_ROOT, '.ops/certifications/live-telegram-process');
const REPORT_PATH = path.join(REPORT_DIR, 'certification-report.json');
const ARCHIVE_PATH = path.join(REPO_ROOT, 'docs/certifications/live-telegram-process-latest.json');
const DEFAULT_PROCESS_MODEL_CANDIDATES = [
  'openrouter/openai/gpt-5-mini',
  'openrouter/openai/gpt-4.1-mini',
  'openrouter/google/gemini-2.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-lite-latest'
];

const truthyValues = new Set(['1', 'true', 'yes', 'y', 'on']);
const falsyValues = new Set(['0', 'false', 'no', 'n', 'off']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function positiveNumberEnv(name, fallback, minimum) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(minimum, parsed);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
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
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolveApiToken(config) {
  const candidates = [
    process.env.OPS_LIVE_TELEGRAM_PROCESS_API_TOKEN,
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
    process.env.OPS_LIVE_TELEGRAM_PROCESS_BASE_URL?.trim() ||
    process.env.OPS_GATEWAY_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/u, '');
  }
  const server = isRecord(config.server) ? config.server : {};
  const hostValue = typeof server.host === 'string' && server.host.trim() ? server.host.trim() : '127.0.0.1';
  const host = hostValue === '0.0.0.0' ? '127.0.0.1' : hostValue;
  const port = Number.isFinite(Number(server.port)) ? Number(server.port) : 8788;
  return `http://${host}:${port.toString()}`;
}

function resolveTelegramTarget() {
  const target =
    process.env.OPS_LIVE_TELEGRAM_PROCESS_TARGET?.trim() ||
    process.env.OPS_LIVE_TELEGRAM_PROCESS_CHAT_ID?.trim() ||
    process.env.TELEGRAM_CHAT_ID?.trim() ||
    readDotenvValue('TELEGRAM_CHAT_ID');
  if (!target) {
    return null;
  }
  const topic =
    process.env.OPS_LIVE_TELEGRAM_PROCESS_TOPIC_ID?.trim() ||
    process.env.TELEGRAM_TOPIC_ID?.trim() ||
    readDotenvValue('TELEGRAM_TOPIC_ID');
  const chatType =
    process.env.OPS_LIVE_TELEGRAM_PROCESS_CHAT_TYPE?.trim() ||
    (target.startsWith('-') ? 'supergroup' : 'private');
  const sender =
    process.env.OPS_LIVE_TELEGRAM_PROCESS_SENDER_ID?.trim() ||
    (target.startsWith('-') ? `live-cert-${crypto.randomBytes(3).toString('hex')}` : target);
  const username = process.env.OPS_LIVE_TELEGRAM_PROCESS_USERNAME?.trim() || 'elyze_live_cert';
  return {
    target,
    topic: topic || null,
    chatType,
    sender,
    username
  };
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    'x-api-token': token,
    'x-ops-role': 'admin'
  };
}

function redactText(value, limit = 1200) {
  return String(value ?? '')
    .slice(0, limit)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gu, 'Bearer [redacted]')
    .replace(/bot[0-9]+:[A-Za-z0-9_-]+/gu, 'bot[redacted]')
    .replace(/\b(cookie|set-cookie|authorization)\s*:\s*[^\n\r]+/giu, '$1: [redacted]')
    .replace(
      /\b([A-Za-z0-9_.-]*(?:token|secret|session|sid|csrf|auth|cookie)[A-Za-z0-9_.-]*)\s*=\s*[^;\s\n\r]+/giu,
      '$1=[redacted]'
    );
}

function redactError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return redactText(message, 1200);
}

function hashValue(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return null;
  }
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function splitModelList(value) {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function resolveProcessModelCandidates() {
  const explicit = process.env.OPS_LIVE_TELEGRAM_PROCESS_MODEL?.trim();
  const configuredCandidates = splitModelList(process.env.OPS_LIVE_TELEGRAM_PROCESS_MODEL_CANDIDATES);
  if (explicit) {
    return uniqueStrings([explicit, ...configuredCandidates]);
  }
  return uniqueStrings([...configuredCandidates, ...DEFAULT_PROCESS_MODEL_CANDIDATES]);
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

async function recordStep(report, id, run) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  try {
    const result = await run();
    report.steps.push({
      id,
      status: 'passed',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs
    });
    return result;
  } catch (error) {
    report.steps.push({
      id,
      status: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      error: redactError(error)
    });
    throw error;
  }
}

function recordLatencyObservation(report, id, observedMs, maxMs) {
  const passed = Number.isFinite(observedMs) && observedMs <= maxMs;
  report.latency.observations.push({
    id,
    observedMs,
    maxMs,
    status: passed ? 'passed' : 'failed'
  });
  return passed;
}

function finalizeLatencyStatus(report) {
  const requiredObservationIds = ['telegram_process_code_reply', 'live_telegram_process_e2e'];
  report.latency.status = requiredObservationIds.every((id) =>
    report.latency.observations.some((observation) => observation.id === id && observation.status === 'passed')
  )
    ? 'passed'
    : 'failed';
}

function createTelegramPayload({ target, updateId, text }) {
  return {
    update_id: updateId,
    message: {
      text,
      chat: {
        id: target.target,
        type: target.chatType
      },
      from: {
        id: target.sender,
        username: target.username
      },
      message_thread_id: target.topic ? Number(target.topic) : undefined,
      mentioned: true
    }
  };
}

function summarizeIngress(payload) {
  const delegationDecision = isRecord(payload.delegationDecision) ? payload.delegationDecision : null;
  return {
    status: typeof payload.status === 'string' ? payload.status : null,
    reason: typeof payload.reason === 'string' ? payload.reason : null,
    command: typeof payload.command === 'string' ? payload.command : null,
    runRef: hashValue(typeof payload.runId === 'string' ? payload.runId : ''),
    sessionRef: hashValue(typeof payload.sessionId === 'string' ? payload.sessionId : ''),
    sessionKeyRef: hashValue(typeof payload.sessionKey === 'string' ? payload.sessionKey : ''),
    hasRun: typeof payload.runId === 'string' && payload.runId.length > 0,
    hasSession: typeof payload.sessionId === 'string' && payload.sessionId.length > 0,
    delegationDecision: delegationDecision
      ? {
          action: typeof delegationDecision.action === 'string' ? delegationDecision.action : null,
          reason: typeof delegationDecision.reason === 'string' ? delegationDecision.reason : null,
          confidence: Number.isFinite(Number(delegationDecision.confidence)) ? Number(delegationDecision.confidence) : null
        }
      : null,
    itemRef: hashValue(typeof payload.itemId === 'string' ? payload.itemId : ''),
    state: typeof payload.state === 'string' ? payload.state : null
  };
}

function summarizeSmoke(smoke) {
  if (!isRecord(smoke)) {
    return {
      overall: 'failed',
      identity: 'missing',
      delivery: 'missing',
      targetConfigured: false,
      topicConfigured: false
    };
  }
  const identity = isRecord(smoke.identity) ? smoke.identity : {};
  const delivery = isRecord(smoke.delivery) ? smoke.delivery : {};
  const target = isRecord(smoke.target) ? smoke.target : {};
  return {
    overall: typeof smoke.overall === 'string' ? smoke.overall : null,
    tokenConfigured: smoke.botTokenConfigured === true,
    tokenShapeValid: smoke.botTokenLooksValid === true,
    identity: typeof identity.status === 'string' ? identity.status : null,
    delivery: typeof delivery.status === 'string' ? delivery.status : null,
    targetSource: typeof target.source === 'string' ? target.source : null,
    targetConfigured: target.chatIdConfigured === true,
    topicConfigured: target.topicIdConfigured === true,
    messageRef: hashValue(isRecord(delivery.result) && typeof delivery.result.messageId === 'string' ? delivery.result.messageId : '')
  };
}

function summarizeProcessChatLiveCheck(payload) {
  const live = isRecord(payload.live) ? payload.live : {};
  const providers = isRecord(live.providers) ? live.providers : {};
  const processChat = isRecord(providers.processChat) ? providers.processChat : {};
  return {
    overall: typeof live.overall === 'string' ? live.overall : null,
    status: typeof processChat.status === 'string' ? processChat.status : null,
    configured: processChat.configured === true,
    tested: processChat.tested === true,
    ok: typeof processChat.ok === 'boolean' ? processChat.ok : null,
    provider: typeof processChat.provider === 'string' ? processChat.provider : null,
    model: typeof processChat.model === 'string' ? processChat.model : null,
    latencyMs: Number.isFinite(Number(processChat.latencyMs)) ? Number(processChat.latencyMs) : null,
    detail: typeof processChat.detail === 'string' ? redactText(processChat.detail, 500) : null
  };
}

function summarizeEffectiveRouting(payload) {
  const routes = Array.isArray(payload.routes) ? payload.routes.filter(isRecord) : [];
  const firstRoute = routes[0] ?? {};
  const selected = isRecord(firstRoute.selected) ? firstRoute.selected : null;
  const checks = Array.isArray(firstRoute.checks) ? firstRoute.checks.filter(isRecord) : [];
  return {
    available: routes.length > 0,
    reason: typeof firstRoute.reason === 'string' ? firstRoute.reason : null,
    requestedModel: typeof firstRoute.requestedModel === 'string' ? firstRoute.requestedModel : null,
    selected: selected !== null,
    selectedProvider: selected && typeof selected.provider === 'string' ? selected.provider : null,
    selectedModel: selected && typeof selected.model === 'string' ? selected.model : null,
    selectedProfileId: selected && typeof selected.authProfileId === 'string' ? selected.authProfileId : null,
    checks: checks.slice(0, 8).map((check) => ({
      model: typeof check.model === 'string' ? check.model : null,
      provider: typeof check.provider === 'string' ? check.provider : null,
      authProfileId: typeof check.authProfileId === 'string' ? check.authProfileId : null,
      eligible: typeof check.eligible === 'boolean' ? check.eligible : null,
      reason: typeof check.reason === 'string' ? check.reason : null
    }))
  };
}

function classifyProcessProviderFailure(attempt) {
  const fields = [
    attempt?.status,
    attempt?.detail,
    attempt?.routing?.available === false ? 'routing unavailable' : '',
    attempt?.routing?.selected === false ? 'no selected route' : '',
    ...(Array.isArray(attempt?.routing?.checks)
      ? attempt.routing.checks.flatMap((check) => [check.reason, check.provider, check.authProfileId])
      : [])
  ];
  const text = fields
    .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    .join(' ')
    .toLowerCase();

  if (text.includes('provider_auth_profile_cooldown') || text.includes('cooldown')) {
    return 'provider_profile_cooldown';
  }
  if (text.includes('billing') || text.includes('quota') || text.includes('insufficient') || text.includes('credit')) {
    return 'provider_billing_or_quota';
  }
  if (
    text.includes('user not found') ||
    text.includes('expired') ||
    text.includes('invalid api key') ||
    text.includes('invalid key') ||
    text.includes('unauthorized') ||
    text.includes('forbidden') ||
    text.includes('401') ||
    text.includes('403')
  ) {
    return 'provider_auth_invalid';
  }
  if (text.includes('rate limit') || text.includes('rate_limit') || text.includes('429')) {
    return 'provider_rate_limited';
  }
  if (text.includes('no selected route') || text.includes('not configured') || text.includes('missing credential')) {
    return 'provider_profile_ineligible';
  }
  if (
    text.includes('invalid_model_config') ||
    text.includes('invalid model config') ||
    text.includes('model not found') ||
    text.includes('unsupported model') ||
    text.includes('model unavailable')
  ) {
    return 'model_unavailable';
  }
  if (text.includes('timed out') || text.includes('timeout') || text.includes('fetch failed') || text.includes('econn')) {
    return 'provider_network';
  }
  if (text.includes('routing unavailable')) {
    return 'routing_preflight_unavailable';
  }
  return 'provider_live_check_failed';
}

function remediationForProcessFailure(reasonCode) {
  if (reasonCode === 'provider_auth_invalid') {
    return 'Rotate or replace the provider credential, then rerun the live Telegram process lane.';
  }
  if (reasonCode === 'provider_billing_or_quota') {
    return 'Enable billing, raise quota, or put a funded provider-backed model first in OPS_LIVE_TELEGRAM_PROCESS_MODEL_CANDIDATES.';
  }
  if (reasonCode === 'provider_profile_cooldown') {
    return 'Clear or wait out the LLM auth-profile cooldown before using this candidate.';
  }
  if (reasonCode === 'provider_rate_limited') {
    return 'Wait for the provider rate limit window or move a different provider-backed candidate earlier.';
  }
  if (reasonCode === 'provider_profile_ineligible') {
    return 'Configure an eligible auth profile for this provider/model or remove the candidate from the live certification list.';
  }
  if (reasonCode === 'model_unavailable') {
    return 'Replace the unavailable or invalid model config with a currently supported provider-backed process model.';
  }
  if (reasonCode === 'provider_network') {
    return 'Check gateway network egress and provider reachability, then rerun the live lane.';
  }
  if (reasonCode === 'routing_preflight_unavailable') {
    return 'Check /api/llm/routing/effective and LLM routing policy before rerunning the live lane.';
  }
  return 'Inspect the redacted candidate detail and rerun with OPS_LIVE_TELEGRAM_PROCESS_MODEL set to a known-good provider-backed model.';
}

function normalizeModelForCompare(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function requestedCandidatePreflightFailure(routing, candidate) {
  if (!isRecord(routing)) {
    return null;
  }
  const candidateKey = normalizeModelForCompare(candidate);
  const selectedModel = normalizeModelForCompare(routing.selectedModel);
  const requestedCheck = Array.isArray(routing.checks)
    ? routing.checks.find((check) => normalizeModelForCompare(check.model) === candidateKey)
    : null;
  if (requestedCheck && requestedCheck.eligible === false) {
    const reason = typeof requestedCheck.reason === 'string' ? requestedCheck.reason : 'requested_model_ineligible';
    return `Requested process model is not eligible before live generation: ${reason}.`;
  }
  if (routing.reason === 'invalid_model_config') {
    return 'Requested process model has invalid model config before live generation.';
  }
  if (selectedModel && selectedModel !== candidateKey) {
    return `Routing selected ${routing.selectedModel} instead of requested ${candidate}.`;
  }
  return null;
}

function summarizeProcessModelAttempts(attempts) {
  const byReason = {};
  const recommendations = [];
  for (const attempt of attempts) {
    const reasonCode = typeof attempt.reasonCode === 'string' ? attempt.reasonCode : classifyProcessProviderFailure(attempt);
    byReason[reasonCode] = (byReason[reasonCode] ?? 0) + 1;
    const recommendation = remediationForProcessFailure(reasonCode);
    if (!recommendations.includes(recommendation)) {
      recommendations.push(recommendation);
    }
  }
  return {
    attempted: attempts.length,
    byReason,
    recommendations
  };
}

async function checkEffectiveProcessRoute({ gatewayBaseUrl, headers, processModel, timeoutMs }) {
  const query = new URLSearchParams({
    runtime: 'process',
    model: processModel
  });
  return requestJson(`${gatewayBaseUrl}/api/llm/routing/effective?${query.toString()}`, {
    headers,
    timeoutMs: Math.min(timeoutMs, 15000)
  });
}

async function waitForRun(gatewayBaseUrl, headers, runId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await requestJson(`${gatewayBaseUrl}/api/runs/${encodeURIComponent(runId)}`, {
      headers,
      timeoutMs: Math.min(timeoutMs, 15000)
    });
    const run = isRecord(latest.run) ? latest.run : {};
    const status = typeof run.status === 'string' ? run.status : '';
    if (['completed', 'failed', 'aborted'].includes(status)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`run ${hashValue(runId) ?? 'unknown'} did not finish within ${timeoutMs.toString()}ms`);
}

async function waitForMessagePredicate(gatewayBaseUrl, headers, sessionId, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latestMessages = [];
  while (Date.now() < deadline) {
    const payload = await requestJson(`${gatewayBaseUrl}/api/messages?sessionId=${encodeURIComponent(sessionId)}`, {
      headers,
      timeoutMs: Math.min(timeoutMs, 15000)
    });
    latestMessages = Array.isArray(payload.messages) ? payload.messages.filter(isRecord) : [];
    const match = latestMessages.find(predicate);
    if (match) {
      return {
        match,
        messages: latestMessages
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return {
    match: null,
    messages: latestMessages
  };
}

function parseMessageMetadata(message) {
  if (!isRecord(message)) {
    return {};
  }
  if (isRecord(message.metadata)) {
    return message.metadata;
  }
  if (typeof message.metadataJson !== 'string') {
    return {};
  }
  try {
    const parsed = JSON.parse(message.metadataJson);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function summarizeMessages(messages, marker) {
  const outbound = messages.filter((message) => message.direction === 'outbound');
  const markerMessages = outbound.filter((message) => typeof message.content === 'string' && message.content.includes(marker));
  return {
    total: messages.length,
    outbound: outbound.length,
    markerSeen: markerMessages.length > 0,
    commandReplies: outbound
      .map(parseMessageMetadata)
      .map((metadata) => (typeof metadata.command === 'string' ? metadata.command : null))
      .filter(Boolean)
      .slice(-8)
  };
}

function summarizeRun(payload) {
  const run = isRecord(payload.run) ? payload.run : {};
  const lifecycle = isRecord(payload.lifecycle) ? payload.lifecycle : {};
  return {
    runRef: hashValue(typeof run.id === 'string' ? run.id : ''),
    sessionRef: hashValue(typeof run.sessionId === 'string' ? run.sessionId : ''),
    status: typeof run.status === 'string' ? run.status : null,
    runtime: typeof run.runtime === 'string' ? run.runtime : null,
    requestedRuntime: typeof run.requestedRuntime === 'string' ? run.requestedRuntime : null,
    effectiveRuntime: typeof run.effectiveRuntime === 'string' ? run.effectiveRuntime : null,
    requestedModel: typeof run.requestedModel === 'string' ? run.requestedModel : null,
    effectiveModel: typeof run.effectiveModel === 'string' ? run.effectiveModel : null,
    triggerSource: typeof run.triggerSource === 'string' ? run.triggerSource : null,
    lifecycleHealth: typeof lifecycle.health === 'string' ? lifecycle.health : null,
    executionPathRuntime:
      isRecord(payload.executionPath) && typeof payload.executionPath.runtime === 'string'
        ? payload.executionPath.runtime
        : null,
    timelineTypes: Array.isArray(payload.timeline)
      ? payload.timeline
          .filter(isRecord)
          .map((entry) => (typeof entry.type === 'string' ? entry.type : null))
          .filter(Boolean)
          .slice(0, 80)
      : []
  };
}

function summarizeBacklogItem(item) {
  if (!isRecord(item)) {
    return null;
  }
  return {
    itemRef: hashValue(typeof item.id === 'string' ? item.id : ''),
    state: typeof item.state === 'string' ? item.state : null,
    source: typeof item.source === 'string' ? item.source : null,
    projectId: typeof item.projectId === 'string' ? item.projectId : null,
    assignedAgentId: typeof item.assignedAgentId === 'string' ? item.assignedAgentId : null,
    labelCount: Array.isArray(item.labels) ? item.labels.length : 0,
    originChannel: typeof item.originChannel === 'string' ? item.originChannel : null
  };
}

function makeReport({ flags, registry, gatewayBaseUrl, marker }) {
  return {
    schema: 'ops.live-telegram-process-certification.v1',
    version: 1,
    generatedAt: new Date().toISOString(),
    status: flags.enabled ? 'pending' : 'skipped',
    strict: flags.strict,
    gatewayBaseUrl,
    registry: {
      path: path.relative(REPO_ROOT, SCENARIO_PATH),
      schema: typeof registry.schema === 'string' ? registry.schema : null,
      scenarioCount: Array.isArray(registry.scenarios) ? registry.scenarios.length : 0
    },
    marker: {
      hash: hashValue(marker),
      rawStoredInTrackedArchive: false
    },
    target: {
      configured: flags.targetConfigured,
      topicConfigured: flags.topicConfigured,
      rawIdentifiersStored: false
    },
    processModelSelection: {
      candidateCount: flags.processModelCandidates.length,
      selectedProvider: null,
      selectedModel: null,
      explicitModelRequested: flags.explicitProcessModelRequested,
      rawModelStoredInTrackedArchive: false,
      routingPreflight: {
        enabled: true,
        endpoint: '/api/llm/routing/effective'
      },
      failureSummary: null
    },
    latency: {
      status: flags.enabled ? 'pending' : 'skipped',
      thresholds: {
        processReplyMaxMs: flags.processReplyMaxMs,
        endToEndMaxMs: flags.endToEndMaxMs
      },
      observations: []
    },
    summary: {
      scenariosTotal: Array.isArray(registry.scenarios) ? registry.scenarios.length : 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      skipped: 0
    },
    gates: {
      telegramSmokeDelivered: false,
      runtimeCommandApplied: false,
      processModelCommandApplied: false,
      processProviderChatReady: false,
      processRunCompleted: false,
      processRuntimeUsed: false,
      processReplyContainedMarker: false,
      processReplyWithinLatencySlo: false,
      kanbanTaskCreatedFromTelegram: false,
      backlogSnapshotReturned: false,
      endToEndWithinLatencySlo: false,
      trackedArchiveRedacted: true
    },
    scenarios: [],
    steps: [],
    redaction: {
      trackedArchive:
        'Tracked archive omits Telegram chat identifiers, sender identifiers, raw prompts, message bodies, bot tokens, API tokens, provider outputs, cookies, and storage state.',
      localReport:
        'Local report keeps only redacted summaries and marker hashes; raw operator messages are not persisted by this script.'
    },
    followUpTasks: []
  };
}

function pushScenario(report, scenario) {
  report.scenarios.push(scenario);
}

function updateSummary(report) {
  const statuses = report.scenarios.map((scenario) => scenario.status);
  report.summary.passed = statuses.filter((status) => status === 'passed').length;
  report.summary.failed = statuses.filter((status) => status === 'failed').length;
  report.summary.blocked = statuses.filter((status) => status === 'blocked').length;
  report.summary.skipped = statuses.filter((status) => status === 'skipped').length;
  if (statuses.includes('failed')) {
    report.status = 'failed';
  } else if (statuses.includes('blocked')) {
    report.status = 'blocked';
  } else if (statuses.includes('passed')) {
    report.status = 'passed';
  } else {
    report.status = 'skipped';
  }
}

function allReportGatesPassed(report) {
  return Object.values(report.gates).every((value) => value === true);
}

function makeArchive(report) {
  return {
    schema: 'ops.live-telegram-process-certification-archive.v1',
    version: 1,
    archivedAt: new Date().toISOString(),
    sourceReport: {
      path: path.relative(REPO_ROOT, REPORT_PATH),
      schema: report.schema,
      generatedAt: report.generatedAt
    },
    status: report.status,
    registry: report.registry,
    marker: report.marker,
    target: report.target,
    processModelSelection: report.processModelSelection,
    latency: report.latency,
    summary: report.summary,
    gates: report.gates,
    scenarios: report.scenarios,
    command: 'OPS_RUN_LIVE_TELEGRAM_PROCESS_CERT=1 pnpm test:live-telegram-process',
    evidence: [
      'scripts/testing/run-live-telegram-process-certification.mjs',
      'scripts/testing/scenarios/live-telegram-process.json',
      'docs/runbooks/chat-process-runtime-certification.md'
    ],
    redaction: report.redaction,
    followUpTasks: report.followUpTasks
  };
}

function maybeWriteArchive(report) {
  if (report.status !== 'passed' && !envFlag('OPS_LIVE_TELEGRAM_PROCESS_ARCHIVE_ALLOW_FAILED')) {
    return;
  }
  writeJson(ARCHIVE_PATH, makeArchive(report));
}

function scenarioById(registry, id) {
  const scenarios = Array.isArray(registry.scenarios) ? registry.scenarios : [];
  return scenarios.find((scenario) => isRecord(scenario) && scenario.id === id) ?? { id };
}

function scenarioLabel(registry, id) {
  const scenario = scenarioById(registry, id);
  return typeof scenario.claim === 'string' ? scenario.claim : id;
}

async function runSmoke({ report, registry, gatewayBaseUrl, headers, target, timeoutMs }) {
  const id = 'telegram_delivery_smoke';
  const payload = await recordStep(report, id, () =>
    requestJson(`${gatewayBaseUrl}/api/telegram/smoke-test`, {
      method: 'POST',
      headers,
      body: {
        sendMessage: true,
        text: `ElyzeLabs live Telegram process certification ${report.marker.hash}`,
        chatId: target.target,
        ...(target.topic ? { topicId: target.topic } : {})
      },
      timeoutMs
    })
  );
  const smoke = summarizeSmoke(payload.smoke);
  const passed = smoke.overall === 'ok' && smoke.identity === 'ok' && smoke.delivery === 'ok';
  report.gates.telegramSmokeDelivered = passed;
  pushScenario(report, {
    id,
    label: scenarioLabel(registry, id),
    status: passed ? 'passed' : 'failed',
    smoke
  });
}

async function sendTelegramIngress({ report, gatewayBaseUrl, target, text, updateId, timeoutMs }) {
  return recordStep(report, `telegram-ingress:${updateId.toString()}`, () =>
    requestJson(`${gatewayBaseUrl}/api/ingress/telegram`, {
      method: 'POST',
      headers: {
        'x-ops-telegram-mode': 'ingress'
      },
      body: createTelegramPayload({ target, updateId, text }),
      timeoutMs
    })
  );
}

async function runRuntimeSwitch({ report, registry, gatewayBaseUrl, target, timeoutMs, updateId }) {
  const id = 'telegram_runtime_process_switch';
  const payload = await sendTelegramIngress({
    report,
    gatewayBaseUrl,
    target,
    text: '/runtime process',
    updateId,
    timeoutMs
  });
  const ingress = summarizeIngress(payload);
  const passed = ingress.status === 'command_applied' && ingress.command === 'runtime';
  report.gates.runtimeCommandApplied = passed;
  pushScenario(report, {
    id,
    label: scenarioLabel(registry, id),
    status: passed ? 'passed' : 'failed',
    ingress
  });
  return typeof payload.sessionId === 'string' ? payload.sessionId : null;
}

async function runProcessModelSelect({ report, registry, gatewayBaseUrl, target, processModel, timeoutMs, updateId }) {
  const id = 'telegram_process_model_select';
  const payload = await sendTelegramIngress({
    report,
    gatewayBaseUrl,
    target,
    text: `/model ${processModel}`,
    updateId,
    timeoutMs
  });
  const ingress = summarizeIngress(payload);
  const passed = ingress.status === 'command_applied' && ingress.command === 'model';
  report.gates.processModelCommandApplied = passed;
  pushScenario(report, {
    id,
    label: scenarioLabel(registry, id),
    status: passed ? 'passed' : 'failed',
    ingress,
    modelRoute: {
      providerBacked: /^(openrouter|gemini|google|or:)/i.test(processModel),
      rawStoredInTrackedArchive: false
    }
  });
}

async function checkProcessProviderChat({ gatewayBaseUrl, headers, processModel, timeoutMs }) {
  return requestJson(`${gatewayBaseUrl}/api/onboarding/provider-keys/live-check`, {
    method: 'POST',
    headers,
    body: {
      actor: 'live-telegram-process-cert',
      processChatModel: processModel,
      policy: 'orchestrator'
    },
    timeoutMs: Math.min(timeoutMs, 30000)
  });
}

async function selectProcessProviderChatModel({ report, registry, gatewayBaseUrl, headers, processModelCandidates, timeoutMs }) {
  const id = 'telegram_process_provider_chat_live_check';
  const attempts = [];
  for (const candidate of processModelCandidates) {
    let routing = null;
    try {
      const routingPayload = await recordStep(report, `${id}:routing:${attempts.length + 1}`, () =>
        checkEffectiveProcessRoute({ gatewayBaseUrl, headers, processModel: candidate, timeoutMs })
      );
      routing = summarizeEffectiveRouting(routingPayload);
      if (!routing.selected) {
        const attempt = {
          status: 'skipped',
          ok: false,
          provider: null,
          model: candidate,
          detail: 'No eligible process route selected before live generation.',
          routing
        };
        attempt.reasonCode = classifyProcessProviderFailure(attempt);
        attempt.recommendation = remediationForProcessFailure(attempt.reasonCode);
        attempts.push(attempt);
        continue;
      }
    } catch (error) {
      routing = {
        available: false,
        reason: null,
        requestedModel: candidate,
        selected: false,
        selectedProvider: null,
        selectedModel: null,
        selectedProfileId: null,
        checks: [],
        error: redactError(error)
      };
    }
    const preflightFailure = requestedCandidatePreflightFailure(routing, candidate);
    if (preflightFailure) {
      const attempt = {
        status: 'skipped',
        ok: false,
        provider: routing.selectedProvider,
        model: candidate,
        detail: preflightFailure,
        routing
      };
      attempt.reasonCode = classifyProcessProviderFailure(attempt);
      attempt.recommendation = remediationForProcessFailure(attempt.reasonCode);
      attempts.push(attempt);
      continue;
    }

    try {
      const payload = await recordStep(report, `${id}:${attempts.length + 1}`, () =>
        checkProcessProviderChat({ gatewayBaseUrl, headers, processModel: candidate, timeoutMs })
      );
      const liveCheck = summarizeProcessChatLiveCheck(payload);
      const attempt = {
        status: liveCheck.status,
        ok: liveCheck.ok,
        provider: liveCheck.provider,
        model: liveCheck.model,
        detail: liveCheck.detail,
        routing
      };
      attempt.reasonCode = liveCheck.ok === true ? null : classifyProcessProviderFailure(attempt);
      attempt.recommendation = attempt.reasonCode ? remediationForProcessFailure(attempt.reasonCode) : null;
      attempts.push(attempt);
      if (liveCheck.status === 'ok' && liveCheck.ok === true) {
        report.gates.processProviderChatReady = true;
        report.processModelSelection.selectedProvider = liveCheck.provider;
        report.processModelSelection.selectedModel = liveCheck.model ?? candidate;
        report.processModelSelection.failureSummary = summarizeProcessModelAttempts(attempts.filter((entry) => entry.ok !== true));
        pushScenario(report, {
          id,
          label: scenarioLabel(registry, id),
          status: 'passed',
          liveCheck,
          attempts
        });
        return liveCheck.model ?? candidate;
      }
    } catch (error) {
      const attempt = {
        status: 'error',
        ok: false,
        provider: null,
        model: candidate,
        detail: redactError(error),
        routing
      };
      attempt.reasonCode = classifyProcessProviderFailure(attempt);
      attempt.recommendation = remediationForProcessFailure(attempt.reasonCode);
      attempts.push(attempt);
    }
  }

  report.gates.processProviderChatReady = false;
  report.processModelSelection.failureSummary = summarizeProcessModelAttempts(attempts);
  pushScenario(report, {
    id,
    label: scenarioLabel(registry, id),
    status: 'failed',
    attempts,
    failureSummary: report.processModelSelection.failureSummary
  });
  const lastAttempt = attempts[attempts.length - 1] ?? null;
  throw new Error(
    `No provider-backed process model passed live chat checks across ${attempts.length.toString()} candidate(s). Last: provider=${
      lastAttempt?.provider ?? 'unknown'
    } model=${lastAttempt?.model ?? 'unknown'} ${lastAttempt?.status ?? 'unknown'}: ${
      lastAttempt?.detail ?? 'missing detail'
    }`
  );
}

async function runProcessCodeReply({ report, registry, gatewayBaseUrl, headers, target, marker, timeoutMs, updateId }) {
  const id = 'telegram_process_code_reply';
  const startedMs = Date.now();
  const text = [
    `Live Telegram process certification ${marker}.`,
    'Use the provider-backed process runtime and answer with one concise JavaScript line:',
    `const liveTelegramProcessMarker = "${marker}";`,
    'Do not browse, do not reveal private data, and include the marker exactly once.'
  ].join(' ');
  const payload = await sendTelegramIngress({
    report,
    gatewayBaseUrl,
    target,
    text,
    updateId,
    timeoutMs
  });
  const ingress = summarizeIngress(payload);
  if (typeof payload.runId !== 'string' || typeof payload.sessionId !== 'string') {
    pushScenario(report, {
      id,
      label: scenarioLabel(registry, id),
      status: 'failed',
      ingress,
      reason: 'missing_run_or_session'
    });
    return null;
  }

  const runPayload = await recordStep(report, `${id}:run-terminal`, () =>
    waitForRun(gatewayBaseUrl, headers, payload.runId, timeoutMs)
  );
  const run = summarizeRun(runPayload);
  const messageResult = await recordStep(report, `${id}:outbound-marker`, () =>
    waitForMessagePredicate(
      gatewayBaseUrl,
      headers,
      payload.sessionId,
      (message) => message.direction === 'outbound' && typeof message.content === 'string' && message.content.includes(marker),
      Math.min(timeoutMs, 45000)
    )
  );
  const messages = summarizeMessages(messageResult.messages, marker);
  const elapsedMs = Date.now() - startedMs;
  const processRuntimeUsed = run.runtime === 'process' || run.effectiveRuntime === 'process' || run.executionPathRuntime === 'process';
  const passed = run.status === 'completed' && processRuntimeUsed && run.triggerSource === 'telegram' && messages.markerSeen;
  const latencyPassed = recordLatencyObservation(
    report,
    'telegram_process_code_reply',
    elapsedMs,
    report.latency.thresholds.processReplyMaxMs
  );
  report.gates.processRunCompleted = run.status === 'completed';
  report.gates.processRuntimeUsed = processRuntimeUsed;
  report.gates.processReplyContainedMarker = messages.markerSeen;
  report.gates.processReplyWithinLatencySlo = latencyPassed;
  pushScenario(report, {
    id,
    label: scenarioLabel(registry, id),
    status: passed && latencyPassed ? 'passed' : 'failed',
    ingress,
    run,
    messages,
    latency: {
      observedMs: elapsedMs,
      maxMs: report.latency.thresholds.processReplyMaxMs,
      status: latencyPassed ? 'passed' : 'failed'
    }
  });
  return {
    runId: payload.runId,
    sessionId: payload.sessionId
  };
}

async function runKanbanTaskCreate({ report, registry, gatewayBaseUrl, headers, target, marker, timeoutMs, updateId }) {
  const id = 'telegram_kanban_task_create';
  const text = [
    `/task Live Telegram process certification ${marker}`,
    'project=elyze-live-cert',
    'labels=live-cert,telegram,process',
    'priority=5',
    'state=triage'
  ].join(' ');
  const payload = await sendTelegramIngress({
    report,
    gatewayBaseUrl,
    target,
    text,
    updateId,
    timeoutMs
  });
  const ingress = summarizeIngress(payload);
  if (typeof payload.itemId !== 'string') {
    pushScenario(report, {
      id,
      label: scenarioLabel(registry, id),
      status: 'failed',
      ingress,
      reason: 'missing_item'
    });
    return null;
  }
  const itemPayload = await recordStep(report, `${id}:item-read`, () =>
    requestJson(`${gatewayBaseUrl}/api/backlog/items/${encodeURIComponent(payload.itemId)}`, {
      headers,
      timeoutMs: Math.min(timeoutMs, 15000)
    })
  );
  const item = summarizeBacklogItem(itemPayload.item);
  const passed =
    ingress.status === 'command_applied' &&
    ingress.command === 'task' &&
    item?.state === 'triage' &&
    item?.source === 'telegram' &&
    item?.originChannel === 'telegram';
  report.gates.kanbanTaskCreatedFromTelegram = passed;
  pushScenario(report, {
    id,
    label: scenarioLabel(registry, id),
    status: passed ? 'passed' : 'failed',
    ingress,
    item
  });
  return payload.itemId;
}

async function runBacklogSnapshot({ report, registry, gatewayBaseUrl, target, timeoutMs, updateId }) {
  const id = 'telegram_backlog_snapshot';
  const payload = await sendTelegramIngress({
    report,
    gatewayBaseUrl,
    target,
    text: '/backlog',
    updateId,
    timeoutMs
  });
  const ingress = summarizeIngress(payload);
  const passed = ingress.status === 'command_applied' && ingress.command === 'backlog';
  report.gates.backlogSnapshotReturned = passed;
  pushScenario(report, {
    id,
    label: scenarioLabel(registry, id),
    status: passed ? 'passed' : 'failed',
    ingress
  });
}

async function startFreshSession({ report, gatewayBaseUrl, target, timeoutMs, updateId }) {
  try {
    const payload = await sendTelegramIngress({
      report,
      gatewayBaseUrl,
      target,
      text: '/new',
      updateId,
      timeoutMs
    });
    return summarizeIngress(payload);
  } catch (error) {
    report.followUpTasks.push(`Fresh Telegram session setup failed: ${redactError(error)}`);
    return null;
  }
}

async function main() {
  const startedMs = Date.now();
  const registry = readJson(SCENARIO_PATH);
  const config = readControlPlaneConfig();
  const gatewayBaseUrl = resolveGatewayBaseUrl(config);
  const target = resolveTelegramTarget();
  const marker = `ltp-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  const flags = {
    enabled: envFlag('OPS_RUN_LIVE_TELEGRAM_PROCESS_CERT'),
    strict: envFlag('OPS_LIVE_TELEGRAM_PROCESS_STRICT', true),
    timeoutMs: positiveNumberEnv('OPS_LIVE_TELEGRAM_PROCESS_TIMEOUT_MS', 120000, 10000),
    processReplyMaxMs: positiveNumberEnv('OPS_LIVE_TELEGRAM_PROCESS_REPLY_MAX_MS', 120000, 10000),
    endToEndMaxMs: positiveNumberEnv('OPS_LIVE_TELEGRAM_PROCESS_E2E_MAX_MS', 300000, 30000),
    processModelCandidates: resolveProcessModelCandidates(),
    explicitProcessModelRequested: Boolean(process.env.OPS_LIVE_TELEGRAM_PROCESS_MODEL?.trim()),
    targetConfigured: Boolean(target?.target),
    topicConfigured: Boolean(target?.topic)
  };
  const report = makeReport({ flags, registry, gatewayBaseUrl, marker });

  fs.rmSync(REPORT_DIR, { force: true, recursive: true });

  if (!flags.enabled) {
    report.followUpTasks.push('Set OPS_RUN_LIVE_TELEGRAM_PROCESS_CERT=1 to run real Telegram process certification.');
    writeJson(REPORT_PATH, report);
    console.log(`live Telegram process certification skipped; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
    return 0;
  }

  const apiToken = resolveApiToken(config);
  if (!apiToken) {
    report.status = 'skipped';
    report.latency.status = 'skipped';
    report.followUpTasks.push('Set OPS_API_TOKEN or OPS_LIVE_TELEGRAM_PROCESS_API_TOKEN before running live certification.');
    writeJson(REPORT_PATH, report);
    return flags.strict ? 1 : 0;
  }
  if (!target) {
    report.status = 'skipped';
    report.latency.status = 'skipped';
    report.followUpTasks.push('Set TELEGRAM_CHAT_ID or OPS_LIVE_TELEGRAM_PROCESS_CHAT_ID before running live certification.');
    writeJson(REPORT_PATH, report);
    return flags.strict ? 1 : 0;
  }

  const headers = authHeaders(apiToken);
  const baseUpdateId = Date.now();

  try {
    await recordStep(report, 'gateway-readiness', () =>
      requestJson(`${gatewayBaseUrl}/api/health/readiness`, {
        headers,
        timeoutMs: 10000
      })
    );
    await runSmoke({ report, registry, gatewayBaseUrl, headers, target, timeoutMs: flags.timeoutMs });
    await startFreshSession({ report, gatewayBaseUrl, target, timeoutMs: flags.timeoutMs, updateId: baseUpdateId + 1 });
    await runRuntimeSwitch({ report, registry, gatewayBaseUrl, target, timeoutMs: flags.timeoutMs, updateId: baseUpdateId + 2 });
    const selectedProcessModel = await selectProcessProviderChatModel({
      report,
      registry,
      gatewayBaseUrl,
      headers,
      processModelCandidates: flags.processModelCandidates,
      timeoutMs: flags.timeoutMs
    });
    await runProcessModelSelect({
      report,
      registry,
      gatewayBaseUrl,
      target,
      processModel: selectedProcessModel,
      timeoutMs: flags.timeoutMs,
      updateId: baseUpdateId + 3
    });
    await runProcessCodeReply({
      report,
      registry,
      gatewayBaseUrl,
      headers,
      target,
      marker,
      timeoutMs: flags.timeoutMs,
      updateId: baseUpdateId + 4
    });
    await runKanbanTaskCreate({
      report,
      registry,
      gatewayBaseUrl,
      headers,
      target,
      marker,
      timeoutMs: flags.timeoutMs,
      updateId: baseUpdateId + 5
    });
    await runBacklogSnapshot({
      report,
      registry,
      gatewayBaseUrl,
      target,
      timeoutMs: flags.timeoutMs,
      updateId: baseUpdateId + 6
    });
  } catch (error) {
    report.status = 'failed';
    report.followUpTasks.push(redactError(error));
  }

  const endToEndPassed = recordLatencyObservation(
    report,
    'live_telegram_process_e2e',
    Date.now() - startedMs,
    report.latency.thresholds.endToEndMaxMs
  );
  report.gates.endToEndWithinLatencySlo = endToEndPassed;
  finalizeLatencyStatus(report);

  updateSummary(report);
  if (report.status === 'passed' && !allReportGatesPassed(report)) {
    report.status = 'failed';
    report.followUpTasks.push('One or more required live Telegram process gates failed after scenario execution.');
  }
  maybeWriteArchive(report);
  writeJson(REPORT_PATH, report);

  if (report.status !== 'passed') {
    console.error(`[live-telegram-process-cert] ${report.status}. report=${REPORT_PATH}`);
    for (const scenario of report.scenarios) {
      console.error(`${scenario.id}: ${scenario.status}`);
    }
    return flags.strict ? 1 : 0;
  }

  console.log(`[live-telegram-process-cert] passed. report=${REPORT_PATH}`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(redactError(error));
    process.exitCode = 1;
  });
