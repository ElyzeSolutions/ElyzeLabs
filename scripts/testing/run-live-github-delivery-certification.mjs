#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { redactError, redactEvidenceText as redactText } from './redaction.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, 'config/control-plane.yaml');
const REPORT_DIR = path.join(REPO_ROOT, '.ops/certifications/live-github-delivery');
const REPORT_PATH = path.join(REPORT_DIR, 'certification-report.json');
const ARCHIVE_PATH = path.join(REPO_ROOT, 'docs/certifications/live-github-delivery-latest.json');

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
    process.env.OPS_LIVE_GITHUB_DELIVERY_API_TOKEN,
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
    process.env.OPS_LIVE_GITHUB_DELIVERY_BASE_URL?.trim() ||
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

function normalizeOwnerRepo(input) {
  const value = String(input ?? '').trim();
  if (!value) {
    return null;
  }
  const withoutGit = value.replace(/\.git$/u, '');
  const match = withoutGit.match(/(?:github\.com[:/])?([^/\s:]+)\/([^/\s]+)$/u);
  if (!match) {
    return null;
  }
  return {
    owner: match[1],
    repo: match[2]
  };
}

function resolveTargetRepo() {
  const combined =
    process.env.OPS_LIVE_GITHUB_DELIVERY_REPO?.trim() ||
    process.env.OPS_LIVE_GITHUB_REPO?.trim() ||
    process.env.GITHUB_REPOSITORY?.trim();
  const parsed = normalizeOwnerRepo(combined);
  if (parsed) {
    return parsed;
  }
  const owner = process.env.OPS_LIVE_GITHUB_DELIVERY_OWNER?.trim();
  const repo = process.env.OPS_LIVE_GITHUB_DELIVERY_REPO_NAME?.trim();
  if (owner && repo) {
    return { owner, repo };
  }
  return null;
}

function resolveTokenEnvName() {
  const explicit = process.env.OPS_LIVE_GITHUB_DELIVERY_TOKEN_ENV?.trim();
  if (explicit) {
    return explicit;
  }
  const candidates = ['GITHUB_TOKEN', 'GH_TOKEN', 'OPS_GITHUB_PAT'];
  return candidates.find((name) => process.env[name]?.trim() || readDotenvValue(name)) ?? 'OPS_GITHUB_PAT';
}

function authHeaders(token, gatewayBaseUrl) {
  return {
    authorization: `Bearer ${token}`,
    'x-api-token': token,
    'x-ops-role': 'admin',
    origin: gatewayBaseUrl
  };
}

function hashValue(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return null;
  }
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

async function requestJson(url, { method = 'GET', headers = {}, body, timeoutMs = 30000 } = {}) {
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
        payload = { raw: redactText(raw, 500) };
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

function summarizeRepoConnection(payload) {
  const repo = isRecord(payload.repo) ? payload.repo : {};
  const metadata = isRecord(repo.metadata) ? repo.metadata : {};
  const github = isRecord(metadata.github) ? metadata.github : {};
  return {
    repoConnectionRef: hashValue(typeof repo.id === 'string' ? repo.id : ''),
    defaultBranch: typeof repo.defaultBranch === 'string' ? repo.defaultBranch : null,
    authMode: typeof repo.authMode === 'string' ? repo.authMode : null,
    enabled: repo.enabled === true,
    syncStatus: typeof metadata.syncStatus === 'string' ? metadata.syncStatus : null,
    lastValidationStatus: typeof repo.lastValidationStatus === 'string' ? repo.lastValidationStatus : null,
    canWrite: github.canWrite === true,
    viewerRef: hashValue(typeof github.viewer === 'string' ? github.viewer : '')
  };
}

function summarizeIssue(payload) {
  const issue = isRecord(payload.issue) ? payload.issue : {};
  return {
    number: Number.isFinite(Number(issue.number)) ? Number(issue.number) : null,
    state: typeof issue.state === 'string' ? issue.state : null,
    labelCount: Array.isArray(issue.labels) ? issue.labels.length : 0,
    issueUrlRef: hashValue(typeof issue.url === 'string' ? issue.url : '')
  };
}

function summarizeDelivery(payload) {
  const delivery = isRecord(payload.delivery) ? payload.delivery : {};
  const metadata = isRecord(delivery.metadata) ? delivery.metadata : {};
  const githubIssue = isRecord(metadata.githubIssue) ? metadata.githubIssue : {};
  return {
    deliveryRef: hashValue(typeof delivery.id === 'string' ? delivery.id : ''),
    status: typeof delivery.status === 'string' ? delivery.status : null,
    githubState: typeof delivery.githubState === 'string' ? delivery.githubState : null,
    issueNumber: Number.isFinite(Number(githubIssue.number)) ? Number(githubIssue.number) : null,
    issueState: typeof githubIssue.state === 'string' ? githubIssue.state : null,
    reconcileStatus:
      isRecord(delivery.githubReconcile) && typeof delivery.githubReconcile.status === 'string'
        ? delivery.githubReconcile.status
        : null
  };
}

function summarizeBacklogItem(payload) {
  const item = isRecord(payload.item) ? payload.item : payload;
  return {
    itemRef: hashValue(typeof item.id === 'string' ? item.id : ''),
    state: typeof item.state === 'string' ? item.state : null,
    projectId: typeof item.projectId === 'string' ? item.projectId : null,
    labelCount: Array.isArray(item.labels) ? item.labels.length : 0
  };
}

function makeReport({ flags, gatewayBaseUrl, targetRepo, tokenEnvName, marker }) {
  return {
    schema: 'ops.live-github-delivery-certification.v1',
    version: 1,
    generatedAt: new Date().toISOString(),
    status: flags.enabled ? 'pending' : 'skipped',
    strict: flags.strict,
    gatewayBaseUrl,
    target: {
      configured: Boolean(targetRepo),
      repoRef: targetRepo ? hashValue(`${targetRepo.owner}/${targetRepo.repo}`) : null,
      rawRepoStored: false
    },
    token: {
      envName: tokenEnvName,
      presentInProcessEnv: Boolean(process.env[tokenEnvName]?.trim()),
      presentInDotenv: Boolean(readDotenvValue(tokenEnvName)),
      valueStored: false
    },
    marker: {
      hash: hashValue(marker),
      rawStoredInTrackedArchive: false
    },
    summary: {
      repoConnectionCreated: false,
      repoSyncPassed: false,
      backlogItemCreated: false,
      deliveryLinked: false,
      issueSynced: false,
      repairPreviewed: false,
      repairApplied: false,
      detailRead: false
    },
    gates: {
      gatewayReachable: false,
      repoCredentialsAccepted: false,
      issueWriteAccepted: false,
      kanbanDeliveryLinked: false,
      repairReceiptRecorded: false,
      trackedArchiveRedacted: true
    },
    evidence: {},
    steps: [],
    redaction: {
      trackedArchive:
        'Tracked archive omits raw repo names, issue URLs, API tokens, GitHub tokens, request bodies, and gateway command output.',
      localReport:
        'Local report stores only hashed repo/run/item references and redacted errors; GitHub token values are never persisted.'
    },
    followUpTasks: []
  };
}

function updateReportStatus(report) {
  if (report.status === 'skipped') {
    return;
  }
  if (report.steps.some((step) => step.status === 'failed')) {
    report.status = 'blocked';
    return;
  }
  if (
    report.gates.gatewayReachable &&
    report.gates.repoCredentialsAccepted &&
    report.gates.issueWriteAccepted &&
    report.gates.kanbanDeliveryLinked &&
    report.gates.repairReceiptRecorded
  ) {
    report.status = 'passed';
    return;
  }
  report.status = 'blocked';
}

function makeArchive(report) {
  return {
    schema: 'ops.live-github-delivery-certification-archive.v1',
    version: 1,
    archivedAt: new Date().toISOString(),
    sourceReport: {
      path: path.relative(REPO_ROOT, REPORT_PATH),
      schema: report.schema,
      generatedAt: report.generatedAt
    },
    status: report.status,
    strict: report.strict,
    target: report.target,
    token: report.token,
    marker: report.marker,
    summary: report.summary,
    gates: report.gates,
    evidence: report.evidence,
    steps: report.steps.map((step) => ({
      id: step.id,
      status: step.status,
      durationMs: step.durationMs,
      error: step.error
    })),
    redaction: report.redaction,
    followUpTasks: report.followUpTasks
  };
}

function maybeWriteArchive(report) {
  const archive = makeArchive(report);
  if (archive.status !== 'passed' && fs.existsSync(ARCHIVE_PATH) && !envFlag('OPS_LIVE_GITHUB_DELIVERY_ARCHIVE_ALLOW_FAILED')) {
    const existing = JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'));
    if (existing.status === 'passed') {
      return;
    }
  }
  writeJson(ARCHIVE_PATH, archive);
}

async function main() {
  const config = readControlPlaneConfig();
  const flags = {
    enabled: envFlag('OPS_RUN_LIVE_GITHUB_DELIVERY_CERT'),
    strict: envFlag('OPS_LIVE_GITHUB_DELIVERY_STRICT')
  };
  const gatewayBaseUrl = resolveGatewayBaseUrl(config);
  const apiToken = resolveApiToken(config);
  const targetRepo = resolveTargetRepo();
  const tokenEnvName = resolveTokenEnvName();
  const marker = `elyze-live-github-delivery-${new Date().toISOString()}-${crypto.randomBytes(3).toString('hex')}`;
  const report = makeReport({ flags, gatewayBaseUrl, targetRepo, tokenEnvName, marker });

  if (!flags.enabled) {
    report.followUpTasks.push('Set OPS_RUN_LIVE_GITHUB_DELIVERY_CERT=1 to run live GitHub delivery certification.');
    report.followUpTasks.push('Set OPS_LIVE_GITHUB_DELIVERY_REPO=owner/repo and expose a token env such as OPS_GITHUB_PAT to the gateway.');
    writeJson(REPORT_PATH, report);
    maybeWriteArchive(report);
    console.log(`live GitHub delivery certification skipped; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
    return;
  }

  if (!apiToken) {
    report.status = 'blocked';
    report.followUpTasks.push('Set OPS_API_TOKEN or OPS_LIVE_GITHUB_DELIVERY_API_TOKEN before running live certification.');
    writeJson(REPORT_PATH, report);
    maybeWriteArchive(report);
    console.log(`live GitHub delivery certification blocked without API token; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
    if (flags.strict) {
      process.exit(1);
    }
    return;
  }

  if (!targetRepo) {
    report.status = 'blocked';
    report.followUpTasks.push('Set OPS_LIVE_GITHUB_DELIVERY_REPO=owner/repo before running live certification.');
    writeJson(REPORT_PATH, report);
    maybeWriteArchive(report);
    console.log(`live GitHub delivery certification blocked without target repo; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
    if (flags.strict) {
      process.exit(1);
    }
    return;
  }

  if (!process.env[tokenEnvName]?.trim() && !readDotenvValue(tokenEnvName)) {
    report.followUpTasks.push(`Set ${tokenEnvName} in the gateway environment or .env before running live certification.`);
  }

  const headers = authHeaders(apiToken, gatewayBaseUrl);
  try {
    await recordStep(report, 'gateway:readiness', () =>
      requestJson(`${gatewayBaseUrl}/api/health/readiness`, { headers, timeoutMs: 15000 })
    );
    report.gates.gatewayReachable = true;

    const repoPayload = await recordStep(report, 'github:repo-connection:create', () =>
      requestJson(`${gatewayBaseUrl}/api/github/repos`, {
        method: 'POST',
        headers,
        body: {
          owner: targetRepo.owner,
          repo: targetRepo.repo,
          authSecretRef: `env:${tokenEnvName}`,
          authMode: 'pat_fallback',
          enabled: true,
          metadata: {
            patFallbackAllowed: true,
            liveCertification: true,
            certificationMarkerHash: hashValue(marker)
          }
        }
      })
    );
    report.summary.repoConnectionCreated = true;
    report.evidence.repoConnection = summarizeRepoConnection(repoPayload);
    const repo = isRecord(repoPayload.repo) ? repoPayload.repo : {};
    const repoConnectionId = typeof repo.id === 'string' ? repo.id : '';
    if (!repoConnectionId) {
      throw new Error('GitHub repo connection response did not include an id.');
    }

    const syncPayload = await recordStep(report, 'github:repo-sync', () =>
      requestJson(`${gatewayBaseUrl}/api/github/repos/${encodeURIComponent(repoConnectionId)}/sync`, {
        method: 'POST',
        headers,
        body: {
          actor: 'live-github-delivery-cert'
        },
        timeoutMs: 45000
      })
    );
    report.summary.repoSyncPassed = true;
    report.gates.repoCredentialsAccepted = true;
    report.evidence.repoSync = {
      repoConnection: summarizeRepoConnection(syncPayload),
      github: isRecord(syncPayload.github)
        ? {
            defaultBranch: typeof syncPayload.github.defaultBranch === 'string' ? syncPayload.github.defaultBranch : null,
            canWrite: syncPayload.github.canWrite === true,
            viewerRef: hashValue(typeof syncPayload.github.viewer === 'string' ? syncPayload.github.viewer : '')
          }
        : null
    };

    const itemPayload = await recordStep(report, 'kanban:item:create', () =>
      requestJson(`${gatewayBaseUrl}/api/backlog/items`, {
        method: 'POST',
        headers,
        body: {
          title: `Live GitHub delivery certification ${marker}`,
          description: [
            'Automated live certification item.',
            'This issue proves Kanban backlog issue sync and delivery repair against a real GitHub repository.',
            `Marker hash: ${hashValue(marker)}`
          ].join('\n'),
          state: 'planned',
          priority: 3,
          labels: ['certification', 'live-github-delivery'],
          source: 'certification',
          actor: 'live-github-delivery-cert',
          metadata: {
            liveCertification: true,
            certificationMarkerHash: hashValue(marker),
            linkedRepoConnectionId: repoConnectionId
          }
        }
      })
    );
    report.summary.backlogItemCreated = true;
    report.evidence.backlogItem = summarizeBacklogItem(itemPayload);
    const item = isRecord(itemPayload.item) ? itemPayload.item : {};
    const itemId = typeof item.id === 'string' ? item.id : '';
    if (!itemId) {
      throw new Error('Backlog item response did not include an id.');
    }

    const deliveryPayload = await recordStep(report, 'kanban:delivery-link', () =>
      requestJson(`${gatewayBaseUrl}/api/backlog/items/${encodeURIComponent(itemId)}/delivery`, {
        method: 'PUT',
        headers,
        body: {
          repoConnectionId,
          status: 'planned',
          githubState: 'open_pr',
          metadata: {
            liveCertification: true,
            certificationMarkerHash: hashValue(marker)
          }
        }
      })
    );
    report.summary.deliveryLinked = true;
    report.gates.kanbanDeliveryLinked = true;
    report.evidence.deliveryLink = summarizeDelivery(deliveryPayload);

    const issuePayload = await recordStep(report, 'github:issue-sync', () =>
      requestJson(`${gatewayBaseUrl}/api/backlog/items/${encodeURIComponent(itemId)}/issues/sync`, {
        method: 'POST',
        headers,
        body: {
          repoConnectionId
        },
        timeoutMs: 45000
      })
    );
    report.summary.issueSynced = true;
    report.gates.issueWriteAccepted = true;
    report.evidence.issue = summarizeIssue(issuePayload);
    report.evidence.issueDelivery = summarizeDelivery(issuePayload);

    const detailPayload = await recordStep(report, 'kanban:delivery-detail', () =>
      requestJson(`${gatewayBaseUrl}/api/backlog/items/${encodeURIComponent(itemId)}/delivery/detail`, {
        headers,
        timeoutMs: 30000
      })
    );
    report.summary.detailRead = true;
    report.evidence.deliveryDetail = summarizeDelivery(detailPayload);

    const previewPayload = await recordStep(report, 'kanban:repair-preview', () =>
      requestJson(`${gatewayBaseUrl}/api/backlog/items/${encodeURIComponent(itemId)}/delivery/repair`, {
        method: 'POST',
        headers,
        body: {
          actor: 'live-github-delivery-cert',
          action: 'refresh',
          dryRun: true
        },
        timeoutMs: 30000
      })
    );
    report.summary.repairPreviewed = true;
    const preview = isRecord(previewPayload.preview) ? previewPayload.preview : {};
    const idempotencyKey = typeof preview.idempotencyKey === 'string' ? preview.idempotencyKey : undefined;
    report.evidence.repairPreview = {
      action: typeof preview.action === 'string' ? preview.action : 'refresh',
      hasIdempotencyKey: Boolean(idempotencyKey),
      risk: typeof preview.risk === 'string' ? preview.risk : null
    };

    const repairPayload = await recordStep(report, 'kanban:repair-refresh', () =>
      requestJson(`${gatewayBaseUrl}/api/backlog/items/${encodeURIComponent(itemId)}/delivery/repair`, {
        method: 'POST',
        headers,
        body: {
          actor: 'live-github-delivery-cert',
          action: 'refresh',
          idempotencyKey
        },
        timeoutMs: 45000
      })
    );
    report.summary.repairApplied = true;
    report.gates.repairReceiptRecorded = true;
    report.evidence.repair = {
      delivery: summarizeDelivery(repairPayload),
      receipt:
        isRecord(repairPayload.repair)
          ? {
              action: typeof repairPayload.repair.action === 'string' ? repairPayload.repair.action : null,
              status: typeof repairPayload.repair.status === 'string' ? repairPayload.repair.status : null,
              changed: repairPayload.repair.changed === true
            }
          : null
    };
  } catch (error) {
    report.followUpTasks.push(`Resolve live GitHub delivery blocker: ${redactError(error)}`);
    report.followUpTasks.push('Confirm the gateway was started with the same token env referenced by OPS_LIVE_GITHUB_DELIVERY_TOKEN_ENV.');
  }

  updateReportStatus(report);
  if (report.status === 'passed') {
    report.followUpTasks = [];
  }
  writeJson(REPORT_PATH, report);
  maybeWriteArchive(report);

  console.log(`live GitHub delivery certification ${report.status}; report: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
  if ((report.status === 'failed' || report.status === 'blocked') && flags.strict) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`live GitHub delivery certification failed: ${redactError(error)}`);
  process.exit(1);
});
