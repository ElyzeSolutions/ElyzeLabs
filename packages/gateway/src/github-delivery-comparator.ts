import fsSync from 'node:fs';
import path from 'node:path';

import { utcNow } from '@ops/shared';

import { findRepoPatternMatches, type RepoPatternMatch } from './repo-evidence-search.js';

type GithubComparatorId = 'elyze' | 'paperclip' | 'symphony';
type ArtifactStatus = 'present' | 'missing' | 'not_available';
type ScenarioStatus = 'passed' | 'partial' | 'unsupported' | 'not_available';
type ScenarioSupportState = 'supported' | 'reference_limited' | 'unsupported' | 'missing_repo';
type ScoreStatus = 'met' | 'gap' | 'tied' | 'not_applicable';

interface ArtifactDefinition {
  key: string;
  patterns: string[];
  note?: string;
}

interface ScenarioComparatorDefinition {
  capabilityArtifacts: ArtifactDefinition[];
  limitationArtifacts?: ArtifactDefinition[];
  notes?: string[];
}

interface ScenarioDefinition {
  id: string;
  title: string;
  relatedDimensions: string[];
  support: Record<GithubComparatorId, ScenarioComparatorDefinition>;
}

interface DimensionDefinition {
  label: string;
  threshold: number;
  scenarioIds: string[];
  rubric: string;
}

export interface GithubComparatorArtifactEvidence {
  key: string;
  purpose: 'capability' | 'limitation';
  status: ArtifactStatus;
  matches: RepoPatternMatch[];
  note: string | null;
}

export interface GithubComparatorScenarioResult {
  comparator: GithubComparatorId;
  comparatorLabel: string;
  repoPath: string | null;
  scenarioId: string;
  scenarioTitle: string;
  status: ScenarioStatus;
  supportState: ScenarioSupportState;
  coverage: number;
  artifacts: Record<string, GithubComparatorArtifactEvidence>;
  notes: string[];
  gaps: string[];
  limitations: string[];
}

export interface GithubComparatorRun {
  schema: 'ops.github-comparator-run.v1';
  version: 1;
  generatedAt: string;
  baseDir: string;
  comparators: Record<
    GithubComparatorId,
    {
      label: string;
      availability: 'available' | 'missing';
      discoveredPath: string | null;
      required: boolean;
    }
  >;
  scenarioResults: GithubComparatorScenarioResult[];
  matrix: Array<{
    comparator: GithubComparatorId;
    scenarioId: string;
    status: ScenarioStatus;
    coverage: number;
    repoPath: string | null;
  }>;
  dimensionScores: Record<GithubComparatorId, Record<string, number | null>>;
}

export interface GithubComparativeDimensionScore {
  label: string;
  status: ScoreStatus;
  elyzeScore: number | null;
  comparatorScore: number | null;
  threshold: number;
  delta: number | null;
  scenarioIds: string[];
  rationale: string;
}

export interface GithubComparativeScorecardRow {
  comparator: Exclude<GithubComparatorId, 'elyze'>;
  comparatorLabel: string;
  scenario: 'github_delivery';
  status: ScoreStatus;
  dimensionScores: Record<string, GithubComparativeDimensionScore>;
  notes: string[];
  artifacts: Array<{
    scenarioId: string;
    artifactKey: string;
    purpose: 'capability' | 'limitation';
    file: string;
    line: number;
    excerpt: string;
  }>;
  wins: string[];
  limitations: string[];
  tiedDimensions: string[];
  gapDimensions: string[];
}

export interface GithubComparativeScorecard {
  schema: 'ops.github-comparative-scorecard.v1';
  version: 1;
  generatedAt: string;
  comparators: GithubComparativeScorecardRow[];
}

export interface GithubComparativeFollowUpTask {
  id: string;
  comparator: string;
  dimension: string;
  reason: 'tied_dimension' | 'dimension_gap' | 'missing_reference';
  description: string;
  depends_on: string[];
  criteria: string[];
  evidence: Record<string, unknown>;
}

export interface GithubComparativeReleaseGate {
  status: 'ready' | 'blocked';
  readyForBestInClassClaim: boolean;
  reasons: string[];
}

export interface GithubComparativeSummary {
  wins: string[];
  referenceLimitations: string[];
  noClaimReasons: string[];
}

export interface GithubComparativeEvidence {
  run: GithubComparatorRun;
  scorecard: GithubComparativeScorecard;
  followUpTasks: GithubComparativeFollowUpTask[];
  releaseGate: GithubComparativeReleaseGate;
  summary: GithubComparativeSummary;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_MATCHES_PER_ARTIFACT = 3;
const TIE_EPSILON = 0.05;
const IGNORED_GLOBS = [
  '--glob',
  '!**/node_modules/**',
  '--glob',
  '!**/.git/**',
  '--glob',
  '!**/dist/**',
  '--glob',
  '!**/coverage/**',
  '--glob',
  '!**/build/**'
];
const IGNORED_DIRECTORY_NAMES = ['node_modules', '.git', 'dist', 'coverage', 'build'];

const COMPARATOR_METADATA: Record<
  GithubComparatorId,
  {
    label: string;
    required: boolean;
  }
> = {
  elyze: {
    label: 'ElyzeLabs',
    required: true
  },
  paperclip: {
    label: 'Paperclip',
    required: true
  },
  symphony: {
    label: 'Symphony',
    required: true
  }
};

const DIMENSIONS: Record<string, DimensionDefinition> = {
  auth_trust: {
    label: 'Auth Trust',
    threshold: 0.9,
    scenarioIds: ['backlog_to_github_delivery', 'missed_webhook_repair'],
    rubric: 'Credential provenance, webhook verification, and trust boundaries stay explicit.'
  },
  repo_mutation_safety: {
    label: 'Repo Mutation Safety',
    threshold: 0.88,
    scenarioIds: ['backlog_to_github_delivery', 'ownership_conflict'],
    rubric: 'Branch mutation stays isolated, lease-guarded, and auditable.'
  },
  delivery_ownership_integrity: {
    label: 'Delivery Ownership',
    threshold: 0.88,
    scenarioIds: ['ownership_conflict', 'operator_incident_handling'],
    rubric: 'Ownership conflicts stay explainable and repairable without hidden takeovers.'
  },
  reconciliation_latency: {
    label: 'Reconcile Correctness',
    threshold: 0.88,
    scenarioIds: ['missed_webhook_repair', 'operator_incident_handling'],
    rubric: 'Reconcile and repair converge on canonical GitHub truth instead of stale local state.'
  },
  operator_repair_clarity: {
    label: 'Operator Repair Clarity',
    threshold: 0.9,
    scenarioIds: ['missed_webhook_repair', 'operator_incident_handling'],
    rubric: 'Operator repair actions stay guarded, legible, and receipt-backed.'
  }
};

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'backlog_to_github_delivery',
    title: 'Backlog To GitHub Delivery',
    relatedDimensions: ['auth_trust', 'repo_mutation_safety'],
    support: {
      elyze: {
        capabilityArtifacts: [
          {
            key: 'delivery_contract',
            patterns: ['ops.github-delivery-contract.v1', 'branch_prepared', 'ready_to_merge', 'closed_unmerged']
          },
          {
            key: 'repo_policy_resolution',
            patterns: ['policyVersion', 'policyHash', 'policySource', 'githubPolicy']
          },
          {
            key: 'backlog_delivery_route',
            patterns: ['/api/backlog/items/:itemId/delivery', 'repoConnectionId', 'prNumber']
          },
          {
            key: 'issue_sync_truth',
            patterns: ['issue_sync', 'githubIssue', 'linkedIssueNumbers']
          }
        ]
      },
      paperclip: {
        capabilityArtifacts: [],
        limitationArtifacts: [
          {
            key: 'goal_not_pull_request',
            patterns: ['Manage business goals, not pull requests', 'Not a code review tool', 'Paperclip orchestrates work, not pull requests'],
            note: 'Paperclip positions itself as goal orchestration rather than a GitHub pull-request control plane.'
          }
        ],
        notes: ['Paperclip provides adjacent orchestration features, but not a native backlog-to-GitHub delivery lane.']
      },
      symphony: {
        capabilityArtifacts: [
          {
            key: 'tracker_backlog_source',
            patterns: ['monitors a Linear board', 'tracker.project_slug', 'fetch_issue_states_by_ids']
          },
          {
            key: 'pull_request_output',
            patterns: ['PR review feedback', 'land the PR safely', 'Close open GitHub PRs']
          },
          {
            key: 'isolated_workspace_bootstrap',
            patterns: ['workspace.root', 'git clone --depth 1', 'hooks.after_create']
          },
          {
            key: 'github_delivery_control_plane',
            patterns: ['X-Hub-Signature-256', 'github_verified_webhook', 'policyHash']
          },
          {
            key: 'delivery_journal_parity',
            patterns: ['github-delivery-journal', 'operator_repair', 'blockedReasonTaxonomy']
          }
        ],
        limitationArtifacts: [
          {
            key: 'linear_scope',
            patterns: ['Symphony monitors a Linear board', 'tracker.kind', 'LINEAR_API_KEY'],
            note: 'Symphony is tracker-first and does not publish a GitHub-native delivery control plane contract.'
          }
        ]
      }
    }
  },
  {
    id: 'ownership_conflict',
    title: 'Ownership Conflict',
    relatedDimensions: ['repo_mutation_safety', 'delivery_ownership_integrity'],
    support: {
      elyze: {
        capabilityArtifacts: [
          {
            key: 'delivery_leases',
            patterns: ['ops.github-delivery-lease.v1', 'operatorOverrideRequiredFor', "scope: 'pull_request'"]
          },
          {
            key: 'lease_conflict_guard',
            patterns: ['GitHub publish blocked by active delivery lease', "reason: 'lease_conflict'", "toBe('lease_conflict')"]
          },
          {
            key: 'stale_lease_repair',
            patterns: ['stale_lease_clear', 'release_stale_leases', 'releasedScopes']
          },
          {
            key: 'isolated_publish_evidence',
            patterns: ['.ops-github-worktrees', 'same-repo parallel publish', 'blocked branch-ownership conflicts']
          }
        ]
      },
      paperclip: {
        capabilityArtifacts: [
          {
            key: 'issue_run_conflict',
            patterns: ['Issue run ownership conflict', 'Only assignee can release issue', 'Only checkout run can release issue']
          },
          {
            key: 'execution_release',
            patterns: ['releaseIssueExecutionAndPromote', 'executionRunId', 'executionLockedAt']
          },
          {
            key: 'issue_release_route',
            patterns: ['/issues/:id/release', 'action: "issue.released"', 'release(']
          },
          {
            key: 'github_delivery_lease',
            patterns: ['ops.github-delivery-lease.v1', 'pull_request', 'worktree']
          }
        ],
        limitationArtifacts: [
          {
            key: 'issue_scope_only',
            patterns: ['Issues are ticket-based', 'Tasks are ticket-based', 'organizes companies'],
            note: 'Paperclip ownership guards operate at issue execution scope, not GitHub delivery lease scope.'
          }
        ]
      },
      symphony: {
        capabilityArtifacts: [
          {
            key: 'issue_claim_release',
            patterns: ['release_issue_claim', 'claimed', 'retry_attempts']
          },
          {
            key: 'reconcile_reassignment',
            patterns: ['Issue no longer routed to this worker', 'terminate_running_issue', 'cleanup_issue_workspace']
          },
          {
            key: 'running_state_reconcile',
            patterns: ['reconcile_running_issue_states', 'active_state_set', 'terminal_state_set']
          },
          {
            key: 'github_delivery_lease',
            patterns: ['ops.github-delivery-lease.v1', 'stale_lease_clear', 'operatorOverrideRequiredFor']
          }
        ],
        limitationArtifacts: [
          {
            key: 'tracker_claim_scope',
            patterns: ['release claim', 'tracker.fetch_issue_states_by_ids', 'Linear'],
            note: 'Symphony claims tracker issues, but it does not expose GitHub delivery ownership or lease semantics.'
          }
        ]
      }
    }
  },
  {
    id: 'missed_webhook_repair',
    title: 'Missed Webhook Repair',
    relatedDimensions: ['auth_trust', 'reconciliation_latency', 'operator_repair_clarity'],
    support: {
      elyze: {
        capabilityArtifacts: [
          {
            key: 'verified_webhook_contract',
            patterns: ['X-Hub-Signature-256', 'signatureState', 'Only verified deliveries can be replayed']
          },
          {
            key: 'dedupe_and_replay',
            patterns: ['delivery-replay-source', 'replay_source_unverified', '/api/github/webhooks/replay']
          },
          {
            key: 'repair_redrive',
            patterns: ['verified_webhook_redrive', 'replayDeliveryId', 'refresh_delivery_truth']
          },
          {
            key: 'reconcile_truth',
            patterns: ['reconciles a delivery from canonical GitHub pull-request, review, and check truth', 'checks_failed', 'driftReasons']
          }
        ]
      },
      paperclip: {
        capabilityArtifacts: [],
        limitationArtifacts: [
          {
            key: 'no_verified_github_webhook_lane',
            patterns: ['Manage business goals, not pull requests', 'Not a code review tool'],
            note: 'Paperclip does not expose a verified GitHub webhook repair lane for backlog delivery.'
          }
        ]
      },
      symphony: {
        capabilityArtifacts: [],
        limitationArtifacts: [
          {
            key: 'no_github_webhook_lane',
            patterns: ['Linear board', 'tracker.kind', 'trusted environments'],
            note: 'Symphony does not publish GitHub webhook verification or replay repair controls.'
          }
        ]
      }
    }
  },
  {
    id: 'operator_incident_handling',
    title: 'Operator Incident Handling',
    relatedDimensions: ['delivery_ownership_integrity', 'reconciliation_latency', 'operator_repair_clarity'],
    support: {
      elyze: {
        capabilityArtifacts: [
          {
            key: 'delivery_cockpit',
            patterns: ['GithubDeliveryCockpit', 'blockedReasonTaxonomy', 'repair.preview']
          },
          {
            key: 'repair_audit',
            patterns: ['github.delivery.repair', 'operator_repair', 'audit receipt']
          },
          {
            key: 'browser_certification',
            patterns: ['delivery cockpit', 'operator-repair journal', 'browser smoke checks passed']
          },
          {
            key: 'bounded_repair_actions',
            patterns: ['stale_lease_clear', 'branch_orphan_mark', 'verified_webhook_redrive']
          }
        ]
      },
      paperclip: {
        capabilityArtifacts: [
          {
            key: 'ticket_audit',
            patterns: ['Ticket System', 'immutable audit log', 'Every decision explained']
          },
          {
            key: 'governance_controls',
            patterns: ['Governance', 'pause or terminate any agent', 'Approve hires, override strategy']
          },
          {
            key: 'mobile_operator_surface',
            patterns: ['Mobile Ready', 'Monitor and manage your autonomous businesses']
          },
          {
            key: 'github_delivery_cockpit',
            patterns: ['github-delivery-journal', 'stale_lease_clear', 'verified_webhook_redrive']
          }
        ],
        limitationArtifacts: [
          {
            key: 'not_github_incident_surface',
            patterns: ['Manage business goals, not pull requests', 'Not a code review tool'],
            note: 'Paperclip operator surfaces are governance-oriented, not GitHub delivery incident repair surfaces.'
          }
        ]
      },
      symphony: {
        capabilityArtifacts: [
          {
            key: 'status_dashboard',
            patterns: ['StatusDashboard', '/api/v1/state', '/api/v1/refresh']
          },
          {
            key: 'workspace_cleanup_hooks',
            patterns: ['workspace.before_remove', 'cleanup_workspace', 'before_remove']
          },
          {
            key: 'operator_repair_receipts',
            patterns: ['github.delivery.repair', 'audit receipt', 'blockedReasonTaxonomy']
          },
          {
            key: 'guarded_repair_controls',
            patterns: ['verified_webhook_redrive', 'stale_lease_clear', 'branch_orphan_mark']
          }
        ],
        limitationArtifacts: [
          {
            key: 'trusted_preview_only',
            patterns: ['low-key engineering preview', 'trusted environments'],
            note: 'Symphony exposes status and lifecycle hooks, but not a guarded GitHub delivery repair cockpit.'
          }
        ]
      }
    }
  }
];

let cachedEvidence:
  | {
      baseDir: string;
      expiresAt: number;
      value: GithubComparativeEvidence;
    }
  | null = null;

const clampUnit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
};

const safeRelativePath = (baseDir: string, filePath: string): string => {
  const relative = path.relative(baseDir, filePath);
  return relative.startsWith('..') ? filePath : relative;
};

const comparatorDiscoveryCandidates = (baseDir: string, comparator: Exclude<GithubComparatorId, 'elyze'>): string[] => {
  const name = comparator.toLowerCase();
  return [
    path.resolve(baseDir, 'comparators', name),
    path.resolve(baseDir, '..', 'ROADMAP', name),
    path.resolve(baseDir, '..', name),
    path.resolve(baseDir, '..', '..', name)
  ];
};

const discoverComparatorRepo = (baseDir: string, comparator: GithubComparatorId): string | null => {
  if (comparator === 'elyze') {
    return baseDir;
  }
  for (const candidate of comparatorDiscoveryCandidates(baseDir, comparator)) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const evaluateArtifact = (input: {
  baseDir: string;
  repoPath: string | null;
  definition: ArtifactDefinition;
  purpose: 'capability' | 'limitation';
}): GithubComparatorArtifactEvidence => {
  if (!input.repoPath) {
    return {
      key: input.definition.key,
      purpose: input.purpose,
      status: 'not_available',
      matches: [],
      note: input.definition.note ?? null
    };
  }
  const matches = findRepoPatternMatches({
    repoPath: input.repoPath,
    patterns: input.definition.patterns,
    maxMatches: MAX_MATCHES_PER_ARTIFACT,
    ignoredGlobs: IGNORED_GLOBS,
    ignoredDirectoryNames: IGNORED_DIRECTORY_NAMES
  }).map((match) => ({
    file: safeRelativePath(input.baseDir, match.file),
    line: match.line,
    excerpt: match.excerpt
  }));
  return {
    key: input.definition.key,
    purpose: input.purpose,
    status: matches.length > 0 ? 'present' : 'missing',
    matches,
    note: input.definition.note ?? null
  };
};

const evaluateScenario = (input: {
  baseDir: string;
  comparator: GithubComparatorId;
  scenario: ScenarioDefinition;
  repoPath: string | null;
}): GithubComparatorScenarioResult => {
  const comparatorConfig = input.scenario.support[input.comparator];
  const comparatorLabel = COMPARATOR_METADATA[input.comparator].label;
  if (!input.repoPath) {
    return {
      comparator: input.comparator,
      comparatorLabel,
      repoPath: null,
      scenarioId: input.scenario.id,
      scenarioTitle: input.scenario.title,
      status: 'not_available',
      supportState: 'missing_repo',
      coverage: 0,
      artifacts: {},
      notes: [`${comparatorLabel} is missing locally.`],
      gaps: [],
      limitations: []
    };
  }

  const artifacts: Record<string, GithubComparatorArtifactEvidence> = {};
  const capabilityArtifacts = comparatorConfig.capabilityArtifacts.map((definition) =>
    evaluateArtifact({
      baseDir: input.baseDir,
      repoPath: input.repoPath,
      definition,
      purpose: 'capability'
    })
  );
  for (const artifact of capabilityArtifacts) {
    artifacts[artifact.key] = artifact;
  }
  const limitationArtifacts = (comparatorConfig.limitationArtifacts ?? []).map((definition) =>
    evaluateArtifact({
      baseDir: input.baseDir,
      repoPath: input.repoPath,
      definition,
      purpose: 'limitation'
    })
  );
  for (const artifact of limitationArtifacts) {
    artifacts[artifact.key] = artifact;
  }

  const presentCapabilities = capabilityArtifacts.filter((artifact) => artifact.status === 'present').length;
  const capabilityCoverage =
    capabilityArtifacts.length === 0 ? 0 : clampUnit(presentCapabilities / capabilityArtifacts.length);
  const matchedLimitations = limitationArtifacts.filter((artifact) => artifact.status === 'present');
  const limitations = matchedLimitations.map((artifact) => artifact.note ?? `${comparatorLabel} exposes a documented limitation for ${input.scenario.id}.`);
  const gaps = capabilityArtifacts.filter((artifact) => artifact.status !== 'present').map((artifact) => artifact.key);
  let status: ScenarioStatus = 'unsupported';
  let supportState: ScenarioSupportState = 'unsupported';
  if (capabilityArtifacts.length > 0 && presentCapabilities === capabilityArtifacts.length) {
    status = 'passed';
    supportState = 'supported';
  } else if (presentCapabilities > 0) {
    status = 'partial';
    supportState = matchedLimitations.length > 0 ? 'reference_limited' : 'supported';
  } else if (matchedLimitations.length > 0) {
    status = 'unsupported';
    supportState = 'reference_limited';
  }

  const notes = [...(comparatorConfig.notes ?? [])];
  if (status === 'passed') {
    notes.push(`All ${input.scenario.title.toLowerCase()} evidence artifacts were found for ${comparatorLabel}.`);
  }
  return {
    comparator: input.comparator,
    comparatorLabel,
    repoPath: safeRelativePath(input.baseDir, input.repoPath),
    scenarioId: input.scenario.id,
    scenarioTitle: input.scenario.title,
    status,
    supportState,
    coverage: capabilityCoverage,
    artifacts,
    notes,
    gaps,
    limitations
  };
};

const averageScenarioCoverage = (results: GithubComparatorScenarioResult[], scenarioIds: string[]): number | null => {
  const matching = results.filter((result) => scenarioIds.includes(result.scenarioId));
  if (matching.length === 0) {
    return null;
  }
  if (matching.every((result) => result.supportState === 'missing_repo')) {
    return null;
  }
  const values = matching
    .filter((result) => result.supportState !== 'missing_repo')
    .map((result) => result.coverage);
  if (values.length === 0) {
    return 0;
  }
  return clampUnit(values.reduce((sum, value) => sum + value, 0) / values.length);
};

export const runGithubComparatorHarness = (input: { baseDir?: string }): GithubComparatorRun => {
  const baseDir = path.resolve(input.baseDir ?? process.cwd());
  const comparators = Object.fromEntries(
    (Object.keys(COMPARATOR_METADATA) as GithubComparatorId[]).map((comparator) => {
      const discoveredPath = discoverComparatorRepo(baseDir, comparator);
      return [
        comparator,
        {
          label: COMPARATOR_METADATA[comparator].label,
          availability: discoveredPath ? 'available' : 'missing',
          discoveredPath: discoveredPath ? safeRelativePath(baseDir, discoveredPath) : null,
          required: COMPARATOR_METADATA[comparator].required
        }
      ];
    })
  ) as GithubComparatorRun['comparators'];

  const scenarioResults: GithubComparatorScenarioResult[] = [];
  for (const scenario of SCENARIOS) {
    for (const comparator of Object.keys(COMPARATOR_METADATA) as GithubComparatorId[]) {
      scenarioResults.push(
        evaluateScenario({
          baseDir,
          comparator,
          scenario,
          repoPath: discoverComparatorRepo(baseDir, comparator)
        })
      );
    }
  }

  const dimensionScores = Object.fromEntries(
    (Object.keys(COMPARATOR_METADATA) as GithubComparatorId[]).map((comparator) => {
      const comparatorResults = scenarioResults.filter((result) => result.comparator === comparator);
      return [
        comparator,
        Object.fromEntries(
          Object.entries(DIMENSIONS).map(([dimension, config]) => [dimension, averageScenarioCoverage(comparatorResults, config.scenarioIds)])
        )
      ];
    })
  ) as GithubComparatorRun['dimensionScores'];

  return {
    schema: 'ops.github-comparator-run.v1',
    version: 1,
    generatedAt: utcNow(),
    baseDir,
    comparators,
    scenarioResults,
    matrix: scenarioResults.map((result) => ({
      comparator: result.comparator,
      scenarioId: result.scenarioId,
      status: result.status,
      coverage: result.coverage,
      repoPath: result.repoPath
    })),
    dimensionScores
  };
};

const flattenArtifacts = (results: GithubComparatorScenarioResult[]) =>
  results.flatMap((result) =>
    Object.values(result.artifacts).flatMap((artifact) =>
      artifact.matches.map((match) => ({
        scenarioId: result.scenarioId,
        artifactKey: artifact.key,
        purpose: artifact.purpose,
        file: match.file,
        line: match.line,
        excerpt: match.excerpt
      }))
    )
  );

export const buildGithubComparativeScorecard = (run: GithubComparatorRun): {
  scorecard: GithubComparativeScorecard;
  followUpTasks: GithubComparativeFollowUpTask[];
  releaseGate: GithubComparativeReleaseGate;
  summary: GithubComparativeSummary;
} => {
  const elyzeScores = run.dimensionScores.elyze ?? {};
  const rows: GithubComparativeScorecardRow[] = [];
  const followUpTasks: GithubComparativeFollowUpTask[] = [];

  for (const comparator of ['paperclip', 'symphony'] as const) {
    const comparatorResults = run.scenarioResults.filter((result) => result.comparator === comparator);
    const comparatorScores = run.dimensionScores[comparator] ?? {};
    const dimensionScores: Record<string, GithubComparativeDimensionScore> = {};
    const tiedDimensions: string[] = [];
    const gapDimensions: string[] = [];
    const wins: string[] = [];
    const limitations = Array.from(
      new Set(
        comparatorResults.flatMap((result) => result.limitations).filter((entry) => entry.trim().length > 0)
      )
    );
    const notes = Array.from(
      new Set(
        comparatorResults.flatMap((result) => result.notes).filter((entry) => entry.trim().length > 0)
      )
    );

    for (const [dimension, definition] of Object.entries(DIMENSIONS)) {
      const elyzeScore = elyzeScores[dimension] ?? null;
      const comparatorScore = comparatorScores[dimension] ?? null;
      const delta =
        elyzeScore === null || comparatorScore === null ? null : Number((elyzeScore - comparatorScore).toFixed(3));
      let status: ScoreStatus = 'gap';
      if (comparatorScore === null) {
        status = 'not_applicable';
      } else if (elyzeScore === null) {
        status = 'gap';
      } else if (elyzeScore < definition.threshold) {
        status = 'gap';
      } else if (Math.abs(delta ?? 0) <= TIE_EPSILON) {
        status = 'tied';
      } else if (elyzeScore >= definition.threshold && (delta ?? 0) > TIE_EPSILON) {
        status = 'met';
      }
      const rationale =
        status === 'met'
          ? `Elyze leads ${COMPARATOR_METADATA[comparator].label} on ${definition.label} with a ${elyzeScore?.toFixed(3)} score versus ${comparatorScore?.toFixed(3)}.`
          : status === 'tied'
            ? `Elyze and ${COMPARATOR_METADATA[comparator].label} remain within ${TIE_EPSILON.toFixed(2)} on ${definition.label}; keep the claim gated.`
            : status === 'not_applicable'
              ? `${COMPARATOR_METADATA[comparator].label} is not available locally for ${definition.label}.`
              : `Elyze still needs stronger ${definition.label} evidence versus ${COMPARATOR_METADATA[comparator].label}.`;
      if (status === 'met') {
        wins.push(`Elyze exceeds ${COMPARATOR_METADATA[comparator].label} on ${definition.label}.`);
      }
      if (status === 'tied') {
        tiedDimensions.push(dimension);
      }
      if (status === 'gap') {
        gapDimensions.push(dimension);
      }
      if (status === 'tied' || status === 'gap' || status === 'not_applicable') {
        followUpTasks.push({
          id: `github-comparator-followup-${followUpTasks.length + 1}`,
          comparator,
          dimension,
          reason: status === 'tied' ? 'tied_dimension' : status === 'not_applicable' ? 'missing_reference' : 'dimension_gap',
          description: `Close the ${definition.label} comparator claim gap against ${COMPARATOR_METADATA[comparator].label}.`,
          depends_on: ['T-379'],
          criteria: [
            `Comparator rerun shows Elyze above ${definition.threshold.toFixed(2)} on ${definition.label}.`,
            'Evidence bundle includes file-backed comparator artifacts rather than narrative-only claims.',
            status === 'not_applicable'
              ? 'Comparator availability or limitation remains explicit in the release evidence.'
              : 'Release gate no longer blocks the best-in-class claim for this dimension.'
          ],
          evidence: {
            comparator,
            dimension,
            label: definition.label,
            threshold: definition.threshold,
            elyzeScore,
            comparatorScore,
            scenarioIds: definition.scenarioIds
          }
        });
      }
      dimensionScores[dimension] = {
        label: definition.label,
        status,
        elyzeScore,
        comparatorScore,
        threshold: definition.threshold,
        delta,
        scenarioIds: definition.scenarioIds,
        rationale
      };
    }

    const status: ScoreStatus =
      comparatorResults.every((result) => result.supportState === 'missing_repo')
        ? 'not_applicable'
        : gapDimensions.length > 0
          ? 'gap'
          : tiedDimensions.length > 0
            ? 'tied'
            : 'met';
    rows.push({
      comparator,
      comparatorLabel: COMPARATOR_METADATA[comparator].label,
      scenario: 'github_delivery',
      status,
      dimensionScores,
      notes,
      artifacts: flattenArtifacts(comparatorResults),
      wins,
      limitations,
      tiedDimensions,
      gapDimensions
    });
  }

  const releaseReasons = rows.flatMap((row) => {
    if (row.status === 'met') {
      return [];
    }
    if (row.status === 'not_applicable') {
      return [`missing_comparator_reference:${row.comparator}`];
    }
    return [...row.gapDimensions.map((dimension) => `dimension_gap:${row.comparator}:${dimension}`), ...row.tiedDimensions.map((dimension) => `dimension_tied:${row.comparator}:${dimension}`)];
  });

  return {
    scorecard: {
      schema: 'ops.github-comparative-scorecard.v1',
      version: 1,
      generatedAt: run.generatedAt,
      comparators: rows
    },
    followUpTasks,
    releaseGate: {
      status: releaseReasons.length === 0 ? 'ready' : 'blocked',
      readyForBestInClassClaim: releaseReasons.length === 0,
      reasons: releaseReasons
    },
    summary: {
      wins: rows.flatMap((row) => row.wins),
      referenceLimitations: Array.from(new Set(rows.flatMap((row) => row.limitations))),
      noClaimReasons: releaseReasons
    }
  };
};

export const buildGithubComparativeEvidence = (input: { baseDir?: string; forceRefresh?: boolean }): GithubComparativeEvidence => {
  const baseDir = path.resolve(input.baseDir ?? process.cwd());
  const now = Date.now();
  if (!input.forceRefresh && cachedEvidence && cachedEvidence.baseDir === baseDir && cachedEvidence.expiresAt > now) {
    return cachedEvidence.value;
  }
  const run = runGithubComparatorHarness({ baseDir });
  const { scorecard, followUpTasks, releaseGate, summary } = buildGithubComparativeScorecard(run);
  const value: GithubComparativeEvidence = {
    run,
    scorecard,
    followUpTasks,
    releaseGate,
    summary
  };
  cachedEvidence = {
    baseDir,
    expiresAt: now + CACHE_TTL_MS,
    value
  };
  return value;
};
