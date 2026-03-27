#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { generateUgothereRetroReport } from './generate-ugothere-retro.mjs';
import { prepareUgothereFixture } from './ugothere-fixture.mjs';

function parseArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function toNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function writeText(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, value);
}

function writeJson(targetPath, value) {
  writeText(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readGitHead(repoPath) {
  if (!repoPath || !path.isAbsolute(repoPath) || !fs.existsSync(repoPath)) {
    return null;
  }
  const result = spawnSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    return null;
  }
  const head = String(result.stdout ?? '').trim();
  return head.length > 0 ? head : null;
}

const DELIVERY_RUNTIME_ARTIFACT_PREFIX = '.ops-runtime';
const DELIVERY_PLANNING_ARTIFACT_PREFIX = '.agents';
const INCIDENTAL_LOCKFILE_NAMES = new Set(['bun.lock', 'bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);
const DEFAULT_WORKSPACE_MEMORY_FILE = 'MEMORY.md';
const DEFAULT_WORKSPACE_DAILY_MEMORY_DIR = '.ops/memory-daily';
const DELIVERY_CODE_EVIDENCE_CATEGORIES = new Set(['feature', 'ui', 'implementation', 'api', 'data']);
const DEFERRED_EXECUTION_COMPLETION_PATTERNS = [
  /\b(?:i|we)\s+need to\b/i,
  /\b(?:i|we)\s+(?:will|['’]ll)\s+(?:execute|inspect|run|check|verify|gather)\b/i,
  /\bonce executed\b/i,
  /\bthe shell will output\b/i,
  /```json/i,
  /```(?:bash|sh|zsh)/i,
  /"name"\s*:\s*"(?:node|bash|sh|zsh|codex|claude|gemini)"/i,
  /"arguments"\s*:/i,
  /\bexecSync\s*\(/i
];

function normalizeGitRelativePath(value) {
  const trimmed = String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .trim();
  if (!trimmed) {
    return '';
  }
  const normalized = path.posix.normalize(trimmed);
  return normalized === '.' ? '' : normalized.replace(/^\/+/, '');
}

function dedupeGitPaths(paths, limit = 200) {
  const output = [];
  const seen = new Set();
  for (const entry of paths) {
    const normalized = normalizeGitRelativePath(entry);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function isDeliveryArtifactPath(relativePath) {
  const normalized = normalizeGitRelativePath(relativePath);
  return normalized === DELIVERY_RUNTIME_ARTIFACT_PREFIX || normalized.startsWith(`${DELIVERY_RUNTIME_ARTIFACT_PREFIX}/`);
}

function isEphemeralPlanningArtifactPath(relativePath) {
  const normalized = normalizeGitRelativePath(relativePath);
  return normalized === DELIVERY_PLANNING_ARTIFACT_PREFIX || normalized.startsWith(`${DELIVERY_PLANNING_ARTIFACT_PREFIX}/`);
}

function isIncidentalLockfilePath(relativePath) {
  return INCIDENTAL_LOCKFILE_NAMES.has(path.posix.basename(normalizeGitRelativePath(relativePath)));
}

function isWorkspaceMemoryArtifactPath(relativePath) {
  const normalized = normalizeGitRelativePath(relativePath);
  if (!normalized) {
    return false;
  }
  if (normalized === DEFAULT_WORKSPACE_MEMORY_FILE || path.posix.basename(normalized) === DEFAULT_WORKSPACE_MEMORY_FILE) {
    return true;
  }
  return normalized === DEFAULT_WORKSPACE_DAILY_MEMORY_DIR || normalized.startsWith(`${DEFAULT_WORKSPACE_DAILY_MEMORY_DIR}/`);
}

function looksLikeDeferredExecutionCompletion(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return false;
  }
  const futureSignal =
    /\b(?:i|we)\s+need to\b/i.test(normalized) ||
    /\b(?:i|we)\s+(?:will|['’]ll)\s+(?:execute|inspect|run|check|verify|gather)\b/i.test(normalized) ||
    /\bonce executed\b/i.test(normalized);
  const commandPlanSignal =
    /```json/i.test(normalized) ||
    /```(?:bash|sh|zsh)/i.test(normalized) ||
    /"name"\s*:\s*"(?:node|bash|sh|zsh|codex|claude|gemini)"/i.test(normalized) ||
    /"arguments"\s*:/i.test(normalized) ||
    /\bexecSync\s*\(/i.test(normalized);
  if (futureSignal && commandPlanSignal) {
    return true;
  }
  let score = 0;
  for (const pattern of DEFERRED_EXECUTION_COMPLETION_PATTERNS) {
    if (pattern.test(normalized)) {
      score += pattern.source.includes('```') ? 2 : 1;
    }
  }
  return score >= 3;
}

function normalizeBacklogScopeSlug(value) {
  if (!value) {
    return null;
  }
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/\.git$/i, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return slug.length > 0 ? slug : null;
}

function deriveSimulationProjectId({ repoRoot, repoUrl, prompt }) {
  if (repoRoot && path.isAbsolute(repoRoot)) {
    const fromRepoRoot = normalizeBacklogScopeSlug(path.basename(repoRoot));
    if (fromRepoRoot) {
      return fromRepoRoot;
    }
  }
  if (typeof repoUrl === 'string' && repoUrl.trim().length > 0) {
    try {
      const parsed = new URL(repoUrl);
      const fromUrl = normalizeBacklogScopeSlug(path.basename(parsed.pathname));
      if (fromUrl) {
        return fromUrl;
      }
    } catch {
      const fromString = normalizeBacklogScopeSlug(path.basename(repoUrl));
      if (fromString) {
        return fromString;
      }
    }
  }
  const contextualMatch = String(prompt ?? '').match(
    /\b(?:clone|fork|open|ship|fix|update|patch|repo(?:sitory)?|project)\s+([a-z0-9][a-z0-9_.-]*\.[a-z0-9][a-z0-9_.-]*)\b/i
  );
  return normalizeBacklogScopeSlug(contextualMatch?.[1] ?? null);
}

function gitPathExistsAtRef(repoPath, ref, relativePath) {
  if (!repoPath || !ref || !path.isAbsolute(repoPath) || !fs.existsSync(repoPath)) {
    return false;
  }
  const normalizedPath = normalizeGitRelativePath(relativePath);
  if (!normalizedPath) {
    return false;
  }
  const result = spawnSync('git', ['-C', repoPath, 'cat-file', '-e', `${ref}:${normalizedPath}`], {
    encoding: 'utf8'
  });
  return result.status === 0;
}

function filterPublishableGitPaths(repoPath, paths, options = {}) {
  const uniquePaths = dedupeGitPaths(paths, Number.isFinite(Number(options.limit)) ? Number(options.limit) : 200);
  if (uniquePaths.length === 0) {
    return [];
  }
  const changedManifestPaths = uniquePaths.filter((entry) => path.posix.basename(entry) === 'package.json');
  const referenceRef = typeof options.referenceRef === 'string' && options.referenceRef.trim().length > 0 ? options.referenceRef.trim() : null;
  const hasRelatedManifestChange = (relativePath) => {
    if (changedManifestPaths.length === 0) {
      return false;
    }
    const directory = path.posix.dirname(relativePath);
    if (!directory || directory === '.') {
      return changedManifestPaths.length > 0;
    }
    return changedManifestPaths.some(
      (manifestPath) =>
        manifestPath === `${directory}/package.json` ||
        (manifestPath.startsWith(`${directory}/`) && manifestPath.endsWith('/package.json'))
    );
  };

  return uniquePaths
    .filter((entry) => {
      if (isDeliveryArtifactPath(entry)) {
        return false;
      }
      if (isEphemeralPlanningArtifactPath(entry)) {
        if (!referenceRef) {
          return false;
        }
        return gitPathExistsAtRef(repoPath, referenceRef, entry);
      }
      if (isWorkspaceMemoryArtifactPath(entry)) {
        if (!referenceRef) {
          return false;
        }
        return gitPathExistsAtRef(repoPath, referenceRef, entry);
      }
      if (!isIncidentalLockfilePath(entry)) {
        return true;
      }
      if (hasRelatedManifestChange(entry)) {
        return true;
      }
      if (!referenceRef) {
        return false;
      }
      return gitPathExistsAtRef(repoPath, referenceRef, entry);
    })
    .slice(0, Number.isFinite(Number(options.limit)) ? Number(options.limit) : 200);
}

function readGitChangedFiles(repoPath) {
  if (!repoPath || !path.isAbsolute(repoPath) || !fs.existsSync(repoPath)) {
    return [];
  }
  const result = spawnSync('git', ['-C', repoPath, 'status', '--porcelain=1', '--untracked-files=all', '-z'], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    return [];
  }
  const entries = String(result.stdout ?? '')
    .split('\0')
    .filter((entry) => entry.length > 0);
  const changedPaths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? '';
    if (entry.length < 3) {
      continue;
    }
    const status = entry.slice(0, 2);
    if (status === '!!') {
      continue;
    }
    const rawPath = entry[2] === ' ' ? entry.slice(3) : entry.slice(2).trimStart();
    const candidatePath = normalizeGitRelativePath(rawPath);
    if (candidatePath) {
      changedPaths.push(candidatePath);
    }
    if ((status.includes('R') || status.includes('C')) && index + 1 < entries.length) {
      index += 1;
    }
  }
  return filterPublishableGitPaths(repoPath, changedPaths, { referenceRef: 'HEAD' });
}

function readGitCommittedFilesSinceRef(repoPath, referenceRef) {
  if (!repoPath || !referenceRef || !path.isAbsolute(repoPath) || !fs.existsSync(repoPath)) {
    return [];
  }
  const result = spawnSync('git', ['-C', repoPath, 'diff', '--name-only', '--diff-filter=ACMRD', '-z', `${referenceRef}...HEAD`], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    return [];
  }
  return filterPublishableGitPaths(
    repoPath,
    String(result.stdout ?? '')
      .split('\0')
      .filter((entry) => entry.length > 0),
    { referenceRef }
  );
}

function writeRetroReport(summary, retroPath) {
  const retro = generateUgothereRetroReport({ summary });
  writeJson(retroPath, retro);
  return retro;
}

function safeParseJson(raw, fallback = {}) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function loadSimulationEnv(cwd) {
  const dotenvPath = path.join(cwd, '.env');
  if (!fs.existsSync(dotenvPath)) {
    return;
  }
  const raw = fs.readFileSync(dotenvPath, 'utf8');
  const lines = raw.split(/\r?\n/g);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const delimiter = trimmed.indexOf('=');
    if (delimiter <= 0) {
      continue;
    }
    const key = trimmed.slice(0, delimiter).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    let value = trimmed.slice(delimiter + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function apiRequest(baseUrl, token, method, pathname, body) {
  const role = String(process.env.SIM_API_ROLE ?? 'operator').trim();
  const origin = String(process.env.SIM_API_ORIGIN ?? 'http://127.0.0.1:8788').trim();
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
  if (role) {
    headers['x-ops-role'] = role;
  }
  if (origin) {
    headers.Origin = origin;
  }
  const url = `${baseUrl.replace(/\/$/, '')}${pathname}`;
  const payloadBody = body ? JSON.stringify(body) : undefined;
  const maxAttempts = Math.max(1, Math.min(5, Number(process.env.SIM_API_MAX_ATTEMPTS ?? 4)));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: payloadBody
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        const message = payload?.error ?? `HTTP ${response.status}`;
        const retryableStatus = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
        if (retryableStatus && attempt < maxAttempts) {
          await sleep(Math.min(2_500, attempt * 350));
          continue;
        }
        throw new Error(`${method} ${pathname} failed: ${message}`);
      }
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryableError =
        /fetch failed|network|econnreset|econnrefused|socket|timeout|und_err/i.test(message);
      if (!retryableError || attempt >= maxAttempts) {
        throw error;
      }
      await sleep(Math.min(2_500, attempt * 350));
    }
  }
  throw new Error(`${method} ${pathname} failed after ${maxAttempts} attempts`);
}

function parseGithubOwnerRepoReference(raw) {
  const normalized = String(raw ?? '').trim();
  if (!normalized) {
    return null;
  }

  const direct = normalized.match(/^([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/i);
  if (direct) {
    return {
      owner: direct[1].toLowerCase(),
      repo: direct[2].replace(/\.git$/i, '').toLowerCase()
    };
  }

  const githubUrl = normalized.match(/github\.com[:/]+([a-z0-9_.-]+)\/([a-z0-9_.-]+)/i);
  if (!githubUrl) {
    return null;
  }
  return {
    owner: githubUrl[1].toLowerCase(),
    repo: githubUrl[2].replace(/\.git$/i, '').toLowerCase()
  };
}

async function ensureSimulationRepoConnection({ apiBase, token, repoUrl, actor }) {
  const parsed = parseGithubOwnerRepoReference(repoUrl);
  const authSecretRef = String(process.env.SIM_GITHUB_SECRET_REF ?? 'providers.github_pat').trim();
  if (!parsed) {
    return {
      repoConnectionId: null,
      owner: null,
      repo: null,
      created: false,
      warning: 'repository_url_unparseable'
    };
  }

  const listed = await apiRequest(apiBase, token, 'GET', '/api/github/repos').catch(() => null);
  const repos = Array.isArray(listed?.repos) ? listed.repos : [];
  const existing = repos.find((entry) => {
    const owner = String(entry?.owner ?? '').toLowerCase();
    const repo = String(entry?.repo ?? '').toLowerCase();
    return owner === parsed.owner && repo === parsed.repo;
  });
  if (existing?.id) {
    let warning = null;
    if (authSecretRef && String(existing.authSecretRef ?? '').trim() !== authSecretRef) {
      try {
        await apiRequest(apiBase, token, 'PATCH', `/api/github/repos/${encodeURIComponent(String(existing.id))}`, {
          authSecretRef,
          enabled: true,
          actor,
          metadata: {
            source: 'ugothere_simulation',
            repoUrl: String(repoUrl ?? ''),
            authRefPatchedAt: new Date().toISOString()
          }
        });
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error);
      }
    }
    return {
      repoConnectionId: String(existing.id),
      owner: parsed.owner,
      repo: parsed.repo,
      created: false,
      warning
    };
  }

  if (!authSecretRef) {
    return {
      repoConnectionId: null,
      owner: parsed.owner,
      repo: parsed.repo,
      created: false,
      warning: 'missing_auth_secret_ref'
    };
  }

  try {
    const created = await apiRequest(apiBase, token, 'POST', '/api/github/repos', {
      owner: parsed.owner,
      repo: parsed.repo,
      authSecretRef,
      enabled: true,
      metadata: {
        source: 'ugothere_simulation',
        repoUrl: String(repoUrl ?? '')
      },
      actor
    });
    return {
      repoConnectionId: String(created?.repo?.id ?? ''),
      owner: parsed.owner,
      repo: parsed.repo,
      created: true,
      warning: created?.repo?.id ? null : 'repo_connection_not_returned'
    };
  } catch (error) {
    return {
      repoConnectionId: null,
      owner: parsed.owner,
      repo: parsed.repo,
      created: false,
      warning: error instanceof Error ? error.message : String(error)
    };
  }
}

async function waitForRunTerminal(baseUrl, token, runId, timeoutMs = 90_000, onPoll, options = {}) {
  const settleMsRaw = Number(options.retrySettleMs ?? 0);
  const retrySettleMs = Number.isFinite(settleMsRaw) ? Math.max(0, Math.floor(settleMsRaw)) : 0;
  const postTimeoutGraceMsRaw = Number(options.postTimeoutGraceMs ?? 0);
  const postTimeoutGraceMs = Number.isFinite(postTimeoutGraceMsRaw) ? Math.max(0, Math.floor(postTimeoutGraceMsRaw)) : 0;
  const abortOnTimeout = options.abortOnTimeout === true;
  const timeoutReason = typeof options.timeoutReason === 'string' && options.timeoutReason.trim().length > 0
    ? options.timeoutReason.trim()
    : 'simulation_timeout_guard';
  const deadline = Date.now() + timeoutMs;
  const seenRunIds = new Set([String(runId)]);
  let activeRunId = String(runId);
  let lastRun = null;
  let terminalCandidate = null;
  const isTerminalStatus = (status) => status === 'completed' || status === 'failed' || status === 'aborted';
  while (Date.now() < deadline) {
    const runBody = await apiRequest(baseUrl, token, 'GET', `/api/runs/${encodeURIComponent(activeRunId)}`);
    lastRun = runBody.run ?? lastRun;
    const runStatus = String(runBody.run?.status ?? lastRun?.status ?? '');
    const replacementRunId = String(runBody?.recovery?.replacementRunId ?? '').trim();
    if (replacementRunId && !seenRunIds.has(replacementRunId)) {
      seenRunIds.add(replacementRunId);
      activeRunId = replacementRunId;
      terminalCandidate = null;
      continue;
    }
    if (typeof onPoll === 'function') {
      await Promise.resolve(onPoll(runBody.run ?? lastRun)).catch(() => {});
    }
    if (runStatus === 'waiting_input') {
      return runBody.run;
    }
    if (isTerminalStatus(runStatus)) {
      if (!terminalCandidate || terminalCandidate.status !== runStatus) {
        terminalCandidate = {
          status: runStatus,
          firstSeenAt: Date.now()
        };
      }
      if (Date.now() - terminalCandidate.firstSeenAt >= retrySettleMs) {
        return runBody.run;
      }
    } else {
      terminalCandidate = null;
    }
    await sleep(400);
  }

  if (postTimeoutGraceMs > 0) {
    const graceDeadline = Date.now() + postTimeoutGraceMs;
    terminalCandidate = null;
    while (Date.now() < graceDeadline) {
      const runBody = await apiRequest(baseUrl, token, 'GET', `/api/runs/${encodeURIComponent(activeRunId)}`);
      lastRun = runBody.run ?? lastRun;
      const runStatus = String(runBody.run?.status ?? lastRun?.status ?? '');
      const replacementRunId = String(runBody?.recovery?.replacementRunId ?? '').trim();
      if (replacementRunId && !seenRunIds.has(replacementRunId)) {
        seenRunIds.add(replacementRunId);
        activeRunId = replacementRunId;
        terminalCandidate = null;
        continue;
      }
      if (typeof onPoll === 'function') {
        await Promise.resolve(onPoll(runBody.run ?? lastRun)).catch(() => {});
      }
      if (runStatus === 'waiting_input') {
        return runBody.run;
      }
      if (isTerminalStatus(runStatus)) {
        if (!terminalCandidate || terminalCandidate.status !== runStatus) {
          terminalCandidate = {
            status: runStatus,
            firstSeenAt: Date.now()
          };
        }
        if (Date.now() - terminalCandidate.firstSeenAt >= retrySettleMs) {
          return runBody.run;
        }
      } else {
        terminalCandidate = null;
      }
      await sleep(500);
    }
  }

  if (abortOnTimeout) {
    try {
      await apiRequest(baseUrl, token, 'POST', `/api/runs/${encodeURIComponent(activeRunId)}/abort`, {
        reason: timeoutReason
      });
    } catch {
      // best effort timeout guard
    }
  }

  try {
    const runBody = await apiRequest(baseUrl, token, 'GET', `/api/runs/${encodeURIComponent(activeRunId)}`);
    const run = runBody.run ?? lastRun;
    if (run) {
      const status = String(run.status ?? '');
      if (!isTerminalStatus(status)) {
        return {
          ...run,
          error: run.error ?? timeoutReason
        };
      }
      return run;
    }
    return { id: activeRunId, status: 'failed', error: timeoutReason };
  } catch {
    if (lastRun) {
      const status = String(lastRun.status ?? '');
      if (!isTerminalStatus(status)) {
        return {
          ...lastRun,
          error: lastRun.error ?? timeoutReason
        };
      }
      return lastRun;
    }
    return { id: activeRunId, status: 'failed', error: timeoutReason };
  }
}

function isSoftwareEngineerProfile(profile) {
  const id = String(profile?.id ?? '').toLowerCase();
  const title = String(profile?.title ?? '').toLowerCase();
  const name = String(profile?.name ?? '').toLowerCase();
  return id.includes('software-engineer') || id.includes('software_engineer') || title.includes('software engineer') || name.includes('software engineer');
}

function extractDelegatedReceiptIds(messages) {
  const delegated = [];
  for (const message of messages) {
    if (message.direction !== 'outbound') {
      continue;
    }
    const metadata = safeParseJson(message.metadataJson, {});
    if (metadata?.command === 'backlog_receipt' && metadata?.delegatedRunId) {
      delegated.push(String(metadata.delegatedRunId));
    }
  }
  return delegated;
}

function normalizeScenarioTask(task, index) {
  const id = String(task?.id ?? '').trim() || `simulation_task_${index + 1}`;
  const category = String(task?.category ?? 'feature').trim() || 'feature';
  const description = String(task?.description ?? `Simulation task ${index + 1}`).trim();
  const dependsOn = Array.isArray(task?.dependsOn)
    ? task.dependsOn.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0 && entry !== id)
    : [];
  const stepsRaw = Array.isArray(task?.steps)
    ? task.steps.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)
    : [];
  const criteriaRaw = Array.isArray(task?.criteria)
    ? task.criteria.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)
    : [];
  return {
    id,
    category,
    description,
    depends_on: Array.from(new Set(dependsOn)),
    steps:
      stepsRaw.length > 0
        ? stepsRaw
        : ['Implement scoped changes', 'Validate behavior with targeted checks', 'Summarize delivery evidence'],
    criteria:
      criteriaRaw.length > 0
        ? criteriaRaw
        : ['Example: expected behavior is validated', 'Negative: regression paths are blocked'],
    passes: false,
    priority: Math.max(30, 90 - index * 10)
  };
}

async function applySimulationRoutingMode({ mode }) {
  return {
    mode,
    applied: false,
    updatedLimits: null,
    previousLimits: null
  };
}

async function restoreSimulationRoutingMode({ state }) {
  if (!state?.applied) {
    return null;
  }
  return {
    restored: false
  };
}

function writeScenarioIntakeArtifacts({ scenario, runDir, intakePrompt }) {
  const dependencies = Array.isArray(scenario?.intake?.expectedDependencies) ? scenario.intake.expectedDependencies : [];
  const tasks = dependencies.map((task, index) => normalizeScenarioTask(task, index));
  const workspaceRepoRoot = path.resolve(String(scenario?.repo?.workspacePath ?? path.join(runDir, '..', 'workspace')));
  const agentsDir = path.join(workspaceRepoRoot, '.agents');
  const archivePlanPath =
    typeof scenario?.artifacts?.intakePlan === 'string' ? scenario.artifacts.intakePlan : path.join(runDir, 'intake-plan.md');
  const archivePrdPath =
    typeof scenario?.artifacts?.intakePrd === 'string' ? scenario.artifacts.intakePrd : path.join(runDir, 'intake-prd.md');
  const planPath = path.join(agentsDir, 'PLAN.md');
  const prdPath = path.join(agentsDir, 'PRD.md');
  const objective = String(scenario?.intake?.objective ?? 'Simulation intake objective').trim();
  const prompt = String(intakePrompt ?? scenario?.intake?.prompt ?? '').trim();
  fs.mkdirSync(agentsDir, { recursive: true });

  const planLines = [
    '# Ugothere Simulation Intake Plan',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Objective: ${objective}`,
    '',
    prompt ? `Operator request: ${prompt}` : '',
    '',
    'Task seed (intentionally empty unless scenario explicitly provides deterministic fixtures):',
    '```json',
    JSON.stringify(tasks, null, 2),
    '```',
    '',
    'Planning note:',
    '- In live simulation, task scope is generated from the operator request above via project-intake generate_and_sync.',
    '- The repository workspace `.agents/PLAN.md` is the primary planning target for this scenario.',
    ''
  ].filter((line) => line !== undefined);
  writeText(planPath, `${planLines.join('\n')}\n`);
  writeText(archivePlanPath, `${planLines.join('\n')}\n`);

  const prdLines = [
    '# Ugothere Simulation Intake PRD',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    '## Objective',
    objective,
    '',
    '## Operator Request',
    prompt || '(none)',
    '',
    '## Constraints',
    '- The linked repository workspace is the authoritative planning context for this run.',
    '- Archive copies are mirrored into the simulation artifact directory for later audit.',
    ''
  ];
  writeText(prdPath, `${prdLines.join('\n')}\n`);
  writeText(archivePrdPath, `${prdLines.join('\n')}\n`);

  return {
    planPath,
    prdPath,
    archivePlanPath,
    archivePrdPath,
    tasks
  };
}

function mirrorScenarioIntakeArtifactsToArchive(intakeArtifacts) {
  if (!intakeArtifacts || typeof intakeArtifacts !== 'object') {
    return;
  }
  const planPath = String(intakeArtifacts.planPath ?? '').trim();
  const prdPath = String(intakeArtifacts.prdPath ?? '').trim();
  const archivePlanPath = String(intakeArtifacts.archivePlanPath ?? '').trim();
  const archivePrdPath = String(intakeArtifacts.archivePrdPath ?? '').trim();

  if (planPath && archivePlanPath && planPath !== archivePlanPath && fs.existsSync(planPath)) {
    writeText(archivePlanPath, fs.readFileSync(planPath, 'utf8'));
  }
  if (prdPath && archivePrdPath && prdPath !== archivePrdPath && fs.existsSync(prdPath)) {
    writeText(archivePrdPath, fs.readFileSync(prdPath, 'utf8'));
  }
}

async function finalizeDispatchedItem({ apiBase, token, dispatch, run, repoRoot, repoConnectionId, baselineHead }) {
  const itemId = String(dispatch.itemId);
  const dispatchRunId = String(dispatch.runId);
  const observedRunId =
    typeof run?.id === 'string' && run.id.trim().length > 0 ? run.id.trim() : dispatchRunId;
  const targetAgentId = String(dispatch.targetAgentId);
  let latestRun = run;
  let authoritativeRunId = observedRunId;
  let backlogItem = null;
  let backlogDelivery = null;
  try {
    latestRun = await waitForRunTerminal(apiBase, token, authoritativeRunId, 120_000, undefined, {
      retrySettleMs: 1_500,
      postTimeoutGraceMs: 15_000
    });
    authoritativeRunId =
      typeof latestRun?.id === 'string' && latestRun.id.trim().length > 0 ? latestRun.id.trim() : authoritativeRunId;
  } catch {
    // keep finalization resilient; fall back to sampled run state
  }
  try {
    const itemBody = await apiRequest(apiBase, token, 'GET', `/api/backlog/items/${encodeURIComponent(itemId)}`);
    backlogItem = itemBody?.item ?? null;
    backlogDelivery = itemBody?.delivery ?? null;
  } catch {
    backlogItem = null;
    backlogDelivery = null;
  }
  const linkedRunId =
    typeof backlogItem?.linkedRunId === 'string' && backlogItem.linkedRunId.trim().length > 0
      ? backlogItem.linkedRunId.trim()
      : '';
  if (linkedRunId && linkedRunId !== authoritativeRunId) {
    try {
      latestRun = await waitForRunTerminal(apiBase, token, linkedRunId, 90_000, undefined, {
        retrySettleMs: 1_500,
        postTimeoutGraceMs: 15_000
      });
      authoritativeRunId =
        typeof latestRun?.id === 'string' && latestRun.id.trim().length > 0 ? latestRun.id.trim() : linkedRunId;
    } catch {
      authoritativeRunId = linkedRunId;
    }
  }
  const status = String(latestRun?.status ?? run.status ?? 'failed');
  const branchName = `sim/${targetAgentId}/${itemId.slice(0, 8)}`;
  const itemRepoRoot =
    typeof backlogItem?.repoRoot === 'string' && backlogItem.repoRoot.trim().length > 0
      ? backlogItem.repoRoot.trim()
      : repoRoot;
  const worktreeChangedFiles = readGitChangedFiles(itemRepoRoot);
  const currentHead = readGitHead(itemRepoRoot);
  const committedChangedFiles = baselineHead ? readGitCommittedFilesSinceRef(itemRepoRoot, baselineHead) : [];
  const changedFiles = committedChangedFiles.length > 0 ? committedChangedFiles : worktreeChangedFiles;
  const metadataCategory =
    typeof backlogItem?.metadata?.projectIntake?.category === 'string'
      ? backlogItem.metadata.projectIntake.category.toLowerCase()
      : '';
  const requiresCodeEvidence = DELIVERY_CODE_EVIDENCE_CATEGORIES.has(metadataCategory);
  const hasFreshCodeEvidence =
    changedFiles.length > 0 || (baselineHead && currentHead ? baselineHead !== currentHead : false);
  const deferredExecutionCompletion = looksLikeDeferredExecutionCompletion(
    [latestRun?.resultSummary, latestRun?.outputSummary, latestRun?.error, run?.resultSummary, run?.error]
      .map((entry) => String(entry ?? '').trim())
      .filter((entry) => entry.length > 0)
      .join('\n')
  );
  const existingDeliveryEvidence =
    backlogDelivery && (backlogDelivery.commitSha || backlogDelivery.prUrl || backlogDelivery.prNumber)
      ? {
          commitSha: backlogDelivery.commitSha ? String(backlogDelivery.commitSha) : null,
          prNumber:
            backlogDelivery.prNumber === null || backlogDelivery.prNumber === undefined
              ? null
              : Number.isFinite(Number(backlogDelivery.prNumber))
                ? Number(backlogDelivery.prNumber)
                : null,
          prUrl: backlogDelivery.prUrl ? String(backlogDelivery.prUrl) : null,
          branchName: backlogDelivery.branchName ? String(backlogDelivery.branchName) : branchName
        }
      : null;
  const deliveryEvidence = existingDeliveryEvidence;
  const commonMetadata = {
    simulation: true,
    delegatedRunId: authoritativeRunId,
    dispatchRunId,
    targetAgentId,
    repoRoot: itemRepoRoot,
    finalRunStatus: status,
    publish: {
      attempted: false,
      success: deliveryEvidence !== null,
      error: null,
      deliveryGroupManaged: Boolean(backlogItem?.deliveryGroupId),
      ...deliveryEvidence
    },
    evidence: {
      baselineHead: baselineHead ?? null,
      currentHead,
      changedFilesCount: changedFiles.length,
      changedFiles: changedFiles.slice(0, 50),
      category: metadataCategory || null,
      requiresCodeEvidence,
      deferredExecutionCompletion
    },
    recovery:
      authoritativeRunId !== dispatchRunId
        ? {
            originalDispatchRunId: dispatchRunId,
            authoritativeRunId
          }
        : null
  };

  if (
    status === 'completed' &&
    !deferredExecutionCompletion &&
    (!requiresCodeEvidence || hasFreshCodeEvidence || deliveryEvidence !== null)
  ) {
    await apiRequest(apiBase, token, 'POST', `/api/backlog/items/${encodeURIComponent(itemId)}/transition`, {
      toState: 'review',
      actor: 'simulation-bot',
      reason: 'Simulation delegated handover review gate',
      metadata: {
        source: 'simulation_handover',
        ...commonMetadata
      }
    }).catch(() => {});

    await apiRequest(apiBase, token, 'PUT', `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`, {
      ...(repoConnectionId ? { repoConnectionId } : {}),
      branchName: deliveryEvidence?.branchName ?? branchName,
      commitSha: deliveryEvidence?.commitSha ?? null,
      prNumber: deliveryEvidence?.prNumber ?? null,
      prUrl: deliveryEvidence?.prUrl ?? null,
      status: 'review',
      checks: {
        simulation: 'passed',
        handoverVerified: true,
        publishVerified: deliveryEvidence !== null,
        deliveryGroupManaged: Boolean(backlogItem?.deliveryGroupId)
      },
      metadata: {
        ...commonMetadata,
        completion:
          backlogItem?.deliveryGroupId
            ? 'awaiting_delivery_group_publish'
            : hasFreshCodeEvidence
              ? 'verified'
              : 'verified_existing_delivery'
      }
    }).catch(() => {});
    return;
  }

  const blockedReason =
    deferredExecutionCompletion
      ? `Simulation detected deferred execution output for run ${authoritativeRunId} instead of executed verification evidence`
      :
    status === 'completed' && requiresCodeEvidence && !hasFreshCodeEvidence
      ? 'Simulation completed without detectable repository code changes; blocked pending remediation'
      : `Simulation delegated run ended ${status}; blocked pending remediation`;

  await apiRequest(apiBase, token, 'PUT', `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`, {
    ...(repoConnectionId ? { repoConnectionId } : {}),
    branchName,
    status: 'blocked',
    checks: {
      simulation: 'failed',
      handoverVerified: false
    },
    metadata: {
      ...commonMetadata,
      completion: 'blocked'
    }
  }).catch(() => {});

  await apiRequest(apiBase, token, 'POST', `/api/backlog/items/${encodeURIComponent(itemId)}/transition`, {
    toState: 'blocked',
    actor: 'simulation-bot',
    reason: blockedReason,
    metadata: {
      source: 'simulation_handover',
      ...commonMetadata,
      remediationRequired: true
    }
  }).catch(() => {});
}

async function collectSubagentActivity({ apiBase, token, dispatch, run, taskId }) {
  const runId =
    typeof run?.id === 'string' && run.id.trim().length > 0 ? run.id.trim() : String(dispatch.runId);
  const sessionId = String(dispatch.targetSessionId);
  let terminalChunks = [];
  let terminalMeta = null;
  let timeline = [];
  let messages = [];
  let terminalError = null;
  let timelineError = null;
  let messagesError = null;

  try {
    const terminalBody = await apiRequest(apiBase, token, 'GET', `/api/runs/${encodeURIComponent(runId)}/terminal?limit=1500`);
    terminalChunks = Array.isArray(terminalBody.chunks) ? terminalBody.chunks : [];
    terminalMeta = terminalBody?.terminal ?? null;
  } catch (error) {
    terminalError = error instanceof Error ? error.message : String(error);
  }

  try {
    const timelineBody = await apiRequest(apiBase, token, 'GET', `/api/runs/${encodeURIComponent(runId)}/timeline`);
    timeline = Array.isArray(timelineBody.timeline) ? timelineBody.timeline : [];
  } catch (error) {
    timelineError = error instanceof Error ? error.message : String(error);
  }

  try {
    const messagesBody = await apiRequest(apiBase, token, 'GET', `/api/messages?sessionId=${encodeURIComponent(sessionId)}`);
    messages = Array.isArray(messagesBody.messages) ? messagesBody.messages : [];
  } catch (error) {
    messagesError = error instanceof Error ? error.message : String(error);
  }

  const joinedTerminal = terminalChunks.map((chunk) => String(chunk.chunk ?? '')).join('');
  const terminalPreview = joinedTerminal.length > 1200 ? joinedTerminal.slice(-1200) : joinedTerminal;
  const agentOutbound = messages.filter((message) => message.direction === 'outbound' && message.source === 'agent');
  const latestAgentMessage = agentOutbound.length > 0 ? String(agentOutbound[agentOutbound.length - 1]?.content ?? '') : '';

  return {
    runId,
    sessionId,
    itemId: String(dispatch.itemId),
    taskId,
    targetAgentId: String(dispatch.targetAgentId),
    status: String(run.status ?? 'unknown'),
    error: run.error ?? null,
    startedAt: run.startedAt ?? null,
    endedAt: run.endedAt ?? null,
    requestedRuntime: run.requestedRuntime ?? run.runtime ?? null,
    effectiveRuntime: run.effectiveRuntime ?? run.runtime ?? null,
    requestedModel: run.requestedModel ?? null,
    effectiveModel: run.effectiveModel ?? null,
    promptPreview: String(run.prompt ?? '').slice(0, 320),
    terminalMode: terminalMeta?.mode ? String(terminalMeta.mode) : null,
    terminalMuxSessionId: terminalMeta?.muxSessionId ? String(terminalMeta.muxSessionId) : null,
    terminalChunkCount: terminalChunks.length,
    terminalPreview,
    timelineEventCount: timeline.length,
    timelineKinds: timeline
      .slice(-25)
      .map((entry) => String(entry.type ?? entry.kind ?? ''))
      .filter((entry) => entry.length > 0),
    outboundAgentMessageCount: agentOutbound.length,
    latestAgentMessagePreview: latestAgentMessage.slice(0, 1000),
    evidenceCaptured: terminalChunks.length > 0 || agentOutbound.length > 0,
    captureErrors: {
      terminal: terminalError,
      timeline: timelineError,
      messages: messagesError
    }
  };
}

async function captureDeliverySnapshot({ apiBase, token, projectId, repoRoot }) {
  const backlogBody = await apiRequest(
    apiBase,
    token,
    'GET',
    `/api/backlog?projectId=${encodeURIComponent(projectId)}&repoRoot=${encodeURIComponent(repoRoot)}&limit=300`
  );
  const listed = Array.isArray(backlogBody.items) ? backlogBody.items : [];
  const detailed = [];
  for (const item of listed) {
    try {
      const detailsBody = await apiRequest(apiBase, token, 'GET', `/api/backlog/items/${encodeURIComponent(String(item.id))}`);
      detailed.push(detailsBody.item ?? item);
    } catch {
      detailed.push(item);
    }
  }
  const deliveryGroupIds = Array.from(
    new Set(
      detailed
        .map((item) =>
          typeof item?.deliveryGroupId === 'string' && item.deliveryGroupId.trim().length > 0 ? item.deliveryGroupId.trim() : null
        )
        .filter((groupId) => typeof groupId === 'string')
    )
  );
  const groups = [];
  for (const groupId of deliveryGroupIds) {
    try {
      const groupBody = await apiRequest(apiBase, token, 'GET', `/api/delivery-groups/${encodeURIComponent(groupId)}`);
      groups.push(groupBody.group ?? { id: groupId });
    } catch {
      groups.push({ id: groupId, status: 'unknown' });
    }
  }
  return {
    capturedAt: new Date().toISOString(),
    total: detailed.length,
    items: detailed,
    groups
  };
}

async function waitForDeliveryGroupsPublished({ apiBase, token, groupIds, timeoutMs }) {
  const uniqueGroupIds = Array.from(new Set(groupIds.filter((groupId) => typeof groupId === 'string' && groupId.trim().length > 0)));
  if (uniqueGroupIds.length === 0) {
    return [];
  }
  const deadline = Date.now() + Math.max(2_000, timeoutMs);
  while (Date.now() < deadline) {
    const statuses = await Promise.all(
      uniqueGroupIds.map(async (groupId) => {
        try {
          const statusBody = await apiRequest(apiBase, token, 'GET', `/api/delivery-groups/${encodeURIComponent(groupId)}/status`);
          return statusBody?.status ?? { deliveryGroupId: groupId, groupStatus: 'unknown', ready: false };
        } catch (error) {
          return {
            deliveryGroupId: groupId,
            groupStatus: 'error',
            ready: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    if (statuses.every((entry) => String(entry?.groupStatus ?? '') === 'published')) {
      return statuses;
    }
    await sleep(500);
  }
  return Promise.all(
    uniqueGroupIds.map(async (groupId) => {
      try {
        const statusBody = await apiRequest(apiBase, token, 'GET', `/api/delivery-groups/${encodeURIComponent(groupId)}/status`);
        return statusBody?.status ?? { deliveryGroupId: groupId, groupStatus: 'unknown', ready: false };
      } catch (error) {
        return {
          deliveryGroupId: groupId,
          groupStatus: 'error',
          ready: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    })
  );
}

async function closePublishedDeliveryGroupItems({ apiBase, token, groupIds }) {
  for (const groupId of Array.from(new Set(groupIds.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)))) {
    let groupBody = null;
    try {
      groupBody = await apiRequest(apiBase, token, 'GET', `/api/delivery-groups/${encodeURIComponent(groupId)}`);
    } catch {
      continue;
    }
    const group = groupBody?.group ?? null;
    if (!group || String(group.status ?? '') !== 'published') {
      continue;
    }
    const items = Array.isArray(groupBody?.items) ? groupBody.items : [];
    for (const item of items) {
      const state = String(item?.state ?? '');
      if (state === 'done' || state === 'archived' || !item?.id) {
        continue;
      }
      await apiRequest(apiBase, token, 'POST', `/api/backlog/items/${encodeURIComponent(String(item.id))}/transition`, {
        toState: 'done',
        actor: 'simulation-bot',
        reason: 'Simulation delivery group published',
        metadata: {
          source: 'simulation_delivery_group_publish',
          deliveryGroupId: groupId
        }
      }).catch(() => {});
    }
  }
}

async function openTelegramOriginSession({
  apiBase,
  token,
  prompt,
  senderId,
  senderHandle,
  chatId,
  topicId
}) {
  const buildPayload = () => ({
    update_id: Date.now(),
    message: {
      text: prompt,
      chat: {
        id: chatId,
        type: 'private'
      },
      from: {
        id: senderId,
        username: senderHandle
      },
      message_thread_id: topicId ?? undefined,
      mentioned: true
    }
  });

  const requestIngress = () => apiRequest(apiBase, token, 'POST', '/api/ingress/telegram', buildPayload());

  let ingress = await requestIngress();
  if (String(ingress?.status ?? '') === 'blocked' && String(ingress?.reason ?? '') === 'pairing_required') {
    await apiRequest(
      apiBase,
      token,
      'POST',
      `/api/pairings/telegram/${encodeURIComponent(String(senderId))}/approve`,
      { actor: 'simulation-bot' }
    ).catch(() => {});
    ingress = await requestIngress();
  }

  const status = String(ingress?.status ?? '');
  if (status === 'blocked') {
    throw new Error(`Telegram ingress blocked: ${String(ingress?.reason ?? 'unknown_reason')}`);
  }
  const sessionId = typeof ingress?.sessionId === 'string' ? ingress.sessionId : '';
  if (!sessionId) {
    throw new Error(`Telegram ingress did not return sessionId (status=${status || 'unknown'})`);
  }

  return {
    sessionId,
    runId: typeof ingress?.runId === 'string' ? ingress.runId : null,
    sessionKey: typeof ingress?.sessionKey === 'string' ? ingress.sessionKey : null,
    ingress
  };
}

function isSyntheticTelegramIdentity(input) {
  const senderId = String(input?.senderId ?? '').trim().toLowerCase();
  const senderHandle = String(input?.senderHandle ?? '').trim().toLowerCase();
  const chatId = String(input?.chatId ?? '').trim().toLowerCase();
  return (
    senderId.startsWith('sim-') ||
    senderHandle.startsWith('sim_') ||
    senderHandle.includes('synthetic') ||
    chatId.startsWith('sim-')
  );
}

async function autoResolveTelegramOriginIdentity({ apiBase, token, preferredSenderId }) {
  try {
    const sessionsBody = await apiRequest(apiBase, token, 'GET', '/api/sessions?limit=500');
    const sessions = Array.isArray(sessionsBody?.sessions) ? sessionsBody.sessions : [];
    const candidates = sessions
      .filter((session) => String(session?.channel ?? '') === 'telegram')
      .map((session) => {
        const metadata = safeParseJson(session?.metadataJson, {});
        return {
          sessionId: String(session?.id ?? ''),
          chatId: String(metadata?.chatId ?? '').trim(),
          senderId: String(metadata?.senderId ?? '').trim(),
          senderHandle: String(metadata?.senderHandle ?? '').trim(),
          lastActivityAt: String(session?.lastActivityAt ?? '')
        };
      })
      .filter((entry) => /^\d+$/.test(entry.chatId) && /^\d+$/.test(entry.senderId))
      .filter((entry) => !isSyntheticTelegramIdentity(entry))
      .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));

    const preferred = preferredSenderId
      ? candidates.find((entry) => entry.senderId === preferredSenderId)
      : null;
    return preferred ?? candidates[0] ?? null;
  } catch {
    return null;
  }
}

async function runLiveSimulation({
  apiBase,
  token,
  scenario,
  runDir,
  runTimeoutMs,
  maxTicks,
  intakeMode,
  intakeArtifacts,
  routingMode,
  origin
}) {
  const projectId =
    deriveSimulationProjectId({
      repoRoot: scenario?.repo?.workspacePath ?? null,
      repoUrl: scenario?.repo?.url ?? null,
      prompt: String(origin?.prompt ?? scenario?.intake?.prompt ?? '').trim()
    }) ?? 'ugothere-ai';
  const repoRoot = scenario.repo.workspacePath;
  const artifacts = {
    backlogSnapshots: [],
    dispatchLog: [],
    telegramTrace: [],
    runtimeStatus: [],
    subagentActivity: []
  };
  const runtimeConfig = await apiRequest(apiBase, token, 'GET', '/api/config/runtime').catch(() => null);
  const retryMaxDelayMsRaw = Number(runtimeConfig?.config?.queue?.retry?.maxDelayMs);
  const retryMaxAttemptsRaw = Number(runtimeConfig?.config?.queue?.retry?.maxAttempts);
  const retrySettleMs = Number.isFinite(retryMaxDelayMsRaw)
    ? Math.max(2_000, Math.min(60_000, Math.floor(retryMaxDelayMsRaw) + 2_000))
    : 20_000;
  const retryMaxAttempts = Number.isFinite(retryMaxAttemptsRaw) ? Math.max(1, Math.floor(retryMaxAttemptsRaw)) : 3;
  const postTimeoutGraceMs = Math.max(120_000, Math.min(360_000, retrySettleMs * retryMaxAttempts * 4));
  const restorationWarnings = [];
  const routingPolicyState = await applySimulationRoutingMode({
    apiBase,
    token,
    mode: routingMode
  });
  const selectedAgentSnapshots = [];
  let selectedAgents = [];
  let originSessionId = null;
  let originSessionChannel = 'internal';
  let repoConnection = {
    repoConnectionId: null,
    owner: null,
    repo: null,
    created: false,
    warning: null
  };

  const normalizeScopePath = (value) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }
    return path.resolve(value.trim());
  };

  const collectScopedSessionActivity = async (linkedOriginSessionId = null) => {
    const listed = await apiRequest(apiBase, token, 'GET', '/api/sessions?limit=500');
    const sessions = Array.isArray(listed?.sessions) ? listed.sessions : [];
    const normalizedRepoRoot = normalizeScopePath(repoRoot);
    const activeStatuses = new Set(['queued', 'accepted', 'running', 'waiting_input']);
    const scopedSessions = sessions.filter((session) => {
      const metadata = safeParseJson(session?.metadataJson ?? session?.metadata ?? {}, {});
      const linkedProjectId = String(metadata?.linkedProjectId ?? '').trim();
      const linkedRepoRoot = normalizeScopePath(metadata?.linkedRepoRoot ?? null);
      const delegatedFromSessionId = String(metadata?.delegatedFromSessionId ?? '').trim();
      return (
        (projectId && linkedProjectId === projectId) ||
        (normalizedRepoRoot && linkedRepoRoot === normalizedRepoRoot) ||
        (linkedOriginSessionId && delegatedFromSessionId === linkedOriginSessionId)
      );
    });
    const activeSessions = scopedSessions
      .map((session) => {
        const metadata = safeParseJson(session?.metadataJson ?? session?.metadata ?? {}, {});
        const lastRun = session?.lastRun ?? null;
        const lastRunStatus = String(lastRun?.status ?? '').trim();
        const activeRunId = String(session?.activeRunId ?? '').trim();
        const isActive = activeRunId.length > 0 || activeStatuses.has(lastRunStatus);
        if (!isActive) {
          return null;
        }
        return {
          sessionId: String(session?.id ?? ''),
          sessionKey: String(session?.sessionKey ?? ''),
          agentId: String(session?.agentId ?? ''),
          activeRunId: activeRunId || String(lastRun?.id ?? ''),
          runStatus: activeRunId.length > 0 ? lastRunStatus || 'running' : lastRunStatus || 'running',
          linkedProjectId: String(metadata?.linkedProjectId ?? ''),
          linkedRepoRoot: normalizeScopePath(metadata?.linkedRepoRoot ?? null) ?? null
        };
      })
      .filter(Boolean);
    return {
      total: scopedSessions.length,
      active: activeSessions
    };
  };

  const abortScopedActiveRuns = async (reason) => {
    const scopedActivity = await collectScopedSessionActivity();
    const activeEntries = Array.isArray(scopedActivity.active) ? scopedActivity.active : [];
    const activeStatuses = new Set(['queued', 'accepted', 'running', 'waiting_input']);
    for (const entry of activeEntries) {
      const runId = String(entry?.activeRunId ?? '').trim();
      const runStatus = String(entry?.runStatus ?? '').trim();
      if (!runId || !activeStatuses.has(runStatus)) {
        continue;
      }
      try {
        await apiRequest(apiBase, token, 'POST', `/api/runs/${encodeURIComponent(runId)}/abort`, {
          actor: 'simulation-bot',
          reason
        });
        await waitForRunTerminal(apiBase, token, runId, 30_000, undefined, {
          retrySettleMs,
          postTimeoutGraceMs
        }).catch((error) => {
          restorationWarnings.push({
            stage: 'abort_scoped_run_wait',
            runId,
            error: error instanceof Error ? error.message : String(error)
          });
          return null;
        });
      } catch (error) {
        restorationWarnings.push({
          stage: 'abort_scoped_run',
          runId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  };

  try {
    await abortScopedActiveRuns('simulation_scope_reset');

    await apiRequest(apiBase, token, 'POST', '/api/backlog/cleanup', {
      actor: 'simulation-bot',
      projectId,
      repoRoot
    });

    await apiRequest(apiBase, token, 'POST', '/api/onboarding/ceo-baseline', {
      actor: 'simulation-bot'
    });

    const agentsBody = await apiRequest(apiBase, token, 'GET', '/api/agents/profiles');
    const allAgents = Array.isArray(agentsBody.agents) ? agentsBody.agents : [];
    let ceoAgent =
      allAgents.find((agent) => String(agent.id ?? '').toLowerCase() === 'ceo') ??
      allAgents.find((agent) => String(agent.id ?? '').toLowerCase() === 'ceo-default') ??
      allAgents.find((agent) => String(agent.id ?? '').toLowerCase().includes('ceo')) ??
      null;
    if (!ceoAgent?.id) {
      const fallbackCeoId = 'ceo-simulation';
      await apiRequest(apiBase, token, 'POST', '/api/agents/profiles', {
        id: fallbackCeoId,
        name: 'Simulation CEO',
        title: 'Chief Executive Officer',
        systemPrompt:
          'You are the executive orchestrator for simulation runs. Plan clearly, delegate safely, and report outcomes.',
        defaultRuntime: 'process',
        defaultModel: 'default',
        allowedRuntimes: ['process', 'codex', 'claude', 'gemini'],
        skills: ['planning', 'delegation'],
        tools: ['runtime:process', 'runtime:codex', 'runtime:claude', 'runtime:gemini']
      }).catch(() => null);

      const refreshedAgentsBody = await apiRequest(apiBase, token, 'GET', '/api/agents/profiles').catch(() => null);
      const refreshedAgents = Array.isArray(refreshedAgentsBody?.agents) ? refreshedAgentsBody.agents : [];
      ceoAgent =
        refreshedAgents.find((agent) => String(agent.id ?? '').toLowerCase() === fallbackCeoId) ??
        refreshedAgents.find((agent) => String(agent.id ?? '').toLowerCase().includes('ceo')) ??
        null;
    }
    if (!ceoAgent?.id) {
      throw new Error('No CEO agent profile available for simulation bootstrap');
    }

    const workerAgents = allAgents.filter((agent) => {
      const id = String(agent.id ?? '').toLowerCase();
      const title = String(agent.title ?? '').toLowerCase();
      return !id.includes('ceo') && !title.includes('chief');
    });
    if (workerAgents.length === 0) {
      throw new Error('No worker agent profiles available for delegated ugothere simulation');
    }
    const preferredEngineer =
      workerAgents.find((agent) => isSoftwareEngineerProfile(agent)) ??
      workerAgents.find((agent) => String(agent.id ?? '').trim().length > 0) ??
      null;
    selectedAgents = preferredEngineer ? [preferredEngineer] : workerAgents.slice(0, 1);
    for (const agent of selectedAgents) {
      selectedAgentSnapshots.push({
        id: String(agent.id),
        executionMode: agent.executionMode,
        defaultRuntime: agent.defaultRuntime,
        defaultModel: agent.defaultModel ?? null,
        allowedRuntimes: Array.isArray(agent.allowedRuntimes) ? agent.allowedRuntimes : [],
        harnessRuntime: agent.harnessRuntime ?? null,
        harnessAutoStart: Boolean(agent.harnessAutoStart),
        name: agent.name,
        title: agent.title,
        systemPrompt: agent.systemPrompt
      });
      const softwareEngineer = isSoftwareEngineerProfile(agent);
      await apiRequest(
        apiBase,
        token,
        'PATCH',
        `/api/agents/profiles/${encodeURIComponent(String(agent.id))}`,
        softwareEngineer
          ? {
              executionMode: 'on_demand',
              defaultRuntime: 'codex',
              defaultModel: null,
              harnessRuntime: 'codex',
              harnessAutoStart: false,
              allowedRuntimes: ['codex', 'process', 'claude', 'gemini']
            }
          : {
              executionMode: 'on_demand'
            }
      );
    }

    repoConnection = await ensureSimulationRepoConnection({
      apiBase,
      token,
      repoUrl: scenario?.repo?.url ?? '',
      actor: 'simulation-bot'
    });
    if (repoConnection.warning) {
      restorationWarnings.push({
        stage: 'repo_connection',
        warning: repoConnection.warning
      });
    }

    if (origin.channel === 'telegram') {
      let telegramIdentity = {
        senderId: String(origin.telegram?.senderId ?? 'sim-operator-001'),
        senderHandle: String(origin.telegram?.senderHandle ?? 'sim_operator'),
        chatId: String(origin.telegram?.chatId ?? 'sim-chat-001'),
        topicId: origin.telegram?.topicId ?? null
      };
      if (isSyntheticTelegramIdentity(telegramIdentity)) {
        const autoResolved = await autoResolveTelegramOriginIdentity({
          apiBase,
          token,
          preferredSenderId: /^\d+$/.test(telegramIdentity.senderId) ? telegramIdentity.senderId : null
        });
        if (autoResolved) {
          telegramIdentity = {
            ...telegramIdentity,
            senderId: autoResolved.senderId,
            senderHandle: autoResolved.senderHandle,
            chatId: autoResolved.chatId
          };
          artifacts.runtimeStatus.push({
            originAutoResolve: {
              mode: 'auto_resolved_existing_telegram_session',
              sessionId: autoResolved.sessionId,
              senderId: autoResolved.senderId,
              chatId: autoResolved.chatId
            }
          });
        } else {
          restorationWarnings.push({
            stage: 'origin_resolution',
            warning: 'synthetic_telegram_identity_in_use'
          });
        }
      }
      const telegramOrigin = await openTelegramOriginSession({
        apiBase,
        token,
        prompt: String(origin.prompt ?? scenario?.intake?.prompt ?? '').trim(),
        senderId: telegramIdentity.senderId,
        senderHandle: telegramIdentity.senderHandle,
        chatId: telegramIdentity.chatId,
        topicId: telegramIdentity.topicId
      });
      originSessionId = String(telegramOrigin.sessionId);
      originSessionChannel = 'telegram';
      artifacts.runtimeStatus.push({
        origin: {
          channel: 'telegram',
          sessionId: originSessionId,
          runId: telegramOrigin.runId,
          sessionKey: telegramOrigin.sessionKey,
          status: telegramOrigin.ingress?.status ?? null
        }
      });
      if (telegramOrigin.runId) {
        const originRun = await waitForRunTerminal(
          apiBase,
          token,
          telegramOrigin.runId,
          Math.min(runTimeoutMs, 45_000),
          undefined,
          {
            retrySettleMs,
            postTimeoutGraceMs
          }
        );
        artifacts.runtimeStatus.push({
          originRun
        });
      }
    } else {
      const sessionBody = await apiRequest(apiBase, token, 'POST', '/api/sessions', {
        label: 'ugothere-origin',
        agentId: String(ceoAgent.id),
        runtime: 'process',
        model: 'default'
      });
      originSessionId = String(sessionBody.session.id);
      originSessionChannel = String(sessionBody.session.channel ?? 'internal');
    }

  const intakeWarnings = [];
  let intakeBody = null;
  let generationBody = null;
  let generationRunId = null;
  const forceDirectIntake = String(process.env.SIM_FORCE_DIRECT_INTAKE ?? '').trim().toLowerCase() === 'true';
  const allowDirectIntake = forceDirectIntake || origin.channel !== 'telegram';

  if (!allowDirectIntake) {
    intakeWarnings.push({
      stage: 'direct_intake_skipped',
      reason: 'telegram_origin_relies_on_ceo_orchestration'
    });
  } else if (intakeMode === 'generate_and_sync') {
    try {
      generationBody = await apiRequest(apiBase, token, 'POST', '/api/backlog/project-intake', {
        mode: 'generate_and_sync',
        actor: 'simulation-bot',
        prompt: String(origin?.prompt ?? scenario?.intake?.prompt ?? '').trim(),
        planPath: intakeArtifacts.planPath,
        prdPath: intakeArtifacts.prdPath,
        projectId,
        repoRoot,
        linkedSessionId: originSessionId,
        waitForGeneration: true,
        generationTimeoutMs: Math.max(runTimeoutMs, 180_000)
      });
      generationRunId = String(generationBody?.pipeline?.generationRunId ?? '').trim() || null;
      if (generationRunId) {
        const generationRun = await waitForRunTerminal(apiBase, token, generationRunId, 15_000, undefined, {
          retrySettleMs,
          postTimeoutGraceMs
        });
        artifacts.runtimeStatus.push({
          intakeGenerationRun: generationRun
        });
        if (generationRun.status !== 'completed') {
          intakeWarnings.push({
            stage: 'generate_and_sync_terminal_status',
            runId: generationRunId,
            status: generationRun.status,
            error: generationRun.error ?? null
          });
        }
      } else {
        intakeWarnings.push({
          stage: 'generate_and_sync',
          warning: 'missing_generation_run_id'
        });
      }
      if (generationBody?.sync?.deferred !== true && Number(generationBody?.sync?.parsedTasks ?? 0) > 0) {
        intakeBody = generationBody;
      }
    } catch (error) {
      intakeWarnings.push({
        stage: 'generate_and_sync',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

    const syncIntake = async () =>
      apiRequest(apiBase, token, 'POST', '/api/backlog/project-intake', {
        mode: 'sync_only',
        actor: 'simulation-bot',
        planPath: intakeArtifacts.planPath,
        prdPath: intakeArtifacts.prdPath,
        projectId,
        repoRoot,
        linkedSessionId: originSessionId
      });

    if (allowDirectIntake && !intakeBody) {
      try {
        intakeBody = await syncIntake();
      } catch (error) {
        if (intakeMode === 'generate_and_sync' && generationRunId) {
          intakeWarnings.push({
            stage: 'sync_only_initial',
            error: error instanceof Error ? error.message : String(error)
          });
          await sleep(1_200);
          intakeBody = await syncIntake();
        } else {
          throw error;
        }
      }
    }

    const collectMappedEntriesFromBacklog = async () => {
      const deadline = Date.now() + Math.min(runTimeoutMs, 240_000);
      let quietPolls = 0;
      while (Date.now() < deadline) {
        const listed = await apiRequest(
          apiBase,
          token,
          'GET',
          `/api/backlog?projectId=${encodeURIComponent(projectId)}&repoRoot=${encodeURIComponent(repoRoot)}&limit=300`
        );
        const items = Array.isArray(listed?.items) ? listed.items : [];
        const mapped = items
          .map((item) => {
            const metadata = safeParseJson(item?.metadataJson, item?.metadata ?? {});
            const projectIntake = metadata?.projectIntake ?? {};
            const taskId = String(projectIntake?.planTaskId ?? metadata?.planTaskId ?? '').trim();
            const itemId = String(item?.id ?? '').trim();
            if (!taskId || !itemId) {
              return null;
            }
            return {
              taskId,
              itemId,
              state: String(item?.state ?? 'planned')
            };
          })
          .filter(Boolean);
        if (mapped.length > 0) {
          return {
            pipeline: {
              mode: 'telegram_ceo_managed'
            },
            sync: {
              mapped,
              parsedTasks: mapped.length,
              created: mapped.length,
              updated: 0,
              dependencySets: 0,
              unresolvedDependencies: []
            }
          };
        }
        const scopedActivity = await collectScopedSessionActivity(originSessionId).catch(() => ({
          total: 0,
          active: []
        }));
        if (Array.isArray(scopedActivity.active) && scopedActivity.active.length > 0) {
          quietPolls = 0;
          await sleep(1_500);
          continue;
        }
        quietPolls += 1;
        if (quietPolls < 5) {
          await sleep(1_200);
          continue;
        }
        await sleep(1_200);
      }
      return null;
    };

    if (!allowDirectIntake && !intakeBody) {
      intakeBody = await collectMappedEntriesFromBacklog();
    }

    const intakeUsedMode = !allowDirectIntake
      ? 'telegram_ceo_managed'
      : intakeMode === 'generate_and_sync'
        ? intakeBody === generationBody
          ? 'generate_and_sync'
          : 'generate_and_sync+sync_only'
        : intakeBody?.pipeline?.mode ?? 'sync_only';

    mirrorScenarioIntakeArtifactsToArchive(intakeArtifacts);

    writeJson(scenario.artifacts.intakeSync, {
      requestedMode: intakeMode,
      usedMode: intakeUsedMode,
      generation: generationBody,
      warnings: intakeWarnings,
      response: intakeBody
    });

    const mappedEntries = Array.isArray(intakeBody?.sync?.mapped) ? intakeBody.sync.mapped : [];
    if (mappedEntries.length === 0) {
      throw new Error('Project intake returned zero mapped backlog items for ugothere simulation');
    }

    const taskIdByItemId = new Map();
    const assignmentRecords = [];
    const assignmentByItemId = new Map();
    for (const entry of mappedEntries) {
      const itemId = String(entry.itemId);
      const taskId = String(entry.taskId ?? '');
      taskIdByItemId.set(itemId, taskId);
      const assignmentRecord = {
        itemId,
        taskId,
        assignedAgentId: null,
        assignedAgentTitle: null,
        reason: 'delegation_deferred_to_ceo_router',
        mode: 'ceo_orchestrator_tick',
        context: null
      };
      assignmentRecords.push(assignmentRecord);
      assignmentByItemId.set(itemId, assignmentRecord);
      await apiRequest(apiBase, token, 'PATCH', `/api/backlog/items/${encodeURIComponent(itemId)}`, {
        linkedSessionId: originSessionId
      });
      if (repoConnection.repoConnectionId) {
        await apiRequest(apiBase, token, 'PUT', `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`, {
          repoConnectionId: repoConnection.repoConnectionId,
          status: 'planned',
          metadata: {
            simulation: true,
            repoRoot,
            sourceRepoUrl: scenario?.repo?.url ?? null
          }
        }).catch(() => {});
      }
    }

    await apiRequest(apiBase, token, 'PUT', '/api/backlog/orchestration', {
      enabled: true,
      paused: false,
      maxParallel: 3,
      wipLimit: 3,
      escalationMode: 'notify',
      projectCaps: {
        [projectId]: 3
      },
      projectPriorityBias: {
        [projectId]: 5
      }
    });

    const dispatchedRunIds = new Set();
    const runDispatchById = new Map();
    const baselineHeadByRunId = new Map();
    const terminalRuns = [];
    const reconcileLinkedInProgressItem = async (item, reconciliationTag) => {
      const state = String(item?.state ?? '');
      const linkedRunId = typeof item?.linkedRunId === 'string' ? item.linkedRunId : '';
      if (state !== 'in_progress' || !linkedRunId || dispatchedRunIds.has(linkedRunId)) {
        return false;
      }

      const syntheticDispatch = {
        itemId: String(item.id),
        runId: linkedRunId,
        targetAgentId: String(item.assignedAgentId ?? 'unknown-agent'),
        targetSessionId: String(item.linkedSessionId ?? '')
      };
      dispatchedRunIds.add(linkedRunId);
      runDispatchById.set(linkedRunId, syntheticDispatch);
      baselineHeadByRunId.set(linkedRunId, readGitHead(repoRoot));

      const run = await waitForRunTerminal(apiBase, token, linkedRunId, runTimeoutMs, undefined, {
        retrySettleMs,
        postTimeoutGraceMs
      });
      terminalRuns.push(run);
      artifacts.runtimeStatus.push({
        dispatch: syntheticDispatch,
        run,
        reconciliation: reconciliationTag
      });
      const activity = await collectSubagentActivity({
        apiBase,
        token,
        dispatch: syntheticDispatch,
        run,
        taskId: taskIdByItemId.get(String(item.id)) ?? null
      });
      artifacts.subagentActivity.push(activity);
      await finalizeDispatchedItem({
        apiBase,
        token,
        dispatch: syntheticDispatch,
        run,
        repoRoot,
        repoConnectionId: repoConnection.repoConnectionId,
        baselineHead: baselineHeadByRunId.get(linkedRunId) ?? null
      });
      return true;
    };

    for (let tick = 0; tick < maxTicks; tick += 1) {
      const tickBody = await apiRequest(apiBase, token, 'POST', '/api/backlog/orchestration/tick', {
        actor: 'simulation-bot',
        projectId,
        repoRoot
      });
      artifacts.dispatchLog.push({
        tick,
        at: new Date().toISOString(),
        dispatched: tickBody.dispatched,
        skipped: tickBody.skipped,
        control: tickBody.control,
        dispatchPolicy: tickBody.dispatchPolicy
      });

      for (const dispatch of tickBody.dispatched ?? []) {
        const runId = String(dispatch.runId);
        dispatchedRunIds.add(runId);
        runDispatchById.set(runId, dispatch);
        baselineHeadByRunId.set(runId, readGitHead(repoRoot));

        await apiRequest(apiBase, token, 'PUT', `/api/backlog/items/${encodeURIComponent(String(dispatch.itemId))}/delivery`, {
          ...(repoConnection.repoConnectionId ? { repoConnectionId: repoConnection.repoConnectionId } : {}),
          status: 'in_progress',
          metadata: {
            simulation: true,
            delegatedRunId: dispatch.runId,
            targetAgentId: dispatch.targetAgentId,
            repoRoot,
            taskId: taskIdByItemId.get(String(dispatch.itemId)) ?? null
          }
        }).catch(() => {});

        const monitorSnapshots = [];
        let monitorPollCount = 0;
        const run = await waitForRunTerminal(
          apiBase,
          token,
          runId,
          runTimeoutMs,
          async (polledRun) => {
            monitorPollCount += 1;
            if (monitorPollCount % 5 !== 0) {
              return;
            }
            const sampled = {
              at: new Date().toISOString(),
              status: String(polledRun?.status ?? 'unknown'),
              runtime: polledRun?.runtime ? String(polledRun.runtime) : null,
              effectiveRuntime: polledRun?.effectiveRuntime ? String(polledRun.effectiveRuntime) : null,
              heartbeat: null,
              terminalMode: null,
              muxSessionId: null
            };
            try {
              const livenessBody = await apiRequest(apiBase, token, 'GET', `/api/runs/${encodeURIComponent(runId)}/liveness`);
              sampled.heartbeat = String(livenessBody.heartbeat ?? livenessBody.runStatus ?? 'unknown');
            } catch {
              // keep monitor resilient
            }
            try {
              const terminalBody = await apiRequest(apiBase, token, 'GET', `/api/runs/${encodeURIComponent(runId)}/terminal?limit=1`);
              sampled.terminalMode = terminalBody?.terminal?.mode ? String(terminalBody.terminal.mode) : null;
              sampled.muxSessionId = terminalBody?.terminal?.muxSessionId ? String(terminalBody.terminal.muxSessionId) : null;
            } catch {
              // keep monitor resilient
            }
            monitorSnapshots.push(sampled);
          },
          {
            retrySettleMs,
            postTimeoutGraceMs
          }
        );
        terminalRuns.push(run);

        let liveness = null;
        try {
          liveness = await apiRequest(apiBase, token, 'GET', `/api/runs/${encodeURIComponent(runId)}/liveness`);
        } catch (error) {
          liveness = {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
        artifacts.runtimeStatus.push({
          dispatch,
          run,
          liveness,
          monitorSnapshots
        });

        const activity = await collectSubagentActivity({
          apiBase,
          token,
          dispatch,
          run,
          taskId: taskIdByItemId.get(String(dispatch.itemId)) ?? null
        });
        artifacts.subagentActivity.push(activity);

        await finalizeDispatchedItem({
          apiBase,
          token,
          dispatch,
          run,
          repoRoot,
          repoConnectionId: repoConnection.repoConnectionId,
          baselineHead: baselineHeadByRunId.get(runId) ?? null
        });
      }

      const backlogBody = await apiRequest(
        apiBase,
        token,
        'GET',
        `/api/backlog?projectId=${encodeURIComponent(projectId)}&repoRoot=${encodeURIComponent(repoRoot)}&limit=300`
      );
      artifacts.backlogSnapshots.push({
        tick,
        at: new Date().toISOString(),
        items: backlogBody.items
      });

      let listedItems = Array.isArray(backlogBody.items) ? backlogBody.items : [];
      const orphanInProgressItems = listedItems.filter((item) => {
        const state = String(item?.state ?? '');
        const linkedRunId = typeof item?.linkedRunId === 'string' ? item.linkedRunId : '';
        return state === 'in_progress' && linkedRunId.length > 0 && !dispatchedRunIds.has(linkedRunId);
      });
      for (const item of orphanInProgressItems) {
        await reconcileLinkedInProgressItem(item, `tick_${tick}_linked_run`);
      }
      if (orphanInProgressItems.length > 0) {
        const refreshedBacklog = await apiRequest(
          apiBase,
          token,
          'GET',
          `/api/backlog?projectId=${encodeURIComponent(projectId)}&repoRoot=${encodeURIComponent(repoRoot)}&limit=300`
        );
        listedItems = Array.isArray(refreshedBacklog.items) ? refreshedBacklog.items : [];
        artifacts.backlogSnapshots.push({
          tick,
          phase: 'post_orphan_reconciliation',
          at: new Date().toISOString(),
          items: refreshedBacklog.items
        });
      }

      const allDone =
        listedItems.length > 0 && listedItems.every((item) => ['done', 'archived'].includes(String(item.state ?? '')));
      if (allDone) {
        break;
      }
      const hasActiveWork = listedItems.some((item) => {
        const state = String(item?.state ?? '');
        return state === 'in_progress' || state === 'planned' || state === 'triage' || state === 'idea';
      });
      if ((tickBody.dispatched ?? []).length === 0 && !hasActiveWork && tick > Math.max(6, mappedEntries.length + 2)) {
        break;
      }
      await sleep(500);
    }

    const postLoopBacklog = await apiRequest(
      apiBase,
      token,
      'GET',
      `/api/backlog?projectId=${encodeURIComponent(projectId)}&repoRoot=${encodeURIComponent(repoRoot)}&limit=300`
    );
    const postLoopItems = Array.isArray(postLoopBacklog.items) ? postLoopBacklog.items : [];
    for (const item of postLoopItems) {
      await reconcileLinkedInProgressItem(item, 'post_loop_linked_run');
    }
    const deliveryGroupStatuses = await waitForDeliveryGroupsPublished({
      apiBase,
      token,
      groupIds: postLoopItems
        .map((item) =>
          typeof item?.deliveryGroupId === 'string' && item.deliveryGroupId.trim().length > 0 ? item.deliveryGroupId.trim() : null
        )
        .filter((groupId) => typeof groupId === 'string'),
      timeoutMs: Math.min(runTimeoutMs, 30_000)
    });
    await closePublishedDeliveryGroupItems({
      apiBase,
      token,
      groupIds: deliveryGroupStatuses
        .filter((entry) => String(entry?.groupStatus ?? '') === 'published')
        .map((entry) => String(entry.deliveryGroupId ?? ''))
    });

    const deliverySnapshot = await captureDeliverySnapshot({
      apiBase,
      token,
      projectId,
      repoRoot
    });
    writeJson(scenario.artifacts.deliverySnapshot, deliverySnapshot);

    const messagesBody = await apiRequest(
      apiBase,
      token,
      'GET',
      `/api/messages?sessionId=${encodeURIComponent(originSessionId)}`
    );
    artifacts.telegramTrace = Array.isArray(messagesBody.messages) ? messagesBody.messages : [];

    writeJson(scenario.artifacts.backlogSnapshots, artifacts.backlogSnapshots);
    writeJson(scenario.artifacts.dispatchLog, artifacts.dispatchLog);
    writeJson(scenario.artifacts.runtimeStatus, artifacts.runtimeStatus);
    writeJson(scenario.artifacts.subagentActivity, artifacts.subagentActivity);
    writeJson(scenario.artifacts.telegramTrace, artifacts.telegramTrace);

    const delegatedReceipts = extractDelegatedReceiptIds(artifacts.telegramTrace);
    const dispatchEntries = Array.from(runDispatchById.values()).map((entry) => ({
      runId: String(entry.runId),
      itemId: String(entry.itemId),
      targetAgentId: String(entry.targetAgentId ?? '')
    }));
    const uniqueDelegatedAgents = new Set(
      dispatchEntries
        .map((entry) => entry.targetAgentId)
        .filter((agentId) => agentId.length > 0 && agentId !== 'unknown-agent')
    );
    const observedDispatchOrder = [];
    const observedItemIds = new Set();
    for (const entry of dispatchEntries) {
      if (observedItemIds.has(entry.itemId)) {
        continue;
      }
      observedItemIds.add(entry.itemId);
      observedDispatchOrder.push(entry.itemId);
    }
    const dispatchByItemId = new Map(dispatchEntries.map((entry) => [entry.itemId, entry]));
    const observedDispatchTasks = observedDispatchOrder
      .map((itemId) => taskIdByItemId.get(itemId) ?? null)
      .filter((taskId) => typeof taskId === 'string');
    const expectedEdges = intakeArtifacts.tasks.flatMap((task) => task.depends_on.map((dependsOn) => `${dependsOn} -> ${task.id}`));

    const deliveryStatusCounts = {};
    for (const item of deliverySnapshot.items ?? []) {
      const deliveryStatus = String(item?.delivery?.status ?? 'none');
      deliveryStatusCounts[deliveryStatus] = (deliveryStatusCounts[deliveryStatus] ?? 0) + 1;
    }
    const deliveryItems = (deliverySnapshot.items ?? []).map((item) => ({
      itemId: String(item?.id ?? ''),
      title: String(item?.title ?? ''),
      state: String(item?.state ?? ''),
      assignedAgentId: item?.assignedAgentId ? String(item.assignedAgentId) : null,
      delivery: item?.delivery
        ? {
            status: String(item.delivery.status ?? ''),
            repoConnectionId: item.delivery.repoConnectionId ? String(item.delivery.repoConnectionId) : null,
            branchName: item.delivery.branchName ? String(item.delivery.branchName) : null,
            commitSha: item.delivery.commitSha ? String(item.delivery.commitSha) : null,
            prNumber:
              item.delivery.prNumber === null || item.delivery.prNumber === undefined
                ? null
                : Number.isFinite(Number(item.delivery.prNumber))
                  ? Number(item.delivery.prNumber)
                  : null,
            prUrl: item.delivery.prUrl ? String(item.delivery.prUrl) : null,
            workspacePath: item.delivery.metadata?.artifacts?.workspacePath ?? null,
            latestDelegatedRun: item.delivery.metadata?.latestDelegatedRun ?? null
          }
        : null
    }));
    const nonDoneItems = (deliverySnapshot.items ?? [])
      .filter((item) => !['done', 'archived'].includes(String(item?.state ?? '')))
      .map((item) => ({
        itemId: String(item?.id ?? ''),
        taskId: taskIdByItemId.get(String(item?.id ?? '')) ?? null,
        title: String(item?.title ?? ''),
        state: String(item?.state ?? ''),
        blockedReason: item?.blockedReason ? String(item.blockedReason) : null,
        assignedAgentId: item?.assignedAgentId ? String(item.assignedAgentId) : null,
        linkedRunId: item?.linkedRunId ? String(item.linkedRunId) : null,
        deliveryStatus: item?.delivery?.status ? String(item.delivery.status) : null
      }));
    const allTasksDone = nonDoneItems.length === 0 && Number(deliverySnapshot.total ?? 0) > 0;
    const deliveryByItemId = new Map((deliverySnapshot.items ?? []).map((entry) => [String(entry?.id ?? ''), entry]));
    const agentTitleById = new Map(
      allAgents.map((agent) => [
        String(agent?.id ?? ''),
        String(agent?.title ?? agent?.name ?? agent?.id ?? '')
      ])
    );
    const assignmentDecisions = assignmentRecords.map((assignment) => {
      const deliveredItem = deliveryByItemId.get(assignment.itemId) ?? null;
      const orchestration = deliveredItem?.metadata?.orchestration ?? {};
      const finalAssignedAgentId =
        deliveredItem?.assignedAgentId && String(deliveredItem.assignedAgentId).trim().length > 0
          ? String(deliveredItem.assignedAgentId)
          : assignment.assignedAgentId;
      const finalReason =
        typeof orchestration.targetReason === 'string'
          ? orchestration.targetReason
          : assignment.reason;
      const finalContext =
        deliveredItem?.linkedRunId && String(deliveredItem.linkedRunId).trim().length > 0
          ? {
              linkedRunId: String(deliveredItem.linkedRunId),
              state: String(deliveredItem.state ?? 'unknown')
            }
          : assignment.context;
      return {
        ...assignment,
        assignedAgentId: finalAssignedAgentId,
        assignedAgentTitle: finalAssignedAgentId
          ? agentTitleById.get(finalAssignedAgentId) ?? assignment.assignedAgentTitle ?? finalAssignedAgentId
          : assignment.assignedAgentTitle,
        reason: finalReason,
        context: finalContext
      };
    });
    const dispatchReasoning = observedDispatchOrder.map((itemId) => {
      const assignment = assignmentByItemId.get(itemId) ?? null;
      const deliveredItem = deliveryByItemId.get(itemId) ?? null;
      const orchestration = deliveredItem?.metadata?.orchestration ?? {};
      const observedDispatch = dispatchByItemId.get(itemId) ?? null;
      const targetAgentId =
        typeof orchestration.targetAgentId === 'string'
          ? orchestration.targetAgentId
          : observedDispatch?.targetAgentId ?? assignment?.assignedAgentId ?? null;
      const reason =
        typeof orchestration.targetReason === 'string'
          ? orchestration.targetReason
          : assignment?.reason ?? 'resolveBacklogDelegateTarget_fallback';
      return {
        itemId,
        taskId: taskIdByItemId.get(itemId) ?? null,
        targetAgentId,
        targetAgentTitle: targetAgentId ? agentTitleById.get(targetAgentId) ?? targetAgentId : null,
        reason
      };
    });

    let startupHealerRun = null;
    let configValidation = null;
    let cronStatus = null;
    let localScan = null;
    let localSessions = null;
    let localStats = null;
    let improvementCycle = null;
    let approvedProposalId = null;
    try {
      const startupHealerBody = await apiRequest(apiBase, token, 'POST', '/api/startup-healer/run', {
        actor: 'simulation'
      });
      startupHealerRun = startupHealerBody?.startupHealer ?? null;
    } catch (error) {
      intakeWarnings.push({
        stage: 'startup_healer',
        error: error instanceof Error ? error.message : String(error)
      });
    }
    try {
      const configValidationBody = await apiRequest(apiBase, token, 'GET', '/api/config/validate');
      configValidation = configValidationBody?.validation ?? null;
    } catch (error) {
      intakeWarnings.push({
        stage: 'config_validate',
        error: error instanceof Error ? error.message : String(error)
      });
    }
    try {
      cronStatus = await apiRequest(apiBase, token, 'GET', '/api/cron/status');
    } catch (error) {
      intakeWarnings.push({
        stage: 'cron_status',
        error: error instanceof Error ? error.message : String(error)
      });
    }
    try {
      localScan = await apiRequest(apiBase, token, 'POST', '/api/local/sessions/scan', {
        actor: 'simulation'
      });
      localSessions = await apiRequest(apiBase, token, 'GET', '/api/local/sessions?limit=20');
      localStats = await apiRequest(apiBase, token, 'GET', '/api/local/stats');
    } catch (error) {
      intakeWarnings.push({
        stage: 'local_sessions_scan',
        error: error instanceof Error ? error.message : String(error)
      });
    }
    try {
      improvementCycle = await apiRequest(apiBase, token, 'POST', '/api/improvement/cycle/run', {
        actor: 'simulation'
      });
      const pendingProposals = await apiRequest(apiBase, token, 'GET', '/api/improvement/proposals?status=pending&limit=20');
      const firstProposal = Array.isArray(pendingProposals?.proposals) ? pendingProposals.proposals[0] : null;
      if (firstProposal?.id) {
        const approval = await apiRequest(
          apiBase,
          token,
          'POST',
          `/api/improvement/proposals/${encodeURIComponent(String(firstProposal.id))}/approve`,
          {
            actor: 'simulation',
            notes: 'simulation_auto_approval'
          }
        );
        approvedProposalId = approval?.proposal?.id ?? null;
      }
    } catch (error) {
      intakeWarnings.push({
        stage: 'improvement_cycle',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const receiptExpected = originSessionChannel.toLowerCase() === 'telegram';
    const generationPipeline = generationBody?.pipeline ?? null;
    const summary = {
      schema: 'ops.ugothere.execution-summary.v2',
      executed: true,
      runDir,
      projectId,
      repoRoot,
      originSessionId,
      routingPolicy: {
        mode: routingMode,
        applied: routingPolicyState.applied === true
      },
      intake: {
        endpoint: '/api/backlog/project-intake',
        requestedMode: intakeMode,
        usedMode: intakeUsedMode,
        planPath: intakeArtifacts.planPath,
        prdPath: intakeArtifacts.prdPath,
        parsedTasks: Number(intakeBody?.sync?.parsedTasks ?? 0),
        created: Number(intakeBody?.sync?.created ?? 0),
        updated: Number(intakeBody?.sync?.updated ?? 0),
        dependencySets: Number(intakeBody?.sync?.dependencySets ?? 0),
        unresolvedDependencies: Array.isArray(intakeBody?.sync?.unresolvedDependencies) ? intakeBody.sync.unresolvedDependencies : [],
        warnings: intakeWarnings,
        generationRunId: generationPipeline?.generationRunId ?? intakeBody?.pipeline?.generationRunId ?? null,
        generationStatus: generationPipeline?.generationStatus ?? intakeBody?.pipeline?.generationStatus ?? null,
        generationTimedOut: Boolean(generationPipeline?.generationTimedOut ?? intakeBody?.pipeline?.generationTimedOut),
        ignoredRepositoryPlanFile: !String(intakeArtifacts.planPath).endsWith(path.join('.agents', 'PLAN.md'))
      },
      assignmentPolicy: {
        mode: 'ceo_orchestrator_tick',
        totalCandidates: selectedAgents.length
      },
      runtimeObservation: {
        retrySettleMs,
        postTimeoutGraceMs
      },
      deliveryGroups: deliveryGroupStatuses,
      repositoryLinking: {
        repoUrl: scenario?.repo?.url ?? null,
        repoConnectionId: repoConnection.repoConnectionId ?? null,
        owner: repoConnection.owner,
        repo: repoConnection.repo,
        createdConnection: repoConnection.created,
        warning: repoConnection.warning
      },
      origin: {
        channel: originSessionChannel,
        prompt: String(origin.prompt ?? scenario?.intake?.prompt ?? '').slice(0, 320)
      },
      assignmentDecisions,
      dispatchReasoning,
      delegatedRunCount: dispatchEntries.length,
      delegatedAgentCount: uniqueDelegatedAgents.size,
      delegatedAgentIds: Array.from(uniqueDelegatedAgents).sort((a, b) => a.localeCompare(b)),
      runTerminalStatuses: terminalRuns.map((run) => {
        const dispatch = runDispatchById.get(String(run.id));
        return {
          id: String(run.id),
          runtime: run.runtime ? String(run.runtime) : null,
          effectiveRuntime: run.effectiveRuntime ? String(run.effectiveRuntime) : null,
          model: run.model ? String(run.model) : null,
          effectiveModel: run.effectiveModel ? String(run.effectiveModel) : null,
          status: String(run.status),
          error: run.error ?? null,
          targetAgentId: dispatch ? String(dispatch.targetAgentId) : null,
          itemId: dispatch ? String(dispatch.itemId) : null,
          taskId: dispatch ? taskIdByItemId.get(String(dispatch.itemId)) ?? null : null
        };
      }),
      timeoutGuardedRuns: terminalRuns
        .filter((run) => String(run.error ?? '').includes('simulation_timeout_guard'))
        .map((run) => String(run.id)),
      subagentActivityCount: artifacts.subagentActivity.length,
      receiptExpectation: {
        expected: receiptExpected,
        reason: receiptExpected ? 'delivery_target_is_telegram' : `origin_session_channel_${originSessionChannel}_does_not_emit_backlog_receipts`
      },
      receiptCount: delegatedReceipts.length,
      uniqueReceiptRunCount: new Set(delegatedReceipts).size,
      completionGate: {
        allTasksDone,
        nonDoneCount: nonDoneItems.length,
        nonDoneItems
      },
      dependencyChecks: {
        expected: expectedEdges,
        observedDispatchOrder,
        observedDispatchTasks
      },
      deliveryVerification: {
        totalItems: Number(deliverySnapshot.total ?? 0),
        terminalStateCounts: (deliverySnapshot.items ?? []).reduce((accumulator, item) => {
          const state = String(item?.state ?? 'unknown');
          accumulator[state] = (accumulator[state] ?? 0) + 1;
          return accumulator;
        }, {}),
        deliveryStatusCounts,
        deliveryItems,
        deliveryGroups: Array.isArray(deliverySnapshot.groups)
          ? deliverySnapshot.groups.map((group) => ({
              id: String(group?.id ?? ''),
              status: String(group?.status ?? 'unknown'),
              memberCount: Number(group?.memberCount ?? 0),
              completedCount: Number(group?.completedCount ?? 0),
              blockedCount: Number(group?.blockedCount ?? 0),
              prUrl: group?.prUrl ? String(group.prUrl) : null
            }))
          : []
      },
      integratedOpsCertification: {
        startupHealer: startupHealerRun,
        configValidation,
        cronStatus: cronStatus
          ? {
              jobs: cronStatus.jobs ?? [],
              reaper: cronStatus.reaper ?? null,
              heartbeatSuppression: cronStatus.heartbeatSuppression ?? null
            }
          : null,
        localClaude: {
          scan: localScan?.scan ?? null,
          sessions: localSessions?.sessions ?? [],
          stats: localStats?.stats ?? null
        },
        selfImprovement: {
          cycle: improvementCycle ?? null,
          approvedProposalId
        }
      },
      artifactPaths: scenario.artifacts
    };

    writeJson(scenario.artifacts.completionSummary, summary);
    writeRetroReport(summary, scenario.artifacts.retroReport);
    return summary;
  } finally {
    for (const snapshot of selectedAgentSnapshots) {
      try {
        await apiRequest(apiBase, token, 'PATCH', `/api/agents/profiles/${encodeURIComponent(String(snapshot.id))}`, {
          executionMode: snapshot.executionMode,
          defaultRuntime: snapshot.defaultRuntime,
          defaultModel: snapshot.defaultModel,
          allowedRuntimes: snapshot.allowedRuntimes,
          harnessRuntime: snapshot.harnessRuntime,
          harnessAutoStart: snapshot.harnessAutoStart
        });
      } catch (error) {
        restorationWarnings.push({
          stage: 'agent_profile_restore',
          agentId: snapshot.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    try {
      await restoreSimulationRoutingMode({
        apiBase,
        token,
        state: routingPolicyState
      });
    } catch (error) {
      restorationWarnings.push({
        stage: 'routing_restore',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

function buildFallbackSummary({ scenario, runDir, reason, intakeArtifacts, intakeMode, routingMode }) {
  const summary = {
    schema: 'ops.ugothere.execution-summary.v2',
    executed: false,
    runDir,
    reason,
    routingPolicy: {
      mode: routingMode,
      applied: false
    },
    intake: {
      endpoint: '/api/backlog/project-intake',
      requestedMode: intakeMode,
      planPath: intakeArtifacts.planPath,
      prdPath: intakeArtifacts.prdPath,
      parsedTasks: intakeArtifacts.tasks.length,
      ignoredRepositoryPlanFile: !String(intakeArtifacts.planPath).endsWith(path.join('.agents', 'PLAN.md'))
    },
    artifactPaths: scenario.artifacts
  };
  writeJson(scenario.artifacts.backlogSnapshots, []);
  writeJson(scenario.artifacts.dispatchLog, []);
  writeJson(scenario.artifacts.runtimeStatus, []);
  writeJson(scenario.artifacts.telegramTrace, []);
  writeJson(scenario.artifacts.subagentActivity, []);
  writeJson(scenario.artifacts.deliverySnapshot, { capturedAt: new Date().toISOString(), total: 0, items: [] });
  writeJson(scenario.artifacts.intakeSync, {
    requestedMode: intakeMode,
    usedMode: 'none',
    warnings: [{ stage: 'simulation', error: reason }],
    response: null
  });
  writeJson(scenario.artifacts.completionSummary, summary);
  writeRetroReport(summary, scenario.artifacts.retroReport);
  return summary;
}

async function main() {
  const args = parseArgs(process.argv);
  const requestedCwd = typeof args.cwd === 'string' && args.cwd.trim().length > 0 ? path.resolve(args.cwd) : process.cwd();
  loadSimulationEnv(process.cwd());
  if (requestedCwd !== process.cwd()) {
    loadSimulationEnv(requestedCwd);
  }
  const requestedOriginPrompt = String(args.prompt ?? args['origin-prompt'] ?? process.env.SIM_ORIGIN_PROMPT ?? '').trim();
  const fixture = prepareUgothereFixture({
    cwd: args.cwd,
    workspace: args.workspace,
    repoUrl: args['repo-url'],
    offlineSeed: args['offline-seed'] === true || args.offline === true,
    freshWorkspace: args['fresh-workspace'] === true || String(process.env.SIM_FRESH_WORKSPACE ?? '').toLowerCase() === 'true',
    intakePrompt: requestedOriginPrompt
  });

  const runTimeoutMs = toNumber(args['run-timeout-ms'] ?? process.env.SIM_RUN_TIMEOUT_MS, 90_000, 10_000, 900_000);
  const maxTicks = toNumber(args['max-ticks'] ?? process.env.SIM_MAX_TICKS, 24, 3, 300);
  const intakeModeRaw = String(args['intake-mode'] ?? process.env.SIM_INTAKE_MODE ?? 'generate_and_sync').trim().toLowerCase();
  const intakeMode = intakeModeRaw === 'generate_and_sync' ? 'generate_and_sync' : 'sync_only';
  const routingMode = 'provider';
  const originChannelRaw = String(args['origin-channel'] ?? process.env.SIM_ORIGIN_CHANNEL ?? 'telegram')
    .trim()
    .toLowerCase();
  const originChannel = originChannelRaw === 'internal' ? 'internal' : 'telegram';
  const originPrompt = String(fixture?.scenario?.intake?.prompt ?? '').trim();
  const origin = {
    channel: originChannel,
    prompt: originPrompt,
    telegram: {
      senderId: String(args['telegram-sender-id'] ?? process.env.SIM_TELEGRAM_SENDER_ID ?? 'sim-operator-001'),
      senderHandle: String(args['telegram-sender-handle'] ?? process.env.SIM_TELEGRAM_SENDER_HANDLE ?? 'sim_operator'),
      chatId: String(args['telegram-chat-id'] ?? process.env.SIM_TELEGRAM_CHAT_ID ?? 'sim-chat-001'),
      topicId: args['telegram-topic-id'] ?? process.env.SIM_TELEGRAM_TOPIC_ID ?? null
    }
  };
  const intakeArtifacts = writeScenarioIntakeArtifacts({
    scenario: fixture.scenario,
    runDir: fixture.runDir,
    intakePrompt: origin.prompt
  });

  const apiBase = (args['api-base'] ?? process.env.SIM_API_BASE ?? '').trim();
  const token = (args.token ?? process.env.SIM_API_TOKEN ?? process.env.OPS_API_TOKEN ?? '').trim();

  let summary;
  if (!originPrompt) {
    summary = buildFallbackSummary({
      scenario: fixture.scenario,
      runDir: fixture.runDir,
      reason: 'origin_prompt_missing',
      intakeArtifacts,
      intakeMode,
      routingMode
    });
  } else if (!apiBase || !token) {
    summary = buildFallbackSummary({
      scenario: fixture.scenario,
      runDir: fixture.runDir,
      reason: 'api_base_or_token_missing',
      intakeArtifacts,
      intakeMode,
      routingMode
    });
  } else {
    try {
      summary = await runLiveSimulation({
        apiBase,
        token,
        scenario: fixture.scenario,
        runDir: fixture.runDir,
        runTimeoutMs,
        maxTicks,
        intakeMode,
        intakeArtifacts,
        routingMode,
        origin
      });
    } catch (error) {
      summary = buildFallbackSummary({
        scenario: fixture.scenario,
        runDir: fixture.runDir,
        reason: error instanceof Error ? error.message : String(error),
        intakeArtifacts,
        intakeMode,
        routingMode
      });
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        runId: fixture.runId,
        runDir: fixture.runDir,
        scenario: fixture.scenario,
        summary
      },
      null,
      2
    )}\n`
  );
  if (summary?.executed === true && summary?.completionGate?.allTasksDone === false) {
    process.exitCode = 2;
  }
}

void main();
