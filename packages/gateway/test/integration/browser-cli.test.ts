import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const TSX_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

function installFakeScraplingExecutable(root: string): string {
  const executablePath = path.join(root, 'fake-scrapling.mjs');
  fs.writeFileSync(
    executablePath,
    [
      '#!/usr/bin/env node',
      'import fs from "node:fs";',
      'import path from "node:path";',
      '',
      'const args = process.argv.slice(2);',
      'const normalizeTool = (value) => String(value ?? "").replace(/-/g, "_");',
      'const buildBody = ({ tool, url, selector = "" }) => [',
      '  `Tool: ${normalizeTool(tool)}`,',
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
      '}',
      '',
      'if ((args[0] ?? "") === "mcp") {',
      '  let buffer = "";',
      '  const write = (payload) => process.stdout.write(`${JSON.stringify(payload)}\\n`);',
      '  process.stdin.on("data", (chunk) => {',
      '    buffer += chunk.toString("utf8");',
      '    const lines = buffer.split(/\\r?\\n/);',
      '    buffer = lines.pop() ?? "";',
      '    for (const line of lines) {',
      '      if (!line.trim()) continue;',
      '      const message = JSON.parse(line);',
      '      if (message.method === "initialize" && message.id) {',
      '        write({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake-scrapling", version: "1.0.0" } } });',
      '        continue;',
      '      }',
      '      if (message.method === "tools/call" && message.id) {',
      '        const tool = message.params?.name ?? "get";',
      '        const toolArgs = message.params?.arguments ?? {};',
      '        const url = toolArgs.url ?? toolArgs.urls?.[0] ?? "";',
      '        const selector = toolArgs.css_selector ?? "";',
      '        const body = buildBody({ tool, url, selector });',
      '        write({',
      '          jsonrpc: "2.0",',
      '          id: message.id,',
      '          result: {',
      '            content: [{ type: "text", text: body }],',
      '            structuredContent: { status: 200, content: [body], url },',
      '            isError: false',
      '          }',
      '        });',
      '      }',
      '    }',
      '  });',
      '  process.stdin.resume();',
      '  process.on("SIGTERM", () => process.exit(0));',
      '  process.on("SIGINT", () => process.exit(0));',
      '} else {',
      '  console.error("unsupported command");',
      '  process.exit(1);',
      '}'
    ].join('\n'),
    'utf8'
  );
  fs.chmodSync(executablePath, 0o755);
  return executablePath;
}

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX_BIN, args, {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        NO_COLOR: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            [
              `CLI command failed: ${args.join(' ')}`,
              stdout ? `stdout:\n${stdout}` : '',
              stderr ? `stderr:\n${stderr}` : ''
            ]
              .filter(Boolean)
              .join('\n\n')
          )
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

describe('browser cli integration', () => {
  const harnesses: GatewayTestHarness[] = [];

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()!.close();
    }
  });

  it('keeps browser status, doctor, test, history, trace, artifact, and agent capability assignment aligned through the real cli scripts', async () => {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-browser-cli-runtime-'));
    const previousEnv = {
      OPS_LOCAL_CODEX_ROOT: process.env.OPS_LOCAL_CODEX_ROOT,
      OPS_LOCAL_CLAUDE_PROJECTS_ROOT: process.env.OPS_LOCAL_CLAUDE_PROJECTS_ROOT,
      OPS_LOCAL_GEMINI_ROOT: process.env.OPS_LOCAL_GEMINI_ROOT
    };

    process.env.OPS_LOCAL_CODEX_ROOT = path.join(runtimeRoot, 'codex');
    process.env.OPS_LOCAL_CLAUDE_PROJECTS_ROOT = path.join(runtimeRoot, 'claude');
    process.env.OPS_LOCAL_GEMINI_ROOT = path.join(runtimeRoot, 'gemini');
    fs.mkdirSync(process.env.OPS_LOCAL_CODEX_ROOT, { recursive: true });
    fs.mkdirSync(process.env.OPS_LOCAL_CLAUDE_PROJECTS_ROOT, { recursive: true });
    fs.mkdirSync(process.env.OPS_LOCAL_GEMINI_ROOT, { recursive: true });

    try {
      const harness = await createGatewayTestHarness('browser-cli', (config) => {
        const root = path.dirname(config.persistence.sqlitePath);
        config.browser.enabled = true;
        config.browser.transport = 'stdio';
        config.browser.executable = installFakeScraplingExecutable(root);
      });
      harnesses.push(harness);

      const baseline = await harness.inject({
        method: 'POST',
        url: '/api/onboarding/ceo-baseline',
        payload: {
          actor: 'browser-cli-test'
        }
      });
      expect(baseline.statusCode).toBe(200);

      const address = await harness.app.listen({
        host: '127.0.0.1',
        port: 0
      });

      const commonArgs = ['--host', address, '--token', harness.config.server.apiToken];

      const setBrowser = await runCli([
        'scripts/runtime/agents.ts',
        'set-browser',
        'software-engineer',
        'enabled',
        ...commonArgs
      ]);
      expect(setBrowser.stdout).toContain('browser=enabled');

      const status = await runCli(['scripts/runtime/ops.ts', 'browser', 'status', ...commonArgs]);
      expect(status.stdout).toContain('provider=scrapling');
      expect(status.stdout).toContain('health=ready');

      const doctor = await runCli(['scripts/runtime/ops.ts', 'browser', 'doctor', ...commonArgs]);
      expect(doctor.stdout).toContain('schema=ops.browser-capability.v1');
      expect(doctor.stdout).toContain('Binary availability');

      const testRun = await runCli([
        'scripts/runtime/ops.ts',
        'browser',
        'test',
        'https://example.com/report',
        '--agent',
        'software-engineer',
        '--selector',
        '#main',
        '--mode',
        'markdown',
        ...commonArgs
      ]);
      expect(testRun.stdout).toContain('selected_tool=get');
      const runMatch = testRun.stdout.match(/Browser run ([^\s]+)/);
      expect(runMatch?.[1]).toBeTruthy();
      const runId = runMatch![1];

      const history = await runCli(['scripts/runtime/ops.ts', 'browser', 'history', '--limit', '5', ...commonArgs]);
      expect(history.stdout).toContain(runId);
      expect(history.stdout).toContain('tool=get');

      const show = await runCli(['scripts/runtime/ops.ts', 'browser', 'show', runId, ...commonArgs]);
      expect(show.stdout).toContain('primary_tool=get');
      const artifactMatch = show.stdout.match(/handle=([^\s]+)/);
      expect(artifactMatch?.[1]).toBeTruthy();
      const artifactHandle = artifactMatch![1];

      const artifact = await runCli(['scripts/runtime/ops.ts', 'browser', 'artifact', artifactHandle, ...commonArgs]);
      expect(artifact.stdout).toContain(`Browser artifact ${artifactHandle}`);
      expect(artifact.stdout).toContain('URL: https://example.com/report');
      expect(artifact.stdout).toContain('Selector: #main');
    } finally {
      if (previousEnv.OPS_LOCAL_CODEX_ROOT === undefined) {
        delete process.env.OPS_LOCAL_CODEX_ROOT;
      } else {
        process.env.OPS_LOCAL_CODEX_ROOT = previousEnv.OPS_LOCAL_CODEX_ROOT;
      }
      if (previousEnv.OPS_LOCAL_CLAUDE_PROJECTS_ROOT === undefined) {
        delete process.env.OPS_LOCAL_CLAUDE_PROJECTS_ROOT;
      } else {
        process.env.OPS_LOCAL_CLAUDE_PROJECTS_ROOT = previousEnv.OPS_LOCAL_CLAUDE_PROJECTS_ROOT;
      }
      if (previousEnv.OPS_LOCAL_GEMINI_ROOT === undefined) {
        delete process.env.OPS_LOCAL_GEMINI_ROOT;
      } else {
        process.env.OPS_LOCAL_GEMINI_ROOT = previousEnv.OPS_LOCAL_GEMINI_ROOT;
      }
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });
});
