import type { BrowserExtractionMode, BrowserToolName } from './browser-capability.js';

export {
  type ArchitectureCertificationComparatorRow,
  type ArchitectureCertificationReport,
  type ArchitectureCertificationScenarioResult,
  type CertificationComparatorStatus,
  type CertificationFollowUpTask,
  type CertificationRuntimeKind,
  type CertificationScenarioStatus,
  type ContinuityCertificationComparatorRow,
  type ContinuityCertificationReport,
  type ContinuityCertificationScenarioResult,
  type RuntimeCertificationComparatorRow,
  type RuntimeCertificationDoctorRuntime,
  type RuntimeCertificationReport,
  type RuntimeCertificationScenarioResult
} from './certification.js';

export {
  DEFAULT_BROWSER_CAPABILITY_POLICY,
  SCRAPLING_BROWSER_CAPABILITY_CONTRACT,
  SCRAPLING_BROWSER_TOOLS,
  assessBrowserPolicy,
  planBrowserRoute,
  type BrowserCapabilityPolicy,
  type BrowserExtractionMode,
  type BrowserExtractorId,
  type BrowserHealthState,
  type BrowserIntent,
  type BrowserPolicyAssessment,
  type BrowserPromptInjectionEscalation,
  type BrowserProviderCapabilityContract,
  type BrowserProviderId,
  type BrowserRiskClass,
  type BrowserRoutingDecision,
  type BrowserRoutingInput,
  type BrowserSelectorStrategy,
  type BrowserToolName,
  type BrowserTransportMode
} from './browser-capability.js';

export type RuntimeKind = 'codex' | 'claude' | 'gemini' | 'process';
export type ChannelKind = 'telegram' | 'internal';
export type ChatType = 'direct' | 'group' | 'topic' | 'internal';
export type MessageSource = 'telegram' | 'dashboard' | 'api' | 'agent' | 'system';

export type IntakeDecisionAction =
  | 'answer_direct'
  | 'direct_execute'
  | 'delegate'
  | 'plan_backlog'
  | 'fail_missing_capability';

export interface CapabilityRequirement {
  kind: 'runtime' | 'tool' | 'skill' | 'agent';
  name: string;
  reason: string | null;
  remediation: string | null;
}

export interface IntakeBacklogDirective {
  required: boolean;
  title: string | null;
  description: string | null;
  priority: number | null;
}

export interface IntakeRationalePayload {
  summary: string;
  confidence: number | null;
  notes: string[];
}

export interface IntakeDecisionContract {
  schema: 'ops.intake-decision.v1';
  version: 1;
  action: IntakeDecisionAction;
  backlog: IntakeBacklogDirective;
  targetAgentId: string | null;
  requiredSkills: string[];
  requiredTools: string[];
  missingCapabilities: CapabilityRequirement[];
  rationale: IntakeRationalePayload;
}

export type CommandPlanRiskClass = 'low' | 'medium' | 'high' | 'critical';
export type CommandPlanEnvProfile = 'inherit' | 'minimal' | 'restricted';

export interface CommandExecutionPlanContract {
  schema: 'ops.execution-plan.v1';
  version: 1;
  planId: string;
  correlationId: string;
  argv: string[];
  cwd: string;
  envProfile: CommandPlanEnvProfile;
  timeoutMs: number;
  riskClass: CommandPlanRiskClass;
  requiresApproval: boolean;
  immutableHash: string;
}

export type CommandPolicyBlockedReason =
  | 'blocked_missing_capability'
  | 'blocked_policy'
  | 'blocked_invalid_contract'
  | 'blocked_approval_mismatch';

export interface CommandPolicyResultContract {
  schema: 'ops.policy-result.v1';
  version: 1;
  status: 'allowed' | CommandPolicyBlockedReason;
  reason: string;
  diagnostics: string[];
  missingCapabilities: CapabilityRequirement[];
  planId: string | null;
  correlationId: string | null;
}

export type RunStatus =
  | 'queued'
  | 'accepted'
  | 'running'
  | 'waiting_input'
  | 'completed'
  | 'aborted'
  | 'failed';

export type QueueStatus = 'queued' | 'processing' | 'done' | 'dead_letter';

export interface SessionRecord {
  id: string;
  sessionKey: string;
  channel: ChannelKind;
  chatType: ChatType;
  agentId: string;
  preferredRuntime: RuntimeKind | null;
  preferredModel: string | null;
  preferredReasoningEffort: 'low' | 'medium' | 'high' | 'xhigh' | null;
  state: 'active' | 'paused' | 'closed';
  lastActivityAt: string;
  metadataJson: string;
}

export interface AgentProfileRecord {
  id: string;
  name: string;
  title: string;
  parentAgentId: string | null;
  systemPrompt: string;
  defaultRuntime: RuntimeKind;
  defaultModel: string | null;
  allowedRuntimesJson: string;
  skillsJson: string;
  toolsJson: string;
  metadataJson: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BacklogState =
  | 'idea'
  | 'triage'
  | 'planned'
  | 'in_progress'
  | 'review'
  | 'blocked'
  | 'done'
  | 'archived';

export interface BacklogItemRecord {
  id: string;
  title: string;
  description: string;
  state: BacklogState;
  priority: number;
  labelsJson: string;
  projectId: string | null;
  repoRoot: string | null;
  source: string;
  sourceRef: string | null;
  createdBy: string;
  assignedAgentId: string | null;
  linkedSessionId: string | null;
  linkedRunId: string | null;
  deliveryGroupId: string | null;
  blockedReason: string | null;
  originSessionId: string | null;
  originMessageId: string | null;
  originChannel: string | null;
  originChatId: string | null;
  originTopicId: string | null;
  metadataJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface BacklogTransitionRecord {
  id: string;
  itemId: string;
  fromState: BacklogState | null;
  toState: BacklogState;
  actor: string;
  reason: string;
  metadataJson: string;
  createdAt: string;
}

export interface BacklogDependencyRecord {
  itemId: string;
  dependsOnItemId: string;
  createdAt: string;
}

export interface BacklogOrchestrationControlRecord {
  id: string;
  enabled: boolean;
  paused: boolean;
  maxParallel: number;
  wipLimit: number;
  escalationMode: 'notify' | 'auto_block' | 'manual_only';
  lastTickAt: string | null;
  updatedAt: string;
}

export interface BacklogOrchestrationDecisionRecord {
  id: string;
  itemId: string | null;
  action: string;
  decision: string;
  detailsJson: string;
  createdAt: string;
}

export interface GithubRepoConnectionRecord {
  id: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  authSecretRef: string;
  authMode: 'github_app' | 'pat_fallback';
  appInstallationId: number | null;
  appInstallationAccountLogin: string | null;
  webhookSecretRef: string | null;
  permissionManifestJson: string;
  permissionSnapshotJson: string;
  tokenExpiresAt: string | null;
  lastValidatedAt: string | null;
  lastValidationStatus: 'pending' | 'ok' | 'blocked' | 'error' | null;
  lastValidationError: string | null;
  enabled: boolean;
  policyVersion: string;
  policyHash: string | null;
  policySource: 'control_plane' | 'repo' | 'hybrid';
  policyJson: string;
  metadataJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface GithubWebhookDeliveryRecord {
  id: string;
  deliveryId: string;
  repoConnectionId: string | null;
  event: string;
  owner: string;
  repo: string;
  source: 'webhook' | 'replay' | 'quarantine';
  signatureState: 'verified' | 'missing' | 'invalid' | 'skipped';
  signatureFingerprint: string | null;
  status: 'accepted' | 'duplicate' | 'replayed' | 'quarantined' | 'rejected';
  replayOfDeliveryId: string | null;
  reason: string | null;
  payloadJson: string;
  createdAt: string;
  updatedAt: string;
}

export type GithubDeliveryState =
  | 'branch_prepared'
  | 'draft_pr'
  | 'open_pr'
  | 'review_pending'
  | 'review_changes_requested'
  | 'review_approved'
  | 'checks_pending'
  | 'checks_failed'
  | 'merge_queued'
  | 'ready_to_merge'
  | 'merged'
  | 'closed_unmerged'
  | 'reverted'
  | 'blocked';

export type GithubDeliveryBlockedReason =
  | 'lease_conflict'
  | 'policy_blocked'
  | 'auth_blocked'
  | 'review_required'
  | 'changes_requested'
  | 'checks_failed'
  | 'merge_queue_blocked'
  | 'closed_without_merge'
  | 'reverted_on_remote'
  | 'remote_branch_drift'
  | 'stale_lease'
  | 'orphaned_branch'
  | 'operator_repair_required';

export interface GithubDeliveryLeaseHolder {
  leaseId: string | null;
  scopeKey: string | null;
  status: 'pending' | 'active' | 'stale' | 'released' | 'override_required';
  ownerActor: string | null;
  ownerSessionId: string | null;
  ownerRunId: string | null;
  acquiredAt: string | null;
  lastHeartbeatAt: string | null;
  expiresAt: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
}

export interface GithubDeliveryLeaseSummary {
  schema: 'ops.github-delivery-lease.v1';
  version: 1;
  repo: GithubDeliveryLeaseHolder | null;
  delivery: GithubDeliveryLeaseHolder | null;
  branch: GithubDeliveryLeaseHolder | null;
  pullRequest: GithubDeliveryLeaseHolder | null;
  takeover: {
    policy: 'same_delivery_resume' | 'stale_only' | 'operator_override';
    staleAfterMs: number;
    operatorOverrideRequired: boolean;
  };
}

export interface GithubDeliveryWorktree {
  schema: 'ops.github-worktree.v1';
  version: 1;
  isolationMode: 'git_worktree' | 'isolated_checkout';
  repoRoot: string | null;
  worktreePath: string | null;
  branchName: string | null;
  baseRef: string | null;
  headSha: string | null;
  status: 'provisioning' | 'ready' | 'dirty' | 'cleanup_required' | 'cleaned' | 'orphaned';
  createdAt: string | null;
  cleanedAt: string | null;
}

export interface GithubDeliveryReconcileSummary {
  schema: 'ops.github-reconcile-summary.v1';
  version: 1;
  status: 'not_started' | 'in_sync' | 'drift_detected' | 'repair_required' | 'repair_scheduled' | 'repair_applied';
  sourceOfTruth: 'webhook' | 'reconciler' | 'operator';
  lastReconciledAt: string | null;
  driftReasons: string[];
  pullRequest: {
    state: string | null;
    mergeable: string | null;
    reviewDecision: string | null;
    reviewCount: number;
  };
  checks: {
    status: string | null;
    pendingCount: number;
    failingCount: number;
  };
  branch: {
    headSha: string | null;
    baseSha: string | null;
    diverged: boolean;
    staleEligible: boolean;
  };
  issues: {
    linkedIssueNumbers: number[];
    syncState: 'in_sync' | 'drifted' | 'repair_required';
  };
}

export interface BacklogDeliveryLinkRecord {
  id: string;
  itemId: string;
  repoConnectionId: string | null;
  branchName: string | null;
  commitSha: string | null;
  prNumber: number | null;
  prUrl: string | null;
  status: 'planned' | 'in_progress' | 'review' | 'merged' | 'blocked' | 'closed';
  githubState: GithubDeliveryState | null;
  githubStateReason: string | null;
  githubStateUpdatedAt: string | null;
  checksJson: string;
  metadataJson: string;
  githubLeaseJson: string;
  githubWorktreeJson: string;
  githubReconcileJson: string;
  receiptStatus: 'pending' | 'delivered' | 'retrying' | 'failed' | null;
  receiptAttempts: number;
  receiptLastError: string | null;
  receiptLastAttemptAt: string | null;
  workspaceRoot: string | null;
  workspacePath: string | null;
  outputFilesJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillCatalogOperationRecord {
  id: string;
  action: 'install' | 'remove' | 'resync' | 'catalog_upsert' | 'catalog_remove';
  sourceRef: string | null;
  actor: string;
  status: 'ok' | 'error' | 'blocked';
  summary: string;
  detailsJson: string;
  createdAt: string;
}

export interface RunRecord {
  id: string;
  sessionId: string;
  status: RunStatus;
  runtime: RuntimeKind;
  requestedRuntime: RuntimeKind | null;
  requestedModel: string | null;
  requestedReasoningEffort: 'low' | 'medium' | 'high' | 'xhigh' | null;
  effectiveRuntime: RuntimeKind | null;
  effectiveModel: string | null;
  effectiveReasoningEffort: 'low' | 'medium' | 'high' | 'xhigh' | null;
  triggerSource: string | null;
  supersedesRunId: string | null;
  prompt: string;
  resultSummary: string | null;
  error: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunTerminalSessionRecord {
  runId: string;
  sessionId: string;
  runtime: RuntimeKind;
  mode: 'direct' | 'tmux' | 'api';
  muxSessionId: string | null;
  workspacePath: string | null;
  status: 'active' | 'completed' | 'failed' | 'aborted';
  startedAt: string;
  endedAt: string | null;
  lastOffset: number;
  retentionUntil: string | null;
  metadataJson: string;
}

export interface SessionHarnessBindingRecord {
  sessionId: string;
  runtime: RuntimeKind;
  mode: 'tmux';
  muxSessionId: string;
  workspacePath: string | null;
  status: 'active' | 'detached' | 'terminated';
  createdAt: string;
  updatedAt: string;
  lastAttachedAt: string | null;
  detachedAt: string | null;
  metadataJson: string;
}

export interface RunTerminalChunkRecord {
  id: string;
  runId: string;
  sessionId: string;
  offset: number;
  chunk: string;
  source: 'stdout' | 'stderr' | 'system';
  createdAt: string;
}

export interface QueueItemRecord {
  id: string;
  lane: string;
  sessionId: string;
  runId: string;
  payloadJson: string;
  priority: number;
  attempt: number;
  maxAttempts: number;
  availableAt: string;
  status: QueueStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRecord {
  id: string;
  sessionId: string;
  channel: ChannelKind;
  direction: 'inbound' | 'outbound';
  source: MessageSource;
  sender: string;
  content: string;
  metadataJson: string;
  createdAt: string;
}

export interface ToolRecord {
  name: string;
  source: 'runtime' | 'skill' | 'system' | 'browser';
  installed: boolean;
  enabled: boolean;
  updatedAt: string;
}

export type LlmCostConfidence = 'exact' | 'estimated' | 'unknown';
export type LlmUsageStatus = 'completed' | 'failed' | 'blocked_budget';

export interface LlmUsageEventRecord {
  id: string;
  ts: string;
  dayUtc: string;
  monthUtc: string;
  runId: string | null;
  sessionId: string | null;
  runtime: RuntimeKind;
  provider: string;
  model: string;
  taskType: string;
  attempt: number;
  status: LlmUsageStatus;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  costConfidence: LlmCostConfidence;
  metadataJson: string;
}

export interface LlmLimitsRecord {
  id: string;
  limitsJson: string;
  updatedAt: string;
}

export interface TrajectoryEventRecord {
  id: string;
  sessionId: string;
  runId: string;
  chapter: string;
  eventType: string;
  actor: string;
  toolName: string | null;
  decision: string | null;
  content: string;
  significance: number;
  sourceKind: string;
  sourceRef: string;
  metadataJson: string;
  sequence: number;
  createdAt: string;
}

export interface TrajectoryChapterRecord {
  id: string;
  sessionId: string;
  runId: string;
  chapterKey: string;
  chapterIndex: number;
  summary: string;
  significance: number;
  firstSequence: number;
  lastSequence: number;
  citationsJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrajectorySnapshotRecord {
  id: string;
  sessionId: string;
  runId: string;
  latestSequence: number;
  chapterCount: number;
  summaryJson: string;
  createdAt: string;
}

export interface ContextGraphNodeRecord {
  id: string;
  nodeKey: string;
  kind: string;
  label: string;
  confidence: number;
  metadataJson: string;
  updatedAt: string;
}

export interface ContextGraphEdgeRecord {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  action: string;
  weight: number;
  evidenceJson: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface RemediationSignalRecord {
  id: string;
  source: 'quality_gate' | 'incident' | 'feedback';
  signalKey: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  blastRadius: 'single' | 'lane' | 'multi_lane' | 'global';
  summary: string;
  details: string;
  evidenceJson: string;
  status: 'open' | 'planned' | 'resolved';
  createdAt: string;
  updatedAt: string;
}

export interface RemediationPlanRecord {
  id: string;
  signalId: string;
  priority: number;
  requiresApproval: boolean;
  status: 'planned' | 'approved' | 'blocked' | 'executed' | 'failed';
  title: string;
  actionsJson: string;
  policyJson: string;
  createdAt: string;
  updatedAt: string;
  executedAt: string | null;
}

export interface RemediationOutcomeRecord {
  id: string;
  planId: string;
  signalId: string;
  status: 'success' | 'partial' | 'failed';
  summary: string;
  effectivenessScore: number;
  recurrenceDelta: number;
  metricsJson: string;
  createdAt: string;
}

export interface VaultKeyVersionRecord {
  version: number;
  wrappedKey: string;
  wrapNonce: string;
  wrapAad: string;
  status: 'active' | 'retired' | 'revoked';
  rotatedFrom: number | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface VaultSecretRecord {
  id: string;
  name: string;
  category: string;
  ciphertext: string;
  cipherNonce: string;
  cipherAad: string;
  wrappedKey: string;
  wrappedNonce: string;
  keyVersion: number;
  metadataJson: string;
  createdAt: string;
  updatedAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
}

export interface VaultSecretMetadataRecord {
  id: string;
  name: string;
  category: string;
  keyVersion: number;
  metadataJson: string;
  createdAt: string;
  updatedAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
}

export interface MemoryRecord {
  id: string;
  sessionId: string | null;
  agentId: string;
  source: 'memory_md' | 'daily_log' | 'structured' | 'imported';
  content: string;
  embeddingRef: string | null;
  importance: number;
  createdAt: string;
  metadataJson: string;
}

export interface MemoryEmbeddingRecord {
  id: string;
  memoryItemId: string;
  provider: string;
  model: string;
  dimension: number;
  checksum: string;
  vectorJson: string | null;
  status: 'pending' | 'ready' | 'failed';
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface SkillRecord {
  id: string;
  name: string;
  version: string;
  path: string;
  scopesJson: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PairingRecord {
  id: string;
  channel: ChannelKind;
  senderId: string;
  senderHandle: string;
  status: 'pending' | 'approved' | 'revoked';
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface AuditRecord {
  id: string;
  ts: string;
  actor: string;
  action: string;
  resource: string;
  decision: 'allowed' | 'blocked';
  reason: string;
  detailsJson: string;
  correlationId: string;
}

export interface OfficePresenceRecord {
  id: string;
  agentId: string;
  sessionId: string;
  runId: string | null;
  state: 'active' | 'waiting_input' | 'blocked' | 'permission_needed' | 'offline';
  activityLabel: string | null;
  sequence: number;
  updatedAt: string;
}

export interface OfficeLayoutRecord {
  id: string;
  name: string;
  version: number;
  tilesJson: string;
  furnitureJson: string;
  updatedAt: string;
}

export interface RuntimeEvent {
  id: string;
  sequence: number;
  ts: string;
  kind:
    | 'run.queued'
    | 'run.accepted'
    | 'run.running'
    | 'run.waiting_input'
    | 'run.completed'
    | 'run.aborted'
    | 'run.failed'
    | 'queue.retry'
    | 'queue.dead_letter'
    | 'security.decision'
    | 'presence.updated'
    | 'skill.called'
    | 'skill.denied'
    | 'session.preference.updated'
    | 'tool.policy.updated'
    | 'watchdog.health_change'
    | 'watchdog.recovery_action'
    | 'delivery_group.ready'
    | 'llm.budget.blocked'
    | 'trajectory.captured'
    | 'memory.compacted'
    | 'context_graph.projected'
    | 'remediation.signal.ingested'
    | 'remediation.plan.created'
    | 'remediation.plan.executed'
    | 'vault.status'
    | 'vault.secret.updated'
    | 'vault.secret.revoked'
    | 'terminal.session'
    | 'terminal.chunk'
    | 'terminal.closed'
    | 'system.info';
  lane: string;
  sessionId: string | null;
  runId: string | null;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data: Record<string, unknown>;
}

export interface DeliveryGroupRecord {
  id: string;
  sourceRef: string | null;
  repoConnectionId: string | null;
  targetBranch: string | null;
  status: 'in_progress' | 'ready_to_publish' | 'published';
  metadataJson: string;
  commitSha: string | null;
  prNumber: number | null;
  prUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WatchdogConfigRecord {
  id: string;
  configJson: string;
  updatedAt: string;
}

export interface WatchdogHistoryRecord {
  id: string;
  runId: string;
  status: string;
  detectedPattern: string | null;
  matchedSignature: string | null;
  recommendation: string;
  action: string | null;
  detailsJson: string;
  createdAt: string;
}

export interface WatchdogRecoveryJobRecord {
  id: string;
  rootRunId: string;
  triggerRunId: string;
  replacementRunId: string;
  sessionId: string;
  queueItemId: string | null;
  action: string;
  attempt: number;
  dueAt: string;
  status: 'scheduled' | 'dispatched' | 'cancelled' | 'superseded';
  statusReason: string | null;
  detailsJson: string;
  createdAt: string;
  updatedAt: string;
}

export type BrowserCookieSourceKind =
  | 'raw_cookie_header'
  | 'netscape_cookies_txt'
  | 'manual'
  | 'json_cookie_export'
  | 'browser_profile_import';

export type BrowserSessionProfileVisibility = 'shared' | 'session_only';
export type BrowserLocalProfileKind = 'chrome' | 'firefox';

export interface BrowserCookieJarRecord {
  id: string;
  label: string;
  domainsJson: string;
  sourceKind: BrowserCookieSourceKind;
  cookiesJson: string;
  notes: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserHeaderProfileRecord {
  id: string;
  label: string;
  domainsJson: string;
  headersJson: string;
  notes: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserProxyProfileRecord {
  id: string;
  label: string;
  domainsJson: string;
  proxyJson: string;
  notes: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserStorageStateRecord {
  id: string;
  label: string;
  domainsJson: string;
  storageStateJson: string;
  notes: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserSessionProfileRecord {
  id: string;
  label: string;
  domainsJson: string;
  cookieJarId: string | null;
  headersProfileId: string | null;
  proxyProfileId: string | null;
  storageStateId: string | null;
  useRealChrome: boolean;
  ownerLabel: string | null;
  visibility: BrowserSessionProfileVisibility;
  allowedSessionIdsJson: string;
  siteKey: string | null;
  browserKind: BrowserLocalProfileKind | null;
  browserProfileName: string | null;
  browserProfilePath: string | null;
  locale: string | null;
  countryCode: string | null;
  timezoneId: string | null;
  notes: string | null;
  enabled: boolean;
  lastVerifiedAt: string | null;
  lastVerificationStatus: 'unknown' | 'connected' | 'failed';
  lastVerificationSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserFetchCacheRecord {
  id: string;
  cacheKey: string;
  url: string;
  tool: BrowserToolName;
  extractionMode: BrowserExtractionMode;
  mainContentOnly: boolean;
  artifactPath: string;
  previewText: string;
  summaryJson: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleCadenceKind = 'interval' | 'cron';
export type ScheduleKind = 'builtin' | 'targeted';
export type ScheduleSessionTarget = 'origin_session' | 'dedicated_schedule_session' | 'explicit_session';
export type ScheduleDeliveryTarget = 'origin_session' | 'dedicated_schedule_session' | 'artifact_only' | 'silent_on_heartbeat';
export type ScheduleConcurrencyPolicy = 'skip' | 'queue' | 'replace';
export type ScheduleRunTrigger = 'manual' | 'schedule' | 'repair' | 'request';
export type ScheduleRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped' | 'blocked' | 'cancelled';

export interface ScheduleRecord {
  id: string;
  label: string;
  category: string;
  kind: ScheduleKind;
  cadenceKind: ScheduleCadenceKind;
  cadence: string;
  timezone: string;
  enabled: boolean;
  pausedAt: string | null;
  pausedBy: string | null;
  requestedBy: string | null;
  requestingSessionId: string | null;
  originRefJson: string;
  targetAgentId: string | null;
  sessionTarget: ScheduleSessionTarget;
  deliveryTarget: ScheduleDeliveryTarget;
  deliveryTargetSessionId: string | null;
  prompt: string | null;
  runtime: string | null;
  model: string | null;
  jobMode: string | null;
  approvalProfile: string | null;
  concurrencyPolicy: ScheduleConcurrencyPolicy;
  domainPolicyJson: string;
  rateLimitPolicyJson: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastResultJson: string;
  metadataJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRunHistoryRecord {
  id: string;
  scheduleId: string;
  trigger: ScheduleRunTrigger;
  status: ScheduleRunStatus;
  runId: string | null;
  sessionId: string | null;
  requestedBy: string | null;
  deliveryTarget: ScheduleDeliveryTarget;
  summary: string | null;
  detailsJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRequestPayload {
  id?: string | null;
  label: string;
  category: string;
  cadence: string;
  targetAgentId?: string | null;
  sessionTarget?: ScheduleSessionTarget;
  deliveryTarget?: ScheduleDeliveryTarget;
  deliveryTargetSessionId?: string | null;
  prompt: string;
  runtime?: string | null;
  model?: string | null;
  jobMode?: string | null;
  approvalProfile?: string | null;
  concurrencyPolicy?: ScheduleConcurrencyPolicy;
  requestedBy?: string | null;
  metadata?: Record<string, unknown>;
  originRef?: Record<string, unknown>;
  domainPolicy?: Record<string, unknown>;
  rateLimitPolicy?: Record<string, unknown>;
}

export interface ScheduleRequestContract {
  schema: 'ops.schedule-request.v1';
  version: 1;
  requester: {
    agentId: string;
    sessionId?: string | null;
    originRef?: Record<string, unknown>;
  };
  schedule: ScheduleRequestPayload;
}

export interface CompoundingLearningRecord {
  id: string;
  agentId: string;
  runId: string;
  sessionId: string;
  category: 'success' | 'failure' | 'optimization' | 'pattern';
  insight: string;
  evidence: string;
  significance: number;
  applied: boolean;
  metadataJson: string;
  createdAt: string;
}

export interface ImprovementProposalRecord {
  id: string;
  agentId: string;
  proposedChangesJson: string;
  reasoning: string;
  learningIdsJson: string;
  status: 'pending' | 'approved' | 'rejected';
  operatorNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LocalRuntimeSessionKind = 'codex' | 'claude' | 'gemini';

export interface LocalRuntimeSessionRecord {
  id: string;
  runtime: LocalRuntimeSessionKind;
  projectSlug: string;
  filePath: string;
  model: string;
  branch: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  toolUseCount: number;
  messageCount: number;
  estimatedCostUsd: number;
  active: boolean;
  lastUserPrompt: string | null;
  lastMessageAt: string;
  detailsJson: string;
  updatedAt: string;
}

export interface TelegramMessage {
  updateId: string;
  chatId: string;
  chatType: 'direct' | 'group' | 'topic';
  topicId?: string | null;
  senderId: string;
  senderHandle: string;
  text: string;
  mentionBot: boolean;
  attachments: Array<{ name: string; url: string }>;
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface QueueMetrics {
  queued: number;
  processing: number;
  deadLetter: number;
  retries: number;
  completed: number;
}

export interface IdempotencyDecision {
  created: boolean;
  key: string;
  runId: string;
}

export interface TimelineEvent {
  id: string;
  runId: string;
  sessionId: string;
  ts: string;
  type: string;
  details: string;
  payloadJson: string;
}

export function utcNow(): string {
  return new Date().toISOString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export {
  parseSessionKey,
  resolveSessionKey,
  type ParsedSessionKey,
  type SessionResolverInput,
  type SessionResolverResult
} from './session-key.js';
