import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
  ensureWorkspaceArtifactExcludes,
  resolveWorkspaceGitRepoRoot,
  workspacePathsShareGitRepo
} from '../../src/workspace-git-excludes.js';

function initRepo(root: string): void {
  const result = spawnSync('git', ['-C', root, 'init'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'git init failed');
  }
}

function canonicalPath(targetPath: string): string {
  return typeof fs.realpathSync.native === 'function' ? fs.realpathSync.native(targetPath) : fs.realpathSync(targetPath);
}

describe('workspace git excludes', () => {
  it('distinguishes the root repo from a nested workspace repo', () => {
    const rootRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-root-repo-'));
    initRepo(rootRepo);
    const nestedWorkspace = path.join(rootRepo, '.ops', 'simulation-workspaces', 'nested-repo');
    fs.mkdirSync(nestedWorkspace, { recursive: true });
    initRepo(nestedWorkspace);
    const nestedFrontend = path.join(nestedWorkspace, 'frontend');
    fs.mkdirSync(nestedFrontend, { recursive: true });

    expect(resolveWorkspaceGitRepoRoot(rootRepo)).toBe(canonicalPath(rootRepo));
    expect(resolveWorkspaceGitRepoRoot(nestedWorkspace)).toBe(canonicalPath(nestedWorkspace));
    expect(workspacePathsShareGitRepo(rootRepo, nestedWorkspace)).toBe(false);
    expect(workspacePathsShareGitRepo(nestedWorkspace, nestedFrontend)).toBe(true);
  });

  it('adds control-plane artifact excludes exactly once', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-git-excludes-'));
    initRepo(repoRoot);

    const first = ensureWorkspaceArtifactExcludes(repoRoot);
    expect(first.updated).toBe(true);
    expect(first.addedEntries).toEqual([
      '.ops-runtime/',
      '.agents/',
      '.routing/',
      '.ops/memory-daily/',
      'MEMORY.md'
    ]);

    const second = ensureWorkspaceArtifactExcludes(repoRoot);
    expect(second.updated).toBe(false);
    expect(second.addedEntries).toEqual([]);

    const excludePath = path.join(repoRoot, '.git', 'info', 'exclude');
    const content = fs.readFileSync(excludePath, 'utf8');
    expect(content.match(/\.ops-runtime\//g)?.length).toBe(1);
    expect(content.match(/\.agents\//g)?.length).toBe(1);
    expect(content.match(/\.routing\//g)?.length).toBe(1);
    expect(content.match(/\.ops\/memory-daily\//g)?.length).toBe(1);
    expect(content.match(/MEMORY\.md/g)?.length).toBe(1);
  });
});
