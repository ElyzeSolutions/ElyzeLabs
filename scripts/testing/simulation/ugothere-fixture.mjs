#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

function normalizeRepoLocator(raw) {
  const value = String(raw ?? '').trim();
  if (!value) {
    return '';
  }
  const normalized = value.replace(/\\/g, '/').replace(/\.git$/i, '');
  const githubMatch = normalized.match(/github\.com[:/]+([^/]+)\/([^/]+)$/i);
  if (githubMatch) {
    return `${githubMatch[1].toLowerCase()}/${githubMatch[2].toLowerCase()}`;
  }
  const ownerRepoMatch = normalized.match(/^([^/]+)\/([^/]+)$/);
  if (ownerRepoMatch) {
    return `${ownerRepoMatch[1].toLowerCase()}/${ownerRepoMatch[2].toLowerCase()}`;
  }
  return normalized.toLowerCase();
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function readGitOriginUrl(repoDir) {
  const result = run('git', ['config', '--get', 'remote.origin.url'], repoDir);
  if (result.status !== 0) {
    return null;
  }
  const value = String(result.stdout ?? '').trim();
  return value.length > 0 ? value : null;
}

function readGitStatusPorcelain(repoDir) {
  const result = run('git', ['status', '--porcelain'], repoDir);
  if (result.status !== 0) {
    return [];
  }
  return String(result.stdout ?? '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function archiveWorkspace(repoDir, reason) {
  if (!fs.existsSync(repoDir)) {
    return null;
  }
  const parentDir = path.dirname(repoDir);
  const baseName = path.basename(repoDir);
  const suffix = reason ? `${timestampSlug()}-${reason}` : timestampSlug();
  let archivedPath = path.join(parentDir, `${baseName}.reset-${suffix}`);
  let collisionIndex = 1;
  while (fs.existsSync(archivedPath)) {
    archivedPath = path.join(parentDir, `${baseName}.reset-${suffix}-${collisionIndex}`);
    collisionIndex += 1;
  }
  fs.renameSync(repoDir, archivedPath);
  return archivedPath;
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function writeJson(targetPath, value) {
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

function seedOfflineRepo(repoDir) {
  ensureDir(repoDir);
  ensureDir(path.join(repoDir, 'src'));
  ensureDir(path.join(repoDir, 'pages'));
  fs.writeFileSync(
    path.join(repoDir, 'README.md'),
    [
      '# ugothere.ai (offline simulation seed)',
      '',
      'This deterministic offline fixture provides a minimal baseline for intake-driven planning simulations.'
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(repoDir, 'src', 'landing.tsx'),
    [
      'export function LandingPage() {',
      '  return <main>Legacy landing placeholder</main>;',
      '}'
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(repoDir, 'pages', 'feature.tsx'),
    [
      'export function FeaturePage() {',
      '  return <main>Feature scaffold</main>;',
      '}'
    ].join('\n')
  );
  if (!fs.existsSync(path.join(repoDir, '.git'))) {
    run('git', ['init'], repoDir);
    run('git', ['config', 'user.email', 'simulation@local'], repoDir);
    run('git', ['config', 'user.name', 'Simulation Fixture'], repoDir);
    run('git', ['add', '.'], repoDir);
    run('git', ['commit', '-m', 'seed offline ugothere fixture'], repoDir);
  }
}

function ensureLatestPointer(baseDir, runDir) {
  const latestPath = path.join(baseDir, 'latest');
  try {
    fs.rmSync(latestPath, { recursive: true, force: true });
  } catch {
    // noop
  }
  try {
    fs.symlinkSync(path.basename(runDir), latestPath);
  } catch {
    fs.cpSync(runDir, latestPath, { recursive: true });
  }
}

export function prepareUgothereFixture(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const workspaceRoot = path.resolve(cwd, options.workspace ?? '.ops/simulation-workspaces');
  const repoUrl = String(options.repoUrl ?? 'https://github.com/ElyzeSolutions/ugothere.ai');
  const offlineSeed = options.offlineSeed === true || String(options.offlineSeed ?? '').toLowerCase() === 'true';
  const freshWorkspace = options.freshWorkspace === true || String(options.freshWorkspace ?? '').toLowerCase() === 'true';
  const intakePrompt = String(options.intakePrompt ?? '').trim();
  const repoDir = path.join(workspaceRoot, 'ugothere.ai');

  ensureDir(workspaceRoot);

  let mode = offlineSeed ? 'offline_seed' : 'clone';
  let cloneError = null;
  let archivedWorkspacePath = null;
  let workspaceDirtyPaths = [];
  if (!offlineSeed) {
    let shouldCloneFresh = freshWorkspace;
    if (fs.existsSync(repoDir)) {
      if (!fs.existsSync(path.join(repoDir, '.git'))) {
        archivedWorkspacePath = archiveWorkspace(repoDir, 'non-git-workspace');
        shouldCloneFresh = true;
      } else if (freshWorkspace) {
        archivedWorkspacePath = archiveWorkspace(repoDir, 'fresh-workspace');
        shouldCloneFresh = true;
      } else {
        const expectedOrigin = normalizeRepoLocator(repoUrl);
        const currentOrigin = normalizeRepoLocator(readGitOriginUrl(repoDir));
        if (expectedOrigin && currentOrigin && expectedOrigin !== currentOrigin) {
          archivedWorkspacePath = archiveWorkspace(repoDir, 'remote-mismatch');
          shouldCloneFresh = true;
        } else {
          const fetch = run('git', ['fetch', '--all', '--prune'], repoDir);
          const reset = run('git', ['reset', '--hard', 'origin/main'], repoDir);
          const clean = run('git', ['clean', '-fdx'], repoDir);
          if (fetch.status !== 0 || reset.status !== 0 || clean.status !== 0) {
            archivedWorkspacePath = archiveWorkspace(repoDir, 'reset-failed');
            shouldCloneFresh = true;
            cloneError = (fetch.stderr || reset.stderr || clean.stderr || 'git_reset_failed').trim();
          } else {
            mode = 'reset_existing';
          }
        }
      }
    }
    if (shouldCloneFresh) {
      const clone = run('git', ['clone', '--depth', '1', repoUrl, repoDir], workspaceRoot);
      if (clone.status !== 0) {
        cloneError = (clone.stderr || clone.stdout || cloneError || 'git_clone_failed').trim();
      } else {
        mode = 'fresh_clone';
      }
    }
  }

  if (offlineSeed) {
    seedOfflineRepo(repoDir);
  }

  if (!offlineSeed && !cloneError && fs.existsSync(path.join(repoDir, '.git'))) {
    workspaceDirtyPaths = readGitStatusPorcelain(repoDir);
    if (workspaceDirtyPaths.length > 0) {
      const fetch = run('git', ['fetch', '--all', '--prune'], repoDir);
      const reset = run('git', ['reset', '--hard', 'origin/main'], repoDir);
      const clean = run('git', ['clean', '-fdx'], repoDir);
      workspaceDirtyPaths = readGitStatusPorcelain(repoDir);
      if (fetch.status !== 0 || reset.status !== 0 || clean.status !== 0 || workspaceDirtyPaths.length > 0) {
        const archivedDirtyWorkspace = archiveWorkspace(repoDir, 'dirty-after-prepare');
        if (archivedDirtyWorkspace) {
          archivedWorkspacePath = archivedDirtyWorkspace;
        }
        const reclone = run('git', ['clone', '--depth', '1', repoUrl, repoDir], workspaceRoot);
        if (reclone.status !== 0) {
          cloneError = (reclone.stderr || reclone.stdout || cloneError || 'git_reclone_failed').trim();
        } else {
          mode = 'fresh_clone';
          workspaceDirtyPaths = readGitStatusPorcelain(repoDir);
          if (workspaceDirtyPaths.length > 0) {
            cloneError = `workspace_not_clean_after_reclone:${workspaceDirtyPaths.join(', ')}`;
          }
        }
      } else {
        mode = 'reset_existing';
      }
    }
  }

  if (cloneError && !offlineSeed) {
    mode = 'offline_seed';
    seedOfflineRepo(repoDir);
    workspaceDirtyPaths = [];
  }

  const artifactsRoot = path.join(cwd, '.ops', 'simulations', 'ugothere');
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(artifactsRoot, runId);
  ensureDir(runDir);

  const artifactPaths = {
    backlogSnapshots: path.join(runDir, 'backlog-snapshots.json'),
    dispatchLog: path.join(runDir, 'dispatch-log.json'),
    telegramTrace: path.join(runDir, 'telegram-trace.json'),
    runtimeStatus: path.join(runDir, 'runtime-status.json'),
    intakePlan: path.join(runDir, 'intake-plan.md'),
    intakePrd: path.join(runDir, 'intake-prd.md'),
    intakeSync: path.join(runDir, 'intake-sync.json'),
    subagentActivity: path.join(runDir, 'subagent-activity.json'),
    deliverySnapshot: path.join(runDir, 'delivery-snapshot.json'),
    completionSummary: path.join(runDir, 'execution-summary.json'),
    retroReport: path.join(runDir, 'retro-report.json')
  };

  const scenario = {
    schema: 'ops.ugothere.simulation.v1',
    generatedAt: new Date().toISOString(),
    repo: {
      url: repoUrl,
      workspacePath: repoDir,
      mode,
      cloneError,
      archivedWorkspacePath,
      workspaceDirtyPaths
    },
    intake: {
      objective: 'Intake-driven repository delivery simulation from operator prompt',
      prompt: intakePrompt,
      expectedDependencies: []
    },
    artifacts: artifactPaths
  };

  writeJson(path.join(runDir, 'scenario.json'), scenario);
  ensureLatestPointer(artifactsRoot, runDir);

  return {
    ok: true,
    runId,
    runDir,
    scenario
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  const result = prepareUgothereFixture({
    cwd: args.cwd,
    workspace: args.workspace,
    repoUrl: args['repo-url'],
    offlineSeed: args['offline-seed'] === true || args.offline === true,
    freshWorkspace: args['fresh-workspace'] === true
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
