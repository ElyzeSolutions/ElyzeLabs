import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

const runGit = (cwd: string, args: string[]): string => {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr ?? result.stdout ?? '').trim()}`);
  }
  return String(result.stdout ?? '').trim();
};

const createPublishRepo = (label: string): { repoRoot: string; remoteRoot: string } => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-repo-`));
  const remoteRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-remote-`));
  runGit(repoRoot, ['init', '--initial-branch=main']);
  runGit(repoRoot, ['config', 'user.name', 'Integration Bot']);
  runGit(repoRoot, ['config', 'user.email', 'integration@example.com']);
  runGit(remoteRoot, ['init', '--bare']);
  runGit(repoRoot, ['remote', 'add', 'origin', remoteRoot]);
  fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'src', 'app.ts'), 'export const value = 1;\n');
  runGit(repoRoot, ['add', '--', 'src/app.ts']);
  runGit(repoRoot, ['commit', '-m', 'chore: seed repo']);
  runGit(repoRoot, ['push', '--set-upstream', 'origin', 'main']);
  return { repoRoot, remoteRoot };
};

describe('github isolated publish integration', () => {
  let harness: GatewayTestHarness;

  beforeAll(async () => {
    process.env.OPS_GITHUB_PAT = 'ghp_publish_integration';
    process.env.OPS_GITHUB_PAT_FALLBACK_ALLOW = '1';
    harness = await createGatewayTestHarness('github-isolated-publish');
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await harness.close();
    delete process.env.OPS_GITHUB_PAT;
    delete process.env.OPS_GITHUB_PAT_FALLBACK_ALLOW;
  });

  it('publishes from an isolated worktree, reuses the same worktree for resume, and cleans it up on terminal delivery', async () => {
    const { repoRoot, remoteRoot } = createPublishRepo('isolated-publish');
    runGit(repoRoot, [
      'config',
      `url.${pathToFileURL(remoteRoot).toString()}.insteadOf`,
      'https://x-access-token:ghp_publish_integration@github.com/elyzesolutions/ops-isolated-publish.git'
    ]);
    fs.writeFileSync(path.join(repoRoot, 'src', 'app.ts'), 'export const value = 2;\n');

    const repo = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'elyzesolutions',
        repo: 'ops-isolated-publish',
        authSecretRef: 'env:OPS_GITHUB_PAT',
        authMode: 'pat_fallback',
        metadata: {
          patFallbackAllowed: true
        },
        enabled: true,
        defaultBranch: 'main'
      }
    });
    expect(repo.statusCode).toBe(201);
    const repoBody = repo.json() as { repo: { id: string } };

    const item = await harness.inject({
      method: 'POST',
      url: '/api/backlog/items',
      payload: {
        title: 'Isolated publish target',
        description: 'Ensure publish uses a dedicated worktree.',
        state: 'planned',
        priority: 90,
        actor: 'test'
      }
    });
    expect(item.statusCode).toBe(201);
    const itemId = (item.json() as { item: { id: string } }).item.id;

    const bind = await harness.inject({
      method: 'PUT',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`,
      payload: {
        repoConnectionId: repoBody.repo.id,
        status: 'planned'
      }
    });
    expect(bind.statusCode).toBe(200);

    const originalFetch = globalThis.fetch;
    let prCreateAttempts = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://api.github.com/repos/elyzesolutions/ops-isolated-publish/pulls') {
        prCreateAttempts += 1;
        if (prCreateAttempts === 1) {
          return new Response(
            JSON.stringify({
              number: 101,
              html_url: 'https://github.com/elyzesolutions/ops-isolated-publish/pull/101'
            }),
            { status: 201, headers: { 'content-type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ message: 'A pull request already exists for branch' }), {
          status: 422,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.startsWith('https://api.github.com/repos/elyzesolutions/ops-isolated-publish/pulls?')) {
        return new Response(
          JSON.stringify([
            {
              number: 101,
              html_url: 'https://github.com/elyzesolutions/ops-isolated-publish/pull/101'
            }
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const firstPublish = await harness.inject({
        method: 'POST',
        url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery/publish`,
        payload: {
          actor: 'test',
          workspacePath: repoRoot
        }
      });
      expect(firstPublish.statusCode).toBe(200);
      const firstPublishBody = firstPublish.json() as {
        publish: {
          branchName: string;
          commitSha: string;
        };
        delivery: {
          workspacePath: string | null;
          githubState: string | null;
          githubLease: {
            repo?: { status?: string };
            delivery?: { status?: string };
            branch?: { status?: string };
          };
          githubWorktree: {
            status?: string;
          };
        };
      };
      expect(firstPublishBody.delivery.workspacePath).not.toBe(repoRoot);
      expect(firstPublishBody.delivery.workspacePath).toContain('.ops-github-worktrees');
      expect(firstPublishBody.delivery.githubState).toBe('open_pr');
      expect(firstPublishBody.delivery.githubLease.repo?.status).toBe('released');
      expect(firstPublishBody.delivery.githubLease.delivery?.status).toBe('active');
      expect(firstPublishBody.delivery.githubLease.branch?.status).toBe('active');
      expect(firstPublishBody.delivery.githubWorktree.status).toBe('ready');
      expect(runGit(repoRoot, ['branch', '--show-current'])).toBe('main');
      expect(runGit(repoRoot, ['status', '--porcelain'])).toContain('M src/app.ts');

      const firstRemoteCommit = runGit(remoteRoot, ['rev-parse', `refs/heads/${firstPublishBody.publish.branchName}`]);
      expect(firstRemoteCommit).toBe(firstPublishBody.publish.commitSha);

      fs.writeFileSync(path.join(repoRoot, 'src', 'app.ts'), 'export const value = 3;\n');

      const resumedPublish = await harness.inject({
        method: 'POST',
        url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery/publish`,
        payload: {
          actor: 'test',
          workspacePath: repoRoot
        }
      });
      expect(resumedPublish.statusCode).toBe(200);
      const resumedBody = resumedPublish.json() as {
        publish: {
          branchName: string;
          commitSha: string;
          prNumber: number | null;
        };
        delivery: {
          workspacePath: string | null;
          githubLease: {
            delivery?: { status?: string };
          };
          githubWorktree: {
            status?: string;
          };
        };
      };
      expect(resumedBody.delivery.workspacePath).toBe(firstPublishBody.delivery.workspacePath);
      expect(resumedBody.publish.branchName).toBe(firstPublishBody.publish.branchName);
      expect(resumedBody.publish.prNumber).toBe(101);
      expect(resumedBody.delivery.githubLease.delivery?.status).toBe('active');
      expect(resumedBody.delivery.githubWorktree.status).toBe('ready');
      expect(runGit(remoteRoot, ['rev-parse', `refs/heads/${resumedBody.publish.branchName}`])).toBe(resumedBody.publish.commitSha);

      const merged = await harness.inject({
        method: 'PUT',
        url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`,
        payload: {
          status: 'merged',
          githubState: 'merged'
        }
      });
      expect(merged.statusCode).toBe(200);
      const mergedBody = merged.json() as {
        delivery: {
          workspacePath: string | null;
          githubLease: {
            delivery?: { status?: string };
            branch?: { status?: string };
          };
          githubWorktree: {
            status?: string;
          };
        };
      };
      expect(mergedBody.delivery.githubLease.delivery?.status).toBe('released');
      expect(mergedBody.delivery.githubLease.branch?.status).toBe('released');
      expect(mergedBody.delivery.githubWorktree.status).toBe('cleaned');
      expect(fs.existsSync(String(mergedBody.delivery.workspacePath ?? ''))).toBe(false);
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('rejects publish when another delivery still owns the repo lease', async () => {
    const { repoRoot } = createPublishRepo('lease-conflict');
    fs.writeFileSync(path.join(repoRoot, 'src', 'app.ts'), 'export const value = 9;\n');

    const repo = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'elyzesolutions',
        repo: 'ops-lease-conflict',
        authSecretRef: 'env:OPS_GITHUB_PAT',
        authMode: 'pat_fallback',
        metadata: {
          patFallbackAllowed: true
        },
        enabled: true,
        defaultBranch: 'main'
      }
    });
    expect(repo.statusCode).toBe(201);
    const repoBody = repo.json() as { repo: { id: string } };

    const createItem = async (title: string) => {
      const response = await harness.inject({
        method: 'POST',
        url: '/api/backlog/items',
        payload: {
          title,
          description: `${title} description`,
          state: 'planned',
          priority: 60,
          actor: 'test'
        }
      });
      expect(response.statusCode).toBe(201);
      return (response.json() as { item: { id: string } }).item.id;
    };

    const itemA = await createItem('Lease owner');
    const itemB = await createItem('Lease blocked');

    for (const itemId of [itemA, itemB]) {
      const bind = await harness.inject({
        method: 'PUT',
        url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`,
        payload: {
          repoConnectionId: repoBody.repo.id,
          status: 'planned'
        }
      });
      expect(bind.statusCode).toBe(200);
    }

    const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const activeLease = {
      schema: 'ops.github-delivery-lease.v1',
      version: 1,
      repo: {
        leaseId: 'repo-lease-a',
        scopeKey: repoBody.repo.id,
        status: 'active',
        ownerActor: 'publisher-a',
        ownerSessionId: 'session-a',
        ownerRunId: 'run-a',
        acquiredAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        expiresAt: leaseExpiresAt,
        releasedAt: null,
        releaseReason: null
      },
      delivery: {
        leaseId: 'delivery-lease-a',
        scopeKey: itemA,
        status: 'active',
        ownerActor: 'publisher-a',
        ownerSessionId: 'session-a',
        ownerRunId: 'run-a',
        acquiredAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        expiresAt: leaseExpiresAt,
        releasedAt: null,
        releaseReason: null
      },
      branch: {
        leaseId: 'branch-lease-a',
        scopeKey: 'delivery/lease-owner',
        status: 'active',
        ownerActor: 'publisher-a',
        ownerSessionId: 'session-a',
        ownerRunId: 'run-a',
        acquiredAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        expiresAt: leaseExpiresAt,
        releasedAt: null,
        releaseReason: null
      },
      pullRequest: null,
      takeover: {
        policy: 'stale_only',
        staleAfterMs: 900000,
        operatorOverrideRequired: true
      }
    };

    const ownerDelivery = await harness.inject({
      method: 'PUT',
      url: `/api/backlog/items/${encodeURIComponent(itemA)}/delivery`,
      payload: {
        githubLease: activeLease,
        githubState: 'branch_prepared'
      }
    });
    expect(ownerDelivery.statusCode).toBe(200);

    const blockedPublish = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(itemB)}/delivery/publish`,
      payload: {
        actor: 'test',
        workspacePath: repoRoot
      }
    });
    expect(blockedPublish.statusCode).toBe(409);
    const blockedBody = blockedPublish.json() as {
      details?: {
        reason?: string;
        conflictItemId?: string;
      };
    };
    expect(blockedBody.details?.reason).toBe('lease_conflict');
    expect(blockedBody.details?.conflictItemId).toBe(itemA);
  });
});
