import path from 'node:path';

import { utcNow } from '@ops/shared';

import type { FrontierScorecard } from './frontier-scorecard.js';
import { findRepoPatternMatches, type RepoPatternMatch } from './repo-evidence-search.js';

type ArtifactStatus = 'present' | 'missing' | 'not_available';
type ScenarioStatus = 'passed' | 'partial' | 'not_available';
type DeltaStatus = 'meets' | 'below_threshold' | 'not_available';

export interface FrontierComparatorArtifactEvidence {
  key: string;
  status: ArtifactStatus;
  matches: RepoPatternMatch[];
}

export interface FrontierComparatorScenarioResult {
  comparator: string;
  comparatorLabel: string;
  repoPath: string | null;
  scenarioId: string;
  scenarioTitle: string;
  status: ScenarioStatus;
  supportState: 'supported' | 'unsupported' | 'missing_repo';
  coverage: number;
  artifacts: Record<string, FrontierComparatorArtifactEvidence>;
  notes: string[];
  gaps: string[];
}

export interface FrontierComparatorDelta {
  comparator: string;
  dimension: string;
  score: number | null;
  threshold: number;
  deltaToThreshold: number | null;
  status: DeltaStatus;
  scenarioIds: string[];
}

export interface FrontierComparatorRun {
  schema: 'ops.frontier-comparator-run.v1';
  version: 1;
  generatedAt: string;
  baseDir: string;
  scorecardVersion: number;
  comparators: Record<
    string,
    {
      label: string;
      availability: 'available' | 'missing';
      discoveredPath: string | null;
      required: boolean;
    }
  >;
  scenarioResults: FrontierComparatorScenarioResult[];
  matrix: Array<{
    comparator: string;
    scenarioId: string;
    status: ScenarioStatus;
    coverage: number;
    repoPath: string | null;
  }>;
  dimensionScores: Record<string, Record<string, number | null>>;
  scoreDeltas: FrontierComparatorDelta[];
  roadmapNotes: Array<{
    comparator: string;
    dimension: string;
    status: DeltaStatus;
    note: string;
  }>;
}

export interface FrontierLegacyJsonDecision {
  mode: 'retain' | 'shadow' | 'remove';
  rationale: string[];
  evidenceRequirements: string[];
}

export interface FrontierComparatorClosure {
  schema: 'ops.frontier-comparator-closure.v1';
  version: 1;
  generatedAt: string;
  rerunGeneratedAt: string;
  summary: {
    wins: string[];
    remainingGaps: string[];
    missingReferences: string[];
  };
  legacyJsonDecision: FrontierLegacyJsonDecision;
  followUpTasks: Array<{
    id: string;
    description: string;
    depends_on: string[];
    criteria: string[];
    evidence: Record<string, unknown>;
  }>;
  scoreDeltas: FrontierComparatorDelta[];
}

interface ScenarioArtifactDefinition {
  key: string;
  patterns: string[];
}

interface ScenarioDefinition {
  id: string;
  artifactDefinitions: ScenarioArtifactDefinition[];
  relatedDimensions: string[];
}

const MAX_MATCHES_PER_ARTIFACT = 3;

const SCENARIO_DEFINITIONS: Record<string, ScenarioDefinition> = {
  native_tool_session: {
    id: 'native_tool_session',
    relatedDimensions: ['tool_runtime_nativeness', 'operator_visible_truth'],
    artifactDefinitions: [
      {
        key: 'executionPath',
        patterns: ['executionPath', 'tool_first_native', 'provider_api', 'toolInvocationPath']
      },
      {
        key: 'toolEvents',
        patterns: ['tool_call', 'tool_result', 'tool_error', 'tool_policy_blocked']
      },
      {
        key: 'nativeToolSession',
        patterns: ['nativeToolSession', 'toolSessionMode', 'native_tool_session', 'session_resumed']
      },
      {
        key: 'operatorReceipt',
        patterns: ['backlog_receipt', 'waitingPrompt', 'policy-blocked', 'operator-facing receipt', 'receiptContent']
      }
    ]
  },
  bootstrap_provenance: {
    id: 'bootstrap_provenance',
    relatedDimensions: ['bootstrap_fidelity', 'operator_visible_truth'],
    artifactDefinitions: [
      {
        key: 'promptAssembly',
        patterns: ['promptAssembly', 'continuityCoverage', 'prompt assembly', 'context assembly']
      },
      {
        key: 'bootstrapManifest',
        patterns: ['bootstrapManifest', 'bootstrap manifest', 'projected bootstrap', 'BOOTSTRAP']
      },
      {
        key: 'sourceOrdering',
        patterns: ['source ordering', 'inclusion order', 'sourcePath', 'sourceKind']
      },
      {
        key: 'provenance',
        patterns: ['synthetic', 'provenance', 'file-backed', 'synthetic-vs-file']
      }
    ]
  },
  task_resume_integrity: {
    id: 'task_resume_integrity',
    relatedDimensions: ['task_bound_continuity', 'operator_visible_truth'],
    artifactDefinitions: [
      {
        key: 'continuity',
        patterns: ['continuity', 'task key', 'task-bound', 'resume integrity']
      },
      {
        key: 'wakeupState',
        patterns: ['coalesced_same_owner', 'deferred_issue_lock', 'promoted_after_release', 'wakeup']
      },
      {
        key: 'sessionReuse',
        patterns: ['resumeSource', 'resumedFromRunId', 'session_resumed', 'reuses persisted native tool-session']
      },
      {
        key: 'resumeReceipt',
        patterns: ['resumed task session', 'Run resumed', 'resume from Run Controls', 'resume in Telegram']
      }
    ]
  },
  legacy_fallback_audit: {
    id: 'legacy_fallback_audit',
    relatedDimensions: ['fallback_clarity', 'operator_visible_truth'],
    artifactDefinitions: [
      {
        key: 'fallbackReason',
        patterns: ['fallbackReason', 'fallback reason', 'legacy JSON fallback', 'legacy JSON']
      },
      {
        key: 'legacyJsonDecision',
        patterns: ['legacyJsonSkillCallDecision', 'skill_call', 'legacy-json-skill-call-rubric']
      },
      {
        key: 'operatorReceipt',
        patterns: ['operator-visible truth', 'receipt', 'blocked policy receipts', 'policy-coded event']
      },
      {
        key: 'timeline',
        patterns: ['timeline', 'run.execution_path', 'execution path selected', 'tool_policy_blocked']
      }
    ]
  }
};

const DIMENSION_SCENARIO_MAP: Record<string, string[]> = {
  tool_runtime_nativeness: ['native_tool_session'],
  bootstrap_fidelity: ['bootstrap_provenance'],
  task_bound_continuity: ['task_resume_integrity'],
  fallback_clarity: ['legacy_fallback_audit'],
  operator_visible_truth: [
    'native_tool_session',
    'bootstrap_provenance',
    'task_resume_integrity',
    'legacy_fallback_audit'
  ]
};

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
  '!**/.next/**',
  '--glob',
  '!**/build/**'
];
const IGNORED_DIRECTORY_NAMES = ['node_modules', '.git', 'dist', 'coverage', '.next', 'build'];

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

const buildMissingArtifactEvidence = (
  key: string,
  status: ArtifactStatus
): FrontierComparatorArtifactEvidence => ({
  key,
  status,
  matches: []
});

const evaluateScenario = (input: {
  baseDir: string;
  repoPath: string | null;
  comparator: string;
  comparatorLabel: string;
  scenarioId: string;
  scenarioTitle: string;
}): FrontierComparatorScenarioResult => {
  const definition = SCENARIO_DEFINITIONS[input.scenarioId];
  if (!definition) {
    return {
      comparator: input.comparator,
      comparatorLabel: input.comparatorLabel,
      repoPath: input.repoPath,
      scenarioId: input.scenarioId,
      scenarioTitle: input.scenarioTitle,
      status: 'not_available',
      supportState: input.repoPath ? 'unsupported' : 'missing_repo',
      coverage: 0,
      artifacts: {},
      notes: ['Scenario definition missing from comparator harness.'],
      gaps: ['scenario_definition_missing']
    };
  }

  if (!input.repoPath) {
    return {
      comparator: input.comparator,
      comparatorLabel: input.comparatorLabel,
      repoPath: null,
      scenarioId: input.scenarioId,
      scenarioTitle: input.scenarioTitle,
      status: 'not_available',
      supportState: 'missing_repo',
      coverage: 0,
      artifacts: Object.fromEntries(
        definition.artifactDefinitions.map((artifact) => [artifact.key, buildMissingArtifactEvidence(artifact.key, 'not_available')])
      ),
      notes: [`Comparator repo ${input.comparator} is missing locally.`],
      gaps: ['repo_missing']
    };
  }

  const artifacts: Record<string, FrontierComparatorArtifactEvidence> = {};
  let presentArtifacts = 0;
  for (const artifact of definition.artifactDefinitions) {
    const matches = findRepoPatternMatches({
      repoPath: input.repoPath,
      patterns: artifact.patterns,
      maxMatches: MAX_MATCHES_PER_ARTIFACT,
      ignoredGlobs: IGNORED_GLOBS,
      ignoredDirectoryNames: IGNORED_DIRECTORY_NAMES
    });
    if (matches.length > 0) {
      presentArtifacts += 1;
      artifacts[artifact.key] = {
        key: artifact.key,
        status: 'present',
        matches: matches.map((match) => ({
          file: safeRelativePath(input.baseDir, match.file),
          line: match.line,
          excerpt: match.excerpt
        }))
      };
    } else {
      artifacts[artifact.key] = buildMissingArtifactEvidence(artifact.key, 'missing');
    }
  }

  const coverage = clampUnit(presentArtifacts / Math.max(1, definition.artifactDefinitions.length));
  const allPresent = presentArtifacts === definition.artifactDefinitions.length;
  const nonePresent = presentArtifacts === 0;
  return {
    comparator: input.comparator,
    comparatorLabel: input.comparatorLabel,
    repoPath: safeRelativePath(input.baseDir, input.repoPath),
    scenarioId: input.scenarioId,
    scenarioTitle: input.scenarioTitle,
    status: allPresent ? 'passed' : nonePresent ? 'not_available' : 'partial',
    supportState: nonePresent ? 'unsupported' : 'supported',
    coverage,
    artifacts,
    notes: allPresent ? ['All required evidence artifacts were found.'] : [],
    gaps: definition.artifactDefinitions
      .filter((artifact) => artifacts[artifact.key]?.status !== 'present')
      .map((artifact) => artifact.key)
  };
};

const averageScenarioCoverage = (
  results: FrontierComparatorScenarioResult[],
  scenarioIds: string[]
): number | null => {
  const matching = results.filter((result) => scenarioIds.includes(result.scenarioId));
  if (matching.length === 0) {
    return null;
  }
  if (matching.every((result) => result.status === 'not_available' && result.supportState === 'missing_repo')) {
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

export const runFrontierComparatorHarness = (input: {
  baseDir?: string;
  scorecard: FrontierScorecard;
}): FrontierComparatorRun => {
  const baseDir = path.resolve(input.baseDir ?? process.cwd());
  const comparators: FrontierComparatorRun['comparators'] = {
    elyze: {
      label: 'ElyzeLabs',
      availability: 'available',
      discoveredPath: safeRelativePath(baseDir, baseDir),
      required: true
    }
  };
  for (const [key, comparator] of Object.entries(input.scorecard.comparators)) {
    comparators[key] = {
      label: comparator.label,
      availability: comparator.availability,
      discoveredPath: comparator.discoveredPath ? safeRelativePath(baseDir, comparator.discoveredPath) : null,
      required: comparator.required
    };
  }

  const comparatorRepoPath = (comparatorId: string): string | null => {
    if (comparatorId === 'elyze') {
      return baseDir;
    }
    const record = input.scorecard.comparators[comparatorId];
    return record?.availability === 'available' ? record.discoveredPath : null;
  };

  const comparatorLabel = (comparatorId: string): string =>
    comparatorId === 'elyze' ? 'ElyzeLabs' : input.scorecard.comparators[comparatorId]?.label ?? comparatorId;

  const scenarioResults: FrontierComparatorScenarioResult[] = [];
  for (const scenario of input.scorecard.scenarios) {
    for (const comparatorId of scenario.comparators) {
      scenarioResults.push(
        evaluateScenario({
          baseDir,
          repoPath: comparatorRepoPath(comparatorId),
          comparator: comparatorId,
          comparatorLabel: comparatorLabel(comparatorId),
          scenarioId: scenario.id,
          scenarioTitle: scenario.title
        })
      );
    }
  }

  const comparatorIds = Array.from(new Set(['elyze', ...Object.keys(input.scorecard.comparators)]));
  const dimensionScores: FrontierComparatorRun['dimensionScores'] = {};
  for (const comparatorId of comparatorIds) {
    const comparatorResults = scenarioResults.filter((result) => result.comparator === comparatorId);
    dimensionScores[comparatorId] = {};
    for (const dimension of Object.keys(input.scorecard.dimensions)) {
      const scenarioIds = DIMENSION_SCENARIO_MAP[dimension] ?? [];
      dimensionScores[comparatorId][dimension] = averageScenarioCoverage(comparatorResults, scenarioIds);
    }
  }

  const scoreDeltas: FrontierComparatorDelta[] = [];
  for (const comparatorId of comparatorIds) {
    for (const [dimension, config] of Object.entries(input.scorecard.dimensions)) {
      const score = dimensionScores[comparatorId]?.[dimension] ?? null;
      const scenarioIds = DIMENSION_SCENARIO_MAP[dimension] ?? [];
      if (score === null) {
        scoreDeltas.push({
          comparator: comparatorId,
          dimension,
          score: null,
          threshold: config.threshold,
          deltaToThreshold: null,
          status: 'not_available',
          scenarioIds
        });
        continue;
      }
      const deltaToThreshold = Number((score - config.threshold).toFixed(3));
      scoreDeltas.push({
        comparator: comparatorId,
        dimension,
        score,
        threshold: config.threshold,
        deltaToThreshold,
        status: score >= config.threshold ? 'meets' : 'below_threshold',
        scenarioIds
      });
    }
  }

  const roadmapNotes = scoreDeltas
    .filter((delta) => delta.dimension in DIMENSION_SCENARIO_MAP)
    .map((delta) => ({
      comparator: delta.comparator,
      dimension: delta.dimension,
      status: delta.status,
      note:
        delta.status === 'meets'
          ? `${comparatorLabel(delta.comparator)} meets the ${delta.dimension} threshold.`
          : delta.status === 'not_available'
            ? `${comparatorLabel(delta.comparator)} is not available for ${delta.dimension}; keep the gap explicit in roadmap notes.`
            : `${comparatorLabel(delta.comparator)} trails the ${delta.dimension} threshold by ${Math.abs(delta.deltaToThreshold ?? 0).toFixed(3)}.`
    }));

  return {
    schema: 'ops.frontier-comparator-run.v1',
    version: 1,
    generatedAt: utcNow(),
    baseDir,
    scorecardVersion: input.scorecard.version,
    comparators,
    scenarioResults,
    matrix: scenarioResults.map((result) => ({
      comparator: result.comparator,
      scenarioId: result.scenarioId,
      status: result.status,
      coverage: result.coverage,
      repoPath: result.repoPath
    })),
    dimensionScores,
    scoreDeltas,
    roadmapNotes
  };
};

export const buildFrontierComparatorClosure = (input: {
  scorecard: FrontierScorecard;
  run: FrontierComparatorRun;
}): FrontierComparatorClosure => {
  const missingReferences = Object.entries(input.run.comparators)
    .filter(([, comparator]) => comparator.availability === 'missing')
    .map(([key, comparator]) => `${comparator.label} (${key})`);

  const elyzeDeltas = input.run.scoreDeltas.filter((delta) => delta.comparator === 'elyze');
  const wins = elyzeDeltas
    .filter((delta) => delta.status === 'meets')
    .map((delta) => `ElyzeLabs meets ${delta.dimension} at ${delta.score?.toFixed(3) ?? 'n/a'}.`);
  const remainingGaps = elyzeDeltas
    .filter((delta) => delta.status === 'below_threshold')
    .map(
      (delta) =>
        `ElyzeLabs still needs ${delta.dimension}: ${delta.score?.toFixed(3) ?? 'n/a'} vs threshold ${delta.threshold.toFixed(3)}.`
    );

  const coreDimensions = [
    'tool_runtime_nativeness',
    'bootstrap_fidelity',
    'task_bound_continuity',
    'fallback_clarity',
    'operator_visible_truth'
  ];
  const coreScores = coreDimensions.map((dimension) =>
    elyzeDeltas.find((delta) => delta.dimension === dimension)
  );
  const meetsAllCore = coreScores.every((delta) => delta?.status === 'meets');
  const meetsMostCore = coreScores.filter((delta) => delta?.status === 'meets').length >= 3;
  const elyzeScenarioResults = input.run.scenarioResults.filter((result) => result.comparator === 'elyze');
  const allCoreScenariosPassed = elyzeScenarioResults.every((result) => result.status === 'passed');

  let mode: FrontierComparatorClosure['legacyJsonDecision']['mode'] = 'retain';
  if (meetsAllCore && allCoreScenariosPassed) {
    mode = 'remove';
  } else if (meetsMostCore) {
    mode = 'shadow';
  }
  const rubric = input.scorecard.legacyJsonSkillCallDecision.modes[mode];
  const rationale =
    mode === 'remove'
      ? [
          'ElyzeLabs meets every architecture-specific threshold in the current comparator rerun.',
          'All ElyzeLabs architecture scenarios produced full evidence coverage, so the legacy JSON loop is no longer carrying release-gated proof.'
        ]
      : mode === 'shadow'
        ? [
            'Native typed tooling now covers most release-gated architecture dimensions.',
            'One or more dimensions still trail target thresholds, so legacy JSON should remain only as an explicit compatibility shadow path.'
          ]
        : [
            'At least one core architecture dimension still falls below threshold.',
            'Removing the legacy JSON fallback would outpace the current comparator evidence and weaken release-gated coverage.'
          ];

  const followUpTasks = elyzeDeltas
    .filter((delta) => delta.status === 'below_threshold')
    .map((delta, index) => ({
      id: `frontier-followup-${index + 1}`,
      description: `Raise ${delta.dimension} above the frontier threshold with comparator-backed evidence.`,
      depends_on: [],
      criteria: [
        `ElyzeLabs ${delta.dimension} score is at or above ${delta.threshold.toFixed(3)} in the next comparator rerun.`,
        'Architecture-specific evidence artifacts are attached to the comparator bundle.',
        'Release gate and roadmap notes consume the updated score delta.'
      ],
      evidence: {
        comparator: delta.comparator,
        dimension: delta.dimension,
        score: delta.score,
        threshold: delta.threshold,
        scenarioIds: delta.scenarioIds
      }
    }));

  return {
    schema: 'ops.frontier-comparator-closure.v1',
    version: 1,
    generatedAt: utcNow(),
    rerunGeneratedAt: input.run.generatedAt,
    summary: {
      wins,
      remainingGaps,
      missingReferences
    },
    legacyJsonDecision: {
      mode,
      rationale,
      evidenceRequirements: rubric.evidenceRequirements
    },
    followUpTasks,
    scoreDeltas: input.run.scoreDeltas
  };
};
