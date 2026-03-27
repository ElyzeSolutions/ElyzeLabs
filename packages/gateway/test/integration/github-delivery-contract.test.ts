import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

describe('github delivery contract integration', () => {
  let harness: GatewayTestHarness;

  beforeAll(async () => {
    harness = await createGatewayTestHarness('github-delivery-contract');
  });

  afterAll(async () => {
    await harness.close();
  });

  it('serves the github delivery contract and persists lease/worktree/reconcile summaries on backlog deliveries', async () => {
    const contracts = await harness.inject({
      method: 'GET',
      url: '/api/backlog/contracts',
      headers: {
        'x-ops-role': 'admin'
      }
    });
    expect(contracts.statusCode).toBe(200);
    const contractsBody = contracts.json() as {
      contracts: {
        githubDelivery: {
          schema: string;
          transitions: Record<string, string[]>;
          leases: {
            scopes: Array<{ scope: string }>;
          };
        };
        githubDeliveryJournal: {
          schema: string;
          eventKinds: string[];
        };
        githubDeliveryRepair: {
          schema: string;
          preview: {
            responseSchema: string;
          };
        };
        githubComparativeEvidence: {
          schema: string;
          comparators: string[];
        };
      };
    };
    expect(contractsBody.contracts.githubDelivery.schema).toBe('ops.github-delivery-contract.v1');
    expect(contractsBody.contracts.githubDelivery.transitions.checks_pending).toContain('ready_to_merge');
    expect(contractsBody.contracts.githubDelivery.leases.scopes.map((entry) => entry.scope)).toEqual([
      'repo',
      'delivery',
      'branch',
      'pull_request'
    ]);
    expect(contractsBody.contracts.githubDeliveryJournal.schema).toBe('ops.github-delivery-journal-contract.v1');
    expect(contractsBody.contracts.githubDeliveryJournal.eventKinds).toEqual(
      expect.arrayContaining(['webhook', 'reconcile', 'operator_repair'])
    );
    expect(contractsBody.contracts.githubDeliveryRepair.schema).toBe('ops.github-delivery-repair-contract.v1');
    expect(contractsBody.contracts.githubDeliveryRepair.preview.responseSchema).toBe('ops.github-delivery-repair-preview.v1');
    expect(contractsBody.contracts.githubComparativeEvidence.schema).toBe('ops.github-comparative-evidence-bundle.v1');
    expect(contractsBody.contracts.githubComparativeEvidence.comparators).toEqual(['paperclip', 'symphony']);

    const repo = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'elyzesolutions',
        repo: 'ops-delivery-contract',
        authSecretRef: 'env:OPS_GITHUB_PAT',
        enabled: true
      }
    });
    expect(repo.statusCode).toBe(201);
    const repoBody = repo.json() as { repo: { id: string } };

    const item = await harness.inject({
      method: 'POST',
      url: '/api/backlog/items',
      payload: {
        title: 'Contract-backed delivery item',
        description: 'Persist github delivery state contracts.',
        state: 'review',
        priority: 72,
        actor: 'test'
      }
    });
    expect(item.statusCode).toBe(201);
    const itemId = (item.json() as { item: { id: string } }).item.id;

    const githubLease = {
      schema: 'ops.github-delivery-lease.v1',
      version: 1,
      repo: {
        leaseId: 'lease-repo',
        scopeKey: repoBody.repo.id,
        status: 'active',
        ownerActor: 'publisher',
        ownerSessionId: 'session-1',
        ownerRunId: 'run-1',
        acquiredAt: '2026-03-14T12:00:00.000Z',
        lastHeartbeatAt: '2026-03-14T12:01:00.000Z',
        expiresAt: '2026-03-14T12:15:00.000Z',
        releasedAt: null,
        releaseReason: null
      },
      delivery: {
        leaseId: 'lease-delivery',
        scopeKey: itemId,
        status: 'active',
        ownerActor: 'publisher',
        ownerSessionId: 'session-1',
        ownerRunId: 'run-1',
        acquiredAt: '2026-03-14T12:00:00.000Z',
        lastHeartbeatAt: '2026-03-14T12:01:00.000Z',
        expiresAt: '2026-03-14T12:15:00.000Z',
        releasedAt: null,
        releaseReason: null
      },
      branch: {
        leaseId: 'lease-branch',
        scopeKey: 'feature/contract-backed-delivery',
        status: 'active',
        ownerActor: 'publisher',
        ownerSessionId: 'session-1',
        ownerRunId: 'run-1',
        acquiredAt: '2026-03-14T12:00:00.000Z',
        lastHeartbeatAt: '2026-03-14T12:01:00.000Z',
        expiresAt: '2026-03-14T12:15:00.000Z',
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

    const githubWorktree = {
      schema: 'ops.github-worktree.v1',
      version: 1,
      isolationMode: 'git_worktree',
      repoRoot: '/tmp/ops-delivery-contract',
      worktreePath: '/tmp/ops-delivery-contract/.worktrees/item-1',
      branchName: 'feature/contract-backed-delivery',
      baseRef: 'origin/main',
      headSha: 'abc1234',
      status: 'ready',
      createdAt: '2026-03-14T12:00:00.000Z',
      cleanedAt: null
    };

    const githubReconcile = {
      schema: 'ops.github-reconcile-summary.v1',
      version: 1,
      status: 'drift_detected',
      sourceOfTruth: 'reconciler',
      lastReconciledAt: '2026-03-14T12:05:00.000Z',
      driftReasons: ['remote_branch_drift'],
      pullRequest: {
        state: 'open',
        mergeable: 'unknown',
        reviewDecision: 'approved',
        reviewCount: 2
      },
      checks: {
        status: 'pending',
        pendingCount: 1,
        failingCount: 0
      },
      branch: {
        headSha: 'abc1234',
        baseSha: 'base123',
        diverged: true,
        staleEligible: false
      },
      issues: {
        linkedIssueNumbers: [44],
        syncState: 'in_sync'
      }
    };

    const delivery = await harness.inject({
      method: 'PUT',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`,
      payload: {
        repoConnectionId: repoBody.repo.id,
        branchName: 'feature/contract-backed-delivery',
        commitSha: 'abc1234',
        prNumber: 44,
        prUrl: 'https://github.com/elyzesolutions/ops-delivery-contract/pull/44',
        status: 'review',
        githubState: 'checks_pending',
        githubStateReason: 'checks_running',
        checks: {
          status: 'pending',
          pendingCount: 1,
          failingCount: 0,
          source: 'reconciler'
        },
        metadata: {
          githubIssue: {
            number: 44,
            state: 'open',
            url: 'https://github.com/elyzesolutions/ops-delivery-contract/issues/44',
            labels: ['state:review']
          },
          githubPolicy: {
            version: 'policy.v1',
            source: 'control_plane'
          },
          publish: {
            actor: 'test',
            publishedAt: '2026-03-14T12:02:00.000Z'
          }
        },
        githubLease,
        githubWorktree,
        githubReconcile
      }
    });
    expect(delivery.statusCode).toBe(200);
    const deliveryBody = delivery.json() as {
      delivery: {
        githubState: string | null;
        githubStateReason: string | null;
        githubStateUpdatedAt: string | null;
        githubLease: Record<string, unknown>;
        githubWorktree: Record<string, unknown>;
        githubReconcile: Record<string, unknown>;
      };
    };
    expect(deliveryBody.delivery.githubState).toBe('checks_pending');
    expect(deliveryBody.delivery.githubStateReason).toBe('checks_running');
    expect(deliveryBody.delivery.githubStateUpdatedAt).toBeTruthy();
    expect(deliveryBody.delivery.githubLease).toMatchObject(githubLease);
    expect(deliveryBody.delivery.githubWorktree).toMatchObject(githubWorktree);
    expect(deliveryBody.delivery.githubReconcile).toMatchObject(githubReconcile);

    const itemDetails = await harness.inject({
      method: 'GET',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}`
    });
    expect(itemDetails.statusCode).toBe(200);
    const itemDetailsBody = itemDetails.json() as {
      item: {
        delivery: {
          githubState: string | null;
          githubLease: Record<string, unknown>;
          githubWorktree: Record<string, unknown>;
          githubReconcile: Record<string, unknown>;
        } | null;
      };
    };
    expect(itemDetailsBody.item.delivery?.githubState).toBe('checks_pending');
    expect(itemDetailsBody.item.delivery?.githubLease).toMatchObject(githubLease);
    expect(itemDetailsBody.item.delivery?.githubWorktree).toMatchObject(githubWorktree);
    expect(itemDetailsBody.item.delivery?.githubReconcile).toMatchObject(githubReconcile);

    const db = harness.createDb();
    try {
      db.upsertGithubWebhookDelivery({
        deliveryId: 'delivery-contract-verified',
        repoConnectionId: repoBody.repo.id,
        event: 'pull_request',
        owner: 'elyzesolutions',
        repo: 'ops-delivery-contract',
        source: 'webhook',
        signatureState: 'verified',
        signatureFingerprint: 'sha256=delivery-contract',
        status: 'accepted',
        payload: {
          action: 'synchronize',
          pull_request: {
            number: 44,
            state: 'open',
            merged: false,
            html_url: 'https://github.com/elyzesolutions/ops-delivery-contract/pull/44',
            head: {
              ref: 'feature/contract-backed-delivery'
            }
          },
          repository: {
            name: 'ops-delivery-contract',
            owner: {
              login: 'elyzesolutions'
            }
          }
        }
      });
      db.appendAudit({
        actor: 'operator',
        action: 'github.delivery.repair',
        resource: itemId,
        decision: 'allowed',
        reason: 'stale_lease_clear',
        correlationId: 'delivery-contract-repair-preview',
        details: {
          action: 'stale_lease_clear',
          releasedScopes: ['repo', 'delivery', 'branch']
        }
      });
    } finally {
      db.close();
    }

    const detail = await harness.inject({
      method: 'GET',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery/detail`
    });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json() as {
      journal: {
        schema: string;
        entries: Array<{
          kind: string;
        }>;
      };
      evidenceBundle: {
        schema: string;
        comparators: string[];
        dimensions: Record<string, { evidenceEntryIds: string[] }>;
      };
      contracts: {
        githubDeliveryJournal: {
          schema: string;
        };
        githubComparativeEvidence: {
          schema: string;
        };
      };
    };
    expect(detailBody.journal.schema).toBe('ops.github-delivery-journal.v1');
    expect(detailBody.journal.entries.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(['branch', 'commit', 'pull_request', 'issue_sync', 'check', 'reconcile', 'lease', 'webhook', 'operator_repair'])
    );
    const journalTimes = detailBody.journal.entries.map((entry) => entry.createdAt);
    expect(journalTimes).toEqual([...journalTimes].sort((left, right) => left.localeCompare(right)));
    expect(detailBody.evidenceBundle.schema).toBe('ops.github-comparative-evidence-bundle.v1');
    expect(detailBody.evidenceBundle.comparators).toEqual(['paperclip', 'symphony']);
    expect(detailBody.evidenceBundle.dimensions.operator_repair_clarity.evidenceEntryIds.length).toBeGreaterThan(0);
    expect(detailBody.contracts.githubDeliveryJournal.schema).toBe('ops.github-delivery-journal-contract.v1');
    expect(detailBody.contracts.githubComparativeEvidence.schema).toBe('ops.github-comparative-evidence-bundle.v1');

    const viewerRepair = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery/repair`,
      headers: {
        'x-ops-role': 'viewer'
      },
      payload: {
        actor: 'viewer',
        action: 'refresh'
      }
    });
    expect(viewerRepair.statusCode).toBe(403);
    expect((viewerRepair.json() as { details?: { reason?: string } }).details?.reason).toBe('rbac_forbidden');

    const dryRunRepair = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery/repair`,
      payload: {
        actor: 'test',
        action: 'stale_lease_clear',
        dryRun: true
      }
    });
    expect(dryRunRepair.statusCode).toBe(200);
    const dryRunBody = dryRunRepair.json() as {
      dryRun: boolean;
      preview: {
        schema: string;
        action: string;
        allowed: boolean;
        expectedEffects: string[];
      };
      delivery: {
        githubLease: {
          repo?: {
            status?: string;
          };
        };
      };
    };
    expect(dryRunBody.dryRun).toBe(true);
    expect(dryRunBody.preview.schema).toBe('ops.github-delivery-repair-preview.v1');
    expect(dryRunBody.preview.action).toBe('stale_lease_clear');
    expect(dryRunBody.preview.allowed).toBe(true);
    expect(dryRunBody.preview.expectedEffects).toEqual(expect.arrayContaining(['release_stale_leases']));
    expect(dryRunBody.delivery.githubLease.repo?.status).toBe('active');

    const staleRepair = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery/repair`,
      payload: {
        actor: 'test',
        action: 'stale_lease_clear',
        idempotencyKey: 'stale-preview-key'
      }
    });
    expect(staleRepair.statusCode).toBe(409);
    expect((staleRepair.json() as { details?: { reason?: string } }).details?.reason).toBe('stale_repair_preview');
  });
});
