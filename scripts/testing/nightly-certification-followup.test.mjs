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

function passedArchive(schema, gates) {
  return {
    schema,
    version: 1,
    archivedAt: new Date().toISOString(),
    status: 'passed',
    gates
  };
}

test('nightly follow-up routes missing live Telegram evidence through provider readiness first', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-nightly-followup-'));
  const fakeBin = path.join(tempRoot, 'bin');
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakePnpm = path.join(fakeBin, 'pnpm');
  fs.writeFileSync(fakePnpm, '#!/usr/bin/env sh\nexit 0\n', 'utf8');
  fs.chmodSync(fakePnpm, 0o755);

  writeJson(
    path.join(tempRoot, 'docs/certifications/interactive-browser-live-latest.json'),
    passedArchive('ops.interactive-browser-live-certification-archive.v1', {
      externalLiveRunPassed: true,
      providerIsCdpChrome: true,
      clickPassed: true,
      typePassed: true,
      screenshotPersisted: true,
      pdfPersisted: true
    })
  );
  writeJson(
    path.join(tempRoot, 'docs/certifications/live-social-browser-latest.json'),
    passedArchive('ops.live-social-browser-certification-archive.v1', {
      rawReportPassed: true,
      telegramSmokePassed: true,
      telegramPromptScenariosPassed: true,
      socialProfilesAutoSelected: true,
      scraplingProviderPreserved: true,
      connectedSharedProfilesUsed: true
    })
  );
  writeJson(
    path.join(tempRoot, 'docs/certifications/live-github-delivery-latest.json'),
    passedArchive('ops.live-github-delivery-certification-archive.v1', {
      gatewayReachable: true,
      repoCredentialsAccepted: true,
      issueWriteAccepted: true,
      kanbanDeliveryLinked: true,
      repairReceiptRecorded: true,
      trackedArchiveRedacted: true
    })
  );

  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/testing/run-nightly-certification.mjs')], {
    cwd: tempRoot,
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`
    },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const report = JSON.parse(
    fs.readFileSync(path.join(tempRoot, '.ops/certifications/nightly/certification-report.json'), 'utf8')
  );
  assert.equal(report.status, 'passed');
  assert.equal(report.gates.liveEvidencePending, true);
  assert.match(report.followUpTasks.join('\n'), /OPS_RUN_PROVIDER_READINESS_CERT=1 pnpm test:provider-readiness/u);
  assert.match(report.followUpTasks.join('\n'), /automatically uses the selected provider model/u);

  const telegramEvidence = report.lanes.find((lane) => lane.id === 'live_telegram_process_archive');
  assert.equal(telegramEvidence.status, 'skipped');
  assert.match(telegramEvidence.output, /provider-readiness/u);
});
