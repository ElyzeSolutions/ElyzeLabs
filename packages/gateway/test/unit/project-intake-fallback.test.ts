import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { buildDeterministicProjectIntakeArtifacts } from '../../src/project-intake-fallback.js';

function initRepo(root: string): void {
  const run = (args: string[]): void => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
    }
  };

  run(['init']);
  run(['config', 'user.name', 'Codex Test']);
  run(['config', 'user.email', 'codex@example.com']);
  fs.writeFileSync(path.join(root, 'README.md'), '# ugothere.ai\n\nbun install\n', 'utf8');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"ugothere.ai","private":true}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'bun.lock'), '', 'utf8');
  fs.mkdirSync(path.join(root, 'frontend', 'src', 'routes'), { recursive: true });
  fs.writeFileSync(path.join(root, 'frontend', 'src', 'routes', '__root.tsx'), 'export {};\n', 'utf8');
  run(['add', '.']);
  run(['commit', '-m', 'initial']);
}

describe('project intake deterministic fallback', () => {
  it('builds syncable intake artifacts grounded in repo evidence', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-intake-fallback-'));
    initRepo(repoRoot);

    const artifacts = buildDeterministicProjectIntakeArtifacts({
      prompt: 'Clone ugothere.ai and add a contact page',
      projectId: 'ugothere-ai',
      repoRoot,
      fallbackReason: 'Planning run timed out before writing syncable artifacts.',
      generatedAt: '2026-03-06T07:30:00.000Z'
    });

    expect(artifacts.metadata.projectLabel).toContain('ops intake fallback');
    expect(artifacts.metadata.repoExists).toBe(true);
    expect(artifacts.metadata.packageManager).toBe('bun');
    expect(artifacts.metadata.frontendSurface).toBe('frontend/src/routes');
    expect(artifacts.prd).toContain('## Overview');
    expect(artifacts.prd).toContain('Clone ugothere.ai and add a contact page');
    expect(artifacts.plan).toContain('## Task List');

    const jsonMatch = artifacts.plan.match(/```json\s*([\s\S]*?)```/i);
    expect(jsonMatch?.[1]).toBeTruthy();
    const tasks = JSON.parse(String(jsonMatch?.[1])) as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(5);
    expect(tasks[0]?.id).toBe('T-001');
    expect(tasks[0]?.passes).toBe(true);
    expect(tasks[1]?.description).toContain('Clone ugothere.ai and add a contact page');
    expect(tasks[1]?.steps).toContain(
      'Use the repo-native package manager flow (bun install) instead of mixing toolchains.'
    );
    expect(tasks[2]?.steps).toContain(
      'Use honest fallback copy and avoid fake destinations, dead submit buttons, or placeholder contact details.'
    );
    expect(tasks[2]?.criteria).toContain(
      'Negative: avoid inaccessible routes, broken links, or hidden pages that only exist in source code.'
    );
    expect(tasks[3]?.steps).toContain(
      'Prefer the documented repo-native verification command (bun run build or narrower equivalents).'
    );
    expect(tasks[4]?.steps).toContain('Review git status and changed files before publishing or marking the backlog item done.');
    expect(tasks[4]?.criteria).toContain(
      'Example: delivery evidence references real product-file diffs and a clean publishable repository state.'
    );
  });
});
