import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const ARCHIVE_PATH = path.join(REPO_ROOT, 'docs/certifications/live-github-delivery-latest.json');
const REPORT_PATH = path.join(REPO_ROOT, '.ops/certifications/live-github-delivery/certification-report.json');

test('default live GitHub delivery run preserves an existing passed tracked archive', () => {
  const before = fs.readFileSync(ARCHIVE_PATH, 'utf8');
  const beforeJson = JSON.parse(before);
  assert.equal(beforeJson.status, 'passed');

  execFileSync(process.execPath, ['scripts/testing/run-live-github-delivery-certification.mjs'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      OPS_RUN_LIVE_GITHUB_DELIVERY_CERT: '0',
      OPS_LIVE_GITHUB_DELIVERY_ARCHIVE_ALLOW_FAILED: '0'
    },
    stdio: 'pipe'
  });

  const after = fs.readFileSync(ARCHIVE_PATH, 'utf8');
  assert.equal(after, before);

  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  assert.equal(report.status, 'skipped');
});
