import type { RuntimeKind } from '../../../packages/shared/src/index.ts';

import type {
  AccessRole,
  AgentProfileRow,
  ApiTokenStatus,
  ApiEnvelope,
  BinaryAvailabilityRow,
  BacklogBoardColumns,
  BacklogDeliveryDetailRow,
  BacklogContractsState,
  BacklogDecisionStreamRow,
  BacklogItemRow,
  BacklogOrchestrationControlRow,
  BacklogOrchestrationDecisionRow,
  BacklogProjectScopeRow,
  BacklogScopeSummaryRow,
  GithubDeliveryRepairAction,
  GithubDeliveryRepairPreviewRow,
  BoardLanes,
  BrowserArtifactContentRow,
  BrowserCapabilityConfigRow,
  BrowserCapabilityStatusRow,
  BrowserCapabilityValidationRow,
  BrowserConnectMethod,
  BrowserConnectSiteKey,
  BrowserConnectVerificationRow,
  BrowserLocalProfileKind,
  BrowserSessionVaultState,
  BrowserHistoryState,
  BrowserProviderCapabilityContractRow,
  BrowserRunTraceRow,
  BrowserTestRequestRow,
  CardMetric,
  ConfigValidationIssueRow,
  GithubRepoConnectionRow,
  HousekeepingState,
  CronStatusState,
  CleanupRunState,
  InstallerReadiness,
  ImprovementLearningRow,
  ImprovementProposalRow,
  LocalRuntimeKind,
  LocalRuntimeSessionRow,
  LocalRuntimeStatsState,
  MessageRow,
  OfficeLayout,
  OfficePresenceRow,
  LlmCostsState,
  LlmLimitsState,
  LlmModelRegistryState,
  LlmOnboardingState,
  LlmValidationState,
  PairingRow,
  ReadinessState,
  RunRow,
  RunTerminalChunkRow,
  RunTerminalSessionRow,
  RuntimeConfigState,
  RuntimeEventRow,
  ScheduleConcurrencyPolicy,
  ScheduleDetailState,
  ScheduleDeliveryTarget,
  ScheduleHistoryRow,
  ScheduleRow,
  ScheduleSessionTarget,
  SessionRow,
  SkillRow,
  SkillCatalogState,
  SkillCatalogEntryRow,
  SkillCatalogOperationRow,
  ToolRow,
  OnboardingStateRow,
  OnboardingProviderLiveDiagnosticsRow,
  WatchdogHistoryRow,
  WatchdogStatusRow,
  VaultSecretRow,
  VaultStatusRow,
  VendorBootstrapDiagnosticsRow,
  VendorBootstrapResultRow
} from './types';

interface ApiClientOptions {
  token?: string;
}

export class ApiClientError extends Error {
  readonly path: string;
  readonly status: number | null;
  readonly detail: string | null;

  constructor(input: { path: string; status?: number | null; detail?: string | null; message: string }) {
    super(input.message);
    this.name = 'ApiClientError';
    this.path = input.path;
    this.status = input.status ?? null;
    this.detail = input.detail ?? null;
  }
}

function authHeaders(token: string | undefined): Record<string, string> {
  if (!token) {
    return {};
  }
  return {
    Authorization: `Bearer ${token}`
  };
}

function normalizeApiError(path: string, status: number, detail: string): string {
  if (
    path === '/api/sessions/bulk-delete' &&
    status === 404 &&
    detail.includes('Route POST:/api/sessions/bulk-delete not found')
  ) {
    return 'Peer cleanup exists in source, but the running gateway has not loaded that route yet. Restart ElyzeLabs and try Clear peers again.';
  }

  if (
    path === '/api/backlog/cleanup' &&
    status === 500 &&
    detail.includes("Cannot read properties of undefined (reading 'db')")
  ) {
    return 'Backlog cleanup is patched in source, but the running gateway is still on the older handler. Restart ElyzeLabs and try Clear all backlog again.';
  }

  return detail;
}

function buildApiClientError(path: string, status: number | null, detail: string | null): ApiClientError {
  if (detail) {
    return new ApiClientError({
      path,
      status,
      detail,
      message: `Request failed with status ${status}: ${detail}`
    });
  }
  if (status === 500 && path.startsWith('/api')) {
    return new ApiClientError({
      path,
      status,
      detail: null,
      message: 'Request failed with status 500: API proxy could not reach gateway at http://127.0.0.1:8788. Start `pnpm dev:gateway`.'
    });
  }
  return new ApiClientError({
    path,
    status,
    detail: null,
    message: `Request failed with status ${status}`
  });
}

async function performApiFetch(path: string, init: RequestInit, options: ApiClientOptions): Promise<Response> {
  try {
    return await fetch(path, {
      ...init,
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders(options.token),
        ...(init.headers ?? {})
      }
    });
  } catch {
    throw new ApiClientError({
      path,
      status: null,
      detail: null,
      message: 'Network error while contacting API'
    });
  }
}

async function apiRequest<T extends ApiEnvelope>(
  path: string,
  init: RequestInit = {},
  options: ApiClientOptions = {}
): Promise<T> {
  const response = await performApiFetch(path, init, options);

  let raw = '';
  try {
    raw = await response.text();
  } catch {
    raw = '';
  }

  let payload: T | null = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as T;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const normalizedBody = raw.replace(/\s+/g, ' ').trim();
    const rawDetail = payload?.error ?? (normalizedBody.length > 0 ? normalizedBody.slice(0, 240) : '');
    const detail = rawDetail ? normalizeApiError(path, response.status, rawDetail) : '';
    throw buildApiClientError(path, response.status, detail || null);
  }

  if (!payload) {
    throw buildApiClientError(path, response.status, null);
  }

  if (!payload.ok) {
    const detail = payload.error ? normalizeApiError(path, response.status, payload.error) : null;
    throw buildApiClientError(path, response.status, detail);
  }

  return payload;
}

async function apiRequestBlob(
  path: string,
  init: RequestInit = {},
  options: ApiClientOptions = {}
): Promise<{ response: Response; blob: Blob }> {
  const response = await performApiFetch(path, init, options);
  if (!response.ok) {
    let raw = '';
    try {
      raw = await response.text();
    } catch {
      raw = '';
    }
    const detail = raw.trim().length > 0 ? normalizeApiError(path, response.status, raw.replace(/\s+/g, ' ').trim()) : null;
    throw buildApiClientError(path, response.status, detail);
  }
  return {
    blob: await response.blob(),
    response
  };
}

type ApiRequestFieldOptions = {
  token?: string;
  init?: RequestInit;
};

function apiRequestField<T extends ApiEnvelope, K extends keyof T>(
  path: string,
  field: K,
  options: ApiRequestFieldOptions = {}
): Promise<NonNullable<T[K]>> {
  return apiRequest<T>(path, options.init ?? {}, { token: options.token }).then(
    (payload) => payload[field] as NonNullable<T[K]>
  );
}

export function fetchSessions(token?: string): Promise<SessionRow[]> {
  return apiRequestField<ApiEnvelope & { sessions: SessionRow[] }, 'sessions'>('/api/sessions?limit=300', 'sessions', {
    token
  });
}

export async function deleteSessions(
  token: string,
  sessionIds: string[]
): Promise<{
  sessionIds: string[];
  activeRunsAborted: string[];
  cleared: {
    sessions: number;
    runs: number;
    messages: number;
    officePresence: number;
    realtimeEvents: number;
    llmUsageEvents: number;
  };
}> {
  return apiRequest<
    ApiEnvelope & {
      sessionIds: string[];
      activeRunsAborted: string[];
      cleared: {
        sessions: number;
        runs: number;
        messages: number;
        officePresence: number;
        realtimeEvents: number;
        llmUsageEvents: number;
      };
    }
  >(
    '/api/sessions/bulk-delete',
    {
      method: 'POST',
      body: JSON.stringify({
        sessionIds,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export function fetchAuthPrincipal(token?: string): Promise<{ role: AccessRole; allowedRoles: AccessRole[] }> {
  return apiRequestField<
    ApiEnvelope & { principal: { role: AccessRole; allowedRoles: AccessRole[] } },
    'principal'
  >('/api/auth/principal', 'principal', { token });
}

export function fetchBoard(token?: string): Promise<BoardLanes> {
  return apiRequestField<ApiEnvelope & { lanes: BoardLanes }, 'lanes'>('/api/bff/board', 'lanes', { token });
}

export function fetchMetrics(token?: string): Promise<CardMetric[]> {
  return apiRequestField<ApiEnvelope & { cards: CardMetric[] }, 'cards'>('/api/bff/cards', 'cards', { token });
}

export function fetchRuns(token?: string): Promise<RunRow[]> {
  return apiRequestField<ApiEnvelope & { runs: RunRow[] }, 'runs'>('/api/runs?limit=250', 'runs', { token });
}

export function fetchWatchdogStatus(token?: string): Promise<WatchdogStatusRow[]> {
  return apiRequestField<ApiEnvelope & { status: WatchdogStatusRow[] }, 'status'>('/api/watchdog/status', 'status', {
    token
  });
}

export async function fetchRunWatchdog(runId: string, token?: string): Promise<{
  runId: string;
  current: WatchdogStatusRow | null;
  history: WatchdogHistoryRow[];
}> {
  const response = await apiRequest<ApiEnvelope & { runId: string; current: WatchdogStatusRow | null; history: WatchdogHistoryRow[] }>(
    `/api/runs/${encodeURIComponent(runId)}/watchdog`,
    {},
    { token }
  );
  return {
    ...response,
    history: response.history.map((entry) => ({
      ...entry,
      details: entry.details ?? {}
    }))
  };
}

export async function fetchRunTerminal(
  runId: string,
  token?: string,
  options?: { since?: number; limit?: number }
): Promise<{
  run: RunRow;
  terminal: RunTerminalSessionRow | null;
  chunks: RunTerminalChunkRow[];
  nextOffset: number;
}> {
  const since = Math.max(0, options?.since ?? 0);
  const limit = Math.max(1, Math.min(4000, options?.limit ?? 800));
  return apiRequest<
    ApiEnvelope & {
      run: RunRow;
      terminal: RunTerminalSessionRow | null;
      chunks: RunTerminalChunkRow[];
      nextOffset: number;
    }
  >(`/api/runs/${runId}/terminal?since=${String(since)}&limit=${String(limit)}`, {}, { token });
}

export async function fetchEvents(token?: string, since = 0): Promise<RuntimeEventRow[]> {
  const response = await apiRequest<ApiEnvelope & { events: RuntimeEventRow[] }>(
    `/api/events?since=${String(since)}&limit=400`,
    {},
    { token }
  );
  return response.events;
}

export function fetchSkills(token?: string): Promise<SkillRow[]> {
  return apiRequestField<ApiEnvelope & { skills: SkillRow[] }, 'skills'>('/api/skills', 'skills', { token });
}

export async function fetchSkillsCatalog(token?: string): Promise<SkillCatalogState> {
  return apiRequest<ApiEnvelope & SkillCatalogState>('/api/skills/catalog', {}, { token });
}

export async function installExternalSkill(
  token: string,
  payload: { source: string; approved?: boolean; selectedSkills?: string[] }
): Promise<{
  skills: SkillRow[];
  operations?: SkillCatalogOperationRow[];
  installation?: {
    source: { canonical: string };
    installSource: string;
    selectedSkills: string[];
    installedSkills: Array<{ name: string }>;
  };
}> {
  return apiRequest<
    ApiEnvelope & {
      skills: SkillRow[];
      operations?: SkillCatalogOperationRow[];
      installation?: {
        source: { canonical: string };
        installSource: string;
        selectedSkills: string[];
        installedSkills: Array<{ name: string }>;
      };
    }
  >(
    '/api/skills/install',
    {
      method: 'POST',
      body: JSON.stringify({
        source: payload.source,
        selectedSkills: payload.selectedSkills ?? [],
        approved: payload.approved ?? false,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function removeExternalSkill(
  token: string,
  payload: { skillName: string; approved?: boolean }
): Promise<{ skills: SkillRow[]; operations?: SkillCatalogOperationRow[] }> {
  return apiRequest<ApiEnvelope & { skills: SkillRow[]; operations?: SkillCatalogOperationRow[] }>(
    '/api/skills/remove',
    {
      method: 'POST',
      body: JSON.stringify({
        skillName: payload.skillName,
        approved: payload.approved ?? false,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function resyncExternalSkills(
  token: string,
  payload?: { approved?: boolean }
): Promise<{ skills: SkillRow[]; operations?: SkillCatalogOperationRow[] }> {
  return apiRequest<ApiEnvelope & { skills: SkillRow[]; operations?: SkillCatalogOperationRow[] }>(
    '/api/skills/resync',
    {
      method: 'POST',
      body: JSON.stringify({
        approved: payload?.approved ?? false,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function upsertSkillCatalogEntry(
  token: string,
  payload: {
    path: string;
    name?: string;
    approved?: boolean;
  }
): Promise<{ entries: SkillCatalogEntryRow[]; skills: SkillRow[]; operation?: SkillCatalogOperationRow }> {
  return apiRequest<
    ApiEnvelope & { entries: SkillCatalogEntryRow[]; skills: SkillRow[]; operation?: SkillCatalogOperationRow }
  >(
    '/api/skills/catalog/entries/upsert',
    {
      method: 'POST',
      body: JSON.stringify({
        path: payload.path,
        name: payload.name,
        approved: payload.approved ?? false,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function removeSkillCatalogEntry(
  token: string,
  payload: {
    path: string;
    approved?: boolean;
  }
): Promise<{ entries: SkillCatalogEntryRow[]; skills: SkillRow[]; operation?: SkillCatalogOperationRow }> {
  return apiRequest<
    ApiEnvelope & { entries: SkillCatalogEntryRow[]; skills: SkillRow[]; operation?: SkillCatalogOperationRow }
  >(
    '/api/skills/catalog/entries/remove',
    {
      method: 'POST',
      body: JSON.stringify({
        path: payload.path,
        approved: payload.approved ?? false,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function autodiscoverSkills(
  token: string,
  payload?: {
    roots?: string[];
    depth?: number;
    approved?: boolean;
  }
): Promise<{ skills: SkillRow[]; entries: SkillCatalogEntryRow[] }> {
  return apiRequest<ApiEnvelope & { skills: SkillRow[]; entries: SkillCatalogEntryRow[] }>(
    '/api/skills/autodiscover',
    {
      method: 'POST',
      body: JSON.stringify({
        roots: payload?.roots,
        depth: payload?.depth,
        approved: payload?.approved ?? false,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export function fetchChats(token?: string): Promise<Array<{ session: SessionRow; messages: MessageRow[] }>> {
  return apiRequestField<
    ApiEnvelope & { chats: Array<{ session: SessionRow; messages: MessageRow[] }> },
    'chats'
  >('/api/bff/chats?limit=100', 'chats', { token });
}

export async function fetchOffice(token?: string): Promise<{ layout: OfficeLayout; presence: OfficePresenceRow[] }> {
  return apiRequest<ApiEnvelope & { layout: OfficeLayout; presence: OfficePresenceRow[] }>(
    '/api/office/presence',
    {},
    { token }
  );
}

export async function createRun(
  token: string,
  sessionId: string,
  prompt: string,
  options?: {
    runtime?: RuntimeKind;
    model?: string | null;
    lane?: string;
    elevated?: boolean;
    source?: string;
  }
): Promise<RunRow> {
  const idempotencyKey = `dash-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
  const response = await apiRequest<ApiEnvelope & { run: RunRow }>(
    `/api/sessions/${sessionId}/runs`,
    {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        prompt,
        runtime: options?.runtime,
        model: options?.model,
        lane: options?.lane,
        elevated: options?.elevated,
        source: options?.source ?? 'dashboard'
      })
    },
    { token }
  );

  return response.run;
}

export async function createSession(
  token: string,
  payload: {
    label?: string;
    sessionKey?: string;
    agentId?: string;
    runtime?: RuntimeKind;
    model?: string | null;
  }
): Promise<SessionRow> {
  const response = await apiRequest<ApiEnvelope & { session: SessionRow }>(
    '/api/sessions',
    {
      method: 'POST',
      body: JSON.stringify({
        label: payload.label,
        sessionKey: payload.sessionKey,
        agentId: payload.agentId,
        runtime: payload.runtime,
        model: payload.model
      })
    },
    { token }
  );

  return response.session;
}

export async function createSessionLinkCode(
  token: string,
  sessionId: string,
  ttlSec = 600
): Promise<{ code: string; ttlSec: number; expiresAt: string; command: string }> {
  const response = await apiRequest<
    ApiEnvelope & {
      link: { code: string; ttlSec: number; expiresAt: string; command: string };
    }
  >(
    `/api/sessions/${sessionId}/link-code`,
    {
      method: 'POST',
      body: JSON.stringify({
        ttlSec,
        actor: 'dashboard'
      })
    },
    { token }
  );
  return response.link;
}

export async function abortRun(token: string, runId: string): Promise<RunRow> {
  const response = await apiRequest<ApiEnvelope & { run: RunRow }>(
    `/api/runs/${runId}/abort`,
    {
      method: 'POST',
      body: JSON.stringify({ reason: 'dashboard_abort' })
    },
    { token }
  );

  return response.run;
}

export async function approvePairing(channel: string, senderId: string, token: string): Promise<void> {
  await apiRequest<ApiEnvelope>(
    `/api/pairings/${channel}/${senderId}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ actor: 'dashboard' })
    },
    { token }
  );
}

export async function fetchPairings(
  token: string,
  status?: PairingRow['status']
): Promise<PairingRow[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const response = await apiRequest<ApiEnvelope & { pairings: PairingRow[] }>(`/api/pairings${query}`, {}, { token });
  return response.pairings;
}
export async function revokePairing(channel: string, senderId: string, token: string): Promise<void> {
  await apiRequest<ApiEnvelope>(
    `/api/pairings/${channel}/${senderId}/revoke`,
    {
      method: 'POST',
      body: JSON.stringify({ actor: 'dashboard' })
    },
    { token }
  );
}
export async function invokeSkill(
  skillName: string,
  token: string,
  payload: Record<string, unknown>,
  options?: { dryRun?: boolean; approved?: boolean }
): Promise<{ output: string; structured?: Record<string, unknown> }> {
  const response = await apiRequest<ApiEnvelope & { result: { output: string; structured?: Record<string, unknown> } }>(
    `/api/skills/${encodeURIComponent(skillName)}/invoke`,
    {
      method: 'POST',
      body: JSON.stringify({
        payload,
        dryRun: options?.dryRun ?? true,
        approved: options?.approved ?? false,
        actor: 'dashboard'
      })
    },
    { token }
  );
  return response.result;
}

export async function requestElevatedCheck(
  token: string,
  action: string,
  approved: boolean
): Promise<{ allowed: boolean }> {
  return apiRequest<ApiEnvelope & { allowed: boolean }>(
    '/api/security/elevated-check',
    {
      method: 'POST',
      body: JSON.stringify({
        requested: true,
        approved,
        action,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function fetchTokenStatus(token: string): Promise<ApiTokenStatus> {
  const response = await apiRequest<ApiEnvelope & { token: ApiTokenStatus }>('/api/security/token-status', {}, { token });
  return response.token;
}

export async function fetchRuntimeConfig(token: string): Promise<RuntimeConfigState> {
  return apiRequest<ApiEnvelope & RuntimeConfigState>('/api/config/runtime', {}, { token });
}

export async function saveRuntimeConfig(
  token: string,
  config: Record<string, unknown>
): Promise<RuntimeConfigState & { saved: boolean; restartRequired: boolean }> {
  return apiRequest<ApiEnvelope & RuntimeConfigState & { saved: boolean; restartRequired: boolean }>(
    '/api/config/runtime',
    {
      method: 'PUT',
      body: JSON.stringify({
        config,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function fetchHousekeeping(token: string): Promise<HousekeepingState> {
  const response = await apiRequest<ApiEnvelope & { housekeeping: HousekeepingState }>('/api/housekeeping', {}, { token });
  return response.housekeeping;
}

export async function fetchReadiness(token?: string): Promise<ReadinessState> {
  const response = await apiRequest<ApiEnvelope & { readiness: ReadinessState }>('/api/health/readiness', {}, { token });
  return response.readiness;
}

export async function updateHousekeepingRetention(
  token: string,
  updates: Record<string, number | string[]>
): Promise<{ housekeeping: HousekeepingState; changed: Array<{ path: string; value: unknown }> }> {
  return apiRequest<ApiEnvelope & { housekeeping: HousekeepingState; changed: Array<{ path: string; value: unknown }> }>(
    '/api/housekeeping/retention',
    {
      method: 'PATCH',
      body: JSON.stringify({
        actor: 'dashboard',
        updates
      })
    },
    { token }
  );
}

export async function runHousekeepingNow(token: string): Promise<HousekeepingState> {
  const response = await apiRequest<ApiEnvelope & { housekeeping: HousekeepingState }>(
    '/api/housekeeping/run',
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard'
      })
    },
    { token }
  );
  return response.housekeeping;
}

export async function purgeDeadLetterQueue(
  token: string,
  payload?: {
    dryRun?: boolean;
    ids?: string[];
    runId?: string | null;
    sessionId?: string | null;
  }
): Promise<CleanupRunState> {
  const response = await apiRequest<ApiEnvelope & { cleanup: CleanupRunState }>(
    '/api/housekeeping/dead-letter/purge',
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard',
        dryRun: payload?.dryRun ?? true,
        ids: payload?.ids,
        runId: payload?.runId ?? null,
        sessionId: payload?.sessionId ?? null
      })
    },
    { token }
  );
  return response.cleanup;
}

export async function cleanupRuntimeArtifacts(
  token: string,
  payload?: {
    dryRun?: boolean;
    scopeRoot?: string | null;
  }
): Promise<CleanupRunState> {
  const response = await apiRequest<ApiEnvelope & { cleanup: CleanupRunState }>(
    '/api/housekeeping/artifacts/cleanup',
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard',
        dryRun: payload?.dryRun ?? true,
        scopeRoot: payload?.scopeRoot ?? null
      })
    },
    { token }
  );
  return response.cleanup;
}

export async function fetchCronStatus(token: string): Promise<CronStatusState> {
  const response = await apiRequest<ApiEnvelope & CronStatusState>('/api/cron/status', {}, { token });
  return {
    ...response,
    history: response.history.map((entry) => ({
      ...entry,
      details: entry.details ?? {}
    }))
  };
}

export async function fetchSchedules(
  token: string,
  options?: {
    kind?: 'builtin' | 'targeted';
    enabled?: boolean;
    requestedBy?: string;
    targetAgentId?: string;
  }
): Promise<ScheduleRow[]> {
  const params = new URLSearchParams();
  if (options?.kind) {
    params.set('kind', options.kind);
  }
  if (options?.enabled !== undefined) {
    params.set('enabled', String(options.enabled));
  }
  if (options?.requestedBy) {
    params.set('requestedBy', options.requestedBy);
  }
  if (options?.targetAgentId) {
    params.set('targetAgentId', options.targetAgentId);
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await apiRequest<ApiEnvelope & { schedules: ScheduleRow[] }>(`/api/schedules${suffix}`, {}, { token });
  return response.schedules;
}

export async function fetchScheduleDetail(token: string, scheduleId: string): Promise<ScheduleDetailState> {
  const response = await apiRequest<ApiEnvelope & { schedule: ScheduleRow; history: ScheduleHistoryRow[] }>(
    `/api/schedules/${encodeURIComponent(scheduleId)}`,
    {},
    { token }
  );
  return {
    schedule: response.schedule,
    history: response.history
  };
}

export async function createSchedule(
  token: string,
  payload: {
    id?: string | null;
    label: string;
    category: string;
    cadence: string;
    targetAgentId: string;
    prompt: string;
    requestingSessionId?: string | null;
    deliveryTargetSessionId?: string | null;
    sessionTarget?: ScheduleSessionTarget;
    deliveryTarget?: ScheduleDeliveryTarget;
    runtime?: RuntimeKind | null;
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
): Promise<ScheduleRow> {
  const response = await apiRequest<ApiEnvelope & { schedule: ScheduleRow }>(
    '/api/schedules',
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard',
        ...payload
      })
    },
    { token }
  );
  return response.schedule;
}

export async function updateSchedule(
  token: string,
  scheduleId: string,
  payload: Partial<{
    label: string;
    category: string;
    cadence: string;
    enabled: boolean;
    targetAgentId: string | null;
    requestingSessionId: string | null;
    deliveryTargetSessionId: string | null;
    sessionTarget: ScheduleSessionTarget;
    deliveryTarget: ScheduleDeliveryTarget;
    prompt: string | null;
    runtime: RuntimeKind | null;
    model: string | null;
    jobMode: string | null;
    approvalProfile: string | null;
    concurrencyPolicy: ScheduleConcurrencyPolicy;
    requestedBy: string | null;
    metadata: Record<string, unknown>;
    originRef: Record<string, unknown>;
    domainPolicy: Record<string, unknown>;
    rateLimitPolicy: Record<string, unknown>;
  }>
): Promise<ScheduleRow> {
  const response = await apiRequest<ApiEnvelope & { schedule: ScheduleRow }>(
    `/api/schedules/${encodeURIComponent(scheduleId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        actor: 'dashboard',
        ...payload
      })
    },
    { token }
  );
  return response.schedule;
}

export async function pauseSchedule(token: string, scheduleId: string): Promise<ScheduleRow> {
  const response = await apiRequest<ApiEnvelope & { schedule: ScheduleRow }>(
    `/api/schedules/${encodeURIComponent(scheduleId)}/pause`,
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard'
      })
    },
    { token }
  );
  return response.schedule;
}

export async function resumeSchedule(token: string, scheduleId: string): Promise<ScheduleRow> {
  const response = await apiRequest<ApiEnvelope & { schedule: ScheduleRow }>(
    `/api/schedules/${encodeURIComponent(scheduleId)}/resume`,
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard'
      })
    },
    { token }
  );
  return response.schedule;
}

export async function runScheduleNow(
  token: string,
  scheduleId: string
): Promise<{
  schedule: ScheduleRow;
  history: ScheduleHistoryRow | null;
  runId: string | null;
}> {
  const response = await apiRequest<ApiEnvelope & { schedule: ScheduleRow; history?: ScheduleHistoryRow; run?: { id?: string } }>(
    `/api/schedules/${encodeURIComponent(scheduleId)}/run`,
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard'
      })
    },
    { token }
  );
  return {
    schedule: response.schedule,
    history: response.history ?? null,
    runId: response.run?.id ?? null
  };
}

export async function deleteSchedule(token: string, scheduleId: string): Promise<boolean> {
  const response = await apiRequest<ApiEnvelope & { deleted: boolean }>(
    `/api/schedules/${encodeURIComponent(scheduleId)}?actor=dashboard`,
    {
      method: 'DELETE'
    },
    { token }
  );
  return response.deleted === true;
}

export async function runLocalSessionsScan(
  token: string,
  runtime: LocalRuntimeKind | 'all' = 'all'
): Promise<Record<string, unknown>> {
  const response = await apiRequest<ApiEnvelope & { scan: Record<string, unknown> }>(
    '/api/local/sessions/scan',
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard',
        runtime
      })
    },
    { token }
  );
  return response.scan;
}

export async function fetchLocalSessions(
  token: string,
  options?: {
    limit?: number;
    runtime?: LocalRuntimeKind | 'all';
  }
): Promise<{
  runtime: LocalRuntimeKind | 'all';
  sessions: LocalRuntimeSessionRow[];
  scanner: {
    runtimes: Record<
      LocalRuntimeKind,
      {
        root: string;
        intervalMs: number;
        activeThresholdMs: number;
        inFlight: boolean;
        lastScanAt: string | null;
        lastScanError: string | null;
        lastScanSummary: Record<string, unknown> | null;
      }
    >;
  };
}> {
  const limit = Math.max(1, Math.min(2000, options?.limit ?? 200));
  const runtime = options?.runtime ?? 'all';
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('runtime', runtime);
  const response = await apiRequest<
    ApiEnvelope & {
      runtime: LocalRuntimeKind | 'all';
      sessions: LocalRuntimeSessionRow[];
      scanner: {
        runtimes: Record<
          LocalRuntimeKind,
          {
            root: string;
            intervalMs: number;
            activeThresholdMs: number;
            inFlight: boolean;
            lastScanAt: string | null;
            lastScanError: string | null;
            lastScanSummary: Record<string, unknown> | null;
          }
        >;
      };
    }
  >(`/api/local/sessions?${params.toString()}`, {}, { token });
  return response;
}

export async function fetchLocalStats(
  token: string,
  runtime: LocalRuntimeKind | 'all' = 'all'
): Promise<LocalRuntimeStatsState> {
  const response = await apiRequest<ApiEnvelope & { stats: LocalRuntimeStatsState }>(
    `/api/local/stats?runtime=${encodeURIComponent(runtime)}`,
    {},
    { token }
  );
  return response.stats;
}

export async function fetchImprovementLearnings(
  token: string,
  options?: { agentId?: string; category?: ImprovementLearningRow['category']; limit?: number }
): Promise<ImprovementLearningRow[]> {
  const params = new URLSearchParams();
  if (options?.agentId) {
    params.set('agentId', options.agentId);
  }
  if (options?.category) {
    params.set('category', options.category);
  }
  if (options?.limit) {
    params.set('limit', String(options.limit));
  }
  const suffix = params.toString().length > 0 ? `?${params.toString()}` : '';
  const response = await apiRequest<ApiEnvelope & { learnings: ImprovementLearningRow[] }>(
    `/api/improvement/learnings${suffix}`,
    {},
    { token }
  );
  return response.learnings;
}

export async function fetchImprovementProposals(
  token: string,
  options?: { agentId?: string; status?: ImprovementProposalRow['status']; limit?: number }
): Promise<ImprovementProposalRow[]> {
  const params = new URLSearchParams();
  if (options?.agentId) {
    params.set('agentId', options.agentId);
  }
  if (options?.status) {
    params.set('status', options.status);
  }
  if (options?.limit) {
    params.set('limit', String(options.limit));
  }
  const suffix = params.toString().length > 0 ? `?${params.toString()}` : '';
  const response = await apiRequest<ApiEnvelope & { proposals: ImprovementProposalRow[] }>(
    `/api/improvement/proposals${suffix}`,
    {},
    { token }
  );
  return response.proposals;
}

export async function runImprovementCycle(token: string): Promise<{ reviewedAgents: number; created: ImprovementProposalRow[] }> {
  return apiRequest<ApiEnvelope & { reviewedAgents: number; created: ImprovementProposalRow[] }>(
    '/api/improvement/cycle/run',
    {
      method: 'POST',
      body: JSON.stringify({ actor: 'dashboard' })
    },
    { token }
  );
}

export async function approveImprovementProposal(
  token: string,
  proposalId: string,
  notes?: string
): Promise<ImprovementProposalRow | null> {
  const response = await apiRequest<ApiEnvelope & { proposal: ImprovementProposalRow | null }>(
    `/api/improvement/proposals/${encodeURIComponent(proposalId)}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard',
        notes
      })
    },
    { token }
  );
  return response.proposal;
}

export async function rejectImprovementProposal(
  token: string,
  proposalId: string,
  notes?: string
): Promise<ImprovementProposalRow | null> {
  const response = await apiRequest<ApiEnvelope & { proposal: ImprovementProposalRow | null }>(
    `/api/improvement/proposals/${encodeURIComponent(proposalId)}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard',
        notes
      })
    },
    { token }
  );
  return response.proposal;
}

export async function setAgentSelfImprovementEnabled(
  token: string,
  agentId: string,
  enabled: boolean
): Promise<AgentProfileRow> {
  const response = await apiRequest<ApiEnvelope & { agent: AgentProfileRow }>(
    `/api/improvement/agents/${encodeURIComponent(agentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        actor: 'dashboard',
        enabled
      })
    },
    { token }
  );
  return response.agent;
}

export async function fetchLlmLimits(token?: string): Promise<{
  limits: LlmLimitsState;
  updatedAt: string | null;
  registry: LlmModelRegistryState;
  validation: LlmValidationState;
  onboarding: LlmOnboardingState;
}> {
  return apiRequest<
    ApiEnvelope & {
      limits: LlmLimitsState;
      updatedAt: string | null;
      registry: LlmModelRegistryState;
      validation: LlmValidationState;
      onboarding: LlmOnboardingState;
    }
  >(
    '/api/llm/limits',
    {},
    { token }
  );
}

export async function saveLlmLimits(
  token: string,
  limits: LlmLimitsState
): Promise<{
  limits: LlmLimitsState;
  updatedAt: string | null;
  registry: LlmModelRegistryState;
  validation: LlmValidationState;
}> {
  return apiRequest<
    ApiEnvelope & {
      limits: LlmLimitsState;
      updatedAt: string | null;
      registry: LlmModelRegistryState;
      validation: LlmValidationState;
    }
  >(
    '/api/llm/limits',
    {
      method: 'PUT',
      body: JSON.stringify({
        limits,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function fetchLlmCosts(
  token?: string,
  query?: { day?: string; month?: string; tzOffsetMinutes?: number }
): Promise<{
  window: { dayUtc: string; monthUtc: string; mode?: 'utc' | 'local'; tzOffsetMinutes?: number };
  costs: LlmCostsState;
  providerBudgetStatus: Array<{
    provider: string;
    dayCalls: number;
    dayCostUsd: number;
    monthCostUsd: number;
    budgets: {
      dailyCalls: number | null;
      dailyCostUsd: number | null;
      monthlyCostUsd: number | null;
    };
    exhausted: {
      dailyCalls: boolean;
      dailyCostUsd: boolean;
      monthlyCostUsd: boolean;
    };
  }>;
}> {
  const params = new URLSearchParams();
  if (query?.day) {
    params.set('day', query.day);
  }
  if (query?.month) {
    params.set('month', query.month);
  }
  if (typeof query?.tzOffsetMinutes === 'number' && Number.isFinite(query.tzOffsetMinutes)) {
    params.set('tzOffsetMinutes', String(Math.trunc(query.tzOffsetMinutes)));
  }
  const suffix = params.toString().length > 0 ? `?${params.toString()}` : '';
  return apiRequest<
    ApiEnvelope & {
      window: { dayUtc: string; monthUtc: string; mode?: 'utc' | 'local'; tzOffsetMinutes?: number };
      costs: LlmCostsState;
      providerBudgetStatus: Array<{
        provider: string;
        dayCalls: number;
        dayCostUsd: number;
        monthCostUsd: number;
        budgets: {
          dailyCalls: number | null;
          dailyCostUsd: number | null;
          monthlyCostUsd: number | null;
        };
        exhausted: {
          dailyCalls: boolean;
          dailyCostUsd: boolean;
          monthlyCostUsd: boolean;
        };
      }>;
    }
  >(`/api/llm/costs${suffix}`, {}, { token });
}

export async function updateSessionPreferences(
  token: string,
  sessionId: string,
  payload: { runtime?: RuntimeKind; model?: string | null; reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null }
): Promise<SessionRow> {
  const response = await apiRequest<ApiEnvelope & { session: SessionRow }>(
    `/api/sessions/${sessionId}/preferences`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload)
    },
    { token }
  );
  return response.session;
}

export async function switchSessionRuntime(
  token: string,
  sessionId: string,
  payload: {
    runtime?: RuntimeKind;
    model?: string | null;
    reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null;
    prompt?: string;
  }
): Promise<{ switched: boolean; session: SessionRow; run?: RunRow; previousRun?: RunRow; reason?: string }> {
  return apiRequest<ApiEnvelope & { switched: boolean; session: SessionRow; run?: RunRow; previousRun?: RunRow; reason?: string }>(
    `/api/sessions/${sessionId}/switch-runtime`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { token }
  );
}

export async function fetchTools(token?: string): Promise<ToolRow[]> {
  const diagnostics = await fetchToolsDiagnostics(token);
  return diagnostics.tools;
}

export async function fetchToolsDiagnostics(
  token?: string
): Promise<{ tools: ToolRow[]; installerReadiness: InstallerReadiness | null; vendorBootstrap: VendorBootstrapDiagnosticsRow | null }> {
  const response = await apiRequest<
    ApiEnvelope & {
      tools: ToolRow[];
      installerReadiness?: InstallerReadiness;
      vendorBootstrap?: VendorBootstrapDiagnosticsRow;
    }
  >(
    '/api/tools',
    {},
    { token }
  );
  return {
    tools: response.tools,
    installerReadiness: response.installerReadiness ?? null,
    vendorBootstrap: response.vendorBootstrap ?? null
  };
}

function normalizeBrowserValidationIssue(issue: ConfigValidationIssueRow): ConfigValidationIssueRow {
  return {
    ...issue,
    hint: issue.hint ?? undefined
  };
}

function normalizeBrowserValidation(payload: BrowserCapabilityValidationRow): BrowserCapabilityValidationRow {
  return {
    ...payload,
    issues: payload.issues.map(normalizeBrowserValidationIssue),
    errors: payload.errors.map(normalizeBrowserValidationIssue),
    warnings: payload.warnings.map(normalizeBrowserValidationIssue),
    infos: payload.infos.map(normalizeBrowserValidationIssue),
    binaryAvailability: payload.binaryAvailability.map((entry: BinaryAvailabilityRow) => ({
      ...entry
    }))
  };
}

export async function fetchBrowserStatus(
  token?: string
): Promise<{ status: BrowserCapabilityStatusRow; config: BrowserCapabilityConfigRow }> {
  const response = await apiRequest<ApiEnvelope & { status: BrowserCapabilityStatusRow; config: BrowserCapabilityConfigRow }>(
    '/api/browser/status',
    {},
    { token }
  );
  return {
    status: response.status,
    config: response.config
  };
}

export async function fetchBrowserDoctor(
  token?: string
): Promise<{
  status: BrowserCapabilityStatusRow;
  config: BrowserCapabilityConfigRow;
  contract: BrowserProviderCapabilityContractRow;
  validation: BrowserCapabilityValidationRow;
}> {
  const response = await apiRequest<
    ApiEnvelope & {
      status: BrowserCapabilityStatusRow;
      config: BrowserCapabilityConfigRow;
      contract: BrowserProviderCapabilityContractRow;
      validation: BrowserCapabilityValidationRow;
    }
  >('/api/browser/doctor', {}, { token });
  return {
    status: response.status,
    config: response.config,
    contract: response.contract,
    validation: normalizeBrowserValidation(response.validation)
  };
}

export async function fetchBrowserSessionVault(
  token?: string,
  options?: {
    sessionId?: string;
  }
): Promise<BrowserSessionVaultState> {
  const params = new URLSearchParams();
  if (options?.sessionId) {
    params.set('sessionId', options.sessionId);
  }
  const suffix = params.toString().length > 0 ? `?${params.toString()}` : '';
  return apiRequest<ApiEnvelope & BrowserSessionVaultState>(`/api/browser/session-vault${suffix}`, {}, { token });
}

export async function importBrowserCookieJar(
  token: string,
  payload: {
    id?: string;
    label: string;
    domains?: string[];
    sourceKind: 'raw_cookie_header' | 'netscape_cookies_txt' | 'manual' | 'json_cookie_export' | 'browser_profile_import';
    raw: string;
    notes?: string | null;
  }
): Promise<BrowserSessionVaultState> {
  const response = await apiRequest<ApiEnvelope & { vault: BrowserSessionVaultState }>(
    '/api/browser/cookie-jars/import',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { token }
  );
  return response.vault;
}

export async function upsertBrowserHeaderProfile(
  token: string,
  payload: {
    id?: string;
    label: string;
    domains: string[];
    headers: Record<string, string>;
    notes?: string | null;
  }
): Promise<BrowserSessionVaultState> {
  const response = await apiRequest<ApiEnvelope & { vault: BrowserSessionVaultState }>(
    '/api/browser/header-profiles/upsert',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { token }
  );
  return response.vault;
}

export async function upsertBrowserProxyProfile(
  token: string,
  payload: {
    id?: string;
    label: string;
    domains: string[];
    proxy: {
      server: string;
      username?: string | null;
      password?: string | null;
    };
    notes?: string | null;
  }
): Promise<BrowserSessionVaultState> {
  const response = await apiRequest<ApiEnvelope & { vault: BrowserSessionVaultState }>(
    '/api/browser/proxy-profiles/upsert',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { token }
  );
  return response.vault;
}

export async function upsertBrowserStorageState(
  token: string,
  payload: {
    id?: string;
    label: string;
    domains: string[];
    storageState: Record<string, unknown>;
    notes?: string | null;
  }
): Promise<BrowserSessionVaultState> {
  const response = await apiRequest<ApiEnvelope & { vault: BrowserSessionVaultState }>(
    '/api/browser/storage-states/upsert',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { token }
  );
  return response.vault;
}

export async function upsertBrowserSessionProfile(
  token: string,
  payload: {
    id?: string;
    label: string;
    domains: string[];
    cookieJarId?: string | null;
    headersProfileId?: string | null;
    proxyProfileId?: string | null;
    storageStateId?: string | null;
    useRealChrome?: boolean;
    ownerLabel?: string | null;
    visibility?: 'shared' | 'session_only';
    allowedSessionIds?: string[];
    siteKey?: string | null;
    browserKind?: BrowserLocalProfileKind | null;
    browserProfileName?: string | null;
    browserProfilePath?: string | null;
    locale?: string | null;
    countryCode?: string | null;
    timezoneId?: string | null;
    notes?: string | null;
    enabled?: boolean;
    lastVerifiedAt?: string | null;
    lastVerificationStatus?: 'unknown' | 'connected' | 'failed';
    lastVerificationSummary?: string | null;
  }
): Promise<BrowserSessionVaultState> {
  const response = await apiRequest<ApiEnvelope & { vault: BrowserSessionVaultState }>(
    '/api/browser/session-profiles/upsert',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { token }
  );
  return response.vault;
}

export async function connectBrowserAccount(
  token: string,
  payload: {
    sessionProfileId?: string;
    cookieJarId?: string;
    label: string;
    ownerLabel?: string | null;
    siteKey: BrowserConnectSiteKey;
    method: BrowserConnectMethod;
    domains?: string[];
    verifyUrl?: string | null;
    sourceKind?: 'raw_cookie_header' | 'netscape_cookies_txt' | 'manual' | 'json_cookie_export' | 'browser_profile_import';
    raw?: string;
    browserKind?: BrowserLocalProfileKind | null;
    browserProfileId?: string | null;
    visibility?: 'shared' | 'session_only';
    allowedSessionIds?: string[];
    headersProfileId?: string | null;
    proxyProfileId?: string | null;
    storageStateId?: string | null;
    locale?: string | null;
    countryCode?: string | null;
    timezoneId?: string | null;
    notes?: string | null;
    agentId?: string | null;
  }
): Promise<{ vault: BrowserSessionVaultState; sessionProfile: BrowserSessionVaultState['sessionProfiles'][number]; verification: BrowserConnectVerificationRow }> {
  const response = await apiRequest<
    ApiEnvelope & {
      vault: BrowserSessionVaultState;
      sessionProfile: BrowserSessionVaultState['sessionProfiles'][number];
      verification: BrowserConnectVerificationRow;
    }
  >(
    '/api/browser/connect-account',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { token }
  );
  return {
    vault: response.vault,
    sessionProfile: response.sessionProfile,
    verification: response.verification
  };
}

export async function verifyBrowserSessionProfile(
  token: string,
  sessionProfileId: string,
  payload?: {
    verifyUrl?: string | null;
    agentId?: string | null;
  }
): Promise<{ vault: BrowserSessionVaultState; sessionProfile: BrowserSessionVaultState['sessionProfiles'][number]; verification: BrowserConnectVerificationRow }> {
  const response = await apiRequest<
    ApiEnvelope & {
      vault: BrowserSessionVaultState;
      sessionProfile: BrowserSessionVaultState['sessionProfiles'][number];
      verification: BrowserConnectVerificationRow;
    }
  >(
    `/api/browser/session-profiles/${encodeURIComponent(sessionProfileId)}/verify`,
    {
      method: 'POST',
      body: JSON.stringify(payload ?? {})
    },
    { token }
  );
  return {
    vault: response.vault,
    sessionProfile: response.sessionProfile,
    verification: response.verification
  };
}

export async function revokeBrowserCookieJar(token: string, cookieJarId: string): Promise<BrowserSessionVaultState> {
  const response = await apiRequest<ApiEnvelope & { vault: BrowserSessionVaultState }>(
    `/api/browser/cookie-jars/${encodeURIComponent(cookieJarId)}/revoke`,
    {
      method: 'POST'
    },
    { token }
  );
  return response.vault;
}

export async function revokeBrowserHeaderProfile(token: string, profileId: string): Promise<BrowserSessionVaultState> {
  const response = await apiRequest<ApiEnvelope & { vault: BrowserSessionVaultState }>(
    `/api/browser/header-profiles/${encodeURIComponent(profileId)}/revoke`,
    {
      method: 'POST'
    },
    { token }
  );
  return response.vault;
}

export async function revokeBrowserProxyProfile(token: string, profileId: string): Promise<BrowserSessionVaultState> {
  const response = await apiRequest<ApiEnvelope & { vault: BrowserSessionVaultState }>(
    `/api/browser/proxy-profiles/${encodeURIComponent(profileId)}/revoke`,
    {
      method: 'POST'
    },
    { token }
  );
  return response.vault;
}

export async function revokeBrowserStorageState(token: string, storageStateId: string): Promise<BrowserSessionVaultState> {
  const response = await apiRequest<ApiEnvelope & { vault: BrowserSessionVaultState }>(
    `/api/browser/storage-states/${encodeURIComponent(storageStateId)}/revoke`,
    {
      method: 'POST'
    },
    { token }
  );
  return response.vault;
}

export async function startBrowserLoginCapture(
  token: string,
  payload: {
    browserKind: BrowserLocalProfileKind;
    browserProfileId?: string | null;
    siteKey: BrowserConnectSiteKey;
    verifyUrl?: string | null;
  }
): Promise<{
  launched: {
    browserKind: BrowserLocalProfileKind;
    browserProfile: BrowserSessionVaultState['localProfiles'][number];
    site: {
      siteKey: BrowserConnectSiteKey;
      label: string;
      domains: string[];
      verifyUrl: string;
    };
    command: string;
    url: string;
  };
  vault: BrowserSessionVaultState;
}> {
  return apiRequest<
    ApiEnvelope & {
      launched: {
        browserKind: BrowserLocalProfileKind;
        browserProfile: BrowserSessionVaultState['localProfiles'][number];
        site: {
          siteKey: BrowserConnectSiteKey;
          label: string;
          domains: string[];
          verifyUrl: string;
        };
        command: string;
        url: string;
      };
      vault: BrowserSessionVaultState;
    }
  >(
    '/api/browser/login-capture/start',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { token }
  );
}

export async function enableBrowserSessionProfile(token: string, sessionProfileId: string): Promise<BrowserSessionVaultState> {
  const response = await apiRequest<ApiEnvelope & { vault: BrowserSessionVaultState }>(
    `/api/browser/session-profiles/${encodeURIComponent(sessionProfileId)}/enable`,
    {
      method: 'POST'
    },
    { token }
  );
  return response.vault;
}

export async function disableBrowserSessionProfile(token: string, sessionProfileId: string): Promise<BrowserSessionVaultState> {
  const response = await apiRequest<ApiEnvelope & { vault: BrowserSessionVaultState }>(
    `/api/browser/session-profiles/${encodeURIComponent(sessionProfileId)}/disable`,
    {
      method: 'POST'
    },
    { token }
  );
  return response.vault;
}

export async function revokeBrowserSessionProfile(token: string, sessionProfileId: string): Promise<BrowserSessionVaultState> {
  const response = await apiRequest<ApiEnvelope & { vault: BrowserSessionVaultState }>(
    `/api/browser/session-profiles/${encodeURIComponent(sessionProfileId)}/revoke`,
    {
      method: 'POST'
    },
    { token }
  );
  return response.vault;
}

export async function deleteBrowserSessionProfile(token: string, sessionProfileId: string): Promise<BrowserSessionVaultState> {
  const response = await apiRequest<ApiEnvelope & { vault: BrowserSessionVaultState }>(
    `/api/browser/session-profiles/${encodeURIComponent(sessionProfileId)}`,
    {
      method: 'DELETE'
    },
    { token }
  );
  return response.vault;
}

export async function setSessionBrowserAuthProfile(
  token: string,
  sessionId: string,
  sessionProfileId: string | null
): Promise<SessionRow> {
  const response = await apiRequest<ApiEnvelope & { session: SessionRow }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/browser-auth-profile`,
    {
      method: 'POST',
      body: JSON.stringify({
        sessionProfileId
      })
    },
    { token }
  );
  return response.session;
}

export async function saveBrowserConfig(
  token: string,
  payload: BrowserCapabilityConfigRow
): Promise<{ status: BrowserCapabilityStatusRow; config: BrowserCapabilityConfigRow; restartRequired: boolean }> {
  const response = await apiRequest<
    ApiEnvelope & {
      status: BrowserCapabilityStatusRow;
      config: BrowserCapabilityConfigRow;
      restartRequired: boolean;
    }
  >(
    '/api/browser/config',
    {
      method: 'PUT',
      body: JSON.stringify({
        actor: 'dashboard',
        config: payload
      })
    },
    { token }
  );
  return {
    status: response.status,
    config: response.config,
    restartRequired: response.restartRequired
  };
}

export async function runBrowserTest(
  token: string,
  payload: BrowserTestRequestRow
): Promise<{ run: RunRow; test: BrowserRunTraceRow; status: BrowserCapabilityStatusRow }> {
  return apiRequest<ApiEnvelope & { run: RunRow; test: BrowserRunTraceRow; status: BrowserCapabilityStatusRow }>(
    '/api/browser/test',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { token }
  );
}

export async function fetchBrowserHistory(
  token?: string,
  options?: { limit?: number; offset?: number; sessionId?: string }
): Promise<BrowserHistoryState> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options?.offset !== undefined) {
    params.set('offset', String(options.offset));
  }
  if (options?.sessionId) {
    params.set('sessionId', options.sessionId);
  }
  const suffix = params.toString().length > 0 ? `?${params.toString()}` : '';
  const response = await apiRequest<ApiEnvelope & { history: BrowserHistoryState }>(`/api/browser/history${suffix}`, {}, { token });
  return response.history;
}

export async function fetchBrowserRun(runId: string, token?: string): Promise<BrowserRunTraceRow> {
  const response = await apiRequest<ApiEnvelope & { trace: BrowserRunTraceRow }>(
    `/api/browser/history/${encodeURIComponent(runId)}`,
    {},
    { token }
  );
  return response.trace;
}

export async function fetchBrowserArtifact(handle: string, token?: string): Promise<BrowserArtifactContentRow> {
  const response = await apiRequest<ApiEnvelope & { artifact: BrowserArtifactContentRow }>(
    `/api/browser/artifacts/${encodeURIComponent(handle)}`,
    {},
    { token }
  );
  return response.artifact;
}

export async function downloadBrowserArtifact(
  handle: string,
  token?: string
): Promise<{ blob: Blob; fileName: string; mimeType: string }> {
  const path = `/api/browser/artifacts/${encodeURIComponent(handle)}?download=1`;
  const { response, blob } = await apiRequestBlob(path, {}, { token });
  const disposition = response.headers.get('content-disposition') ?? '';
  const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);
  const mimeType = response.headers.get('content-type') ?? 'application/octet-stream';
  return {
    blob,
    fileName: fileNameMatch?.[1] ?? `browser-artifact-${handle}`,
    mimeType
  };
}

export async function bootstrapVendorAssets(
  token: string,
  payload?: { target?: 'skills' | 'tools' | 'all' | 'baseline-skills' }
): Promise<VendorBootstrapResultRow> {
  const response = await apiRequest<ApiEnvelope & { result: VendorBootstrapResultRow }>(
    '/api/bootstrap/vendor',
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard',
        target: payload?.target ?? 'all'
      })
    },
    { token }
  );
  return response.result;
}

export async function fetchBacklogBoard(
  token?: string,
  options?: {
    search?: string;
    projectId?: string;
    repoRoot?: string;
    unscopedOnly?: boolean;
  }
): Promise<{
  columns: BacklogBoardColumns;
  total: number;
  projectScope: BacklogProjectScopeRow;
  availableScopes: BacklogScopeSummaryRow[];
}> {
  const params = new URLSearchParams();
  if (options?.search) {
    params.set('search', options.search);
  }
  if (options?.projectId) {
    params.set('projectId', options.projectId);
  }
  if (options?.repoRoot) {
    params.set('repoRoot', options.repoRoot);
  }
  if (options?.unscopedOnly) {
    params.set('unscoped', 'true');
  }
  const suffix = params.toString().length > 0 ? `?${params.toString()}` : '';
  return apiRequest<
    ApiEnvelope & {
      columns: BacklogBoardColumns;
      total: number;
      projectScope: BacklogProjectScopeRow;
      availableScopes: BacklogScopeSummaryRow[];
    }
  >(`/api/backlog/board${suffix}`, {}, { token });
}

export async function fetchBacklogContracts(token?: string): Promise<BacklogContractsState['contracts']> {
  const response = await apiRequest<ApiEnvelope & BacklogContractsState>('/api/backlog/contracts', {}, { token });
  return response.contracts;
}

export async function cleanupBacklog(
  token: string,
  payload: {
    all?: boolean;
    projectId?: string | null;
    repoRoot?: string | null;
    unscopedOnly?: boolean;
  }
): Promise<{
  deleted: number;
  projectScope: BacklogProjectScopeRow;
  all: boolean;
}> {
  return apiRequest<
    ApiEnvelope & {
      deleted: number;
      projectScope: BacklogProjectScopeRow;
      all: boolean;
    }
  >(
    '/api/backlog/cleanup',
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard',
        all: payload.all === true,
        projectId: payload.projectId ?? null,
        repoRoot: payload.repoRoot ?? null,
        unscoped: payload.unscopedOnly === true
      })
    },
    { token }
  );
}

export async function deleteBacklogItem(
  token: string,
  itemId: string
): Promise<{
  deleted: number;
  itemId: string;
}> {
  return apiRequest<
    ApiEnvelope & {
      deleted: number;
      itemId: string;
    }
  >(
    `/api/backlog/items/${encodeURIComponent(itemId)}`,
    {
      method: 'DELETE'
    },
    { token }
  );
}

export async function transitionBacklogItem(
  token: string,
  itemId: string,
  payload: {
    toState: 'idea' | 'triage' | 'planned' | 'in_progress' | 'review' | 'blocked' | 'done' | 'archived';
    reason: string;
  }
): Promise<BacklogItemRow> {
  const response = await apiRequest<ApiEnvelope & { item: BacklogItemRow }>(
    `/api/backlog/items/${encodeURIComponent(itemId)}/transition`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        actor: 'dashboard'
      })
    },
    { token }
  );
  return response.item;
}

export async function updateBacklogDelivery(
  token: string,
  itemId: string,
  payload: {
    repoConnectionId?: string | null;
    branchName?: string | null;
    commitSha?: string | null;
    prNumber?: number | null;
    prUrl?: string | null;
    status?: 'planned' | 'in_progress' | 'review' | 'merged' | 'blocked' | 'closed';
    githubState?:
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
    githubStateReason?: string | null;
    githubStateUpdatedAt?: string | null;
    githubLease?: Record<string, unknown>;
    githubWorktree?: Record<string, unknown>;
    githubReconcile?: Record<string, unknown>;
  }
): Promise<BacklogItemRow> {
  const response = await apiRequest<ApiEnvelope & { item: BacklogItemRow }>(
    `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`,
    {
      method: 'PUT',
      body: JSON.stringify(payload)
    },
    { token }
  );
  return response.item;
}

export async function fetchBacklogDeliveryDetail(
  token: string,
  itemId: string
): Promise<BacklogDeliveryDetailRow> {
  return apiRequest<ApiEnvelope & BacklogDeliveryDetailRow>(
    `/api/backlog/items/${encodeURIComponent(itemId)}/delivery/detail`,
    {},
    { token }
  );
}

export async function repairBacklogDelivery(
  token: string,
  itemId: string,
  payload: {
    action: GithubDeliveryRepairAction;
    dryRun?: boolean;
    deliveryId?: string | null;
    idempotencyKey?: string;
  }
): Promise<{
  dryRun?: boolean;
  item: BacklogItemRow;
  delivery: BacklogItemRow['delivery'];
  preview?: GithubDeliveryRepairPreviewRow;
  repair?: Record<string, unknown>;
}> {
  return apiRequest<
    ApiEnvelope & {
      dryRun?: boolean;
      item: BacklogItemRow;
      delivery: BacklogItemRow['delivery'];
      preview?: GithubDeliveryRepairPreviewRow;
      repair?: Record<string, unknown>;
    }
  >(
    `/api/backlog/items/${encodeURIComponent(itemId)}/delivery/repair`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function fetchBacklogOrchestration(
  token?: string,
  options?: {
    projectId?: string;
    repoRoot?: string;
    unscopedOnly?: boolean;
  }
): Promise<{
  control: BacklogOrchestrationControlRow;
  decisions: BacklogOrchestrationDecisionRow[];
  queue: { planned: number; inFlight: number };
  projectScope: BacklogProjectScopeRow;
}> {
  const params = new URLSearchParams();
  if (options?.projectId) {
    params.set('projectId', options.projectId);
  }
  if (options?.repoRoot) {
    params.set('repoRoot', options.repoRoot);
  }
  if (options?.unscopedOnly) {
    params.set('unscoped', 'true');
  }
  const suffix = params.toString().length > 0 ? `?${params.toString()}` : '';
  return apiRequest<
    ApiEnvelope & {
      control: BacklogOrchestrationControlRow;
      decisions: BacklogOrchestrationDecisionRow[];
      queue: { planned: number; inFlight: number };
      projectScope: BacklogProjectScopeRow;
    }
  >(`/api/backlog/orchestration${suffix}`, {}, { token });
}

export async function fetchBacklogDecisionStream(
  token?: string,
  options?: {
    projectId?: string;
    repoRoot?: string;
    unscopedOnly?: boolean;
    action?: string;
    decision?: string;
    reasonCode?: string;
    limit?: number;
  }
): Promise<BacklogDecisionStreamRow[]> {
  const params = new URLSearchParams();
  if (options?.projectId) {
    params.set('projectId', options.projectId);
  }
  if (options?.repoRoot) {
    params.set('repoRoot', options.repoRoot);
  }
  if (options?.unscopedOnly) {
    params.set('unscoped', 'true');
  }
  if (options?.action) {
    params.set('action', options.action);
  }
  if (options?.decision) {
    params.set('decision', options.decision);
  }
  if (options?.reasonCode) {
    params.set('reasonCode', options.reasonCode);
  }
  params.set('limit', String(Math.max(1, Math.min(500, options?.limit ?? 120))));
  const response = await apiRequest<ApiEnvelope & { events: BacklogDecisionStreamRow[] }>(
    `/api/backlog/orchestration/decisions?${params.toString()}`,
    {},
    { token }
  );
  return response.events;
}

export async function overrideBacklogItem(
  token: string,
  payload: {
    itemId: string;
    action: 'block' | 'requeue' | 'close' | 'force_delegate';
    reason?: string;
    targetAgentId?: string;
    dryRun?: boolean;
  }
): Promise<Record<string, unknown>> {
  return apiRequest<ApiEnvelope & Record<string, unknown>>(
    '/api/backlog/orchestration/override',
    {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function tickBacklogOrchestration(
  token: string
): Promise<{
  control: BacklogOrchestrationControlRow;
  dispatched: Array<{ itemId: string; runId: string; targetAgentId: string; targetSessionId: string }>;
  skipped: Array<{ itemId: string; reason: string; details?: Record<string, unknown> }>;
}> {
  return apiRequest<
    ApiEnvelope & {
      control: BacklogOrchestrationControlRow;
      dispatched: Array<{ itemId: string; runId: string; targetAgentId: string; targetSessionId: string }>;
      skipped: Array<{ itemId: string; reason: string; details?: Record<string, unknown> }>;
    }
  >(
    '/api/backlog/orchestration/tick',
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function syncGithubRepo(token: string, repoConnectionId: string): Promise<GithubRepoConnectionRow> {
  const response = await apiRequest<ApiEnvelope & { repo: GithubRepoConnectionRow }>(
    `/api/github/repos/${encodeURIComponent(repoConnectionId)}/sync`,
    {
      method: 'POST'
    },
    { token }
  );
  return response.repo;
}

export async function setToolEnabled(token: string, toolName: string, enabled: boolean): Promise<ToolRow> {
  const response = await apiRequest<ApiEnvelope & { tool: ToolRow }>(
    `/api/tools/${encodeURIComponent(toolName)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ enabled })
    },
    { token }
  );
  return response.tool;
}

export async function fetchVaultStatus(token?: string): Promise<VaultStatusRow> {
  const response = await apiRequest<ApiEnvelope & { vault: VaultStatusRow }>('/api/vault/status', {}, { token });
  return response.vault;
}

export async function fetchAgentProfiles(token?: string, includeDisabled = false): Promise<AgentProfileRow[]> {
  const response = await apiRequest<ApiEnvelope & { agents: AgentProfileRow[] }>(
    `/api/agents/profiles?includeDisabled=${includeDisabled ? 'true' : 'false'}`,
    {},
    { token }
  );
  return response.agents;
}

export async function createAgentProfile(
  token: string,
  payload: {
    name: string;
    title: string;
    systemPrompt: string;
    defaultRuntime: RuntimeKind;
    defaultModel?: string | null;
    executionMode?: 'on_demand' | 'persistent_harness' | 'dispatch_only';
    harnessRuntime?: RuntimeKind | null;
    harnessAutoStart?: boolean;
    harnessCommand?: string | null;
    harnessArgs?: string[];
    parentAgentId?: string | null;
    allowedRuntimes?: RuntimeKind[];
    skills?: string[];
    tools?: string[];
    metadata?: Record<string, unknown>;
  }
): Promise<AgentProfileRow> {
  const response = await apiRequest<ApiEnvelope & { agent: AgentProfileRow }>(
    '/api/agents/profiles',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { token }
  );
  return response.agent;
}

export async function updateAgentProfile(
  token: string,
  agentId: string,
  payload: Partial<{
    name: string;
    title: string;
    systemPrompt: string;
    defaultRuntime: RuntimeKind;
    defaultModel: string | null;
    executionMode: 'on_demand' | 'persistent_harness' | 'dispatch_only';
    harnessRuntime: RuntimeKind | null;
    harnessAutoStart: boolean;
    harnessCommand: string | null;
    harnessArgs: string[];
    parentAgentId: string | null;
    allowedRuntimes: RuntimeKind[];
    skills: string[];
    tools: string[];
    enabled: boolean;
    metadata: Record<string, unknown>;
  }>
): Promise<AgentProfileRow> {
  const response = await apiRequest<ApiEnvelope & { agent: AgentProfileRow }>(
    `/api/agents/profiles/${encodeURIComponent(agentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload)
    },
    { token }
  );
  return response.agent;
}

export async function resetAgentProfileBaseline(
  token: string,
  agentId: string,
  actor = 'dashboard'
): Promise<AgentProfileRow> {
  const response = await apiRequest<ApiEnvelope & { agent: AgentProfileRow }>(
    `/api/agents/profiles/${encodeURIComponent(agentId)}/reset-baseline`,
    {
      method: 'POST',
      body: JSON.stringify({ actor })
    },
    { token }
  );
  return response.agent;
}

export async function disableAgentProfile(token: string, agentId: string): Promise<AgentProfileRow> {
  const response = await apiRequest<ApiEnvelope & { agent: AgentProfileRow }>(
    `/api/agents/profiles/${encodeURIComponent(agentId)}`,
    {
      method: 'DELETE',
      body: JSON.stringify({ actor: 'dashboard' })
    },
    { token }
  );
  return response.agent;
}

export async function clearAgentHistory(
  token: string,
  agentId: string
): Promise<{
  agentId: string;
  activeRunsAborted: string[];
  cleared: {
    sessions: number;
    runs: number;
    messages: number;
    memoryItems: number;
    officePresence: number;
    realtimeEvents: number;
    llmUsageEvents: number;
  };
}> {
  return apiRequest<
    ApiEnvelope & {
      agentId: string;
      activeRunsAborted: string[];
      cleared: {
        sessions: number;
        runs: number;
        messages: number;
        memoryItems: number;
        officePresence: number;
        realtimeEvents: number;
        llmUsageEvents: number;
      };
    }
  >(
    `/api/agents/profiles/${encodeURIComponent(agentId)}/clear-history`,
    {
      method: 'POST',
      body: JSON.stringify({ actor: 'dashboard' })
    },
    { token }
  );
}

export async function createAgentSession(
  token: string,
  agentId: string,
  payload: {
    label?: string;
    runtime?: RuntimeKind;
    model?: string | null;
    firstPrompt?: string;
    sessionKey?: string;
  }
): Promise<{ session: SessionRow; run?: RunRow | null }> {
  return apiRequest<ApiEnvelope & { session: SessionRow; run?: RunRow | null }>(
    `/api/agents/profiles/${encodeURIComponent(agentId)}/sessions`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { token }
  );
}

export async function startAgentHarness(token: string, agentId: string): Promise<AgentProfileRow | null> {
  const response = await apiRequest<ApiEnvelope & { agent: AgentProfileRow | null }>(
    `/api/agents/profiles/${encodeURIComponent(agentId)}/harness/start`,
    {
      method: 'POST'
    },
    { token }
  );
  return response.agent;
}

export async function stopAgentHarness(token: string, agentId: string): Promise<AgentProfileRow | null> {
  const response = await apiRequest<ApiEnvelope & { agent: AgentProfileRow | null }>(
    `/api/agents/profiles/${encodeURIComponent(agentId)}/harness/stop`,
    {
      method: 'POST'
    },
    { token }
  );
  return response.agent;
}

export async function delegateSessionRun(
  token: string,
  sessionId: string,
  payload: {
    targetAgentId: string;
    prompt: string;
    runtime?: RuntimeKind;
    model?: string | null;
    mode?: string;
  }
): Promise<{
  delegation: { sourceSessionId: string; targetSessionId: string; targetAgentId: string; runId: string; mode: string };
  targetSession: SessionRow;
  run: RunRow;
}> {
  return apiRequest<
    ApiEnvelope & {
      delegation: { sourceSessionId: string; targetSessionId: string; targetAgentId: string; runId: string; mode: string };
      targetSession: SessionRow;
      run: RunRow;
    }
  >(
    `/api/sessions/${encodeURIComponent(sessionId)}/delegate`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { token }
  );
}

export async function fetchVaultSecrets(token?: string, includeRevoked = false): Promise<VaultSecretRow[]> {
  const response = await apiRequest<ApiEnvelope & { secrets: VaultSecretRow[] }>(
    `/api/vault/secrets?includeRevoked=${includeRevoked ? 'true' : 'false'}`,
    {},
    { token }
  );
  return response.secrets;
}

export async function bootstrapVault(token: string, material: string): Promise<VaultStatusRow> {
  const response = await apiRequest<ApiEnvelope & { vault: VaultStatusRow }>(
    '/api/vault/bootstrap',
    {
      method: 'POST',
      body: JSON.stringify({ material, actor: 'dashboard' })
    },
    { token }
  );
  return response.vault;
}

export async function unlockVault(token: string, material: string): Promise<VaultStatusRow> {
  const response = await apiRequest<ApiEnvelope & { vault: VaultStatusRow }>(
    '/api/vault/unlock',
    {
      method: 'POST',
      body: JSON.stringify({ material, actor: 'dashboard' })
    },
    { token }
  );
  return response.vault;
}

export async function lockVault(token: string): Promise<VaultStatusRow> {
  const response = await apiRequest<ApiEnvelope & { vault: VaultStatusRow }>(
    '/api/vault/lock',
    {
      method: 'POST',
      body: JSON.stringify({ actor: 'dashboard' })
    },
    { token }
  );
  return response.vault;
}

export async function resetEmptyVault(token: string): Promise<VaultStatusRow> {
  const response = await apiRequest<ApiEnvelope & { vault: VaultStatusRow }>(
    '/api/vault/reset-empty',
    {
      method: 'POST',
      body: JSON.stringify({
        approved: true,
        actor: 'dashboard'
      })
    },
    { token }
  );
  return response.vault;
}

export async function upsertVaultSecret(
  token: string,
  name: string,
  payload: { value: string; category: string; approved: boolean }
): Promise<VaultSecretRow> {
  const response = await apiRequest<ApiEnvelope & { secret: VaultSecretRow }>(
    `/api/vault/secrets/${encodeURIComponent(name)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        value: payload.value,
        category: payload.category,
        approved: payload.approved,
        actor: 'dashboard'
      })
    },
    { token }
  );
  return response.secret;
}

export async function rotateVaultSecret(
  token: string,
  name: string,
  value: string
): Promise<VaultSecretRow> {
  const response = await apiRequest<ApiEnvelope & { secret: VaultSecretRow }>(
    `/api/vault/secrets/${encodeURIComponent(name)}/rotate`,
    {
      method: 'POST',
      body: JSON.stringify({ value, actor: 'dashboard' })
    },
    { token }
  );
  return response.secret;
}

export async function revokeVaultSecret(token: string, name: string, mode: 'revoke' | 'delete'): Promise<void> {
  await apiRequest<ApiEnvelope>(
    `/api/vault/secrets/${encodeURIComponent(name)}`,
    {
      method: 'DELETE',
      body: JSON.stringify({
        approved: true,
        mode,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function rotateVaultMasterKey(token: string, material: string): Promise<VaultStatusRow> {
  const response = await apiRequest<ApiEnvelope & { vault: VaultStatusRow }>(
    '/api/vault/rotate-master-key',
    {
      method: 'POST',
      body: JSON.stringify({
        material,
        approved: true,
        actor: 'dashboard'
      })
    },
    { token }
  );
  return response.vault;
}

export async function fetchOnboardingStatus(token: string): Promise<OnboardingStateRow> {
  const response = await apiRequest<ApiEnvelope & { onboarding: OnboardingStateRow }>(
    '/api/onboarding/status',
    {},
    { token }
  );
  return response.onboarding;
}

export async function applyOnboardingCeoBaseline(
  token: string,
  payload?: {
    companyName?: string;
    ceoName?: string;
    ceoTitle?: string;
    ceoSystemPrompt?: string;
  }
): Promise<{ onboarding: OnboardingStateRow; agent: AgentProfileRow; companyName: string; ceoAgentId: string }> {
  return apiRequest<ApiEnvelope & { onboarding: OnboardingStateRow; agent: AgentProfileRow; companyName: string; ceoAgentId: string }>(
    '/api/onboarding/ceo-baseline',
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard',
        companyName: payload?.companyName,
        ceoName: payload?.ceoName,
        ceoTitle: payload?.ceoTitle,
        ceoSystemPrompt: payload?.ceoSystemPrompt
      })
    },
    { token }
  );
}

export async function bootstrapOnboardingVault(
  token: string,
  material: string
): Promise<{ onboarding: OnboardingStateRow; vault: VaultStatusRow }> {
  return apiRequest<ApiEnvelope & { onboarding: OnboardingStateRow; vault: VaultStatusRow }>(
    '/api/onboarding/vault/bootstrap',
    {
      method: 'POST',
      body: JSON.stringify({
        material,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function unlockOnboardingVault(
  token: string,
  material: string
): Promise<{ onboarding: OnboardingStateRow; vault: VaultStatusRow }> {
  return apiRequest<ApiEnvelope & { onboarding: OnboardingStateRow; vault: VaultStatusRow }>(
    '/api/onboarding/vault/unlock',
    {
      method: 'POST',
      body: JSON.stringify({
        material,
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function checkOnboardingProviderKeys(
  token: string
): Promise<{ onboarding: OnboardingStateRow; diagnostics: OnboardingStateRow['providerKeys'] }> {
  return apiRequest<ApiEnvelope & { onboarding: OnboardingStateRow; diagnostics: OnboardingStateRow['providerKeys'] }>(
    '/api/onboarding/provider-keys/check',
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function testOnboardingProviderConnections(
  token: string
): Promise<{
  onboarding: OnboardingStateRow;
  diagnostics: OnboardingStateRow['providerKeys'];
  live: OnboardingProviderLiveDiagnosticsRow;
}> {
  return apiRequest<
    ApiEnvelope & {
      onboarding: OnboardingStateRow;
      diagnostics: OnboardingStateRow['providerKeys'];
      live: OnboardingProviderLiveDiagnosticsRow;
    }
  >(
    '/api/onboarding/provider-keys/live-check',
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard'
      })
    },
    { token }
  );
}

export async function runOnboardingSmoke(
  token: string,
  payload?: { prompt?: string; model?: string | null }
): Promise<{ onboarding: OnboardingStateRow; smokeRun: OnboardingStateRow['evidence']['smokeRun'] }> {
  return apiRequest<
    ApiEnvelope & { onboarding: OnboardingStateRow; smokeRun: OnboardingStateRow['evidence']['smokeRun'] }
  >(
    '/api/onboarding/smoke-run',
    {
      method: 'POST',
      body: JSON.stringify({
        actor: 'dashboard',
        prompt: payload?.prompt,
        model: payload?.model
      })
    },
    { token }
  );
}
