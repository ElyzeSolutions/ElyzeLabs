export type CertificationRuntimeKind = 'codex' | 'claude' | 'gemini' | 'process';
export type CertificationScenarioStatus = 'passed' | 'failed' | 'skipped' | 'blocked';
export type CertificationComparatorStatus = 'met' | 'partial' | 'unmet';

export interface CertificationFollowUpTask {
  id: string;
  title: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  comparator?: string | null;
}

export interface RuntimeCertificationDoctorRuntime {
  runtime: CertificationRuntimeKind;
  command: string | null;
  version: string | null;
  installed: boolean;
  authenticated: boolean | null;
  status: 'ready' | 'blocked' | 'missing';
  reason: string | null;
}

export interface RuntimeCertificationScenarioResult {
  scenario: string;
  lane: 'shim' | 'live';
  runtime: CertificationRuntimeKind;
  status: CertificationScenarioStatus;
  reasoningRuntime: CertificationRuntimeKind | null;
  executorRuntime: CertificationRuntimeKind | null;
  model: string | null;
  provider: string | null;
  sessionId: string | null;
  runId: string | null;
  summary: string;
  evidence: string[];
  details?: Record<string, unknown>;
}

export interface RuntimeCertificationComparatorRow {
  comparator: 'baseline_alpha' | 'mission-control' | 'paperclip';
  claim: string;
  status: CertificationComparatorStatus;
  notes: string[];
}

export interface RuntimeCertificationReport {
  schema: 'ops.runtime-certification.v1';
  version: 1;
  status: 'passed' | 'failed';
  comparedAt: string;
  doctor: {
    runtimes: RuntimeCertificationDoctorRuntime[];
  };
  matrix: RuntimeCertificationScenarioResult[];
  comparators: RuntimeCertificationComparatorRow[];
  followUpTasks: CertificationFollowUpTask[];
  summary: string[];
}

export interface ContinuityCertificationScenarioResult {
  scenario: string;
  surface: 'api' | 'telegram' | 'dashboard';
  status: CertificationScenarioStatus;
  continuityModes: string[];
  scope: 'operator' | 'delegated' | 'system' | null;
  sessionId: string | null;
  runId: string | null;
  summary: string;
  evidence: string[];
  details?: Record<string, unknown>;
}

export interface ContinuityCertificationComparatorRow {
  comparator: 'baseline_alpha' | 'baseline_beta' | 'baseline_gamma' | 'baseline_delta';
  claim: string;
  status: CertificationComparatorStatus;
  notes: string[];
  evidence: string[];
}

export interface ContinuityCertificationReport {
  schema: 'ops.continuity-certification.v1';
  version: 1;
  status: 'passed' | 'failed';
  comparedAt: string;
  matrix: ContinuityCertificationScenarioResult[];
  comparators: ContinuityCertificationComparatorRow[];
  followUpTasks: CertificationFollowUpTask[];
  summary: string[];
  artifacts: Record<string, unknown>;
}

export interface ArchitectureCertificationScenarioResult {
  claim: string;
  wakeSource: 'inbound' | 'heartbeat' | 'cron' | 'system_event' | 'restart';
  status: CertificationScenarioStatus;
  sessionId: string | null;
  runId: string | null;
  summary: string;
  evidence: string[];
  details?: Record<string, unknown>;
}

export interface ArchitectureCertificationComparatorRow {
  comparator: 'baseline_alpha' | 'mission-control' | 'paperclip';
  claim: string;
  status: CertificationComparatorStatus;
  notes: string[];
  evidence: string[];
}

export interface ArchitectureCertificationReport {
  schema: 'ops.architecture-certification.v1';
  version: 1;
  status: 'passed' | 'failed';
  comparedAt: string;
  matrix: ArchitectureCertificationScenarioResult[];
  comparators: ArchitectureCertificationComparatorRow[];
  followUpTasks: CertificationFollowUpTask[];
  summary: string[];
  linkedBundles: {
    runtimeCertificationId: string | null;
    continuityCertificationId: string | null;
  };
}
