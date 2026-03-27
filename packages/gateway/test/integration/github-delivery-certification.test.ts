import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

const webhookSecret = 'webhook-secret-certification';

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

const signPayload = (payload: Record<string, unknown>): string =>
  `sha256=${createHmac('sha256', webhookSecret).update(JSON.stringify(payload)).digest('hex')}`;

describe('github delivery certification integration', () => {
  let harness: GatewayTestHarness;

  beforeAll(async () => {
    process.env.OPS_GITHUB_PAT = 'ghp_delivery_certification';
    process.env.OPS_GITHUB_PAT_FALLBACK_ALLOW = '1';
    process.env.OPS_GITHUB_WEBHOOK_SECRET = webhookSecret;
    harness = await createGatewayTestHarness('github-delivery-certification');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await harness.close();
    delete process.env.OPS_GITHUB_PAT;
    delete process.env.OPS_GITHUB_PAT_FALLBACK_ALLOW;
    delete process.env.OPS_GITHUB_WEBHOOK_SECRET;
  });

  const createRepoConnection = async (
    payload: Record<string, unknown>
  ): Promise<{ id: string; policyVersion: string }> => {
    const policyVersion =
      typeof payload.policyVersion === 'string' && payload.policyVersion.trim().length > 0
        ? payload.policyVersion.trim()
        : 'policy.v1';
    const response = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'acme',
        repo: 'portal-cert',
        authSecretRef: 'env:OPS_GITHUB_PAT',
        authMode: 'pat_fallback',
        webhookSecretRef: 'env:OPS_GITHUB_WEBHOOK_SECRET',
        metadata: {
          patFallbackAllowed: true
        },
        enabled: true,
        defaultBranch: 'main',
        policyVersion,
        policyHash: 'sha256:control-plane-placeholder',
        policySource: 'control_plane',
        policy: {
          requiredChecks: ['ci']
        },
        ...payload
      }
    });
    expect(response.statusCode).toBe(201);
    return {
      id: (response.json() as { repo: { id: string } }).repo.id,
      policyVersion
    };
  };

  const createItemAndBindDelivery = async (input: {
    repoConnectionId: string;
    title: string;
    itemState?: 'idea' | 'triage' | 'planned' | 'in_progress' | 'review' | 'blocked' | 'done' | 'archived';
    branchName?: string;
    commitSha?: string;
    prNumber?: number;
    prUrl?: string;
    status?: string;
    githubState?: string;
  }): Promise<string> => {
    const item = await harness.inject({
      method: 'POST',
      url: '/api/backlog/items',
      payload: {
        title: input.title,
        description: `${input.title} description`,
        state: input.itemState ?? 'planned',
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
        repoConnectionId: input.repoConnectionId,
        branchName: input.branchName,
        commitSha: input.commitSha,
        prNumber: input.prNumber,
        prUrl: input.prUrl,
        status: input.status ?? 'review',
        githubState: input.githubState ?? 'open_pr'
      }
    });
    expect(bind.statusCode).toBe(200);
    return itemId;
  };

  it('certifies reconcile edge states for merge queue, dismissed reviews, forced-push drift, and required-check failures', async () => {
    const repo = await createRepoConnection({
      repo: 'portal-reconcile-cert'
    });
    const mergeQueueItemId = await createItemAndBindDelivery({
      repoConnectionId: repo.id,
      title: 'Merge queue delivery',
      branchName: 'delivery/merge-queue-delivery',
      commitSha: 'sha-merge-queue',
      prNumber: 501,
      prUrl: 'https://github.com/acme/portal-reconcile-cert/pull/501'
    });
    const dismissedReviewItemId = await createItemAndBindDelivery({
      repoConnectionId: repo.id,
      title: 'Dismissed review delivery',
      branchName: 'delivery/dismissed-review-delivery',
      commitSha: 'sha-dismissed',
      prNumber: 502,
      prUrl: 'https://github.com/acme/portal-reconcile-cert/pull/502'
    });
    const driftItemId = await createItemAndBindDelivery({
      repoConnectionId: repo.id,
      title: 'Remote drift delivery',
      branchName: 'delivery/remote-drift-delivery',
      commitSha: 'sha-drift-local',
      prNumber: 503,
      prUrl: 'https://github.com/acme/portal-reconcile-cert/pull/503',
      githubState: 'ready_to_merge'
    });
    const failedChecksItemId = await createItemAndBindDelivery({
      repoConnectionId: repo.id,
      title: 'Failed check delivery',
      branchName: 'delivery/failed-check-delivery',
      commitSha: 'sha-failed-check',
      prNumber: 504,
      prUrl: 'https://github.com/acme/portal-reconcile-cert/pull/504'
    });

    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith('/repos/acme/portal-reconcile-cert/pulls/501')) {
          return jsonResponse({
            number: 501,
            state: 'open',
            draft: false,
            merged: false,
            mergeable: true,
            mergeable_state: 'clean',
            html_url: 'https://github.com/acme/portal-reconcile-cert/pull/501',
            head: {
              sha: 'sha-merge-queue',
              ref: 'delivery/merge-queue-delivery'
            },
            base: {
              sha: 'base-merge-queue',
              ref: 'main'
            },
            auto_merge: {
              enabled_by: {
                login: 'merge-bot'
              }
            }
          });
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/pulls/502')) {
          return jsonResponse({
            number: 502,
            state: 'open',
            draft: false,
            merged: false,
            mergeable: true,
            mergeable_state: 'clean',
            html_url: 'https://github.com/acme/portal-reconcile-cert/pull/502',
            head: {
              sha: 'sha-dismissed',
              ref: 'delivery/dismissed-review-delivery'
            },
            base: {
              sha: 'base-dismissed',
              ref: 'main'
            },
            auto_merge: null
          });
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/pulls/503')) {
          return jsonResponse({
            number: 503,
            state: 'open',
            draft: false,
            merged: false,
            mergeable: true,
            mergeable_state: 'clean',
            html_url: 'https://github.com/acme/portal-reconcile-cert/pull/503',
            head: {
              sha: 'sha-drift-remote',
              ref: 'delivery/remote-drift-delivery'
            },
            base: {
              sha: 'base-drift',
              ref: 'main'
            },
            auto_merge: null
          });
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/pulls/504')) {
          return jsonResponse({
            number: 504,
            state: 'open',
            draft: false,
            merged: false,
            mergeable: true,
            mergeable_state: 'dirty',
            html_url: 'https://github.com/acme/portal-reconcile-cert/pull/504',
            head: {
              sha: 'sha-failed-check',
              ref: 'delivery/failed-check-delivery'
            },
            base: {
              sha: 'base-failed-check',
              ref: 'main'
            },
            auto_merge: null
          });
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/pulls/501/reviews')) {
          return jsonResponse([
            {
              state: 'APPROVED',
              user: {
                login: 'qa-reviewer'
              }
            }
          ]);
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/pulls/502/reviews')) {
          return jsonResponse([
            {
              state: 'APPROVED',
              user: {
                login: 'qa-reviewer'
              }
            },
            {
              state: 'DISMISSED',
              user: {
                login: 'qa-reviewer'
              }
            }
          ]);
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/pulls/503/reviews')) {
          return jsonResponse([
            {
              state: 'APPROVED',
              user: {
                login: 'qa-reviewer'
              }
            }
          ]);
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/pulls/504/reviews')) {
          return jsonResponse([
            {
              state: 'APPROVED',
              user: {
                login: 'qa-reviewer'
              }
            }
          ]);
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/commits/sha-merge-queue/check-runs')) {
          return jsonResponse({
            total_count: 1,
            check_runs: [
              {
                name: 'ci',
                status: 'completed',
                conclusion: 'success'
              }
            ]
          });
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/commits/sha-dismissed/check-runs')) {
          return jsonResponse({
            total_count: 1,
            check_runs: [
              {
                name: 'ci',
                status: 'completed',
                conclusion: 'success'
              }
            ]
          });
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/commits/sha-drift-remote/check-runs')) {
          return jsonResponse({
            total_count: 1,
            check_runs: [
              {
                name: 'ci',
                status: 'completed',
                conclusion: 'success'
              }
            ]
          });
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/commits/sha-failed-check/check-runs')) {
          return jsonResponse({
            total_count: 1,
            check_runs: [
              {
                name: 'ci',
                status: 'completed',
                conclusion: 'failure'
              }
            ]
          });
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/commits/sha-merge-queue/status')) {
          return jsonResponse({
            statuses: []
          });
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/commits/sha-dismissed/status')) {
          return jsonResponse({
            statuses: []
          });
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/commits/sha-drift-remote/status')) {
          return jsonResponse({
            statuses: []
          });
        }
        if (url.endsWith('/repos/acme/portal-reconcile-cert/commits/sha-failed-check/status')) {
          return jsonResponse({
            statuses: []
          });
        }
        if (url.includes('/repos/acme/portal-reconcile-cert/branches/delivery%2Fmerge-queue-delivery')) {
          return jsonResponse({
            name: 'delivery/merge-queue-delivery',
            commit: {
              sha: 'sha-merge-queue'
            }
          });
        }
        if (url.includes('/repos/acme/portal-reconcile-cert/branches/delivery%2Fdismissed-review-delivery')) {
          return jsonResponse({
            name: 'delivery/dismissed-review-delivery',
            commit: {
              sha: 'sha-dismissed'
            }
          });
        }
        if (url.includes('/repos/acme/portal-reconcile-cert/branches/delivery%2Fremote-drift-delivery')) {
          return jsonResponse({
            name: 'delivery/remote-drift-delivery',
            commit: {
              sha: 'sha-drift-remote'
            }
          });
        }
        if (url.includes('/repos/acme/portal-reconcile-cert/branches/delivery%2Ffailed-check-delivery')) {
          return jsonResponse({
            name: 'delivery/failed-check-delivery',
            commit: {
              sha: 'sha-failed-check'
            }
          });
        }
        return originalFetch(input, init);
      })
    );

    const mergeQueue = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(mergeQueueItemId)}/delivery/reconcile`,
      payload: {
        actor: 'test'
      }
    });
    expect(mergeQueue.statusCode).toBe(200);
    const mergeQueueBody = mergeQueue.json() as {
      delivery: {
        githubState: string | null;
      };
      reconcile: {
        pullRequest?: {
          reviewDecision?: string | null;
        };
      };
    };
    expect(mergeQueueBody.delivery.githubState).toBe('merge_queued');
    expect(mergeQueueBody.reconcile.pullRequest?.reviewDecision).toBe('approved');

    const dismissedReview = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(dismissedReviewItemId)}/delivery/reconcile`,
      payload: {
        actor: 'test'
      }
    });
    expect(dismissedReview.statusCode).toBe(200);
    const dismissedReviewBody = dismissedReview.json() as {
      delivery: {
        githubState: string | null;
        githubStateReason: string | null;
      };
      reconcile: {
        pullRequest?: {
          reviewDecision?: string | null;
        };
      };
    };
    expect(dismissedReviewBody.delivery.githubState).toBe('review_pending');
    expect(dismissedReviewBody.delivery.githubStateReason).toBeNull();
    expect(dismissedReviewBody.reconcile.pullRequest?.reviewDecision).toBe('pending');

    const drift = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(driftItemId)}/delivery/reconcile`,
      payload: {
        actor: 'test'
      }
    });
    expect(drift.statusCode).toBe(200);
    const driftBody = drift.json() as {
      delivery: {
        githubState: string | null;
        githubStateReason: string | null;
      };
      reconcile: {
        branch?: {
          diverged?: boolean;
        };
      };
    };
    expect(driftBody.delivery.githubState).toBe('blocked');
    expect(driftBody.delivery.githubStateReason).toBe('remote_branch_drift');
    expect(driftBody.reconcile.branch?.diverged).toBe(true);

    const failedChecks = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(failedChecksItemId)}/delivery/reconcile`,
      payload: {
        actor: 'test'
      }
    });
    expect(failedChecks.statusCode).toBe(200);
    const failedChecksBody = failedChecks.json() as {
      delivery: {
        githubState: string | null;
        githubStateReason: string | null;
      };
      reconcile: {
        repair?: {
          policyVersion?: string;
          policyHash?: string;
          policySource?: string;
          requiredChecks?: string[];
          failingChecks?: string[];
        };
      };
    };
    expect(failedChecksBody.delivery.githubState).toBe('checks_failed');
    expect(failedChecksBody.delivery.githubStateReason).toBe('checks_failed');
    expect(failedChecksBody.reconcile.repair).toMatchObject({
      policyVersion: repo.policyVersion,
      policySource: 'control_plane',
      requiredChecks: ['ci'],
      failingChecks: ['ci']
    });
    expect(typeof failedChecksBody.reconcile.repair?.policyHash).toBe('string');
  });

  it('certifies publish to webhook drift to reconcile repair under out-of-order delivery', async () => {
    const { repoRoot, remoteRoot } = createPublishRepo('delivery-certification');
    runGit(repoRoot, [
      'config',
      `url.${pathToFileURL(remoteRoot).toString()}.insteadOf`,
      'https://x-access-token:ghp_delivery_certification@github.com/acme/portal-cert.git'
    ]);
    fs.writeFileSync(path.join(repoRoot, 'src', 'app.ts'), 'export const value = 2;\n');

    const repo = await createRepoConnection({
      repo: 'portal-cert',
      policyVersion: 'policy.v2'
    });
    const itemId = await createItemAndBindDelivery({
      repoConnectionId: repo.id,
      title: 'Certified publish',
      itemState: 'review'
    });

    let publishedCommitSha = 'sha-published-placeholder';
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url === 'https://api.github.com/repos/acme/portal-cert/pulls') {
          return jsonResponse(
            {
              number: 31,
              html_url: 'https://github.com/acme/portal-cert/pull/31'
            },
            201
          );
        }
        if (url.endsWith('/repos/acme/portal-cert/pulls/31')) {
          return jsonResponse({
            number: 31,
            state: 'closed',
            draft: false,
            merged: true,
            mergeable: true,
            mergeable_state: 'clean',
            html_url: 'https://github.com/acme/portal-cert/pull/31',
            head: {
              sha: publishedCommitSha,
              ref: 'delivery/certified-publish'
            },
            base: {
              sha: 'base-cert',
              ref: 'main'
            },
            auto_merge: null
          });
        }
        if (url.endsWith('/repos/acme/portal-cert/pulls/31/reviews')) {
          return jsonResponse([
            {
              state: 'APPROVED',
              user: {
                login: 'qa-reviewer'
              }
            }
          ]);
        }
        if (url.endsWith(`/repos/acme/portal-cert/commits/${publishedCommitSha}/check-runs`)) {
          return jsonResponse({
            total_count: 1,
            check_runs: [
              {
                name: 'ci',
                status: 'completed',
                conclusion: 'success'
              }
            ]
          });
        }
        if (url.endsWith(`/repos/acme/portal-cert/commits/${publishedCommitSha}/status`)) {
          return jsonResponse({
            statuses: []
          });
        }
        if (url.includes('/repos/acme/portal-cert/branches/delivery%2Fcertified-publish')) {
          return jsonResponse({
            name: 'delivery/certified-publish',
            commit: {
              sha: publishedCommitSha
            }
          });
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
    const publishBody = publish.json() as {
      publish: {
        commitSha: string;
        prNumber: number | null;
      };
      delivery: {
        githubState: string | null;
        metadata: {
          githubPolicy?: {
            version?: string;
          };
        };
      };
    };
    publishedCommitSha = publishBody.publish.commitSha;
    expect(publishBody.publish.prNumber).toBe(31);
    expect(publishBody.delivery.githubState).toBe('open_pr');
    expect(publishBody.delivery.metadata.githubPolicy?.version).toBe('policy.v2');

    const mergedPayload = {
      action: 'closed',
      number: 31,
      repository: {
        name: 'portal-cert',
        owner: {
          login: 'acme'
        }
      },
      pull_request: {
        number: 31,
        state: 'closed',
        merged: true,
        html_url: 'https://github.com/acme/portal-cert/pull/31'
      }
    };
    const mergedWebhook = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        'x-ops-role': 'admin',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-cert-merged',
        'x-hub-signature-256': signPayload(mergedPayload)
      },
      payload: mergedPayload
    });
    expect(mergedWebhook.statusCode).toBe(200);

    const staleChecksPayload = {
      action: 'completed',
      repository: {
        name: 'portal-cert',
        owner: {
          login: 'acme'
        }
      },
      check_run: {
        conclusion: 'failure',
        pull_requests: [{ number: 31 }]
      }
    };
    const staleChecksWebhook = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        'x-ops-role': 'admin',
        'x-github-event': 'check_run',
        'x-github-delivery': 'delivery-cert-stale-checks',
        'x-hub-signature-256': signPayload(staleChecksPayload)
      },
      payload: staleChecksPayload
    });
    expect(staleChecksWebhook.statusCode).toBe(200);

    const driftedItem = await harness.inject({
      method: 'GET',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}`
    });
    expect(driftedItem.statusCode).toBe(200);
    const driftedBody = driftedItem.json() as {
      item: {
        delivery: {
          githubState: string | null;
        } | null;
      };
    };
    expect(driftedBody.item.delivery?.githubState).toBe('checks_failed');

    const repaired = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery/reconcile`,
      payload: {
        actor: 'test'
      }
    });
    expect(repaired.statusCode).toBe(200);
    const repairedBody = repaired.json() as {
      item: {
        state: string;
      };
      delivery: {
        status: string;
        githubState: string | null;
        metadata: {
          githubPolicy?: {
            version?: string;
          };
        };
      };
      reconcile: {
        status?: string;
        driftReasons?: string[];
      };
    };
    expect(repairedBody.item.state).toBe('done');
    expect(repairedBody.delivery.status).toBe('merged');
    expect(repairedBody.delivery.githubState).toBe('merged');
    expect(repairedBody.delivery.metadata.githubPolicy?.version).toBe('policy.v2');
    expect(repairedBody.reconcile.status).toBe('repair_applied');
    expect(repairedBody.reconcile.driftReasons ?? []).toEqual(expect.arrayContaining(['pull_request_merged', 'state_remote_merged']));
  });
});
