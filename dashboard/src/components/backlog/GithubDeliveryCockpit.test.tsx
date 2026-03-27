// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GithubDeliveryCockpit } from './GithubDeliveryCockpit';
import type {
  BacklogDeliveryDetailRow,
  BacklogItemRow,
  GithubDeliveryRepairPreviewRow
} from '../../app/types';

const {
  fetchBacklogDeliveryDetail,
  repairBacklogDelivery,
  toastSuccess,
  toastError
} = vi.hoisted(() => ({
  fetchBacklogDeliveryDetail: vi.fn(),
  repairBacklogDelivery: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));

vi.mock('../../app/api', () => ({
  fetchBacklogDeliveryDetail,
  repairBacklogDelivery
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError
  }
}));

function createTask(): BacklogItemRow {
  return {
    id: 'task-github-cockpit',
    title: 'Repair GitHub delivery truth',
    description: 'Keep GitHub delivery state aligned for operators.',
    state: 'review',
    priority: 90,
    labelsJson: '[]',
    source: 'dashboard',
    sourceRef: null,
    createdBy: 'operator',
    projectId: 'ops-dashboard',
    repoRoot: '/workspace/ops-dashboard',
    assignedAgentId: 'software-engineer',
    linkedSessionId: null,
    linkedRunId: null,
    deliveryGroupId: null,
    blockedReason: null,
    originSessionId: null,
    originMessageId: null,
    originChannel: null,
    originChatId: null,
    originTopicId: null,
    metadataJson: '{}',
    createdAt: '2026-03-14T12:00:00.000Z',
    updatedAt: '2026-03-14T12:00:00.000Z',
    labels: [],
    metadata: {},
    dependencies: [],
    transitions: [],
    execution: null,
    delivery: {
      id: 'delivery-github-cockpit',
      itemId: 'task-github-cockpit',
      repoConnectionId: 'repo-1',
      branchName: 'delivery/repair-github-delivery-truth',
      commitSha: 'abc1234',
      prNumber: 42,
      prUrl: 'https://github.com/acme/ops-dashboard/pull/42',
      status: 'blocked',
      githubState: 'checks_failed',
      githubStateReason: 'checks_failed',
      githubStateUpdatedAt: '2026-03-14T12:05:00.000Z',
      checksJson: '{}',
      metadataJson: '{}',
      githubLeaseJson: '{}',
      githubWorktreeJson: '{}',
      githubReconcileJson: '{}',
      receiptStatus: null,
      receiptAttempts: 0,
      receiptLastError: null,
      receiptLastAttemptAt: null,
      workspaceRoot: '/workspace',
      workspacePath: '/workspace/ops-dashboard',
      outputFilesJson: '[]',
      createdAt: '2026-03-14T12:00:00.000Z',
      updatedAt: '2026-03-14T12:05:00.000Z',
      checks: {},
      metadata: {},
      githubLease: {},
      githubWorktree: {},
      githubReconcile: {}
    },
    deliveryGroup: null
  };
}

function createDetail(task: BacklogItemRow): BacklogDeliveryDetailRow {
  return {
    item: task,
    delivery: {
      ...task.delivery!,
      metadata: {
        githubPolicy: {
          version: 'policy.v2',
          source: 'control_plane'
        },
        artifacts: {
          evidenceType: 'github_evidence',
          truthLabel: 'real_delivery'
        }
      },
      githubReconcile: {
        lastReconciledAt: '2026-03-14T12:04:00.000Z',
        status: 'repair_applied'
      }
    },
    journal: {
      schema: 'ops.github-delivery-journal.v1',
      version: 1,
      itemId: task.id,
      deliveryId: task.delivery!.id,
      currentState: {
        status: 'blocked',
        githubState: 'checks_failed',
        githubStateReason: 'checks_failed'
      },
      entries: [
        {
          id: 'journal-webhook',
          kind: 'webhook',
          phase: 'observe',
          createdAt: '2026-03-14T12:02:00.000Z',
          summary: 'check_run delivery accepted',
          status: 'accepted',
          actor: null,
          source: 'github_verified_webhook',
          trust: {
            source: 'github_verified_webhook',
            verified: true
          },
          evidence: {
            deliveryId: 'delivery-1'
          }
        },
        {
          id: 'journal-reconcile',
          kind: 'reconcile',
          phase: 'truth',
          createdAt: '2026-03-14T12:04:00.000Z',
          summary: 'Reconcile recorded repair applied from operator',
          status: 'repair_applied',
          actor: null,
          source: 'github_reconcile',
          trust: {
            source: 'github_reconcile',
            verified: true
          },
          evidence: {
            repair: {
              policyVersion: 'policy.v2'
            }
          }
        }
      ]
    },
    evidenceBundle: {
      dimensions: {
        operator_repair_clarity: {
          status: 'evidence_available',
          evidenceEntryIds: ['journal-reconcile']
        },
        reconciliation_latency: {
          status: 'evidence_available',
          evidenceEntryIds: ['journal-reconcile']
        }
      }
    },
    contracts: {
      githubDelivery: {
        blockedReasonTaxonomy: {
          checks_failed: {
            title: 'Checks failed',
            severity: 'high',
            remediation: ['Inspect failed check suites', 'Reconcile after rerun or repair']
          }
        }
      },
      githubDeliveryJournal: {},
      githubDeliveryRepair: {},
      githubComparativeEvidence: {}
    }
  };
}

describe('GithubDeliveryCockpit', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    fetchBacklogDeliveryDetail.mockReset();
    repairBacklogDelivery.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('renders journal, blocker diagnostics, and evidence parity from the delivery detail API', async () => {
    const task = createTask();
    fetchBacklogDeliveryDetail.mockResolvedValue(createDetail(task));

    render(
      <GithubDeliveryCockpit
        task={task}
        token="dashboard-token"
        onRefresh={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(await screen.findByText('GitHub delivery cockpit')).toBeInTheDocument();
    expect(screen.getByText('Checks failed')).toBeInTheDocument();
    expect(screen.getByText('Reconcile recorded repair applied from operator')).toBeInTheDocument();
    expect(screen.getByText('operator repair clarity')).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes('policy.v2') && content.includes('control plane'))
    ).toBeInTheDocument();
  });

  it('runs preview-first repair actions and sends the preview idempotency key on mutation', async () => {
    const task = createTask();
    const detail = createDetail(task);
    const preview: GithubDeliveryRepairPreviewRow = {
      schema: 'ops.github-delivery-repair-preview.v1',
      version: 1,
      dryRun: true,
      action: 'refresh',
      actor: 'dashboard',
      allowed: true,
      idempotencyKey: 'task-github-cockpit:refresh:preview',
      authorization: {},
      expectedAudit: {},
      evidence: {},
      expectedEffects: ['reconcile_remote_truth']
    };

    fetchBacklogDeliveryDetail
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce(detail);
    repairBacklogDelivery
      .mockResolvedValueOnce({
        dryRun: true,
        item: task,
        delivery: task.delivery,
        preview
      })
      .mockResolvedValueOnce({
        item: task,
        delivery: task.delivery,
        repair: {
          action: 'refresh',
          result: 'ok'
        }
      });

    const onRefresh = vi.fn().mockResolvedValue(undefined);

    render(
      <GithubDeliveryCockpit
        task={task}
        token="dashboard-token"
        onRefresh={onRefresh}
      />
    );

    expect(await screen.findByRole('button', { name: /reconcile now/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reconcile now/i }));

    await waitFor(() => {
      expect(repairBacklogDelivery).toHaveBeenNthCalledWith(1, 'dashboard-token', task.id, {
        action: 'refresh',
        dryRun: true
      });
    });

    await waitFor(() => {
      expect(repairBacklogDelivery).toHaveBeenNthCalledWith(2, 'dashboard-token', task.id, {
        action: 'refresh',
        idempotencyKey: preview.idempotencyKey
      });
    });

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
      expect(toastSuccess).toHaveBeenCalledWith('refresh completed.');
    });
  });
});
