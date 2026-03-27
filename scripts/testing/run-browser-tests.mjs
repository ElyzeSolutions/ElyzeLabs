#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const DEFAULT_GATEWAY_CONFIG_PATH = path.resolve(process.cwd(), 'config/control-plane.yaml');
const DEFAULT_DOTENV_PATH = path.resolve(process.cwd(), '.env');

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

async function canReach(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

function readControlPlaneConfig(configPath = DEFAULT_GATEWAY_CONFIG_PATH) {
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function readDotenvValue(name, dotenvPath = DEFAULT_DOTENV_PATH) {
  if (!fs.existsSync(dotenvPath)) {
    return null;
  }

  const lines = fs.readFileSync(dotenvPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const unquoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    return unquoted.length > 0 ? unquoted : null;
  }

  return null;
}

function createFakeBrowserExecutable(root) {
  const executablePath = path.join(root, 'fake-scrapling.mjs');
  fs.writeFileSync(
    executablePath,
    [
      '#!/usr/bin/env node',
      'import fs from "node:fs";',
      'import path from "node:path";',
      '',
      'const args = process.argv.slice(2);',
      'const buildBody = ({ tool, url, selector = "" }) => [',
      '  `Tool: ${tool}`,',
      '  `URL: ${url}`,',
      '  selector ? `Selector: ${selector}` : "",',
      '  "Result: browser fixture content"',
      '].filter(Boolean).join("\\n");',
      '',
      'if ((args[0] ?? "") === "extract") {',
      '  const tool = args[1] ?? "get";',
      '  const url = args[2] ?? "";',
      '  const artifactPath = args[3] ?? "";',
      '  const selectorIndex = args.indexOf("--css-selector");',
      '  const selector = selectorIndex >= 0 ? (args[selectorIndex + 1] ?? "") : "";',
      '  const body = buildBody({ tool, url, selector });',
      '  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });',
      '  fs.writeFileSync(artifactPath, body, "utf8");',
      '  process.stdout.write(body);',
      '  process.exit(0);',
      '} else if ((args[0] ?? "") === "mcp") {',
      '',
      '  let buffer = "";',
      '  process.stdin.setEncoding("utf8");',
      '  process.stdin.on("data", (chunk) => {',
      '    buffer += chunk;',
      '    const lines = buffer.split(/\\r?\\n/);',
      '    buffer = lines.pop() ?? "";',
      '    for (const rawLine of lines) {',
      '      const line = rawLine.trim();',
      '      if (!line) continue;',
      '      let message = null;',
      '      try {',
      '        message = JSON.parse(line);',
      '      } catch {',
      '        continue;',
      '      }',
      '      if (message?.method === "initialize" && message.id != null) {',
      '        process.stdout.write(`${JSON.stringify({',
      '          jsonrpc: "2.0",',
      '          id: message.id,',
      '          result: {',
      '            protocolVersion: "2024-11-05",',
      '            capabilities: { tools: {} },',
      '            serverInfo: { name: "fake-scrapling", version: "1.0.0" }',
      '          }',
      '        })}\\n`);',
      '        continue;',
      '      }',
      '      if (message?.method === "tools/call" && message.id != null) {',
      '        const tool = String(message?.params?.name ?? "get");',
      '        const toolArgs = message?.params?.arguments ?? {};',
      '        const url = String(toolArgs.url ?? (Array.isArray(toolArgs.urls) ? toolArgs.urls[0] ?? "" : ""));',
      '        const selector = String(toolArgs.css_selector ?? "");',
      '        const body = buildBody({ tool, url, selector });',
      '        process.stdout.write(`${JSON.stringify({',
      '          jsonrpc: "2.0",',
      '          id: message.id,',
      '          result: {',
      '            structuredContent: {',
      '              status: 200,',
      '              content: body.split("\\n")',
      '            },',
      '            content: [{ type: "text", text: body }],',
      '            isError: false',
      '          }',
      '        })}\\n`);',
      '      }',
      '    }',
      '  });',
      '  process.stdin.resume();',
      '  process.on("SIGTERM", () => process.exit(0));',
      '  process.on("SIGINT", () => process.exit(0));',
      '} else {',
      '',
      'console.error("unsupported command");',
      'process.exit(1);',
      '}'
    ].join('\n'),
    { encoding: 'utf8', mode: 0o755 }
  );
  fs.chmodSync(executablePath, 0o755);
  return executablePath;
}

function createFakeProcessRuntimeExecutable(root) {
  const executablePath = path.join(root, 'fake-process-runtime.mjs');
  fs.writeFileSync(
    executablePath,
    [
      '#!/usr/bin/env node',
      'let input = "";',
      'process.stdin.setEncoding("utf8");',
      'process.stdin.on("data", (chunk) => { input += chunk; });',
      'process.stdin.on("end", () => {',
      '  const output = input.includes("Browser onboarding ready") ? "Browser onboarding ready." : "Managed process runtime ready.";',
      '  process.stdout.write(output);',
      '});',
      'process.stdin.resume();'
    ].join('\n'),
    { encoding: 'utf8', mode: 0o755 }
  );
  fs.chmodSync(executablePath, 0o755);
  return executablePath;
}

function resolveGatewayApiToken(configPath = DEFAULT_GATEWAY_CONFIG_PATH) {
  const envToken = process.env.BROWSER_API_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }
  const opsEnvToken = process.env.OPS_API_TOKEN?.trim();
  if (opsEnvToken) {
    return opsEnvToken;
  }
  const dotenvToken = readDotenvValue('OPS_API_TOKEN');
  if (dotenvToken) {
    return dotenvToken;
  }
  try {
    const parsed = readControlPlaneConfig(configPath);
    const token = String(parsed?.server?.apiToken ?? '').trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function createManagedGatewayConfig(gatewayBaseUrl) {
  const sourceConfig = readControlPlaneConfig();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-browser-gateway-'));
  const gatewayUrl = new URL(gatewayBaseUrl);
  const apiToken =
    process.env.BROWSER_API_TOKEN?.trim() ||
    process.env.OPS_API_TOKEN?.trim() ||
    readDotenvValue('OPS_API_TOKEN') ||
    String(sourceConfig?.server?.apiToken ?? '').trim() ||
    'browser-test-token';
  const workspaceRoot = path.join(tempRoot, 'workspaces');
  const stateDir = path.join(tempRoot, 'state');
  const memoryDir = path.join(tempRoot, 'memory-daily');
  const sqlitePath = path.join(stateDir, 'control-plane.db');
  const configPath = path.join(tempRoot, 'control-plane.browser.json');
  const browserExecutable = createFakeBrowserExecutable(tempRoot);
  const processExecutable = createFakeProcessRuntimeExecutable(tempRoot);
  const localRuntimeRoots = {
    codex: path.join(tempRoot, 'local-runtimes', 'codex'),
    claude: path.join(tempRoot, 'local-runtimes', 'claude'),
    gemini: path.join(tempRoot, 'local-runtimes', 'gemini')
  };
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.mkdirSync(localRuntimeRoots.codex, { recursive: true });
  fs.mkdirSync(localRuntimeRoots.claude, { recursive: true });
  fs.mkdirSync(localRuntimeRoots.gemini, { recursive: true });

  const managedConfig = JSON.parse(JSON.stringify(sourceConfig));
  managedConfig.server = {
    ...(managedConfig.server ?? {}),
    host: gatewayUrl.hostname,
    port: gatewayUrl.port ? Number(gatewayUrl.port) : gatewayUrl.protocol === 'https:' ? 443 : 80,
    // Keep the temp config file free of plaintext secrets; the real token is injected via env.
    apiToken: 'change-me-local-token',
    logLevel: process.env.BROWSER_GATEWAY_LOG_LEVEL?.trim() || 'warn'
  };
  managedConfig.channel = {
    ...(managedConfig.channel ?? {}),
    telegram: {
      ...(managedConfig.channel?.telegram ?? {}),
      enabled: false,
      botToken: ''
    }
  };
  managedConfig.runtime = {
    ...(managedConfig.runtime ?? {}),
    workspaceRoot
  };
  managedConfig.memory = {
    ...(managedConfig.memory ?? {}),
    dailyMemoryDir: memoryDir
  };
  managedConfig.persistence = {
    ...(managedConfig.persistence ?? {}),
    sqlitePath
  };
  managedConfig.browser = {
    ...(managedConfig.browser ?? {}),
    enabled: true,
    transport: 'stdio',
    executable: browserExecutable,
    healthcheckCommand: browserExecutable,
    defaultExtraction: 'markdown',
    allowedAgents: []
  };

  fs.writeFileSync(configPath, JSON.stringify(managedConfig, null, 2));
  return {
    configPath,
    apiToken,
    env: {
      OPS_API_TOKEN: apiToken,
      OPS_RUNTIME_PROCESS_COMMAND: processExecutable,
      OPS_TELEGRAM_ENABLED: '1',
      OPS_TELEGRAM_BOT_TOKEN: '123456:browser_suite_test_token_abcdefghij',
      OPS_LOCAL_CODEX_ROOT: localRuntimeRoots.codex,
      OPS_LOCAL_CLAUDE_PROJECTS_ROOT: localRuntimeRoots.claude,
      OPS_LOCAL_GEMINI_ROOT: localRuntimeRoots.gemini,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN?.trim() || 'browser-suite-github-token',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY?.trim() || 'browser-suite-openrouter-key'
    },
    cleanup: () => {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  };
}

async function requestJson(url, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const raw = await response.text().catch(() => '');
  const payload = raw.trim().length > 0 ? JSON.parse(raw) : {};
  if (!response.ok) {
    throw new Error(payload?.error ? String(payload.error) : `HTTP ${response.status}`);
  }
  return payload;
}

function extractApiToken(headers = {}) {
  const authorization = String(headers.Authorization ?? headers.authorization ?? '').trim();
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = authorization.slice('bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function runOpsCli(gatewayBaseUrl, apiToken, args) {
  const cliArgs = [
    'exec',
    'tsx',
    'scripts/runtime/ops.ts',
    '--host',
    gatewayBaseUrl,
    '--token',
    apiToken,
    ...args
  ];
  return run('pnpm', cliArgs);
}

async function primeReadyOnboarding(gatewayBaseUrl, headers) {
  const actor = 'browser-suite';
  await requestJson(`${gatewayBaseUrl}/api/onboarding/ceo-baseline`, {
    method: 'POST',
    headers,
    body: { actor, companyName: 'Browser Suite' }
  });
  await requestJson(`${gatewayBaseUrl}/api/onboarding/vault/bootstrap`, {
    method: 'POST',
    headers,
    body: { actor, material: 'browser-suite-material' }
  });
  await requestJson(`${gatewayBaseUrl}/api/onboarding/provider-keys/check`, {
    method: 'POST',
    headers,
    body: { actor }
  });
  const smoke = await requestJson(`${gatewayBaseUrl}/api/onboarding/smoke-run`, {
    method: 'POST',
    headers,
    body: {
      actor,
      prompt: 'Reply with Browser onboarding ready.'
    }
  });
  if (smoke?.onboarding?.status !== 'ready') {
    throw new Error(`managed gateway onboarding did not reach ready status (got ${String(smoke?.onboarding?.status ?? 'unknown')})`);
  }
}

async function seedBrowserCapabilitySmokeState(gatewayBaseUrl, headers) {
  const profilesPayload = await requestJson(`${gatewayBaseUrl}/api/agents/profiles`, {
    headers
  });
  const agents = Array.isArray(profilesPayload?.agents) ? profilesPayload.agents : [];
  const enabledAgents = agents.filter((agent) => agent && typeof agent === 'object' && agent.enabled === true);
  const targetAgent =
    enabledAgents.find((agent) => String(agent.id ?? '').trim() === 'software-engineer') ??
    enabledAgents[0] ??
    null;
  const browserEnabledAgents = agents.filter(
    (agent) =>
      agent &&
      typeof agent === 'object' &&
      agent.enabled === true &&
      Array.isArray(agent.tools) &&
      agent.tools.includes('browser:scrapling')
  );

  for (const agent of browserEnabledAgents) {
    await requestJson(`${gatewayBaseUrl}/api/agents/profiles/${encodeURIComponent(String(agent.id))}`, {
      method: 'PATCH',
      headers,
      body: {
        tools: agent.tools.filter((tool) => String(tool) !== 'browser:scrapling')
      }
    });
  }

  return typeof targetAgent?.id === 'string' && targetAgent.id.trim().length > 0 ? targetAgent.id.trim() : null;
}

function isoTimestampFromNow(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function formatSourceLabel(value) {
  return String(value ?? 'unknown')
    .trim()
    .replace(/_/g, ' ')
    .toLowerCase();
}

async function seedGithubDeliveryCockpitSmokeState(gatewayBaseUrl, headers) {
  const suffix = Date.now().toString(36);
  const branchName = `delivery/browser-cockpit-${suffix}`;
  const title = `Browser GitHub delivery incident ${suffix}`;
  const repoPayload = await requestJson(`${gatewayBaseUrl}/api/github/repos`, {
    method: 'POST',
    headers,
    body: {
      owner: 'browser-suite',
      repo: `delivery-cockpit-${suffix}`,
      authSecretRef: 'env:GITHUB_TOKEN',
      enabled: true
    }
  });
  const repoConnectionId = String(repoPayload?.repo?.id ?? '').trim();
  if (!repoConnectionId) {
    throw new Error('browser smoke seed failed: repo connection id missing');
  }

  const itemPayload = await requestJson(`${gatewayBaseUrl}/api/backlog/items`, {
    method: 'POST',
    headers,
    body: {
      title,
      description: 'Browser-seeded GitHub delivery incident for cockpit certification.',
      state: 'review',
      priority: 96,
      actor: 'browser-suite',
      projectId: 'browser-suite',
      repoRoot: '/tmp/browser-suite-delivery-cockpit'
    }
  });
  const itemId = String(itemPayload?.item?.id ?? '').trim();
  if (!itemId) {
    throw new Error('browser smoke seed failed: backlog item id missing');
  }

  await requestJson(`${gatewayBaseUrl}/api/backlog/items/${encodeURIComponent(itemId)}/delivery`, {
    method: 'PUT',
    headers,
    body: {
      repoConnectionId,
      branchName,
      commitSha: 'abc1234',
      prNumber: 77,
      prUrl: `https://github.com/browser-suite/delivery-cockpit-${suffix}/pull/77`,
      status: 'blocked',
      githubState: 'checks_failed',
      githubStateReason: 'checks_failed',
      githubStateUpdatedAt: isoTimestampFromNow(-45 * 60 * 1000),
      checks: {
        status: 'failed',
        pendingCount: 0,
        failingCount: 1,
        source: 'reconciler',
        names: ['ci/test'],
        failingNames: ['ci/test']
      },
      metadata: {
        githubIssue: {
          number: 77,
          state: 'open',
          url: `https://github.com/browser-suite/delivery-cockpit-${suffix}/issues/77`,
          labels: ['state:review'],
          syncedAt: isoTimestampFromNow(-50 * 60 * 1000)
        },
        githubPolicy: {
          version: 'policy.browser.v1',
          source: 'control_plane'
        },
        artifacts: {
          evidenceType: 'github_evidence',
          truthLabel: 'real_delivery'
        },
        publish: {
          actor: 'browser-suite',
          publishedAt: isoTimestampFromNow(-60 * 60 * 1000)
        }
      },
      githubLease: {
        schema: 'ops.github-delivery-lease.v1',
        version: 1,
        repo: {
          leaseId: `lease-repo-${suffix}`,
          scopeKey: repoConnectionId,
          status: 'active',
          ownerActor: 'browser-suite',
          ownerSessionId: 'browser-session',
          ownerRunId: 'browser-run',
          acquiredAt: isoTimestampFromNow(-2 * 60 * 60 * 1000),
          lastHeartbeatAt: isoTimestampFromNow(-90 * 60 * 1000),
          expiresAt: isoTimestampFromNow(-30 * 60 * 1000),
          releasedAt: null,
          releaseReason: null
        },
        delivery: {
          leaseId: `lease-delivery-${suffix}`,
          scopeKey: itemId,
          status: 'active',
          ownerActor: 'browser-suite',
          ownerSessionId: 'browser-session',
          ownerRunId: 'browser-run',
          acquiredAt: isoTimestampFromNow(-2 * 60 * 60 * 1000),
          lastHeartbeatAt: isoTimestampFromNow(-90 * 60 * 1000),
          expiresAt: isoTimestampFromNow(-30 * 60 * 1000),
          releasedAt: null,
          releaseReason: null
        },
        branch: {
          leaseId: `lease-branch-${suffix}`,
          scopeKey: branchName,
          status: 'active',
          ownerActor: 'browser-suite',
          ownerSessionId: 'browser-session',
          ownerRunId: 'browser-run',
          acquiredAt: isoTimestampFromNow(-2 * 60 * 60 * 1000),
          lastHeartbeatAt: isoTimestampFromNow(-90 * 60 * 1000),
          expiresAt: isoTimestampFromNow(-30 * 60 * 1000),
          releasedAt: null,
          releaseReason: null
        },
        pullRequest: null,
        takeover: {
          policy: 'stale_only',
          staleAfterMs: 900000,
          operatorOverrideRequired: true
        }
      },
      githubWorktree: {
        schema: 'ops.github-worktree.v1',
        version: 1,
        isolationMode: 'git_worktree',
        repoRoot: '/tmp/browser-suite-delivery-cockpit',
        worktreePath: `/tmp/browser-suite-delivery-cockpit/.worktrees/${suffix}`,
        branchName,
        baseRef: 'origin/main',
        headSha: 'abc1234',
        status: 'ready',
        createdAt: isoTimestampFromNow(-2 * 60 * 60 * 1000),
        cleanedAt: null
      },
      githubReconcile: {
        schema: 'ops.github-reconcile-summary.v1',
        version: 1,
        status: 'drift_detected',
        sourceOfTruth: 'reconciler',
        lastReconciledAt: isoTimestampFromNow(-40 * 60 * 1000),
        driftReasons: ['checks_failed', 'stale_lease'],
        pullRequest: {
          state: 'open',
          mergeable: 'blocked',
          reviewDecision: 'approved',
          reviewCount: 2
        },
        checks: {
          status: 'failed',
          pendingCount: 0,
          failingCount: 1
        },
        branch: {
          headSha: 'abc1234',
          baseSha: 'base123',
          diverged: false,
          staleEligible: true
        },
        issues: {
          linkedIssueNumbers: [77],
          syncState: 'in_sync'
        }
      }
    }
  });

  const detail = await requestJson(`${gatewayBaseUrl}/api/backlog/items/${encodeURIComponent(itemId)}/delivery/detail`, {
    headers
  });

  return {
    itemId,
    repoConnectionId,
    title,
    detail
  };
}

async function cleanupGithubDeliveryCockpitSmokeState(gatewayBaseUrl, headers, seed) {
  if (!seed) {
    return;
  }
  const itemId = typeof seed.itemId === 'string' ? seed.itemId.trim() : '';
  const repoConnectionId = typeof seed.repoConnectionId === 'string' ? seed.repoConnectionId.trim() : '';
  if (itemId) {
    try {
      await requestJson(`${gatewayBaseUrl}/api/backlog/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
        headers
      });
    } catch {
      // Best effort cleanup only.
    }
  }
  if (repoConnectionId) {
    try {
      await requestJson(`${gatewayBaseUrl}/api/github/repos/${encodeURIComponent(repoConnectionId)}`, {
        method: 'PATCH',
        headers,
        body: {
          enabled: false
        }
      });
    } catch {
      // Best effort cleanup only.
    }
  }
}

function ensureDashboardBuild() {
  const dashboardDistIndex = path.resolve(process.cwd(), 'dashboard/dist/index.html');
  if (fs.existsSync(dashboardDistIndex)) {
    return;
  }
  const buildResult = run('pnpm', ['--filter', 'dashboard', 'build']);
  if (buildResult.status !== 0) {
    const output = `${buildResult.stdout ?? ''}\n${buildResult.stderr ?? ''}`.trim();
    throw new Error(`dashboard build failed before browser smoke.${output ? `\n${output}` : ''}`);
  }
}

function spawnManagedDashboardProcess(dashboardBaseUrl) {
  const dashboardUrl = new URL(dashboardBaseUrl);
  const port = dashboardUrl.port
    ? Number(dashboardUrl.port)
    : dashboardUrl.protocol === 'https:'
      ? 443
      : 80;
  ensureDashboardBuild();
  return spawnManagedProcess(
    'pnpm',
    ['--filter', 'dashboard', 'exec', 'vite', 'preview', '--host', dashboardUrl.hostname, '--port', String(port)],
    'dashboard'
  );
}

async function endpointAvailable(url, headers) {
  try {
    const response = await fetch(url, { headers });
    return response.ok || response.status === 401 || response.status === 403;
  } catch {
    return false;
  }
}

function createBrowserCommandWrapper() {
  const wrapperRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-agent-browser-'));
  const wrapperPath = path.join(wrapperRoot, 'agent-browser');
  fs.writeFileSync(
    wrapperPath,
    ['#!/usr/bin/env bash', 'exec npx -y agent-browser "$@"'].join('\n'),
    { encoding: 'utf8', mode: 0o755 }
  );
  fs.chmodSync(wrapperPath, 0o755);
  const originalPath = process.env.PATH ?? '';
  process.env.PATH = `${wrapperRoot}${path.delimiter}${originalPath}`;
  return () => {
    process.env.PATH = originalPath;
    fs.rmSync(wrapperRoot, { recursive: true, force: true });
  };
}

function ensureAgentBrowserInstall() {
  if (process.env.BROWSER_SKIP_AGENT_INSTALL === '1') {
    return;
  }
  const installArgs = ['install'];
  if (process.env.BROWSER_AGENT_INSTALL_WITH_DEPS === '1') {
    installArgs.push('--with-deps');
  }
  const installResult = run('agent-browser', installArgs);
  if (installResult.status !== 0) {
    const output = `${installResult.stdout ?? ''}\n${installResult.stderr ?? ''}`.trim();
    throw new Error(`agent-browser install failed.${output ? `\n${output}` : ''}`);
  }
}

const RUNTIME_SHIM_SCRIPT = String.raw`#!/usr/bin/env node
const runtime = process.argv[2] || 'runtime';
let prompt = '';
const extract = (input) => {
  const currentTaskIndex = input.lastIndexOf('CURRENT_TASK:\n');
  if (currentTaskIndex >= 0) {
    return input.slice(currentTaskIndex + 'CURRENT_TASK:\n'.length).trim();
  }
  const taskIndex = input.lastIndexOf('TASK:');
  if (taskIndex >= 0) {
    return input.slice(taskIndex + 'TASK:'.length).trim();
  }
  return input.trim();
};
const finish = () => {
  const output = extract(prompt) || runtime;
  process.stdout.write(output);
  process.exit(0);
};
process.stdin.on('data', (chunk) => {
  prompt += chunk;
});
process.stdin.on('end', finish);
process.stdin.resume();
`;

function createPortableRuntimeBinaryShims() {
  const missingRuntimes = ['codex', 'claude', 'gemini'].filter(
    (runtime) => spawnSync('bash', ['-lc', `command -v ${runtime} >/dev/null 2>&1`]).status !== 0
  );
  if (missingRuntimes.length === 0) {
    return () => {};
  }
  const wrapperRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-runtime-shims-'));
  for (const runtime of missingRuntimes) {
    const wrapperPath = path.join(wrapperRoot, runtime);
    fs.writeFileSync(wrapperPath, `${RUNTIME_SHIM_SCRIPT}\n`, { encoding: 'utf8', mode: 0o755 });
    fs.chmodSync(wrapperPath, 0o755);
  }
  const originalPath = process.env.PATH ?? '';
  process.env.PATH = `${wrapperRoot}${path.delimiter}${originalPath}`;
  return () => {
    process.env.PATH = originalPath;
    fs.rmSync(wrapperRoot, { recursive: true, force: true });
  };
}

function spawnManagedProcess(command, args, label, envOverrides = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...envOverrides
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32'
  });
  let output = '';
  const append = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-12000);
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  return {
    child,
    label,
    readOutput: () => output
  };
}

async function waitForEndpoint(url, { headers = {}, timeoutMs = 60000, label, processRef } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (processRef?.child.exitCode !== null) {
      const output = processRef.readOutput().trim();
      throw new Error(
        `${label} exited before becoming ready.${output ? `\n${processRef.label} output:\n${output}` : ''}`
      );
    }
    if (await endpointAvailable(url, headers)) {
      return;
    }
    await sleep(500);
  }
  const output = processRef?.readOutput().trim() ?? '';
  throw new Error(`${label} did not become ready within ${timeoutMs}ms.${output ? `\n${processRef.label} output:\n${output}` : ''}`);
}

const allowSkip = process.env.BROWSER_ALLOW_SKIP === '1';
const forceNpxAgentBrowser = process.env.BROWSER_FORCE_NPX_AGENT === '1';
let cleanupAgentBrowserWrapper = () => {};
let cleanupRuntimeShims = () => {};
let cleanupManagedGatewayConfig = () => {};
const hasAgentBrowser =
  !forceNpxAgentBrowser && spawnSync('bash', ['-lc', 'command -v agent-browser >/dev/null 2>&1']).status === 0;
if (hasAgentBrowser) {
  const result = spawnSync('bash', ['-lc', 'agent-browser --help >/dev/null'], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  console.log('agent-browser is available and responsive.');
} else {
  const fallbackCheck = spawnSync('npx', ['-y', 'agent-browser', '--help'], { encoding: 'utf8' });
  if (fallbackCheck.status === 0) {
    cleanupAgentBrowserWrapper = createBrowserCommandWrapper();
    console.log(
      forceNpxAgentBrowser ? 'agent-browser forced to use npx fallback.' : 'agent-browser not globally installed; using npx fallback.'
    );
  } else if (allowSkip) {
    console.log('agent-browser not installed; browser suite skipped because BROWSER_ALLOW_SKIP=1.');
    process.exit(0);
  } else {
    console.error('agent-browser not installed and npx fallback failed; failing browser suite.');
    if (fallbackCheck.stderr || fallbackCheck.stdout) {
      console.error(fallbackCheck.stderr || fallbackCheck.stdout);
    }
    process.exit(fallbackCheck.status ?? 1);
  }
}

const defaultManagedGatewayPort = 8799 + Math.floor(Math.random() * 1000);
const gatewayBaseUrl = process.env.BROWSER_GATEWAY_URL ?? `http://127.0.0.1:${defaultManagedGatewayPort}`;
const dashboardBaseUrl = process.env.BROWSER_BASE_URL ?? gatewayBaseUrl;
const dashboardEmbeddedInGateway =
  dashboardBaseUrl.replace(/\/$/, '') === gatewayBaseUrl.replace(/\/$/, '');
const gatewayApiToken = resolveGatewayApiToken();
const gatewayHeaders =
  gatewayApiToken && gatewayApiToken.length > 0
    ? {
        Authorization: `Bearer ${gatewayApiToken}`,
        'x-ops-role': 'admin'
      }
    : {};
let latestGatewayHeaders = gatewayHeaders;
let githubCockpitSeed = null;
const managedProcesses = [];
const cleanup = () => {
  for (const processRef of managedProcesses.reverse()) {
    const child = processRef.child;
    if (!child.killed && child.exitCode === null) {
      if (process.platform !== 'win32' && typeof child.pid === 'number') {
        spawnSync('bash', ['-lc', `kill -TERM -${child.pid} >/dev/null 2>&1 || true; sleep 0.2; kill -KILL -${child.pid} >/dev/null 2>&1 || true`], {
          stdio: 'ignore'
        });
      } else {
        child.kill('SIGTERM');
      }
    }
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
  }
  cleanupManagedGatewayConfig();
  cleanupRuntimeShims();
  cleanupAgentBrowserWrapper();
};
process.on('exit', cleanup);

process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

async function runBrowserOpsSmoke(session, dashboardBaseUrl, options = {}) {
  const normalizedBaseUrl = dashboardBaseUrl.replace(/\/$/, '');
  const targetAgentId =
    typeof options === 'object' && options !== null && typeof options.targetAgentId === 'string' && options.targetAgentId.trim().length > 0
      ? options.targetAgentId.trim()
      : null;
  const toolsOpen = run('agent-browser', ['--session', session, 'open', `${normalizedBaseUrl}/tools`]);
  if (toolsOpen.status !== 0) {
    console.error(toolsOpen.stderr || toolsOpen.stdout);
    process.exit(toolsOpen.status ?? 1);
  }
  await sleep(250);

  const toolsBody = run('agent-browser', ['--session', session, 'get', 'text', 'body']);
  const toolsText = `${toolsBody.stdout ?? ''}\n${toolsBody.stderr ?? ''}`;
  if (!toolsText.includes('Open Browser Ops')) {
    console.error('browser smoke failed: Tools view did not expose the Browser Ops discovery link.');
    process.exit(1);
  }
  const browserOpen = run('agent-browser', ['--session', session, 'open', `${normalizedBaseUrl}/browser`]);
  if (browserOpen.status !== 0) {
    console.error(browserOpen.stderr || browserOpen.stdout);
    process.exit(browserOpen.status ?? 1);
  }
  await sleep(500);

  const browserBody = run('agent-browser', ['--session', session, 'get', 'text', 'body']);
  const browserPageText = `${browserBody.stdout ?? ''}\n${browserBody.stderr ?? ''}`;
  if (!browserPageText.includes('Browser operations') || !browserPageText.includes('Run a governed capture.')) {
    console.error('browser smoke failed: Browser Ops page did not render the expected capture surface.');
    process.exit(1);
  }
  const shouldToggleCapability = browserPageText.includes('Capable Agents0');
  if (shouldToggleCapability) {
    const capabilitySelector = targetAgentId ? `#browser-capability-${targetAgentId}` : 'button[role="switch"][aria-label^="Toggle browser capability for"]';
    const capabilityWait = run('agent-browser', ['--session', session, 'wait', capabilitySelector]);
    if (capabilityWait.status !== 0) {
      console.error('browser smoke failed: Browser Ops capability switch not found.');
      console.error(capabilityWait.stderr || capabilityWait.stdout);
      process.exit(1);
    }
    const capabilityClick = run('agent-browser', ['--session', session, 'click', capabilitySelector]);
    if (capabilityClick.status !== 0) {
      console.error('browser smoke failed: Browser Ops capability switch click failed.');
      console.error(capabilityClick.stderr || capabilityClick.stdout);
      process.exit(capabilityClick.status ?? 1);
    }
    await sleep(500);
  }
  const runButtonWait = run('agent-browser', ['--session', session, 'wait', '#browser-test-submit']);
  if (runButtonWait.status !== 0) {
    console.error('browser smoke failed: Browser Ops run action control was not found.');
    if (runButtonWait.status !== 0) {
      console.error(runButtonWait.stderr || runButtonWait.stdout);
    }
    process.exit(1);
  }
  const configureBrowserForm = run('agent-browser', [
    '--session',
    session,
    'wait',
    '--fn',
    `(() => {
      const button = document.querySelector('#browser-test-submit');
      const agent = document.querySelector('#browser-test-agent');
      if (!button || !agent) return false;
      ${
        targetAgentId
          ? `if (agent.value !== ${JSON.stringify(targetAgentId)}) {
        const targetOption = [...agent.options].find((entry) => entry.value === ${JSON.stringify(targetAgentId)});
        if (!targetOption) return false;
        if (!String(targetOption.textContent ?? "").includes("capable")) return false;
        agent.value = ${JSON.stringify(targetAgentId)};
        agent.dispatchEvent(new Event('input', { bubbles: true }));
        agent.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const selectedOption = agent.options[agent.selectedIndex];
        if (!String(selectedOption?.textContent ?? "").includes("capable")) return false;
      }`
          : ''
      }
      return !button.disabled;
    })()`
  ]);
  if (configureBrowserForm.status !== 0) {
    console.error('browser smoke failed: Browser Ops form could not be configured.');
    console.error(configureBrowserForm.stderr || configureBrowserForm.stdout);
    process.exit(configureBrowserForm.status ?? 1);
  }

  const runTestClick = run('agent-browser', ['--session', session, 'click', '#browser-test-submit']);
  if (runTestClick.status !== 0) {
    console.error('browser smoke failed: Browser Ops run button click failed.');
    console.error(runTestClick.stderr || runTestClick.stdout);
    const browserFailureBody = run('agent-browser', ['--session', session, 'get', 'text', 'body']);
    const browserFailureText = `${browserFailureBody.stdout ?? ''}\n${browserFailureBody.stderr ?? ''}`;
    console.error('browser ops body before run submission failure:');
    console.error(browserFailureText.slice(0, 2000));
    process.exit(runTestClick.status ?? 1);
  }
  let browserBodyText = '';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(400);
    const browserResultBody = run('agent-browser', ['--session', session, 'get', 'text', 'body']);
    browserBodyText = `${browserResultBody.stdout ?? ''}\n${browserResultBody.stderr ?? ''}`;
    if (
      browserBodyText.includes('Captured 1 artifact(s)') &&
      browserBodyText.includes('Artifact preview') &&
      browserBodyText.includes('Result: browser fixture content')
    ) {
      break;
    }
  }
  if (
    !browserBodyText.includes('Captured 1 artifact(s)') ||
    !browserBodyText.includes('Artifact preview') ||
    !browserBodyText.includes('Result: browser fixture content')
  ) {
    console.error('browser smoke failed: Browser Ops did not render the expected artifact preview after the test run.');
    console.error('browser ops body excerpt:');
    console.error(browserBodyText.slice(0, 2000));
    process.exit(1);
  }
}

async function runBrowserScheduleSmoke(session, dashboardBaseUrl, gatewayBaseUrl, headers, options = {}) {
  const normalizedBaseUrl = dashboardBaseUrl.replace(/\/$/, '');
  const apiToken = extractApiToken(headers);
  if (!apiToken) {
    console.error('browser smoke failed: API token unavailable for schedule parity checks.');
    process.exit(1);
  }

  const targetAgentId =
    typeof options === 'object' && options !== null && typeof options.targetAgentId === 'string' && options.targetAgentId.trim().length > 0
      ? options.targetAgentId.trim()
      : null;
  let resolvedTargetAgentId = targetAgentId;
  if (!resolvedTargetAgentId) {
    const profilesPayload = await requestJson(`${gatewayBaseUrl}/api/agents/profiles`, {
      headers
    });
    const fallbackAgent =
      Array.isArray(profilesPayload?.agents)
        ? profilesPayload.agents.find((agent) => agent?.enabled === true && Array.isArray(agent.tools) && agent.tools.includes('browser:scrapling'))
        : null;
    resolvedTargetAgentId = typeof fallbackAgent?.id === 'string' && fallbackAgent.id.trim().length > 0 ? fallbackAgent.id.trim() : null;
  }
  if (!resolvedTargetAgentId) {
    console.error('browser smoke failed: no browser-capable agent available for schedule smoke.');
    process.exit(1);
  }

  const browserHistoryPayload = await requestJson(`${gatewayBaseUrl}/api/browser/history?limit=5`, {
    headers
  });
  const browserHistoryRow =
    Array.isArray(browserHistoryPayload?.history?.rows)
      ? browserHistoryPayload.history.rows.find((row) => Array.isArray(row.artifacts) && row.artifacts.length > 0) ?? null
      : null;
  const browserRunId = typeof browserHistoryRow?.runId === 'string' ? browserHistoryRow.runId.trim() : '';
  const artifactHandle =
    Array.isArray(browserHistoryRow?.artifacts) && typeof browserHistoryRow.artifacts[0]?.handle === 'string'
      ? browserHistoryRow.artifacts[0].handle.trim()
      : '';
  if (!browserRunId || !artifactHandle) {
    console.error('browser smoke failed: Browser Ops run did not produce an API-visible browser artifact.');
    process.exit(1);
  }

  const browserShow = runOpsCli(gatewayBaseUrl, apiToken, ['browser', 'show', browserRunId]);
  if (browserShow.status !== 0 || !String(browserShow.stdout ?? '').includes(`handle=${artifactHandle}`)) {
    console.error('browser smoke failed: browser CLI show did not expose the dashboard browser artifact.');
    console.error(browserShow.stderr || browserShow.stdout);
    process.exit(browserShow.status ?? 1);
  }

  const browserArtifact = runOpsCli(gatewayBaseUrl, apiToken, ['browser', 'artifact', artifactHandle]);
  const browserArtifactOutput = `${browserArtifact.stdout ?? ''}\n${browserArtifact.stderr ?? ''}`;
  if (browserArtifact.status !== 0 || !browserArtifactOutput.includes('URL: https://example.com/report')) {
    console.error('browser smoke failed: browser CLI artifact did not match the dashboard browser run.');
    console.error(browserArtifactOutput);
    process.exit(browserArtifact.status ?? 1);
  }

  const doctorPayload = await requestJson(`${gatewayBaseUrl}/api/browser/doctor`, {
    headers
  });
  const dockerSupport = Array.isArray(doctorPayload?.contract?.installDoctor?.dockerSupport)
    ? doctorPayload.contract.installDoctor.dockerSupport.map((entry) => String(entry))
    : [];
  if (
    dockerSupport.length < 2 ||
    !dockerSupport.some((entry) => entry.includes('Bake Scrapling plus browser dependencies into the image')) ||
    !dockerSupport.some((entry) => entry.includes('Keep browser capability optional'))
  ) {
    console.error('browser smoke failed: browser doctor did not expose the expected container readiness guidance.');
    process.exit(1);
  }

  const riskyPayload = await requestJson(`${gatewayBaseUrl}/api/browser/test`, {
    method: 'POST',
    headers,
    body: {
      agentId: resolvedTargetAgentId,
      url: 'https://example.com/report',
      requiresProxy: true,
      requiresStealth: true
    }
  });
  if (riskyPayload?.run?.status !== 'failed' || !['proxy_blocked', 'stealth_blocked'].includes(String(riskyPayload?.test?.blockedReason ?? ''))) {
    console.error('browser smoke failed: risky browser policy path was not blocked truthfully.');
    process.exit(1);
  }

  const scheduleLabel = `Browser monitor smoke ${Date.now().toString(36)}`;
  const schedulePrompt = 'Re-check https://example.com/report and report only actionable drift.';

  const schedulesOpen = run('agent-browser', ['--session', session, 'open', `${normalizedBaseUrl}/schedules`]);
  if (schedulesOpen.status !== 0) {
    console.error(schedulesOpen.stderr || schedulesOpen.stdout);
    process.exit(schedulesOpen.status ?? 1);
  }
  await sleep(500);

  const schedulesBody = run('agent-browser', ['--session', session, 'get', 'text', 'body']);
  const schedulesText = `${schedulesBody.stdout ?? ''}\n${schedulesBody.stderr ?? ''}`;
  if (!schedulesText.includes('Recurring work is now an explicit control plane.') || !schedulesText.includes('Create Schedule')) {
    console.error('browser smoke failed: Schedules page did not render the expected control-plane surface.');
    process.exit(1);
  }

  const fillScheduleForm = run('agent-browser', [
    '--session',
    session,
    'wait',
    '--fn',
    `(() => {
      const setText = (selector, value) => {
        const field = document.querySelector(selector);
        if (!field) return false;
        const prototype = Object.getPrototypeOf(field);
        const descriptor =
          Object.getOwnPropertyDescriptor(prototype, 'value') ||
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') ||
          Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        if (!descriptor || typeof descriptor.set !== 'function') return false;
        field.focus();
        descriptor.set.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      const setSelect = (selector, value) => {
        const field = document.querySelector(selector);
        if (!field) return false;
        field.focus();
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      const ready =
        setText('#schedule-create-label', ${JSON.stringify(scheduleLabel)}) &&
        setText('#schedule-create-category', 'browser_monitor') &&
        setText('#schedule-create-cadence', 'every 10m') &&
        setText('#schedule-create-prompt', ${JSON.stringify(schedulePrompt)}) &&
        setSelect('#schedule-create-agent', ${JSON.stringify(resolvedTargetAgentId)}) &&
        setSelect('#schedule-create-delivery-target', 'origin_session') &&
        setSelect('#schedule-create-session-target', 'dedicated_schedule_session');
      return ready;
    })()`
  ]);
  if (fillScheduleForm.status !== 0) {
    console.error('browser smoke failed: schedule form fields could not be populated from the dashboard.');
    console.error(fillScheduleForm.stderr || fillScheduleForm.stdout);
    process.exit(fillScheduleForm.status ?? 1);
  }

  const createSchedule = run('agent-browser', [
    '--session',
    session,
    'wait',
    '--fn',
    `(() => {
      const agent = document.querySelector('#schedule-create-agent');
      const delivery = document.querySelector('#schedule-create-delivery-target');
      const sessionTarget = document.querySelector('#schedule-create-session-target');
      const label = document.querySelector('#schedule-create-label');
      const prompt = document.querySelector('#schedule-create-prompt');
      if (!agent || !delivery || !sessionTarget || !label || !prompt) return false;
      if (label.value !== ${JSON.stringify(scheduleLabel)}) return false;
      if (prompt.value !== ${JSON.stringify(schedulePrompt)}) return false;
      if (agent.value !== ${JSON.stringify(resolvedTargetAgentId)}) return false;
      if (delivery.value !== 'origin_session') return false;
      if (sessionTarget.value !== 'dedicated_schedule_session') return false;
      const button = document.querySelector('#schedule-create-submit');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`
  ]);
  if (createSchedule.status !== 0) {
    console.error('browser smoke failed: schedule creation action could not be completed from the dashboard.');
    console.error(createSchedule.stderr || createSchedule.stdout);
    process.exit(createSchedule.status ?? 1);
  }

  let schedulePageText = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(400);
    const body = run('agent-browser', ['--session', session, 'get', 'text', 'body']);
    schedulePageText = `${body.stdout ?? ''}\n${body.stderr ?? ''}`;
    if (schedulePageText.includes(`Created schedule ${scheduleLabel}.`) && schedulePageText.includes(scheduleLabel)) {
      break;
    }
  }
  if (!schedulePageText.includes(scheduleLabel)) {
    console.error('browser smoke failed: schedule creation did not render the new dashboard schedule entry.');
    console.error(schedulePageText.slice(0, 2000));
    process.exit(1);
  }

  const schedulesPayload = await requestJson(`${gatewayBaseUrl}/api/schedules?limit=25`, {
    headers
  });
  const scheduleRow =
    Array.isArray(schedulesPayload?.schedules)
      ? schedulesPayload.schedules.find((entry) => String(entry?.label ?? '').trim() === scheduleLabel) ?? null
      : null;
  const scheduleId = typeof scheduleRow?.id === 'string' ? scheduleRow.id.trim() : '';
  if (!scheduleId) {
    console.error('browser smoke failed: API did not expose the dashboard-created schedule.');
    process.exit(1);
  }

  const scheduleShow = runOpsCli(gatewayBaseUrl, apiToken, ['schedule', 'show', scheduleId]);
  const scheduleShowOutput = `${scheduleShow.stdout ?? ''}\n${scheduleShow.stderr ?? ''}`;
  if (scheduleShow.status !== 0 || !scheduleShowOutput.includes(`label=${scheduleLabel}`) || !scheduleShowOutput.includes('cadence=every 10m')) {
    console.error('browser smoke failed: CLI schedule show did not match the dashboard-created schedule.');
    console.error(scheduleShowOutput);
    process.exit(scheduleShow.status ?? 1);
  }

  const scheduleRun = runOpsCli(gatewayBaseUrl, apiToken, ['schedule', 'run', scheduleId]);
  if (scheduleRun.status !== 0) {
    console.error('browser smoke failed: CLI schedule run failed.');
    console.error(scheduleRun.stderr || scheduleRun.stdout);
    process.exit(scheduleRun.status ?? 1);
  }

  const scheduleHistory = runOpsCli(gatewayBaseUrl, apiToken, ['schedule', 'history', scheduleId]);
  const scheduleHistoryOutput = `${scheduleHistory.stdout ?? ''}\n${scheduleHistory.stderr ?? ''}`;
  if (scheduleHistory.status !== 0 || !scheduleHistoryOutput.includes('Schedule history')) {
    console.error('browser smoke failed: CLI schedule history did not render.');
    console.error(scheduleHistoryOutput);
    process.exit(scheduleHistory.status ?? 1);
  }

  let apiHistoryVisible = false;
  let latestScheduleDetail = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(500);
    const detailPayload = await requestJson(`${gatewayBaseUrl}/api/schedules/${encodeURIComponent(scheduleId)}`, {
      headers
    });
    latestScheduleDetail = detailPayload;
    apiHistoryVisible = Array.isArray(detailPayload?.history)
      ? detailPayload.history.some((entry) => ['queued', 'running', 'completed'].includes(String(entry?.status ?? '')))
      : false;
    if (apiHistoryVisible) {
      break;
    }
  }
  if (!apiHistoryVisible) {
    console.error('browser smoke failed: API schedule history did not record the CLI-triggered run.');
    console.error(JSON.stringify(latestScheduleDetail?.history ?? [], null, 2));
    process.exit(1);
  }

  const refreshedSchedules = run('agent-browser', ['--session', session, 'open', `${normalizedBaseUrl}/schedules`]);
  if (refreshedSchedules.status !== 0) {
    console.error(refreshedSchedules.stderr || refreshedSchedules.stdout);
    process.exit(refreshedSchedules.status ?? 1);
  }
  await sleep(500);
  const refreshedBody = run('agent-browser', ['--session', session, 'get', 'text', 'body']);
  const refreshedText = `${refreshedBody.stdout ?? ''}\n${refreshedBody.stderr ?? ''}`;
  const refreshedLower = refreshedText.toLowerCase();
  if (
    !refreshedText.includes(scheduleLabel) ||
    (!refreshedLower.includes('queued') && !refreshedLower.includes('running') && !refreshedLower.includes('completed'))
  ) {
    console.error('browser smoke failed: dashboard schedule detail did not reflect the CLI/API queued state.');
    console.error(refreshedText.slice(0, 2000));
    process.exit(1);
  }
}

async function runGithubDeliveryCockpitSmoke(session, dashboardBaseUrl, gatewayBaseUrl, headers, seed) {
  const normalizedBaseUrl = dashboardBaseUrl.replace(/\/$/, '');
  const detailUrl = `${gatewayBaseUrl}/api/backlog/items/${encodeURIComponent(seed.itemId)}/delivery/detail`;
  const initialDetail = seed.detail;
  const blockerTitle = String(
    initialDetail?.contracts?.githubDelivery?.blockedReasonTaxonomy?.checks_failed?.title ?? 'Checks failed'
  ).trim();
  const policyVersion = String(initialDetail?.delivery?.metadata?.githubPolicy?.version ?? '').trim();
  const policySource = formatSourceLabel(initialDetail?.delivery?.metadata?.githubPolicy?.source);
  const journalSummaries = Array.isArray(initialDetail?.journal?.entries)
    ? initialDetail.journal.entries
        .map((entry) => String(entry?.summary ?? '').trim())
        .filter((entry) => entry.length > 0)
        .slice(0, 3)
    : [];
  if (journalSummaries.length === 0) {
    throw new Error('browser smoke seed failed: delivery detail did not produce journal summaries');
  }

  const backlogOpen = run('agent-browser', ['--session', session, 'open', `${normalizedBaseUrl}/backlog`]);
  if (backlogOpen.status !== 0) {
    console.error(backlogOpen.stderr || backlogOpen.stdout);
    process.exit(backlogOpen.status ?? 1);
  }
  await sleep(500);

  const openDrawer = run('agent-browser', [
    '--session',
    session,
    'wait',
    '--fn',
    `(() => {
      const target = [...document.querySelectorAll('article')].find((entry) => entry.textContent?.includes(${JSON.stringify(seed.title)}));
      if (!target) return false;
      target.click();
      return true;
    })()`
  ]);
  if (openDrawer.status !== 0) {
    console.error('browser smoke failed: backlog task drawer did not open for seeded GitHub delivery item.');
    console.error(openDrawer.stderr || openDrawer.stdout);
    process.exit(openDrawer.status ?? 1);
  }
  await sleep(700);

  const cockpitBody = run('agent-browser', ['--session', session, 'get', 'text', 'body']);
  const cockpitText = `${cockpitBody.stdout ?? ''}\n${cockpitBody.stderr ?? ''}`;
  if (!cockpitText.includes('GitHub delivery cockpit')) {
    console.error('browser smoke failed: seeded task drawer did not render the GitHub delivery cockpit.');
    process.exit(1);
  }
  if (!cockpitText.includes(blockerTitle)) {
    console.error('browser smoke failed: cockpit did not render the blocker title returned by the delivery detail API.');
    process.exit(1);
  }
  if (policyVersion && !cockpitText.includes(policyVersion)) {
    console.error('browser smoke failed: cockpit did not render the API policy version.');
    process.exit(1);
  }
  if (policySource && !cockpitText.toLowerCase().includes(policySource)) {
    console.error('browser smoke failed: cockpit did not render the API policy source.');
    process.exit(1);
  }
  const renderedSummaryIndexes = journalSummaries.map((summary) => cockpitText.indexOf(summary));
  if (renderedSummaryIndexes.some((index) => index === -1)) {
    console.error('browser smoke failed: cockpit did not render the same journal summaries returned by the delivery detail API.');
    process.exit(1);
  }
  for (let index = 1; index < renderedSummaryIndexes.length; index += 1) {
    if (renderedSummaryIndexes[index] < renderedSummaryIndexes[index - 1]) {
      console.error('browser smoke failed: cockpit journal order diverged from the delivery detail API ordering.');
      process.exit(1);
    }
  }
  if (!cockpitText.toLowerCase().includes('verified')) {
    console.error('browser smoke failed: cockpit did not render trust markers for verified journal evidence.');
    process.exit(1);
  }

  const clearStaleLease = run('agent-browser', [
    '--session',
    session,
    'wait',
    '--fn',
    `(() => {
      window.confirm = () => true;
      const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.includes('Clear stale lease'));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`
  ]);
  if (clearStaleLease.status !== 0) {
    console.error('browser smoke failed: cockpit could not execute the stale lease cleanup action.');
    console.error(clearStaleLease.stderr || clearStaleLease.stdout);
    process.exit(clearStaleLease.status ?? 1);
  }
  await sleep(1200);

  const repairedDetail = await requestJson(detailUrl, { headers });
  const repairedLease = repairedDetail?.delivery?.githubLease ?? {};
  if (String(repairedLease?.repo?.status ?? '') !== 'released') {
    console.error('browser smoke failed: stale lease cleanup did not release the repo lease according to the API.');
    process.exit(1);
  }
  const operatorRepairEntry =
    Array.isArray(repairedDetail?.journal?.entries)
      ? [...repairedDetail.journal.entries]
          .reverse()
          .find((entry) => String(entry?.kind ?? '') === 'operator_repair' && String(entry?.summary ?? '').includes('stale_lease_clear'))
      : null;
  if (!operatorRepairEntry) {
    console.error('browser smoke failed: repaired delivery detail did not record the operator repair audit entry.');
    process.exit(1);
  }
  if (String(repairedDetail?.evidenceBundle?.dimensions?.operator_repair_clarity?.status ?? '') !== 'evidence_available') {
    console.error('browser smoke failed: repaired delivery detail did not upgrade operator repair clarity evidence.');
    process.exit(1);
  }

  const repairedBody = run('agent-browser', ['--session', session, 'get', 'text', 'body']);
  const repairedText = `${repairedBody.stdout ?? ''}\n${repairedBody.stderr ?? ''}`;
  if (!repairedText.includes('Last repair receipt')) {
    console.error('browser smoke failed: cockpit did not render the repair receipt after cleanup.');
    process.exit(1);
  }
  if (!repairedText.includes('stale_lease_clear')) {
    console.error('browser smoke failed: cockpit repair receipt did not include the executed action.');
    process.exit(1);
  }
  if (!repairedText.includes(String(operatorRepairEntry.summary))) {
    console.error('browser smoke failed: cockpit did not refresh to the repaired journal truth returned by the API.');
    process.exit(1);
  }
}

try {
  ensureAgentBrowserInstall();
  cleanupRuntimeShims = createPortableRuntimeBinaryShims();
  let activeGatewayApiToken = gatewayApiToken;
  let activeGatewayHeaders = gatewayHeaders;
  let browserSmokeAgentId = null;
  const gatewayReadinessUrl = `${gatewayBaseUrl}/api/health/readiness`;
  const gatewayReady = await endpointAvailable(gatewayReadinessUrl, activeGatewayHeaders);
  let managedGatewayStarted = false;
  if (!gatewayReady) {
    const managedGatewayConfig = createManagedGatewayConfig(gatewayBaseUrl);
    cleanupManagedGatewayConfig = managedGatewayConfig.cleanup;
    activeGatewayApiToken = managedGatewayConfig.apiToken;
    activeGatewayHeaders =
      activeGatewayApiToken && activeGatewayApiToken.length > 0
        ? {
            Authorization: `Bearer ${activeGatewayApiToken}`,
            'x-ops-role': 'admin'
          }
        : {};
    latestGatewayHeaders = activeGatewayHeaders;
    const gatewayProcess = spawnManagedProcess(
      'pnpm',
      ['exec', 'tsx', 'packages/gateway/src/index.ts', '--config', managedGatewayConfig.configPath],
      'gateway',
      managedGatewayConfig.env
    );
    managedProcesses.push(gatewayProcess);
    managedGatewayStarted = true;
    await waitForEndpoint(gatewayReadinessUrl, {
      headers: activeGatewayHeaders,
      label: `gateway at ${gatewayBaseUrl}`,
      processRef: gatewayProcess
    });
  }

  if (managedGatewayStarted) {
    await primeReadyOnboarding(gatewayBaseUrl, activeGatewayHeaders);
    browserSmokeAgentId = await seedBrowserCapabilitySmokeState(gatewayBaseUrl, activeGatewayHeaders);
  }
  latestGatewayHeaders = activeGatewayHeaders;

  const healthUrl = `${dashboardBaseUrl.replace(/\/$/, '')}/`;
  const dashboardReady = await canReach(healthUrl);
  if (!dashboardReady) {
    if (dashboardEmbeddedInGateway) {
      ensureDashboardBuild();
      await waitForEndpoint(healthUrl, {
        label: `embedded dashboard at ${dashboardBaseUrl}`
      });
    } else {
      const dashboardProcess = spawnManagedDashboardProcess(dashboardBaseUrl);
      managedProcesses.push(dashboardProcess);
      await waitForEndpoint(healthUrl, {
        label: `dashboard at ${dashboardBaseUrl}`,
        processRef: dashboardProcess
      });
    }
  }

  const contractsCheck = await Promise.all([
    endpointAvailable(`${gatewayBaseUrl}/api/backlog/contracts`, activeGatewayHeaders),
    endpointAvailable(`${gatewayBaseUrl}/api/frontier/contracts`, activeGatewayHeaders)
  ]);
  if (!contractsCheck[0]) {
    console.error('browser smoke failed: backlog contract endpoint unavailable.');
    process.exit(1);
  }
  if (!contractsCheck[1]) {
    console.error('browser smoke failed: frontier contract endpoint unavailable.');
    process.exit(1);
  }

  githubCockpitSeed = await seedGithubDeliveryCockpitSmokeState(gatewayBaseUrl, activeGatewayHeaders);

  const session = `ops-browser-smoke-${Date.now().toString(36)}`;
  if (process.env.BROWSER_ENABLE_INGRESS_PROBE === '1') {
    try {
      await fetch(`${gatewayBaseUrl}/api/ingress/telegram`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          update_id: Date.now(),
          message: {
            text: 'browser-stream-check',
            chat: { id: 901001, type: 'private' },
            from: { id: 901001, username: 'browser-check' },
            mentioned: true
          }
        })
      });
    } catch {
      // Best effort: streaming badge assertion is tolerant when ingress is unavailable.
    }
  }

  const openResult = run('agent-browser', ['--session', session, 'open', dashboardBaseUrl]);
  if (openResult.status !== 0) {
    console.error(openResult.stderr || openResult.stdout);
    process.exit(openResult.status ?? 1);
  }

  let rootSnapshot = run('agent-browser', ['--session', session, 'snapshot', '-i']);
  if (rootSnapshot.status !== 0) {
    console.error(rootSnapshot.stderr || rootSnapshot.stdout);
    process.exit(rootSnapshot.status ?? 1);
  }
  let rootText = `${rootSnapshot.stdout ?? ''}\n${rootSnapshot.stderr ?? ''}`;
  let focusedOnboardingMode =
    (rootText.includes('Save token') &&
      rootText.includes('Vault material') &&
      rootText.includes('Run smoke verification')) ||
    (rootText.includes('Initialize Connection') &&
      rootText.includes('Unlock Vault') &&
      rootText.includes('Launch Verification'));
  const bootstrapApiToken =
    activeGatewayApiToken?.trim() ?? gatewayApiToken?.trim() ?? process.env.BROWSER_API_TOKEN?.trim() ?? '';
  if (focusedOnboardingMode && bootstrapApiToken.length > 0) {
    const tokenInputRefMatch = rootText.match(/textbox ".*API token.*" \[ref=([^\]]+)\]/i);
    const initializeRefMatch = rootText.match(/(?:Initialize Connection|Save token)" \[ref=([^\]]+)\]/);
    if (tokenInputRefMatch?.[1] && initializeRefMatch?.[1]) {
      const fillToken = run('agent-browser', ['--session', session, 'fill', `@${tokenInputRefMatch[1]}`, bootstrapApiToken]);
      if (fillToken.status !== 0) {
        console.error(fillToken.stderr || fillToken.stdout);
        process.exit(fillToken.status ?? 1);
      }
      const initializeClick = run('agent-browser', ['--session', session, 'click', `@${initializeRefMatch[1]}`]);
      if (initializeClick.status !== 0) {
        console.error(initializeClick.stderr || initializeClick.stdout);
        process.exit(initializeClick.status ?? 1);
      }
      await sleep(400);
      rootSnapshot = run('agent-browser', ['--session', session, 'snapshot', '-i']);
      if (rootSnapshot.status !== 0) {
        console.error(rootSnapshot.stderr || rootSnapshot.stdout);
        process.exit(rootSnapshot.status ?? 1);
      }
      rootText = `${rootSnapshot.stdout ?? ''}\n${rootSnapshot.stderr ?? ''}`;
      focusedOnboardingMode =
        (rootText.includes('Save token') &&
          rootText.includes('Vault material') &&
          rootText.includes('Run smoke verification')) ||
        (rootText.includes('Initialize Connection') &&
          rootText.includes('Unlock Vault') &&
          rootText.includes('Launch Verification'));
    }
  }
  if (focusedOnboardingMode) {
    const hasTokenEntry =
      rootText.includes('Save token') ||
      rootText.includes('API token') ||
      rootText.includes('Paste your API token') ||
      rootText.includes('Initialize Connection');
    const hasOnboardingCtas =
      (rootText.includes('Bootstrap + unlock') && rootText.includes('Run smoke verification')) ||
      (rootText.includes('Unlock Vault') && rootText.includes('Launch Verification'));
    if (!hasTokenEntry || !hasOnboardingCtas) {
      console.error('browser smoke failed: focused onboarding mode did not render expected setup controls.');
      process.exit(1);
    }
    run('agent-browser', ['--session', session, 'close']);
    console.log(`browser smoke checks passed against ${dashboardBaseUrl} (focused onboarding mode).`);
    console.log('browser test fixture check passed.');
    process.exit(0);
  }

  const hasLlmNav = rootText.includes('LLM Router') || rootText.includes('LLM') || rootText.includes('Costs');
  const hasPreferences = rootText.includes('Preferences') || rootText.includes('Settings');
  if (!hasPreferences || !hasLlmNav) {
    console.error('browser smoke failed: navigation shell links missing from dashboard snapshot.');
    process.exit(1);
  }

  const settingsOpen = run('agent-browser', ['--session', session, 'open', `${dashboardBaseUrl.replace(/\/$/, '')}/settings`]);
  if (settingsOpen.status !== 0) {
    console.error(settingsOpen.stderr || settingsOpen.stdout);
    process.exit(settingsOpen.status ?? 1);
  }

  const settingsWait = run('agent-browser', [
    '--session',
    session,
    'wait',
    '--fn',
    `(() => {
      const bodyText = document.body?.innerText ?? "";
      return Boolean(document.querySelector("#settings-token-validate")) ||
        (bodyText.includes("Save token") && (bodyText.includes("Initialize Connection") || bodyText.includes("Paste your API token")));
    })()`
  ]);
  if (settingsWait.status !== 0) {
    console.error('browser smoke failed: Preferences view did not render expected token controls.');
    process.exit(settingsWait.status ?? 1);
  }
  const settingsSnapshot = run('agent-browser', ['--session', session, 'snapshot', '-i']);
  const settingsText = `${settingsSnapshot.stdout ?? ''}\n${settingsSnapshot.stderr ?? ''}`;
  const settingsHasPreferencesControls = settingsText.includes('Validate token against gateway');
  const settingsHasOnboardingControls =
    settingsText.includes('Save token') &&
    (settingsText.includes('Initialize Connection') || settingsText.includes('Paste your API token'));
  if (!settingsHasPreferencesControls && !settingsHasOnboardingControls) {
    console.error('browser smoke failed: Preferences view did not render expected token controls.');
    process.exit(1);
  }

  const costsOpen = run('agent-browser', ['--session', session, 'open', `${dashboardBaseUrl.replace(/\/$/, '')}/llm`]);
  if (costsOpen.status !== 0) {
    console.error(costsOpen.stderr || costsOpen.stdout);
    process.exit(costsOpen.status ?? 1);
  }

  const costsWait = run('agent-browser', [
    '--session',
    session,
    'wait',
    '--fn',
    '(() => { const text = document.body?.innerText ?? ""; return text.includes("Commit Changes") || text.includes("Save Limits") || text.includes("Resource Guard"); })()'
  ]);
  if (costsWait.status !== 0) {
    console.error('browser smoke failed: Cost Control view did not render expected controls.');
    process.exit(costsWait.status ?? 1);
  }
  const costsSnapshot = run('agent-browser', ['--session', session, 'snapshot', '-i']);
  const costsText = `${costsSnapshot.stdout ?? ''}\n${costsSnapshot.stderr ?? ''}`;
  const hasCostControlCta =
    costsText.includes('Commit Changes') ||
    costsText.includes('Save Limits') ||
    costsText.includes('Resource Guard');
  if (!hasCostControlCta) {
    console.error('browser smoke failed: Cost Control view did not render expected controls.');
    process.exit(1);
  }

  const housekeepingOpen = run('agent-browser', ['--session', session, 'open', `${dashboardBaseUrl.replace(/\/$/, '')}/housekeeping`]);
  if (housekeepingOpen.status !== 0) {
    console.error(housekeepingOpen.stderr || housekeepingOpen.stdout);
    process.exit(housekeepingOpen.status ?? 1);
  }

  await sleep(200);
  const housekeepingSnapshot = run('agent-browser', ['--session', session, 'snapshot', '-i']);
  if (housekeepingSnapshot.status !== 0) {
    console.error(housekeepingSnapshot.stderr || housekeepingSnapshot.stdout);
    process.exit(housekeepingSnapshot.status ?? 1);
  }
  const housekeepingText = `${housekeepingSnapshot.stdout ?? ''}\n${housekeepingSnapshot.stderr ?? ''}`;
  const housekeepingBody = run('agent-browser', ['--session', session, 'get', 'text', 'body']);
  const housekeepingPageText = `${housekeepingBody.stdout ?? ''}\n${housekeepingBody.stderr ?? ''}`;
  if (
    !housekeepingPageText.includes('Run Cleanup Now') ||
    !housekeepingPageText.includes('Cron Health') ||
    !housekeepingPageText.includes('Local Runtime Sessions') ||
    !housekeepingPageText.includes('Self-Improvement Review')
  ) {
    console.error('browser smoke failed: Maintenance view missing cron/local/improvement panels.');
    process.exit(1);
  }
  if (!housekeepingPageText.includes('Run Cycle') || !housekeepingPageText.includes('Scan Now')) {
    console.error('browser smoke failed: Maintenance view missing action controls for improvement/local scan.');
    process.exit(1);
  }
  if (
    !housekeepingPageText.includes('All') ||
    !housekeepingPageText.includes('Codex') ||
    !housekeepingPageText.includes('Claude') ||
    !housekeepingPageText.includes('Gemini')
  ) {
    console.error('browser smoke failed: runtime filter controls are missing in Local Runtime Sessions panel.');
    process.exit(1);
  }

  const geminiFilterRefMatch = housekeepingText.match(/Gemini" \[ref=([^\]]+)\]/);
  if (!geminiFilterRefMatch) {
    console.error('browser smoke failed: Gemini runtime filter ref not found.');
    process.exit(1);
  }
  const geminiFilterClick = run('agent-browser', ['--session', session, 'click', `@${geminiFilterRefMatch[1]}`]);
  if (geminiFilterClick.status !== 0) {
    console.error(geminiFilterClick.stderr || geminiFilterClick.stdout);
    process.exit(geminiFilterClick.status ?? 1);
  }

  await sleep(200);
  const localFilterSnapshot = run('agent-browser', ['--session', session, 'snapshot', '-i']);
  const localFilterText = `${localFilterSnapshot.stdout ?? ''}\n${localFilterSnapshot.stderr ?? ''}`;
  const localFilterBody = run('agent-browser', ['--session', session, 'get', 'text', 'body']);
  const localFilterBodyText = `${localFilterBody.stdout ?? ''}\n${localFilterBody.stderr ?? ''}`;
  if (!localFilterBodyText.includes('filter: gemini')) {
    console.error('browser smoke failed: runtime filter switch did not update Local Runtime Sessions panel state.');
    process.exit(1);
  }

  const skillsOpen = run('agent-browser', ['--session', session, 'open', `${dashboardBaseUrl.replace(/\/$/, '')}/skills`]);
  if (skillsOpen.status !== 0) {
    console.error(skillsOpen.stderr || skillsOpen.stdout);
    process.exit(skillsOpen.status ?? 1);
  }

  await sleep(200);
  const skillsSnapshot = run('agent-browser', ['--session', session, 'snapshot', '-i']);
  const skillsText = `${skillsSnapshot.stdout ?? ''}\n${skillsSnapshot.stderr ?? ''}`;
  if (!skillsText.includes('owner/repo') || !skillsText.includes('Install')) {
    console.error('browser smoke failed: Skills view did not render installer controls.');
    process.exit(1);
  }

  const onboardingOpen = run('agent-browser', ['--session', session, 'open', `${dashboardBaseUrl.replace(/\/$/, '')}/onboarding`]);
  if (onboardingOpen.status !== 0) {
    console.error(onboardingOpen.stderr || onboardingOpen.stdout);
    process.exit(onboardingOpen.status ?? 1);
  }

  await sleep(200);
  const onboardingSnapshot = run('agent-browser', ['--session', session, 'snapshot', '-i']);
  const onboardingText = `${onboardingSnapshot.stdout ?? ''}\n${onboardingSnapshot.stderr ?? ''}`;
  const hasSmokeCta =
    onboardingText.includes('Run smoke verification') ||
    onboardingText.includes('Smoke run') ||
    onboardingText.includes('smoke') ||
    onboardingText.includes('Launch Verification');
  const hasVaultControls =
    onboardingText.includes('Vault material') ||
    onboardingText.includes('Bootstrap + unlock') ||
    onboardingText.includes('Lock Vault') ||
    onboardingText.includes('Save Secrets To Vault');
  if (!hasSmokeCta || !hasVaultControls) {
    console.error('browser smoke failed: Onboarding view did not render expected wizard controls.');
    console.error('onboarding snapshot excerpt:');
    console.error(onboardingText.slice(0, 1200));
    process.exit(1);
  }

  const missionOpen = run('agent-browser', ['--session', session, 'open', `${dashboardBaseUrl.replace(/\/$/, '')}/mission-control`]);
  if (missionOpen.status === 0) {
    await sleep(250);
    const missionBody = run('agent-browser', ['--session', session, 'get', 'text', 'body']);
    const missionText = `${missionBody.stdout ?? ''}\n${missionBody.stderr ?? ''}`;
    if (!missionText.includes('Mission Control Console')) {
      console.error('browser smoke failed: Mission Control did not render.');
      process.exit(1);
    }
    if (process.env.BROWSER_ENABLE_INGRESS_PROBE === '1' && !missionText.includes('Streaming')) {
      console.error('browser smoke failed: streaming indicator not visible on mission control session cards.');
      process.exit(1);
    }
  }

  const backlogOpen = run('agent-browser', ['--session', session, 'open', `${dashboardBaseUrl.replace(/\/$/, '')}/backlog`]);
  if (backlogOpen.status !== 0) {
    console.error(backlogOpen.stderr || backlogOpen.stdout);
    process.exit(backlogOpen.status ?? 1);
  }
  await sleep(500);
  const backlogBody = run('agent-browser', ['--session', session, 'get', 'text', 'body']);
  const backlogText = `${backlogBody.stdout ?? ''}\n${backlogBody.stderr ?? ''}`;
  if (!backlogText.includes('Backlog Control Plane') || !backlogText.includes('Orchestration Inspector')) {
    console.error('browser smoke failed: Backlog page missing control-plane or inspector sections.');
    process.exit(1);
  }
  if (!backlogText.includes('Archived') || !backlogText.includes('Decision Stream')) {
    console.error('browser smoke failed: Backlog page missing lifecycle filter/decision stream affordances.');
    process.exit(1);
  }

  await runGithubDeliveryCockpitSmoke(session, dashboardBaseUrl, gatewayBaseUrl, activeGatewayHeaders, githubCockpitSeed);
  await runBrowserOpsSmoke(session, dashboardBaseUrl, {
    targetAgentId: browserSmokeAgentId
  });
  await runBrowserScheduleSmoke(session, dashboardBaseUrl, gatewayBaseUrl, activeGatewayHeaders, {
    targetAgentId: browserSmokeAgentId
  });

  run('agent-browser', ['--session', session, 'close']);

  console.log(`browser smoke checks passed against ${dashboardBaseUrl}.`);
  console.log('browser test fixture check passed.');
} finally {
  await cleanupGithubDeliveryCockpitSmokeState(gatewayBaseUrl, latestGatewayHeaders, githubCockpitSeed);
  cleanup();
}
