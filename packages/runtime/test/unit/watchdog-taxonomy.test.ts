import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RuntimeWatchdog, isQuotaSaturationSignal, matchRuntimeSignature } from '../../src/index.ts';

describe('watchdog taxonomy', () => {
  it('classifies quota saturation from codex output', () => {
    const matched = matchRuntimeSignature('codex', 'error: 429 Too Many Requests (rate_limit_exceeded)');
    expect(matched?.signature.status).toBe('quota_exceeded');
    expect(isQuotaSaturationSignal('codex', 'rate_limit_exceeded 429')).toBe(true);
    expect(isQuotaSaturationSignal('codex', 'HTTP status 429 from provider')).toBe(true);
    expect(
      isQuotaSaturationSignal('codex', "You've hit your usage limit. Upgrade to Pro or try again later.")
    ).toBe(true);
  });

  it('does not trigger false-positive classification on normal progress output', () => {
    const matched = matchRuntimeSignature('codex', 'processing request... still working on implementation');
    expect(matched).toBeNull();
    expect(isQuotaSaturationSignal('codex', 'processing request...')).toBe(false);
    expect(isQuotaSaturationSignal('codex', 'Resolved, downloaded and extracted [429]')).toBe(false);
    expect(matchRuntimeSignature('codex', 'Large prompts can overflow context windows; split into smaller tasks.')).toBeNull();
    expect(matchRuntimeSignature('codex', 'root.serverError')).toBeNull();
    expect(matchRuntimeSignature('codex', 'title: "Server Error"')).toBeNull();
    expect(matchRuntimeSignature('codex', 'error: server error from provider connection')).not.toBeNull();
    expect(
      matchRuntimeSignature(
        'codex',
        '2026-03-06T10:52:32Z WARN codex_core::analytics_client: events failed with status 403 Forbidden: /backend-api/codex/analytics-events/events'
      )
    ).toBeNull();
  });

  it('classifies git/ssh interactive blockers as alert-human signals', () => {
    const interactive = matchRuntimeSignature(
      'codex',
      "Enter passphrase for key '/home/user/.ssh/id_ed25519':"
    );
    expect(interactive?.signature.id).toBe('git_ssh_interactive_prompt');
    expect(interactive?.signature.recommendation).toBe('alert_human');

    const authFailure = matchRuntimeSignature('codex', 'fatal: Permission denied (publickey).');
    expect(authFailure?.signature.id).toBe('git_auth_or_ssh_failure');
    expect(authFailure?.signature.recommendation).toBe('alert_human');
  });

  it('detects file-based runtime failures and stale output transitions', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-watchdog-'));
    const outputFile = path.join(root, 'tmux.log');
    fs.writeFileSync(outputFile, '', 'utf8');

    let nowMs = Date.now();
    const watchdog = new RuntimeWatchdog({
      config: {
        scanIntervalMs: 10_000,
        staleOutputMs: 2_000,
        maxSignaturesPerScan: 8
      },
      now: () => nowMs
    });

    watchdog.registerRun({
      runId: 'run-watchdog-1',
      runtime: 'codex',
      outputFile,
      startedAt: new Date(nowMs).toISOString()
    });

    fs.appendFileSync(outputFile, '429 Too Many Requests\n', 'utf8');
    await watchdog.scanNow();
    const failed = watchdog.getRunStatus('run-watchdog-1');
    expect(failed?.status).toBe('quota_exceeded');
    expect(failed?.recommendation).toBe('abort_and_switch_provider');

    fs.writeFileSync(outputFile, '', 'utf8');
    watchdog.registerRun({
      runId: 'run-watchdog-bun-progress',
      runtime: 'codex',
      outputFile,
      startedAt: new Date(nowMs).toISOString()
    });
    fs.appendFileSync(outputFile, 'Resolved, downloaded and extracted [429]\n', 'utf8');
    await watchdog.scanNow();
    const progressOnly = watchdog.getStatus().find((entry) => entry.runId === 'run-watchdog-bun-progress');
    expect(progressOnly?.status).toBe('healthy');
    expect(progressOnly?.recommendation).toBe('continue');
    expect(watchdog.getRunStatus('run-watchdog-bun-progress')).toBeNull();

    fs.writeFileSync(outputFile, '', 'utf8');
    watchdog.registerRun({
      runId: 'run-watchdog-codex-analytics-warning',
      runtime: 'codex',
      outputFile,
      startedAt: new Date(nowMs).toISOString()
    });
    fs.appendFileSync(
      outputFile,
      'WARN codex_core::analytics_client: events failed with status 403 Forbidden: /backend-api/codex/analytics-events/events\n',
      'utf8'
    );
    await watchdog.scanNow();
    const analyticsOnly = watchdog.getStatus().find((entry) => entry.runId === 'run-watchdog-codex-analytics-warning');
    expect(analyticsOnly?.status).toBe('healthy');
    expect(analyticsOnly?.recommendation).toBe('continue');
    expect(watchdog.getRunStatus('run-watchdog-codex-analytics-warning')).toBeNull();

    nowMs += 5_000;
    fs.writeFileSync(outputFile, '', 'utf8');
    watchdog.registerRun({
      runId: 'run-watchdog-2',
      runtime: 'claude',
      outputFile,
      startedAt: new Date(nowMs).toISOString()
    });
    nowMs += 4_000;
    await watchdog.scanNow();
    const stale = watchdog.getRunStatus('run-watchdog-2');
    expect(stale?.status).toBe('stalled_no_output');
    expect(stale?.recommendation).toBe('abort_and_retry');
  });
});
