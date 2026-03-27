import fsSync from 'node:fs';
import path from 'node:path';

import { utcNow } from '@ops/shared';

export interface FrontierScorecardDimension {
  threshold: number;
  weight: number;
  label: string;
  comparatorFocus: string[];
  rubric: string;
}

export interface FrontierComparatorReference {
  label: string;
  required: boolean;
  availability: 'available' | 'missing';
  discoveredPath: string | null;
  discoveryCandidates: string[];
}

export interface FrontierScenarioFixture {
  id: string;
  title: string;
  description: string;
  comparators: string[];
  evidenceKeys: string[];
}

export interface FrontierEvidenceBundleSchema {
  schema: 'ops.frontier-comparator-evidence.v1';
  requiredArtifacts: string[];
  requiredFields: string[];
  notes: string[];
}

export interface FrontierLegacyJsonDecisionMode {
  when: string[];
  evidenceRequirements: string[];
}

export interface FrontierLegacyJsonDecisionRubric {
  schema: 'ops.legacy-json-skill-call-rubric.v1';
  modes: {
    retain: FrontierLegacyJsonDecisionMode;
    shadow: FrontierLegacyJsonDecisionMode;
    remove: FrontierLegacyJsonDecisionMode;
  };
}

export interface FrontierScorecard {
  schema: 'ops.frontier-scorecard.v2';
  version: 2;
  dimensions: Record<string, FrontierScorecardDimension>;
  comparators: Record<string, FrontierComparatorReference>;
  scenarios: FrontierScenarioFixture[];
  evidenceBundle: FrontierEvidenceBundleSchema;
  legacyJsonSkillCallDecision: FrontierLegacyJsonDecisionRubric;
  updatedAt: string;
}

type RecordLike = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordLike =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clampUnit = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, numeric));
};

const DEFAULT_DIMENSIONS: Record<string, FrontierScorecardDimension> = {
  capability_accuracy: {
    threshold: 0.9,
    weight: 0.15,
    label: 'Capability Accuracy',
    comparatorFocus: ['paperclip', 'baseline_alpha', 'baseline_beta'],
    rubric: 'Operator-visible capability claims and measured behavior stay aligned.'
  },
  message_quality: {
    threshold: 0.88,
    weight: 0.14,
    label: 'Message Quality',
    comparatorFocus: ['paperclip', 'mission-control'],
    rubric: 'Receipts stay concise, actionable, and evidence-backed across surfaces.'
  },
  parity_consistency: {
    threshold: 0.87,
    weight: 0.1,
    label: 'Parity Consistency',
    comparatorFocus: ['mission-control', 'paperclip'],
    rubric: 'API, CLI, and dashboard agree on the same state and evidence.'
  },
  operator_override_rate: {
    threshold: 0.8,
    weight: 0.08,
    label: 'Operator Override Rate',
    comparatorFocus: ['paperclip'],
    rubric: 'Deterministic control-plane behavior minimizes manual correction.'
  },
  remediation_latency: {
    threshold: 0.85,
    weight: 0.08,
    label: 'Remediation Latency',
    comparatorFocus: ['paperclip', 'symphony'],
    rubric: 'Regressions produce fast, actionable repair signals.'
  },
  tool_runtime_nativeness: {
    threshold: 0.9,
    weight: 0.15,
    label: 'Tool Runtime Nativeness',
    comparatorFocus: ['baseline_alpha', 'baseline_beta'],
    rubric: 'Provider-backed runs prefer native typed tools over prompt-emitted compatibility loops.'
  },
  bootstrap_fidelity: {
    threshold: 0.88,
    weight: 0.11,
    label: 'Bootstrap Fidelity',
    comparatorFocus: ['baseline_alpha', 'baseline_gamma'],
    rubric: 'Bootstrap context is inspectable, ordered, and provenance-aware instead of hidden in prompt glue.'
  },
  task_bound_continuity: {
    threshold: 0.89,
    weight: 0.11,
    label: 'Task-Bound Continuity',
    comparatorFocus: ['paperclip', 'baseline_alpha'],
    rubric: 'Task-key session reuse, restart-safe wakeups, and fresh-session reasons stay explicit.'
  },
  fallback_clarity: {
    threshold: 0.87,
    weight: 0.04,
    label: 'Fallback Clarity',
    comparatorFocus: ['baseline_beta', 'paperclip'],
    rubric: 'Legacy JSON or local-executor fallback stays visibly exceptional with explicit reasons.'
  },
  operator_visible_truth: {
    threshold: 0.9,
    weight: 0.04,
    label: 'Operator-Visible Truth',
    comparatorFocus: ['mission-control', 'paperclip'],
    rubric: 'Operator surfaces explain execution path, continuity state, and fallback truth without log forensics.'
  }
};

const DEFAULT_SCENARIOS: FrontierScenarioFixture[] = [
  {
    id: 'native_tool_session',
    title: 'Native Tool Session Lane',
    description: 'Compare whether provider-backed runs use native typed tools and preserve live tool-event truth.',
    comparators: ['elyze', 'baseline_alpha', 'baseline_beta'],
    evidenceKeys: ['executionPath', 'toolEvents', 'nativeToolSession', 'operatorReceipt']
  },
  {
    id: 'bootstrap_provenance',
    title: 'Bootstrap Provenance',
    description: 'Compare inspectable bootstrap projections, ordering, and file-versus-synthetic provenance.',
    comparators: ['elyze', 'baseline_alpha', 'baseline_gamma'],
    evidenceKeys: ['promptAssembly', 'bootstrapManifest', 'sourceOrdering', 'provenance']
  },
  {
    id: 'task_resume_integrity',
    title: 'Task Resume Integrity',
    description: 'Compare restart-safe session reuse, coalesced wakeups, and fresh-session reasons.',
    comparators: ['elyze', 'paperclip', 'baseline_alpha'],
    evidenceKeys: ['continuity', 'wakeupState', 'sessionReuse', 'resumeReceipt']
  },
  {
    id: 'legacy_fallback_audit',
    title: 'Legacy Fallback Audit',
    description: 'Measure how clearly the stack fences and reports legacy JSON skill-call compatibility behavior.',
    comparators: ['elyze', 'baseline_beta', 'paperclip'],
    evidenceKeys: ['fallbackReason', 'legacyJsonDecision', 'operatorReceipt', 'timeline']
  }
];

const DEFAULT_EVIDENCE_BUNDLE: FrontierEvidenceBundleSchema = {
  schema: 'ops.frontier-comparator-evidence.v1',
  requiredArtifacts: [
    'scorecard',
    'scenario_results',
    'comparator_availability',
    'operator_receipts',
    'execution_path_artifacts'
  ],
  requiredFields: [
    'comparator',
    'scenarioId',
    'surface',
    'status',
    'artifacts',
    'gaps',
    'notes'
  ],
  notes: [
    'Missing comparator repos must be reported as not available, not silently dropped.',
    'Evidence should distinguish native-tool proof, bootstrap proof, and task-resume proof explicitly.'
  ]
};

const DEFAULT_LEGACY_JSON_SKILL_CALL_DECISION: FrontierLegacyJsonDecisionRubric = {
  schema: 'ops.legacy-json-skill-call-rubric.v1',
  modes: {
    retain: {
      when: [
        'Native typed tools are not yet available on critical provider lanes.',
        'Legacy JSON fallback is still the only release-gated path for key operator scenarios.'
      ],
      evidenceRequirements: [
        'Document unsupported native lanes explicitly.',
        'Show that removal would regress release-gated execution coverage.'
      ]
    },
    shadow: {
      when: [
        'Native typed tools cover primary provider lanes, but legacy JSON remains needed for controlled compatibility scenarios.',
        'Fallback reasons and operator-visible truth are already explicit.'
      ],
      evidenceRequirements: [
        'Legacy path is exercised only in explicit compatibility tests.',
        'Scorecard shows native-tool and continuity dimensions meet thresholds.'
      ]
    },
    remove: {
      when: [
        'Native typed tools and explicit local-executor routes cover all release-gated scenarios.',
        'Legacy JSON no longer improves comparator or operator-facing outcomes.'
      ],
      evidenceRequirements: [
        'Comparator rerun shows no dependency on the legacy JSON loop.',
        'Fallback clarity and operator-visible truth remain above threshold after removal.'
      ]
    }
  }
};

const DEFAULT_COMPARATOR_LABELS: Record<string, { label: string; required: boolean }> = {
  baseline_alpha: { label: 'Baseline Alpha', required: true },
  baseline_beta: { label: 'Baseline Beta', required: true },
  paperclip: { label: 'Paperclip', required: true },
  baseline_gamma: { label: 'Baseline Gamma', required: true },
  baseline_delta: { label: 'Baseline Delta', required: false },
  baseline_epsilon: { label: 'Baseline Epsilon', required: false }
};

const buildComparatorDiscoveryCandidates = (baseDir: string, reference: string): string[] => {
  const names = [reference, reference.toLowerCase()];
  const candidates = new Set<string>();
  for (const name of names) {
    candidates.add(path.resolve(baseDir, 'comparators', name));
    candidates.add(path.resolve(baseDir, name));
    candidates.add(path.resolve(baseDir, '..', name));
    candidates.add(path.resolve(baseDir, '..', '..', name));
    candidates.add(path.resolve(baseDir, '..', 'comparators', name));
    candidates.add(path.resolve(baseDir, '..', '..', 'comparators', name));
  }
  return [...candidates];
};

const discoverComparatorReference = (
  baseDir: string,
  reference: string,
  input?: Partial<FrontierComparatorReference>
): FrontierComparatorReference => {
  const defaults = DEFAULT_COMPARATOR_LABELS[reference] ?? {
    label: reference,
    required: false
  };
  const discoveryCandidates =
    Array.isArray(input?.discoveryCandidates) && input.discoveryCandidates.length > 0
      ? input.discoveryCandidates.map((entry) => String(entry))
      : buildComparatorDiscoveryCandidates(baseDir, reference);
  const discoveredPath =
    discoveryCandidates.find((candidate) => {
      try {
        if (!fsSync.existsSync(candidate)) {
          return false;
        }
        const stats = fsSync.statSync(candidate);
        if (!stats.isDirectory()) {
          return false;
        }
        return fsSync.existsSync(path.join(candidate, '.git')) || fsSync.existsSync(path.join(candidate, 'README.md'));
      } catch {
        return false;
      }
    }) ?? null;
  return {
    label: typeof input?.label === 'string' && input.label.trim().length > 0 ? input.label.trim() : defaults.label,
    required: typeof input?.required === 'boolean' ? input.required : defaults.required,
    availability: discoveredPath ? 'available' : 'missing',
    discoveredPath,
    discoveryCandidates
  };
};

const mergeDimension = (
  reference: string,
  input: unknown
): FrontierScorecardDimension => {
  const fallback = DEFAULT_DIMENSIONS[reference] ?? {
    threshold: 0.85,
    weight: 0.1,
    label: reference,
    comparatorFocus: [],
    rubric: ''
  };
  if (!isRecord(input)) {
    return fallback;
  }
  return {
    threshold: clampUnit(input.threshold, fallback.threshold),
    weight: clampUnit(input.weight, fallback.weight),
    label: typeof input.label === 'string' && input.label.trim().length > 0 ? input.label.trim() : fallback.label,
    comparatorFocus: Array.isArray(input.comparatorFocus)
      ? input.comparatorFocus.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)
      : fallback.comparatorFocus,
    rubric: typeof input.rubric === 'string' && input.rubric.trim().length > 0 ? input.rubric.trim() : fallback.rubric
  };
};

export const createDefaultFrontierScorecard = (baseDir = process.cwd()): FrontierScorecard => {
  const comparators = Object.fromEntries(
    Object.keys(DEFAULT_COMPARATOR_LABELS).map((reference) => [
      reference,
      discoverComparatorReference(baseDir, reference)
    ])
  ) as FrontierScorecard['comparators'];
  return {
    schema: 'ops.frontier-scorecard.v2',
    version: 2,
    dimensions: DEFAULT_DIMENSIONS,
    comparators,
    scenarios: DEFAULT_SCENARIOS,
    evidenceBundle: DEFAULT_EVIDENCE_BUNDLE,
    legacyJsonSkillCallDecision: DEFAULT_LEGACY_JSON_SKILL_CALL_DECISION,
    updatedAt: utcNow()
  };
};

export const mergeFrontierScorecardSnapshot = (
  snapshot: RecordLike | null | undefined,
  baseDir = process.cwd()
): FrontierScorecard => {
  const fallback = createDefaultFrontierScorecard(baseDir);
  if (!snapshot) {
    return fallback;
  }

  const dimensionsRaw = isRecord(snapshot.dimensions) ? snapshot.dimensions : {};
  const dimensions = Object.fromEntries(
    Object.keys(DEFAULT_DIMENSIONS).map((dimension) => [
      dimension,
      mergeDimension(dimension, dimensionsRaw[dimension])
    ])
  ) as FrontierScorecard['dimensions'];

  const comparatorsRaw = isRecord(snapshot.comparators) ? snapshot.comparators : {};
  const comparators = Object.fromEntries(
    Object.keys(DEFAULT_COMPARATOR_LABELS).map((reference) => [
      reference,
      discoverComparatorReference(
        baseDir,
        reference,
        isRecord(comparatorsRaw[reference]) ? (comparatorsRaw[reference] as Partial<FrontierComparatorReference>) : undefined
      )
    ])
  ) as FrontierScorecard['comparators'];

  const scenarios =
    Array.isArray(snapshot.scenarios) && snapshot.scenarios.length > 0
      ? snapshot.scenarios
          .filter((entry): entry is RecordLike => isRecord(entry))
          .map((entry) => ({
            id: typeof entry.id === 'string' ? entry.id : `scenario-${Math.random().toString(36).slice(2, 8)}`,
            title: typeof entry.title === 'string' ? entry.title : 'Untitled Scenario',
            description: typeof entry.description === 'string' ? entry.description : '',
            comparators: Array.isArray(entry.comparators) ? entry.comparators.map((item) => String(item)) : [],
            evidenceKeys: Array.isArray(entry.evidenceKeys) ? entry.evidenceKeys.map((item) => String(item)) : []
          }))
      : fallback.scenarios;

  const evidenceBundle = isRecord(snapshot.evidenceBundle)
    ? {
        schema: 'ops.frontier-comparator-evidence.v1' as const,
        requiredArtifacts: Array.isArray(snapshot.evidenceBundle.requiredArtifacts)
          ? snapshot.evidenceBundle.requiredArtifacts.map((entry) => String(entry))
          : fallback.evidenceBundle.requiredArtifacts,
        requiredFields: Array.isArray(snapshot.evidenceBundle.requiredFields)
          ? snapshot.evidenceBundle.requiredFields.map((entry) => String(entry))
          : fallback.evidenceBundle.requiredFields,
        notes: Array.isArray(snapshot.evidenceBundle.notes)
          ? snapshot.evidenceBundle.notes.map((entry) => String(entry))
          : fallback.evidenceBundle.notes
      }
    : fallback.evidenceBundle;

  const legacyJsonSkillCallDecision = isRecord(snapshot.legacyJsonSkillCallDecision)
    ? ({
        schema: 'ops.legacy-json-skill-call-rubric.v1' as const,
        modes: {
          retain: isRecord(snapshot.legacyJsonSkillCallDecision.modes) && isRecord(snapshot.legacyJsonSkillCallDecision.modes.retain)
            ? {
                when: Array.isArray(snapshot.legacyJsonSkillCallDecision.modes.retain.when)
                  ? snapshot.legacyJsonSkillCallDecision.modes.retain.when.map((entry) => String(entry))
                  : fallback.legacyJsonSkillCallDecision.modes.retain.when,
                evidenceRequirements: Array.isArray(snapshot.legacyJsonSkillCallDecision.modes.retain.evidenceRequirements)
                  ? snapshot.legacyJsonSkillCallDecision.modes.retain.evidenceRequirements.map((entry) => String(entry))
                  : fallback.legacyJsonSkillCallDecision.modes.retain.evidenceRequirements
              }
            : fallback.legacyJsonSkillCallDecision.modes.retain,
          shadow: isRecord(snapshot.legacyJsonSkillCallDecision.modes) && isRecord(snapshot.legacyJsonSkillCallDecision.modes.shadow)
            ? {
                when: Array.isArray(snapshot.legacyJsonSkillCallDecision.modes.shadow.when)
                  ? snapshot.legacyJsonSkillCallDecision.modes.shadow.when.map((entry) => String(entry))
                  : fallback.legacyJsonSkillCallDecision.modes.shadow.when,
                evidenceRequirements: Array.isArray(snapshot.legacyJsonSkillCallDecision.modes.shadow.evidenceRequirements)
                  ? snapshot.legacyJsonSkillCallDecision.modes.shadow.evidenceRequirements.map((entry) => String(entry))
                  : fallback.legacyJsonSkillCallDecision.modes.shadow.evidenceRequirements
              }
            : fallback.legacyJsonSkillCallDecision.modes.shadow,
          remove: isRecord(snapshot.legacyJsonSkillCallDecision.modes) && isRecord(snapshot.legacyJsonSkillCallDecision.modes.remove)
            ? {
                when: Array.isArray(snapshot.legacyJsonSkillCallDecision.modes.remove.when)
                  ? snapshot.legacyJsonSkillCallDecision.modes.remove.when.map((entry) => String(entry))
                  : fallback.legacyJsonSkillCallDecision.modes.remove.when,
                evidenceRequirements: Array.isArray(snapshot.legacyJsonSkillCallDecision.modes.remove.evidenceRequirements)
                  ? snapshot.legacyJsonSkillCallDecision.modes.remove.evidenceRequirements.map((entry) => String(entry))
                  : fallback.legacyJsonSkillCallDecision.modes.remove.evidenceRequirements
              }
            : fallback.legacyJsonSkillCallDecision.modes.remove
        }
      })
    : fallback.legacyJsonSkillCallDecision;

  return {
    schema: 'ops.frontier-scorecard.v2',
    version: 2,
    dimensions,
    comparators,
    scenarios,
    evidenceBundle,
    legacyJsonSkillCallDecision,
    updatedAt: typeof snapshot.updatedAt === 'string' ? snapshot.updatedAt : fallback.updatedAt
  };
};
