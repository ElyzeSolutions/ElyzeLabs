import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });

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

describe('github repo policy resolution integration', () => {
  let harness: GatewayTestHarness;

  beforeAll(async () => {
    process.env.OPS_GITHUB_PAT = 'ghp_policy_integration';
    process.env.OPS_GITHUB_PAT_FALLBACK_ALLOW = '1';
    harness = await createGatewayTestHarness('github-policy-resolution');
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await harness.close();
    delete process.env.OPS_GITHUB_PAT;
    delete process.env.OPS_GITHUB_PAT_FALLBACK_ALLOW;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const createRepoConnection = async (payload: Record<string, unknown>) => {
    const response = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'elyzesolutions',
        authSecretRef: 'env:OPS_GITHUB_PAT',
        authMode: 'pat_fallback',
        metadata: {
          patFallbackAllowed: true
        },
        enabled: true,
        defaultBranch: 'main',
        ...payload
      }
    });
    expect(response.statusCode).toBe(201);
    return (response.json() as { repo: { id: string } }).repo.id;
  };

  const createItemAndBindDelivery = async (repoConnectionId: string, title: string) => {
    const item = await harness.inject({
      method: 'POST',
      url: '/api/backlog/items',
      payload: {
        title,
        description: `${title} description`,
        state: 'planned',
        priority: 80,
        actor: 'test'
      }
    });
    expect(item.statusCode).toBe(201);
    const itemId = (item.json() as { item: { id: string } }).item.id;
    const bind = await harness.inject({
      method: 'PUT',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`,
      payload: {
        repoConnectionId,
        status: 'planned'
      }
    });
    expect(bind.statusCode).toBe(200);
    return itemId;
  };

  it('uses repo-sourced policy for branch naming, draft PR creation, reviewer requests, and metadata attribution', async () => {
    const { repoRoot, remoteRoot } = createPublishRepo('policy-repo');
    fs.mkdirSync(path.join(repoRoot, '.ops'), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, '.ops', 'github-policy.json'),
      JSON.stringify(
        {
          version: 'repo.v1',
          branchNaming: 'policy/{itemSlug}',
          reviewers: ['qa-reviewer', 'release-manager'],
          requiredChecks: ['repo-ci'],
          pullRequest: {
            draft: true,
            autoOpen: true,
            titleTemplate: 'Policy PR: {title}',
            bodyTemplate: 'Policy item {itemId}\n\nFiles:\n{changedFiles}'
          }
        },
        null,
        2
      )
    );
    fs.writeFileSync(path.join(repoRoot, 'src', 'app.ts'), 'export const value = 2;\n');
    runGit(repoRoot, [
      'config',
      `url.${pathToFileURL(remoteRoot).toString()}.insteadOf`,
      'https://x-access-token:ghp_policy_integration@github.com/elyzesolutions/ops-policy-repo.git'
    ]);

    const repoConnectionId = await createRepoConnection({
      repo: 'ops-policy-repo',
      policyVersion: 'control.v1',
      policySource: 'repo',
      policy: {}
    });
    const itemId = await createItemAndBindDelivery(repoConnectionId, 'Policy publish target');

    const originalFetch = globalThis.fetch;
    const prCreateBodies: Array<Record<string, unknown>> = [];
    const reviewerBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url === 'https://api.github.com/repos/elyzesolutions/ops-policy-repo/pulls') {
          prCreateBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
          return jsonResponse({
            number: 51,
            html_url: 'https://github.com/elyzesolutions/ops-policy-repo/pull/51'
          }, 201);
        }
        if (url === 'https://api.github.com/repos/elyzesolutions/ops-policy-repo/pulls/51/requested_reviewers') {
          reviewerBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
          return jsonResponse({
            requested_reviewers: [
              { login: 'qa-reviewer' },
              { login: 'release-manager' }
            ]
          }, 201);
        }
        return originalFetch(input, init);
      })
    );

    const publish = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery/publish`,
      payload: {
        actor: 'test',
        workspacePath: repoRoot
      }
    });
    expect(publish.statusCode).toBe(200);
    const body = publish.json() as {
      publish: {
        branchName: string;
        draft: boolean;
        policy: {
          source: string;
          version: string;
        };
      };
      delivery: {
        githubState: string | null;
        metadata: {
          githubPolicy?: {
            source?: string;
            version?: string;
          };
        };
      };
    };

    expect(body.publish.branchName).toBe('policy/policy-publish-target');
    expect(body.publish.draft).toBe(true);
    expect(body.publish.policy).toMatchObject({
      source: 'repo',
      version: 'repo.v1'
    });
    expect(body.delivery.githubState).toBe('draft_pr');
    expect(body.delivery.metadata.githubPolicy).toMatchObject({
      source: 'repo',
      version: 'repo.v1'
    });
    expect(prCreateBodies[0]).toMatchObject({
      title: 'Policy PR: Policy publish target',
      draft: true,
      head: 'policy/policy-publish-target'
    });
    expect(String(prCreateBodies[0]?.body ?? '')).toContain('Policy item');
    expect(reviewerBodies[0]).toEqual({
      reviewers: ['qa-reviewer', 'release-manager']
    });
  });

  it('blocks hybrid publish when the repo policy hash drifts from the pinned hash', async () => {
    const { repoRoot, remoteRoot } = createPublishRepo('policy-hybrid');
    fs.mkdirSync(path.join(repoRoot, '.ops'), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, '.ops', 'github-policy.json'),
      JSON.stringify(
        {
          version: 'repo.v2',
          branchNaming: 'hybrid/{itemSlug}',
          pullRequest: {
            draft: false,
            autoOpen: true
          }
        },
        null,
        2
      )
    );
    fs.writeFileSync(path.join(repoRoot, 'src', 'app.ts'), 'export const value = 7;\n');
    runGit(repoRoot, [
      'config',
      `url.${pathToFileURL(remoteRoot).toString()}.insteadOf`,
      'https://x-access-token:ghp_policy_integration@github.com/elyzesolutions/ops-policy-hybrid.git'
    ]);

    const repoConnectionId = await createRepoConnection({
      repo: 'ops-policy-hybrid',
      policyVersion: 'control.v2',
      policyHash: 'sha256:expected-but-wrong',
      policySource: 'hybrid',
      policy: {
        branchNaming: 'control/{itemId}'
      }
    });
    const itemId = await createItemAndBindDelivery(repoConnectionId, 'Hybrid policy drift');

    const publish = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery/publish`,
      payload: {
        actor: 'test',
        workspacePath: repoRoot
      }
    });
    expect(publish.statusCode).toBe(409);
    const body = publish.json() as {
      details?: {
        reason?: string;
        diagnostics?: string[];
      };
    };
    expect(body.details?.reason).toBe('policy_blocked');
    expect((body.details?.diagnostics ?? []).some((entry) => entry.startsWith('policy_hash_mismatch:'))).toBe(true);

    const repos = await harness.inject({
      method: 'GET',
      url: '/api/github/repos?includeDisabled=true',
      headers: {
        'x-ops-role': 'admin'
      }
    });
    expect(repos.statusCode).toBe(200);
    const reposBody = repos.json() as {
      repos: Array<{
        id: string;
        metadata?: {
          policyResolution?: {
            status?: string;
            diagnostics?: string[];
          };
        };
      }>;
    };
    const repo = reposBody.repos.find((entry) => entry.id === repoConnectionId);
    expect(repo?.metadata?.policyResolution?.status).toBe('blocked');
    expect((repo?.metadata?.policyResolution?.diagnostics ?? []).some((entry) => entry.startsWith('policy_hash_mismatch:'))).toBe(true);
  });

  it('applies control-plane issue-sync mapping and branch-only publish when policy disables auto-open PRs', async () => {
    const { repoRoot, remoteRoot } = createPublishRepo('policy-control');
    fs.writeFileSync(path.join(repoRoot, 'src', 'app.ts'), 'export const value = 11;\n');
    runGit(repoRoot, [
      'config',
      `url.${pathToFileURL(remoteRoot).toString()}.insteadOf`,
      'https://x-access-token:ghp_policy_integration@github.com/elyzesolutions/ops-policy-control.git'
    ]);

    const repoConnectionId = await createRepoConnection({
      repo: 'ops-policy-control',
      policyVersion: 'control.v3',
      policySource: 'control_plane',
      policy: {
        branchNaming: 'control/{itemSlug}',
        pullRequest: {
          autoOpen: false
        },
        issueSync: {
          stateLabelMap: {
            planned: ['repo:todo']
          }
        }
      }
    });

    const publishItemId = await createItemAndBindDelivery(repoConnectionId, 'Branch only delivery');
    const publish = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(publishItemId)}/delivery/publish`,
      payload: {
        actor: 'test',
        workspacePath: repoRoot
      }
    });
    expect(publish.statusCode).toBe(200);
    const publishBody = publish.json() as {
      publish: {
        branchName: string;
        prNumber: number | null;
        autoOpenPullRequest: boolean;
      };
      delivery: {
        status: string;
        githubState: string | null;
      };
    };
    expect(publishBody.publish.branchName).toBe('control/branch-only-delivery');
    expect(publishBody.publish.prNumber).toBeNull();
    expect(publishBody.publish.autoOpenPullRequest).toBe(false);
    expect(publishBody.delivery.status).toBe('in_progress');
    expect(publishBody.delivery.githubState).toBe('branch_prepared');

    const issueItemId = await createItemAndBindDelivery(repoConnectionId, 'Policy issue sync');
    const originalFetch = globalThis.fetch;
    const issueBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url === 'https://api.github.com/repos/elyzesolutions/ops-policy-control/issues') {
          issueBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
          return jsonResponse({
            number: 88,
            html_url: 'https://github.com/elyzesolutions/ops-policy-control/issues/88',
            state: 'open'
          }, 201);
        }
        return originalFetch(input, init);
      })
    );

    const issueSync = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(issueItemId)}/issues/sync`,
      payload: {
        repoConnectionId
      }
    });
    expect(issueSync.statusCode).toBe(200);
    expect(issueBodies[0]?.labels).toEqual(expect.arrayContaining(['repo:todo']));
    expect(issueBodies[0]?.labels).not.toEqual(expect.arrayContaining(['backlog:planned']));
  });
});
