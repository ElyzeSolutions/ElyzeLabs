import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';

import type {
  AgentProfileRecord,
  AuditRecord,
  BacklogDeliveryLinkRecord,
  BacklogDependencyRecord,
  BacklogItemRecord,
  BacklogOrchestrationControlRecord,
  BacklogOrchestrationDecisionRecord,
  BacklogState,
  BacklogTransitionRecord,
  BrowserCookieJarRecord,
  BrowserFetchCacheRecord,
  BrowserHeaderProfileRecord,
  BrowserProxyProfileRecord,
  BrowserSessionProfileRecord,
  BrowserStorageStateRecord,
  CompoundingLearningRecord,
  ContextGraphEdgeRecord,
  ContextGraphNodeRecord,
  DeliveryGroupRecord,
  GithubRepoConnectionRecord,
  GithubWebhookDeliveryRecord,
  IdempotencyDecision,
  ImprovementProposalRecord,
  LlmCostConfidence,
  LlmLimitsRecord,
  LlmUsageEventRecord,
  LlmUsageStatus,
  LocalRuntimeSessionKind,
  LocalRuntimeSessionRecord,
  MemoryEmbeddingRecord,
  MemoryRecord,
  MessageRecord,
  OfficeLayoutRecord,
  OfficePresenceRecord,
  PairingRecord,
  QueueItemRecord,
  QueueMetrics,
  QueueStatus,
  RemediationOutcomeRecord,
  RemediationPlanRecord,
  RemediationSignalRecord,
  RunRecord,
  ScheduleRecord,
  ScheduleRunHistoryRecord,
  RunTerminalChunkRecord,
  RunTerminalSessionRecord,
  RunStatus,
  RuntimeEvent,
  SessionRecord,
  SkillRecord,
  SkillCatalogOperationRecord,
  TrajectoryChapterRecord,
  TrajectoryEventRecord,
  TrajectorySnapshotRecord,
  ToolRecord,
  TimelineEvent,
  WatchdogConfigRecord,
  WatchdogHistoryRecord,
  WatchdogRecoveryJobRecord,
  VaultKeyVersionRecord,
  VaultSecretMetadataRecord,
  VaultSecretRecord
} from '@ops/shared';
import { parseJsonSafe, utcNow } from '@ops/shared';

import { migrations } from './migrations.js';

interface ListSessionsInput {
  limit: number;
  offset: number;
  state?: SessionRecord['state'];
  search?: string;
}

interface ListRunsInput {
  limit: number;
  offset: number;
  status?: RunStatus;
  sessionId?: string;
}

interface ListRunsWithTimelinePrefixInput {
  typePrefix: string;
  limit: number;
  offset: number;
  sessionId?: string;
}

interface AgentHistoryClearResult {
  sessions: number;
  runs: number;
  messages: number;
  memoryItems: number;
  officePresence: number;
  realtimeEvents: number;
  llmUsageEvents: number;
}

interface SessionDeleteResult {
  sessions: number;
  runs: number;
  messages: number;
  officePresence: number;
  realtimeEvents: number;
  llmUsageEvents: number;
}

interface MemoryPurgeResult {
  items: number;
  embeddings: number;
}

interface HousekeepingSessionRetentionCutoffs {
  delegate: string;
  dashboard: string;
  agent: string;
  internal: string;
  telegram: string;
  office: string;
  unknown: string;
}

interface HousekeepingPruneInput {
  sessionRetentionCutoffs: HousekeepingSessionRetentionCutoffs;
  protectedSessionKeys?: string[];
  runRetentionCutoff: string;
  terminalRetentionCutoff: string;
  waitingInputStaleCutoff: string;
  messageRetentionCutoff: string;
  realtimeRetentionCutoff: string;
  officePresenceRetentionCutoff: string;
  llmUsageRetentionDayCutoff: string;
  memoryRetentionCutoff: string;
  auditRetentionCutoff: string;
}

interface HousekeepingPruneResult {
  staleWaitingRunsDemoted: number;
  staleLiveRunsDemoted: number;
  sessionsPruned: number;
  runsPrunedFromSessionPrune: number;
  runsPrunedByAge: number;
  terminalSessionsPrunedBySessionPrune: number;
  terminalChunksPrunedBySessionPrune: number;
  terminalSessionsPrunedByAge: number;
  terminalChunksPrunedByAge: number;
  messagesPrunedFromSessionPrune: number;
  messagesPrunedByAge: number;
  realtimePrunedBySessionPrune: number;
  realtimePrunedByRunPrune: number;
  realtimePrunedByAge: number;
  officePresencePrunedBySessionPrune: number;
  officePresencePrunedByAge: number;
  llmUsagePrunedBySessionPrune: number;
  llmUsagePrunedByRunPrune: number;
  llmUsagePrunedByAge: number;
  memoryPrunedBySessionPrune: number;
  memoryPrunedByAge: number;
  auditLogsPrunedByAge: number;
}

interface RunTerminalSessionUpsertInput {
  runId: string;
  sessionId: string;
  runtime: RunTerminalSessionRecord['runtime'];
  mode: RunTerminalSessionRecord['mode'];
  muxSessionId?: string | null;
  workspacePath?: string | null;
  status?: RunTerminalSessionRecord['status'];
  retentionUntil?: string | null;
  metadata?: Record<string, unknown>;
}

interface RunTerminalChunkAppendInput {
  runId: string;
  sessionId: string;
  chunk: string;
  source?: RunTerminalChunkRecord['source'];
}

interface QueueEnqueueInput {
  lane: string;
  sessionId: string;
  runId: string;
  payload: Record<string, unknown>;
  priority: number;
  maxAttempts: number;
  availableAt?: string;
}

interface QueueRetryInput {
  queueItemId: string;
  delayMs: number;
  error: string;
}

interface QueueLeaseInput {
  lane: string;
  limit: number;
  leaseMs: number;
  skipSessionIds: string[];
}

interface MemoryInsertInput {
  sessionId?: string | null;
  agentId: string;
  source: MemoryRecord['source'];
  content: string;
  embeddingRef?: string | null;
  importance?: number;
  metadata?: Record<string, unknown>;
}

interface MemoryEmbeddingUpsertInput {
  memoryItemId: string;
  checksum: string;
  provider: string;
  model: string;
  dimension: number;
  vector?: number[] | null;
  status: MemoryEmbeddingRecord['status'];
  error?: string | null;
  attempts?: number;
}

interface SkillUpsertInput {
  name: string;
  version: string;
  path: string;
  scopes: Record<string, unknown>;
  enabled: boolean;
}

interface ToolUpsertInput {
  name: string;
  source: ToolRecord['source'];
  installed: boolean;
  enabled?: boolean;
}

interface SkillCatalogOperationAppendInput {
  action: SkillCatalogOperationRecord['action'];
  sourceRef?: string | null;
  actor: string;
  status: SkillCatalogOperationRecord['status'];
  summary: string;
  details?: Record<string, unknown>;
}

interface SkillCatalogEntryUpsertInput {
  path: string;
  name?: string | null;
  enabled?: boolean | null;
  requiresApproval?: boolean | null;
  supportsDryRun?: boolean | null;
  tags?: string[];
  allowedCommands?: string[];
  requiredTools?: string[];
}

interface SkillCatalogEntryRecord {
  path: string;
  name: string | null;
  enabled: boolean | null;
  requiresApproval: boolean | null;
  supportsDryRun: boolean | null;
  tags: string[];
  allowedCommands: string[];
  requiredTools: string[];
  createdAt: string;
  updatedAt: string;
}

interface RuntimeConfigOverlayRecord {
  id: string;
  configJson: string;
  updatedAt: string;
}

interface RuntimeStateSnapshotRecord {
  id: string;
  configJson: string;
  updatedAt: string;
}

interface PromptAssemblySegmentRecord {
  id: 'instructions' | 'task' | 'recent_transcript' | 'memory_recall';
  estimatedTokens: number;
  budgetTokens: number;
  included: boolean;
  droppedReason: string | null;
}

interface PromptAssemblySnapshotRecord {
  runId: string;
  sessionId: string;
  contextLimit: number;
  totalEstimatedTokens: number;
  overflowStrategy: string;
  overflowed: boolean;
  continuityCoverageJson: string;
  segmentsJson: string;
  droppedSegmentsJson: string;
  promptPreview: string;
  createdAt: string;
  updatedAt: string;
}

interface ContinuitySignalRecord {
  id: string;
  runId: string | null;
  sessionId: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  code: string;
  summary: string;
  detailsJson: string;
  status: 'open' | 'planned' | 'resolved';
  dedupeKey: string;
  createdAt: string;
  updatedAt: string;
}

interface ContinuityLedgerRecord {
  id: string;
  sessionId: string;
  runId: string | null;
  mode: 'manual_compact' | 'auto_compact' | 'rollover_summary' | 'fresh_session_required';
  reason: string;
  summary: string | null;
  detailsJson: string;
  createdAt: string;
}

interface ExecutionContractRecord {
  id: string;
  runId: string;
  sessionId: string;
  source: string;
  status: 'parsed' | 'invalid' | 'dispatched' | 'completed' | 'partial' | 'failed';
  contractJson: string;
  parseError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExecutionContractDispatchRecord {
  id: string;
  contractId: string;
  runId: string;
  sessionId: string;
  taskId: string;
  action: string;
  targetAgentId: string | null;
  targetSessionId: string | null;
  delegatedRunId: string | null;
  status: 'queued' | 'completed' | 'skipped' | 'blocked' | 'failed';
  reason: string;
  detailsJson: string;
  createdAt: string;
  updatedAt: string;
}

interface OnboardingStateRecord {
  id: string;
  stateJson: string;
  updatedAt: string;
}

interface AgentProfileUpsertInput {
  id?: string;
  name: string;
  title: string;
  parentAgentId?: string | null;
  systemPrompt: string;
  defaultRuntime: AgentProfileRecord['defaultRuntime'];
  defaultModel?: string | null;
  allowedRuntimes?: string[];
  skills?: string[];
  tools?: string[];
  metadata?: Record<string, unknown>;
  enabled?: boolean;
}

interface BacklogItemCreateInput {
  id?: string;
  title: string;
  description?: string;
  state?: BacklogState;
  priority?: number;
  labels?: string[];
  projectId?: string | null;
  repoRoot?: string | null;
  source?: string;
  sourceRef?: string | null;
  createdBy?: string;
  assignedAgentId?: string | null;
  linkedSessionId?: string | null;
  linkedRunId?: string | null;
  deliveryGroupId?: string | null;
  blockedReason?: string | null;
  originSessionId?: string | null;
  originMessageId?: string | null;
  originChannel?: string | null;
  originChatId?: string | null;
  originTopicId?: string | null;
  metadata?: Record<string, unknown>;
}

interface BacklogItemUpdateInput {
  title?: string;
  description?: string;
  priority?: number;
  labels?: string[];
  projectId?: string | null;
  repoRoot?: string | null;
  assignedAgentId?: string | null;
  linkedSessionId?: string | null;
  linkedRunId?: string | null;
  deliveryGroupId?: string | null;
  blockedReason?: string | null;
  originSessionId?: string | null;
  originMessageId?: string | null;
  originChannel?: string | null;
  originChatId?: string | null;
  originTopicId?: string | null;
  metadata?: Record<string, unknown>;
}

interface BacklogTransitionInput {
  itemId: string;
  toState: BacklogState;
  actor: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

interface BacklogListInput {
  states?: BacklogState[];
  search?: string;
  projectId?: string | null;
  repoRoot?: string | null;
  unscopedOnly?: boolean;
  limit?: number;
  offset?: number;
}

interface BacklogScopeSummaryRecord {
  projectId: string | null;
  repoRoot: string | null;
  itemCount: number;
  activeCount: number;
  blockedCount: number;
  latestUpdatedAt: string | null;
}

interface DeliveryGroupCreateInput {
  id?: string;
  sourceRef?: string | null;
  repoConnectionId?: string | null;
  targetBranch?: string | null;
  status?: DeliveryGroupRecord['status'];
  metadata?: Record<string, unknown>;
}

interface DeliveryGroupUpdateInput {
  sourceRef?: string | null;
  repoConnectionId?: string | null;
  targetBranch?: string | null;
  status?: DeliveryGroupRecord['status'];
  metadata?: Record<string, unknown>;
  commitSha?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
}

interface WatchdogHistoryAppendInput {
  runId: string;
  status: string;
  detectedPattern?: string | null;
  matchedSignature?: string | null;
  recommendation: string;
  action?: string | null;
  details?: Record<string, unknown>;
}

interface WatchdogRecoveryJobCreateInput {
  id?: string;
  rootRunId: string;
  triggerRunId: string;
  replacementRunId: string;
  sessionId: string;
  queueItemId?: string | null;
  action: string;
  attempt: number;
  dueAt: string;
  status?: WatchdogRecoveryJobRecord['status'];
  statusReason?: string | null;
  details?: Record<string, unknown>;
}

interface WatchdogRecoveryJobStatusUpdateInput {
  id: string;
  status: WatchdogRecoveryJobRecord['status'];
  statusReason?: string | null;
  queueItemId?: string | null;
  details?: Record<string, unknown>;
}

interface ScheduleJobUpsertInput {
  id: string;
  label: string;
  category: string;
  kind: ScheduleRecord['kind'];
  cadenceKind: ScheduleRecord['cadenceKind'];
  cadence: string;
  timezone?: string;
  enabled?: boolean;
  pausedAt?: string | null;
  pausedBy?: string | null;
  requestedBy?: string | null;
  requestingSessionId?: string | null;
  originRef?: Record<string, unknown>;
  targetAgentId?: string | null;
  sessionTarget?: ScheduleRecord['sessionTarget'];
  deliveryTarget?: ScheduleRecord['deliveryTarget'];
  deliveryTargetSessionId?: string | null;
  prompt?: string | null;
  runtime?: string | null;
  model?: string | null;
  jobMode?: string | null;
  approvalProfile?: string | null;
  concurrencyPolicy?: ScheduleRecord['concurrencyPolicy'];
  domainPolicy?: Record<string, unknown>;
  rateLimitPolicy?: Record<string, unknown>;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  lastStatus?: string | null;
  lastError?: string | null;
  lastResult?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface ScheduleJobUpdateInput {
  label?: string;
  category?: string;
  cadenceKind?: ScheduleRecord['cadenceKind'];
  cadence?: string;
  timezone?: string;
  enabled?: boolean;
  pausedAt?: string | null;
  pausedBy?: string | null;
  requestedBy?: string | null;
  requestingSessionId?: string | null;
  originRef?: Record<string, unknown>;
  targetAgentId?: string | null;
  sessionTarget?: ScheduleRecord['sessionTarget'];
  deliveryTarget?: ScheduleRecord['deliveryTarget'];
  deliveryTargetSessionId?: string | null;
  prompt?: string | null;
  runtime?: string | null;
  model?: string | null;
  jobMode?: string | null;
  approvalProfile?: string | null;
  concurrencyPolicy?: ScheduleRecord['concurrencyPolicy'];
  domainPolicy?: Record<string, unknown>;
  rateLimitPolicy?: Record<string, unknown>;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  lastStatus?: string | null;
  lastError?: string | null;
  lastResult?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface ScheduleJobListInput {
  kinds?: ScheduleRecord['kind'][];
  enabled?: boolean;
  category?: string | null;
  requestedBy?: string | null;
  targetAgentId?: string | null;
  limit?: number;
}

interface ScheduleRunHistoryAppendInput {
  id?: string;
  scheduleId: string;
  trigger: ScheduleRunHistoryRecord['trigger'];
  status: ScheduleRunHistoryRecord['status'];
  runId?: string | null;
  sessionId?: string | null;
  requestedBy?: string | null;
  deliveryTarget: ScheduleRunHistoryRecord['deliveryTarget'];
  summary?: string | null;
  details?: Record<string, unknown>;
}

interface ScheduleRunHistoryUpdateInput {
  id: string;
  status?: ScheduleRunHistoryRecord['status'];
  runId?: string | null;
  sessionId?: string | null;
  requestedBy?: string | null;
  deliveryTarget?: ScheduleRunHistoryRecord['deliveryTarget'];
  summary?: string | null;
  details?: Record<string, unknown>;
}

interface BrowserCookieJarUpsertInput {
  id: string;
  label: string;
  domains: string[];
  sourceKind: BrowserCookieJarRecord['sourceKind'];
  cookies: unknown[];
  notes?: string | null;
  revokedAt?: string | null;
}

interface BrowserHeaderProfileUpsertInput {
  id: string;
  label: string;
  domains: string[];
  headers: Record<string, string>;
  notes?: string | null;
  revokedAt?: string | null;
}

interface BrowserProxyProfileUpsertInput {
  id: string;
  label: string;
  domains: string[];
  proxy: Record<string, unknown>;
  notes?: string | null;
  revokedAt?: string | null;
}

interface BrowserStorageStateUpsertInput {
  id: string;
  label: string;
  domains: string[];
  storageState: Record<string, unknown>;
  notes?: string | null;
  revokedAt?: string | null;
}

interface BrowserSessionProfileUpsertInput {
  id: string;
  label: string;
  domains: string[];
  cookieJarId?: string | null;
  headersProfileId?: string | null;
  proxyProfileId?: string | null;
  storageStateId?: string | null;
  useRealChrome?: boolean;
  ownerLabel?: string | null;
  visibility?: BrowserSessionProfileRecord['visibility'];
  allowedSessionIds?: string[];
  siteKey?: string | null;
  browserKind?: BrowserSessionProfileRecord['browserKind'];
  browserProfileName?: string | null;
  browserProfilePath?: string | null;
  locale?: string | null;
  countryCode?: string | null;
  timezoneId?: string | null;
  notes?: string | null;
  enabled?: boolean;
  lastVerifiedAt?: string | null;
  lastVerificationStatus?: BrowserSessionProfileRecord['lastVerificationStatus'];
  lastVerificationSummary?: string | null;
}

interface BrowserFetchCacheUpsertInput {
  id: string;
  cacheKey: string;
  url: string;
  tool: BrowserFetchCacheRecord['tool'];
  extractionMode: BrowserFetchCacheRecord['extractionMode'];
  mainContentOnly: boolean;
  artifactPath: string;
  previewText: string;
  summary: unknown;
  expiresAt: string;
}

interface QueueStatusSummary {
  count: number;
  oldestCreatedAt: string | null;
  oldestUpdatedAt: string | null;
  newestCreatedAt: string | null;
  newestUpdatedAt: string | null;
}

interface CompoundingLearningCreateInput {
  id?: string;
  agentId: string;
  runId: string;
  sessionId: string;
  category: CompoundingLearningRecord['category'];
  insight: string;
  evidence?: string;
  significance?: number;
  applied?: boolean;
  metadata?: Record<string, unknown>;
}

interface ImprovementProposalCreateInput {
  id?: string;
  agentId: string;
  proposedChanges: Array<Record<string, unknown>>;
  reasoning: string;
  learningIds: string[];
  status?: ImprovementProposalRecord['status'];
  operatorNotes?: string | null;
}

interface LocalRuntimeSessionUpsertInput {
  id: string;
  runtime: LocalRuntimeSessionKind;
  projectSlug: string;
  filePath: string;
  model: string;
  branch?: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  toolUseCount: number;
  messageCount: number;
  estimatedCostUsd: number;
  active: boolean;
  lastUserPrompt?: string | null;
  lastMessageAt: string;
  details?: Record<string, unknown>;
}

interface BacklogOrchestrationControlInput {
  enabled: boolean;
  paused: boolean;
  maxParallel: number;
  wipLimit: number;
  escalationMode: BacklogOrchestrationControlRecord['escalationMode'];
  lastTickAt?: string | null;
}

interface BacklogOrchestrationDecisionInput {
  itemId?: string | null;
  action: string;
  decision: string;
  details?: Record<string, unknown>;
}

interface GithubRepoConnectionUpsertInput {
  id?: string;
  owner: string;
  repo: string;
  defaultBranch?: string;
  authSecretRef: string;
  authMode?: GithubRepoConnectionRecord['authMode'];
  appInstallationId?: number | null;
  appInstallationAccountLogin?: string | null;
  webhookSecretRef?: string | null;
  permissionManifest?: Record<string, unknown>;
  permissionSnapshot?: Record<string, unknown>;
  tokenExpiresAt?: string | null;
  lastValidatedAt?: string | null;
  lastValidationStatus?: GithubRepoConnectionRecord['lastValidationStatus'];
  lastValidationError?: string | null;
  enabled?: boolean;
  policyVersion?: string;
  policyHash?: string | null;
  policySource?: GithubRepoConnectionRecord['policySource'];
  policy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

function normalizeGithubRepoConnectionMetadata(
  metadata: Record<string, unknown> | undefined,
  existingMetadataJson?: string
): Record<string, unknown> {
  const base =
    metadata ?? (existingMetadataJson ? parseJsonSafe<Record<string, unknown>>(existingMetadataJson, {}) : {});
  if (Object.prototype.hasOwnProperty.call(base, 'patFallbackAllowed')) {
    return base;
  }
  return {
    ...base,
    patFallbackAllowed: true
  };
}

interface GithubWebhookDeliveryUpsertInput {
  id?: string;
  deliveryId: string;
  repoConnectionId?: string | null;
  event: string;
  owner: string;
  repo: string;
  source: GithubWebhookDeliveryRecord['source'];
  signatureState: GithubWebhookDeliveryRecord['signatureState'];
  signatureFingerprint?: string | null;
  status: GithubWebhookDeliveryRecord['status'];
  replayOfDeliveryId?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown>;
}

interface BacklogDeliveryLinkUpsertInput {
  itemId: string;
  repoConnectionId?: string | null;
  branchName?: string | null;
  commitSha?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
  status?: BacklogDeliveryLinkRecord['status'];
  githubState?: BacklogDeliveryLinkRecord['githubState'];
  githubStateReason?: string | null;
  githubStateUpdatedAt?: string | null;
  checks?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  githubLease?: Record<string, unknown>;
  githubWorktree?: Record<string, unknown>;
  githubReconcile?: Record<string, unknown>;
  receiptStatus?: BacklogDeliveryLinkRecord['receiptStatus'];
  receiptAttempts?: number;
  receiptLastError?: string | null;
  receiptLastAttemptAt?: string | null;
  workspaceRoot?: string | null;
  workspacePath?: string | null;
  outputFiles?: string[];
}

interface AuditInsertInput {
  actor: string;
  action: string;
  resource: string;
  decision: AuditRecord['decision'];
  reason: string;
  details?: Record<string, unknown>;
  correlationId: string;
}

interface PairingRequestInput {
  channel: PairingRecord['channel'];
  senderId: string;
  senderHandle: string;
}

interface PairingDecisionInput {
  channel: PairingRecord['channel'];
  senderId: string;
  status: Extract<PairingRecord['status'], 'approved' | 'revoked'>;
  decidedBy: string;
}

interface RealtimeEventInsertInput {
  id?: string;
  kind: RuntimeEvent['kind'];
  lane: string;
  sessionId?: string | null;
  runId?: string | null;
  level: RuntimeEvent['level'];
  message: string;
  data?: Record<string, unknown>;
}

interface GateResultInput {
  lane: string;
  status: 'passed' | 'failed';
  summary: string;
  artifacts: Array<{ label: string; path: string }>;
}

interface RemediationInput {
  source: 'quality_gate' | 'incident' | 'feedback';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  details: string;
  evidence: Record<string, unknown>;
}

interface TrajectoryEventInput {
  sessionId: string;
  runId: string;
  chapter: string;
  eventType: string;
  actor: string;
  toolName?: string | null;
  decision?: string | null;
  content: string;
  significance: number;
  sourceKind: string;
  sourceRef: string;
  metadata?: Record<string, unknown>;
}

interface RemediationSignalInput {
  source: 'quality_gate' | 'incident' | 'feedback';
  signalKey: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  blastRadius: 'single' | 'lane' | 'multi_lane' | 'global';
  summary: string;
  details: string;
  evidence: Record<string, unknown>;
}

interface RemediationPlanInput {
  signalId: string;
  priority: number;
  requiresApproval: boolean;
  status: 'planned' | 'approved' | 'blocked' | 'executed' | 'failed';
  title: string;
  actions: Array<Record<string, unknown>>;
  policy: Record<string, unknown>;
}

interface RemediationOutcomeInput {
  planId: string;
  signalId: string;
  status: 'success' | 'partial' | 'failed';
  summary: string;
  effectivenessScore: number;
  recurrenceDelta: number;
  metrics: Record<string, unknown>;
}

interface VaultKeyVersionInput {
  wrappedKey: string;
  wrapNonce: string;
  wrapAad: string;
  status?: VaultKeyVersionRecord['status'];
  rotatedFrom?: number | null;
}

interface VaultSecretUpsertInput {
  name: string;
  category: string;
  ciphertext: string;
  cipherNonce: string;
  cipherAad: string;
  wrappedKey: string;
  wrappedNonce: string;
  keyVersion: number;
  metadata?: Record<string, unknown>;
}

interface LlmUsageInsertInput {
  runId?: string | null;
  sessionId?: string | null;
  runtime: LlmUsageEventRecord['runtime'];
  provider: string;
  model: string;
  taskType: string;
  attempt: number;
  status: LlmUsageStatus;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  costUsd?: number | null;
  costConfidence: LlmCostConfidence;
  metadata?: Record<string, unknown>;
}

export class ControlPlaneDatabase {
  readonly db: Database.Database;

  constructor(readonly sqlitePath: string) {
    const directory = path.dirname(sqlitePath);
    fs.mkdirSync(directory, { recursive: true });

    this.db = new Database(sqlitePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
  }

  close(): void {
    this.db.close();
  }

  migrate(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');

    const insert = this.db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');
    const hasMigration = this.db.prepare('SELECT id FROM schema_migrations WHERE id = ?');

    const transaction = this.db.transaction(() => {
      for (const migration of migrations) {
        const exists = hasMigration.get(migration.id);
        if (exists) {
          continue;
        }
        this.db.exec(migration.sql);
        insert.run(migration.id, utcNow());
      }
    });

    transaction();
  }

  assertSchemaVersion(expectedId: string): void {
    const row = this.db
      .prepare('SELECT id FROM schema_migrations WHERE id = ?')
      .get(expectedId) as { id: string } | undefined;

    if (!row) {
      throw new Error(
        `Database schema version mismatch. Expected migration ${expectedId}. Run migrations before startup.`
      );
    }
  }

  transaction<T>(fn: (store: ControlPlaneDatabase) => T): T {
    const wrapped = this.db.transaction(() => fn(this));
    return wrapped();
  }

  upsertSessionByKey(input: {
    sessionKey: string;
    channel: SessionRecord['channel'];
    chatType: SessionRecord['chatType'];
    agentId: string;
    preferredRuntime?: SessionRecord['preferredRuntime'];
    preferredModel?: SessionRecord['preferredModel'];
    preferredReasoningEffort?: SessionRecord['preferredReasoningEffort'];
    metadata?: Record<string, unknown>;
  }): SessionRecord {
    const existing = this.db
      .prepare('SELECT * FROM sessions WHERE session_key = ?')
      .get(input.sessionKey) as SessionRecord | undefined;

    const now = utcNow();
    if (existing) {
      this.db
        .prepare(
          `UPDATE sessions
           SET agent_id = ?, last_activity_at = ?, metadata_json = ?
           WHERE id = ?`
        )
        .run(input.agentId, now, JSON.stringify(input.metadata ?? {}), existing.id);

      return this.getSessionById(existing.id)!;
    }

    const session: SessionRecord = {
      id: randomUUID(),
      sessionKey: input.sessionKey,
      channel: input.channel,
      chatType: input.chatType,
      agentId: input.agentId,
      preferredRuntime: input.preferredRuntime ?? null,
      preferredModel: input.preferredModel ?? null,
      preferredReasoningEffort: input.preferredReasoningEffort ?? null,
      state: 'active',
      lastActivityAt: now,
      metadataJson: JSON.stringify(input.metadata ?? {})
    };

    this.db
      .prepare(
        `INSERT INTO sessions (
           id, session_key, channel, chat_type, agent_id, preferred_runtime, preferred_model, preferred_reasoning_effort, state, last_activity_at, metadata_json
         ) VALUES (
           @id, @sessionKey, @channel, @chatType, @agentId, @preferredRuntime, @preferredModel, @preferredReasoningEffort, @state, @lastActivityAt, @metadataJson
         )`
      )
      .run(session);

    return session;
  }

  touchSession(sessionId: string): void {
    this.db.prepare('UPDATE sessions SET last_activity_at = ? WHERE id = ?').run(utcNow(), sessionId);
  }

  getSessionById(sessionId: string): SessionRecord | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
      | {
          id: string;
          session_key: string;
          channel: SessionRecord['channel'];
          chat_type: SessionRecord['chatType'];
          agent_id: string;
          preferred_runtime: SessionRecord['preferredRuntime'];
          preferred_model: SessionRecord['preferredModel'];
          preferred_reasoning_effort: SessionRecord['preferredReasoningEffort'];
          state: SessionRecord['state'];
          last_activity_at: string;
          metadata_json: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      sessionKey: row.session_key,
      channel: row.channel,
      chatType: row.chat_type,
      agentId: row.agent_id,
      preferredRuntime: row.preferred_runtime ?? null,
      preferredModel: row.preferred_model ?? null,
      preferredReasoningEffort: row.preferred_reasoning_effort ?? null,
      state: row.state,
      lastActivityAt: row.last_activity_at,
      metadataJson: row.metadata_json
    };
  }

  getSessionByKey(sessionKey: string): SessionRecord | undefined {
    const row = this.db.prepare('SELECT id FROM sessions WHERE session_key = ?').get(sessionKey) as
      | { id: string }
      | undefined;
    return row ? this.getSessionById(row.id) : undefined;
  }

  updateSessionPreferences(input: {
    sessionId: string;
    preferredRuntime?: SessionRecord['preferredRuntime'];
    preferredModel?: SessionRecord['preferredModel'];
    preferredReasoningEffort?: SessionRecord['preferredReasoningEffort'];
  }): SessionRecord {
    const existing = this.getSessionById(input.sessionId);
    if (!existing) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    const nextRuntime = input.preferredRuntime !== undefined ? input.preferredRuntime : existing.preferredRuntime;
    const nextModel = input.preferredModel !== undefined ? input.preferredModel : existing.preferredModel;
    const nextReasoningEffort =
      input.preferredReasoningEffort !== undefined
        ? input.preferredReasoningEffort
        : existing.preferredReasoningEffort;

    this.db
      .prepare(
        `UPDATE sessions
         SET preferred_runtime = ?, preferred_model = ?, preferred_reasoning_effort = ?, last_activity_at = ?
         WHERE id = ?`
      )
      .run(nextRuntime, nextModel, nextReasoningEffort, utcNow(), input.sessionId);

    return this.getSessionById(input.sessionId)!;
  }

  updateSessionMetadata(input: {
    sessionId: string;
    metadata: Record<string, unknown>;
  }): SessionRecord {
    const existing = this.getSessionById(input.sessionId);
    if (!existing) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    this.db
      .prepare(
        `UPDATE sessions
         SET metadata_json = ?, last_activity_at = ?
         WHERE id = ?`
      )
      .run(JSON.stringify(input.metadata ?? {}), utcNow(), input.sessionId);

    return this.getSessionById(input.sessionId)!;
  }

  listSessions(input: ListSessionsInput): { rows: SessionRecord[]; total: number } {
    const where: string[] = [];
    const params: Array<string | number> = [];

    if (input.state) {
      where.push('state = ?');
      params.push(input.state);
    }

    if (input.search) {
      where.push('(session_key LIKE ? OR agent_id LIKE ?)');
      params.push(`%${input.search}%`, `%${input.search}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = this.db
      .prepare(`SELECT COUNT(*) AS count FROM sessions ${whereSql}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT id
         FROM sessions
         ${whereSql}
         ORDER BY last_activity_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, input.limit, input.offset) as Array<{ id: string }>;

    return {
      rows: rows
        .map((row) => this.getSessionById(row.id))
        .filter((row): row is SessionRecord => row !== undefined),
      total: total.count
    };
  }

  listSessionsByAgent(agentId: string): SessionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id
         FROM sessions
         WHERE agent_id = ?
         ORDER BY last_activity_at DESC`
      )
      .all(agentId) as Array<{ id: string }>;

    return rows
      .map((row) => this.getSessionById(row.id))
      .filter((row): row is SessionRecord => row !== undefined);
  }

  upsertAgentProfile(input: AgentProfileUpsertInput): AgentProfileRecord {
    const now = utcNow();
    const existing = input.id ? this.getAgentProfileById(input.id) : this.getAgentProfileByName(input.name);
    const id = existing?.id ?? input.id ?? randomUUID();

    const record = {
      id,
      name: input.name,
      title: input.title,
      parentAgentId: input.parentAgentId ?? null,
      systemPrompt: input.systemPrompt,
      defaultRuntime: input.defaultRuntime,
      defaultModel: input.defaultModel ?? null,
      allowedRuntimesJson: JSON.stringify(input.allowedRuntimes ?? []),
      skillsJson: JSON.stringify(input.skills ?? []),
      toolsJson: JSON.stringify(input.tools ?? []),
      metadataJson: JSON.stringify(input.metadata ?? {}),
      enabled: input.enabled === false ? 0 : 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    if (existing) {
      this.db
        .prepare(
          `UPDATE agent_profiles
           SET name = ?, title = ?, parent_agent_id = ?, system_prompt = ?, default_runtime = ?, default_model = ?,
               allowed_runtimes_json = ?, skills_json = ?, tools_json = ?, metadata_json = ?, enabled = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          record.name,
          record.title,
          record.parentAgentId,
          record.systemPrompt,
          record.defaultRuntime,
          record.defaultModel,
          record.allowedRuntimesJson,
          record.skillsJson,
          record.toolsJson,
          record.metadataJson,
          record.enabled,
          record.updatedAt,
          record.id
        );
    } else {
      this.db
        .prepare(
          `INSERT INTO agent_profiles (
             id, name, title, parent_agent_id, system_prompt, default_runtime, default_model,
             allowed_runtimes_json, skills_json, tools_json, metadata_json, enabled, created_at, updated_at
           ) VALUES (
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           )`
        )
        .run(
          record.id,
          record.name,
          record.title,
          record.parentAgentId,
          record.systemPrompt,
          record.defaultRuntime,
          record.defaultModel,
          record.allowedRuntimesJson,
          record.skillsJson,
          record.toolsJson,
          record.metadataJson,
          record.enabled,
          record.createdAt,
          record.updatedAt
        );
    }

    return this.getAgentProfileById(id)!;
  }

  getAgentProfileById(agentId: string): AgentProfileRecord | undefined {
    const row = this.db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(agentId) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapAgentProfileRow(row) : undefined;
  }

  getAgentProfileByName(name: string): AgentProfileRecord | undefined {
    const row = this.db.prepare('SELECT * FROM agent_profiles WHERE name = ?').get(name) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapAgentProfileRow(row) : undefined;
  }

  listAgentProfiles(includeDisabled = false): AgentProfileRecord[] {
    const rows = includeDisabled
      ? (this.db
          .prepare('SELECT * FROM agent_profiles ORDER BY enabled DESC, updated_at DESC, name ASC')
          .all() as Array<Record<string, unknown>>)
      : (this.db
          .prepare('SELECT * FROM agent_profiles WHERE enabled = 1 ORDER BY updated_at DESC, name ASC')
          .all() as Array<Record<string, unknown>>);

    return rows.map((row) => this.mapAgentProfileRow(row));
  }

  deleteAgentProfile(agentId: string): boolean {
    return this.db.prepare('DELETE FROM agent_profiles WHERE id = ?').run(agentId).changes > 0;
  }

  setAgentProfileEnabled(agentId: string, enabled: boolean): AgentProfileRecord | undefined {
    const updated = this.db
      .prepare('UPDATE agent_profiles SET enabled = ?, updated_at = ? WHERE id = ?')
      .run(enabled ? 1 : 0, utcNow(), agentId);

    if (updated.changes === 0) {
      return undefined;
    }
    return this.getAgentProfileById(agentId);
  }

  clearAgentHistory(agentId: string): AgentHistoryClearResult {
    const sessionIds = this.listSessionsByAgent(agentId).map((session) => session.id);
    const runIds =
      sessionIds.length > 0
        ? (this.db
            .prepare(
              `SELECT id
               FROM runs
               WHERE session_id IN (${sessionIds.map(() => '?').join(', ')})`
            )
            .all(...sessionIds) as Array<{ id: string }>).map((row) => row.id)
        : [];

    const inClause = (column: string, ids: string[]): { sql: string; params: string[] } =>
      ids.length > 0
        ? {
            sql: `${column} IN (${ids.map(() => '?').join(', ')})`,
            params: ids
          }
        : {
            sql: '1 = 0',
            params: []
          };

    const countWhere = (table: string, whereSql: string, params: Array<string | number>): number => {
      const row = this.db
        .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${whereSql}`)
        .get(...params) as { count: number };
      return row.count;
    };

    const sessionFilter = inClause('session_id', sessionIds);
    const runFilter = inClause('run_id', runIds);
    const sessionPrimaryFilter = inClause('id', sessionIds);

    const messages = countWhere('messages', sessionFilter.sql, sessionFilter.params);
    const memoryItems = countWhere(
      'memory_items',
      `(agent_id = ? OR ${sessionFilter.sql})`,
      [agentId, ...sessionFilter.params]
    );
    const llmUsageEvents = countWhere(
      'llm_usage_events',
      `(${sessionFilter.sql} OR ${runFilter.sql})`,
      [...sessionFilter.params, ...runFilter.params]
    );
    const realtimeEvents = countWhere(
      'realtime_events',
      `(${sessionFilter.sql} OR ${runFilter.sql})`,
      [...sessionFilter.params, ...runFilter.params]
    );
    const officePresence = countWhere(
      'office_presence',
      `(agent_id = ? OR ${sessionFilter.sql})`,
      [agentId, ...sessionFilter.params]
    );

    const deleteWhere = (table: string, whereSql: string, params: Array<string | number>): void => {
      this.db.prepare(`DELETE FROM ${table} WHERE ${whereSql}`).run(...params);
    };

    const transaction = this.db.transaction(() => {
      deleteWhere(
        'realtime_events',
        `(${sessionFilter.sql} OR ${runFilter.sql})`,
        [...sessionFilter.params, ...runFilter.params]
      );
      deleteWhere(
        'llm_usage_events',
        `(${sessionFilter.sql} OR ${runFilter.sql})`,
        [...sessionFilter.params, ...runFilter.params]
      );
      deleteWhere(
        'office_presence',
        `(agent_id = ? OR ${sessionFilter.sql})`,
        [agentId, ...sessionFilter.params]
      );
      deleteWhere(
        'memory_items',
        `(agent_id = ? OR ${sessionFilter.sql})`,
        [agentId, ...sessionFilter.params]
      );
      deleteWhere('sessions', sessionPrimaryFilter.sql, sessionPrimaryFilter.params);
    });

    transaction();

    return {
      sessions: sessionIds.length,
      runs: runIds.length,
      messages,
      memoryItems,
      officePresence,
      realtimeEvents,
      llmUsageEvents
    };
  }

  deleteSessionsByIds(sessionIds: string[]): SessionDeleteResult {
    const normalized = Array.from(new Set(sessionIds.map((entry) => entry.trim()).filter((entry) => entry.length > 0)));
    if (normalized.length === 0) {
      return {
        sessions: 0,
        runs: 0,
        messages: 0,
        officePresence: 0,
        realtimeEvents: 0,
        llmUsageEvents: 0
      };
    }

    const inClause = (column: string, ids: string[]): { sql: string; params: string[] } => ({
      sql: `${column} IN (${ids.map(() => '?').join(', ')})`,
      params: ids
    });
    const countWhere = (table: string, whereSql: string, params: Array<string | number>): number => {
      const row = this.db
        .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${whereSql}`)
        .get(...params) as { count: number };
      return row.count;
    };

    const sessionFilter = inClause('session_id', normalized);
    const sessionPrimaryFilter = inClause('id', normalized);
    const runIds = (
      this.db
        .prepare(
          `SELECT id
           FROM runs
           WHERE ${sessionFilter.sql}`
        )
        .all(...sessionFilter.params) as Array<{ id: string }>
    ).map((row) => row.id);
    const runFilter =
      runIds.length > 0
        ? inClause('run_id', runIds)
        : {
            sql: '1 = 0',
            params: [] as string[]
          };

    const runs = runIds.length;
    const messages = countWhere('messages', sessionFilter.sql, sessionFilter.params);
    const officePresence = countWhere('office_presence', sessionFilter.sql, sessionFilter.params);
    const realtimeEvents = countWhere(
      'realtime_events',
      `(${sessionFilter.sql} OR ${runFilter.sql})`,
      [...sessionFilter.params, ...runFilter.params]
    );
    const llmUsageEvents = countWhere(
      'llm_usage_events',
      `(${sessionFilter.sql} OR ${runFilter.sql})`,
      [...sessionFilter.params, ...runFilter.params]
    );

    this.db
      .prepare(`DELETE FROM sessions WHERE ${sessionPrimaryFilter.sql}`)
      .run(...sessionPrimaryFilter.params);

    return {
      sessions: normalized.length,
      runs,
      messages,
      officePresence,
      realtimeEvents,
      llmUsageEvents
    };
  }

  purgeMemory(): MemoryPurgeResult {
    const items = (
      this.db.prepare('SELECT COUNT(*) AS count FROM memory_items').get() as { count: number }
    ).count;
    const embeddings = (
      this.db.prepare('SELECT COUNT(*) AS count FROM memory_embeddings').get() as { count: number }
    ).count;

    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM memory_items').run();
      this.db.prepare('DELETE FROM memory_embeddings').run();
    });

    transaction();

    return {
      items,
      embeddings
    };
  }

  runHousekeepingPrune(input: HousekeepingPruneInput): HousekeepingPruneResult {
    const protectedKeys = new Set(
      (input.protectedSessionKeys ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    );
    const cutoffs = input.sessionRetentionCutoffs;

    const knownAgentIds = new Set(
      (this.db.prepare('SELECT id FROM agent_profiles').all() as Array<{ id: string }>).map((row) => row.id)
    );
    const staleWaitingRunIds = (
      this.db
        .prepare(
          `SELECT id
           FROM runs
           WHERE status = 'waiting_input'
             AND updated_at < ?`
        )
        .all(input.waitingInputStaleCutoff) as Array<{ id: string }>
    ).map((row) => row.id);
    const staleLiveRunIds = (
      this.db
        .prepare(
          `SELECT id
           FROM runs
           WHERE status IN ('queued', 'accepted', 'running')
             AND updated_at < ?`
        )
        .all(input.waitingInputStaleCutoff) as Array<{ id: string }>
    ).map((row) => row.id);
    if (staleWaitingRunIds.length > 0) {
      const staleWaitingPlaceholders = staleWaitingRunIds.map(() => '?').join(', ');
      this.db
        .prepare(
          `UPDATE runs
           SET status = 'failed',
               error = ?,
               ended_at = ?,
               updated_at = ?
           WHERE id IN (${staleWaitingPlaceholders})`
        )
        .run('waiting_input_stale_timeout', utcNow(), utcNow(), ...staleWaitingRunIds);
    }
    if (staleLiveRunIds.length > 0) {
      const staleLivePlaceholders = staleLiveRunIds.map(() => '?').join(', ');
      this.db
        .prepare(
          `UPDATE runs
           SET status = 'failed',
               error = ?,
               ended_at = ?,
               updated_at = ?
           WHERE id IN (${staleLivePlaceholders})`
        )
        .run('live_run_stale_timeout', utcNow(), utcNow(), ...staleLiveRunIds);
    }
    const activeSessionIds = new Set(
      (
        this.db
          .prepare(
            `SELECT DISTINCT session_id
             FROM runs
             WHERE status IN ('queued', 'accepted', 'running', 'waiting_input')`
          )
          .all() as Array<{ session_id: string }>
      ).map((row) => row.session_id)
    );
    const sessions = this.db
      .prepare(
        `SELECT id, session_key, channel, agent_id, last_activity_at
         FROM sessions`
      )
      .all() as Array<{
      id: string;
      session_key: string;
      channel: string;
      agent_id: string;
      last_activity_at: string;
    }>;

    const resolveSessionCutoff = (session: {
      session_key: string;
      channel: string;
    }): string => {
      if (session.channel === 'telegram') {
        return cutoffs.telegram;
      }
      if (session.session_key.startsWith('delegate:')) {
        return cutoffs.delegate;
      }
      if (session.session_key.startsWith('dashboard:')) {
        return cutoffs.dashboard;
      }
      if (session.session_key.startsWith('agent:')) {
        return cutoffs.agent;
      }
      if (session.session_key.startsWith('office:')) {
        return cutoffs.office;
      }
      if (session.channel === 'internal') {
        return cutoffs.internal;
      }
      return cutoffs.unknown;
    };

    const staleSessionIds = sessions
      .filter((session) => {
        if (protectedKeys.has(session.session_key)) {
          return false;
        }
        if (activeSessionIds.has(session.id)) {
          return false;
        }
        if (session.channel === 'internal' && !knownAgentIds.has(session.agent_id)) {
          return true;
        }
        return session.last_activity_at < resolveSessionCutoff(session);
      })
      .map((session) => session.id);

    const inClause = (column: string, values: string[]): { sql: string; params: Array<string | number> } =>
      values.length > 0
        ? {
            sql: `${column} IN (${values.map(() => '?').join(', ')})`,
            params: values
          }
        : {
            sql: '1 = 0',
            params: []
          };

    const countWhere = (table: string, whereSql: string, params: Array<string | number>): number => {
      const row = this.db
        .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${whereSql}`)
        .get(...params) as { count: number };
      return row.count;
    };

    const staleSessionFilter = inClause('session_id', staleSessionIds);
    const staleSessionPrimaryFilter = inClause('id', staleSessionIds);
    const staleRunIds =
      staleSessionIds.length > 0
        ? (
            this.db
              .prepare(
                `SELECT id
                 FROM runs
                 WHERE ${staleSessionFilter.sql}`
              )
              .all(...staleSessionFilter.params) as Array<{ id: string }>
          ).map((row) => row.id)
        : [];
    const staleRunIdSet = new Set(staleRunIds);
    const staleRunFilter = inClause('run_id', staleRunIds);

    const oldTerminalRunIds = (
      this.db
        .prepare(
          `SELECT id
           FROM runs
           WHERE status IN ('completed', 'failed', 'aborted')
             AND updated_at < ?`
        )
        .all(input.runRetentionCutoff) as Array<{ id: string }>
    )
      .map((row) => row.id)
      .filter((runId) => !staleRunIdSet.has(runId));
    const staleOrOldRunIds = new Set([...staleRunIds, ...oldTerminalRunIds]);
    const expiredTerminalRunIds = (
      this.db
        .prepare(
          `SELECT run_id
           FROM run_terminals
           WHERE status IN ('completed', 'failed', 'aborted')
             AND COALESCE(retention_until, ended_at, started_at) < ?`
        )
        .all(input.terminalRetentionCutoff) as Array<{ run_id: string }>
    )
      .map((row) => row.run_id)
      .filter((runId) => !staleOrOldRunIds.has(runId));
    const oldTerminalRunFilter = inClause('run_id', oldTerminalRunIds);
    const oldTerminalRunPrimaryFilter = inClause('id', oldTerminalRunIds);
    const expiredTerminalRunFilter = inClause('run_id', expiredTerminalRunIds);

    const runsPrunedFromSessionPrune = staleRunIds.length;
    const messagesPrunedFromSessionPrune = countWhere('messages', staleSessionFilter.sql, staleSessionFilter.params);
    const memoryPrunedBySessionPrune = countWhere(
      'memory_items',
      staleSessionFilter.sql,
      staleSessionFilter.params
    );
    const terminalChunksPrunedBySessionPrune = countWhere(
      'run_terminal_chunks',
      staleSessionFilter.sql,
      staleSessionFilter.params
    );
    const terminalSessionsPrunedBySessionPrune = countWhere(
      'run_terminals',
      staleSessionFilter.sql,
      staleSessionFilter.params
    );
    const terminalChunksPrunedByAge = countWhere(
      'run_terminal_chunks',
      `(${oldTerminalRunFilter.sql} OR ${expiredTerminalRunFilter.sql})`,
      [...oldTerminalRunFilter.params, ...expiredTerminalRunFilter.params]
    );
    const terminalSessionsPrunedByAge = countWhere(
      'run_terminals',
      `(${oldTerminalRunFilter.sql} OR ${expiredTerminalRunFilter.sql})`,
      [...oldTerminalRunFilter.params, ...expiredTerminalRunFilter.params]
    );

    const transaction = this.db.transaction(() => {
      let llmUsagePrunedBySessionPrune = 0;
      let llmUsagePrunedByRunPrune = 0;
      let llmUsagePrunedByAge = 0;
      let realtimePrunedBySessionPrune = 0;
      let realtimePrunedByRunPrune = 0;
      let realtimePrunedByAge = 0;
      let officePresencePrunedBySessionPrune = 0;
      let officePresencePrunedByAge = 0;
      let messagesPrunedByAge = 0;
      let runsPrunedByAge = 0;
      let memoryPrunedByAge = 0;
      let auditLogsPrunedByAge = 0;

      if (staleSessionIds.length > 0) {
        llmUsagePrunedBySessionPrune = this.db
          .prepare(`DELETE FROM llm_usage_events WHERE ${staleSessionFilter.sql}`)
          .run(...staleSessionFilter.params).changes;
        if (staleRunIds.length > 0) {
          llmUsagePrunedBySessionPrune += this.db
            .prepare(`DELETE FROM llm_usage_events WHERE ${staleRunFilter.sql}`)
            .run(...staleRunFilter.params).changes;
        }

        const realtimeFilterSql = `(${staleSessionFilter.sql} OR ${staleRunFilter.sql})`;
        realtimePrunedBySessionPrune = this.db
          .prepare(`DELETE FROM realtime_events WHERE ${realtimeFilterSql}`)
          .run(...staleSessionFilter.params, ...staleRunFilter.params).changes;

        officePresencePrunedBySessionPrune = this.db
          .prepare(`DELETE FROM office_presence WHERE ${staleSessionFilter.sql}`)
          .run(...staleSessionFilter.params).changes;

        this.db
          .prepare(`DELETE FROM run_terminal_chunks WHERE ${staleSessionFilter.sql}`)
          .run(...staleSessionFilter.params);
        this.db
          .prepare(`DELETE FROM run_terminals WHERE ${staleSessionFilter.sql}`)
          .run(...staleSessionFilter.params);

        this.db
          .prepare(`DELETE FROM memory_items WHERE ${staleSessionFilter.sql}`)
          .run(...staleSessionFilter.params);

        this.db
          .prepare(`DELETE FROM sessions WHERE ${staleSessionPrimaryFilter.sql}`)
          .run(...staleSessionPrimaryFilter.params);
      }

      if (oldTerminalRunIds.length > 0) {
        this.db
          .prepare(`DELETE FROM run_terminal_chunks WHERE ${oldTerminalRunFilter.sql}`)
          .run(...oldTerminalRunFilter.params);
        this.db
          .prepare(`DELETE FROM run_terminals WHERE ${oldTerminalRunFilter.sql}`)
          .run(...oldTerminalRunFilter.params);

        llmUsagePrunedByRunPrune = this.db
          .prepare(`DELETE FROM llm_usage_events WHERE ${oldTerminalRunFilter.sql}`)
          .run(...oldTerminalRunFilter.params).changes;

        realtimePrunedByRunPrune = this.db
          .prepare(`DELETE FROM realtime_events WHERE ${oldTerminalRunFilter.sql}`)
          .run(...oldTerminalRunFilter.params).changes;

        runsPrunedByAge = this.db
          .prepare(`DELETE FROM runs WHERE ${oldTerminalRunPrimaryFilter.sql}`)
          .run(...oldTerminalRunPrimaryFilter.params).changes;
      }

      if (expiredTerminalRunIds.length > 0) {
        this.db
          .prepare(`DELETE FROM run_terminal_chunks WHERE ${expiredTerminalRunFilter.sql}`)
          .run(...expiredTerminalRunFilter.params);
        this.db
          .prepare(`DELETE FROM run_terminals WHERE ${expiredTerminalRunFilter.sql}`)
          .run(...expiredTerminalRunFilter.params);
      }

      messagesPrunedByAge = this.db
        .prepare('DELETE FROM messages WHERE created_at < ?')
        .run(input.messageRetentionCutoff).changes;

      realtimePrunedByAge = this.db
        .prepare('DELETE FROM realtime_events WHERE ts < ?')
        .run(input.realtimeRetentionCutoff).changes;

      officePresencePrunedByAge = this.db
        .prepare('DELETE FROM office_presence WHERE updated_at < ?')
        .run(input.officePresenceRetentionCutoff).changes;

      llmUsagePrunedByAge = this.db
        .prepare('DELETE FROM llm_usage_events WHERE day_utc < ?')
        .run(input.llmUsageRetentionDayCutoff).changes;

      memoryPrunedByAge = this.db
        .prepare('DELETE FROM memory_items WHERE created_at < ?')
        .run(input.memoryRetentionCutoff).changes;

      auditLogsPrunedByAge = this.db
        .prepare('DELETE FROM audit_logs WHERE ts < ?')
        .run(input.auditRetentionCutoff).changes;

      return {
        llmUsagePrunedBySessionPrune,
        llmUsagePrunedByRunPrune,
        llmUsagePrunedByAge,
        realtimePrunedBySessionPrune,
        realtimePrunedByRunPrune,
        realtimePrunedByAge,
        officePresencePrunedBySessionPrune,
        officePresencePrunedByAge,
        messagesPrunedByAge,
        runsPrunedByAge,
        memoryPrunedByAge,
        auditLogsPrunedByAge
      };
    });

    const result = transaction();

    return {
      staleWaitingRunsDemoted: staleWaitingRunIds.length,
      staleLiveRunsDemoted: staleLiveRunIds.length,
      sessionsPruned: staleSessionIds.length,
      runsPrunedFromSessionPrune,
      runsPrunedByAge: result.runsPrunedByAge,
      terminalSessionsPrunedBySessionPrune,
      terminalChunksPrunedBySessionPrune,
      terminalSessionsPrunedByAge,
      terminalChunksPrunedByAge,
      messagesPrunedFromSessionPrune,
      messagesPrunedByAge: result.messagesPrunedByAge,
      realtimePrunedBySessionPrune: result.realtimePrunedBySessionPrune,
      realtimePrunedByRunPrune: result.realtimePrunedByRunPrune,
      realtimePrunedByAge: result.realtimePrunedByAge,
      officePresencePrunedBySessionPrune: result.officePresencePrunedBySessionPrune,
      officePresencePrunedByAge: result.officePresencePrunedByAge,
      llmUsagePrunedBySessionPrune: result.llmUsagePrunedBySessionPrune,
      llmUsagePrunedByRunPrune: result.llmUsagePrunedByRunPrune,
      llmUsagePrunedByAge: result.llmUsagePrunedByAge,
      memoryPrunedBySessionPrune,
      memoryPrunedByAge: result.memoryPrunedByAge,
      auditLogsPrunedByAge: result.auditLogsPrunedByAge
    };
  }

  createRun(input: {
    id?: string;
    sessionId: string;
    runtime: RunRecord['runtime'];
    requestedRuntime?: RunRecord['requestedRuntime'];
    requestedModel?: RunRecord['requestedModel'];
    requestedReasoningEffort?: RunRecord['requestedReasoningEffort'];
    effectiveRuntime?: RunRecord['effectiveRuntime'];
    effectiveModel?: RunRecord['effectiveModel'];
    effectiveReasoningEffort?: RunRecord['effectiveReasoningEffort'];
    triggerSource?: RunRecord['triggerSource'];
    supersedesRunId?: RunRecord['supersedesRunId'];
    prompt: string;
    status?: RunStatus;
  }): RunRecord {
    const now = utcNow();
    const run: RunRecord = {
      id: input.id ?? randomUUID(),
      sessionId: input.sessionId,
      status: input.status ?? 'queued',
      runtime: input.runtime,
      requestedRuntime: input.requestedRuntime ?? input.runtime,
      requestedModel: input.requestedModel ?? null,
      requestedReasoningEffort: input.requestedReasoningEffort ?? null,
      effectiveRuntime: input.effectiveRuntime ?? input.runtime,
      effectiveModel: input.effectiveModel ?? null,
      effectiveReasoningEffort: input.effectiveReasoningEffort ?? null,
      triggerSource: input.triggerSource ?? 'api',
      supersedesRunId: input.supersedesRunId ?? null,
      prompt: input.prompt,
      resultSummary: null,
      error: null,
      startedAt: null,
      endedAt: null,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO runs (
          id, session_id, status, runtime, requested_runtime, requested_model, requested_reasoning_effort, effective_runtime, effective_model, effective_reasoning_effort, trigger_source, supersedes_run_id, prompt, result_summary, error, started_at, ended_at, created_at, updated_at
        ) VALUES (
          @id, @sessionId, @status, @runtime, @requestedRuntime, @requestedModel, @requestedReasoningEffort, @effectiveRuntime, @effectiveModel, @effectiveReasoningEffort, @triggerSource, @supersedesRunId, @prompt, @resultSummary, @error, @startedAt, @endedAt, @createdAt, @updatedAt
        )`
      )
      .run(run);

    this.appendRunEvent({
      runId: run.id,
      sessionId: run.sessionId,
      type: `run.${run.status}`,
      details: `Run ${run.status}`,
      payload: { runtime: run.runtime }
    });

    return run;
  }

  getRunById(runId: string): RunRecord | undefined {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as
      | {
          id: string;
          session_id: string;
          status: RunStatus;
          runtime: RunRecord['runtime'];
          requested_runtime: RunRecord['requestedRuntime'];
          requested_model: RunRecord['requestedModel'];
          requested_reasoning_effort: RunRecord['requestedReasoningEffort'];
          effective_runtime: RunRecord['effectiveRuntime'];
          effective_model: RunRecord['effectiveModel'];
          effective_reasoning_effort: RunRecord['effectiveReasoningEffort'];
          trigger_source: RunRecord['triggerSource'];
          supersedes_run_id: RunRecord['supersedesRunId'];
          prompt: string;
          result_summary: string | null;
          error: string | null;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      status: row.status,
      runtime: row.runtime,
      requestedRuntime: row.requested_runtime ?? null,
      requestedModel: row.requested_model ?? null,
      requestedReasoningEffort: row.requested_reasoning_effort ?? null,
      effectiveRuntime: row.effective_runtime ?? null,
      effectiveModel: row.effective_model ?? null,
      effectiveReasoningEffort: row.effective_reasoning_effort ?? null,
      triggerSource: row.trigger_source ?? null,
      supersedesRunId: row.supersedes_run_id ?? null,
      prompt: row.prompt,
      resultSummary: row.result_summary,
      error: row.error,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  findLatestRunSuperseding(runId: string): RunRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id
         FROM runs
         WHERE supersedes_run_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(runId) as { id: string } | undefined;

    return row ? this.getRunById(row.id) : undefined;
  }

  listRuns(input: ListRunsInput): { rows: RunRecord[]; total: number } {
    const where: string[] = [];
    const params: Array<string | number> = [];

    if (input.status) {
      where.push('status = ?');
      params.push(input.status);
    }

    if (input.sessionId) {
      where.push('session_id = ?');
      params.push(input.sessionId);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) AS count FROM runs ${whereSql}`).get(...params) as { count: number };

    const ids = this.db
      .prepare(
        `SELECT id
         FROM runs
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, input.limit, input.offset) as Array<{ id: string }>;

    return {
      rows: ids
        .map((row) => this.getRunById(row.id))
        .filter((row): row is RunRecord => row !== undefined),
      total: total.count
    };
  }

  listRunsWithTimelinePrefix(input: ListRunsWithTimelinePrefixInput): { rows: RunRecord[]; total: number } {
    const params: Array<string | number> = [`${input.typePrefix}%`];
    const where = ['re.type LIKE ?'];

    if (input.sessionId) {
      where.push('r.session_id = ?');
      params.push(input.sessionId);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const totalRow = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM (
           SELECT re.run_id
           FROM run_events re
           INNER JOIN runs r ON r.id = re.run_id
           ${whereSql}
           GROUP BY re.run_id
         )`
      )
      .get(...params) as { count: number };

    const ids = this.db
      .prepare(
        `SELECT run_id
         FROM (
           SELECT re.run_id AS run_id, MAX(r.created_at) AS created_at
           FROM run_events re
           INNER JOIN runs r ON r.id = re.run_id
           ${whereSql}
           GROUP BY re.run_id
         )
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, input.limit, input.offset) as Array<{ run_id: string }>;

    return {
      rows: ids
        .map((row) => this.getRunById(row.run_id))
        .filter((row): row is RunRecord => row !== undefined),
      total: totalRow.count
    };
  }

  updateRunStatus(input: {
    runId: string;
    status: RunStatus;
    error?: string | null;
    resultSummary?: string | null;
  }): RunRecord {
    const existing = this.getRunById(input.runId);
    if (!existing) {
      throw new Error(`Run not found: ${input.runId}`);
    }

    const now = utcNow();
    const startedAt = existing.startedAt ?? (input.status === 'running' ? now : existing.startedAt);
    const endedAt = ['completed', 'aborted', 'failed'].includes(input.status) ? now : null;
    const nextError = input.error !== undefined ? input.error : existing.error;
    const nextSummary = input.resultSummary !== undefined ? input.resultSummary : existing.resultSummary;

    this.db
      .prepare(
        `UPDATE runs
         SET status = ?, error = ?, result_summary = ?, started_at = ?, ended_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.status,
        nextError,
        nextSummary,
        startedAt,
        endedAt,
        now,
        input.runId
      );

    this.appendRunEvent({
      runId: existing.id,
      sessionId: existing.sessionId,
      type: `run.${input.status}`,
      details: `Run ${input.status}`,
      payload: {
        error: input.error,
        resultSummary: input.resultSummary
      }
    });

    return this.getRunById(input.runId)!;
  }

  updateRunRoute(input: {
    runId: string;
    runtime: RunRecord['runtime'];
    effectiveRuntime?: RunRecord['effectiveRuntime'];
    effectiveModel?: RunRecord['effectiveModel'];
    effectiveReasoningEffort?: RunRecord['effectiveReasoningEffort'];
  }): RunRecord {
    const existing = this.getRunById(input.runId);
    if (!existing) {
      throw new Error(`Run not found: ${input.runId}`);
    }

    this.db
      .prepare(
        `UPDATE runs
         SET runtime = ?, effective_runtime = ?, effective_model = ?, effective_reasoning_effort = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.runtime,
        input.effectiveRuntime ?? input.runtime,
        input.effectiveModel ?? existing.effectiveModel,
        input.effectiveReasoningEffort ?? existing.effectiveReasoningEffort,
        utcNow(),
        input.runId
      );

    return this.getRunById(input.runId)!;
  }

  appendRunEvent(input: {
    runId: string;
    sessionId: string;
    type: string;
    details: string;
    payload?: Record<string, unknown>;
  }): TimelineEvent {
    const event: TimelineEvent = {
      id: randomUUID(),
      runId: input.runId,
      sessionId: input.sessionId,
      ts: utcNow(),
      type: input.type,
      details: input.details,
      payloadJson: JSON.stringify(input.payload ?? {})
    };

    this.db
      .prepare(
        `INSERT INTO run_events (id, run_id, session_id, ts, type, details, payload_json)
         VALUES (@id, @runId, @sessionId, @ts, @type, @details, @payloadJson)`
      )
      .run(event);

    return event;
  }

  listRunTimeline(runId: string): TimelineEvent[] {
    const rows = this.db
      .prepare(
        `SELECT id, run_id, session_id, ts, type, details, payload_json
         FROM run_events
         WHERE run_id = ?
         ORDER BY ts ASC`
      )
      .all(runId) as Array<{
      id: string;
      run_id: string;
      session_id: string;
      ts: string;
      type: string;
      details: string;
      payload_json: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      sessionId: row.session_id,
      ts: row.ts,
      type: row.type,
      details: row.details,
      payloadJson: row.payload_json
    }));
  }

  upsertRunTerminalSession(input: RunTerminalSessionUpsertInput): RunTerminalSessionRecord {
    const now = utcNow();
    const existing = this.getRunTerminalSession(input.runId);
    const record: RunTerminalSessionRecord = {
      runId: input.runId,
      sessionId: input.sessionId,
      runtime: input.runtime,
      mode: input.mode,
      muxSessionId: input.muxSessionId ?? existing?.muxSessionId ?? null,
      workspacePath: input.workspacePath ?? existing?.workspacePath ?? null,
      status: input.status ?? existing?.status ?? 'active',
      startedAt: existing?.startedAt ?? now,
      endedAt: ['completed', 'failed', 'aborted'].includes(input.status ?? '')
        ? now
        : existing?.endedAt ?? null,
      lastOffset: existing?.lastOffset ?? 0,
      retentionUntil: input.retentionUntil ?? existing?.retentionUntil ?? null,
      metadataJson:
        input.metadata !== undefined
          ? JSON.stringify(input.metadata)
          : existing?.metadataJson ?? JSON.stringify({})
    };

    this.db
      .prepare(
        `INSERT INTO run_terminals (
          run_id, session_id, runtime, mode, mux_session_id, workspace_path, status, started_at, ended_at, last_offset, retention_until, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
          session_id = excluded.session_id,
          runtime = excluded.runtime,
          mode = excluded.mode,
          mux_session_id = excluded.mux_session_id,
          workspace_path = excluded.workspace_path,
          status = excluded.status,
          ended_at = excluded.ended_at,
          retention_until = excluded.retention_until,
          metadata_json = excluded.metadata_json`
      )
      .run(
        record.runId,
        record.sessionId,
        record.runtime,
        record.mode,
        record.muxSessionId,
        record.workspacePath,
        record.status,
        record.startedAt,
        record.endedAt,
        record.lastOffset,
        record.retentionUntil,
        record.metadataJson
      );

    return this.getRunTerminalSession(input.runId)!;
  }

  getRunTerminalSession(runId: string): RunTerminalSessionRecord | undefined {
    const row = this.db.prepare('SELECT * FROM run_terminals WHERE run_id = ?').get(runId) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return undefined;
    }
    return this.mapRunTerminalSessionRow(row);
  }

  closeRunTerminalSession(
    runId: string,
    status: RunTerminalSessionRecord['status'],
    retentionUntil?: string | null
  ): RunTerminalSessionRecord | undefined {
    const existing = this.getRunTerminalSession(runId);
    if (!existing) {
      return undefined;
    }
    this.db
      .prepare('UPDATE run_terminals SET status = ?, ended_at = ?, retention_until = ? WHERE run_id = ?')
      .run(status, utcNow(), retentionUntil ?? existing.retentionUntil ?? null, runId);
    return this.getRunTerminalSession(runId);
  }

  appendRunTerminalChunk(input: RunTerminalChunkAppendInput): RunTerminalChunkRecord {
    const session = this.getRunTerminalSession(input.runId);
    if (!session) {
      throw new Error(`Terminal session not found for run ${input.runId}`);
    }

    const source = input.source ?? 'stdout';
    const now = utcNow();
    const nextOffset = session.lastOffset;
    const record: RunTerminalChunkRecord = {
      id: randomUUID(),
      runId: input.runId,
      sessionId: input.sessionId,
      offset: nextOffset,
      chunk: input.chunk,
      source,
      createdAt: now
    };

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO run_terminal_chunks (id, run_id, session_id, offset, chunk, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(record.id, record.runId, record.sessionId, record.offset, record.chunk, record.source, record.createdAt);

      const increment = Buffer.byteLength(record.chunk, 'utf8');
      this.db
        .prepare('UPDATE run_terminals SET last_offset = ?, status = ? WHERE run_id = ?')
        .run(record.offset + increment, 'active', record.runId);
    });
    tx();

    return record;
  }

  listRunTerminalChunks(runId: string, sinceOffset = 0, limit = 500): RunTerminalChunkRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM run_terminal_chunks
         WHERE run_id = ? AND offset >= ?
         ORDER BY offset ASC
         LIMIT ?`
      )
      .all(runId, sinceOffset, limit) as Array<Record<string, unknown>>;

    return rows.map((row) => this.mapRunTerminalChunkRow(row));
  }

  enqueueQueueItem(input: QueueEnqueueInput): QueueItemRecord {
    const now = utcNow();
    const row: QueueItemRecord = {
      id: randomUUID(),
      lane: input.lane,
      sessionId: input.sessionId,
      runId: input.runId,
      payloadJson: JSON.stringify(input.payload),
      priority: input.priority,
      attempt: 0,
      maxAttempts: input.maxAttempts,
      availableAt: input.availableAt ?? now,
      status: 'queued',
      lastError: null,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO queue_items (
           id, lane, session_id, run_id, payload_json, priority, attempt, max_attempts, available_at, status, last_error, created_at, updated_at
         ) VALUES (
           @id, @lane, @sessionId, @runId, @payloadJson, @priority, @attempt, @maxAttempts, @availableAt, @status, @lastError, @createdAt, @updatedAt
         )`
      )
      .run(row);

    return row;
  }

  reserveDueQueueItems(input: QueueLeaseInput): QueueItemRecord[] {
    const now = utcNow();

    const skipClause = input.skipSessionIds.length
      ? `AND session_id NOT IN (${input.skipSessionIds.map(() => '?').join(', ')})`
      : '';

    const rows = this.db
      .prepare(
        `SELECT *
         FROM queue_items
         WHERE status = 'queued'
           AND lane = ?
           AND available_at <= ?
           ${skipClause}
         ORDER BY priority ASC, created_at ASC
         LIMIT ?`
      )
      .all(input.lane, now, ...input.skipSessionIds, input.limit) as Array<Record<string, unknown>>;

    const reserved: QueueItemRecord[] = [];
    const leaseExpiry = new Date(Date.now() + input.leaseMs).toISOString();

    for (const row of rows) {
      const changed = this.db
        .prepare(
          `UPDATE queue_items
           SET status = 'processing', lease_expires_at = ?, updated_at = ?
           WHERE id = ? AND status = 'queued'`
        )
        .run(leaseExpiry, now, row.id as string);

      if (changed.changes > 0) {
        const fresh = this.getQueueItemById(row.id as string);
        if (fresh) {
          reserved.push(fresh);
        }
      }
    }

    return reserved;
  }

  releaseExpiredLeases(): number {
    const now = utcNow();
    const result = this.db
      .prepare(
        `UPDATE queue_items
         SET status = 'queued', lease_expires_at = NULL, updated_at = ?
         WHERE status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?`
      )
      .run(now, now);

    return result.changes;
  }

  getQueueItemById(id: string): QueueItemRecord | undefined {
    const row = this.db.prepare('SELECT * FROM queue_items WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapQueueRow(row) : undefined;
  }

  findLatestQueueItemByRunId(runId: string): QueueItemRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT *
         FROM queue_items
         WHERE run_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(runId) as Record<string, unknown> | undefined;
    return row ? mapQueueRow(row) : undefined;
  }

  releaseQueueItem(queueItemId: string, availableAt = utcNow()): void {
    this.db
      .prepare(
        `UPDATE queue_items
         SET status = 'queued', lease_expires_at = NULL, available_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(availableAt, utcNow(), queueItemId);
  }

  renewQueueLease(queueItemId: string, leaseMs: number): boolean {
    const now = utcNow();
    const leaseExpiry = new Date(Date.now() + leaseMs).toISOString();
    const result = this.db
      .prepare(
        `UPDATE queue_items
         SET lease_expires_at = ?, updated_at = ?
         WHERE id = ? AND status = 'processing'`
      )
      .run(leaseExpiry, now, queueItemId);

    return result.changes > 0;
  }

  markQueueDone(queueItemId: string): void {
    this.db
      .prepare(
        `UPDATE queue_items
         SET status = 'done', updated_at = ?, lease_expires_at = NULL
         WHERE id = ?`
      )
      .run(utcNow(), queueItemId);
  }

  markQueueRetry(input: QueueRetryInput): QueueItemRecord {
    const existing = this.getQueueItemById(input.queueItemId);
    if (!existing) {
      throw new Error(`Queue item not found: ${input.queueItemId}`);
    }

    const nextAttempt = existing.attempt + 1;
    const availableAt = new Date(Date.now() + input.delayMs).toISOString();

    if (nextAttempt >= existing.maxAttempts) {
      this.markQueueDeadLetter(existing.id, input.error);
      return this.getQueueItemById(existing.id)!;
    }

    this.db
      .prepare(
        `UPDATE queue_items
         SET status = 'queued', attempt = ?, available_at = ?, last_error = ?, lease_expires_at = NULL, updated_at = ?
         WHERE id = ?`
      )
      .run(nextAttempt, availableAt, input.error, utcNow(), input.queueItemId);

    return this.getQueueItemById(input.queueItemId)!;
  }

  markQueueDeadLetter(queueItemId: string, error: string): void {
    this.db
      .prepare(
        `UPDATE queue_items
         SET status = 'dead_letter', last_error = ?, lease_expires_at = NULL, updated_at = ?
         WHERE id = ?`
      )
      .run(error, utcNow(), queueItemId);
  }

  deleteQueueItem(queueItemId: string): boolean {
    const result = this.db.prepare('DELETE FROM queue_items WHERE id = ?').run(queueItemId);
    return result.changes > 0;
  }

  listQueueItems(status: QueueStatus, limit = 200): QueueItemRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM queue_items WHERE status = ? ORDER BY created_at DESC LIMIT ?`
      )
      .all(status, limit) as Array<Record<string, unknown>>;

    return rows.map(mapQueueRow);
  }

  queueStatusSummary(status: QueueStatus): QueueStatusSummary {
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) AS count,
           MIN(created_at) AS oldest_created_at,
           MIN(updated_at) AS oldest_updated_at,
           MAX(created_at) AS newest_created_at,
           MAX(updated_at) AS newest_updated_at
         FROM queue_items
         WHERE status = ?`
      )
      .get(status) as {
        count: number;
        oldest_created_at: string | null;
        oldest_updated_at: string | null;
        newest_created_at: string | null;
        newest_updated_at: string | null;
      };
    return {
      count: Number(row.count ?? 0),
      oldestCreatedAt: row.oldest_created_at ?? null,
      oldestUpdatedAt: row.oldest_updated_at ?? null,
      newestCreatedAt: row.newest_created_at ?? null,
      newestUpdatedAt: row.newest_updated_at ?? null
    };
  }

  queueMetrics(): QueueMetrics {
    const counts = this.db
      .prepare(
        `SELECT status, COUNT(*) AS count
         FROM queue_items
         GROUP BY status`
      )
      .all() as Array<{ status: QueueStatus; count: number }>;

    const byStatus = new Map(counts.map((row) => [row.status, row.count]));
    const retries = this.db
      .prepare('SELECT COUNT(*) AS count FROM queue_items WHERE attempt > 0')
      .get() as { count: number };

    return {
      queued: byStatus.get('queued') ?? 0,
      processing: byStatus.get('processing') ?? 0,
      deadLetter: byStatus.get('dead_letter') ?? 0,
      retries: retries.count,
      completed: byStatus.get('done') ?? 0
    };
  }

  saveMessage(input: Omit<MessageRecord, 'id' | 'createdAt'>): MessageRecord {
    const row: MessageRecord = {
      id: randomUUID(),
      createdAt: utcNow(),
      ...input
    };

    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, channel, direction, source, sender, content, metadata_json, created_at)
         VALUES (@id, @sessionId, @channel, @direction, @source, @sender, @content, @metadataJson, @createdAt)`
      )
      .run(row);

    this.touchSession(input.sessionId);
    return row;
  }

  listMessages(sessionId: string, limit = 200): MessageRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`
      )
      .all(sessionId, limit) as Array<{
      id: string;
      session_id: string;
      channel: MessageRecord['channel'];
      direction: MessageRecord['direction'];
      source: MessageRecord['source'];
      sender: string;
      content: string;
      metadata_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      channel: row.channel,
      direction: row.direction,
      source: row.source,
      sender: row.sender,
      content: row.content,
      metadataJson: row.metadata_json,
      createdAt: row.created_at
    }));
  }

  insertMemory(input: MemoryInsertInput): MemoryRecord {
    const row: MemoryRecord = {
      id: randomUUID(),
      sessionId: input.sessionId ?? null,
      agentId: input.agentId,
      source: input.source,
      content: input.content,
      embeddingRef: input.embeddingRef ?? null,
      importance: input.importance ?? 0,
      createdAt: utcNow(),
      metadataJson: JSON.stringify(input.metadata ?? {})
    };

    this.db
      .prepare(
        `INSERT INTO memory_items (id, session_id, agent_id, source, content, embedding_ref, importance, created_at, metadata_json)
         VALUES (@id, @sessionId, @agentId, @source, @content, @embeddingRef, @importance, @createdAt, @metadataJson)`
      )
      .run(row);

    return row;
  }

  upsertMemoryEmbedding(input: MemoryEmbeddingUpsertInput): MemoryEmbeddingRecord {
    const now = utcNow();
    const existing = this.db
      .prepare('SELECT id FROM memory_embeddings WHERE memory_item_id = ?')
      .get(input.memoryItemId) as { id: string } | undefined;

    const record: MemoryEmbeddingRecord = {
      id: existing?.id ?? randomUUID(),
      memoryItemId: input.memoryItemId,
      checksum: input.checksum,
      provider: input.provider,
      model: input.model,
      dimension: Math.max(0, Math.floor(input.dimension)),
      vectorJson:
        input.vector === undefined
          ? existing
            ? this.getMemoryEmbeddingByMemoryItemId(input.memoryItemId)?.vectorJson ?? null
            : null
          : input.vector === null
            ? null
            : JSON.stringify(input.vector),
      status: input.status,
      error: input.error ?? null,
      attempts: Math.max(0, Math.floor(input.attempts ?? 1)),
      createdAt: existing ? this.getMemoryEmbeddingByMemoryItemId(input.memoryItemId)?.createdAt ?? now : now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO memory_embeddings (
          id, memory_item_id, checksum, provider, model, dimension, vector_json, status, error, attempts, created_at, updated_at
        ) VALUES (
          @id, @memoryItemId, @checksum, @provider, @model, @dimension, @vectorJson, @status, @error, @attempts, @createdAt, @updatedAt
        )
        ON CONFLICT(memory_item_id) DO UPDATE SET
          checksum = excluded.checksum,
          provider = excluded.provider,
          model = excluded.model,
          dimension = excluded.dimension,
          vector_json = excluded.vector_json,
          status = excluded.status,
          error = excluded.error,
          attempts = excluded.attempts,
          updated_at = excluded.updated_at`
      )
      .run(record);

    return this.getMemoryEmbeddingByMemoryItemId(input.memoryItemId)!;
  }

  getMemoryEmbeddingByMemoryItemId(memoryItemId: string): MemoryEmbeddingRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM memory_embeddings WHERE memory_item_id = ?')
      .get(memoryItemId) as Record<string, unknown> | undefined;
    return row ? this.mapMemoryEmbeddingRow(row) : undefined;
  }

  findMemoryEmbeddingByChecksum(input: {
    checksum: string;
    provider: string;
    model: string;
  }): MemoryEmbeddingRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT *
         FROM memory_embeddings
         WHERE checksum = ? AND provider = ? AND model = ? AND status = 'ready'
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(input.checksum, input.provider, input.model) as Record<string, unknown> | undefined;
    return row ? this.mapMemoryEmbeddingRow(row) : undefined;
  }

  listMemoryEmbeddingsForAgent(input: {
    agentId: string;
    limit?: number;
    statuses?: MemoryEmbeddingRecord['status'][];
  }): Array<{ item: MemoryRecord; embedding: MemoryEmbeddingRecord }> {
    const limit = Math.max(1, Math.min(2000, input.limit ?? 400));
    const statuses = input.statuses && input.statuses.length > 0 ? input.statuses : [];
    const statusClause = statuses.length > 0 ? `AND e.status IN (${statuses.map(() => '?').join(', ')})` : '';
    const rows = this.db
      .prepare(
        `SELECT
           m.id AS m_id, m.session_id AS m_session_id, m.agent_id AS m_agent_id, m.source AS m_source, m.content AS m_content,
           m.embedding_ref AS m_embedding_ref, m.importance AS m_importance, m.created_at AS m_created_at, m.metadata_json AS m_metadata_json,
           e.id AS e_id, e.memory_item_id AS e_memory_item_id, e.checksum AS e_checksum, e.provider AS e_provider, e.model AS e_model,
           e.dimension AS e_dimension, e.vector_json AS e_vector_json, e.status AS e_status, e.error AS e_error, e.attempts AS e_attempts,
           e.created_at AS e_created_at, e.updated_at AS e_updated_at
         FROM memory_items m
         JOIN memory_embeddings e ON e.memory_item_id = m.id
         WHERE m.agent_id = ?
           ${statusClause}
         ORDER BY m.importance DESC, m.created_at DESC
         LIMIT ?`
      )
      .all(input.agentId, ...statuses, limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      item: {
        id: String(row.m_id),
        sessionId: row.m_session_id === null || row.m_session_id === undefined ? null : String(row.m_session_id),
        agentId: String(row.m_agent_id),
        source: String(row.m_source) as MemoryRecord['source'],
        content: String(row.m_content),
        embeddingRef: row.m_embedding_ref === null || row.m_embedding_ref === undefined ? null : String(row.m_embedding_ref),
        importance: Number(row.m_importance ?? 0),
        createdAt: String(row.m_created_at),
        metadataJson: row.m_metadata_json === null || row.m_metadata_json === undefined ? '{}' : String(row.m_metadata_json)
      },
      embedding: this.mapMemoryEmbeddingRow({
        id: row.e_id,
        memory_item_id: row.e_memory_item_id,
        checksum: row.e_checksum,
        provider: row.e_provider,
        model: row.e_model,
        dimension: row.e_dimension,
        vector_json: row.e_vector_json,
        status: row.e_status,
        error: row.e_error,
        attempts: row.e_attempts,
        created_at: row.e_created_at,
        updated_at: row.e_updated_at
      })
    }));
  }

  listMemoryItemsByAgent(agentId: string, limit = 200): MemoryRecord[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM memory_items
         WHERE agent_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(agentId, Math.max(1, Math.min(2000, limit))) as Array<{
      id: string;
      session_id: string | null;
      agent_id: string;
      source: MemoryRecord['source'];
      content: string;
      embedding_ref: string | null;
      importance: number;
      created_at: string;
      metadata_json: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      agentId: row.agent_id,
      source: row.source,
      content: row.content,
      embeddingRef: row.embedding_ref,
      importance: row.importance,
      createdAt: row.created_at,
      metadataJson: row.metadata_json
    }));
  }

  lexicalSearchMemory(input: { agentId: string; query: string; limit: number }): MemoryRecord[] {
    const terms = input.query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 1);

    if (terms.length === 0) {
      return [];
    }

    const clause = terms.map(() => 'LOWER(content) LIKE ?').join(' OR ');
    const args = terms.map((term) => `%${term}%`);

    const rows = this.db
      .prepare(
        `SELECT *
         FROM memory_items
         WHERE agent_id = ?
           AND (${clause})
         ORDER BY importance DESC, created_at DESC
         LIMIT ?`
      )
      .all(input.agentId, ...args, input.limit) as Array<{
      id: string;
      session_id: string | null;
      agent_id: string;
      source: MemoryRecord['source'];
      content: string;
      embedding_ref: string | null;
      importance: number;
      created_at: string;
      metadata_json: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      agentId: row.agent_id,
      source: row.source,
      content: row.content,
      embeddingRef: row.embedding_ref,
      importance: row.importance,
      createdAt: row.created_at,
      metadataJson: row.metadata_json
    }));
  }

  upsertSkill(input: SkillUpsertInput): SkillRecord {
    const existing = this.db
      .prepare('SELECT id FROM skills WHERE name = ? AND version = ?')
      .get(input.name, input.version) as { id: string } | undefined;

    const now = utcNow();

    if (existing) {
      this.db
        .prepare(
          `UPDATE skills
           SET path = ?, scopes_json = ?, enabled = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(input.path, JSON.stringify(input.scopes), input.enabled ? 1 : 0, now, existing.id);

      return this.getSkillById(existing.id)!;
    }

    const row: SkillRecord = {
      id: randomUUID(),
      name: input.name,
      version: input.version,
      path: input.path,
      scopesJson: JSON.stringify(input.scopes),
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO skills (id, name, version, path, scopes_json, enabled, created_at, updated_at)
         VALUES (@id, @name, @version, @path, @scopesJson, @enabled, @createdAt, @updatedAt)`
      )
      .run({ ...row, enabled: row.enabled ? 1 : 0 });

    return row;
  }

  getSkillById(skillId: string): SkillRecord | undefined {
    const row = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId) as
      | {
          id: string;
          name: string;
          version: string;
          path: string;
          scopes_json: string;
          enabled: number;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      name: row.name,
      version: row.version,
      path: row.path,
      scopesJson: row.scopes_json,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  listSkills(): SkillRecord[] {
    const rows = this.db.prepare('SELECT id FROM skills ORDER BY name ASC').all() as Array<{ id: string }>;
    return rows.map((row) => this.getSkillById(row.id)).filter((row): row is SkillRecord => row !== undefined);
  }

  removeSkillByName(name: string): number {
    return this.db.prepare('DELETE FROM skills WHERE name = ?').run(name).changes;
  }

  removeSkillsByPathPrefix(pathPrefix: string): number {
    const normalized = pathPrefix.trim().replace(/\\/g, '/');
    if (!normalized) {
      return 0;
    }
    return this.db.prepare('DELETE FROM skills WHERE REPLACE(path, \'\\\\\', \'/\') LIKE ?').run(`${normalized}%`).changes;
  }

  upsertTool(input: ToolUpsertInput): ToolRecord {
    const existing = this.db.prepare('SELECT name FROM tools WHERE name = ?').get(input.name) as
      | { name: string }
      | undefined;
    const now = utcNow();

    if (existing) {
      this.db
        .prepare(
          `UPDATE tools
           SET source = ?, installed = ?, enabled = COALESCE(?, enabled), updated_at = ?
           WHERE name = ?`
        )
        .run(input.source, input.installed ? 1 : 0, input.enabled !== undefined ? (input.enabled ? 1 : 0) : null, now, input.name);
      return this.getTool(input.name)!;
    }

    this.db
      .prepare(
        `INSERT INTO tools (name, source, installed, enabled, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(input.name, input.source, input.installed ? 1 : 0, input.enabled === false ? 0 : 1, now);

    return this.getTool(input.name)!;
  }

  getTool(name: string): ToolRecord | undefined {
    const row = this.db.prepare('SELECT * FROM tools WHERE name = ?').get(name) as
      | {
          name: string;
          source: ToolRecord['source'];
          installed: number;
          enabled: number;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      name: row.name,
      source: row.source,
      installed: row.installed === 1,
      enabled: row.enabled === 1,
      updatedAt: row.updated_at
    };
  }

  setToolEnabled(name: string, enabled: boolean): ToolRecord | undefined {
    this.db
      .prepare('UPDATE tools SET enabled = ?, updated_at = ? WHERE name = ?')
      .run(enabled ? 1 : 0, utcNow(), name);
    return this.getTool(name);
  }

  removeTool(name: string): number {
    return this.db.prepare('DELETE FROM tools WHERE name = ?').run(name).changes;
  }

  listTools(): ToolRecord[] {
    const rows = this.db
      .prepare('SELECT name, source, installed, enabled, updated_at FROM tools ORDER BY name ASC')
      .all() as Array<{
      name: string;
      source: ToolRecord['source'];
      installed: number;
      enabled: number;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      name: row.name,
      source: row.source,
      installed: row.installed === 1,
      enabled: row.enabled === 1,
      updatedAt: row.updated_at
    }));
  }

  appendSkillCatalogOperation(input: SkillCatalogOperationAppendInput): SkillCatalogOperationRecord {
    const record: SkillCatalogOperationRecord = {
      id: randomUUID(),
      action: input.action,
      sourceRef: input.sourceRef ?? null,
      actor: input.actor,
      status: input.status,
      summary: input.summary,
      detailsJson: JSON.stringify(input.details ?? {}),
      createdAt: utcNow()
    };

    this.db
      .prepare(
        `INSERT INTO skill_catalog_operations (
          id, action, source_ref, actor, status, summary, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.action,
        record.sourceRef,
        record.actor,
        record.status,
        record.summary,
        record.detailsJson,
        record.createdAt
      );

    return record;
  }

  listSkillCatalogOperations(limit = 100): SkillCatalogOperationRecord[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM skill_catalog_operations
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(Math.max(1, Math.min(1000, limit))) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      action: String(row.action) as SkillCatalogOperationRecord['action'],
      sourceRef: row.source_ref === null || row.source_ref === undefined ? null : String(row.source_ref),
      actor: String(row.actor),
      status: String(row.status) as SkillCatalogOperationRecord['status'],
      summary: String(row.summary),
      detailsJson: row.details_json === null || row.details_json === undefined ? '{}' : String(row.details_json),
      createdAt: String(row.created_at)
    }));
  }

  upsertSkillCatalogEntry(input: SkillCatalogEntryUpsertInput): SkillCatalogEntryRecord {
    const normalizedPath = input.path.trim().replace(/\\/g, '/');
    if (!normalizedPath) {
      throw new Error('Skill catalog entry path is required');
    }

    const existing = this.getSkillCatalogEntry(normalizedPath);
    const now = utcNow();
    const next: SkillCatalogEntryRecord = {
      path: normalizedPath,
      name:
        input.name !== undefined
          ? input.name && input.name.trim().length > 0
            ? input.name.trim()
            : null
          : existing?.name ?? null,
      enabled: input.enabled !== undefined ? input.enabled : existing?.enabled ?? null,
      requiresApproval: input.requiresApproval !== undefined ? input.requiresApproval : existing?.requiresApproval ?? null,
      supportsDryRun: input.supportsDryRun !== undefined ? input.supportsDryRun : existing?.supportsDryRun ?? null,
      tags: input.tags !== undefined ? normalizeStringArray(input.tags) : existing?.tags ?? [],
      allowedCommands: input.allowedCommands !== undefined ? normalizeStringArray(input.allowedCommands) : existing?.allowedCommands ?? [],
      requiredTools: input.requiredTools !== undefined ? normalizeStringArray(input.requiredTools) : existing?.requiredTools ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO skill_catalog_entries (
          path,
          name,
          enabled,
          requires_approval,
          supports_dry_run,
          tags_json,
          allowed_commands_json,
          required_tools_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          name = excluded.name,
          enabled = excluded.enabled,
          requires_approval = excluded.requires_approval,
          supports_dry_run = excluded.supports_dry_run,
          tags_json = excluded.tags_json,
          allowed_commands_json = excluded.allowed_commands_json,
          required_tools_json = excluded.required_tools_json,
          updated_at = excluded.updated_at`
      )
      .run(
        next.path,
        next.name,
        next.enabled === null ? null : next.enabled ? 1 : 0,
        next.requiresApproval === null ? null : next.requiresApproval ? 1 : 0,
        next.supportsDryRun === null ? null : next.supportsDryRun ? 1 : 0,
        JSON.stringify(next.tags),
        JSON.stringify(next.allowedCommands),
        JSON.stringify(next.requiredTools),
        next.createdAt,
        next.updatedAt
      );

    return this.getSkillCatalogEntry(normalizedPath)!;
  }

  removeSkillCatalogEntry(pathInput: string): boolean {
    const normalizedPath = pathInput.trim().replace(/\\/g, '/');
    if (!normalizedPath) {
      return false;
    }
    const result = this.db.prepare('DELETE FROM skill_catalog_entries WHERE path = ?').run(normalizedPath);
    return result.changes > 0;
  }

  listSkillCatalogEntries(): SkillCatalogEntryRecord[] {
    const rows = this.db
      .prepare(
        `SELECT
          path,
          name,
          enabled,
          requires_approval,
          supports_dry_run,
          tags_json,
          allowed_commands_json,
          required_tools_json,
          created_at,
          updated_at
         FROM skill_catalog_entries
         ORDER BY path ASC`
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapSkillCatalogEntryRow(row));
  }

  private getSkillCatalogEntry(pathInput: string): SkillCatalogEntryRecord | null {
    const row = this.db
      .prepare(
        `SELECT
          path,
          name,
          enabled,
          requires_approval,
          supports_dry_run,
          tags_json,
          allowed_commands_json,
          required_tools_json,
          created_at,
          updated_at
         FROM skill_catalog_entries
         WHERE path = ?`
      )
      .get(pathInput) as Record<string, unknown> | undefined;
    return row ? this.mapSkillCatalogEntryRow(row) : null;
  }

  private mapSkillCatalogEntryRow(row: Record<string, unknown>): SkillCatalogEntryRecord {
    return {
      path: String(row.path),
      name: row.name === null || row.name === undefined ? null : String(row.name),
      enabled: row.enabled === null || row.enabled === undefined ? null : Number(row.enabled) === 1,
      requiresApproval:
        row.requires_approval === null || row.requires_approval === undefined ? null : Number(row.requires_approval) === 1,
      supportsDryRun:
        row.supports_dry_run === null || row.supports_dry_run === undefined ? null : Number(row.supports_dry_run) === 1,
      tags: normalizeStringArray(parseJsonSafe<unknown>(String(row.tags_json ?? '[]'), [])),
      allowedCommands: normalizeStringArray(parseJsonSafe<unknown>(String(row.allowed_commands_json ?? '[]'), [])),
      requiredTools: normalizeStringArray(parseJsonSafe<unknown>(String(row.required_tools_json ?? '[]'), [])),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  appendAudit(input: AuditInsertInput): AuditRecord {
    const row: AuditRecord = {
      id: randomUUID(),
      ts: utcNow(),
      actor: input.actor,
      action: input.action,
      resource: input.resource,
      decision: input.decision,
      reason: input.reason,
      detailsJson: JSON.stringify(input.details ?? {}),
      correlationId: input.correlationId
    };

    this.db
      .prepare(
        `INSERT INTO audit_logs (id, ts, actor, action, resource, decision, reason, details_json, correlation_id)
         VALUES (@id, @ts, @actor, @action, @resource, @decision, @reason, @detailsJson, @correlationId)`
      )
      .run(row);

    return row;
  }

  listAudit(limit = 200): AuditRecord[] {
    return this.db
      .prepare('SELECT * FROM audit_logs ORDER BY ts DESC LIMIT ?')
      .all(limit) as AuditRecord[];
  }

  createOrReuseIdempotencyKey(key: string, runIdFactory: () => string): IdempotencyDecision {
    const existing = this.db
      .prepare('SELECT run_id FROM idempotency_keys WHERE key = ?')
      .get(key) as { run_id: string } | undefined;

    if (existing) {
      return { created: false, key, runId: existing.run_id };
    }

    const runId = runIdFactory();
    return { created: true, key, runId };
  }

  persistIdempotencyKey(key: string, runId: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO idempotency_keys (key, run_id, created_at) VALUES (?, ?, ?)')
      .run(key, runId, utcNow());
  }

  createPairingRequest(input: PairingRequestInput): PairingRecord {
    const existing = this.db
      .prepare('SELECT id FROM pairing_requests WHERE channel = ? AND sender_id = ?')
      .get(input.channel, input.senderId) as { id: string } | undefined;

    if (existing) {
      const existingRow = this.getPairing(input.channel, input.senderId);
      if (existingRow) {
        return existingRow;
      }
    }

    const row: PairingRecord = {
      id: randomUUID(),
      channel: input.channel,
      senderId: input.senderId,
      senderHandle: input.senderHandle,
      status: 'pending',
      requestedAt: utcNow(),
      decidedAt: null,
      decidedBy: null
    };

    this.db
      .prepare(
        `INSERT INTO pairing_requests (id, channel, sender_id, sender_handle, status, requested_at, decided_at, decided_by)
         VALUES (@id, @channel, @senderId, @senderHandle, @status, @requestedAt, @decidedAt, @decidedBy)`
      )
      .run(row);

    return row;
  }

  decidePairing(input: PairingDecisionInput): PairingRecord {
    this.db
      .prepare(
        `UPDATE pairing_requests
         SET status = ?, decided_at = ?, decided_by = ?
         WHERE channel = ? AND sender_id = ?`
      )
      .run(input.status, utcNow(), input.decidedBy, input.channel, input.senderId);

    const pair = this.getPairing(input.channel, input.senderId);
    if (!pair) {
      throw new Error(`Pairing request not found for ${input.channel}:${input.senderId}`);
    }
    return pair;
  }

  getPairing(channel: PairingRecord['channel'], senderId: string): PairingRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM pairing_requests WHERE channel = ? AND sender_id = ?')
      .get(channel, senderId) as
      | {
          id: string;
          channel: PairingRecord['channel'];
          sender_id: string;
          sender_handle: string;
          status: PairingRecord['status'];
          requested_at: string;
          decided_at: string | null;
          decided_by: string | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      channel: row.channel,
      senderId: row.sender_id,
      senderHandle: row.sender_handle,
      status: row.status,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
      decidedBy: row.decided_by
    };
  }

  listPairings(status?: PairingRecord['status']): PairingRecord[] {
    const rows = this.db
      .prepare(
        status
          ? 'SELECT channel, sender_id FROM pairing_requests WHERE status = ? ORDER BY requested_at DESC'
          : 'SELECT channel, sender_id FROM pairing_requests ORDER BY requested_at DESC'
      )
      .all(...(status ? [status] : [])) as Array<{ channel: PairingRecord['channel']; sender_id: string }>;

    return rows
      .map((row) => this.getPairing(row.channel, row.sender_id))
      .filter((row): row is PairingRecord => row !== undefined);
  }

  appendRealtimeEvent(input: RealtimeEventInsertInput): RuntimeEvent {
    const rowId = input.id ?? randomUUID();
    const payload = JSON.stringify(input.data ?? {});

    this.db
      .prepare(
        `INSERT INTO realtime_events (id, ts, kind, lane, session_id, run_id, level, message, data_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        rowId,
        utcNow(),
        input.kind,
        input.lane,
        input.sessionId ?? null,
        input.runId ?? null,
        input.level,
        input.message,
        payload
      );

    const row = this.db
      .prepare('SELECT * FROM realtime_events WHERE id = ?')
      .get(rowId) as {
      id: string;
      sequence: number;
      ts: string;
      kind: RuntimeEvent['kind'];
      lane: string;
      session_id: string | null;
      run_id: string | null;
      level: RuntimeEvent['level'];
      message: string;
      data_json: string;
    };

    return {
      id: row.id,
      sequence: row.sequence,
      ts: row.ts,
      kind: row.kind,
      lane: row.lane,
      sessionId: row.session_id,
      runId: row.run_id,
      level: row.level,
      message: row.message,
      data: parseJsonSafe<Record<string, unknown>>(row.data_json, {})
    };
  }

  listRealtimeEvents(sinceSequence = 0, limit = 200): RuntimeEvent[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM realtime_events
         WHERE sequence > ?
         ORDER BY sequence ASC
         LIMIT ?`
      )
      .all(sinceSequence, limit) as Array<{
      id: string;
      sequence: number;
      ts: string;
      kind: RuntimeEvent['kind'];
      lane: string;
      session_id: string | null;
      run_id: string | null;
      level: RuntimeEvent['level'];
      message: string;
      data_json: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      ts: row.ts,
      kind: row.kind,
      lane: row.lane,
      sessionId: row.session_id,
      runId: row.run_id,
      level: row.level,
      message: row.message,
      data: parseJsonSafe<Record<string, unknown>>(row.data_json, {})
    }));
  }

  upsertOfficePresence(input: Omit<OfficePresenceRecord, 'id' | 'updatedAt'> & { id?: string }): OfficePresenceRecord {
    const existing = this.db
      .prepare('SELECT id FROM office_presence WHERE agent_id = ? AND session_id = ?')
      .get(input.agentId, input.sessionId) as { id: string } | undefined;

    const id = existing?.id ?? input.id ?? randomUUID();
    const now = utcNow();

    if (existing) {
      this.db
        .prepare(
          `UPDATE office_presence
           SET run_id = ?, state = ?, activity_label = ?, sequence = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(input.runId, input.state, input.activityLabel, input.sequence, now, id);
    } else {
      this.db
        .prepare(
          `INSERT INTO office_presence (id, agent_id, session_id, run_id, state, activity_label, sequence, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, input.agentId, input.sessionId, input.runId, input.state, input.activityLabel, input.sequence, now);
    }

    return this.listOfficePresence().find((row) => row.id === id)!;
  }

  listOfficePresence(): OfficePresenceRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM office_presence ORDER BY updated_at DESC')
      .all() as Array<{
      id: string;
      agent_id: string;
      session_id: string;
      run_id: string | null;
      state: OfficePresenceRecord['state'];
      activity_label: string | null;
      sequence: number;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      sessionId: row.session_id,
      runId: row.run_id,
      state: row.state,
      activityLabel: row.activity_label,
      sequence: row.sequence,
      updatedAt: row.updated_at
    }));
  }

  upsertOfficeLayout(input: Omit<OfficeLayoutRecord, 'updatedAt'>): OfficeLayoutRecord {
    const now = utcNow();
    const existing = this.db.prepare('SELECT id FROM office_layouts WHERE id = ?').get(input.id) as
      | { id: string }
      | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE office_layouts
           SET name = ?, version = ?, tiles_json = ?, furniture_json = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(input.name, input.version, input.tilesJson, input.furnitureJson, now, input.id);
    } else {
      this.db
        .prepare(
          `INSERT INTO office_layouts (id, name, version, tiles_json, furniture_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(input.id, input.name, input.version, input.tilesJson, input.furnitureJson, now);
    }

    return this.getOfficeLayout(input.id)!;
  }

  getOfficeLayout(layoutId: string): OfficeLayoutRecord | undefined {
    const row = this.db.prepare('SELECT * FROM office_layouts WHERE id = ?').get(layoutId) as
      | {
          id: string;
          name: string;
          version: number;
          tiles_json: string;
          furniture_json: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      name: row.name,
      version: row.version,
      tilesJson: row.tiles_json,
      furnitureJson: row.furniture_json,
      updatedAt: row.updated_at
    };
  }

  recordGateResult(input: GateResultInput): void {
    this.db
      .prepare(
        `INSERT INTO quality_gate_results (id, lane, status, summary, artifacts_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(randomUUID(), input.lane, input.status, input.summary, JSON.stringify(input.artifacts), utcNow());
  }

  listGateResults(limit = 100): Array<{
    id: string;
    lane: string;
    status: 'passed' | 'failed';
    summary: string;
    artifacts: Array<{ label: string; path: string }>;
    createdAt: string;
  }> {
    const rows = this.db
      .prepare('SELECT * FROM quality_gate_results ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<{
      id: string;
      lane: string;
      status: 'passed' | 'failed';
      summary: string;
      artifacts_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      lane: row.lane,
      status: row.status,
      summary: row.summary,
      artifacts: parseJsonSafe<Array<{ label: string; path: string }>>(row.artifacts_json, []),
      createdAt: row.created_at
    }));
  }

  createRemediationTask(input: RemediationInput): {
    id: string;
    source: string;
    severity: string;
    title: string;
    details: string;
    evidence: Record<string, unknown>;
    status: string;
    createdAt: string;
    updatedAt: string;
  } {
    const now = utcNow();
    const id = randomUUID();

    this.db
      .prepare(
        `INSERT INTO remediation_tasks (id, source, severity, title, details, evidence_json, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`
      )
      .run(id, input.source, input.severity, input.title, input.details, JSON.stringify(input.evidence), now, now);

    const signal = this.createRemediationSignal({
      source: input.source,
      signalKey: `${input.source}:${input.title.toLowerCase().replace(/\s+/g, '_').slice(0, 80)}`,
      severity: input.severity,
      blastRadius: input.severity === 'critical' ? 'global' : input.severity === 'high' ? 'multi_lane' : 'single',
      summary: input.title,
      details: input.details,
      evidence: input.evidence
    });

    const basePriority: Record<RemediationSignalRecord['severity'], number> = {
      critical: 100,
      high: 80,
      medium: 55,
      low: 25
    };
    this.createRemediationPlan({
      signalId: signal.id,
      priority: basePriority[input.severity],
      requiresApproval: input.severity === 'critical' || input.severity === 'high',
      status: 'planned',
      title: `Plan: ${input.title}`,
      actions: [
        { type: 'investigate', instruction: 'Gather latest failing evidence and confirm reproducibility.' },
        { type: 'remediate', instruction: input.details.slice(0, 280) || 'Apply bounded remediation action.' },
        { type: 'verify', instruction: 'Re-run affected quality gate and compare recurrence trend.' }
      ],
      policy: {
        source: input.source,
        severity: input.severity
      }
    });

    return this.listRemediationTasks().find((task) => task.id === id)!;
  }

  listRemediationTasks(limit = 100): Array<{
    id: string;
    source: string;
    severity: string;
    title: string;
    details: string;
    evidence: Record<string, unknown>;
    status: string;
    createdAt: string;
    updatedAt: string;
  }> {
    const rows = this.db
      .prepare('SELECT * FROM remediation_tasks ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<{
      id: string;
      source: string;
      severity: string;
      title: string;
      details: string;
      evidence_json: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      severity: row.severity,
      title: row.title,
      details: row.details,
      evidence: parseJsonSafe<Record<string, unknown>>(row.evidence_json, {}),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  appendTrajectoryEvent(input: TrajectoryEventInput): TrajectoryEventRecord {
    const now = utcNow();
    const id = randomUUID();
    const nextSequence = (
      this.db.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS seq FROM trajectory_events').get() as { seq: number }
    ).seq;

    const event: TrajectoryEventRecord = {
      id,
      sessionId: input.sessionId,
      runId: input.runId,
      chapter: input.chapter,
      eventType: input.eventType,
      actor: input.actor,
      toolName: input.toolName ?? null,
      decision: input.decision ?? null,
      content: input.content,
      significance: input.significance,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      sequence: nextSequence,
      createdAt: now
    };

    this.db
      .prepare(
        `INSERT INTO trajectory_events (
          id, session_id, run_id, chapter, event_type, actor, tool_name, decision, content, significance, source_kind, source_ref, metadata_json, created_at, sequence
        ) VALUES (
          @id, @sessionId, @runId, @chapter, @eventType, @actor, @toolName, @decision, @content, @significance, @sourceKind, @sourceRef, @metadataJson, @createdAt, @sequence
        )`
      )
      .run(event);

    const existingChapter = this.db
      .prepare('SELECT * FROM trajectory_chapters WHERE run_id = ? AND chapter_key = ?')
      .get(input.runId, input.chapter) as
      | {
          id: string;
          chapter_index: number;
          significance: number;
          citations_json: string;
          first_sequence: number;
          last_sequence: number;
        }
      | undefined;

    const citation = `${input.sourceKind}:${input.sourceRef}`;
    if (!existingChapter) {
      const chapterIndex = (
        this.db.prepare('SELECT COALESCE(MAX(chapter_index), 0) + 1 AS idx FROM trajectory_chapters WHERE run_id = ?').get(input.runId) as {
          idx: number;
        }
      ).idx;
      this.db
        .prepare(
          `INSERT INTO trajectory_chapters (
            id, session_id, run_id, chapter_key, chapter_index, summary, significance, first_sequence, last_sequence, citations_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          randomUUID(),
          input.sessionId,
          input.runId,
          input.chapter,
          chapterIndex,
          input.content.slice(0, 240),
          input.significance,
          nextSequence,
          nextSequence,
          JSON.stringify([citation]),
          now,
          now
        );
    } else {
      const existingCitations = parseJsonSafe<string[]>(existingChapter.citations_json, []);
      const deduped = Array.from(new Set([...existingCitations, citation]));
      this.db
        .prepare(
          `UPDATE trajectory_chapters
           SET significance = ?, summary = ?, last_sequence = ?, citations_json = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          Math.max(existingChapter.significance, input.significance),
          input.content.slice(0, 240),
          Math.max(existingChapter.last_sequence, nextSequence),
          JSON.stringify(deduped),
          now,
          existingChapter.id
        );
    }

    return event;
  }

  listTrajectoryEvents(runId: string, limit = 1000): TrajectoryEventRecord[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM trajectory_events
         WHERE run_id = ?
         ORDER BY sequence ASC
         LIMIT ?`
      )
      .all(runId, limit) as Array<{
      id: string;
      session_id: string;
      run_id: string;
      chapter: string;
      event_type: string;
      actor: string;
      tool_name: string | null;
      decision: string | null;
      content: string;
      significance: number;
      source_kind: string;
      source_ref: string;
      metadata_json: string;
      sequence: number;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      runId: row.run_id,
      chapter: row.chapter,
      eventType: row.event_type,
      actor: row.actor,
      toolName: row.tool_name,
      decision: row.decision,
      content: row.content,
      significance: row.significance,
      sourceKind: row.source_kind,
      sourceRef: row.source_ref,
      metadataJson: row.metadata_json,
      sequence: row.sequence,
      createdAt: row.created_at
    }));
  }

  listTrajectoryChapters(runId: string): TrajectoryChapterRecord[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM trajectory_chapters
         WHERE run_id = ?
         ORDER BY chapter_index ASC`
      )
      .all(runId) as Array<{
      id: string;
      session_id: string;
      run_id: string;
      chapter_key: string;
      chapter_index: number;
      summary: string;
      significance: number;
      first_sequence: number;
      last_sequence: number;
      citations_json: string;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      runId: row.run_id,
      chapterKey: row.chapter_key,
      chapterIndex: row.chapter_index,
      summary: row.summary,
      significance: row.significance,
      firstSequence: row.first_sequence,
      lastSequence: row.last_sequence,
      citationsJson: row.citations_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  saveTrajectorySnapshot(runId: string): TrajectorySnapshotRecord {
    const run = this.getRunById(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const events = this.listTrajectoryEvents(runId, 5000);
    const chapters = this.listTrajectoryChapters(runId);
    const latestSequence = events.length > 0 ? events[events.length - 1]!.sequence : 0;
    const summary = {
      runId,
      sessionId: run.sessionId,
      eventCount: events.length,
      chapterCount: chapters.length,
      topChapter: chapters.sort((a, b) => b.significance - a.significance)[0]?.chapterKey ?? null
    };
    const now = utcNow();

    const existing = this.db.prepare('SELECT id FROM trajectory_snapshots WHERE run_id = ?').get(runId) as
      | { id: string }
      | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE trajectory_snapshots
           SET latest_sequence = ?, chapter_count = ?, summary_json = ?, created_at = ?
           WHERE id = ?`
        )
        .run(latestSequence, chapters.length, JSON.stringify(summary), now, existing.id);
    } else {
      this.db
        .prepare(
          `INSERT INTO trajectory_snapshots (
            id, session_id, run_id, latest_sequence, chapter_count, summary_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(randomUUID(), run.sessionId, runId, latestSequence, chapters.length, JSON.stringify(summary), now);
    }

    return this.getTrajectorySnapshot(runId)!;
  }

  getTrajectorySnapshot(runId: string): TrajectorySnapshotRecord | undefined {
    const row = this.db.prepare('SELECT * FROM trajectory_snapshots WHERE run_id = ?').get(runId) as
      | {
          id: string;
          session_id: string;
          run_id: string;
          latest_sequence: number;
          chapter_count: number;
          summary_json: string;
          created_at: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      runId: row.run_id,
      latestSequence: row.latest_sequence,
      chapterCount: row.chapter_count,
      summaryJson: row.summary_json,
      createdAt: row.created_at
    };
  }

  projectTrajectoryToContextGraph(runId: string): {
    nodesTouched: number;
    edgesTouched: number;
    insertedEdges: number;
  } {
    const events = this.listTrajectoryEvents(runId, 5000);
    if (events.length === 0) {
      return { nodesTouched: 0, edgesTouched: 0, insertedEdges: 0 };
    }

    const touchNode = (
      nodeKey: string,
      kind: string,
      label: string,
      confidence: number,
      metadata: Record<string, unknown>
    ): ContextGraphNodeRecord => {
      const existing = this.db.prepare('SELECT * FROM context_graph_nodes WHERE node_key = ?').get(nodeKey) as
        | {
            id: string;
            node_key: string;
            kind: string;
            label: string;
            confidence: number;
            metadata_json: string;
            updated_at: string;
          }
        | undefined;

      const now = utcNow();
      if (existing) {
        this.db
          .prepare(
            `UPDATE context_graph_nodes
             SET kind = ?, label = ?, confidence = ?, metadata_json = ?, updated_at = ?
             WHERE id = ?`
          )
          .run(
            kind,
            label,
            Math.max(existing.confidence, confidence),
            JSON.stringify(metadata),
            now,
            existing.id
          );
        return {
          id: existing.id,
          nodeKey: existing.node_key,
          kind,
          label,
          confidence: Math.max(existing.confidence, confidence),
          metadataJson: JSON.stringify(metadata),
          updatedAt: now
        };
      }

      const created: ContextGraphNodeRecord = {
        id: randomUUID(),
        nodeKey,
        kind,
        label,
        confidence,
        metadataJson: JSON.stringify(metadata),
        updatedAt: now
      };
      this.db
        .prepare(
          `INSERT INTO context_graph_nodes (id, node_key, kind, label, confidence, metadata_json, updated_at)
           VALUES (@id, @nodeKey, @kind, @label, @confidence, @metadataJson, @updatedAt)`
        )
        .run(created);
      return created;
    };

    let nodesTouched = 0;
    let edgesTouched = 0;
    let insertedEdges = 0;

    const touchEdge = (
      fromNodeId: string,
      toNodeId: string,
      action: string,
      weight: number,
      evidence: Record<string, unknown>
    ): void => {
      const now = utcNow();
      const existing = this.db
        .prepare('SELECT * FROM context_graph_edges WHERE from_node_id = ? AND to_node_id = ? AND action = ?')
        .get(fromNodeId, toNodeId, action) as
        | {
            id: string;
            weight: number;
            evidence_json: string;
            first_seen_at: string;
          }
        | undefined;

      if (existing) {
        const evidenceList = parseJsonSafe<Array<Record<string, unknown>>>(existing.evidence_json, []);
        evidenceList.push(evidence);
        this.db
          .prepare(
            `UPDATE context_graph_edges
             SET weight = ?, evidence_json = ?, last_seen_at = ?
             WHERE id = ?`
          )
          .run(existing.weight + weight, JSON.stringify(evidenceList.slice(-25)), now, existing.id);
      } else {
        this.db
          .prepare(
            `INSERT INTO context_graph_edges (id, from_node_id, to_node_id, action, weight, evidence_json, first_seen_at, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(randomUUID(), fromNodeId, toNodeId, action, weight, JSON.stringify([evidence]), now, now);
        insertedEdges += 1;
      }
      edgesTouched += 1;
    };

    let previousEventNode: ContextGraphNodeRecord | null = null;
    for (const event of events) {
      const actorNode = touchNode(`actor:${event.actor}`, 'actor', event.actor, 0.8, { actor: event.actor });
      const eventNode = touchNode(
        `event:${event.eventType}`,
        'event',
        event.eventType,
        Math.max(0.1, Math.min(1, event.significance / 10)),
        { chapter: event.chapter, runId: runId }
      );
      nodesTouched += 2;

      touchEdge(actorNode.id, eventNode.id, event.decision ?? 'emits', Math.max(1, event.significance), {
        runId,
        sequence: event.sequence,
        sourceRef: event.sourceRef
      });

      if (previousEventNode) {
        touchEdge(previousEventNode.id, eventNode.id, 'next', 1, {
          runId,
          sequence: event.sequence
        });
      }

      if (event.toolName) {
        const toolNode = touchNode(`tool:${event.toolName}`, 'tool', event.toolName, 0.7, { tool: event.toolName });
        nodesTouched += 1;
        touchEdge(eventNode.id, toolNode.id, 'uses_tool', Math.max(1, event.significance), {
          runId,
          sequence: event.sequence
        });
      }

      previousEventNode = eventNode;
    }

    return { nodesTouched, edgesTouched, insertedEdges };
  }

  queryContextGraph(startNodeKey: string, depth = 2, limit = 20): {
    startNode: ContextGraphNodeRecord | null;
    edges: ContextGraphEdgeRecord[];
    nodes: ContextGraphNodeRecord[];
    likelyNext: Array<{ node: ContextGraphNodeRecord; score: number; action: string }>;
  } {
    const start = this.db.prepare('SELECT * FROM context_graph_nodes WHERE node_key = ?').get(startNodeKey) as
      | {
          id: string;
          node_key: string;
          kind: string;
          label: string;
          confidence: number;
          metadata_json: string;
          updated_at: string;
        }
      | undefined;

    if (!start) {
      return { startNode: null, edges: [], nodes: [], likelyNext: [] };
    }

    const visited = new Set<string>([start.id]);
    const frontier: Array<{ nodeId: string; level: number }> = [{ nodeId: start.id, level: 0 }];
    const collectedEdges: ContextGraphEdgeRecord[] = [];
    const collectedNodes = new Map<string, ContextGraphNodeRecord>();

    const asNode = (row: {
      id: string;
      node_key: string;
      kind: string;
      label: string;
      confidence: number;
      metadata_json: string;
      updated_at: string;
    }): ContextGraphNodeRecord => ({
      id: row.id,
      nodeKey: row.node_key,
      kind: row.kind,
      label: row.label,
      confidence: row.confidence,
      metadataJson: row.metadata_json,
      updatedAt: row.updated_at
    });

    collectedNodes.set(start.id, asNode(start));

    while (frontier.length > 0 && collectedEdges.length < limit) {
      const current = frontier.shift()!;
      if (current.level >= depth) {
        continue;
      }

      const outgoing = this.db
        .prepare(
          `SELECT *
           FROM context_graph_edges
           WHERE from_node_id = ?
           ORDER BY weight DESC
           LIMIT ?`
        )
        .all(current.nodeId, limit) as Array<{
        id: string;
        from_node_id: string;
        to_node_id: string;
        action: string;
        weight: number;
        evidence_json: string;
        first_seen_at: string;
        last_seen_at: string;
      }>;

      for (const edge of outgoing) {
        collectedEdges.push({
          id: edge.id,
          fromNodeId: edge.from_node_id,
          toNodeId: edge.to_node_id,
          action: edge.action,
          weight: edge.weight,
          evidenceJson: edge.evidence_json,
          firstSeenAt: edge.first_seen_at,
          lastSeenAt: edge.last_seen_at
        });

        if (!visited.has(edge.to_node_id)) {
          visited.add(edge.to_node_id);
          frontier.push({ nodeId: edge.to_node_id, level: current.level + 1 });
          const target = this.db.prepare('SELECT * FROM context_graph_nodes WHERE id = ?').get(edge.to_node_id) as
            | {
                id: string;
                node_key: string;
                kind: string;
                label: string;
                confidence: number;
                metadata_json: string;
                updated_at: string;
              }
            | undefined;
          if (target) {
            collectedNodes.set(target.id, asNode(target));
          }
        }
      }
    }

    const nextEdges = collectedEdges
      .filter((edge) => edge.fromNodeId === start.id)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);

    const likelyNext = nextEdges
      .map((edge) => {
        const node = collectedNodes.get(edge.toNodeId);
        if (!node) {
          return null;
        }
        return { node, score: edge.weight, action: edge.action };
      })
      .filter((row): row is { node: ContextGraphNodeRecord; score: number; action: string } => row !== null);

    return {
      startNode: asNode(start),
      edges: collectedEdges.slice(0, limit),
      nodes: Array.from(collectedNodes.values()),
      likelyNext
    };
  }

  createRemediationSignal(input: RemediationSignalInput): RemediationSignalRecord {
    const now = utcNow();
    const row: RemediationSignalRecord = {
      id: randomUUID(),
      source: input.source,
      signalKey: input.signalKey,
      severity: input.severity,
      blastRadius: input.blastRadius,
      summary: input.summary,
      details: input.details,
      evidenceJson: JSON.stringify(input.evidence),
      status: 'open',
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO remediation_signals (
          id, source, signal_key, severity, blast_radius, summary, details, evidence_json, status, created_at, updated_at
        ) VALUES (
          @id, @source, @signalKey, @severity, @blastRadius, @summary, @details, @evidenceJson, @status, @createdAt, @updatedAt
        )`
      )
      .run(row);

    return row;
  }

  listRemediationSignals(limit = 100): RemediationSignalRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM remediation_signals ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<{
      id: string;
      source: RemediationSignalRecord['source'];
      signal_key: string;
      severity: RemediationSignalRecord['severity'];
      blast_radius: RemediationSignalRecord['blastRadius'];
      summary: string;
      details: string;
      evidence_json: string;
      status: RemediationSignalRecord['status'];
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      signalKey: row.signal_key,
      severity: row.severity,
      blastRadius: row.blast_radius,
      summary: row.summary,
      details: row.details,
      evidenceJson: row.evidence_json,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  createRemediationPlan(input: RemediationPlanInput): RemediationPlanRecord {
    const now = utcNow();
    const row: RemediationPlanRecord = {
      id: randomUUID(),
      signalId: input.signalId,
      priority: input.priority,
      requiresApproval: input.requiresApproval,
      status: input.status,
      title: input.title,
      actionsJson: JSON.stringify(input.actions),
      policyJson: JSON.stringify(input.policy),
      createdAt: now,
      updatedAt: now,
      executedAt: null
    };

    this.db
      .prepare(
        `INSERT INTO remediation_plans (
          id, signal_id, priority, requires_approval, status, title, actions_json, policy_json, created_at, updated_at, executed_at
        ) VALUES (
          @id, @signalId, @priority, @requiresApproval, @status, @title, @actionsJson, @policyJson, @createdAt, @updatedAt, @executedAt
        )`
      )
      .run({
        ...row,
        requiresApproval: row.requiresApproval ? 1 : 0
      });

    this.db.prepare(`UPDATE remediation_signals SET status = 'planned', updated_at = ? WHERE id = ?`).run(now, input.signalId);

    return row;
  }

  listRemediationPlans(limit = 100): RemediationPlanRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM remediation_plans ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<{
      id: string;
      signal_id: string;
      priority: number;
      requires_approval: number;
      status: RemediationPlanRecord['status'];
      title: string;
      actions_json: string;
      policy_json: string;
      created_at: string;
      updated_at: string;
      executed_at: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      signalId: row.signal_id,
      priority: row.priority,
      requiresApproval: row.requires_approval === 1,
      status: row.status,
      title: row.title,
      actionsJson: row.actions_json,
      policyJson: row.policy_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      executedAt: row.executed_at
    }));
  }

  getRemediationPlan(planId: string): RemediationPlanRecord | undefined {
    return this.listRemediationPlans(1000).find((item) => item.id === planId);
  }

  updateRemediationPlanStatus(
    planId: string,
    status: RemediationPlanRecord['status'],
    executedAt?: string | null
  ): RemediationPlanRecord {
    const now = utcNow();
    this.db
      .prepare('UPDATE remediation_plans SET status = ?, updated_at = ?, executed_at = ? WHERE id = ?')
      .run(status, now, executedAt ?? null, planId);
    const updated = this.getRemediationPlan(planId);
    if (!updated) {
      throw new Error(`Remediation plan not found: ${planId}`);
    }
    return updated;
  }

  recordRemediationOutcome(input: RemediationOutcomeInput): RemediationOutcomeRecord {
    const now = utcNow();
    const row: RemediationOutcomeRecord = {
      id: randomUUID(),
      planId: input.planId,
      signalId: input.signalId,
      status: input.status,
      summary: input.summary,
      effectivenessScore: input.effectivenessScore,
      recurrenceDelta: input.recurrenceDelta,
      metricsJson: JSON.stringify(input.metrics),
      createdAt: now
    };

    this.db
      .prepare(
        `INSERT INTO remediation_outcomes (
          id, plan_id, signal_id, status, summary, effectiveness_score, recurrence_delta, metrics_json, created_at
        ) VALUES (
          @id, @planId, @signalId, @status, @summary, @effectivenessScore, @recurrenceDelta, @metricsJson, @createdAt
        )`
      )
      .run(row);

    if (input.status === 'success') {
      this.db.prepare(`UPDATE remediation_signals SET status = 'resolved', updated_at = ? WHERE id = ?`).run(now, input.signalId);
    }

    return row;
  }

  listRemediationOutcomes(limit = 100): RemediationOutcomeRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM remediation_outcomes ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<{
      id: string;
      plan_id: string;
      signal_id: string;
      status: RemediationOutcomeRecord['status'];
      summary: string;
      effectiveness_score: number;
      recurrence_delta: number;
      metrics_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      planId: row.plan_id,
      signalId: row.signal_id,
      status: row.status,
      summary: row.summary,
      effectivenessScore: row.effectiveness_score,
      recurrenceDelta: row.recurrence_delta,
      metricsJson: row.metrics_json,
      createdAt: row.created_at
    }));
  }

  createVaultKeyVersion(input: VaultKeyVersionInput): VaultKeyVersionRecord {
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO vault_key_versions (wrapped_key, wrap_nonce, wrap_aad, status, rotated_from, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(input.wrappedKey, input.wrapNonce, input.wrapAad, input.status ?? 'active', input.rotatedFrom ?? null, now);

    const created = this.db
      .prepare('SELECT * FROM vault_key_versions ORDER BY version DESC LIMIT 1')
      .get() as {
      version: number;
      wrapped_key: string;
      wrap_nonce: string;
      wrap_aad: string;
      status: VaultKeyVersionRecord['status'];
      rotated_from: number | null;
      created_at: string;
      revoked_at: string | null;
    };

    return {
      version: created.version,
      wrappedKey: created.wrapped_key,
      wrapNonce: created.wrap_nonce,
      wrapAad: created.wrap_aad,
      status: created.status,
      rotatedFrom: created.rotated_from,
      createdAt: created.created_at,
      revokedAt: created.revoked_at
    };
  }

  listVaultKeyVersions(): VaultKeyVersionRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM vault_key_versions ORDER BY version DESC')
      .all() as Array<{
      version: number;
      wrapped_key: string;
      wrap_nonce: string;
      wrap_aad: string;
      status: VaultKeyVersionRecord['status'];
      rotated_from: number | null;
      created_at: string;
      revoked_at: string | null;
    }>;

    return rows.map((row) => ({
      version: row.version,
      wrappedKey: row.wrapped_key,
      wrapNonce: row.wrap_nonce,
      wrapAad: row.wrap_aad,
      status: row.status,
      rotatedFrom: row.rotated_from,
      createdAt: row.created_at,
      revokedAt: row.revoked_at
    }));
  }

  setVaultKeyVersionStatus(version: number, status: VaultKeyVersionRecord['status']): VaultKeyVersionRecord | undefined {
    this.db
      .prepare('UPDATE vault_key_versions SET status = ?, revoked_at = ? WHERE version = ?')
      .run(status, status === 'revoked' ? utcNow() : null, version);
    return this.listVaultKeyVersions().find((item) => item.version === version);
  }

  getActiveVaultKeyVersion(): VaultKeyVersionRecord | undefined {
    return this.listVaultKeyVersions().find((item) => item.status === 'active');
  }

  upsertVaultSecret(input: VaultSecretUpsertInput): VaultSecretRecord {
    const existing = this.db.prepare('SELECT id FROM vault_secrets WHERE name = ?').get(input.name) as
      | { id: string }
      | undefined;
    const now = utcNow();

    if (existing) {
      this.db
        .prepare(
          `UPDATE vault_secrets
           SET category = ?, ciphertext = ?, cipher_nonce = ?, cipher_aad = ?, wrapped_key = ?, wrapped_nonce = ?, key_version = ?, metadata_json = ?, updated_at = ?, rotated_at = ?, revoked_at = NULL
           WHERE id = ?`
        )
        .run(
          input.category,
          input.ciphertext,
          input.cipherNonce,
          input.cipherAad,
          input.wrappedKey,
          input.wrappedNonce,
          input.keyVersion,
          JSON.stringify(input.metadata ?? {}),
          now,
          now,
          existing.id
        );
    } else {
      this.db
        .prepare(
          `INSERT INTO vault_secrets (
            id, name, category, ciphertext, cipher_nonce, cipher_aad, wrapped_key, wrapped_nonce, key_version, metadata_json, created_at, updated_at, rotated_at, revoked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          randomUUID(),
          input.name,
          input.category,
          input.ciphertext,
          input.cipherNonce,
          input.cipherAad,
          input.wrappedKey,
          input.wrappedNonce,
          input.keyVersion,
          JSON.stringify(input.metadata ?? {}),
          now,
          now,
          null,
          null
        );
    }

    const secret = this.getVaultSecret(input.name);
    if (!secret) {
      throw new Error(`Failed to upsert vault secret: ${input.name}`);
    }
    return secret;
  }

  getVaultSecret(name: string): VaultSecretRecord | undefined {
    const row = this.db.prepare('SELECT * FROM vault_secrets WHERE name = ?').get(name) as
      | {
          id: string;
          name: string;
          category: string;
          ciphertext: string;
          cipher_nonce: string;
          cipher_aad: string;
          wrapped_key: string;
          wrapped_nonce: string;
          key_version: number;
          metadata_json: string;
          created_at: string;
          updated_at: string;
          rotated_at: string | null;
          revoked_at: string | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      name: row.name,
      category: row.category,
      ciphertext: row.ciphertext,
      cipherNonce: row.cipher_nonce,
      cipherAad: row.cipher_aad,
      wrappedKey: row.wrapped_key,
      wrappedNonce: row.wrapped_nonce,
      keyVersion: row.key_version,
      metadataJson: row.metadata_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      rotatedAt: row.rotated_at,
      revokedAt: row.revoked_at
    };
  }

  listVaultSecretMetadata(includeRevoked = false): VaultSecretMetadataRecord[] {
    const rows = this.db
      .prepare(
        includeRevoked
          ? 'SELECT * FROM vault_secrets ORDER BY updated_at DESC'
          : 'SELECT * FROM vault_secrets WHERE revoked_at IS NULL ORDER BY updated_at DESC'
      )
      .all() as Array<{
      id: string;
      name: string;
      category: string;
      key_version: number;
      metadata_json: string;
      created_at: string;
      updated_at: string;
      rotated_at: string | null;
      revoked_at: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      keyVersion: row.key_version,
      metadataJson: row.metadata_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      rotatedAt: row.rotated_at,
      revokedAt: row.revoked_at
    }));
  }

  revokeVaultSecret(name: string): VaultSecretMetadataRecord | undefined {
    const now = utcNow();
    this.db
      .prepare('UPDATE vault_secrets SET revoked_at = ?, updated_at = ? WHERE name = ?')
      .run(now, now, name);
    return this.listVaultSecretMetadata(true).find((item) => item.name === name);
  }

  deleteVaultSecret(name: string): boolean {
    const result = this.db.prepare('DELETE FROM vault_secrets WHERE name = ?').run(name);
    return result.changes > 0;
  }

  recordLlmUsageEvent(input: LlmUsageInsertInput): LlmUsageEventRecord {
    const now = utcNow();
    const dayUtc = now.slice(0, 10);
    const monthUtc = now.slice(0, 7);
    const row: LlmUsageEventRecord = {
      id: randomUUID(),
      ts: now,
      dayUtc,
      monthUtc,
      runId: input.runId ?? null,
      sessionId: input.sessionId ?? null,
      runtime: input.runtime,
      provider: input.provider,
      model: input.model,
      taskType: input.taskType,
      attempt: input.attempt,
      status: input.status,
      promptTokens: input.promptTokens ?? null,
      completionTokens: input.completionTokens ?? null,
      totalTokens: input.totalTokens ?? null,
      costUsd: input.costUsd ?? null,
      costConfidence: input.costConfidence,
      metadataJson: JSON.stringify(input.metadata ?? {})
    };

    this.db
      .prepare(
        `INSERT INTO llm_usage_events (
          id, ts, day_utc, month_utc, run_id, session_id, runtime, provider, model, task_type, attempt, status, prompt_tokens, completion_tokens, total_tokens, cost_usd, cost_confidence, metadata_json
        ) VALUES (
          @id, @ts, @dayUtc, @monthUtc, @runId, @sessionId, @runtime, @provider, @model, @taskType, @attempt, @status, @promptTokens, @completionTokens, @totalTokens, @costUsd, @costConfidence, @metadataJson
        )`
      )
      .run(row);

    return row;
  }

  listLlmUsageEvents(limit = 200): LlmUsageEventRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM llm_usage_events ORDER BY ts DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapLlmUsageEventRow(row));
  }

  getProviderUsageSnapshot(input: {
    provider: string;
    dayUtc: string;
    monthUtc: string;
    sinceTs: string;
  }): {
    dayCalls: number;
    minuteCalls: number;
    dayCostUsd: number;
    monthCostUsd: number;
  } {
    const dayCalls = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM llm_usage_events
         WHERE provider = ? AND day_utc = ? AND status != 'blocked_budget'`
      )
      .get(input.provider, input.dayUtc) as { count: number };

    const minuteCalls = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM llm_usage_events
         WHERE provider = ? AND ts >= ? AND status != 'blocked_budget'`
      )
      .get(input.provider, input.sinceTs) as { count: number };

    const dayCostUsd = this.db
      .prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) AS amount
         FROM llm_usage_events
         WHERE provider = ? AND day_utc = ? AND status != 'blocked_budget'`
      )
      .get(input.provider, input.dayUtc) as { amount: number };

    const monthCostUsd = this.db
      .prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) AS amount
         FROM llm_usage_events
         WHERE provider = ? AND month_utc = ? AND status != 'blocked_budget'`
      )
      .get(input.provider, input.monthUtc) as { amount: number };

    return {
      dayCalls: dayCalls.count,
      minuteCalls: minuteCalls.count,
      dayCostUsd: dayCostUsd.amount,
      monthCostUsd: monthCostUsd.amount
    };
  }

  getModelDayCalls(input: { provider: string; model: string; dayUtc: string }): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM llm_usage_events
         WHERE provider = ? AND model = ? AND day_utc = ? AND status != 'blocked_budget'`
      )
      .get(input.provider, input.model, input.dayUtc) as { count: number };
    return row.count;
  }

  getLlmCostsSnapshot(input: { dayUtc: string; monthUtc: string }): {
    providerDaily: Array<{
      provider: string;
      calls: number;
      blocked: number;
      costUsd: number;
    }>;
    providerMonthly: Array<{
      provider: string;
      calls: number;
      blocked: number;
      costUsd: number;
    }>;
    modelDaily: Array<{
      provider: string;
      model: string;
      calls: number;
      blocked: number;
      costUsd: number;
    }>;
    recentEvents: LlmUsageEventRecord[];
  } {
    const providerDaily = this.db
      .prepare(
        `SELECT provider,
                SUM(CASE WHEN status = 'blocked_budget' THEN 0 ELSE 1 END) AS calls,
                SUM(CASE WHEN status = 'blocked_budget' THEN 1 ELSE 0 END) AS blocked,
                COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM llm_usage_events
         WHERE day_utc = ?
         GROUP BY provider
         ORDER BY provider ASC`
      )
      .all(input.dayUtc) as Array<{
      provider: string;
      calls: number;
      blocked: number;
      cost_usd: number;
    }>;

    const providerMonthly = this.db
      .prepare(
        `SELECT provider,
                SUM(CASE WHEN status = 'blocked_budget' THEN 0 ELSE 1 END) AS calls,
                SUM(CASE WHEN status = 'blocked_budget' THEN 1 ELSE 0 END) AS blocked,
                COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM llm_usage_events
         WHERE month_utc = ?
         GROUP BY provider
         ORDER BY provider ASC`
      )
      .all(input.monthUtc) as Array<{
      provider: string;
      calls: number;
      blocked: number;
      cost_usd: number;
    }>;

    const modelDaily = this.db
      .prepare(
        `SELECT provider, model,
                SUM(CASE WHEN status = 'blocked_budget' THEN 0 ELSE 1 END) AS calls,
                SUM(CASE WHEN status = 'blocked_budget' THEN 1 ELSE 0 END) AS blocked,
                COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM llm_usage_events
         WHERE day_utc = ?
         GROUP BY provider, model
         ORDER BY provider ASC, model ASC`
      )
      .all(input.dayUtc) as Array<{
      provider: string;
      model: string;
      calls: number;
      blocked: number;
      cost_usd: number;
    }>;

    return {
      providerDaily: providerDaily.map((row) => ({
        provider: row.provider,
        calls: row.calls,
        blocked: row.blocked,
        costUsd: row.cost_usd
      })),
      providerMonthly: providerMonthly.map((row) => ({
        provider: row.provider,
        calls: row.calls,
        blocked: row.blocked,
        costUsd: row.cost_usd
      })),
      modelDaily: modelDaily.map((row) => ({
        provider: row.provider,
        model: row.model,
        calls: row.calls,
        blocked: row.blocked,
        costUsd: row.cost_usd
      })),
      recentEvents: this.listLlmUsageEvents(100)
    };
  }

  getLlmCostsSnapshotByRange(input: {
    dayStartTs: string;
    dayEndTs: string;
    monthStartTs: string;
    monthEndTs: string;
    recentLimit?: number;
  }): {
    providerDaily: Array<{
      provider: string;
      calls: number;
      blocked: number;
      costUsd: number;
    }>;
    providerMonthly: Array<{
      provider: string;
      calls: number;
      blocked: number;
      costUsd: number;
    }>;
    modelDaily: Array<{
      provider: string;
      model: string;
      calls: number;
      blocked: number;
      costUsd: number;
    }>;
    recentEvents: LlmUsageEventRecord[];
  } {
    const providerDaily = this.db
      .prepare(
        `SELECT provider,
                SUM(CASE WHEN status = 'blocked_budget' THEN 0 ELSE 1 END) AS calls,
                SUM(CASE WHEN status = 'blocked_budget' THEN 1 ELSE 0 END) AS blocked,
                COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM llm_usage_events
         WHERE ts >= ? AND ts < ?
         GROUP BY provider
         ORDER BY provider ASC`
      )
      .all(input.dayStartTs, input.dayEndTs) as Array<{
      provider: string;
      calls: number;
      blocked: number;
      cost_usd: number;
    }>;

    const providerMonthly = this.db
      .prepare(
        `SELECT provider,
                SUM(CASE WHEN status = 'blocked_budget' THEN 0 ELSE 1 END) AS calls,
                SUM(CASE WHEN status = 'blocked_budget' THEN 1 ELSE 0 END) AS blocked,
                COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM llm_usage_events
         WHERE ts >= ? AND ts < ?
         GROUP BY provider
         ORDER BY provider ASC`
      )
      .all(input.monthStartTs, input.monthEndTs) as Array<{
      provider: string;
      calls: number;
      blocked: number;
      cost_usd: number;
    }>;

    const modelDaily = this.db
      .prepare(
        `SELECT provider, model,
                SUM(CASE WHEN status = 'blocked_budget' THEN 0 ELSE 1 END) AS calls,
                SUM(CASE WHEN status = 'blocked_budget' THEN 1 ELSE 0 END) AS blocked,
                COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM llm_usage_events
         WHERE ts >= ? AND ts < ?
         GROUP BY provider, model
         ORDER BY provider ASC, model ASC`
      )
      .all(input.dayStartTs, input.dayEndTs) as Array<{
      provider: string;
      model: string;
      calls: number;
      blocked: number;
      cost_usd: number;
    }>;

    const safeRecentLimit = Math.max(1, Math.min(500, Math.floor(input.recentLimit ?? 100)));
    const recentRows = this.db
      .prepare(
        `SELECT *
         FROM llm_usage_events
         WHERE ts >= ? AND ts < ?
         ORDER BY ts DESC
         LIMIT ?`
      )
      .all(input.dayStartTs, input.dayEndTs, safeRecentLimit) as Array<Record<string, unknown>>;

    return {
      providerDaily: providerDaily.map((row) => ({
        provider: row.provider,
        calls: row.calls,
        blocked: row.blocked,
        costUsd: row.cost_usd
      })),
      providerMonthly: providerMonthly.map((row) => ({
        provider: row.provider,
        calls: row.calls,
        blocked: row.blocked,
        costUsd: row.cost_usd
      })),
      modelDaily: modelDaily.map((row) => ({
        provider: row.provider,
        model: row.model,
        calls: row.calls,
        blocked: row.blocked,
        costUsd: row.cost_usd
      })),
      recentEvents: recentRows.map((row) => this.mapLlmUsageEventRow(row))
    };
  }

  getLlmLimits(): LlmLimitsRecord | null {
    const row = this.db.prepare('SELECT * FROM llm_limits WHERE id = ?').get('default') as
      | {
          id: string;
          limits_json: string;
          updated_at: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      limitsJson: row.limits_json,
      updatedAt: row.updated_at
    };
  }

  upsertLlmLimits(limits: Record<string, unknown>): LlmLimitsRecord {
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO llm_limits (id, limits_json, updated_at)
         VALUES ('default', ?, ?)
         ON CONFLICT(id) DO UPDATE SET limits_json = excluded.limits_json, updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(limits), now);
    return this.getLlmLimits()!;
  }

  getRuntimeConfigOverlay(): RuntimeConfigOverlayRecord | null {
    const row = this.db.prepare('SELECT * FROM runtime_config_state WHERE id = ?').get('default') as
      | {
          id: string;
          config_json: string;
          updated_at: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      configJson: row.config_json,
      updatedAt: row.updated_at
    };
  }

  upsertRuntimeConfigOverlay(config: Record<string, unknown>): RuntimeConfigOverlayRecord {
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO runtime_config_state (id, config_json, updated_at)
         VALUES ('default', ?, ?)
         ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(config), now);
    return this.getRuntimeConfigOverlay()!;
  }

  getRuntimeStateSnapshot(id: string): RuntimeStateSnapshotRecord | null {
    const normalizedId = id.trim();
    if (!normalizedId) {
      return null;
    }
    const row = this.db.prepare('SELECT * FROM runtime_config_state WHERE id = ?').get(normalizedId) as
      | {
          id: string;
          config_json: string;
          updated_at: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      configJson: row.config_json,
      updatedAt: row.updated_at
    };
  }

  upsertRuntimeStateSnapshot(id: string, state: Record<string, unknown>): RuntimeStateSnapshotRecord {
    const normalizedId = id.trim();
    if (!normalizedId) {
      throw new Error('Runtime state snapshot id is required');
    }
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO runtime_config_state (id, config_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`
      )
      .run(normalizedId, JSON.stringify(state), now);
    return this.getRuntimeStateSnapshot(normalizedId)!;
  }

  getWatchdogConfig(): WatchdogConfigRecord | null {
    const row = this.db.prepare('SELECT * FROM watchdog_config WHERE id = ?').get('default') as
      | { id: string; config_json: string; updated_at: string }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      configJson: row.config_json,
      updatedAt: row.updated_at
    };
  }

  upsertWatchdogConfig(config: Record<string, unknown>): WatchdogConfigRecord {
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO watchdog_config (id, config_json, updated_at)
         VALUES ('default', ?, ?)
         ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(config), now);
    return this.getWatchdogConfig()!;
  }

  createWatchdogRecoveryJob(input: WatchdogRecoveryJobCreateInput): WatchdogRecoveryJobRecord {
    const record: WatchdogRecoveryJobRecord = {
      id: input.id ?? randomUUID(),
      rootRunId: input.rootRunId,
      triggerRunId: input.triggerRunId,
      replacementRunId: input.replacementRunId,
      sessionId: input.sessionId,
      queueItemId: input.queueItemId ?? null,
      action: input.action,
      attempt: Math.max(1, Math.floor(input.attempt)),
      dueAt: input.dueAt,
      status: input.status ?? 'scheduled',
      statusReason: input.statusReason ?? null,
      detailsJson: JSON.stringify(input.details ?? {}),
      createdAt: utcNow(),
      updatedAt: utcNow()
    };

    this.db
      .prepare(
        `INSERT INTO watchdog_recovery_jobs (
          id,
          root_run_id,
          trigger_run_id,
          replacement_run_id,
          session_id,
          queue_item_id,
          action,
          attempt,
          due_at,
          status,
          status_reason,
          details_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.rootRunId,
        record.triggerRunId,
        record.replacementRunId,
        record.sessionId,
        record.queueItemId,
        record.action,
        record.attempt,
        record.dueAt,
        record.status,
        record.statusReason,
        record.detailsJson,
        record.createdAt,
        record.updatedAt
      );

    return this.getWatchdogRecoveryJobById(record.id)!;
  }

  getWatchdogRecoveryJobById(id: string): WatchdogRecoveryJobRecord | null {
    const row = this.db.prepare('SELECT * FROM watchdog_recovery_jobs WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapWatchdogRecoveryJobRow(row) : null;
  }

  listWatchdogRecoveryJobs(input?: {
    rootRunId?: string;
    triggerRunId?: string;
    replacementRunId?: string;
    sessionId?: string;
    statuses?: WatchdogRecoveryJobRecord['status'][];
    limit?: number;
  }): WatchdogRecoveryJobRecord[] {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (input?.rootRunId) {
      where.push('root_run_id = ?');
      params.push(input.rootRunId);
    }
    if (input?.triggerRunId) {
      where.push('trigger_run_id = ?');
      params.push(input.triggerRunId);
    }
    if (input?.replacementRunId) {
      where.push('replacement_run_id = ?');
      params.push(input.replacementRunId);
    }
    if (input?.sessionId) {
      where.push('session_id = ?');
      params.push(input.sessionId);
    }
    if (input?.statuses && input.statuses.length > 0) {
      where.push(`status IN (${input.statuses.map(() => '?').join(', ')})`);
      params.push(...input.statuses);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(5_000, Math.floor(input?.limit ?? 500)));
    const rows = this.db
      .prepare(
        `SELECT *
         FROM watchdog_recovery_jobs
         ${whereSql}
         ORDER BY due_at DESC, created_at DESC
         LIMIT ?`
      )
      .all(...params, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapWatchdogRecoveryJobRow(row));
  }

  maxWatchdogRecoveryAttempt(rootRunId: string): number {
    const row = this.db
      .prepare(
        `SELECT MAX(attempt) AS attempt
         FROM watchdog_recovery_jobs
         WHERE root_run_id = ?`
      )
      .get(rootRunId) as { attempt: number | null };
    return Number.isFinite(Number(row.attempt)) ? Number(row.attempt) : 0;
  }

  updateWatchdogRecoveryJobStatus(input: WatchdogRecoveryJobStatusUpdateInput): WatchdogRecoveryJobRecord {
    const existing = this.getWatchdogRecoveryJobById(input.id);
    if (!existing) {
      throw new Error(`Watchdog recovery job not found: ${input.id}`);
    }
    const nextDetails =
      input.details === undefined
        ? existing.detailsJson
        : JSON.stringify({
            ...parseJsonSafe<Record<string, unknown>>(existing.detailsJson, {}),
            ...input.details
          });
    this.db
      .prepare(
        `UPDATE watchdog_recovery_jobs
         SET status = ?, status_reason = ?, queue_item_id = ?, details_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.status,
        input.statusReason ?? existing.statusReason,
        input.queueItemId === undefined ? existing.queueItemId : input.queueItemId,
        nextDetails,
        utcNow(),
        input.id
      );
    return this.getWatchdogRecoveryJobById(input.id)!;
  }

  appendWatchdogHistory(input: WatchdogHistoryAppendInput): WatchdogHistoryRecord {
    const record: WatchdogHistoryRecord = {
      id: randomUUID(),
      runId: input.runId,
      status: input.status,
      detectedPattern: input.detectedPattern ?? null,
      matchedSignature: input.matchedSignature ?? null,
      recommendation: input.recommendation,
      action: input.action ?? null,
      detailsJson: JSON.stringify(input.details ?? {}),
      createdAt: utcNow()
    };
    this.db
      .prepare(
        `INSERT INTO watchdog_history (
          id, run_id, status, detected_pattern, matched_signature, recommendation, action, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.runId,
        record.status,
        record.detectedPattern,
        record.matchedSignature,
        record.recommendation,
        record.action,
        record.detailsJson,
        record.createdAt
      );
    return record;
  }

  listWatchdogHistory(input?: { runId?: string; limit?: number }): WatchdogHistoryRecord[] {
    const limit = Math.max(1, Math.min(2000, Math.floor(input?.limit ?? 500)));
    const rows =
      input?.runId && input.runId.trim().length > 0
        ? (this.db
            .prepare(
              `SELECT * FROM watchdog_history
               WHERE run_id = ?
               ORDER BY created_at DESC
               LIMIT ?`
            )
            .all(input.runId.trim(), limit) as Array<Record<string, unknown>>)
        : (this.db
            .prepare(
              `SELECT * FROM watchdog_history
               ORDER BY created_at DESC
               LIMIT ?`
            )
            .all(limit) as Array<Record<string, unknown>>);
    return rows.map((row) => this.mapWatchdogHistoryRow(row));
  }

  appendCronRunHistory(input: {
    jobName: string;
    trigger: string;
    status: string;
    details?: Record<string, unknown>;
  }): void {
    this.db
      .prepare(
        `INSERT INTO cron_run_history (id, job_name, trigger, status, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        input.jobName,
        input.trigger,
        input.status,
        JSON.stringify(input.details ?? {}),
        utcNow()
      );
  }

  listCronRunHistory(limit = 200): Array<{
    id: string;
    jobName: string;
    trigger: string;
    status: string;
    detailsJson: string;
    createdAt: string;
  }> {
    const rows = this.db
      .prepare(
        `SELECT * FROM cron_run_history
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(Math.max(1, Math.min(2000, Math.floor(limit)))) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      jobName: String(row.job_name),
      trigger: String(row.trigger),
      status: String(row.status),
      detailsJson: String(row.details_json ?? '{}'),
      createdAt: String(row.created_at)
    }));
  }

  upsertScheduleJob(input: ScheduleJobUpsertInput): ScheduleRecord {
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO schedule_jobs (
          id, label, category, kind, cadence_kind, cadence, timezone, enabled, paused_at, paused_by, requested_by,
          requesting_session_id, origin_ref_json, target_agent_id, session_target, delivery_target,
          delivery_target_session_id, prompt, runtime, model, job_mode, approval_profile, concurrency_policy,
          domain_policy_json, rate_limit_policy_json, last_run_at, next_run_at, last_status, last_error,
          last_result_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          category = excluded.category,
          cadence_kind = excluded.cadence_kind,
          cadence = excluded.cadence,
          timezone = excluded.timezone,
          enabled = excluded.enabled,
          paused_at = excluded.paused_at,
          paused_by = excluded.paused_by,
          requested_by = excluded.requested_by,
          requesting_session_id = excluded.requesting_session_id,
          origin_ref_json = excluded.origin_ref_json,
          target_agent_id = excluded.target_agent_id,
          session_target = excluded.session_target,
          delivery_target = excluded.delivery_target,
          delivery_target_session_id = excluded.delivery_target_session_id,
          prompt = excluded.prompt,
          runtime = excluded.runtime,
          model = excluded.model,
          job_mode = excluded.job_mode,
          approval_profile = excluded.approval_profile,
          concurrency_policy = excluded.concurrency_policy,
          domain_policy_json = excluded.domain_policy_json,
          rate_limit_policy_json = excluded.rate_limit_policy_json,
          last_run_at = excluded.last_run_at,
          next_run_at = excluded.next_run_at,
          last_status = excluded.last_status,
          last_error = excluded.last_error,
          last_result_json = excluded.last_result_json,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at`
      )
      .run(
        input.id,
        input.label,
        input.category,
        input.kind,
        input.cadenceKind,
        input.cadence,
        input.timezone ?? 'UTC',
        input.enabled === false ? 0 : 1,
        input.pausedAt ?? null,
        input.pausedBy ?? null,
        input.requestedBy ?? null,
        input.requestingSessionId ?? null,
        JSON.stringify(input.originRef ?? {}),
        input.targetAgentId ?? null,
        input.sessionTarget ?? 'origin_session',
        input.deliveryTarget ?? 'origin_session',
        input.deliveryTargetSessionId ?? null,
        input.prompt ?? null,
        input.runtime ?? null,
        input.model ?? null,
        input.jobMode ?? null,
        input.approvalProfile ?? null,
        input.concurrencyPolicy ?? 'skip',
        JSON.stringify(input.domainPolicy ?? {}),
        JSON.stringify(input.rateLimitPolicy ?? {}),
        input.lastRunAt ?? null,
        input.nextRunAt ?? null,
        input.lastStatus ?? null,
        input.lastError ?? null,
        JSON.stringify(input.lastResult ?? {}),
        JSON.stringify(input.metadata ?? {}),
        now,
        now
      );
    return this.getScheduleJobById(input.id)!;
  }

  getScheduleJobById(id: string): ScheduleRecord | null {
    const row = this.db.prepare('SELECT * FROM schedule_jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapScheduleJobRow(row) : null;
  }

  listScheduleJobs(input?: ScheduleJobListInput): ScheduleRecord[] {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (input?.kinds && input.kinds.length > 0) {
      where.push(`kind IN (${input.kinds.map(() => '?').join(', ')})`);
      params.push(...input.kinds);
    }
    if (typeof input?.enabled === 'boolean') {
      where.push('enabled = ?');
      params.push(input.enabled ? 1 : 0);
    }
    if (input?.category) {
      where.push('category = ?');
      params.push(input.category);
    }
    if (input?.requestedBy) {
      where.push('requested_by = ?');
      params.push(input.requestedBy);
    }
    if (input?.targetAgentId) {
      where.push('target_agent_id = ?');
      params.push(input.targetAgentId);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(5000, Math.floor(input?.limit ?? 500)));
    const rows = this.db
      .prepare(
        `SELECT *
         FROM schedule_jobs
         ${whereSql}
         ORDER BY
           CASE WHEN next_run_at IS NULL THEN 1 ELSE 0 END,
           next_run_at ASC,
           updated_at DESC
         LIMIT ?`
      )
      .all(...params, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapScheduleJobRow(row));
  }

  updateScheduleJob(id: string, input: ScheduleJobUpdateInput): ScheduleRecord {
    const existing = this.getScheduleJobById(id);
    if (!existing) {
      throw new Error(`Schedule job not found: ${id}`);
    }
    this.db
      .prepare(
        `UPDATE schedule_jobs SET
          label = ?, category = ?, cadence_kind = ?, cadence = ?, timezone = ?, enabled = ?, paused_at = ?, paused_by = ?,
          requested_by = ?, requesting_session_id = ?, origin_ref_json = ?, target_agent_id = ?, session_target = ?,
          delivery_target = ?, delivery_target_session_id = ?, prompt = ?, runtime = ?, model = ?, job_mode = ?,
          approval_profile = ?, concurrency_policy = ?, domain_policy_json = ?, rate_limit_policy_json = ?,
          last_run_at = ?, next_run_at = ?, last_status = ?, last_error = ?, last_result_json = ?, metadata_json = ?,
          updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.label ?? existing.label,
        input.category ?? existing.category,
        input.cadenceKind ?? existing.cadenceKind,
        input.cadence ?? existing.cadence,
        input.timezone ?? existing.timezone,
        typeof input.enabled === 'boolean' ? (input.enabled ? 1 : 0) : existing.enabled ? 1 : 0,
        input.pausedAt === undefined ? existing.pausedAt : input.pausedAt,
        input.pausedBy === undefined ? existing.pausedBy : input.pausedBy,
        input.requestedBy === undefined ? existing.requestedBy : input.requestedBy,
        input.requestingSessionId === undefined ? existing.requestingSessionId : input.requestingSessionId,
        input.originRef === undefined ? existing.originRefJson : JSON.stringify(input.originRef ?? {}),
        input.targetAgentId === undefined ? existing.targetAgentId : input.targetAgentId,
        input.sessionTarget ?? existing.sessionTarget,
        input.deliveryTarget ?? existing.deliveryTarget,
        input.deliveryTargetSessionId === undefined ? existing.deliveryTargetSessionId : input.deliveryTargetSessionId,
        input.prompt === undefined ? existing.prompt : input.prompt,
        input.runtime === undefined ? existing.runtime : input.runtime,
        input.model === undefined ? existing.model : input.model,
        input.jobMode === undefined ? existing.jobMode : input.jobMode,
        input.approvalProfile === undefined ? existing.approvalProfile : input.approvalProfile,
        input.concurrencyPolicy ?? existing.concurrencyPolicy,
        input.domainPolicy === undefined ? existing.domainPolicyJson : JSON.stringify(input.domainPolicy ?? {}),
        input.rateLimitPolicy === undefined ? existing.rateLimitPolicyJson : JSON.stringify(input.rateLimitPolicy ?? {}),
        input.lastRunAt === undefined ? existing.lastRunAt : input.lastRunAt,
        input.nextRunAt === undefined ? existing.nextRunAt : input.nextRunAt,
        input.lastStatus === undefined ? existing.lastStatus : input.lastStatus,
        input.lastError === undefined ? existing.lastError : input.lastError,
        input.lastResult === undefined ? existing.lastResultJson : JSON.stringify(input.lastResult ?? {}),
        input.metadata === undefined ? existing.metadataJson : JSON.stringify(input.metadata ?? {}),
        utcNow(),
        id
      );
    return this.getScheduleJobById(id)!;
  }

  deleteScheduleJob(id: string): boolean {
    const result = this.db.prepare('DELETE FROM schedule_jobs WHERE id = ?').run(id);
    return result.changes > 0;
  }

  appendScheduleRunHistory(input: ScheduleRunHistoryAppendInput): ScheduleRunHistoryRecord {
    const now = utcNow();
    const recordId = input.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO schedule_run_history (
          id, schedule_id, trigger, status, run_id, session_id, requested_by, delivery_target, summary, details_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        recordId,
        input.scheduleId,
        input.trigger,
        input.status,
        input.runId ?? null,
        input.sessionId ?? null,
        input.requestedBy ?? null,
        input.deliveryTarget,
        input.summary ?? null,
        JSON.stringify(input.details ?? {}),
        now,
        now
      );
    return this.getScheduleRunHistoryById(recordId)!;
  }

  getScheduleRunHistoryById(id: string): ScheduleRunHistoryRecord | null {
    const row = this.db.prepare('SELECT * FROM schedule_run_history WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapScheduleRunHistoryRow(row) : null;
  }

  getLatestScheduleRunHistoryByRunId(runId: string): ScheduleRunHistoryRecord | null {
    const normalizedRunId = runId.trim();
    if (!normalizedRunId) {
      return null;
    }
    const row = this.db
      .prepare(
        `SELECT *
         FROM schedule_run_history
         WHERE run_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(normalizedRunId) as Record<string, unknown> | undefined;
    return row ? this.mapScheduleRunHistoryRow(row) : null;
  }

  updateScheduleRunHistory(input: ScheduleRunHistoryUpdateInput): ScheduleRunHistoryRecord {
    const existing = this.getScheduleRunHistoryById(input.id);
    if (!existing) {
      throw new Error(`Schedule run history not found: ${input.id}`);
    }
    const nextDetails =
      input.details === undefined
        ? existing.detailsJson
        : JSON.stringify({
            ...parseJsonSafe<Record<string, unknown>>(existing.detailsJson, {}),
            ...input.details
          });
    this.db
      .prepare(
        `UPDATE schedule_run_history SET
          status = ?, run_id = ?, session_id = ?, requested_by = ?, delivery_target = ?, summary = ?, details_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.status ?? existing.status,
        input.runId === undefined ? existing.runId : input.runId,
        input.sessionId === undefined ? existing.sessionId : input.sessionId,
        input.requestedBy === undefined ? existing.requestedBy : input.requestedBy,
        input.deliveryTarget ?? existing.deliveryTarget,
        input.summary === undefined ? existing.summary : input.summary,
        nextDetails,
        utcNow(),
        input.id
      );
    return this.getScheduleRunHistoryById(input.id)!;
  }

  listScheduleRunHistory(input?: { scheduleId?: string; limit?: number }): ScheduleRunHistoryRecord[] {
    const limit = Math.max(1, Math.min(5000, Math.floor(input?.limit ?? 500)));
    const rows =
      input?.scheduleId && input.scheduleId.trim().length > 0
        ? (this.db
            .prepare(
              `SELECT *
               FROM schedule_run_history
               WHERE schedule_id = ?
               ORDER BY created_at DESC
               LIMIT ?`
            )
            .all(input.scheduleId.trim(), limit) as Array<Record<string, unknown>>)
        : (this.db
            .prepare(
              `SELECT *
               FROM schedule_run_history
               ORDER BY created_at DESC
               LIMIT ?`
            )
            .all(limit) as Array<Record<string, unknown>>);
    return rows.map((row) => this.mapScheduleRunHistoryRow(row));
  }

  upsertBrowserCookieJar(input: BrowserCookieJarUpsertInput): BrowserCookieJarRecord {
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO browser_cookie_jars (
          id, label, domains_json, source_kind, cookies_json, notes, revoked_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          domains_json = excluded.domains_json,
          source_kind = excluded.source_kind,
          cookies_json = excluded.cookies_json,
          notes = excluded.notes,
          revoked_at = excluded.revoked_at,
          updated_at = excluded.updated_at`
      )
      .run(
        input.id,
        input.label,
        JSON.stringify(input.domains),
        input.sourceKind,
        JSON.stringify(input.cookies),
        input.notes ?? null,
        input.revokedAt ?? null,
        now,
        now
      );
    return this.getBrowserCookieJarById(input.id)!;
  }

  getBrowserCookieJarById(id: string): BrowserCookieJarRecord | null {
    const row = this.db.prepare('SELECT * FROM browser_cookie_jars WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapBrowserCookieJarRow(row) : null;
  }

  listBrowserCookieJars(input?: { includeRevoked?: boolean; limit?: number }): BrowserCookieJarRecord[] {
    const includeRevoked = input?.includeRevoked === true;
    const limit = Math.max(1, Math.min(1000, Math.floor(input?.limit ?? 500)));
    const rows = this.db
      .prepare(
        `SELECT *
         FROM browser_cookie_jars
         ${includeRevoked ? '' : 'WHERE revoked_at IS NULL'}
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapBrowserCookieJarRow(row));
  }

  revokeBrowserCookieJar(id: string): BrowserCookieJarRecord | null {
    this.db.prepare('UPDATE browser_cookie_jars SET revoked_at = ?, updated_at = ? WHERE id = ?').run(utcNow(), utcNow(), id);
    return this.getBrowserCookieJarById(id);
  }

  upsertBrowserHeaderProfile(input: BrowserHeaderProfileUpsertInput): BrowserHeaderProfileRecord {
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO browser_header_profiles (
          id, label, domains_json, headers_json, notes, revoked_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          domains_json = excluded.domains_json,
          headers_json = excluded.headers_json,
          notes = excluded.notes,
          revoked_at = excluded.revoked_at,
          updated_at = excluded.updated_at`
      )
      .run(input.id, input.label, JSON.stringify(input.domains), JSON.stringify(input.headers), input.notes ?? null, input.revokedAt ?? null, now, now);
    return this.getBrowserHeaderProfileById(input.id)!;
  }

  getBrowserHeaderProfileById(id: string): BrowserHeaderProfileRecord | null {
    const row = this.db.prepare('SELECT * FROM browser_header_profiles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapBrowserHeaderProfileRow(row) : null;
  }

  listBrowserHeaderProfiles(input?: { includeRevoked?: boolean; limit?: number }): BrowserHeaderProfileRecord[] {
    const includeRevoked = input?.includeRevoked === true;
    const limit = Math.max(1, Math.min(1000, Math.floor(input?.limit ?? 500)));
    const rows = this.db
      .prepare(
        `SELECT *
         FROM browser_header_profiles
         ${includeRevoked ? '' : 'WHERE revoked_at IS NULL'}
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapBrowserHeaderProfileRow(row));
  }

  revokeBrowserHeaderProfile(id: string): BrowserHeaderProfileRecord | null {
    this.db.prepare('UPDATE browser_header_profiles SET revoked_at = ?, updated_at = ? WHERE id = ?').run(utcNow(), utcNow(), id);
    return this.getBrowserHeaderProfileById(id);
  }

  upsertBrowserProxyProfile(input: BrowserProxyProfileUpsertInput): BrowserProxyProfileRecord {
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO browser_proxy_profiles (
          id, label, domains_json, proxy_json, notes, revoked_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          domains_json = excluded.domains_json,
          proxy_json = excluded.proxy_json,
          notes = excluded.notes,
          revoked_at = excluded.revoked_at,
          updated_at = excluded.updated_at`
      )
      .run(input.id, input.label, JSON.stringify(input.domains), JSON.stringify(input.proxy), input.notes ?? null, input.revokedAt ?? null, now, now);
    return this.getBrowserProxyProfileById(input.id)!;
  }

  getBrowserProxyProfileById(id: string): BrowserProxyProfileRecord | null {
    const row = this.db.prepare('SELECT * FROM browser_proxy_profiles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapBrowserProxyProfileRow(row) : null;
  }

  listBrowserProxyProfiles(input?: { includeRevoked?: boolean; limit?: number }): BrowserProxyProfileRecord[] {
    const includeRevoked = input?.includeRevoked === true;
    const limit = Math.max(1, Math.min(1000, Math.floor(input?.limit ?? 500)));
    const rows = this.db
      .prepare(
        `SELECT *
         FROM browser_proxy_profiles
         ${includeRevoked ? '' : 'WHERE revoked_at IS NULL'}
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapBrowserProxyProfileRow(row));
  }

  revokeBrowserProxyProfile(id: string): BrowserProxyProfileRecord | null {
    this.db.prepare('UPDATE browser_proxy_profiles SET revoked_at = ?, updated_at = ? WHERE id = ?').run(utcNow(), utcNow(), id);
    return this.getBrowserProxyProfileById(id);
  }

  upsertBrowserStorageState(input: BrowserStorageStateUpsertInput): BrowserStorageStateRecord {
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO browser_storage_states (
          id, label, domains_json, storage_state_json, notes, revoked_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          domains_json = excluded.domains_json,
          storage_state_json = excluded.storage_state_json,
          notes = excluded.notes,
          revoked_at = excluded.revoked_at,
          updated_at = excluded.updated_at`
      )
      .run(
        input.id,
        input.label,
        JSON.stringify(input.domains),
        JSON.stringify(input.storageState),
        input.notes ?? null,
        input.revokedAt ?? null,
        now,
        now
      );
    return this.getBrowserStorageStateById(input.id)!;
  }

  getBrowserStorageStateById(id: string): BrowserStorageStateRecord | null {
    const row = this.db.prepare('SELECT * FROM browser_storage_states WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapBrowserStorageStateRow(row) : null;
  }

  listBrowserStorageStates(input?: { includeRevoked?: boolean; limit?: number }): BrowserStorageStateRecord[] {
    const includeRevoked = input?.includeRevoked === true;
    const limit = Math.max(1, Math.min(1000, Math.floor(input?.limit ?? 500)));
    const rows = this.db
      .prepare(
        `SELECT *
         FROM browser_storage_states
         ${includeRevoked ? '' : 'WHERE revoked_at IS NULL'}
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapBrowserStorageStateRow(row));
  }

  revokeBrowserStorageState(id: string): BrowserStorageStateRecord | null {
    this.db.prepare('UPDATE browser_storage_states SET revoked_at = ?, updated_at = ? WHERE id = ?').run(utcNow(), utcNow(), id);
    return this.getBrowserStorageStateById(id);
  }

  upsertBrowserSessionProfile(input: BrowserSessionProfileUpsertInput): BrowserSessionProfileRecord {
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO browser_session_profiles (
          id, label, domains_json, cookie_jar_id, headers_profile_id, proxy_profile_id, storage_state_id,
          use_real_chrome, owner_label, visibility, allowed_session_ids_json, site_key,
          browser_kind, browser_profile_name, browser_profile_path,
          locale, country_code, timezone_id, notes, enabled,
          last_verified_at, last_verification_status, last_verification_summary, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          domains_json = excluded.domains_json,
          cookie_jar_id = excluded.cookie_jar_id,
          headers_profile_id = excluded.headers_profile_id,
          proxy_profile_id = excluded.proxy_profile_id,
          storage_state_id = excluded.storage_state_id,
          use_real_chrome = excluded.use_real_chrome,
          owner_label = excluded.owner_label,
          visibility = excluded.visibility,
          allowed_session_ids_json = excluded.allowed_session_ids_json,
          site_key = excluded.site_key,
          browser_kind = excluded.browser_kind,
          browser_profile_name = excluded.browser_profile_name,
          browser_profile_path = excluded.browser_profile_path,
          locale = excluded.locale,
          country_code = excluded.country_code,
          timezone_id = excluded.timezone_id,
          notes = excluded.notes,
          enabled = excluded.enabled,
          last_verified_at = excluded.last_verified_at,
          last_verification_status = excluded.last_verification_status,
          last_verification_summary = excluded.last_verification_summary,
          updated_at = excluded.updated_at`
      )
      .run(
        input.id,
        input.label,
        JSON.stringify(input.domains),
        input.cookieJarId ?? null,
        input.headersProfileId ?? null,
        input.proxyProfileId ?? null,
        input.storageStateId ?? null,
        input.useRealChrome === true ? 1 : 0,
        input.ownerLabel ?? null,
        input.visibility === 'session_only' ? 'session_only' : 'shared',
        JSON.stringify(input.allowedSessionIds ?? []),
        input.siteKey ?? null,
        input.browserKind ?? null,
        input.browserProfileName ?? null,
        input.browserProfilePath ?? null,
        input.locale ?? null,
        input.countryCode ?? null,
        input.timezoneId ?? null,
        input.notes ?? null,
        input.enabled === false ? 0 : 1,
        input.lastVerifiedAt ?? null,
        input.lastVerificationStatus ?? 'unknown',
        input.lastVerificationSummary ?? null,
        now,
        now
      );
    return this.getBrowserSessionProfileById(input.id)!;
  }

  updateBrowserSessionProfileVerification(input: {
    id: string;
    lastVerifiedAt: string | null;
    lastVerificationStatus: BrowserSessionProfileRecord['lastVerificationStatus'];
    lastVerificationSummary?: string | null;
  }): BrowserSessionProfileRecord | null {
    this.db
      .prepare(
        `UPDATE browser_session_profiles
         SET last_verified_at = ?, last_verification_status = ?, last_verification_summary = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.lastVerifiedAt ?? null,
        input.lastVerificationStatus,
        input.lastVerificationSummary ?? null,
        utcNow(),
        input.id
      );
    return this.getBrowserSessionProfileById(input.id);
  }

  getBrowserSessionProfileById(id: string): BrowserSessionProfileRecord | null {
    const row = this.db.prepare('SELECT * FROM browser_session_profiles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapBrowserSessionProfileRow(row) : null;
  }

  listBrowserSessionProfiles(input?: { enabled?: boolean; limit?: number }): BrowserSessionProfileRecord[] {
    const where: string[] = [];
    const params: Array<number> = [];
    if (typeof input?.enabled === 'boolean') {
      where.push('enabled = ?');
      params.push(input.enabled ? 1 : 0);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(1000, Math.floor(input?.limit ?? 500)));
    const rows = this.db
      .prepare(
        `SELECT *
         FROM browser_session_profiles
         ${whereSql}
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(...params, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapBrowserSessionProfileRow(row));
  }

  deleteBrowserSessionProfile(id: string): boolean {
    const result = this.db.prepare('DELETE FROM browser_session_profiles WHERE id = ?').run(id);
    return Number(result.changes ?? 0) > 0;
  }

  upsertBrowserFetchCache(input: BrowserFetchCacheUpsertInput): BrowserFetchCacheRecord {
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO browser_fetch_cache (
          id, cache_key, url, tool, extraction_mode, main_content_only, artifact_path, preview_text, summary_json, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          url = excluded.url,
          tool = excluded.tool,
          extraction_mode = excluded.extraction_mode,
          main_content_only = excluded.main_content_only,
          artifact_path = excluded.artifact_path,
          preview_text = excluded.preview_text,
          summary_json = excluded.summary_json,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at`
      )
      .run(
        input.id,
        input.cacheKey,
        input.url,
        input.tool,
        input.extractionMode,
        input.mainContentOnly ? 1 : 0,
        input.artifactPath,
        input.previewText,
        JSON.stringify(input.summary),
        input.expiresAt,
        now,
        now
      );
    return this.getBrowserFetchCacheByKey(input.cacheKey)!;
  }

  getBrowserFetchCacheByKey(cacheKey: string): BrowserFetchCacheRecord | null {
    const row = this.db.prepare('SELECT * FROM browser_fetch_cache WHERE cache_key = ?').get(cacheKey) as Record<string, unknown> | undefined;
    return row ? this.mapBrowserFetchCacheRow(row) : null;
  }

  pruneExpiredBrowserFetchCache(nowIso = utcNow()): number {
    const result = this.db.prepare('DELETE FROM browser_fetch_cache WHERE expires_at <= ?').run(nowIso);
    return Number(result.changes ?? 0);
  }

  appendStartupHealerAudit(input: { status: string; details?: Record<string, unknown> }): void {
    this.db
      .prepare(
        `INSERT INTO startup_healer_audit (id, status, details_json, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(randomUUID(), input.status, JSON.stringify(input.details ?? {}), utcNow());
  }

  listStartupHealerAudit(limit = 100): Array<{ id: string; status: string; detailsJson: string; createdAt: string }> {
    const rows = this.db
      .prepare(
        `SELECT * FROM startup_healer_audit
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(Math.max(1, Math.min(1000, Math.floor(limit)))) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      status: String(row.status),
      detailsJson: String(row.details_json ?? '{}'),
      createdAt: String(row.created_at)
    }));
  }

  createCompoundingLearning(input: CompoundingLearningCreateInput): CompoundingLearningRecord {
    const record: CompoundingLearningRecord = {
      id: input.id ?? randomUUID(),
      agentId: input.agentId,
      runId: input.runId,
      sessionId: input.sessionId,
      category: input.category,
      insight: input.insight,
      evidence: input.evidence ?? '',
      significance: Math.max(1, Math.min(5, Math.floor(input.significance ?? 3))),
      applied: input.applied === true,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      createdAt: utcNow()
    };
    this.db
      .prepare(
        `INSERT INTO compounding_learnings (
          id, agent_id, run_id, session_id, category, insight, evidence, significance, applied, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.agentId,
        record.runId,
        record.sessionId,
        record.category,
        record.insight,
        record.evidence,
        record.significance,
        record.applied ? 1 : 0,
        record.metadataJson,
        record.createdAt
      );
    return record;
  }

  listCompoundingLearnings(input?: {
    agentId?: string;
    category?: CompoundingLearningRecord['category'];
    limit?: number;
  }): CompoundingLearningRecord[] {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (input?.agentId) {
      where.push('agent_id = ?');
      params.push(input.agentId);
    }
    if (input?.category) {
      where.push('category = ?');
      params.push(input.category);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `SELECT * FROM compounding_learnings
         ${whereSql}
         ORDER BY significance DESC, created_at DESC
         LIMIT ?`
      )
      .all(...params, Math.max(1, Math.min(2000, Math.floor(input?.limit ?? 500)))) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapCompoundingLearningRow(row));
  }

  markCompoundingLearningsApplied(ids: string[]): void {
    if (ids.length === 0) {
      return;
    }
    const placeholders = ids.map(() => '?').join(', ');
    this.db
      .prepare(`UPDATE compounding_learnings SET applied = 1 WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  pruneCompoundingLearnings(agentId: string, keepLimit: number): number {
    const safeLimit = Math.max(1, Math.min(2000, Math.floor(keepLimit)));
    return this.db
      .prepare(
        `DELETE FROM compounding_learnings
         WHERE agent_id = ?
           AND id NOT IN (
             SELECT id
             FROM compounding_learnings
             WHERE agent_id = ?
             ORDER BY significance DESC, created_at DESC
             LIMIT ?
           )`
      )
      .run(agentId, agentId, safeLimit).changes;
  }

  createImprovementProposal(input: ImprovementProposalCreateInput): ImprovementProposalRecord {
    const now = utcNow();
    const record: ImprovementProposalRecord = {
      id: input.id ?? randomUUID(),
      agentId: input.agentId,
      proposedChangesJson: JSON.stringify(input.proposedChanges),
      reasoning: input.reasoning,
      learningIdsJson: JSON.stringify(input.learningIds),
      status: input.status ?? 'pending',
      operatorNotes: input.operatorNotes ?? null,
      createdAt: now,
      updatedAt: now
    };
    this.db
      .prepare(
        `INSERT INTO improvement_proposals (
          id, agent_id, proposed_changes_json, reasoning, learning_ids_json, status, operator_notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.agentId,
        record.proposedChangesJson,
        record.reasoning,
        record.learningIdsJson,
        record.status,
        record.operatorNotes,
        record.createdAt,
        record.updatedAt
      );
    return record;
  }

  listImprovementProposals(input?: { agentId?: string; status?: ImprovementProposalRecord['status']; limit?: number }): ImprovementProposalRecord[] {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (input?.agentId) {
      where.push('agent_id = ?');
      params.push(input.agentId);
    }
    if (input?.status) {
      where.push('status = ?');
      params.push(input.status);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `SELECT * FROM improvement_proposals
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(...params, Math.max(1, Math.min(2000, Math.floor(input?.limit ?? 500)))) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapImprovementProposalRow(row));
  }

  updateImprovementProposalStatus(input: {
    id: string;
    status: ImprovementProposalRecord['status'];
    operatorNotes?: string | null;
  }): ImprovementProposalRecord | null {
    this.db
      .prepare(
        `UPDATE improvement_proposals
         SET status = ?, operator_notes = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(input.status, input.operatorNotes ?? null, utcNow(), input.id);
    const proposal = this.db.prepare('SELECT * FROM improvement_proposals WHERE id = ?').get(input.id) as
      | Record<string, unknown>
      | undefined;
    return proposal ? this.mapImprovementProposalRow(proposal) : null;
  }

  upsertLocalRuntimeSession(input: LocalRuntimeSessionUpsertInput): LocalRuntimeSessionRecord {
    const record: LocalRuntimeSessionRecord = {
      id: input.id,
      runtime: input.runtime,
      projectSlug: input.projectSlug,
      filePath: input.filePath,
      model: input.model,
      branch: input.branch ?? null,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cacheReadInputTokens: input.cacheReadInputTokens,
      cacheCreationInputTokens: input.cacheCreationInputTokens,
      toolUseCount: input.toolUseCount,
      messageCount: input.messageCount,
      estimatedCostUsd: input.estimatedCostUsd,
      active: input.active,
      lastUserPrompt: input.lastUserPrompt ?? null,
      lastMessageAt: input.lastMessageAt,
      detailsJson: JSON.stringify(input.details ?? {}),
      updatedAt: utcNow()
    };
    this.db
      .prepare(
        `INSERT INTO local_runtime_sessions (
          id, runtime, project_slug, file_path, model, branch, input_tokens, output_tokens, cache_read_input_tokens,
          cache_creation_input_tokens, tool_use_count, message_count, estimated_cost_usd, active, last_user_prompt,
          last_message_at, details_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          runtime = excluded.runtime,
          project_slug = excluded.project_slug,
          file_path = excluded.file_path,
          model = excluded.model,
          branch = excluded.branch,
          input_tokens = excluded.input_tokens,
          output_tokens = excluded.output_tokens,
          cache_read_input_tokens = excluded.cache_read_input_tokens,
          cache_creation_input_tokens = excluded.cache_creation_input_tokens,
          tool_use_count = excluded.tool_use_count,
          message_count = excluded.message_count,
          estimated_cost_usd = excluded.estimated_cost_usd,
          active = excluded.active,
          last_user_prompt = excluded.last_user_prompt,
          last_message_at = excluded.last_message_at,
          details_json = excluded.details_json,
          updated_at = excluded.updated_at`
      )
      .run(
        record.id,
        record.runtime,
        record.projectSlug,
        record.filePath,
        record.model,
        record.branch,
        record.inputTokens,
        record.outputTokens,
        record.cacheReadInputTokens,
        record.cacheCreationInputTokens,
        record.toolUseCount,
        record.messageCount,
        record.estimatedCostUsd,
        record.active ? 1 : 0,
        record.lastUserPrompt,
        record.lastMessageAt,
        record.detailsJson,
        record.updatedAt
      );
    return this.getLocalRuntimeSessionById(record.id)!;
  }

  getLocalRuntimeSessionById(id: string): LocalRuntimeSessionRecord | null {
    const row = this.db.prepare('SELECT * FROM local_runtime_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapLocalRuntimeSessionRow(row) : null;
  }

  listLocalRuntimeSessions(input?: {
    limit?: number;
    runtime?: LocalRuntimeSessionKind | 'all';
  }): LocalRuntimeSessionRecord[] {
    const runtime = input?.runtime ?? 'all';
    const limit = Math.max(1, Math.min(2000, Math.floor(input?.limit ?? 500)));
    const rows =
      runtime === 'all'
        ? (this.db
            .prepare(
              `SELECT * FROM local_runtime_sessions
               ORDER BY active DESC, last_message_at DESC
               LIMIT ?`
            )
            .all(limit) as Array<Record<string, unknown>>)
        : (this.db
            .prepare(
              `SELECT * FROM local_runtime_sessions
               WHERE runtime = ?
               ORDER BY active DESC, last_message_at DESC
               LIMIT ?`
            )
            .all(runtime, limit) as Array<Record<string, unknown>>);
    return rows.map((row) => this.mapLocalRuntimeSessionRow(row));
  }

  upsertLocalRuntimeScanOffset(runtime: LocalRuntimeSessionKind, filePath: string, offset: number): void {
    this.db
      .prepare(
        `INSERT INTO local_runtime_scan_offsets (runtime, file_path, offset, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(runtime, file_path) DO UPDATE SET offset = excluded.offset, updated_at = excluded.updated_at`
      )
      .run(runtime, filePath, Math.max(0, Math.floor(offset)), utcNow());
  }

  getLocalRuntimeScanOffset(runtime: LocalRuntimeSessionKind, filePath: string): number {
    const row = this.db.prepare('SELECT offset FROM local_runtime_scan_offsets WHERE runtime = ? AND file_path = ?').get(
      runtime,
      filePath
    ) as { offset: number } | undefined;
    return row ? Number(row.offset ?? 0) : 0;
  }

  probeAnnExtension(extensionName: string): { annConfigured: boolean; annAvailable: boolean; probeError: string | null } {
    const normalized = String(extensionName ?? '').trim();
    if (!normalized) {
      return {
        annConfigured: false,
        annAvailable: false,
        probeError: 'ann_extension_name_empty'
      };
    }

    try {
      this.db.loadExtension(normalized);
      return {
        annConfigured: true,
        annAvailable: true,
        probeError: null
      };
    } catch (error) {
      return {
        annConfigured: true,
        annAvailable: false,
        probeError: error instanceof Error ? error.message : String(error)
      };
    }
  }

  getOnboardingState(): OnboardingStateRecord | null {
    const row = this.db.prepare('SELECT * FROM onboarding_state WHERE id = ?').get('default') as
      | {
          id: string;
          state_json: string;
          updated_at: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      stateJson: row.state_json,
      updatedAt: row.updated_at
    };
  }

  upsertOnboardingState(state: Record<string, unknown>): OnboardingStateRecord {
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO onboarding_state (id, state_json, updated_at)
         VALUES ('default', ?, ?)
         ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(state), now);
    return this.getOnboardingState()!;
  }

  upsertPromptAssemblySnapshot(input: {
    runId: string;
    sessionId: string;
    contextLimit: number;
    totalEstimatedTokens: number;
    overflowStrategy: string;
    overflowed: boolean;
    continuityCoverage: Record<string, unknown>;
    segments: PromptAssemblySegmentRecord[];
    droppedSegments: Array<Record<string, unknown>>;
    promptPreview: string;
  }): PromptAssemblySnapshotRecord {
    const now = utcNow();
    this.db
      .prepare(
        `INSERT INTO prompt_assembly_snapshots (
          run_id, session_id, context_limit, total_estimated_tokens, overflow_strategy, overflowed,
          continuity_coverage_json, segments_json, dropped_segments_json, prompt_preview, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
          session_id = excluded.session_id,
          context_limit = excluded.context_limit,
          total_estimated_tokens = excluded.total_estimated_tokens,
          overflow_strategy = excluded.overflow_strategy,
          overflowed = excluded.overflowed,
          continuity_coverage_json = excluded.continuity_coverage_json,
          segments_json = excluded.segments_json,
          dropped_segments_json = excluded.dropped_segments_json,
          prompt_preview = excluded.prompt_preview,
          updated_at = excluded.updated_at`
      )
      .run(
        input.runId,
        input.sessionId,
        input.contextLimit,
        input.totalEstimatedTokens,
        input.overflowStrategy,
        input.overflowed ? 1 : 0,
        JSON.stringify(input.continuityCoverage ?? {}),
        JSON.stringify(input.segments ?? []),
        JSON.stringify(input.droppedSegments ?? []),
        input.promptPreview,
        now,
        now
      );
    return this.getPromptAssemblySnapshot(input.runId)!;
  }

  getPromptAssemblySnapshot(runId: string): PromptAssemblySnapshotRecord | null {
    const row = this.db.prepare('SELECT * FROM prompt_assembly_snapshots WHERE run_id = ?').get(runId) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return null;
    }
    return {
      runId: String(row.run_id),
      sessionId: String(row.session_id),
      contextLimit: Number(row.context_limit ?? 0),
      totalEstimatedTokens: Number(row.total_estimated_tokens ?? 0),
      overflowStrategy: String(row.overflow_strategy ?? 'shrink'),
      overflowed: Number(row.overflowed ?? 0) === 1,
      continuityCoverageJson: String(row.continuity_coverage_json ?? '{}'),
      segmentsJson: String(row.segments_json ?? '[]'),
      droppedSegmentsJson: String(row.dropped_segments_json ?? '[]'),
      promptPreview: String(row.prompt_preview ?? ''),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  appendContinuitySignal(input: {
    runId?: string | null;
    sessionId?: string | null;
    severity: ContinuitySignalRecord['severity'];
    source: string;
    code: string;
    summary: string;
    details?: Record<string, unknown>;
    dedupeKey: string;
  }): ContinuitySignalRecord {
    const now = utcNow();
    const existing = this.db
      .prepare(`SELECT id FROM continuity_signals WHERE dedupe_key = ? AND status IN ('open', 'planned')`)
      .get(input.dedupeKey) as { id: string } | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE continuity_signals
           SET run_id = ?, session_id = ?, severity = ?, source = ?, code = ?, summary = ?, details_json = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          input.runId ?? null,
          input.sessionId ?? null,
          input.severity,
          input.source,
          input.code,
          input.summary,
          JSON.stringify(input.details ?? {}),
          now,
          existing.id
        );
      return this.getContinuitySignal(existing.id)!;
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO continuity_signals (
          id, run_id, session_id, severity, source, code, summary, details_json, status, dedupe_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`
      )
      .run(
        id,
        input.runId ?? null,
        input.sessionId ?? null,
        input.severity,
        input.source,
        input.code,
        input.summary,
        JSON.stringify(input.details ?? {}),
        input.dedupeKey,
        now,
        now
      );
    return this.getContinuitySignal(id)!;
  }

  getContinuitySignal(id: string): ContinuitySignalRecord | null {
    const row = this.db.prepare('SELECT * FROM continuity_signals WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return null;
    }
    return {
      id: String(row.id),
      runId: row.run_id === null || row.run_id === undefined ? null : String(row.run_id),
      sessionId: row.session_id === null || row.session_id === undefined ? null : String(row.session_id),
      severity: String(row.severity) as ContinuitySignalRecord['severity'],
      source: String(row.source),
      code: String(row.code),
      summary: String(row.summary),
      detailsJson: String(row.details_json ?? '{}'),
      status: String(row.status) as ContinuitySignalRecord['status'],
      dedupeKey: String(row.dedupe_key),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  listContinuitySignals(limit = 100): ContinuitySignalRecord[] {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const rows = this.db
      .prepare(
        `SELECT * FROM continuity_signals
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(safeLimit) as Array<Record<string, unknown>>;
    return rows
      .map((row) => this.getContinuitySignal(String(row.id)))
      .filter((entry): entry is ContinuitySignalRecord => entry !== null);
  }

  updateContinuitySignalStatus(id: string, status: ContinuitySignalRecord['status']): ContinuitySignalRecord | null {
    this.db
      .prepare('UPDATE continuity_signals SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, utcNow(), id);
    return this.getContinuitySignal(id);
  }

  appendContinuityLedger(input: {
    sessionId: string;
    runId?: string | null;
    mode: ContinuityLedgerRecord['mode'];
    reason: string;
    summary?: string | null;
    details?: Record<string, unknown>;
  }): ContinuityLedgerRecord {
    const id = randomUUID();
    const createdAt = utcNow();
    this.db
      .prepare(
        `INSERT INTO continuity_ledger (
          id, session_id, run_id, mode, reason, summary, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.sessionId,
        input.runId ?? null,
        input.mode,
        input.reason,
        input.summary ?? null,
        JSON.stringify(input.details ?? {}),
        createdAt
      );
    return {
      id,
      sessionId: input.sessionId,
      runId: input.runId ?? null,
      mode: input.mode,
      reason: input.reason,
      summary: input.summary ?? null,
      detailsJson: JSON.stringify(input.details ?? {}),
      createdAt
    };
  }

  listContinuityLedger(input?: { sessionId?: string; limit?: number }): ContinuityLedgerRecord[] {
    const limit = Math.max(1, Math.min(500, Math.floor(input?.limit ?? 100)));
    const sessionFilter = typeof input?.sessionId === 'string' && input.sessionId.trim().length > 0 ? input.sessionId.trim() : null;
    const rows = (
      sessionFilter
        ? this.db
            .prepare(
              `SELECT * FROM continuity_ledger
               WHERE session_id = ?
               ORDER BY created_at DESC
               LIMIT ?`
            )
            .all(sessionFilter, limit)
        : this.db
            .prepare(
              `SELECT * FROM continuity_ledger
               ORDER BY created_at DESC
               LIMIT ?`
            )
            .all(limit)
    ) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      sessionId: String(row.session_id),
      runId: row.run_id === null || row.run_id === undefined ? null : String(row.run_id),
      mode: String(row.mode) as ContinuityLedgerRecord['mode'],
      reason: String(row.reason),
      summary: row.summary === null || row.summary === undefined ? null : String(row.summary),
      detailsJson: String(row.details_json ?? '{}'),
      createdAt: String(row.created_at)
    }));
  }

  upsertExecutionContract(input: {
    runId: string;
    sessionId: string;
    source?: string;
    status: ExecutionContractRecord['status'];
    contract: Record<string, unknown>;
    parseError?: string | null;
  }): ExecutionContractRecord {
    const now = utcNow();
    const existing = this.getExecutionContractByRunId(input.runId);
    if (existing) {
      this.db
        .prepare(
          `UPDATE execution_contracts
           SET session_id = ?, source = ?, status = ?, contract_json = ?, parse_error = ?, updated_at = ?
           WHERE run_id = ?`
        )
        .run(
          input.sessionId,
          input.source ?? existing.source,
          input.status,
          JSON.stringify(input.contract ?? {}),
          input.parseError ?? null,
          now,
          input.runId
        );
      return this.getExecutionContractByRunId(input.runId)!;
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO execution_contracts (
          id, run_id, session_id, source, status, contract_json, parse_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.runId,
        input.sessionId,
        input.source ?? 'runtime_output',
        input.status,
        JSON.stringify(input.contract ?? {}),
        input.parseError ?? null,
        now,
        now
      );
    return this.getExecutionContractByRunId(input.runId)!;
  }

  getExecutionContractByRunId(runId: string): ExecutionContractRecord | null {
    const row = this.db.prepare('SELECT * FROM execution_contracts WHERE run_id = ?').get(runId) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return null;
    }
    return {
      id: String(row.id),
      runId: String(row.run_id),
      sessionId: String(row.session_id),
      source: String(row.source ?? 'runtime_output'),
      status: String(row.status ?? 'parsed') as ExecutionContractRecord['status'],
      contractJson: String(row.contract_json ?? '{}'),
      parseError: row.parse_error === null || row.parse_error === undefined ? null : String(row.parse_error),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  getExecutionContractById(id: string): ExecutionContractRecord | null {
    const row = this.db.prepare('SELECT * FROM execution_contracts WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return null;
    }
    return {
      id: String(row.id),
      runId: String(row.run_id),
      sessionId: String(row.session_id),
      source: String(row.source ?? 'runtime_output'),
      status: String(row.status ?? 'parsed') as ExecutionContractRecord['status'],
      contractJson: String(row.contract_json ?? '{}'),
      parseError: row.parse_error === null || row.parse_error === undefined ? null : String(row.parse_error),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  appendExecutionContractDispatch(input: {
    contractId: string;
    runId: string;
    sessionId: string;
    taskId: string;
    action: string;
    targetAgentId?: string | null;
    targetSessionId?: string | null;
    delegatedRunId?: string | null;
    status: ExecutionContractDispatchRecord['status'];
    reason: string;
    details?: Record<string, unknown>;
  }): ExecutionContractDispatchRecord {
    const now = utcNow();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO execution_contract_dispatches (
          id, contract_id, run_id, session_id, task_id, action, target_agent_id, target_session_id, delegated_run_id,
          status, reason, details_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.contractId,
        input.runId,
        input.sessionId,
        input.taskId,
        input.action,
        input.targetAgentId ?? null,
        input.targetSessionId ?? null,
        input.delegatedRunId ?? null,
        input.status,
        input.reason,
        JSON.stringify(input.details ?? {}),
        now,
        now
      );
    return this.listExecutionContractDispatchesByRun(input.runId, 500)
      .find((row) => row.id === id)!;
  }

  listExecutionContractDispatchesByRun(runId: string, limit = 200): ExecutionContractDispatchRecord[] {
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
    const rows = this.db
      .prepare(
        `SELECT * FROM execution_contract_dispatches
         WHERE run_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(runId, safeLimit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      contractId: String(row.contract_id),
      runId: String(row.run_id),
      sessionId: String(row.session_id),
      taskId: String(row.task_id),
      action: String(row.action),
      targetAgentId: row.target_agent_id === null || row.target_agent_id === undefined ? null : String(row.target_agent_id),
      targetSessionId:
        row.target_session_id === null || row.target_session_id === undefined ? null : String(row.target_session_id),
      delegatedRunId:
        row.delegated_run_id === null || row.delegated_run_id === undefined ? null : String(row.delegated_run_id),
      status: String(row.status) as ExecutionContractDispatchRecord['status'],
      reason: String(row.reason ?? ''),
      detailsJson: String(row.details_json ?? '{}'),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    }));
  }

  listExecutionContractDispatchesByContract(contractId: string, limit = 500): ExecutionContractDispatchRecord[] {
    const safeLimit = Math.max(1, Math.min(2000, Math.floor(limit)));
    const rows = this.db
      .prepare(
        `SELECT * FROM execution_contract_dispatches
         WHERE contract_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(contractId, safeLimit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      contractId: String(row.contract_id),
      runId: String(row.run_id),
      sessionId: String(row.session_id),
      taskId: String(row.task_id),
      action: String(row.action),
      targetAgentId: row.target_agent_id === null || row.target_agent_id === undefined ? null : String(row.target_agent_id),
      targetSessionId:
        row.target_session_id === null || row.target_session_id === undefined ? null : String(row.target_session_id),
      delegatedRunId:
        row.delegated_run_id === null || row.delegated_run_id === undefined ? null : String(row.delegated_run_id),
      status: String(row.status) as ExecutionContractDispatchRecord['status'],
      reason: String(row.reason ?? ''),
      detailsJson: String(row.details_json ?? '{}'),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    }));
  }

  createBacklogItem(input: BacklogItemCreateInput): BacklogItemRecord {
    const now = utcNow();
    const initialState = input.state ?? 'idea';
    const record: BacklogItemRecord = {
      id: input.id ?? randomUUID(),
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      state: initialState,
      priority: Number.isFinite(input.priority) ? Number(input.priority) : 50,
      labelsJson: JSON.stringify(input.labels ?? []),
      projectId: input.projectId?.trim() || null,
      repoRoot: input.repoRoot?.trim() || null,
      source: input.source?.trim() || 'dashboard',
      sourceRef: input.sourceRef ?? null,
      createdBy: input.createdBy?.trim() || 'operator',
      assignedAgentId: input.assignedAgentId ?? null,
      linkedSessionId: input.linkedSessionId ?? null,
      linkedRunId: input.linkedRunId ?? null,
      deliveryGroupId: input.deliveryGroupId ?? null,
      blockedReason: input.blockedReason ?? null,
      originSessionId: input.originSessionId ?? null,
      originMessageId: input.originMessageId ?? null,
      originChannel: input.originChannel ?? null,
      originChatId: input.originChatId ?? null,
      originTopicId: input.originTopicId ?? null,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO backlog_items (
          id, title, description, state, priority, labels_json, project_id, repo_root, source, source_ref, created_by, assigned_agent_id, linked_session_id, linked_run_id, delivery_group_id, blocked_reason,
          origin_session_id, origin_message_id, origin_channel, origin_chat_id, origin_topic_id, metadata_json, created_at, updated_at
        ) VALUES (
          @id, @title, @description, @state, @priority, @labelsJson, @projectId, @repoRoot, @source, @sourceRef, @createdBy, @assignedAgentId, @linkedSessionId, @linkedRunId, @deliveryGroupId, @blockedReason,
          @originSessionId, @originMessageId, @originChannel, @originChatId, @originTopicId, @metadataJson, @createdAt, @updatedAt
        )`
      )
      .run(record);

    this.db
      .prepare(
        `INSERT INTO backlog_transitions (id, item_id, from_state, to_state, actor, reason, metadata_json, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        record.id,
        record.state,
        record.createdBy,
        'created',
        JSON.stringify({
          source: record.source,
          sourceRef: record.sourceRef
        }),
        now
      );

    return this.getBacklogItemById(record.id)!;
  }

  getBacklogItemById(itemId: string): BacklogItemRecord | undefined {
    const row = this.db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(itemId) as Record<string, unknown> | undefined;
    return row ? this.mapBacklogItemRow(row) : undefined;
  }

  updateBacklogItem(itemId: string, input: BacklogItemUpdateInput): BacklogItemRecord {
    const existing = this.getBacklogItemById(itemId);
    if (!existing) {
      throw new Error(`Backlog item not found: ${itemId}`);
    }

    const nextLabels =
      input.labels !== undefined ? JSON.stringify(input.labels) : existing.labelsJson;
    const nextMetadata =
      input.metadata !== undefined ? JSON.stringify(input.metadata) : existing.metadataJson;
    const nextTitle = input.title !== undefined ? input.title.trim() : existing.title;
    const nextDescription = input.description !== undefined ? input.description.trim() : existing.description;
    const nextPriority = input.priority !== undefined ? input.priority : existing.priority;
    const nextBlockedReason =
      input.blockedReason !== undefined ? input.blockedReason : existing.blockedReason;

    this.db
      .prepare(
        `UPDATE backlog_items
         SET title = ?, description = ?, priority = ?, labels_json = ?, project_id = ?, repo_root = ?, assigned_agent_id = ?, linked_session_id = ?, linked_run_id = ?, delivery_group_id = ?, blocked_reason = ?,
             origin_session_id = ?, origin_message_id = ?, origin_channel = ?, origin_chat_id = ?, origin_topic_id = ?, metadata_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        nextTitle,
        nextDescription,
        nextPriority,
        nextLabels,
        input.projectId !== undefined ? input.projectId : existing.projectId,
        input.repoRoot !== undefined ? input.repoRoot : existing.repoRoot,
        input.assignedAgentId !== undefined ? input.assignedAgentId : existing.assignedAgentId,
        input.linkedSessionId !== undefined ? input.linkedSessionId : existing.linkedSessionId,
        input.linkedRunId !== undefined ? input.linkedRunId : existing.linkedRunId,
        input.deliveryGroupId !== undefined ? input.deliveryGroupId : existing.deliveryGroupId,
        nextBlockedReason,
        input.originSessionId !== undefined ? input.originSessionId : existing.originSessionId,
        input.originMessageId !== undefined ? input.originMessageId : existing.originMessageId,
        input.originChannel !== undefined ? input.originChannel : existing.originChannel,
        input.originChatId !== undefined ? input.originChatId : existing.originChatId,
        input.originTopicId !== undefined ? input.originTopicId : existing.originTopicId,
        nextMetadata,
        utcNow(),
        itemId
      );

    return this.getBacklogItemById(itemId)!;
  }

  listBacklogItems(input: BacklogListInput = {}): { rows: BacklogItemRecord[]; total: number } {
    const where: string[] = [];
    const params: Array<string | number> = [];

    if (input.states && input.states.length > 0) {
      where.push(`state IN (${input.states.map(() => '?').join(', ')})`);
      params.push(...input.states);
    }

    if (input.search && input.search.trim().length > 0) {
      const term = `%${input.search.trim()}%`;
      where.push('(title LIKE ? OR description LIKE ?)');
      params.push(term, term);
    }

    if (input.projectId !== undefined && input.projectId !== null && input.projectId.trim().length > 0) {
      where.push('project_id = ?');
      params.push(input.projectId.trim());
    }

    if (input.repoRoot !== undefined && input.repoRoot !== null && input.repoRoot.trim().length > 0) {
      where.push('repo_root = ?');
      params.push(input.repoRoot.trim());
    }

    if (input.unscopedOnly) {
      where.push('(project_id IS NULL OR TRIM(project_id) = \'\') AND (repo_root IS NULL OR TRIM(repo_root) = \'\')');
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(500, input.limit ?? 200));
    const offset = Math.max(0, input.offset ?? 0);

    const total = this.db
      .prepare(`SELECT COUNT(*) AS count FROM backlog_items ${whereSql}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT *
         FROM backlog_items
         ${whereSql}
         ORDER BY
           CASE state
             WHEN 'in_progress' THEN 0
             WHEN 'review' THEN 1
             WHEN 'blocked' THEN 2
             WHEN 'planned' THEN 3
             WHEN 'triage' THEN 4
             WHEN 'idea' THEN 5
             WHEN 'done' THEN 6
             ELSE 7
           END ASC,
           priority DESC,
           updated_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Array<Record<string, unknown>>;

    return {
      rows: rows.map((row) => this.mapBacklogItemRow(row)),
      total: total.count
    };
  }

  listBacklogScopeSummaries(limit = 200): BacklogScopeSummaryRecord[] {
    const rows = this.db
      .prepare(
        `SELECT
           project_id,
           repo_root,
           COUNT(*) AS item_count,
           SUM(
             CASE
               WHEN state IN ('idea', 'triage', 'planned', 'in_progress', 'review', 'blocked') THEN 1
               ELSE 0
             END
           ) AS active_count,
           SUM(CASE WHEN state = 'blocked' THEN 1 ELSE 0 END) AS blocked_count,
           MAX(updated_at) AS latest_updated_at
         FROM backlog_items
         GROUP BY project_id, repo_root
         ORDER BY
           CASE
             WHEN repo_root IS NOT NULL AND TRIM(repo_root) <> '' THEN 0
             WHEN project_id IS NOT NULL AND TRIM(project_id) <> '' THEN 1
             ELSE 2
           END ASC,
           active_count DESC,
           item_count DESC,
           latest_updated_at DESC
         LIMIT ?`
      )
      .all(Math.max(1, Math.min(1_000, limit))) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      projectId: row.project_id === null || row.project_id === undefined ? null : String(row.project_id),
      repoRoot: row.repo_root === null || row.repo_root === undefined ? null : String(row.repo_root),
      itemCount: Number(row.item_count ?? 0),
      activeCount: Number(row.active_count ?? 0),
      blockedCount: Number(row.blocked_count ?? 0),
      latestUpdatedAt:
        row.latest_updated_at === null || row.latest_updated_at === undefined ? null : String(row.latest_updated_at)
    }));
  }

  purgeBacklog(input: { projectId?: string | null; repoRoot?: string | null; unscopedOnly?: boolean } = {}): { deleted: number } {
    const where: string[] = [];
    const params: Array<string> = [];

    if (input.projectId !== undefined && input.projectId !== null && input.projectId.trim().length > 0) {
      where.push('project_id = ?');
      params.push(input.projectId.trim());
    }

    if (input.repoRoot !== undefined && input.repoRoot !== null && input.repoRoot.trim().length > 0) {
      where.push('repo_root = ?');
      params.push(input.repoRoot.trim());
    }

    if (input.unscopedOnly) {
      where.push('(project_id IS NULL OR TRIM(project_id) = \'\') AND (repo_root IS NULL OR TRIM(repo_root) = \'\')');
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const result = this.db.prepare(`DELETE FROM backlog_items ${whereSql}`).run(...params);
    return {
      deleted: Number(result.changes ?? 0)
    };
  }

  deleteBacklogItem(itemId: string): { deleted: number } {
    const result = this.db.prepare('DELETE FROM backlog_items WHERE id = ?').run(itemId);
    return {
      deleted: Number(result.changes ?? 0)
    };
  }

  listBacklogTransitions(itemId: string, limit = 100): BacklogTransitionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM backlog_transitions
         WHERE item_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(itemId, Math.max(1, Math.min(500, limit))) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapBacklogTransitionRow(row));
  }

  listBacklogDependencies(itemId: string): BacklogDependencyRecord[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM backlog_dependencies
         WHERE item_id = ?
         ORDER BY created_at ASC`
      )
      .all(itemId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapBacklogDependencyRow(row));
  }

  setBacklogDependencies(itemId: string, dependencyItemIds: string[]): BacklogDependencyRecord[] {
    const unique = Array.from(
      new Set(
        dependencyItemIds
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0 && entry !== itemId)
      )
    );

    for (const dependencyId of unique) {
      if (!this.getBacklogItemById(dependencyId)) {
        throw new Error(`Dependency item not found: ${dependencyId}`);
      }
    }

    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM backlog_dependencies WHERE item_id = ?').run(itemId);
      for (const dependencyId of unique) {
        this.db
          .prepare(
            `INSERT INTO backlog_dependencies (item_id, depends_on_item_id, created_at)
             VALUES (?, ?, ?)`
          )
          .run(itemId, dependencyId, utcNow());
      }
    });
    tx();

    return this.listBacklogDependencies(itemId);
  }

  transitionBacklogItem(input: BacklogTransitionInput): BacklogItemRecord {
    const existing = this.getBacklogItemById(input.itemId);
    if (!existing) {
      throw new Error(`Backlog item not found: ${input.itemId}`);
    }
    if (existing.state === input.toState) {
      return existing;
    }

    const allowedTransitions = this.allowedBacklogTransitions(existing.state);
    if (!allowedTransitions.includes(input.toState)) {
      throw new Error(`Illegal backlog transition: ${existing.state} -> ${input.toState}`);
    }

    if (input.toState === 'done') {
      const dependencies = this.listBacklogDependencies(existing.id);
      if (dependencies.length > 0) {
        const unresolved = dependencies
          .map((dependency) => this.getBacklogItemById(dependency.dependsOnItemId))
          .filter((item): item is BacklogItemRecord => item !== undefined)
          .filter((item) => item.state !== 'done' && item.state !== 'archived')
          .map((item) => item.id);
        if (unresolved.length > 0) {
          throw new Error(`Cannot transition to done while dependencies are unresolved: ${unresolved.join(', ')}`);
        }
      }
    }

    const now = utcNow();
    let nextBlockedReason: string | null = existing.blockedReason;
    if (input.toState === 'blocked') {
      nextBlockedReason = input.reason;
    } else if (existing.state === 'blocked') {
      nextBlockedReason = null;
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE backlog_items
           SET state = ?, blocked_reason = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(input.toState, nextBlockedReason, now, input.itemId);

      this.db
        .prepare(
          `INSERT INTO backlog_transitions (id, item_id, from_state, to_state, actor, reason, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          randomUUID(),
          input.itemId,
          existing.state,
          input.toState,
          input.actor,
          input.reason,
          JSON.stringify(input.metadata ?? {}),
          now
        );
    });
    tx();

    return this.getBacklogItemById(input.itemId)!;
  }

  getBacklogOrchestrationControl(): BacklogOrchestrationControlRecord | null {
    const row = this.db
      .prepare('SELECT * FROM backlog_orchestration ORDER BY updated_at DESC LIMIT 1')
      .get() as Record<string, unknown> | undefined;
    if (row) {
      return this.mapBacklogOrchestrationControlRow(row);
    }
    return null;
  }

  ensureBacklogOrchestrationControl(): BacklogOrchestrationControlRecord {
    const existing = this.getBacklogOrchestrationControl();
    if (existing) {
      return existing;
    }

    const now = utcNow();
    const record: BacklogOrchestrationControlRecord = {
      id: randomUUID(),
      enabled: true,
      paused: true,
      maxParallel: 2,
      wipLimit: 3,
      escalationMode: 'notify',
      lastTickAt: null,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO backlog_orchestration (
          id, enabled, paused, max_parallel, wip_limit, escalation_mode, last_tick_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.enabled ? 1 : 0,
        record.paused ? 1 : 0,
        record.maxParallel,
        record.wipLimit,
        record.escalationMode,
        record.lastTickAt,
        record.updatedAt
      );

    return record;
  }

  upsertBacklogOrchestrationControl(input: BacklogOrchestrationControlInput): BacklogOrchestrationControlRecord {
    const existing = this.ensureBacklogOrchestrationControl();
    const updatedAt = utcNow();
    this.db
      .prepare(
        `UPDATE backlog_orchestration
         SET enabled = ?, paused = ?, max_parallel = ?, wip_limit = ?, escalation_mode = ?, last_tick_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.enabled ? 1 : 0,
        input.paused ? 1 : 0,
        input.maxParallel,
        input.wipLimit,
        input.escalationMode,
        input.lastTickAt ?? null,
        updatedAt,
        existing.id
      );
    return this.ensureBacklogOrchestrationControl();
  }

  appendBacklogOrchestrationDecision(input: BacklogOrchestrationDecisionInput): BacklogOrchestrationDecisionRecord {
    const record: BacklogOrchestrationDecisionRecord = {
      id: randomUUID(),
      itemId: input.itemId ?? null,
      action: input.action,
      decision: input.decision,
      detailsJson: JSON.stringify(input.details ?? {}),
      createdAt: utcNow()
    };
    this.db
      .prepare(
        `INSERT INTO backlog_orchestration_decisions (id, item_id, action, decision, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(record.id, record.itemId, record.action, record.decision, record.detailsJson, record.createdAt);
    return record;
  }

  listBacklogOrchestrationDecisions(limit = 100): BacklogOrchestrationDecisionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM backlog_orchestration_decisions
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(Math.max(1, Math.min(500, limit))) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapBacklogOrchestrationDecisionRow(row));
  }

  createDeliveryGroup(input: DeliveryGroupCreateInput): DeliveryGroupRecord {
    const now = utcNow();
    const record: DeliveryGroupRecord = {
      id: input.id ?? randomUUID(),
      sourceRef: input.sourceRef ?? null,
      repoConnectionId: input.repoConnectionId ?? null,
      targetBranch: input.targetBranch ?? null,
      status: input.status ?? 'in_progress',
      metadataJson: JSON.stringify(input.metadata ?? {}),
      commitSha: null,
      prNumber: null,
      prUrl: null,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO delivery_groups (
          id, source_ref, repo_connection_id, target_branch, status, metadata_json, commit_sha, pr_number, pr_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.sourceRef,
        record.repoConnectionId,
        record.targetBranch,
        record.status,
        record.metadataJson,
        record.commitSha,
        record.prNumber,
        record.prUrl,
        record.createdAt,
        record.updatedAt
      );

    return this.getDeliveryGroupById(record.id)!;
  }

  updateDeliveryGroup(id: string, input: DeliveryGroupUpdateInput): DeliveryGroupRecord {
    const existing = this.getDeliveryGroupById(id);
    if (!existing) {
      throw new Error(`Delivery group not found: ${id}`);
    }

    this.db
      .prepare(
        `UPDATE delivery_groups
         SET source_ref = ?, repo_connection_id = ?, target_branch = ?, status = ?, metadata_json = ?,
             commit_sha = ?, pr_number = ?, pr_url = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.sourceRef !== undefined ? input.sourceRef : existing.sourceRef,
        input.repoConnectionId !== undefined ? input.repoConnectionId : existing.repoConnectionId,
        input.targetBranch !== undefined ? input.targetBranch : existing.targetBranch,
        input.status !== undefined ? input.status : existing.status,
        input.metadata !== undefined ? JSON.stringify(input.metadata) : existing.metadataJson,
        input.commitSha !== undefined ? input.commitSha : existing.commitSha,
        input.prNumber !== undefined ? input.prNumber : existing.prNumber,
        input.prUrl !== undefined ? input.prUrl : existing.prUrl,
        utcNow(),
        id
      );

    return this.getDeliveryGroupById(id)!;
  }

  getDeliveryGroupById(id: string): DeliveryGroupRecord | undefined {
    const row = this.db.prepare('SELECT * FROM delivery_groups WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapDeliveryGroupRow(row) : undefined;
  }

  listDeliveryGroups(limit = 200): DeliveryGroupRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM delivery_groups ORDER BY updated_at DESC LIMIT ?')
      .all(Math.max(1, Math.min(1000, Math.floor(limit)))) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapDeliveryGroupRow(row));
  }

  attachBacklogItemToDeliveryGroup(itemId: string, deliveryGroupId: string | null): BacklogItemRecord {
    this.db
      .prepare('UPDATE backlog_items SET delivery_group_id = ?, updated_at = ? WHERE id = ?')
      .run(deliveryGroupId, utcNow(), itemId);
    return this.getBacklogItemById(itemId)!;
  }

  listBacklogItemsByDeliveryGroup(deliveryGroupId: string): BacklogItemRecord[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM backlog_items
         WHERE delivery_group_id = ?
         ORDER BY updated_at DESC`
      )
      .all(deliveryGroupId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapBacklogItemRow(row));
  }

  upsertGithubRepoConnection(input: GithubRepoConnectionUpsertInput): GithubRepoConnectionRecord {
    const now = utcNow();
    const existing =
      input.id !== undefined
        ? this.getGithubRepoConnectionById(input.id)
        : this.getGithubRepoConnectionByOwnerRepo(input.owner, input.repo);
    const id = existing?.id ?? input.id ?? randomUUID();
    const authMode = input.authMode ?? existing?.authMode ?? 'pat_fallback';
    const appInstallationId =
      input.appInstallationId !== undefined ? input.appInstallationId : existing?.appInstallationId ?? null;
    const appInstallationAccountLogin =
      input.appInstallationAccountLogin !== undefined
        ? input.appInstallationAccountLogin
        : existing?.appInstallationAccountLogin ?? null;
    const permissionManifestJson =
      input.permissionManifest !== undefined
        ? JSON.stringify(input.permissionManifest)
        : existing?.permissionManifestJson ?? JSON.stringify({});
    const permissionSnapshotJson =
      input.permissionSnapshot !== undefined
        ? JSON.stringify(input.permissionSnapshot)
        : existing?.permissionSnapshotJson ?? JSON.stringify({});
    const tokenExpiresAt =
      input.tokenExpiresAt !== undefined ? input.tokenExpiresAt : existing?.tokenExpiresAt ?? null;
    const lastValidatedAt =
      input.lastValidatedAt !== undefined ? input.lastValidatedAt : existing?.lastValidatedAt ?? null;
    const lastValidationStatus =
      input.lastValidationStatus !== undefined ? input.lastValidationStatus : existing?.lastValidationStatus ?? null;
    const lastValidationError =
      input.lastValidationError !== undefined ? input.lastValidationError : existing?.lastValidationError ?? null;
    const policyVersion = input.policyVersion ?? existing?.policyVersion ?? 'policy.v1';
    const policyHash = input.policyHash !== undefined ? input.policyHash : existing?.policyHash ?? null;
    const policySource = input.policySource ?? existing?.policySource ?? 'control_plane';
    const policyJson = input.policy !== undefined ? JSON.stringify(input.policy) : existing?.policyJson ?? JSON.stringify({});
    const metadataJson = JSON.stringify(normalizeGithubRepoConnectionMetadata(input.metadata, existing?.metadataJson));

    if (existing) {
      this.db
        .prepare(
          `UPDATE github_repo_connections
           SET owner = ?, repo = ?, default_branch = ?, auth_secret_ref = ?, auth_mode = ?, app_installation_id = ?,
               app_installation_account_login = ?, webhook_secret_ref = ?, permission_manifest_json = ?, permission_snapshot_json = ?,
               token_expires_at = ?, last_validated_at = ?, last_validation_status = ?, last_validation_error = ?,
               enabled = ?, policy_version = ?, policy_hash = ?, policy_source = ?, policy_json = ?, metadata_json = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          input.owner,
          input.repo,
          input.defaultBranch ?? existing.defaultBranch,
          input.authSecretRef,
          authMode,
          appInstallationId,
          appInstallationAccountLogin,
          input.webhookSecretRef ?? null,
          permissionManifestJson,
          permissionSnapshotJson,
          tokenExpiresAt,
          lastValidatedAt,
          lastValidationStatus,
          lastValidationError,
          input.enabled === false ? 0 : 1,
          policyVersion,
          policyHash,
          policySource,
          policyJson,
          metadataJson,
          now,
          id
        );
    } else {
      this.db
        .prepare(
          `INSERT INTO github_repo_connections (
            id, owner, repo, default_branch, auth_secret_ref, auth_mode, app_installation_id, app_installation_account_login,
            webhook_secret_ref, permission_manifest_json, permission_snapshot_json, token_expires_at, last_validated_at,
            last_validation_status, last_validation_error, enabled, policy_version, policy_hash, policy_source, policy_json,
            metadata_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.owner,
          input.repo,
          input.defaultBranch ?? 'main',
          input.authSecretRef,
          authMode,
          appInstallationId,
          appInstallationAccountLogin,
          input.webhookSecretRef ?? null,
          permissionManifestJson,
          permissionSnapshotJson,
          tokenExpiresAt,
          lastValidatedAt,
          lastValidationStatus,
          lastValidationError,
          input.enabled === false ? 0 : 1,
          policyVersion,
          policyHash,
          policySource,
          policyJson,
          metadataJson,
          now,
          now
        );
    }

    return this.getGithubRepoConnectionById(id)!;
  }

  getGithubRepoConnectionById(id: string): GithubRepoConnectionRecord | undefined {
    const row = this.db.prepare('SELECT * FROM github_repo_connections WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapGithubRepoConnectionRow(row) : undefined;
  }

  getGithubRepoConnectionByOwnerRepo(owner: string, repo: string): GithubRepoConnectionRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM github_repo_connections WHERE owner = ? AND repo = ?')
      .get(owner, repo) as Record<string, unknown> | undefined;
    return row ? this.mapGithubRepoConnectionRow(row) : undefined;
  }

  listGithubRepoConnections(includeDisabled = false): GithubRepoConnectionRecord[] {
    const rows = includeDisabled
      ? (this.db
          .prepare('SELECT * FROM github_repo_connections ORDER BY updated_at DESC')
          .all() as Array<Record<string, unknown>>)
      : (this.db
          .prepare('SELECT * FROM github_repo_connections WHERE enabled = 1 ORDER BY updated_at DESC')
          .all() as Array<Record<string, unknown>>);
    return rows.map((row) => this.mapGithubRepoConnectionRow(row));
  }

  setGithubRepoConnectionEnabled(id: string, enabled: boolean): GithubRepoConnectionRecord | undefined {
    this.db
      .prepare('UPDATE github_repo_connections SET enabled = ?, updated_at = ? WHERE id = ?')
      .run(enabled ? 1 : 0, utcNow(), id);
    return this.getGithubRepoConnectionById(id);
  }

  upsertGithubWebhookDelivery(input: GithubWebhookDeliveryUpsertInput): GithubWebhookDeliveryRecord {
    const now = utcNow();
    const existing = this.getGithubWebhookDeliveryByDeliveryId(input.deliveryId);
    const id = existing?.id ?? input.id ?? randomUUID();
    const payloadJson =
      input.payload !== undefined ? JSON.stringify(input.payload) : existing?.payloadJson ?? JSON.stringify({});
    const replayOfDeliveryId =
      input.replayOfDeliveryId !== undefined ? input.replayOfDeliveryId : existing?.replayOfDeliveryId ?? null;
    const reason = input.reason !== undefined ? input.reason : existing?.reason ?? null;
    const signatureFingerprint =
      input.signatureFingerprint !== undefined ? input.signatureFingerprint : existing?.signatureFingerprint ?? null;
    const repoConnectionId =
      input.repoConnectionId !== undefined ? input.repoConnectionId : existing?.repoConnectionId ?? null;

    this.db
      .prepare(
        `INSERT INTO github_webhook_deliveries (
          id, delivery_id, repo_connection_id, event, owner, repo, source, signature_state, signature_fingerprint,
          status, replay_of_delivery_id, reason, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(delivery_id) DO UPDATE SET
          repo_connection_id = excluded.repo_connection_id,
          event = excluded.event,
          owner = excluded.owner,
          repo = excluded.repo,
          source = excluded.source,
          signature_state = excluded.signature_state,
          signature_fingerprint = excluded.signature_fingerprint,
          status = excluded.status,
          replay_of_delivery_id = excluded.replay_of_delivery_id,
          reason = excluded.reason,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at`
      )
      .run(
        id,
        input.deliveryId,
        repoConnectionId,
        input.event,
        input.owner,
        input.repo,
        input.source,
        input.signatureState,
        signatureFingerprint,
        input.status,
        replayOfDeliveryId,
        reason,
        payloadJson,
        existing?.createdAt ?? now,
        now
      );

    return this.getGithubWebhookDeliveryByDeliveryId(input.deliveryId)!;
  }

  getGithubWebhookDeliveryByDeliveryId(deliveryId: string): GithubWebhookDeliveryRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM github_webhook_deliveries WHERE delivery_id = ?')
      .get(deliveryId) as Record<string, unknown> | undefined;
    return row ? this.mapGithubWebhookDeliveryRow(row) : undefined;
  }

  listGithubWebhookDeliveries(limit = 200): GithubWebhookDeliveryRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM github_webhook_deliveries ORDER BY updated_at DESC LIMIT ?')
      .all(Math.max(1, Math.min(1000, Math.floor(limit)))) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapGithubWebhookDeliveryRow(row));
  }

  upsertBacklogDeliveryLink(input: BacklogDeliveryLinkUpsertInput): BacklogDeliveryLinkRecord {
    const now = utcNow();
    const existing = this.getBacklogDeliveryLinkByItemId(input.itemId);
    const record = {
      id: existing?.id ?? randomUUID(),
      itemId: input.itemId,
      repoConnectionId:
        input.repoConnectionId !== undefined ? input.repoConnectionId : existing?.repoConnectionId ?? null,
      branchName: input.branchName !== undefined ? input.branchName : existing?.branchName ?? null,
      commitSha: input.commitSha !== undefined ? input.commitSha : existing?.commitSha ?? null,
      prNumber: input.prNumber !== undefined ? input.prNumber : existing?.prNumber ?? null,
      prUrl: input.prUrl !== undefined ? input.prUrl : existing?.prUrl ?? null,
      status: input.status ?? existing?.status ?? 'planned',
      githubState: input.githubState !== undefined ? input.githubState : existing?.githubState ?? null,
      githubStateReason:
        input.githubStateReason !== undefined ? input.githubStateReason : existing?.githubStateReason ?? null,
      githubStateUpdatedAt:
        input.githubStateUpdatedAt !== undefined
          ? input.githubStateUpdatedAt
          : input.githubState !== undefined || input.githubStateReason !== undefined
            ? now
            : existing?.githubStateUpdatedAt ?? null,
      checksJson:
        input.checks !== undefined
          ? JSON.stringify(input.checks)
          : existing?.checksJson ?? JSON.stringify({}),
      metadataJson:
        input.metadata !== undefined
          ? JSON.stringify(input.metadata)
          : existing?.metadataJson ?? JSON.stringify({}),
      githubLeaseJson:
        input.githubLease !== undefined
          ? JSON.stringify(input.githubLease)
          : existing?.githubLeaseJson ?? JSON.stringify({}),
      githubWorktreeJson:
        input.githubWorktree !== undefined
          ? JSON.stringify(input.githubWorktree)
          : existing?.githubWorktreeJson ?? JSON.stringify({}),
      githubReconcileJson:
        input.githubReconcile !== undefined
          ? JSON.stringify(input.githubReconcile)
          : existing?.githubReconcileJson ?? JSON.stringify({}),
      receiptStatus: input.receiptStatus !== undefined ? input.receiptStatus : existing?.receiptStatus ?? null,
      receiptAttempts:
        input.receiptAttempts !== undefined
          ? Math.max(0, Math.floor(input.receiptAttempts))
          : existing?.receiptAttempts ?? 0,
      receiptLastError:
        input.receiptLastError !== undefined ? input.receiptLastError : existing?.receiptLastError ?? null,
      receiptLastAttemptAt:
        input.receiptLastAttemptAt !== undefined ? input.receiptLastAttemptAt : existing?.receiptLastAttemptAt ?? null,
      workspaceRoot: input.workspaceRoot !== undefined ? input.workspaceRoot : existing?.workspaceRoot ?? null,
      workspacePath: input.workspacePath !== undefined ? input.workspacePath : existing?.workspacePath ?? null,
      outputFilesJson:
        input.outputFiles !== undefined
          ? JSON.stringify(input.outputFiles)
          : existing?.outputFilesJson ?? JSON.stringify([]),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO backlog_delivery_links (
          id, item_id, repo_connection_id, branch_name, commit_sha, pr_number, pr_url, status, github_state, github_state_reason,
          github_state_updated_at, checks_json, metadata_json, github_lease_json, github_worktree_json, github_reconcile_json,
          receipt_status, receipt_attempts, receipt_last_error, receipt_last_attempt_at, workspace_root, workspace_path, output_files_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(item_id) DO UPDATE SET
          repo_connection_id = excluded.repo_connection_id,
          branch_name = excluded.branch_name,
          commit_sha = excluded.commit_sha,
          pr_number = excluded.pr_number,
          pr_url = excluded.pr_url,
          status = excluded.status,
          github_state = excluded.github_state,
          github_state_reason = excluded.github_state_reason,
          github_state_updated_at = excluded.github_state_updated_at,
          checks_json = excluded.checks_json,
          metadata_json = excluded.metadata_json,
          github_lease_json = excluded.github_lease_json,
          github_worktree_json = excluded.github_worktree_json,
          github_reconcile_json = excluded.github_reconcile_json,
          receipt_status = excluded.receipt_status,
          receipt_attempts = excluded.receipt_attempts,
          receipt_last_error = excluded.receipt_last_error,
          receipt_last_attempt_at = excluded.receipt_last_attempt_at,
          workspace_root = excluded.workspace_root,
          workspace_path = excluded.workspace_path,
          output_files_json = excluded.output_files_json,
          updated_at = excluded.updated_at`
      )
      .run(
        record.id,
        record.itemId,
        record.repoConnectionId,
        record.branchName,
        record.commitSha,
        record.prNumber,
        record.prUrl,
        record.status,
        record.githubState,
        record.githubStateReason,
        record.githubStateUpdatedAt,
        record.checksJson,
        record.metadataJson,
        record.githubLeaseJson,
        record.githubWorktreeJson,
        record.githubReconcileJson,
        record.receiptStatus,
        record.receiptAttempts,
        record.receiptLastError,
        record.receiptLastAttemptAt,
        record.workspaceRoot,
        record.workspacePath,
        record.outputFilesJson,
        record.createdAt,
        record.updatedAt
      );

    return this.getBacklogDeliveryLinkByItemId(input.itemId)!;
  }

  getBacklogDeliveryLinkByItemId(itemId: string): BacklogDeliveryLinkRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM backlog_delivery_links WHERE item_id = ?')
      .get(itemId) as Record<string, unknown> | undefined;
    return row ? this.mapBacklogDeliveryLinkRow(row) : undefined;
  }

  listBacklogDeliveryLinks(limit = 200): BacklogDeliveryLinkRecord[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM backlog_delivery_links
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(Math.max(1, Math.min(500, limit))) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapBacklogDeliveryLinkRow(row));
  }

  private allowedBacklogTransitions(state: BacklogState): BacklogState[] {
    const map: Record<BacklogState, BacklogState[]> = {
      idea: ['triage', 'archived'],
      triage: ['planned', 'blocked', 'archived'],
      planned: ['in_progress', 'blocked', 'archived'],
      in_progress: ['review', 'blocked', 'planned'],
      review: ['done', 'blocked', 'in_progress'],
      blocked: ['triage', 'planned', 'in_progress', 'archived'],
      done: ['archived'],
      archived: []
    };
    return map[state] ?? [];
  }

  private mapScheduleJobRow(row: Record<string, unknown>): ScheduleRecord {
    return {
      id: String(row.id),
      label: String(row.label),
      category: String(row.category),
      kind: String(row.kind) as ScheduleRecord['kind'],
      cadenceKind: String(row.cadence_kind) as ScheduleRecord['cadenceKind'],
      cadence: String(row.cadence),
      timezone: String(row.timezone ?? 'UTC'),
      enabled: Number(row.enabled ?? 0) === 1,
      pausedAt: row.paused_at === null || row.paused_at === undefined ? null : String(row.paused_at),
      pausedBy: row.paused_by === null || row.paused_by === undefined ? null : String(row.paused_by),
      requestedBy: row.requested_by === null || row.requested_by === undefined ? null : String(row.requested_by),
      requestingSessionId:
        row.requesting_session_id === null || row.requesting_session_id === undefined
          ? null
          : String(row.requesting_session_id),
      originRefJson: String(row.origin_ref_json ?? '{}'),
      targetAgentId: row.target_agent_id === null || row.target_agent_id === undefined ? null : String(row.target_agent_id),
      sessionTarget: String(row.session_target ?? 'origin_session') as ScheduleRecord['sessionTarget'],
      deliveryTarget: String(row.delivery_target ?? 'origin_session') as ScheduleRecord['deliveryTarget'],
      deliveryTargetSessionId:
        row.delivery_target_session_id === null || row.delivery_target_session_id === undefined
          ? null
          : String(row.delivery_target_session_id),
      prompt: row.prompt === null || row.prompt === undefined ? null : String(row.prompt),
      runtime: row.runtime === null || row.runtime === undefined ? null : String(row.runtime),
      model: row.model === null || row.model === undefined ? null : String(row.model),
      jobMode: row.job_mode === null || row.job_mode === undefined ? null : String(row.job_mode),
      approvalProfile: row.approval_profile === null || row.approval_profile === undefined ? null : String(row.approval_profile),
      concurrencyPolicy: String(row.concurrency_policy ?? 'skip') as ScheduleRecord['concurrencyPolicy'],
      domainPolicyJson: String(row.domain_policy_json ?? '{}'),
      rateLimitPolicyJson: String(row.rate_limit_policy_json ?? '{}'),
      lastRunAt: row.last_run_at === null || row.last_run_at === undefined ? null : String(row.last_run_at),
      nextRunAt: row.next_run_at === null || row.next_run_at === undefined ? null : String(row.next_run_at),
      lastStatus: row.last_status === null || row.last_status === undefined ? null : String(row.last_status),
      lastError: row.last_error === null || row.last_error === undefined ? null : String(row.last_error),
      lastResultJson: String(row.last_result_json ?? '{}'),
      metadataJson: String(row.metadata_json ?? '{}'),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapScheduleRunHistoryRow(row: Record<string, unknown>): ScheduleRunHistoryRecord {
    return {
      id: String(row.id),
      scheduleId: String(row.schedule_id),
      trigger: String(row.trigger) as ScheduleRunHistoryRecord['trigger'],
      status: String(row.status) as ScheduleRunHistoryRecord['status'],
      runId: row.run_id === null || row.run_id === undefined ? null : String(row.run_id),
      sessionId: row.session_id === null || row.session_id === undefined ? null : String(row.session_id),
      requestedBy: row.requested_by === null || row.requested_by === undefined ? null : String(row.requested_by),
      deliveryTarget: String(row.delivery_target) as ScheduleRunHistoryRecord['deliveryTarget'],
      summary: row.summary === null || row.summary === undefined ? null : String(row.summary),
      detailsJson: String(row.details_json ?? '{}'),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapBrowserCookieJarRow(row: Record<string, unknown>): BrowserCookieJarRecord {
    return {
      id: String(row.id),
      label: String(row.label),
      domainsJson: String(row.domains_json ?? '[]'),
      sourceKind: String(row.source_kind ?? 'manual') as BrowserCookieJarRecord['sourceKind'],
      cookiesJson: String(row.cookies_json ?? '[]'),
      notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
      revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : String(row.revoked_at),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapBrowserHeaderProfileRow(row: Record<string, unknown>): BrowserHeaderProfileRecord {
    return {
      id: String(row.id),
      label: String(row.label),
      domainsJson: String(row.domains_json ?? '[]'),
      headersJson: String(row.headers_json ?? '{}'),
      notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
      revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : String(row.revoked_at),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapBrowserProxyProfileRow(row: Record<string, unknown>): BrowserProxyProfileRecord {
    return {
      id: String(row.id),
      label: String(row.label),
      domainsJson: String(row.domains_json ?? '[]'),
      proxyJson: String(row.proxy_json ?? '{}'),
      notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
      revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : String(row.revoked_at),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapBrowserStorageStateRow(row: Record<string, unknown>): BrowserStorageStateRecord {
    return {
      id: String(row.id),
      label: String(row.label),
      domainsJson: String(row.domains_json ?? '[]'),
      storageStateJson: String(row.storage_state_json ?? '{}'),
      notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
      revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : String(row.revoked_at),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapBrowserSessionProfileRow(row: Record<string, unknown>): BrowserSessionProfileRecord {
    return {
      id: String(row.id),
      label: String(row.label),
      domainsJson: String(row.domains_json ?? '[]'),
      cookieJarId: row.cookie_jar_id === null || row.cookie_jar_id === undefined ? null : String(row.cookie_jar_id),
      headersProfileId:
        row.headers_profile_id === null || row.headers_profile_id === undefined ? null : String(row.headers_profile_id),
      proxyProfileId: row.proxy_profile_id === null || row.proxy_profile_id === undefined ? null : String(row.proxy_profile_id),
      storageStateId: row.storage_state_id === null || row.storage_state_id === undefined ? null : String(row.storage_state_id),
      useRealChrome: Number(row.use_real_chrome ?? 0) === 1,
      ownerLabel: row.owner_label === null || row.owner_label === undefined ? null : String(row.owner_label),
      visibility: row.visibility === 'session_only' ? 'session_only' : 'shared',
      allowedSessionIdsJson: String(row.allowed_session_ids_json ?? '[]'),
      siteKey: row.site_key === null || row.site_key === undefined ? null : String(row.site_key),
      browserKind:
        row.browser_kind === 'chrome' || row.browser_kind === 'firefox'
          ? row.browser_kind
          : null,
      browserProfileName:
        row.browser_profile_name === null || row.browser_profile_name === undefined ? null : String(row.browser_profile_name),
      browserProfilePath:
        row.browser_profile_path === null || row.browser_profile_path === undefined ? null : String(row.browser_profile_path),
      locale: row.locale === null || row.locale === undefined ? null : String(row.locale),
      countryCode: row.country_code === null || row.country_code === undefined ? null : String(row.country_code),
      timezoneId: row.timezone_id === null || row.timezone_id === undefined ? null : String(row.timezone_id),
      notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
      enabled: Number(row.enabled ?? 0) === 1,
      lastVerifiedAt:
        row.last_verified_at === null || row.last_verified_at === undefined ? null : String(row.last_verified_at),
      lastVerificationStatus:
        row.last_verification_status === null || row.last_verification_status === undefined
          ? 'unknown'
          : (String(row.last_verification_status) as BrowserSessionProfileRecord['lastVerificationStatus']),
      lastVerificationSummary:
        row.last_verification_summary === null || row.last_verification_summary === undefined
          ? null
          : String(row.last_verification_summary),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapBrowserFetchCacheRow(row: Record<string, unknown>): BrowserFetchCacheRecord {
    return {
      id: String(row.id),
      cacheKey: String(row.cache_key),
      url: String(row.url),
      tool: String(row.tool) as BrowserFetchCacheRecord['tool'],
      extractionMode: String(row.extraction_mode) as BrowserFetchCacheRecord['extractionMode'],
      mainContentOnly: Number(row.main_content_only ?? 0) === 1,
      artifactPath: String(row.artifact_path),
      previewText: String(row.preview_text ?? ''),
      summaryJson: String(row.summary_json ?? '{}'),
      expiresAt: String(row.expires_at),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapMemoryEmbeddingRow(row: Record<string, unknown>): MemoryEmbeddingRecord {
    return {
      id: String(row.id),
      memoryItemId: String(row.memory_item_id),
      checksum: String(row.checksum),
      provider: String(row.provider),
      model: String(row.model),
      dimension: Number(row.dimension ?? 0),
      vectorJson: row.vector_json === null || row.vector_json === undefined ? null : String(row.vector_json),
      status: String(row.status) as MemoryEmbeddingRecord['status'],
      error: row.error === null || row.error === undefined ? null : String(row.error),
      attempts: Number(row.attempts ?? 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapBacklogItemRow(row: Record<string, unknown>): BacklogItemRecord {
    return {
      id: String(row.id),
      title: String(row.title),
      description: String(row.description ?? ''),
      state: String(row.state) as BacklogState,
      priority: Number(row.priority ?? 50),
      labelsJson: row.labels_json === null || row.labels_json === undefined ? '[]' : String(row.labels_json),
      projectId: row.project_id === null || row.project_id === undefined ? null : String(row.project_id),
      repoRoot: row.repo_root === null || row.repo_root === undefined ? null : String(row.repo_root),
      source: String(row.source ?? 'dashboard'),
      sourceRef: row.source_ref === null || row.source_ref === undefined ? null : String(row.source_ref),
      createdBy: String(row.created_by ?? 'operator'),
      assignedAgentId:
        row.assigned_agent_id === null || row.assigned_agent_id === undefined ? null : String(row.assigned_agent_id),
      linkedSessionId:
        row.linked_session_id === null || row.linked_session_id === undefined ? null : String(row.linked_session_id),
      linkedRunId: row.linked_run_id === null || row.linked_run_id === undefined ? null : String(row.linked_run_id),
      deliveryGroupId:
        row.delivery_group_id === null || row.delivery_group_id === undefined ? null : String(row.delivery_group_id),
      blockedReason:
        row.blocked_reason === null || row.blocked_reason === undefined ? null : String(row.blocked_reason),
      originSessionId:
        row.origin_session_id === null || row.origin_session_id === undefined ? null : String(row.origin_session_id),
      originMessageId:
        row.origin_message_id === null || row.origin_message_id === undefined ? null : String(row.origin_message_id),
      originChannel:
        row.origin_channel === null || row.origin_channel === undefined ? null : String(row.origin_channel),
      originChatId:
        row.origin_chat_id === null || row.origin_chat_id === undefined ? null : String(row.origin_chat_id),
      originTopicId:
        row.origin_topic_id === null || row.origin_topic_id === undefined ? null : String(row.origin_topic_id),
      metadataJson: row.metadata_json === null || row.metadata_json === undefined ? '{}' : String(row.metadata_json),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapBacklogTransitionRow(row: Record<string, unknown>): BacklogTransitionRecord {
    return {
      id: String(row.id),
      itemId: String(row.item_id),
      fromState: row.from_state === null || row.from_state === undefined ? null : (String(row.from_state) as BacklogState),
      toState: String(row.to_state) as BacklogState,
      actor: String(row.actor),
      reason: String(row.reason),
      metadataJson: row.metadata_json === null || row.metadata_json === undefined ? '{}' : String(row.metadata_json),
      createdAt: String(row.created_at)
    };
  }

  private mapBacklogDependencyRow(row: Record<string, unknown>): BacklogDependencyRecord {
    return {
      itemId: String(row.item_id),
      dependsOnItemId: String(row.depends_on_item_id),
      createdAt: String(row.created_at)
    };
  }

  private mapBacklogOrchestrationControlRow(row: Record<string, unknown>): BacklogOrchestrationControlRecord {
    return {
      id: String(row.id),
      enabled: Number(row.enabled ?? 0) === 1,
      paused: Number(row.paused ?? 0) === 1,
      maxParallel: Number(row.max_parallel ?? 2),
      wipLimit: Number(row.wip_limit ?? 3),
      escalationMode: String(row.escalation_mode ?? 'notify') as BacklogOrchestrationControlRecord['escalationMode'],
      lastTickAt: row.last_tick_at === null || row.last_tick_at === undefined ? null : String(row.last_tick_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapBacklogOrchestrationDecisionRow(row: Record<string, unknown>): BacklogOrchestrationDecisionRecord {
    return {
      id: String(row.id),
      itemId: row.item_id === null || row.item_id === undefined ? null : String(row.item_id),
      action: String(row.action),
      decision: String(row.decision),
      detailsJson: row.details_json === null || row.details_json === undefined ? '{}' : String(row.details_json),
      createdAt: String(row.created_at)
    };
  }

  private mapGithubRepoConnectionRow(row: Record<string, unknown>): GithubRepoConnectionRecord {
    return {
      id: String(row.id),
      owner: String(row.owner),
      repo: String(row.repo),
      defaultBranch: String(row.default_branch ?? 'main'),
      authSecretRef: String(row.auth_secret_ref),
      authMode: String(row.auth_mode ?? 'pat_fallback') as GithubRepoConnectionRecord['authMode'],
      appInstallationId:
        row.app_installation_id === null || row.app_installation_id === undefined
          ? null
          : Number(row.app_installation_id),
      appInstallationAccountLogin:
        row.app_installation_account_login === null || row.app_installation_account_login === undefined
          ? null
          : String(row.app_installation_account_login),
      webhookSecretRef:
        row.webhook_secret_ref === null || row.webhook_secret_ref === undefined ? null : String(row.webhook_secret_ref),
      permissionManifestJson:
        row.permission_manifest_json === null || row.permission_manifest_json === undefined
          ? '{}'
          : String(row.permission_manifest_json),
      permissionSnapshotJson:
        row.permission_snapshot_json === null || row.permission_snapshot_json === undefined
          ? '{}'
          : String(row.permission_snapshot_json),
      tokenExpiresAt:
        row.token_expires_at === null || row.token_expires_at === undefined ? null : String(row.token_expires_at),
      lastValidatedAt:
        row.last_validated_at === null || row.last_validated_at === undefined ? null : String(row.last_validated_at),
      lastValidationStatus:
        row.last_validation_status === null || row.last_validation_status === undefined
          ? null
          : (String(row.last_validation_status) as GithubRepoConnectionRecord['lastValidationStatus']),
      lastValidationError:
        row.last_validation_error === null || row.last_validation_error === undefined
          ? null
          : String(row.last_validation_error),
      enabled: Number(row.enabled ?? 0) === 1,
      policyVersion: String(row.policy_version ?? 'policy.v1'),
      policyHash: row.policy_hash === null || row.policy_hash === undefined ? null : String(row.policy_hash),
      policySource: String(row.policy_source ?? 'control_plane') as GithubRepoConnectionRecord['policySource'],
      policyJson: row.policy_json === null || row.policy_json === undefined ? '{}' : String(row.policy_json),
      metadataJson: row.metadata_json === null || row.metadata_json === undefined ? '{}' : String(row.metadata_json),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapGithubWebhookDeliveryRow(row: Record<string, unknown>): GithubWebhookDeliveryRecord {
    return {
      id: String(row.id),
      deliveryId: String(row.delivery_id),
      repoConnectionId:
        row.repo_connection_id === null || row.repo_connection_id === undefined ? null : String(row.repo_connection_id),
      event: String(row.event),
      owner: String(row.owner),
      repo: String(row.repo),
      source: String(row.source) as GithubWebhookDeliveryRecord['source'],
      signatureState: String(row.signature_state) as GithubWebhookDeliveryRecord['signatureState'],
      signatureFingerprint:
        row.signature_fingerprint === null || row.signature_fingerprint === undefined
          ? null
          : String(row.signature_fingerprint),
      status: String(row.status) as GithubWebhookDeliveryRecord['status'],
      replayOfDeliveryId:
        row.replay_of_delivery_id === null || row.replay_of_delivery_id === undefined
          ? null
          : String(row.replay_of_delivery_id),
      reason: row.reason === null || row.reason === undefined ? null : String(row.reason),
      payloadJson: row.payload_json === null || row.payload_json === undefined ? '{}' : String(row.payload_json),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapBacklogDeliveryLinkRow(row: Record<string, unknown>): BacklogDeliveryLinkRecord {
    return {
      id: String(row.id),
      itemId: String(row.item_id),
      repoConnectionId:
        row.repo_connection_id === null || row.repo_connection_id === undefined ? null : String(row.repo_connection_id),
      branchName: row.branch_name === null || row.branch_name === undefined ? null : String(row.branch_name),
      commitSha: row.commit_sha === null || row.commit_sha === undefined ? null : String(row.commit_sha),
      prNumber: row.pr_number === null || row.pr_number === undefined ? null : Number(row.pr_number),
      prUrl: row.pr_url === null || row.pr_url === undefined ? null : String(row.pr_url),
      status: String(row.status) as BacklogDeliveryLinkRecord['status'],
      githubState:
        row.github_state === null || row.github_state === undefined
          ? null
          : (String(row.github_state) as BacklogDeliveryLinkRecord['githubState']),
      githubStateReason:
        row.github_state_reason === null || row.github_state_reason === undefined ? null : String(row.github_state_reason),
      githubStateUpdatedAt:
        row.github_state_updated_at === null || row.github_state_updated_at === undefined
          ? null
          : String(row.github_state_updated_at),
      checksJson: row.checks_json === null || row.checks_json === undefined ? '{}' : String(row.checks_json),
      metadataJson: row.metadata_json === null || row.metadata_json === undefined ? '{}' : String(row.metadata_json),
      githubLeaseJson:
        row.github_lease_json === null || row.github_lease_json === undefined ? '{}' : String(row.github_lease_json),
      githubWorktreeJson:
        row.github_worktree_json === null || row.github_worktree_json === undefined
          ? '{}'
          : String(row.github_worktree_json),
      githubReconcileJson:
        row.github_reconcile_json === null || row.github_reconcile_json === undefined
          ? '{}'
          : String(row.github_reconcile_json),
      receiptStatus:
        row.receipt_status === null || row.receipt_status === undefined
          ? null
          : (String(row.receipt_status) as BacklogDeliveryLinkRecord['receiptStatus']),
      receiptAttempts: Number(row.receipt_attempts ?? 0),
      receiptLastError:
        row.receipt_last_error === null || row.receipt_last_error === undefined ? null : String(row.receipt_last_error),
      receiptLastAttemptAt:
        row.receipt_last_attempt_at === null || row.receipt_last_attempt_at === undefined
          ? null
          : String(row.receipt_last_attempt_at),
      workspaceRoot:
        row.workspace_root === null || row.workspace_root === undefined ? null : String(row.workspace_root),
      workspacePath:
        row.workspace_path === null || row.workspace_path === undefined ? null : String(row.workspace_path),
      outputFilesJson:
        row.output_files_json === null || row.output_files_json === undefined ? '[]' : String(row.output_files_json),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapDeliveryGroupRow(row: Record<string, unknown>): DeliveryGroupRecord {
    return {
      id: String(row.id),
      sourceRef: row.source_ref === null || row.source_ref === undefined ? null : String(row.source_ref),
      repoConnectionId:
        row.repo_connection_id === null || row.repo_connection_id === undefined ? null : String(row.repo_connection_id),
      targetBranch: row.target_branch === null || row.target_branch === undefined ? null : String(row.target_branch),
      status: String(row.status) as DeliveryGroupRecord['status'],
      metadataJson: row.metadata_json === null || row.metadata_json === undefined ? '{}' : String(row.metadata_json),
      commitSha: row.commit_sha === null || row.commit_sha === undefined ? null : String(row.commit_sha),
      prNumber: row.pr_number === null || row.pr_number === undefined ? null : Number(row.pr_number),
      prUrl: row.pr_url === null || row.pr_url === undefined ? null : String(row.pr_url),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapWatchdogHistoryRow(row: Record<string, unknown>): WatchdogHistoryRecord {
    return {
      id: String(row.id),
      runId: String(row.run_id),
      status: String(row.status),
      detectedPattern: row.detected_pattern === null || row.detected_pattern === undefined ? null : String(row.detected_pattern),
      matchedSignature:
        row.matched_signature === null || row.matched_signature === undefined ? null : String(row.matched_signature),
      recommendation: String(row.recommendation),
      action: row.action === null || row.action === undefined ? null : String(row.action),
      detailsJson: row.details_json === null || row.details_json === undefined ? '{}' : String(row.details_json),
      createdAt: String(row.created_at)
    };
  }

  private mapWatchdogRecoveryJobRow(row: Record<string, unknown>): WatchdogRecoveryJobRecord {
    return {
      id: String(row.id),
      rootRunId: String(row.root_run_id),
      triggerRunId: String(row.trigger_run_id),
      replacementRunId: String(row.replacement_run_id),
      sessionId: String(row.session_id),
      queueItemId: row.queue_item_id === null || row.queue_item_id === undefined ? null : String(row.queue_item_id),
      action: String(row.action),
      attempt: Number(row.attempt),
      dueAt: String(row.due_at),
      status: String(row.status) as WatchdogRecoveryJobRecord['status'],
      statusReason: row.status_reason === null || row.status_reason === undefined ? null : String(row.status_reason),
      detailsJson: row.details_json === null || row.details_json === undefined ? '{}' : String(row.details_json),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapCompoundingLearningRow(row: Record<string, unknown>): CompoundingLearningRecord {
    return {
      id: String(row.id),
      agentId: String(row.agent_id),
      runId: String(row.run_id),
      sessionId: String(row.session_id),
      category: String(row.category) as CompoundingLearningRecord['category'],
      insight: String(row.insight),
      evidence: String(row.evidence ?? ''),
      significance: Number(row.significance ?? 1),
      applied: Number(row.applied ?? 0) === 1,
      metadataJson: row.metadata_json === null || row.metadata_json === undefined ? '{}' : String(row.metadata_json),
      createdAt: String(row.created_at)
    };
  }

  private mapImprovementProposalRow(row: Record<string, unknown>): ImprovementProposalRecord {
    return {
      id: String(row.id),
      agentId: String(row.agent_id),
      proposedChangesJson:
        row.proposed_changes_json === null || row.proposed_changes_json === undefined
          ? '[]'
          : String(row.proposed_changes_json),
      reasoning: String(row.reasoning ?? ''),
      learningIdsJson: row.learning_ids_json === null || row.learning_ids_json === undefined ? '[]' : String(row.learning_ids_json),
      status: String(row.status) as ImprovementProposalRecord['status'],
      operatorNotes: row.operator_notes === null || row.operator_notes === undefined ? null : String(row.operator_notes),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  private mapLocalRuntimeSessionRow(row: Record<string, unknown>): LocalRuntimeSessionRecord {
    return {
      id: String(row.id),
      runtime: String(row.runtime ?? 'claude') as LocalRuntimeSessionKind,
      projectSlug: String(row.project_slug),
      filePath: String(row.file_path),
      model: String(row.model ?? 'unknown'),
      branch: row.branch === null || row.branch === undefined ? null : String(row.branch),
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
      cacheReadInputTokens: Number(row.cache_read_input_tokens ?? 0),
      cacheCreationInputTokens: Number(row.cache_creation_input_tokens ?? 0),
      toolUseCount: Number(row.tool_use_count ?? 0),
      messageCount: Number(row.message_count ?? 0),
      estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
      active: Number(row.active ?? 0) === 1,
      lastUserPrompt: row.last_user_prompt === null || row.last_user_prompt === undefined ? null : String(row.last_user_prompt),
      lastMessageAt: String(row.last_message_at),
      detailsJson: row.details_json === null || row.details_json === undefined ? '{}' : String(row.details_json),
      updatedAt: String(row.updated_at)
    };
  }

  private mapRunTerminalSessionRow(row: Record<string, unknown>): RunTerminalSessionRecord {
    return {
      runId: String(row.run_id),
      sessionId: String(row.session_id),
      runtime: String(row.runtime) as RunTerminalSessionRecord['runtime'],
      mode: String(row.mode) as RunTerminalSessionRecord['mode'],
      muxSessionId: row.mux_session_id === null || row.mux_session_id === undefined ? null : String(row.mux_session_id),
      workspacePath: row.workspace_path === null || row.workspace_path === undefined ? null : String(row.workspace_path),
      status: String(row.status) as RunTerminalSessionRecord['status'],
      startedAt: String(row.started_at),
      endedAt: row.ended_at === null || row.ended_at === undefined ? null : String(row.ended_at),
      lastOffset: Number(row.last_offset ?? 0),
      retentionUntil: row.retention_until === null || row.retention_until === undefined ? null : String(row.retention_until),
      metadataJson: row.metadata_json === null || row.metadata_json === undefined ? '{}' : String(row.metadata_json)
    };
  }

  private mapRunTerminalChunkRow(row: Record<string, unknown>): RunTerminalChunkRecord {
    return {
      id: String(row.id),
      runId: String(row.run_id),
      sessionId: String(row.session_id),
      offset: Number(row.offset),
      chunk: String(row.chunk),
      source: String(row.source) as RunTerminalChunkRecord['source'],
      createdAt: String(row.created_at)
    };
  }

  private mapLlmUsageEventRow(row: Record<string, unknown>): LlmUsageEventRecord {
    return {
      id: String(row.id),
      ts: String(row.ts),
      dayUtc: String(row.day_utc),
      monthUtc: String(row.month_utc),
      runId: row.run_id === null || row.run_id === undefined ? null : String(row.run_id),
      sessionId: row.session_id === null || row.session_id === undefined ? null : String(row.session_id),
      runtime: String(row.runtime) as LlmUsageEventRecord['runtime'],
      provider: String(row.provider),
      model: String(row.model),
      taskType: String(row.task_type),
      attempt: Number(row.attempt),
      status: String(row.status) as LlmUsageStatus,
      promptTokens: row.prompt_tokens === null || row.prompt_tokens === undefined ? null : Number(row.prompt_tokens),
      completionTokens:
        row.completion_tokens === null || row.completion_tokens === undefined ? null : Number(row.completion_tokens),
      totalTokens: row.total_tokens === null || row.total_tokens === undefined ? null : Number(row.total_tokens),
      costUsd: row.cost_usd === null || row.cost_usd === undefined ? null : Number(row.cost_usd),
      costConfidence: String(row.cost_confidence) as LlmCostConfidence,
      metadataJson: row.metadata_json === null || row.metadata_json === undefined ? '{}' : String(row.metadata_json)
    };
  }

  private mapAgentProfileRow(row: Record<string, unknown>): AgentProfileRecord {
    return {
      id: String(row.id),
      name: String(row.name),
      title: String(row.title),
      parentAgentId: row.parent_agent_id === null || row.parent_agent_id === undefined ? null : String(row.parent_agent_id),
      systemPrompt: String(row.system_prompt),
      defaultRuntime: String(row.default_runtime) as AgentProfileRecord['defaultRuntime'],
      defaultModel: row.default_model === null || row.default_model === undefined ? null : String(row.default_model),
      allowedRuntimesJson:
        row.allowed_runtimes_json === null || row.allowed_runtimes_json === undefined ? '[]' : String(row.allowed_runtimes_json),
      skillsJson: row.skills_json === null || row.skills_json === undefined ? '[]' : String(row.skills_json),
      toolsJson: row.tools_json === null || row.tools_json === undefined ? '[]' : String(row.tools_json),
      metadataJson: row.metadata_json === null || row.metadata_json === undefined ? '{}' : String(row.metadata_json),
      enabled: Boolean(row.enabled),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  exportAllTables(): Record<string, unknown> {
    const tableRows = this.db
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name ASC
      `)
      .all() as Array<{ name: string }>;

    const snapshot: Record<string, unknown> = {};

    for (const row of tableRows) {
      snapshot[row.name] = this.db.prepare(`SELECT * FROM ${row.name}`).all();
    }

    return snapshot;
  }
}

function mapQueueRow(row: Record<string, unknown>): QueueItemRecord {
  return {
    id: String(row.id),
    lane: String(row.lane),
    sessionId: String(row.session_id),
    runId: String(row.run_id),
    payloadJson: String(row.payload_json),
    priority: Number(row.priority),
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    availableAt: String(row.available_at),
    status: String(row.status) as QueueStatus,
    lastError:
      row.last_error === null || row.last_error === undefined
        ? null
        : typeof row.last_error === 'string'
          ? row.last_error
          : typeof row.last_error === 'number' || typeof row.last_error === 'boolean'
            ? String(row.last_error)
            : JSON.stringify(row.last_error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return Array.from(
    new Set(
      input
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0)
    )
  );
}
