import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { prepareUgothereFixture } from '../../scripts/testing/simulation/ugothere-fixture.mjs';

describe('ugothere simulation tooling', () => {
  it('creates reproducible fixture metadata and artifact path contracts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-ugothere-fixture-'));

    const first = prepareUgothereFixture({
      cwd: root,
      offlineSeed: true
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = prepareUgothereFixture({
      cwd: root,
      offlineSeed: true
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.runId).not.toBe(second.runId);
    expect(first.scenario.intake.objective).toBe(second.scenario.intake.objective);
    expect(first.scenario.repo.mode).toBe('offline_seed');
    expect(fs.existsSync(path.join(first.runDir, 'scenario.json'))).toBe(true);
    expect(fs.existsSync(path.join(second.runDir, 'scenario.json'))).toBe(true);

    const latestPath = path.join(root, '.ops', 'simulations', 'ugothere', 'latest');
    expect(fs.existsSync(latestPath)).toBe(true);
    const latestScenarioPath = path.join(latestPath, 'scenario.json');
    expect(fs.existsSync(latestScenarioPath)).toBe(true);

    const latestScenario = JSON.parse(fs.readFileSync(latestScenarioPath, 'utf8')) as {
      schema: string;
      artifacts: Record<string, string>;
    };
    expect(latestScenario.schema).toBe('ops.ugothere.simulation.v1');
    expect(typeof latestScenario.artifacts.backlogSnapshots).toBe('string');
    expect(typeof latestScenario.artifacts.retroReport).toBe('string');
  });

  it('writes fallback execution summary and retro report sections when API access is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-ugothere-sim-run-'));
    const scriptPath = path.resolve(process.cwd(), 'scripts/testing/simulation/run-ugothere-simulation.mjs');
    const operatorPrompt = 'Clone ugothere repo and add x,y feature with dependency-safe handoff.';

    const run = spawnSync('node', [scriptPath, '--cwd', root, '--offline-seed', '--prompt', operatorPrompt], {
      encoding: 'utf8'
    });
    expect(run.status).toBe(0);
    expect(run.stdout.trim().length).toBeGreaterThan(0);

    const payload = JSON.parse(run.stdout) as {
      ok: boolean;
      scenario: {
        artifacts: {
          intakePlan: string;
          completionSummary: string;
          retroReport: string;
        };
      };
      summary: {
        executed: boolean;
        reason?: string;
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.summary.executed).toBe(false);
    expect(payload.summary.reason).toBe('api_base_or_token_missing');
    expect(payload.scenario.artifacts.intakePlan.endsWith('/intake-plan.md')).toBe(true);

    const intakePlanPath = payload.scenario.artifacts.intakePlan;
    const completionSummaryPath = payload.scenario.artifacts.completionSummary;
    const retroReportPath = payload.scenario.artifacts.retroReport;
    expect(fs.existsSync(intakePlanPath)).toBe(true);
    expect(fs.existsSync(completionSummaryPath)).toBe(true);
    expect(fs.existsSync(retroReportPath)).toBe(true);
    const intakePlanText = fs.readFileSync(intakePlanPath, 'utf8');
    expect(intakePlanText).toContain(`Operator request: ${operatorPrompt}`);
    expect(intakePlanText).not.toContain('landing-page overhaul and a new Support page');

    const retro = JSON.parse(fs.readFileSync(retroReportPath, 'utf8')) as {
      worked: unknown[];
      did_not_work: unknown[];
      improvements: unknown[];
      priority_fixes: unknown[];
    };
    expect(Array.isArray(retro.worked)).toBe(true);
    expect(Array.isArray(retro.did_not_work)).toBe(true);
    expect(Array.isArray(retro.improvements)).toBe(true);
    expect(Array.isArray(retro.priority_fixes)).toBe(true);
    expect(retro.did_not_work.length).toBeGreaterThan(0);
    expect(retro.priority_fixes.length).toBeGreaterThan(0);
  });

  it('fails fast when no operator prompt is supplied', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-ugothere-sim-no-prompt-'));
    const scriptPath = path.resolve(process.cwd(), 'scripts/testing/simulation/run-ugothere-simulation.mjs');

    const run = spawnSync('node', [scriptPath, '--cwd', root, '--offline-seed'], {
      encoding: 'utf8'
    });
    expect(run.status).toBe(0);
    const payload = JSON.parse(run.stdout) as {
      summary: {
        executed: boolean;
        reason?: string;
      };
    };
    expect(payload.summary.executed).toBe(false);
    expect(payload.summary.reason).toBe('origin_prompt_missing');
  });

});
