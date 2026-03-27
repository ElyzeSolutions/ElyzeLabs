import { describe, expect, it } from 'vitest';

import { buildGithubComparativeScorecard, type GithubComparatorRun } from '../../src/github-delivery-comparator.js';

describe('github delivery comparator scorecard', () => {
  it('blocks claims and emits follow-up tasks for tied or failed dimensions', () => {
    const run: GithubComparatorRun = {
      schema: 'ops.github-comparator-run.v1',
      version: 1,
      generatedAt: '2026-03-14T00:00:00.000Z',
      baseDir: '/tmp/elyze',
      comparators: {
        elyze: {
          label: 'ElyzeLabs',
          availability: 'available',
          discoveredPath: '.',
          required: true
        },
        paperclip: {
          label: 'Paperclip',
          availability: 'available',
          discoveredPath: '../ROADMAP/paperclip',
          required: true
        },
        symphony: {
          label: 'Symphony',
          availability: 'available',
          discoveredPath: '../ROADMAP/symphony',
          required: true
        }
      },
      scenarioResults: [
        {
          comparator: 'paperclip',
          comparatorLabel: 'Paperclip',
          repoPath: '../ROADMAP/paperclip',
          scenarioId: 'ownership_conflict',
          scenarioTitle: 'Ownership Conflict',
          status: 'partial',
          supportState: 'reference_limited',
          coverage: 0.75,
          artifacts: {},
          notes: ['Paperclip exposes issue-level ownership guards.'],
          gaps: ['github_delivery_lease'],
          limitations: ['Paperclip ownership guards stop at issue scope.']
        },
        {
          comparator: 'paperclip',
          comparatorLabel: 'Paperclip',
          repoPath: '../ROADMAP/paperclip',
          scenarioId: 'operator_incident_handling',
          scenarioTitle: 'Operator Incident Handling',
          status: 'partial',
          supportState: 'reference_limited',
          coverage: 0.5,
          artifacts: {},
          notes: ['Paperclip surfaces governance controls.'],
          gaps: ['github_delivery_cockpit'],
          limitations: ['Paperclip has no GitHub delivery cockpit.']
        },
        {
          comparator: 'symphony',
          comparatorLabel: 'Symphony',
          repoPath: '../ROADMAP/symphony',
          scenarioId: 'backlog_to_github_delivery',
          scenarioTitle: 'Backlog To GitHub Delivery',
          status: 'partial',
          supportState: 'reference_limited',
          coverage: 0.6,
          artifacts: {},
          notes: ['Symphony drives work from a tracker and can land PRs.'],
          gaps: ['github_delivery_control_plane'],
          limitations: ['Symphony is tracker-first, not GitHub-first.']
        }
      ],
      matrix: [],
      dimensionScores: {
        elyze: {
          auth_trust: 0.91,
          repo_mutation_safety: 0.93,
          delivery_ownership_integrity: 0.84,
          reconciliation_latency: 0.92,
          operator_repair_clarity: 0.91
        },
        paperclip: {
          auth_trust: 0.89,
          repo_mutation_safety: 0.72,
          delivery_ownership_integrity: 0.84,
          reconciliation_latency: 0.31,
          operator_repair_clarity: 0.28
        },
        symphony: {
          auth_trust: 0.3,
          repo_mutation_safety: 0.63,
          delivery_ownership_integrity: 0.58,
          reconciliation_latency: 0.25,
          operator_repair_clarity: 0.25
        }
      }
    };

    const result = buildGithubComparativeScorecard(run);
    const paperclip = result.scorecard.comparators.find((entry) => entry.comparator === 'paperclip');
    expect(paperclip?.status).toBe('gap');
    expect(paperclip?.dimensionScores.auth_trust.status).toBe('tied');
    expect(paperclip?.dimensionScores.delivery_ownership_integrity.status).toBe('gap');
    expect(result.followUpTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          comparator: 'paperclip',
          dimension: 'auth_trust',
          reason: 'tied_dimension'
        }),
        expect.objectContaining({
          comparator: 'paperclip',
          dimension: 'delivery_ownership_integrity',
          reason: 'dimension_gap'
        })
      ])
    );
    expect(result.releaseGate.status).toBe('blocked');
    expect(result.releaseGate.reasons).toEqual(
      expect.arrayContaining(['dimension_tied:paperclip:auth_trust', 'dimension_gap:paperclip:delivery_ownership_integrity'])
    );
    expect(result.summary.referenceLimitations).toEqual(
      expect.arrayContaining(['Paperclip ownership guards stop at issue scope.', 'Paperclip has no GitHub delivery cockpit.'])
    );
  });
});
