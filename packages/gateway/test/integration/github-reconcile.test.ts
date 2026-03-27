import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });

describe('github reconcile integration', () => {
  let harness: GatewayTestHarness;

  beforeAll(async () => {
    process.env.OPS_GITHUB_PAT = 'ghp_reconcile_integration';
    process.env.OPS_GITHUB_PAT_FALLBACK_ALLOW = '1';
    harness = await createGatewayTestHarness('github-reconcile');
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

  const createRepoConnection = async (repo: string) => {
    const response = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'elyzesolutions',
        repo,
        authSecretRef: 'env:OPS_GITHUB_PAT',
        authMode: 'pat_fallback',
        metadata: {
          patFallbackAllowed: true
        },
        enabled: true,
        defaultBranch: 'main',
        policyVersion: 'policy.v1',
        policyHash: `sha256:${repo}`,
        policySource: 'control_plane',
        policy: {
          requiredChecks: ['ci']
        }
      }
    });
    expect(response.statusCode).toBe(201);
    return (response.json() as { repo: { id: string } }).repo.id;
  };

  const createBacklogItemWithDelivery = async (input: {
    title: string;
    repoConnectionId: string;
    branchName: string;
    commitSha: string;
    prNumber: number;
    prUrl: string;
    githubState: string;
    metadata?: Record<string, unknown>;
    githubLease?: Record<string, unknown>;
    githubWorktree?: Record<string, unknown>;
  }) => {
    const item = await harness.inject({
      method: 'POST',
      url: '/api/backlog/items',
      payload: {
        title: input.title,
        description: `${input.title} description`,
        state: 'planned',
        priority: 70,
        actor: 'test'
      }
    });
    expect(item.statusCode).toBe(201);
    const itemId = (item.json() as { item: { id: string } }).item.id;

    const delivery = await harness.inject({
      method: 'PUT',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`,
      payload: {
        repoConnectionId: input.repoConnectionId,
        branchName: input.branchName,
        commitSha: input.commitSha,
        prNumber: input.prNumber,
        prUrl: input.prUrl,
        status: 'review',
        githubState: input.githubState,
        metadata: input.metadata ?? {},
        githubLease: input.githubLease,
        githubWorktree: input.githubWorktree
      }
    });
    expect(delivery.statusCode).toBe(200);
    return itemId;
  };

  it('reconciles a delivery from canonical GitHub pull-request, review, and check truth', async () => {
    const repoConnectionId = await createRepoConnection('ops-reconcile-item');
    const itemId = await createBacklogItemWithDelivery({
      title: 'Repair missed check completion',
      repoConnectionId,
      branchName: 'delivery/reconcile-ready',
      commitSha: 'sha-ready',
      prNumber: 101,
      prUrl: 'https://github.com/elyzesolutions/ops-reconcile-item/pull/101',
      githubState: 'checks_pending',
      metadata: {
        githubIssue: {
          number: 77,
          state: 'open'
        }
      }
    });

    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith('/repos/elyzesolutions/ops-reconcile-item/pulls/101')) {
          return jsonResponse({
            number: 101,
            state: 'open',
            draft: false,
            merged: false,
            mergeable: true,
            mergeable_state: 'clean',
            html_url: 'https://github.com/elyzesolutions/ops-reconcile-item/pull/101',
            head: {
              sha: 'sha-ready',
              ref: 'delivery/reconcile-ready'
            },
            base: {
              sha: 'base-sha',
              ref: 'main'
            },
            auto_merge: null
          });
        }
        if (url.endsWith('/repos/elyzesolutions/ops-reconcile-item/pulls/101/reviews')) {
          return jsonResponse([
            {
              state: 'APPROVED',
              user: {
                login: 'qa-reviewer'
              }
            }
          ]);
        }
        if (url.endsWith('/repos/elyzesolutions/ops-reconcile-item/commits/sha-ready/check-runs')) {
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
        if (url.endsWith('/repos/elyzesolutions/ops-reconcile-item/commits/sha-ready/status')) {
          return jsonResponse({
            statuses: []
          });
        }
        if (url.includes('/repos/elyzesolutions/ops-reconcile-item/branches/delivery%2Freconcile-ready')) {
          return jsonResponse({
            name: 'delivery/reconcile-ready',
            commit: {
              sha: 'sha-ready'
            }
          });
        }
        if (url.endsWith('/repos/elyzesolutions/ops-reconcile-item/issues/77')) {
          return jsonResponse({
            number: 77,
            state: 'open'
          });
        }
        return originalFetch(input, init);
      })
    );

    const response = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery/reconcile`,
      payload: {
        actor: 'test'
      }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      item: {
        delivery: {
          githubState: string | null;
        } | null;
      };
      delivery: {
        status: string;
        githubState: string | null;
        githubStateReason: string | null;
        githubReconcile: Record<string, unknown>;
      };
    };

    expect(body.item.delivery?.githubState).toBe('ready_to_merge');
    expect(body.delivery.status).toBe('review');
    expect(body.delivery.githubState).toBe('ready_to_merge');
    expect(body.delivery.githubStateReason).toBeNull();
    expect(body.delivery.githubReconcile).toMatchObject({
      status: 'repair_applied',
      sourceOfTruth: 'operator',
      pullRequest: {
        state: 'open',
        reviewDecision: 'approved'
      },
      checks: {
        status: 'success',
        pendingCount: 0,
        failingCount: 0
      }
    });
  });

  it('reconciles every delivery for a repo and repairs repo-wide drift deterministically', async () => {
    const repoConnectionId = await createRepoConnection('ops-reconcile-repo');
    const readyItemId = await createBacklogItemWithDelivery({
      title: 'Ready to merge state',
      repoConnectionId,
      branchName: 'delivery/repo-ready',
      commitSha: 'sha-repo-ready',
      prNumber: 201,
      prUrl: 'https://github.com/elyzesolutions/ops-reconcile-repo/pull/201',
      githubState: 'open_pr'
    });
    const closedItemId = await createBacklogItemWithDelivery({
      title: 'Closed without webhook',
      repoConnectionId,
      branchName: 'delivery/repo-closed',
      commitSha: 'sha-repo-closed',
      prNumber: 202,
      prUrl: 'https://github.com/elyzesolutions/ops-reconcile-repo/pull/202',
      githubState: 'open_pr'
    });

    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith('/repos/elyzesolutions/ops-reconcile-repo/pulls/201')) {
          return jsonResponse({
            number: 201,
            state: 'open',
            draft: false,
            merged: false,
            mergeable_state: 'clean',
            html_url: 'https://github.com/elyzesolutions/ops-reconcile-repo/pull/201',
            head: {
              sha: 'sha-repo-ready',
              ref: 'delivery/repo-ready'
            },
            base: {
              sha: 'base-ready',
              ref: 'main'
            },
            auto_merge: null
          });
        }
        if (url.endsWith('/repos/elyzesolutions/ops-reconcile-repo/pulls/202')) {
          return jsonResponse({
            number: 202,
            state: 'closed',
            draft: false,
            merged: false,
            mergeable_state: 'dirty',
            html_url: 'https://github.com/elyzesolutions/ops-reconcile-repo/pull/202',
            head: {
              sha: 'sha-repo-closed',
              ref: 'delivery/repo-closed'
            },
            base: {
              sha: 'base-closed',
              ref: 'main'
            },
            auto_merge: null
          });
        }
        if (url.endsWith('/repos/elyzesolutions/ops-reconcile-repo/pulls/201/reviews')) {
          return jsonResponse([
            {
              state: 'APPROVED',
              user: {
                login: 'qa-reviewer'
              }
            }
          ]);
        }
        if (url.endsWith('/repos/elyzesolutions/ops-reconcile-repo/pulls/202/reviews')) {
          return jsonResponse([]);
        }
        if (url.endsWith('/repos/elyzesolutions/ops-reconcile-repo/commits/sha-repo-ready/check-runs')) {
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
        if (url.endsWith('/repos/elyzesolutions/ops-reconcile-repo/commits/sha-repo-ready/status')) {
          return jsonResponse({
            statuses: []
          });
        }
        if (url.endsWith('/repos/elyzesolutions/ops-reconcile-repo/commits/sha-repo-closed/check-runs')) {
          return jsonResponse({
            total_count: 0,
            check_runs: []
          });
        }
        if (url.endsWith('/repos/elyzesolutions/ops-reconcile-repo/commits/sha-repo-closed/status')) {
          return jsonResponse({
            statuses: []
          });
        }
        if (url.includes('/repos/elyzesolutions/ops-reconcile-repo/branches/delivery%2Frepo-ready')) {
          return jsonResponse({
            name: 'delivery/repo-ready',
            commit: {
              sha: 'sha-repo-ready'
            }
          });
        }
        if (url.includes('/repos/elyzesolutions/ops-reconcile-repo/branches/delivery%2Frepo-closed')) {
          return jsonResponse({
            name: 'delivery/repo-closed',
            commit: {
              sha: 'sha-repo-closed'
            }
          });
        }
        return originalFetch(input, init);
      })
    );

    const response = await harness.inject({
      method: 'POST',
      url: `/api/github/repos/${encodeURIComponent(repoConnectionId)}/reconcile`,
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        actor: 'test'
      }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      reconciled: number;
      changed: number;
      deliveries: Array<{
        itemId: string;
        delivery: {
          status: string;
          githubState: string | null;
        };
      }>;
    };

    expect(body.reconciled).toBeGreaterThanOrEqual(2);
    expect(body.changed).toBeGreaterThanOrEqual(2);
    const readyDelivery = body.deliveries.find((entry) => entry.itemId === readyItemId);
    const closedDelivery = body.deliveries.find((entry) => entry.itemId === closedItemId);
    expect(readyDelivery?.delivery.githubState).toBe('ready_to_merge');
    expect(readyDelivery?.delivery.status).toBe('review');
    expect(closedDelivery?.delivery.githubState).toBe('closed_unmerged');
    expect(closedDelivery?.delivery.status).toBe('closed');
  });

  it('supports bounded repair actions for stale leases, orphan marking, and verified webhook redrive', async () => {
    const repoConnectionId = await createRepoConnection('ops-repair-actions');
    const staleLeaseExpiresAt = new Date(Date.now() - 60_000).toISOString();
    const staleLease = {
      schema: 'ops.github-delivery-lease.v1',
      version: 1,
      repo: {
        leaseId: 'repo-stale',
        scopeKey: repoConnectionId,
        status: 'active',
        ownerActor: 'publisher',
        ownerSessionId: 'session-1',
        ownerRunId: 'run-1',
        acquiredAt: new Date(Date.now() - 120_000).toISOString(),
        lastHeartbeatAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: staleLeaseExpiresAt,
        releasedAt: null,
        releaseReason: null
      },
      delivery: {
        leaseId: 'delivery-stale',
        scopeKey: 'stale-item',
        status: 'active',
        ownerActor: 'publisher',
        ownerSessionId: 'session-1',
        ownerRunId: 'run-1',
        acquiredAt: new Date(Date.now() - 120_000).toISOString(),
        lastHeartbeatAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: staleLeaseExpiresAt,
        releasedAt: null,
        releaseReason: null
      },
      branch: {
        leaseId: 'branch-stale',
        scopeKey: 'delivery/stale-lease',
        status: 'active',
        ownerActor: 'publisher',
        ownerSessionId: 'session-1',
        ownerRunId: 'run-1',
        acquiredAt: new Date(Date.now() - 120_000).toISOString(),
        lastHeartbeatAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: staleLeaseExpiresAt,
        releasedAt: null,
        releaseReason: null
      },
      pullRequest: null,
      takeover: {
        policy: 'stale_only',
        staleAfterMs: 600000,
        operatorOverrideRequired: true
      }
    };
    const staleItemId = await createBacklogItemWithDelivery({
      title: 'Stale lease repair',
      repoConnectionId,
      branchName: 'delivery/stale-lease',
      commitSha: 'sha-stale',
      prNumber: 303,
      prUrl: 'https://github.com/elyzesolutions/ops-repair-actions/pull/303',
      githubState: 'open_pr',
      githubLease: staleLease,
      githubWorktree: {
        schema: 'ops.github-worktree.v1',
        version: 1,
        isolationMode: 'git_worktree',
        repoRoot: '/tmp/repo',
        worktreePath: '/tmp/repo/.ops-github-worktrees/stale',
        branchName: 'delivery/stale-lease',
        baseRef: 'main',
        headSha: 'sha-stale',
        status: 'ready',
        createdAt: new Date().toISOString(),
        cleanedAt: null
      }
    });

    const staleLeaseResponse = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(staleItemId)}/delivery/repair`,
      payload: {
        actor: 'test',
        action: 'stale_lease_clear'
      }
    });
    expect(staleLeaseResponse.statusCode).toBe(200);
    const staleLeaseBody = staleLeaseResponse.json() as {
      delivery: {
        githubLease: {
          repo?: { status?: string };
          delivery?: { status?: string };
          branch?: { status?: string };
        };
      };
      repair: {
        action: string;
        releasedScopes: string[];
      };
    };
    expect(staleLeaseBody.repair.action).toBe('stale_lease_clear');
    expect(staleLeaseBody.repair.releasedScopes).toEqual(expect.arrayContaining(['repo', 'delivery', 'branch']));
    expect(staleLeaseBody.delivery.githubLease.repo?.status).toBe('released');
    expect(staleLeaseBody.delivery.githubLease.delivery?.status).toBe('released');
    expect(staleLeaseBody.delivery.githubLease.branch?.status).toBe('released');

    const orphanResponse = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(staleItemId)}/delivery/repair`,
      payload: {
        actor: 'test',
        action: 'branch_orphan_mark'
      }
    });
    expect(orphanResponse.statusCode).toBe(200);
    const orphanBody = orphanResponse.json() as {
      delivery: {
        githubState: string | null;
        githubStateReason: string | null;
        githubWorktree: {
          status?: string;
        };
      };
      repair: {
        action: string;
      };
    };
    expect(orphanBody.repair.action).toBe('branch_orphan_mark');
    expect(orphanBody.delivery.githubState).toBe('blocked');
    expect(orphanBody.delivery.githubStateReason).toBe('orphaned_branch');
    expect(orphanBody.delivery.githubWorktree.status).toBe('orphaned');

    const redriveItemId = await createBacklogItemWithDelivery({
      title: 'Webhook redrive repair',
      repoConnectionId,
      branchName: 'delivery/webhook-redrive',
      commitSha: 'sha-redrive',
      prNumber: 304,
      prUrl: 'https://github.com/elyzesolutions/ops-repair-actions/pull/304',
      githubState: 'open_pr'
    });
    const db = harness.createDb();
    try {
      db.upsertGithubWebhookDelivery({
        deliveryId: 'verified-redrive-304',
        repoConnectionId,
        event: 'pull_request',
        owner: 'elyzesolutions',
        repo: 'ops-repair-actions',
        source: 'webhook',
        signatureState: 'verified',
        signatureFingerprint: 'sha256=verified304',
        status: 'accepted',
        payload: {
          action: 'closed',
          pull_request: {
            number: 304,
            state: 'closed',
            merged: true,
            html_url: 'https://github.com/elyzesolutions/ops-repair-actions/pull/304',
            head: {
              ref: 'delivery/webhook-redrive'
            }
          },
          repository: {
            name: 'ops-repair-actions',
            owner: {
              login: 'elyzesolutions'
            }
          }
        }
      });
    } finally {
      db.close();
    }

    const redriveResponse = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(redriveItemId)}/delivery/repair`,
      payload: {
        actor: 'test',
        action: 'verified_webhook_redrive'
      }
    });
    expect(redriveResponse.statusCode).toBe(200);
    const redriveBody = redriveResponse.json() as {
      delivery: {
        githubState: string | null;
      };
      repair: {
        action: string;
        replayDeliveryId: string;
      };
    };
    expect(redriveBody.repair.action).toBe('verified_webhook_redrive');
    expect(redriveBody.repair.replayDeliveryId).toBe('verified-redrive-304');
    expect(redriveBody.delivery.githubState).toBe('merged');
  });
});
