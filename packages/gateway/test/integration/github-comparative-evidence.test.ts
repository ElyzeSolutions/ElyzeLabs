import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

describe('github comparative evidence integration', () => {
  let harness: GatewayTestHarness;

  beforeAll(async () => {
    harness = await createGatewayTestHarness('github-comparative-evidence');
  });

  afterAll(async () => {
    await harness.close();
  });

  it('publishes a local comparator matrix, scorecard, and best-in-class claim gate for github delivery', async () => {
    const repo = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'elyzesolutions',
        repo: 'ops-comparator-evidence',
        authSecretRef: 'env:OPS_GITHUB_PAT',
        enabled: true,
        policyVersion: 'policy.v1',
        policyHash: 'sha256:comparator-evidence',
        policySource: 'control_plane',
        policy: {
          requiredChecks: ['ci']
        }
      }
    });
    expect(repo.statusCode).toBe(201);
    const repoId = (repo.json() as { repo: { id: string } }).repo.id;

    const item = await harness.inject({
      method: 'POST',
      url: '/api/backlog/items',
      payload: {
        title: 'Comparator-backed GitHub delivery',
        description: 'Exercise comparative evidence bundle.',
        state: 'review',
        priority: 70,
        actor: 'test'
      }
    });
    expect(item.statusCode).toBe(201);
    const itemId = (item.json() as { item: { id: string } }).item.id;

    const bind = await harness.inject({
      method: 'PUT',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`,
      payload: {
        repoConnectionId: repoId,
        branchName: 'delivery/comparator-evidence',
        commitSha: 'sha-comparator-evidence',
        prNumber: 71,
        prUrl: 'https://github.com/elyzesolutions/ops-comparator-evidence/pull/71',
        status: 'review',
        githubState: 'open_pr',
        metadata: {
          githubPolicy: {
            version: 'policy.v1',
            source: 'control_plane'
          }
        }
      }
    });
    expect(bind.statusCode).toBe(200);

    const detail = await harness.inject({
      method: 'GET',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery/detail`
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json() as {
      evidenceBundle: {
        schema: string;
        matrix: {
          schema: string;
          comparators: Record<string, { availability: string; discoveredPath: string | null }>;
          scenarioResults: Array<{
            comparator: string;
            scenarioId: string;
            status: string;
            supportState: string;
            limitations: string[];
          }>;
          dimensionScores: Record<string, Record<string, number | null>>;
        };
        scorecard: {
          schema: string;
          comparators: Array<{
            comparator: string;
            status: string;
            wins: string[];
            limitations: string[];
            dimensionScores: Record<string, { label: string; status: string }>;
          }>;
        };
        followUpTasks: Array<{ comparator: string; dimension: string; reason: string }>;
        releaseGate: {
          status: string;
          readyForBestInClassClaim: boolean;
          reasons: string[];
        };
        summary: {
          wins: string[];
          referenceLimitations: string[];
        };
      };
    };

    expect(body.evidenceBundle.schema).toBe('ops.github-comparative-evidence-bundle.v1');
    expect(body.evidenceBundle.matrix.schema).toBe('ops.github-comparator-run.v1');
    expect(body.evidenceBundle.matrix.comparators.paperclip?.availability).toBe('available');
    expect(body.evidenceBundle.matrix.comparators.paperclip?.discoveredPath).toContain('paperclip');
    expect(body.evidenceBundle.matrix.comparators.symphony?.availability).toBe('available');
    expect(body.evidenceBundle.matrix.comparators.symphony?.discoveredPath).toContain('symphony');

    const elyzeBacklog = body.evidenceBundle.matrix.scenarioResults.find(
      (entry) => entry.comparator === 'elyze' && entry.scenarioId === 'backlog_to_github_delivery'
    );
    expect(elyzeBacklog?.status).toBe('passed');

    const paperclipBacklog = body.evidenceBundle.matrix.scenarioResults.find(
      (entry) => entry.comparator === 'paperclip' && entry.scenarioId === 'backlog_to_github_delivery'
    );
    expect(paperclipBacklog?.status).toBe('unsupported');
    expect(paperclipBacklog?.supportState).toBe('reference_limited');

    const symphonyBacklog = body.evidenceBundle.matrix.scenarioResults.find(
      (entry) => entry.comparator === 'symphony' && entry.scenarioId === 'backlog_to_github_delivery'
    );
    expect(symphonyBacklog?.status).toBe('partial');

    expect(body.evidenceBundle.matrix.dimensionScores.elyze.auth_trust).toBeGreaterThanOrEqual(0.9);
    expect(body.evidenceBundle.scorecard.schema).toBe('ops.github-comparative-scorecard.v1');
    expect(body.evidenceBundle.scorecard.comparators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          comparator: 'paperclip',
          status: 'met'
        }),
        expect.objectContaining({
          comparator: 'symphony',
          status: 'met'
        })
      ])
    );

    const paperclipScorecard = body.evidenceBundle.scorecard.comparators.find((entry) => entry.comparator === 'paperclip');
    expect(paperclipScorecard?.dimensionScores.auth_trust.label).toBe('Auth Trust');
    expect(paperclipScorecard?.dimensionScores.reconciliation_latency.label).toBe('Reconcile Correctness');
    expect(paperclipScorecard?.wins.length).toBeGreaterThan(0);
    expect(paperclipScorecard?.limitations.some((entry) => entry.includes('Paperclip'))).toBe(true);

    const symphonyScorecard = body.evidenceBundle.scorecard.comparators.find((entry) => entry.comparator === 'symphony');
    expect(symphonyScorecard?.limitations.some((entry) => entry.includes('Symphony'))).toBe(true);

    expect(body.evidenceBundle.followUpTasks).toHaveLength(0);
    expect(body.evidenceBundle.releaseGate.status).toBe('ready');
    expect(body.evidenceBundle.releaseGate.readyForBestInClassClaim).toBe(true);
    expect(body.evidenceBundle.releaseGate.reasons).toHaveLength(0);
    expect(body.evidenceBundle.summary.wins.length).toBeGreaterThan(0);
    expect(body.evidenceBundle.summary.referenceLimitations.some((entry) => entry.includes('Paperclip'))).toBe(true);
    expect(body.evidenceBundle.summary.referenceLimitations.some((entry) => entry.includes('Symphony'))).toBe(true);
  });
});
