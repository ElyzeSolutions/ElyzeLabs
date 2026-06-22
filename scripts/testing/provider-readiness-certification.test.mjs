import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const REPORT_PATH = path.join(REPO_ROOT, '.ops/certifications/provider-readiness/certification-report.json');

function createSelectedEnvPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-provider-readiness-'));
  return path.join(dir, 'selected-process-model.env');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function runNodeScript(args, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      ...options,
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
    child.on('close', (code) => {
      resolve({ status: code, stdout, stderr });
    });
  });
}

async function withFakeGateway(handler, run) {
  const server = http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      writeJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  assert.notEqual(address, null);
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('provider readiness discovers process provider models before static defaults', async () => {
  const testedModels = [];
  const selectedEnvPath = createSelectedEnvPath();
  await withFakeGateway(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/api/health/readiness') {
      writeJson(response, 200, { ok: true });
      return;
    }
    if (url.pathname === '/api/llm/routing/effective') {
      const requestedModel = url.searchParams.get('model');
      const selectedModel = requestedModel ?? 'openrouter/acme/dynamic-process-model';
      writeJson(response, 200, {
        registry: {
          entries: [
            {
              model: 'openrouter/acme/dynamic-process-model',
              provider: 'openrouter',
              allowedRuntimes: ['process'],
              sources: ['fake_gateway']
            }
          ],
          providers: {
            openrouter: ['openrouter/acme/dynamic-process-model'],
            google: []
          }
        },
        routes: [
          {
            runtime: 'process',
            policy: 'orchestrator',
            requestedModel,
            primaryModel: 'openrouter/acme/dynamic-process-model',
            selected: {
              runtime: 'process',
              provider: 'openrouter',
              model: selectedModel,
              authProfileId: 'openrouter:default'
            },
            reason: 'selected',
            checks: [
              {
                model: selectedModel,
                provider: 'openrouter',
                authProfileId: 'openrouter:default',
                eligible: true,
                reason: 'eligible'
              }
            ]
          }
        ]
      });
      return;
    }
    if (url.pathname === '/api/onboarding/provider-keys/live-check') {
      const body = await parseBody(request);
      testedModels.push(body.processChatModel);
      writeJson(response, 200, {
        live: {
          overall: 'ok',
          providers: {
            processChat: {
              status: 'ok',
              configured: true,
              tested: true,
              ok: true,
              provider: 'openrouter',
              model: body.processChatModel,
              latencyMs: 42,
              detail: 'ok'
            }
          }
        }
      });
      return;
    }
    writeJson(response, 404, { error: 'not found' });
  }, async (baseUrl) => {
    fs.rmSync(path.dirname(REPORT_PATH), { force: true, recursive: true });
    const result = await runNodeScript(['scripts/testing/run-provider-readiness-certification.mjs'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        OPS_RUN_PROVIDER_READINESS_CERT: '1',
        OPS_PROVIDER_READINESS_API_TOKEN: 'test-token',
        OPS_PROVIDER_READINESS_BASE_URL: baseUrl,
        OPS_PROVIDER_READINESS_SELECTED_MODEL_ENV: selectedEnvPath
      }
    });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    assert.deepEqual(testedModels, ['openrouter/acme/dynamic-process-model']);

    const report = readJson(REPORT_PATH);
    assert.equal(report.status, 'passed');
    assert.equal(report.processModelSelection.discoveredCandidateCount, 1);
    assert.equal(report.processModelSelection.selectedModel, 'openrouter/acme/dynamic-process-model');
    assert.equal(report.processModelSelection.discovery.status, 'passed');
    assert.equal(report.processModelSelection.selectedEnvPath, path.relative(REPO_ROOT, selectedEnvPath));

    const selectedEnv = fs.readFileSync(selectedEnvPath, 'utf8');
    assert.match(selectedEnv, /OPS_LIVE_TELEGRAM_PROCESS_MODEL='openrouter\/acme\/dynamic-process-model'/);
    assert.doesNotMatch(selectedEnv, /test-token/);
  });
});

test('provider readiness reports provider-specific credential remediation without secrets', async () => {
  const selectedEnvPath = createSelectedEnvPath();
  const attemptedModels = [];
  await withFakeGateway(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/api/health/readiness') {
      writeJson(response, 200, { ok: true });
      return;
    }
    if (url.pathname === '/api/llm/routing/effective') {
      const requestedModel = url.searchParams.get('model');
      const provider = requestedModel?.startsWith('gemini') ? 'google' : 'openrouter';
      writeJson(response, 200, {
        registry: {
          entries: [],
          providers: {
            openrouter: [],
            google: []
          }
        },
        routes: [
          {
            runtime: 'process',
            policy: 'orchestrator',
            requestedModel,
            selected: {
              runtime: 'process',
              provider,
              model: requestedModel,
              authProfileId: `${provider}:default`
            },
            reason: 'selected',
            checks: [
              {
                model: requestedModel,
                provider,
                authProfileId: `${provider}:default`,
                eligible: true,
                reason: 'eligible'
              }
            ]
          }
        ]
      });
      return;
    }
    if (url.pathname === '/api/onboarding/provider-keys/live-check') {
      const body = await parseBody(request);
      attemptedModels.push(body.processChatModel);
      const isGoogle = String(body.processChatModel).startsWith('gemini');
      writeJson(response, 200, {
        live: {
          overall: 'failed',
          providers: {
            processChat: {
              status: 'error',
              configured: true,
              tested: true,
              ok: false,
              provider: isGoogle ? 'google' : 'openrouter',
              model: body.processChatModel,
              latencyMs: 12,
              detail: isGoogle ? 'API key expired. Please renew the API key.' : 'User not found.'
            }
          }
        }
      });
      return;
    }
    writeJson(response, 404, { error: 'not found' });
  }, async (baseUrl) => {
    fs.rmSync(path.dirname(REPORT_PATH), { force: true, recursive: true });
    const result = await runNodeScript(['scripts/testing/run-provider-readiness-certification.mjs'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        OPENROUTER_API_KEY: 'test-secret',
        GOOGLE_API_KEY: 'test-google-secret',
        OPS_RUN_PROVIDER_READINESS_CERT: '1',
        OPS_PROVIDER_READINESS_API_TOKEN: 'test-token',
        OPS_PROVIDER_READINESS_BASE_URL: baseUrl,
        OPS_PROVIDER_READINESS_MODEL_CANDIDATES: 'openrouter/acme/needs-auth,gemini-2.5-flash',
        OPS_PROVIDER_READINESS_SELECTED_MODEL_ENV: selectedEnvPath
      }
    });
    assert.equal(result.status, 1);
    assert.deepEqual(attemptedModels.slice(0, 2), ['openrouter/acme/needs-auth', 'gemini-2.5-flash']);
    assert.doesNotMatch(attemptedModels.join('\n'), /openrouter\/openai\/gpt-4\.1-mini/);
    assert.doesNotMatch(attemptedModels.join('\n'), /openrouter\/google\/gemini-2\.5-flash/);

    const report = readJson(REPORT_PATH);
    assert.equal(report.status, 'failed');
    assert.equal(report.processModelSelection.failureSummary.byReason.provider_auth_invalid, attemptedModels.length);
    assert.ok(report.processModelSelection.failureSummary.byCredential.openrouter.authFailures >= 1);
    assert.ok(report.processModelSelection.failureSummary.byCredential.google.authFailures >= 1);
    assert.deepEqual(report.attempts[0].credentialHint.acceptedEnvKeys, ['OPENROUTER_API_KEY', 'OPS_OPENROUTER_API_KEY']);
    assert.deepEqual(report.attempts[1].credentialHint.acceptedEnvKeys, ['GOOGLE_API_KEY', 'OPS_GOOGLE_API_KEY']);
    assert.match(report.followUpTasks.join('\n'), /OPENROUTER_API_KEY or OPS_OPENROUTER_API_KEY/);
    assert.match(report.followUpTasks.join('\n'), /GOOGLE_API_KEY or OPS_GOOGLE_API_KEY/);
    assert.doesNotMatch(JSON.stringify(report), /test-secret|test-google-secret|test-token/);
  });
});

test('provider readiness prioritizes OpenRouter auto and execution models before personnel defaults', async () => {
  const testedModels = [];
  const selectedEnvPath = createSelectedEnvPath();
  await withFakeGateway(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/api/health/readiness') {
      writeJson(response, 200, { ok: true });
      return;
    }
    if (url.pathname === '/api/llm/routing/effective') {
      const requestedModel = url.searchParams.get('model');
      const selectedModel = requestedModel ?? 'openrouter/openai/gpt-5-mini';
      writeJson(response, 200, {
        registry: {
          entries: [
            {
              model: 'openrouter/auto',
              provider: 'openrouter',
              allowedRuntimes: ['process'],
              sources: ['execution_stack']
            },
            {
              model: 'openrouter/openai/gpt-5-mini',
              provider: 'openrouter',
              allowedRuntimes: ['process'],
              sources: ['personnel_stack']
            },
            {
              model: 'openrouter/minimax/minimax-m2.5',
              provider: 'openrouter',
              allowedRuntimes: ['process'],
              sources: ['execution_stack']
            }
          ],
          providers: {
            openrouter: ['openrouter/openai/gpt-5-mini', 'openrouter/minimax/minimax-m2.5', 'openrouter/auto'],
            google: []
          }
        },
        routes: [
          {
            runtime: 'process',
            policy: 'orchestrator',
            requestedModel,
            selected: {
              runtime: 'process',
              provider: 'openrouter',
              model: selectedModel,
              authProfileId: 'openrouter:default'
            },
            reason: 'selected',
            checks: [
              {
                model: selectedModel,
                provider: 'openrouter',
                authProfileId: 'openrouter:default',
                eligible: true,
                reason: 'eligible'
              }
            ]
          }
        ]
      });
      return;
    }
    if (url.pathname === '/api/onboarding/provider-keys/live-check') {
      const body = await parseBody(request);
      testedModels.push(body.processChatModel);
      writeJson(response, 200, {
        live: {
          overall: 'ok',
          providers: {
            processChat: {
              status: 'ok',
              configured: true,
              tested: true,
              ok: true,
              provider: 'openrouter',
              model: body.processChatModel,
              latencyMs: 18,
              detail: 'ok'
            }
          }
        }
      });
      return;
    }
    writeJson(response, 404, { error: 'not found' });
  }, async (baseUrl) => {
    fs.rmSync(path.dirname(REPORT_PATH), { force: true, recursive: true });
    const result = await runNodeScript(['scripts/testing/run-provider-readiness-certification.mjs'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        OPS_RUN_PROVIDER_READINESS_CERT: '1',
        OPS_PROVIDER_READINESS_API_TOKEN: 'test-token',
        OPS_PROVIDER_READINESS_BASE_URL: baseUrl,
        OPS_PROVIDER_READINESS_SELECTED_MODEL_ENV: selectedEnvPath
      }
    });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    assert.deepEqual(testedModels, ['openrouter/auto']);

    const report = readJson(REPORT_PATH);
    assert.equal(report.status, 'passed');
    assert.equal(report.processModelSelection.selectedModel, 'openrouter/auto');
  });
});
