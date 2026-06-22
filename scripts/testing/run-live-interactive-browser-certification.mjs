#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, 'config/control-plane.yaml');
const REPORT_DIR = path.join(REPO_ROOT, '.ops/certifications/interactive-browser-live');
const REPORT_PATH = path.join(REPORT_DIR, 'certification-report.json');
const ARTIFACT_DIR = path.join(REPORT_DIR, 'artifacts');
const DEFAULT_ARCHIVE_PATH = path.join(REPO_ROOT, 'docs/certifications/interactive-browser-live-latest.json');
const DEFAULT_TARGET_URL = 'https://www.selenium.dev/selenium/web/web-form.html';

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
    const parsed = YAML.parse(fs.readFileSync(configPath, 'utf8'));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolveApiToken(config) {
  const candidates = [
    process.env.OPS_LIVE_INTERACTIVE_BROWSER_API_TOKEN,
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
    process.env.OPS_LIVE_INTERACTIVE_BROWSER_BASE_URL?.trim() ||
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
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs.toString()}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function certificationActions() {
  return [
    { type: 'read' },
    { type: 'click', selector: '#my-check-2', timeoutMs: 500 },
    { type: 'type', selector: '#my-text-id', text: 'Elyze live interactive browser certification', timeoutMs: 500 },
    { type: 'type', selector: 'textarea[name="my-textarea"]', text: 'Non-mutating local form input.', timeoutMs: 500 },
    { type: 'snapshot' },
    { type: 'screenshot' },
    { type: 'pdf' }
  ];
}

function summarizeAction(action) {
  return {
    index: Number.isFinite(Number(action.index)) ? Number(action.index) : null,
    type: typeof action.type === 'string' ? action.type : 'unknown',
    ok: action.ok === true,
    selector: typeof action.selector === 'string' ? action.selector : null,
    url: typeof action.url === 'string' ? action.url : null,
    error: typeof action.error === 'string' ? action.error : null
  };
}

function artifactExtension(artifact) {
  if (artifact.kind === 'screenshot') {
    return 'png';
  }
  if (artifact.kind === 'pdf') {
    return 'pdf';
  }
  if (artifact.kind === 'snapshot') {
    return 'txt';
  }
  return 'txt';
}

function persistBinaryArtifacts(artifacts) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const persisted = [];
  for (const artifact of artifacts) {
    if (!isRecord(artifact) || typeof artifact.kind !== 'string') {
      continue;
    }
    const base = {
      id: typeof artifact.id === 'string' ? artifact.id : null,
      actionIndex: Number.isFinite(Number(artifact.actionIndex)) ? Number(artifact.actionIndex) : null,
      kind: artifact.kind,
      mimeType: typeof artifact.mimeType === 'string' ? artifact.mimeType : null,
      sizeBytes: Number.isFinite(Number(artifact.sizeBytes)) ? Number(artifact.sizeBytes) : null,
      persistedPath: null
    };
    if ((artifact.kind === 'screenshot' || artifact.kind === 'pdf') && typeof artifact.contentBase64 === 'string') {
      const fileName = `${artifact.kind}.${artifactExtension(artifact)}`;
      const filePath = path.join(ARTIFACT_DIR, fileName);
      fs.writeFileSync(filePath, Buffer.from(artifact.contentBase64, 'base64'));
      persisted.push({
        ...base,
        sizeBytes: fs.statSync(filePath).size,
        persistedPath: path.relative(REPO_ROOT, filePath)
      });
      continue;
    }
    persisted.push(base);
  }
  return persisted;
}

function summarizeControl(control) {
  if (!isRecord(control)) {
    return {
      ok: false,
      provider: null,
      startedUrl: null,
      finalUrl: null,
      actions: [],
      artifacts: [],
      error: 'missing_control'
    };
  }
  const artifacts = Array.isArray(control.artifacts) ? control.artifacts.filter(isRecord) : [];
  return {
    ok: control.ok === true,
    provider: typeof control.provider === 'string' ? control.provider : null,
    startedUrl: typeof control.startedUrl === 'string' ? control.startedUrl : null,
    finalUrl: typeof control.finalUrl === 'string' ? control.finalUrl : null,
    actions: Array.isArray(control.actions) ? control.actions.filter(isRecord).map(summarizeAction) : [],
    artifacts: persistBinaryArtifacts(artifacts),
    error: typeof control.error === 'string' ? control.error : null
  };
}

function buildGates(control, targetUrl = DEFAULT_TARGET_URL) {
  const actions = new Map(control.actions.map((action) => [action.type, action]));
  const artifacts = new Map(control.artifacts.map((artifact) => [artifact.kind, artifact]));
  return {
    externalLiveRunPassed: control.ok === true,
    providerIsCdpChrome: control.provider === 'cdp_chrome',
    clickPassed: actions.get('click')?.ok === true,
    typePassed: control.actions.filter((action) => action.type === 'type').length === 2 &&
      control.actions.filter((action) => action.type === 'type').every((action) => action.ok === true),
    screenshotPersisted: Boolean(artifacts.get('screenshot')?.persistedPath) &&
      Number(artifacts.get('screenshot')?.sizeBytes) > 1000,
    pdfPersisted: Boolean(artifacts.get('pdf')?.persistedPath) && Number(artifacts.get('pdf')?.sizeBytes) > 1000,
    nonMutatingTarget: control.startedUrl?.startsWith(targetUrl) === true
  };
}

function allGatesPassed(gates) {
  return Object.values(gates).every((value) => value === true);
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function makeBaseReport({ flags, gatewayBaseUrl, targetUrl }) {
  return {
    schema: 'ops.live-interactive-browser-certification.v1',
    version: 1,
    generatedAt: new Date().toISOString(),
    status: flags.enabled ? 'pending' : 'skipped',
    strict: flags.strict,
    gatewayBaseUrl,
    target: {
      url: targetUrl,
      description: 'Selenium public web form fixture; non-mutating local form interaction only.'
    },
    control: null,
    gates: {},
    redaction: {
      omitted:
        'Interactive artifact base64, page text, form input text previews, cookies, tokens, and browser profile material are not written to tracked archives.',
      binaryArtifacts: 'Screenshot and PDF binaries are persisted only under the local .ops certification directory.'
    },
    followUpTasks: []
  };
}

function makeArchive(report, outputPath) {
  return {
    schema: 'ops.live-interactive-browser-certification-archive.v1',
    version: 1,
    archivedAt: new Date().toISOString(),
    sourceReport: {
      path: path.relative(REPO_ROOT, REPORT_PATH),
      schema: report.schema,
      generatedAt: report.generatedAt
    },
    status: report.status,
    target: report.target,
    gates: report.gates,
    command: [
      'OPS_RUN_LIVE_INTERACTIVE_BROWSER_CERT=1',
      'pnpm test:interactive-browser:live'
    ].join(' '),
    control: report.control,
    redaction: {
      omitted:
        'No base64, page text, typed text previews, cookies, tokens, storage state, profile ids, or profile labels are stored in this tracked archive.',
      outputPath: path.relative(REPO_ROOT, outputPath)
    },
    followUpTasks: report.followUpTasks
  };
}

function maybeWriteArchive(report, outputPath) {
  if (report.status !== 'passed') {
    if (fs.existsSync(outputPath)) {
      const existing = readJsonFile(outputPath);
      if (existing.status === 'passed' && !envFlag('OPS_LIVE_INTERACTIVE_BROWSER_ARCHIVE_ALLOW_FAILED')) {
        return;
      }
    }
  }
  writeJson(outputPath, makeArchive(report, outputPath));
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function main() {
  const config = readControlPlaneConfig();
  const gatewayBaseUrl = resolveGatewayBaseUrl(config);
  const targetUrl = process.env.OPS_LIVE_INTERACTIVE_BROWSER_URL?.trim() || DEFAULT_TARGET_URL;
  const flags = {
    enabled: envFlag('OPS_RUN_LIVE_INTERACTIVE_BROWSER_CERT'),
    strict: envFlag('OPS_LIVE_INTERACTIVE_BROWSER_STRICT'),
    timeoutMs: Number.isFinite(Number(process.env.OPS_LIVE_INTERACTIVE_BROWSER_TIMEOUT_MS))
      ? Math.max(10000, Number(process.env.OPS_LIVE_INTERACTIVE_BROWSER_TIMEOUT_MS))
      : 90000
  };
  const archivePath = process.env.OPS_LIVE_INTERACTIVE_BROWSER_ARCHIVE_OUTPUT?.trim()
    ? path.resolve(process.env.OPS_LIVE_INTERACTIVE_BROWSER_ARCHIVE_OUTPUT.trim())
    : DEFAULT_ARCHIVE_PATH;
  const report = makeBaseReport({ flags, gatewayBaseUrl, targetUrl });

  if (!flags.enabled) {
    report.followUpTasks.push('Set OPS_RUN_LIVE_INTERACTIVE_BROWSER_CERT=1 to run live external interactive browser certification.');
    writeJson(REPORT_PATH, report);
    console.log(`live interactive browser certification skipped; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
    return 0;
  }

  const apiToken = resolveApiToken(config);
  if (!apiToken) {
    report.status = 'skipped';
    report.followUpTasks.push('Set OPS_API_TOKEN or OPS_LIVE_INTERACTIVE_BROWSER_API_TOKEN before running live certification.');
    writeJson(REPORT_PATH, report);
    console.log(`live interactive browser certification skipped without API token; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
    return flags.strict ? 1 : 0;
  }

  const headers = authHeaders(apiToken);
  try {
    await requestJson(`${gatewayBaseUrl}/api/health/readiness`, { headers, timeoutMs: 5000 });
    const payload = await requestJson(`${gatewayBaseUrl}/api/browser/interactive/run`, {
      method: 'POST',
      headers,
      timeoutMs: flags.timeoutMs,
      body: {
        url: targetUrl,
        prompt: 'Live external interactive browser certification with non-mutating form controls.',
        previewChars: 400,
        actions: certificationActions()
      }
    });
    const control = summarizeControl(payload.control);
    const gates = buildGates(control, targetUrl);
    report.control = control;
    report.gates = gates;
    report.status = allGatesPassed(gates) ? 'passed' : 'failed';
    if (report.status !== 'passed') {
      report.followUpTasks.push('Inspect the live interactive browser report and verify Chrome/CDP availability plus target selectors.');
    }
  } catch (error) {
    report.status = 'failed';
    report.control = {
      ok: false,
      provider: null,
      startedUrl: targetUrl,
      finalUrl: null,
      actions: [],
      artifacts: [],
      error: redactError(error)
    };
    report.gates = buildGates(report.control);
    report.followUpTasks.push('Start the gateway and verify the native Chrome/CDP provider can reach the external target.');
  }

  writeJson(REPORT_PATH, report);
  maybeWriteArchive(report, archivePath);
  console.log(`live interactive browser certification ${report.status}; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
  return flags.strict && report.status !== 'passed' ? 1 : 0;
}

process.exitCode = await main();
