import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runNode(scriptPath, env) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...env
    },
    encoding: 'utf8'
  });
}

function passedArchive(schema) {
  return {
    schema,
    version: 1,
    archivedAt: '2026-01-01T00:00:00.000Z',
    status: 'passed',
    marker: {
      hash: 'passed-marker',
      rawStoredInTrackedArchive: false
    }
  };
}

test('live social archive refuses to replace passed evidence with failed evidence', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elyze-social-archive-'));
  const inputPath = path.join(tempDir, 'failed-report.json');
  const outputPath = path.join(tempDir, 'archive.json');
  const existing = passedArchive('ops.live-social-browser-certification-archive.v1');
  writeJson(inputPath, {
    schema: 'ops.live-social-browser-certification.v1',
    generatedAt: '2026-01-01T00:00:00.000Z',
    status: 'failed',
    summary: {},
    telegram: {},
    scenarios: []
  });
  writeJson(outputPath, existing);

  const result = runNode('scripts/testing/archive-live-social-browser-certification.mjs', {
    OPS_LIVE_SOCIAL_BROWSER_ARCHIVE_INPUT: inputPath,
    OPS_LIVE_SOCIAL_BROWSER_ARCHIVE_OUTPUT: outputPath,
    OPS_LIVE_SOCIAL_BROWSER_ARCHIVE_ALLOW_FAILED: '0'
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /refusing to overwrite passed live social browser archive/u);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), existing);
});

test('live Telegram process archive refuses to replace passed evidence with failed evidence', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elyze-telegram-archive-'));
  const inputPath = path.join(tempDir, 'failed-report.json');
  const outputPath = path.join(tempDir, 'archive.json');
  const existing = passedArchive('ops.live-telegram-process-certification-archive.v1');
  writeJson(inputPath, {
    schema: 'ops.live-telegram-process-certification.v1',
    generatedAt: '2026-01-01T00:00:00.000Z',
    status: 'failed',
    registry: {},
    marker: {},
    target: {},
    processModelSelection: {},
    latency: {},
    summary: {},
    gates: {},
    scenarios: []
  });
  writeJson(outputPath, existing);

  const result = runNode('scripts/testing/archive-live-telegram-process-certification.mjs', {
    OPS_LIVE_TELEGRAM_PROCESS_ARCHIVE_INPUT: inputPath,
    OPS_LIVE_TELEGRAM_PROCESS_ARCHIVE_OUTPUT: outputPath,
    OPS_LIVE_TELEGRAM_PROCESS_ARCHIVE_ALLOW_FAILED: '0'
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /refusing to overwrite passed live Telegram process archive/u);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), existing);
});
