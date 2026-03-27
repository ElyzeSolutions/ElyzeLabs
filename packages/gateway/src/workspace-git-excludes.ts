import fsSync from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_EXCLUDE_ENTRIES = [
  '.ops-runtime/',
  '.agents/',
  '.routing/',
  '.ops/memory-daily/',
  'MEMORY.md'
] as const;

export interface WorkspaceGitExcludeResult {
  repoRoot: string | null;
  excludePath: string | null;
  updated: boolean;
  addedEntries: string[];
}

export function resolveWorkspaceGitRepoRoot(candidatePath: string | null | undefined): string | null {
  if (typeof candidatePath !== 'string' || candidatePath.trim().length === 0) {
    return null;
  }
  const resolvedPath = path.resolve(candidatePath.trim());
  if (!path.isAbsolute(resolvedPath) || !fsSync.existsSync(resolvedPath)) {
    return null;
  }
  const result = spawnSync('git', ['-C', resolvedPath, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    return null;
  }
  const stdout = String(result.stdout ?? '').trim();
  if (stdout.length === 0) {
    return null;
  }
  const resolvedRoot = path.resolve(stdout);
  try {
    return typeof fsSync.realpathSync.native === 'function'
      ? fsSync.realpathSync.native(resolvedRoot)
      : fsSync.realpathSync(resolvedRoot);
  } catch {
    return resolvedRoot;
  }
}

export function workspacePathsShareGitRepo(
  leftPath: string | null | undefined,
  rightPath: string | null | undefined
): boolean {
  const leftRepoRoot = resolveWorkspaceGitRepoRoot(leftPath);
  const rightRepoRoot = resolveWorkspaceGitRepoRoot(rightPath);
  return leftRepoRoot !== null && rightRepoRoot !== null && leftRepoRoot === rightRepoRoot;
}

export function ensureWorkspaceArtifactExcludes(workspacePath: string | null | undefined): WorkspaceGitExcludeResult {
  if (typeof workspacePath !== 'string' || workspacePath.trim().length === 0) {
    return {
      repoRoot: null,
      excludePath: null,
      updated: false,
      addedEntries: []
    };
  }

  const resolvedWorkspacePath = path.resolve(workspacePath.trim());
  const repoRoot = resolveWorkspaceGitRepoRoot(resolvedWorkspacePath);
  if (!repoRoot) {
    return {
      repoRoot: null,
      excludePath: null,
      updated: false,
      addedEntries: []
    };
  }

  const excludePath = path.join(repoRoot, '.git', 'info', 'exclude');
  fsSync.mkdirSync(path.dirname(excludePath), { recursive: true });
  const existingContent = fsSync.existsSync(excludePath) ? fsSync.readFileSync(excludePath, 'utf8') : '';
  const existingEntries = new Set(
    existingContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
  );

  const addedEntries = DEFAULT_EXCLUDE_ENTRIES.filter((entry) => !existingEntries.has(entry));
  if (addedEntries.length === 0) {
    return {
      repoRoot,
      excludePath,
      updated: false,
      addedEntries: []
    };
  }

  const lines = existingContent.length > 0 ? existingContent.replace(/\s*$/, '').split(/\r?\n/) : [];
  if (lines.length > 0 && lines[lines.length - 1]?.trim() !== '') {
    lines.push('');
  }
  lines.push('# Local control-plane artifact excludes');
  lines.push(...addedEntries);
  fsSync.writeFileSync(excludePath, `${lines.join('\n')}\n`, 'utf8');

  return {
    repoRoot,
    excludePath,
    updated: true,
    addedEntries
  };
}
