import type {
  BacklogState as SharedBacklogState,
  ChannelKind,
  ChatType,
  IntakeDecisionAction,
  MessageSource,
  RunStatus as SharedRunStatus,
  RuntimeKind,
  SessionRecord
} from '../../../packages/shared/src/index.ts';

export interface ApiEnvelope {
  ok: boolean;
  error?: string;
  details?: unknown;
}

export type AppNotificationTone = 'info' | 'success' | 'warning' | 'critical';

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  tone: AppNotificationTone;
  createdAt: string;
  read: boolean;
  route: string | null;
  source: 'runtime' | 'system';
  sessionId?: string | null;
  runId?: string | null;
  eventSequence?: number;
}

export type AccessRole = 'viewer' | 'operator' | 'admin';

type SessionState = SessionRecord['state'];

export type RunStatus = SharedRunStatus;
export type InteractionMode = IntakeDecisionAction;

export interface SessionRow {
  id: string;
  sessionKey: string;
  channel: ChannelKind;
  chatType: ChatType;
  agentId: string;
  agentProfile?: AgentProfileRow | null;
  preferredRuntime: RuntimeKind | null;
  preferredModel: string | null;
  preferredReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null;
  activeRunId?: string | null;
  state: SessionState;
  lastActivityAt: string;
  metadata?: Record<string, unknown>;
  browserSessionProfile?: BrowserSessionProfileSummaryRow | null;
}

export interface PairingRow {
  id: string;
  channel: ChannelKind;
  senderId: string;
  senderHandle: string;
  status: 'pending' | 'approved' | 'revoked';
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface AgentProfileRow {
  id: string;
  name: string;
  title: string;
  parentAgentId: string | null;
  systemPrompt: string;
  defaultRuntime: RuntimeKind;
  defaultModel: string | null;
  allowedRuntimes: RuntimeKind[];
  skills: string[];
  tools: string[];
  metadata: Record<string, unknown>;
  executionMode: 'on_demand' | 'persistent_harness' | 'dispatch_only';
  harnessRuntime: RuntimeKind | null;
  persistentHarnessRuntime?: RuntimeKind | null;
  harnessAutoStart: boolean;
  harnessSessionName: string | null;
  harnessSessionReady: boolean;
  harnessCommand: string | null;
  protectedDefault?: boolean;
  baselineVersion?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OnboardingStatus = 'not_started' | 'in_progress' | 'blocked' | 'ready';
export type OnboardingStepStatus = 'pending' | 'complete' | 'blocked';

export interface OnboardingStepRow {
  id: 'ceo_baseline' | 'vault' | 'provider_keys' | 'smoke_run';
  title: string;
  status: OnboardingStepStatus;
  detail: string;
  updatedAt: string | null;
}

export interface OnboardingEvidenceRow {
  version: 1;
  ceoBaselineConfiguredAt: string | null;
  vaultLastValidatedAt: string | null;
  providerKeysCheckedAt: string | null;
  smokeRun:
    | {
        runId: string;
        runtime: RuntimeKind;
        model: string | null;
        status: RunStatus;
        summary: string | null;
        error: string | null;
        completedAt: string;
      }
    | null;
}

export interface OnboardingStateRow {
  status: OnboardingStatus;
  steps: OnboardingStepRow[];
  blockers: string[];
  evidence: OnboardingEvidenceRow;
  companyName: string;
  ceoAgentId: string;
  ceoName?: string | null;
  ceoTitle?: string | null;
  ceoSystemPrompt?: string | null;
  providerKeys: {
    openrouter: boolean;
    google: boolean;
    telegram: boolean;
    voyage: boolean;
    github: boolean;
    hasAtLeastOneKey: boolean;
    hasRequiredSet: boolean;
  };
}

export interface OnboardingProviderLiveCheckRow {
  configured: boolean;
  tested: boolean;
  ok: boolean | null;
  status: 'ok' | 'missing' | 'error' | 'skipped';
  latencyMs: number | null;
  detail: string;
}

export interface OnboardingProviderLiveDiagnosticsRow {
  checkedAt: string;
  overall: 'ok' | 'degraded' | 'failed';
  providers: {
    telegram: OnboardingProviderLiveCheckRow;
    openrouter: OnboardingProviderLiveCheckRow;
    google: OnboardingProviderLiveCheckRow;
    github: OnboardingProviderLiveCheckRow;
    voyage: OnboardingProviderLiveCheckRow;
  };
}

export interface RunRow {
  id: string;
  sessionId: string;
  status: RunStatus;
  runtime: RuntimeKind;
  requestedRuntime?: RuntimeKind | null;
  requestedModel?: string | null;
  requestedReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null;
  effectiveRuntime?: RuntimeKind | null;
  effectiveModel?: string | null;
  effectiveReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null;
  triggerSource?: string | null;
  supersedesRunId?: string | null;
  prompt: string;
  resultSummary: string | null;
  error: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  interactionMode?: InteractionMode | null;
  interactionModeReason?: string | null;
}

export type BacklogState = SharedBacklogState;

export interface BacklogDependencyRow {
  itemId: string;
  dependsOnItemId: string;
  createdAt: string;
}

export interface BacklogTransitionRow {
  id: string;
  itemId: string;
  fromState: BacklogState | null;
  toState: BacklogState;
  actor: string;
  reason: string;
  metadataJson: string;
  createdAt: string;
}

export interface BacklogDeliveryRow {
  id: string;
  itemId: string;
  repoConnectionId: string | null;
  branchName: string | null;
  commitSha: string | null;
  prNumber: number | null;
  prUrl: string | null;
  status: 'planned' | 'in_progress' | 'review' | 'merged' | 'blocked' | 'closed';
  githubState:
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
    | 'blocked'
    | null;
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
  checks?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  githubLease?: Record<string, unknown>;
  githubWorktree?: Record<string, unknown>;
  githubReconcile?: Record<string, unknown>;
}

export type GithubDeliveryRepairAction =
  | 'refresh'
  | 'verified_webhook_redrive'
  | 'stale_lease_clear'
  | 'branch_orphan_mark';

export interface GithubDeliveryJournalEntryRow {
  id: string;
  kind: string;
  phase: string;
  createdAt: string;
  summary: string;
  status: string | null;
  actor: string | null;
  source: string;
  trust: {
    source: string;
    verified: boolean;
  };
  reference?: string | null;
  evidence: Record<string, unknown>;
}

export interface GithubDeliveryJournalRow {
  schema: string;
  version: number;
  itemId: string;
  deliveryId: string;
  currentState: {
    status: string;
    githubState: BacklogDeliveryRow['githubState'];
    githubStateReason: string | null;
  };
  entries: GithubDeliveryJournalEntryRow[];
}

export interface GithubDeliveryRepairPreviewRow {
  schema: string;
  version: number;
  dryRun: boolean;
  action: GithubDeliveryRepairAction;
  actor: string;
  allowed: boolean;
  idempotencyKey: string;
  authorization: Record<string, unknown>;
  expectedAudit: Record<string, unknown>;
  evidence: Record<string, unknown>;
  expectedEffects: string[];
}

export interface BacklogDeliveryDetailRow {
  item: BacklogItemRow;
  delivery: BacklogDeliveryRow;
  journal: GithubDeliveryJournalRow;
  evidenceBundle: Record<string, unknown>;
  contracts: {
    githubDelivery: Record<string, unknown>;
    githubDeliveryJournal: Record<string, unknown>;
    githubDeliveryRepair: Record<string, unknown>;
    githubComparativeEvidence: Record<string, unknown>;
  };
}

export interface BacklogItemRow {
  id: string;
  title: string;
  description: string;
  state: BacklogState;
  priority: number;
  labelsJson: string;
  source: string;
  sourceRef: string | null;
  createdBy: string;
  projectId: string | null;
  repoRoot: string | null;
  assignedAgentId: string | null;
  linkedSessionId: string | null;
  linkedRunId: string | null;
  deliveryGroupId?: string | null;
  blockedReason: string | null;
  originSessionId: string | null;
  originMessageId: string | null;
  originChannel: string | null;
  originChatId: string | null;
  originTopicId: string | null;
  metadataJson: string;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  metadata: Record<string, unknown>;
  dependencies: BacklogDependencyRow[];
  dependencyStates?: Array<{
    itemId: string;
    state: BacklogState | 'missing';
  }>;
  unresolvedDependencies?: string[];
  dispatchReady?: boolean;
  dispatch?: {
    whyAgent: string | null;
    whyRuntime: string | null;
    dependencyState: {
      ready: boolean;
      unresolved: string[];
    };
    parallelismSlot: number | null;
    modelRouteChain: Array<{
      runtime: RuntimeKind;
      model: string | null;
      reason: string;
    }>;
  };
  transitions: BacklogTransitionRow[];
  execution?: {
    runId: string;
    runStatus: RunStatus;
    requestedRuntime: RuntimeKind | null;
    requestedModel: string | null;
    effectiveRuntime: RuntimeKind | null;
    effectiveModel: string | null;
    routeChain: Array<{
      runtime: RuntimeKind;
      model: string | null;
      reason: string;
    }>;
    runError: string | null;
    runSummary: string | null;
    runUpdatedAt: string;
    terminal: null | {
      status: 'active' | 'completed' | 'failed' | 'aborted';
      mode: 'direct' | 'tmux' | 'api';
      muxSessionId: string | null;
      harnessSessionId?: string | null;
      workspacePath: string | null;
      lastOffset: number;
      startedAt: string;
      endedAt: string | null;
    };
    lastChunkPreview: string | null;
  } | null;
  delivery: BacklogDeliveryRow | null;
  deliveryGroup?: {
    id: string;
    sourceRef: string | null;
    repoConnectionId: string | null;
    targetBranch: string | null;
    status: 'in_progress' | 'ready_to_publish' | 'published';
    memberCount: number;
    completedCount: number;
    metadata: Record<string, unknown>;
  } | null;
}

export type BacklogBoardColumns = Record<BacklogState, BacklogItemRow[]>;

export interface BacklogProjectScopeRow {
  projectId: string | null;
  repoRoot: string | null;
  unscopedOnly: boolean;
}

export interface BacklogScopeSummaryRow {
  projectId: string | null;
  repoRoot: string | null;
  itemCount: number;
  activeCount: number;
  blockedCount: number;
  latestUpdatedAt: string | null;
  label: string;
  projectLabel: string | null;
  repoLabel: string | null;
}

export interface BacklogOrchestrationControlRow {
  id: string;
  enabled: boolean;
  paused: boolean;
  maxParallel: number;
  wipLimit: number;
  escalationMode: 'notify' | 'auto_block' | 'manual_only';
  lastTickAt: string | null;
  updatedAt: string;
}

export interface BacklogOrchestrationDecisionRow {
  id: string;
  itemId: string | null;
  action: string;
  decision: string;
  detailsJson: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface BacklogDecisionStreamRow {
  id: string;
  itemId: string | null;
  action: string;
  decision: string;
  reasonCode: string;
  createdAt: string;
  scope: {
    projectId: string | null;
    repoRoot: string | null;
  };
  details: Record<string, unknown>;
  rankedCandidates: Array<{
    agentId: string | null;
    score: number | null;
    reasons: string[];
  }>;
}

export interface BacklogContractsState {
  contracts: {
    backlogUx: Record<string, unknown>;
    deliveryEvidence: Record<string, unknown>;
    githubDelivery: Record<string, unknown>;
    githubDeliveryJournal: Record<string, unknown>;
    githubDeliveryRepair: Record<string, unknown>;
    githubComparativeEvidence: Record<string, unknown>;
  };
}

export interface ProjectIntakeResult {
  pipeline: {
    mode: 'generate_and_sync' | 'sync_only';
    generated: boolean;
    generationRunId: string | null;
    generationStatus: string | null;
    generationError: string | null;
    generationTimedOut: boolean;
    waitForGeneration: boolean;
  };
  sync: {
    planPath: string;
    prdPath: string;
    parsedTasks: number;
    created: number;
    updated: number;
    stateTransitions: number;
    dependencySets: number;
    unresolvedDependencies: Array<{
      taskId: string;
      missingTaskIds: string[];
    }>;
    skipped: Array<{
      taskId: string;
      reason: string;
    }>;
    mapped: Array<{
      taskId: string;
      itemId: string;
      state: BacklogState;
    }>;
  };
}

export interface GithubRepoConnectionRow {
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
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RunTerminalSessionRow {
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

export interface RunTerminalChunkRow {
  id: string;
  runId: string;
  sessionId: string;
  offset: number;
  chunk: string;
  source: 'stdout' | 'stderr' | 'system';
  createdAt: string;
}

export interface MessageRow {
  id: string;
  sessionId: string;
  channel: ChannelKind;
  direction: 'inbound' | 'outbound';
  source: MessageSource;
  sender: string;
  content: string;
  createdAt: string;
  metadataJson: string;
  interactionMode?: InteractionMode | null;
  interactionModeReason?: string | null;
}

export interface RuntimeEventRow {
  id: string;
  sequence: number;
  ts: string;
  kind: string;
  lane: string;
  sessionId: string | null;
  runId: string | null;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data: Record<string, unknown>;
}

export interface BoardLanes {
  queued: BoardCard[];
  running: BoardCard[];
  waiting_input: BoardCard[];
  failed: BoardCard[];
  completed: BoardCard[];
}

export interface BoardCard {
  session: SessionRow;
  run?: RunRow;
  queue: number;
}

export interface SkillRow {
  id: string;
  name: string;
  version: string;
  description: string;
  tags?: string[];
  allowedCommands?: string[];
  requiredTools?: string[];
  scopes: {
    filesystem: string;
    process: string;
    network: string;
    secrets: string;
  };
  enabled: boolean;
  requiresApproval: boolean;
  supportsDryRun: boolean;
}

export interface OfficePresenceRow {
  id: string;
  agentId: string;
  sessionId: string;
  runId: string | null;
  state: 'active' | 'waiting_input' | 'blocked' | 'permission_needed' | 'offline';
  activityLabel: string | null;
  sequence: number;
  updatedAt: string;
}

export interface OfficeLayout {
  id: string;
  name: string;
  version: number;
  tilesJson: string;
  furnitureJson: string;
  updatedAt: string;
}

export interface CardMetric {
  id: string;
  label: string;
  value: number;
  displayValue?: string;
  tone: 'neutral' | 'warn' | 'critical' | 'positive';
}

export interface ApiTokenStatus {
  configured: boolean;
  length: number;
  fingerprint: string;
}

export interface ToolRow {
  name: string;
  source: 'runtime' | 'skill' | 'system';
  installed: boolean;
  enabled: boolean;
  updatedAt: string;
}

export type BrowserProviderId = 'scrapling';
export type BrowserTransportMode = 'stdio' | 'http';
export type BrowserHealthState = 'disabled' | 'ready' | 'degraded' | 'missing_dependency' | 'misconfigured';
export type BrowserExtractionMode = 'markdown' | 'html' | 'text';
export type BrowserExtractorId =
  | 'generic'
  | 'article'
  | 'blog'
  | 'reddit_listing'
  | 'tiktok_profile'
  | 'tiktok_video'
  | 'x_profile'
  | 'pinterest_pin';
export type BrowserIntent = 'article_read' | 'document_lookup' | 'structured_extract' | 'dynamic_app' | 'monitor' | 'download_probe';
export type BrowserToolName = 'get' | 'bulk_get' | 'fetch' | 'bulk_fetch' | 'stealthy_fetch' | 'bulk_stealthy_fetch';
export type BrowserPromptInjectionEscalation = 'annotate' | 'require_confirmation' | 'block';
export type BrowserSelectorStrategy = 'document' | 'selector_first';
export type BrowserRiskClass = 'low' | 'medium' | 'high';
export type BrowserCookieSourceKind =
  | 'raw_cookie_header'
  | 'netscape_cookies_txt'
  | 'manual'
  | 'json_cookie_export'
  | 'browser_profile_import';

export type BrowserSessionProfileVisibility = 'shared' | 'session_only';
export type BrowserLocalProfileKind = 'chrome' | 'firefox';

export interface BrowserCapabilityPolicyRow {
  allowedDomains: string[];
  deniedDomains: string[];
  allowProxy: boolean;
  allowStealth: boolean;
  allowVisibleBrowser: boolean;
  allowFileDownloads: boolean;
  distrustThirdPartyContent: boolean;
  promptInjectionEscalation: BrowserPromptInjectionEscalation;
  requireApprovalForStealth: boolean;
  requireApprovalForDownloads: boolean;
  requireApprovalForVisibleBrowser: boolean;
  requireApprovalForProxy: boolean;
}

export interface BrowserCapabilityStatusRow {
  enabled: boolean;
  ready: boolean;
  toolName: string;
  provider: BrowserProviderId;
  transport: BrowserTransportMode;
  healthState: BrowserHealthState;
  executable: string | null;
  httpBaseUrl: string | null;
  blockedReasons: string[];
  installCommands: string[];
  dockerSupport: string[];
  allowedAgents: string[];
}

export interface BrowserCapabilityConfigRow {
  enabled: boolean;
  provider: BrowserProviderId;
  transport: BrowserTransportMode;
  defaultExtraction: BrowserExtractionMode;
  executable: string;
  healthcheckCommand: string;
  installCommand: string;
  bootstrapCommand: string;
  httpBaseUrl: string | null;
  allowedAgents: string[];
  policy: BrowserCapabilityPolicyRow;
}

export interface ConfigValidationIssueRow {
  severity: 'error' | 'warning' | 'info';
  code: string;
  path: string;
  message: string;
  hint?: string;
}

export interface BinaryAvailabilityRow {
  name: string;
  command: string;
  installed: boolean;
  required: boolean;
}

export interface BrowserCapabilityValidationRow {
  ok: boolean;
  degraded: boolean;
  checkedAt: string;
  issues: ConfigValidationIssueRow[];
  errors: ConfigValidationIssueRow[];
  warnings: ConfigValidationIssueRow[];
  infos: ConfigValidationIssueRow[];
  binaryAvailability: BinaryAvailabilityRow[];
}

export interface BrowserProviderCapabilityContractRow {
  schema: 'ops.browser-capability.v1';
  version: 1;
  provider: BrowserProviderId;
  operatorFacingName: string;
  supportedTransports: BrowserTransportMode[];
  defaultTransport: BrowserTransportMode;
  artifactSchema: {
    handleKind: 'browser_artifact';
    previewFields: Array<'url' | 'tool' | 'selector' | 'extractionMode' | 'fallbackReason' | 'previewText'>;
    durableFields: Array<'provider' | 'transport' | 'artifactPath' | 'capturedAt'>;
  };
  providerBoundaries: {
    supportsVisualBrowser: boolean;
    supportsProxy: boolean;
    supportsStealth: boolean;
    supportsFileDownloads: boolean;
    reusableOperatorContract: boolean;
    futureProviders: string[];
  };
  installDoctor: {
    installCommands: string[];
    dockerSupport: string[];
    requiredBinaries: string[];
    optionalBinaries: string[];
  };
  toolIntents: Record<
    BrowserToolName,
    {
      batch: boolean;
      extractionModes: BrowserExtractionMode[];
      useCase: string;
    }
  >;
}

export interface BrowserRouteSummaryRow {
  provider: BrowserProviderId;
  transport: BrowserTransportMode;
  primaryTool: BrowserToolName;
  fallbackTools: BrowserToolName[];
  extractionMode: BrowserExtractionMode;
  selectorStrategy: BrowserSelectorStrategy;
  riskClass: BrowserRiskClass;
  requiresApproval: boolean;
  distrustPageInstructions: boolean;
  fallbackReason: string | null;
  blockedReason: string | null;
  policyReasons: string[];
  urls: string[];
}

export interface BrowserHistoryArtifactRow {
  handle: string;
  url: string;
  tool: BrowserToolName;
  extractionMode: BrowserExtractionMode;
  selector: string | null;
  previewText: string;
  fileName: string;
  inspectUrl: string;
  downloadUrl: string;
}

export interface BrowserTimelineEventRow {
  id: string;
  ts: string;
  type: string;
  details: string;
}

export interface BrowserRunTraceRow {
  runId: string;
  sessionId: string;
  agentId: string | null;
  runStatus: RunStatus;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  provider: BrowserProviderId;
  transport: BrowserTransportMode;
  healthState: BrowserHealthState;
  route: BrowserRouteSummaryRow | null;
  ok: boolean;
  selectedTool: BrowserToolName | null;
  attemptedTools: BrowserToolName[];
  fallbackReason: string | null;
  blockedReason: string | null;
  policyReasons: string[];
  promptInjectionDetected: boolean;
  requiresApproval: boolean;
  error: string | null;
  artifacts: BrowserHistoryArtifactRow[];
  events: BrowserTimelineEventRow[];
}

export interface BrowserHistoryState {
  total: number;
  limit: number;
  offset: number;
  rows: BrowserRunTraceRow[];
}

export interface BrowserArtifactContentRow {
  handle: string;
  runId: string;
  sessionId: string;
  agentId: string | null;
  url: string;
  tool: BrowserToolName;
  extractionMode: BrowserExtractionMode;
  selector: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentPreview: string;
  truncated: boolean;
}

export interface BrowserCookieJarSummaryRow {
  id: string;
  label: string;
  domains: string[];
  sourceKind: BrowserCookieSourceKind;
  cookieCount: number;
  notes: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserHeaderProfileSummaryRow {
  id: string;
  label: string;
  domains: string[];
  headerKeys: string[];
  notes: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserProxyProfileSummaryRow {
  id: string;
  label: string;
  domains: string[];
  proxyServer: string | null;
  hasAuth: boolean;
  notes: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserStorageStateSummaryRow {
  id: string;
  label: string;
  domains: string[];
  originCount: number;
  notes: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserSessionProfileHealthRow {
  state: 'healthy' | 'stale' | 'expires_soon' | 'needs_reconnect' | 'unverified' | 'disabled';
  summary: string;
  needsReconnect: boolean;
}

export interface BrowserLocalProfileRow {
  id: string;
  browserKind: BrowserLocalProfileKind;
  label: string;
  profileName: string;
  profilePath: string;
  isDefault: boolean;
  importStrategy: 'cookie_import' | 'cookie_import_and_real_chrome';
}

export interface BrowserSessionProfileSummaryRow {
  id: string;
  label: string;
  domains: string[];
  cookieJarId: string | null;
  headersProfileId: string | null;
  proxyProfileId: string | null;
  storageStateId: string | null;
  useRealChrome: boolean;
  ownerLabel: string | null;
  visibility: BrowserSessionProfileVisibility;
  allowedSessionIds: string[];
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
  health: BrowserSessionProfileHealthRow;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserSessionVaultState {
  cookieJars: BrowserCookieJarSummaryRow[];
  headerProfiles: BrowserHeaderProfileSummaryRow[];
  proxyProfiles: BrowserProxyProfileSummaryRow[];
  storageStates: BrowserStorageStateSummaryRow[];
  sessionProfiles: BrowserSessionProfileSummaryRow[];
  localProfiles: BrowserLocalProfileRow[];
}

export interface BrowserTestRequestRow {
  agentId?: string;
  url: string;
  selector?: string;
  extractionMode?: BrowserExtractionMode;
  extractorId?: BrowserExtractorId;
  dynamicLikely?: boolean;
  requiresStealth?: boolean;
  requiresProxy?: boolean;
  requiresVisibleBrowser?: boolean;
  requiresDownload?: boolean;
  mainContentOnly?: boolean;
  cacheTtlMs?: number;
  waitSelector?: string;
  locale?: string;
  countryCode?: string;
  timezoneId?: string;
  verifyTls?: boolean;
  extraHeaders?: Record<string, string>;
  extraCookies?: Record<string, string>;
  useRealChrome?: boolean;
  sessionProfileId?: string;
  cookieJarId?: string;
  headersProfileId?: string;
  proxyProfileId?: string;
  storageStateId?: string;
  suspiciousPromptInjection?: boolean;
  previewChars?: number;
}

export type BrowserConnectSiteKey = 'tiktok' | 'instagram' | 'reddit' | 'x' | 'pinterest' | 'facebook' | 'generic';
export type BrowserConnectMethod = 'real_chrome' | 'cookie_import' | 'browser_profile_import';

export interface BrowserConnectSitePresetRow {
  siteKey: BrowserConnectSiteKey;
  label: string;
  domains: string[];
  verifyUrl: string;
  extractorId: BrowserExtractorId | null;
  intent: BrowserIntent;
  dynamicLikely: boolean;
  requiresStealth: boolean;
  mainContentOnly: boolean;
}

export interface BrowserConnectVerificationRow {
  run: RunRow;
  trace: BrowserRunTraceRow | null;
  summary: string | null;
  method?: BrowserConnectMethod;
  site?: BrowserConnectSitePresetRow;
}

export interface PairingRow {
  id: string;
  channel: ChannelKind;
  senderId: string;
  senderHandle: string;
  status: 'pending' | 'approved' | 'revoked';
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface InstallerReadiness {
  ready: boolean;
  required: Array<{ name: string; installed: boolean }>;
  optional: Array<{ name: string; installed: boolean }>;
}

export interface VendorBootstrapStepRow {
  id: string;
  title: string;
  status: 'ok' | 'error' | 'skipped';
  summary: string;
  command: string | null;
  cwd: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
}

export interface VendorBootstrapDiagnosticsRow {
  recommendedTarget: 'tools' | 'all';
  skillsEnabled: boolean;
  skillsReason: string;
  skillsRepo: string;
  skillsRef: string;
  baselineSkillsRepo: string;
  baselineSkillsRef: string;
}

export interface VendorBootstrapResultRow {
  target: 'skills' | 'tools' | 'all' | 'baseline-skills';
  status: 'ok' | 'error';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  warnings: string[];
  context: {
    dataRoot: string;
    toolBinDir: string;
    toolEnvDir: string;
    skillsRoot: string;
    baselineSkillsDir: string;
    vendorWorkspaceRoot: string;
    polybotDir: string;
    polybotConfigPath: string;
  };
  steps: VendorBootstrapStepRow[];
}

export interface SkillCatalogOperationRow {
  id: string;
  action: 'install' | 'remove' | 'resync' | 'catalog_upsert' | 'catalog_remove';
  sourceRef: string | null;
  actor: string;
  status: 'ok' | 'error' | 'blocked';
  summary: string;
  detailsJson: string;
  createdAt: string;
}

export interface SkillCatalogEntryRow {
  path: string;
  name?: string;
  enabled?: boolean;
  requiresApproval?: boolean;
  supportsDryRun?: boolean;
  tags?: string[];
  allowedCommands?: string[];
  requiredTools?: string[];
}

export interface SkillCatalogState {
  catalogBackend?: string;
  catalogStrict: boolean;
  directories: string[];
  entries: SkillCatalogEntryRow[];
  skills: SkillRow[];
  installer: {
    enabled: boolean;
    allowedSources: string[];
    blockedSources: string[];
    requireApproval: boolean;
    timeoutMs: number;
    maxAttempts: number;
    installRoot: string;
    readiness: InstallerReadiness;
  };
  operations: SkillCatalogOperationRow[];
}

export interface HousekeepingState {
  enabled: boolean;
  intervalSec: number;
  inFlight: boolean;
  lastRunAt: string | null;
  lastError: string | null;
  lastResult: Record<string, unknown> | null;
  diagnostics?: {
    memoryRetentionCoherent: boolean;
    memoryRetentionWarning: string | null;
    terminalRetentionCoverage: number;
    staleWaitingDemotions: number;
    staleLiveDemotions?: number;
  };
  retention: {
    sessionsHours: {
      delegate: number;
      dashboard: number;
      agent: number;
      internal: number;
      telegram: number;
      office: number;
      unknown: number;
    };
    runHours: number;
    terminalHours?: number;
    waitingInputStaleMinutes?: number;
    messageHours: number;
    realtimeHours: number;
    officePresenceHours: number;
    llmUsageDays: number;
    memoryDays: number;
    memoryMarkdownDays?: number;
    auditDays: number;
    protectedSessionKeys: string[];
  };
  cleanup?: {
    deadLetterCount: number;
    artifactPrefixes: string[];
    allowlistedRoots: string[];
  };
}

export interface CronStatusState {
  jobs: Array<{
    jobName: string;
    schedule: string;
    lastRunAt: string | null;
    nextRunAt: string;
    lastStatus: string | null;
    active: boolean;
  }>;
  reaper: {
    retentionMs: number;
    intervalMs: number;
    inFlight: boolean;
    lastRunAt: string | null;
    reapedToday: number;
    reapedTotal: number;
    lastSummary: Record<string, unknown> | null;
  };
  heartbeatSuppression: {
    suppressedToday: number;
    lastPreview: string | null;
  };
  history: Array<{
    id: string;
    jobName: string;
    trigger: string;
    status: string;
    detailsJson: string;
    createdAt: string;
    details: Record<string, unknown>;
  }>;
}

export type ScheduleKind = 'builtin' | 'targeted';
export type ScheduleCadenceKind = 'interval' | 'cron';
export type ScheduleSessionTarget = 'origin_session' | 'dedicated_schedule_session' | 'explicit_session';
export type ScheduleDeliveryTarget = 'origin_session' | 'dedicated_schedule_session' | 'artifact_only' | 'silent_on_heartbeat';
export type ScheduleConcurrencyPolicy = 'skip' | 'queue' | 'replace';

export interface ScheduleRow {
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
  paused: boolean;
  isDue: boolean;
  requestedBy: string | null;
  requestingSessionId: string | null;
  originRef: Record<string, unknown>;
  targetAgentId: string | null;
  sessionTarget: ScheduleSessionTarget;
  deliveryTarget: ScheduleDeliveryTarget;
  deliveryTargetSessionId: string | null;
  prompt: string | null;
  runtime: RuntimeKind | null;
  model: string | null;
  jobMode: string | null;
  approvalProfile: string | null;
  concurrencyPolicy: ScheduleConcurrencyPolicy;
  domainPolicy: Record<string, unknown>;
  rateLimitPolicy: Record<string, unknown>;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastResult: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  activeRun: {
    runId: string;
    sessionId: string;
    status: string;
  } | null;
}

export interface ScheduleHistoryRow {
  id: string;
  scheduleId: string;
  trigger: 'manual' | 'schedule' | 'repair' | 'request';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped' | 'blocked' | 'cancelled';
  runId: string | null;
  sessionId: string | null;
  requestedBy: string | null;
  deliveryTarget: ScheduleDeliveryTarget;
  summary: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleDetailState {
  schedule: ScheduleRow;
  history: ScheduleHistoryRow[];
}

export type LocalRuntimeKind = 'codex' | 'claude' | 'gemini';

export interface LocalRuntimeSessionRow {
  id: string;
  runtime: LocalRuntimeKind;
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
  details?: Record<string, unknown>;
  gatewaySession?: {
    id: string;
    sessionKey: string;
    channel: ChannelKind;
    state: SessionState;
  } | null;
}

export interface LocalRuntimeStatsBucket {
  costToday: number;
  costThisWeek: number;
  costThisMonth: number;
  tokensByModel: Record<string, number>;
  activeSessions: number;
  totalSessions: number;
  totalTokens: number;
}

export interface LocalRuntimeStatsState {
  runtime: LocalRuntimeKind | 'all';
  costToday: number;
  costThisWeek: number;
  costThisMonth: number;
  tokensByModel: Record<string, number>;
  topProjects: Array<{ projectSlug: string; count: number }>;
  byRuntime: Record<LocalRuntimeKind, LocalRuntimeStatsBucket>;
  activeSessions: number;
  totalSessions: number;
}

export interface ImprovementLearningRow {
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
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ImprovementProposalRow {
  id: string;
  agentId: string;
  proposedChangesJson: string;
  proposedChanges: string[];
  reasoning: string;
  learningIdsJson: string;
  learningIds: string[];
  status: 'pending' | 'approved' | 'rejected';
  operatorNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WatchdogStatusRow {
  runId: string;
  sessionId: string;
  runtime: RuntimeKind;
  status: 'healthy' | 'stalled_no_output' | 'error_detected' | 'quota_exceeded' | 'context_overflow' | 'stuck_at_prompt';
  detectedPattern: string | null;
  matchedSignature: string | null;
  recommendation: 'continue' | 'abort_and_retry' | 'abort_and_switch_provider' | 'alert_human';
  lastOutputAgeMs: number;
  ts: string | null;
}

export interface WatchdogHistoryRow {
  id: string;
  runId: string;
  status: string;
  detectedPattern: string | null;
  matchedSignature: string | null;
  recommendation: string;
  action: string | null;
  detailsJson: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface VaultStatusRow {
  enabled: boolean;
  initialized: boolean;
  locked: boolean;
  activeKeyVersion: number | null;
  secretCount: number;
  revokedSecretCount: number;
  keyVersions: Array<{
    version: number;
    status: 'active' | 'retired' | 'revoked';
    createdAt: string;
    revokedAt: string | null;
  }>;
}

export interface VaultSecretRow {
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

export interface RuntimeConfigState {
  config: Record<string, unknown>;
  sensitive: Record<
    string,
    {
      configured: boolean;
      source: 'unset' | 'plain' | 'env' | 'vault';
      redacted: boolean;
    }
  >;
  configMeta: {
    runtimeConfigPath: string | null;
    writable: boolean;
    restartRequired: boolean;
  };
}

export interface LlmFallbackTarget {
  runtime: RuntimeKind;
  model: string | null;
}

export interface LlmLimitsState {
  providerCallBudgetDaily: Record<string, number>;
  providerCallsPerMinute: Record<string, number>;
  providerCostBudgetUsdDaily: Record<string, number>;
  providerCostBudgetUsdMonthly: Record<string, number>;
  modelCallBudgetDaily: Record<string, number>;
  primaryModelByRuntime: Record<RuntimeKind, string | null>;
  fallbackByRuntime: Record<RuntimeKind, LlmFallbackTarget[]>;
  strictPrimaryByRuntime: Record<RuntimeKind, boolean>;
  localHarnessByRuntime: Record<RuntimeKind, boolean>;
  orchestratorPrimaryModelByRuntime: Record<RuntimeKind, string | null>;
  orchestratorFallbackByRuntime: Record<RuntimeKind, LlmFallbackTarget[]>;
  orchestratorStrictPrimaryByRuntime: Record<RuntimeKind, boolean>;
  orchestratorLocalHarnessByRuntime: Record<RuntimeKind, boolean>;
}

export interface LlmOnboardingState {
  providerKeys: {
    openrouter: boolean;
    google: boolean;
  };
  hasAtLeastOneKey: boolean;
  requirements: {
    minimum: string;
    recommended: string[];
    requiredProviders?: Array<'openrouter' | 'google'>;
  };
}

export interface LlmModelRegistryEntryRow {
  model: string;
  provider: 'google' | 'openrouter' | 'local' | 'default';
  allowedRuntimes: RuntimeKind[];
  sources: string[];
}

export interface LlmModelRegistryState {
  generatedAt: string;
  startupMode: 'warn' | 'hard_error';
  runtimeCatalogs: Record<RuntimeKind, string[]>;
  runtimes: Record<
    RuntimeKind,
    {
      nativeModels: string[];
      catalogModels: string[];
    }
  >;
  providers: {
    google: string[];
    openrouter: string[];
  };
  entries: LlmModelRegistryEntryRow[];
}

export interface LlmModelValidationDiagnosticRow {
  field: string;
  policy: 'worker' | 'orchestrator';
  runtime: RuntimeKind;
  targetRuntime: RuntimeKind;
  value: string | null;
  provider: 'google' | 'openrouter' | 'local' | 'default' | 'unknown';
  issue:
    | 'missing_primary_model'
    | 'unknown_model'
    | 'missing_registry_coverage'
    | 'cross_runtime_model_mismatch'
    | 'provider_namespace_required';
  message: string;
  remediation: string;
  expectedRuntimes?: RuntimeKind[];
}

export interface LlmValidationState {
  valid: boolean;
  checkedAt: string;
  startupMode: 'warn' | 'hard_error';
  diagnostics: LlmModelValidationDiagnosticRow[];
}

export interface ReadinessCheckRow {
  name: string;
  tier: 'ready' | 'warning' | 'degraded' | 'blocked';
  ok: boolean;
  summary: string;
  details?: Record<string, unknown>;
}

export interface ReadinessState {
  score: number;
  tier: 'ready' | 'warning' | 'degraded' | 'blocked';
  checks: ReadinessCheckRow[];
  queue: Record<string, unknown>;
}

export interface CleanupCandidateRow {
  kind: 'dead_letter' | 'runtime_artifact';
  target: string;
  root: string;
  bytes: number;
  status?: string;
  queueItemId?: string;
  runId?: string | null;
  sessionId?: string | null;
  lastError?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CleanupRunState {
  kind: 'dead_letter' | 'runtime_artifact';
  dryRun: boolean;
  count: number;
  candidates: CleanupCandidateRow[];
  purged?: string[];
  removed?: string[];
  roots?: string[];
}

export interface LlmCostsState {
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
  recentEvents: Array<{
    id: string;
    ts: string;
    dayUtc?: string;
    monthUtc?: string;
    runId?: string | null;
    sessionId?: string | null;
    runtime: RuntimeKind;
    provider: string;
    model: string;
    taskType?: string;
    attempt?: number;
    status: string;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    costUsd: number | null;
    costConfidence: 'exact' | 'estimated' | 'unknown';
    metadataJson?: string;
  }>;
}
