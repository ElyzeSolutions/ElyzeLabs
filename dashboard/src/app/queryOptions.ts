import { queryOptions, type QueryClient } from '@tanstack/react-query';

import {
  fetchAgentProfiles,
  fetchBacklogBoard,
  fetchBacklogContracts,
  fetchBacklogDecisionStream,
  fetchBacklogOrchestration,
  fetchBoard,
  fetchBrowserArtifact,
  fetchBrowserDoctor,
  fetchBrowserHistory,
  fetchBrowserRun,
  fetchBrowserSessionVault,
  fetchBrowserStatus,
  fetchChats,
  fetchCronStatus,
  fetchHousekeeping,
  fetchImprovementLearnings,
  fetchImprovementProposals,
  fetchLlmCosts,
  fetchLlmLimits,
  fetchLocalSessions,
  fetchLocalStats,
  fetchMetrics,
  fetchOffice,
  fetchOnboardingStatus,
  fetchPairings,
  fetchReadiness,
  fetchRunTerminal,
  fetchRunWatchdog,
  fetchRuntimeConfig,
  fetchRuns,
  fetchScheduleDetail,
  fetchSchedules,
  fetchSessions,
  fetchSkills,
  fetchSkillsCatalog,
  fetchTokenStatus,
  fetchTools,
  fetchToolsDiagnostics,
  fetchVaultStatus,
  fetchWatchdogStatus
} from './api';
import type { ImprovementLearningRow, ImprovementProposalRow, LocalRuntimeKind, PairingRow, ScheduleKind } from './types';

type BacklogScopeOptions = {
  search?: string;
  projectId?: string;
  repoRoot?: string;
  unscopedOnly?: boolean;
};

type BacklogOrchestrationScopeOptions = Omit<BacklogScopeOptions, 'search'>;

type BacklogDecisionStreamOptions = BacklogOrchestrationScopeOptions & {
  action?: string;
  decision?: string;
  reasonCode?: string;
  limit?: number;
};

type BrowserHistoryOptions = {
  limit?: number;
  offset?: number;
  sessionId?: string;
};

type LlmCostsQuery = {
  day?: string;
  month?: string;
  tzOffsetMinutes?: number;
};

type LocalSessionsOptions = {
  limit?: number;
  runtime?: LocalRuntimeKind | 'all';
};

type RunTerminalOptions = {
  since?: number;
  limit?: number;
};

type ScheduleListOptions = {
  kind?: ScheduleKind | 'all';
  enabled?: boolean;
  requestedBy?: string;
  targetAgentId?: string;
};

type ScheduleFetchOptions = {
  kind?: ScheduleKind;
  enabled?: boolean;
  requestedBy?: string;
  targetAgentId?: string;
};

function requireToken(token?: string): string {
  if (!token) {
    throw new Error('API token is required.');
  }
  return token;
}

function authenticatedQueryOptions<TData>(input: {
  token?: string;
  queryKey: readonly unknown[];
  queryFn: (token: string) => Promise<TData>;
  staleTime: number;
  enabled?: boolean;
  refetchInterval?: number;
  refetchIntervalInBackground?: boolean;
}) {
  return queryOptions({
    queryKey: input.queryKey,
    queryFn: () => input.queryFn(requireToken(input.token)),
    enabled: input.enabled ?? Boolean(input.token),
    staleTime: input.staleTime,
    refetchInterval: input.refetchInterval,
    refetchIntervalInBackground: input.refetchIntervalInBackground
  });
}

function toScheduleFetchOptions(options?: ScheduleListOptions): ScheduleFetchOptions | undefined {
  if (!options) {
    return undefined;
  }

  return {
    kind: options.kind && options.kind !== 'all' ? options.kind : undefined,
    enabled: options.enabled,
    requestedBy: options.requestedBy,
    targetAgentId: options.targetAgentId
  };
}

const rootKey = (token?: string) => ['control-plane', token ?? null] as const;
const agentProfilesKey = (token?: string) => [...rootKey(token), 'agentProfiles'] as const;
const agentProfilesListKey = (token?: string, includeDisabled = true) =>
  [...agentProfilesKey(token), { includeDisabled }] as const;
const backlogKey = (token?: string) => [...rootKey(token), 'backlog'] as const;
const backlogBoardKey = (token?: string, options?: BacklogScopeOptions) =>
  [
    ...backlogKey(token),
    'board',
    {
      search: options?.search ?? null,
      projectId: options?.projectId ?? null,
      repoRoot: options?.repoRoot ?? null,
      unscopedOnly: options?.unscopedOnly ?? false
    }
  ] as const;
const backlogContractsKey = (token?: string) => [...backlogKey(token), 'contracts'] as const;
const backlogDecisionStreamKey = (token?: string, options?: BacklogDecisionStreamOptions) =>
  [
    ...backlogKey(token),
    'decisionStream',
    {
      projectId: options?.projectId ?? null,
      repoRoot: options?.repoRoot ?? null,
      unscopedOnly: options?.unscopedOnly ?? false,
      action: options?.action ?? null,
      decision: options?.decision ?? null,
      reasonCode: options?.reasonCode ?? null,
      limit: options?.limit ?? null
    }
  ] as const;
const backlogOrchestrationKey = (token?: string, options?: BacklogOrchestrationScopeOptions) =>
  [
    ...backlogKey(token),
    'orchestration',
    {
      projectId: options?.projectId ?? null,
      repoRoot: options?.repoRoot ?? null,
      unscopedOnly: options?.unscopedOnly ?? false
    }
  ] as const;
const browserKey = (token?: string) => [...rootKey(token), 'browser'] as const;
const browserArtifactKey = (token?: string, handle?: string | null) => [...browserKey(token), 'artifact', handle ?? null] as const;
const browserDoctorKey = (token?: string) => [...browserKey(token), 'doctor'] as const;
const browserHistoryKey = (token?: string, options?: BrowserHistoryOptions) =>
  [
    ...browserKey(token),
    'history',
    {
      limit: options?.limit ?? null,
      offset: options?.offset ?? null,
      sessionId: options?.sessionId ?? null
    }
  ] as const;
const browserRunKey = (token?: string, runId?: string | null) => [...browserKey(token), 'run', runId ?? null] as const;
const browserStatusKey = (token?: string) => [...browserKey(token), 'status'] as const;
const browserVaultKey = (token?: string) => [...browserKey(token), 'vault'] as const;
const browserVaultSessionKey = (token?: string, sessionId?: string) =>
  [...browserVaultKey(token), { sessionId: sessionId ?? null }] as const;
const chatsKey = (token?: string) => [...rootKey(token), 'chats'] as const;
const configKey = (token?: string) => [...rootKey(token), 'config'] as const;
const cronStatusKey = (token?: string) => [...rootKey(token), 'cronStatus'] as const;
const housekeepingKey = (token?: string) => [...rootKey(token), 'housekeeping'] as const;
const improvementLearningsKey = (token?: string) => [...rootKey(token), 'improvementLearnings'] as const;
const improvementLearningsListKey = (
  token?: string,
  options?: { agentId?: string; category?: ImprovementLearningRow['category']; limit?: number }
) =>
  [
    ...improvementLearningsKey(token),
    {
      agentId: options?.agentId ?? null,
      category: options?.category ?? null,
      limit: options?.limit ?? null
    }
  ] as const;
const improvementProposalsKey = (token?: string) => [...rootKey(token), 'improvementProposals'] as const;
const improvementProposalsListKey = (
  token?: string,
  options?: { agentId?: string; status?: ImprovementProposalRow['status']; limit?: number }
) =>
  [
    ...improvementProposalsKey(token),
    {
      agentId: options?.agentId ?? null,
      status: options?.status ?? null,
      limit: options?.limit ?? null
    }
  ] as const;
const lanesKey = (token?: string) => [...rootKey(token), 'lanes'] as const;
const localSessionsKey = (token?: string) => [...rootKey(token), 'localSessions'] as const;
const localSessionsListKey = (token?: string, options?: LocalSessionsOptions) =>
  [
    ...localSessionsKey(token),
    {
      limit: options?.limit ?? 200,
      runtime: options?.runtime ?? 'all'
    }
  ] as const;
const localStatsKey = (token?: string) => [...rootKey(token), 'localStats'] as const;
const localStatsSummaryKey = (token?: string, runtime: LocalRuntimeKind | 'all' = 'all') =>
  [...localStatsKey(token), { runtime }] as const;
const llmKey = (token?: string) => [...rootKey(token), 'llm'] as const;
const llmCostsKey = (token?: string, query?: LlmCostsQuery) =>
  [
    ...llmKey(token),
    'costs',
    {
      day: query?.day ?? null,
      month: query?.month ?? null,
      tzOffsetMinutes: query?.tzOffsetMinutes ?? null
    }
  ] as const;
const llmLimitsKey = (token?: string) => [...llmKey(token), 'limits'] as const;
const metricsKey = (token?: string) => [...rootKey(token), 'metrics'] as const;
const onboardingKey = (token?: string) => [...rootKey(token), 'onboarding'] as const;
const onboardingStatusKey = (token?: string) => [...onboardingKey(token), 'status'] as const;
const officeKey = (token?: string) => [...rootKey(token), 'office'] as const;
const pairingsKey = (token?: string) => [...configKey(token), 'pairings'] as const;
const pairingsListKey = (token?: string, status?: PairingRow['status']) => [...pairingsKey(token), { status: status ?? null }] as const;
const readinessKey = (token?: string) => [...rootKey(token), 'readiness'] as const;
const runtimeConfigKey = (token?: string) => [...configKey(token), 'runtime'] as const;
const runsKey = (token?: string) => [...rootKey(token), 'runs'] as const;
const runTerminalKey = (token?: string, runId?: string | null, options?: RunTerminalOptions) =>
  [
    ...runsKey(token),
    'terminal',
    runId ?? null,
    {
      since: options?.since ?? 0,
      limit: options?.limit ?? 800
    }
  ] as const;
const schedulesKey = (token?: string) => [...rootKey(token), 'schedules'] as const;
const schedulesListKey = (token?: string, options?: ScheduleListOptions) =>
  [
    ...schedulesKey(token),
    {
      kind: options?.kind ?? 'all',
      enabled: options?.enabled ?? null,
      requestedBy: options?.requestedBy ?? null,
      targetAgentId: options?.targetAgentId ?? null
    }
  ] as const;
const scheduleDetailsKey = (token?: string) => [...schedulesKey(token), 'detail'] as const;
const scheduleDetailKey = (token?: string, scheduleId?: string | null) => [...scheduleDetailsKey(token), scheduleId ?? null] as const;
const skillCatalogKey = (token?: string) => [...rootKey(token), 'skillCatalog'] as const;
const sessionsKey = (token?: string) => [...rootKey(token), 'sessions'] as const;
const skillsKey = (token?: string) => [...rootKey(token), 'skills'] as const;
const tokenStatusKey = (token?: string) => [...rootKey(token), 'tokenStatus'] as const;
const toolsKey = (token?: string) => [...rootKey(token), 'tools'] as const;
const toolsDiagnosticsKey = (token?: string) => [...toolsKey(token), 'diagnostics'] as const;
const vaultStatusKey = (token?: string) => [...rootKey(token), 'vaultStatus'] as const;
const watchdogStatusKey = (token?: string) => [...rootKey(token), 'watchdogStatus'] as const;
const watchdogDetailKey = (token?: string, runId?: string | null) => [...watchdogStatusKey(token), 'detail', runId ?? null] as const;

export const dashboardQueryKeys = {
  root: rootKey,
  agentProfiles: agentProfilesKey,
  agentProfilesList: agentProfilesListKey,
  backlog: backlogKey,
  backlogBoard: backlogBoardKey,
  backlogContracts: backlogContractsKey,
  backlogDecisionStream: backlogDecisionStreamKey,
  backlogOrchestration: backlogOrchestrationKey,
  browser: browserKey,
  browserArtifact: browserArtifactKey,
  browserDoctor: browserDoctorKey,
  browserHistory: browserHistoryKey,
  browserRun: browserRunKey,
  browserStatus: browserStatusKey,
  browserVault: browserVaultKey,
  browserVaultSession: browserVaultSessionKey,
  chats: chatsKey,
  config: configKey,
  cronStatus: cronStatusKey,
  housekeeping: housekeepingKey,
  improvementLearnings: improvementLearningsKey,
  improvementLearningsList: improvementLearningsListKey,
  improvementProposals: improvementProposalsKey,
  improvementProposalsList: improvementProposalsListKey,
  lanes: lanesKey,
  localSessions: localSessionsKey,
  localSessionsList: localSessionsListKey,
  localStats: localStatsKey,
  localStatsSummary: localStatsSummaryKey,
  llm: llmKey,
  llmCosts: llmCostsKey,
  llmLimits: llmLimitsKey,
  metrics: metricsKey,
  onboarding: onboardingKey,
  onboardingStatus: onboardingStatusKey,
  office: officeKey,
  pairings: pairingsKey,
  pairingsList: pairingsListKey,
  readiness: readinessKey,
  runtimeConfig: runtimeConfigKey,
  runs: runsKey,
  runTerminal: runTerminalKey,
  schedules: schedulesKey,
  schedulesList: schedulesListKey,
  scheduleDetails: scheduleDetailsKey,
  scheduleDetail: scheduleDetailKey,
  skillCatalog: skillCatalogKey,
  sessions: sessionsKey,
  skills: skillsKey,
  tokenStatus: tokenStatusKey,
  tools: toolsKey,
  toolsDiagnostics: toolsDiagnosticsKey,
  vaultStatus: vaultStatusKey,
  watchdogStatus: watchdogStatusKey,
  watchdogDetail: watchdogDetailKey
};

export function agentProfilesQueryOptions(token?: string, includeDisabled = true) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.agentProfilesList(token, includeDisabled),
    queryFn: (resolvedToken) => fetchAgentProfiles(resolvedToken, includeDisabled),
    staleTime: 30_000
  });
}

export function scheduleAgentProfilesQueryOptions(token?: string) {
  return agentProfilesQueryOptions(token, false);
}

export function boardQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.lanes(token),
    queryFn: fetchBoard,
    staleTime: 5_000
  });
}

export function chatsQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.chats(token),
    queryFn: fetchChats,
    staleTime: 5_000
  });
}

export function metricsQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.metrics(token),
    queryFn: fetchMetrics,
    staleTime: 10_000
  });
}

export function officeQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.office(token),
    queryFn: fetchOffice,
    staleTime: 5_000
  });
}

export function runsQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.runs(token),
    queryFn: fetchRuns,
    staleTime: 5_000
  });
}

export function sessionsQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.sessions(token),
    queryFn: fetchSessions,
    staleTime: 10_000
  });
}

export function skillsQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.skills(token),
    queryFn: fetchSkills,
    staleTime: 30_000
  });
}

export function skillsCatalogQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.skillCatalog(token),
    queryFn: fetchSkillsCatalog,
    staleTime: 30_000
  });
}

export function toolsQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.tools(token),
    queryFn: fetchTools,
    staleTime: 30_000
  });
}

export function toolsDiagnosticsQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.toolsDiagnostics(token),
    queryFn: fetchToolsDiagnostics,
    staleTime: 30_000
  });
}

export function runtimeConfigQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.runtimeConfig(token),
    queryFn: fetchRuntimeConfig,
    staleTime: 30_000
  });
}

export function pairingsQueryOptions(token?: string, status?: PairingRow['status']) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.pairingsList(token, status),
    queryFn: (resolvedToken) => fetchPairings(resolvedToken, status),
    staleTime: 30_000
  });
}

export function tokenStatusQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.tokenStatus(token),
    queryFn: fetchTokenStatus,
    staleTime: 30_000
  });
}

export function vaultStatusQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.vaultStatus(token),
    queryFn: fetchVaultStatus,
    staleTime: 15_000
  });
}

export function onboardingStatusQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.onboardingStatus(token),
    queryFn: fetchOnboardingStatus,
    staleTime: 15_000
  });
}

export function llmLimitsQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.llmLimits(token),
    queryFn: fetchLlmLimits,
    staleTime: 15_000
  });
}

export function llmCostsQueryOptions(token?: string, query?: LlmCostsQuery) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.llmCosts(token, query),
    queryFn: (resolvedToken) => fetchLlmCosts(resolvedToken, query),
    staleTime: 15_000
  });
}

export function browserStatusQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.browserStatus(token),
    queryFn: fetchBrowserStatus,
    staleTime: 15_000
  });
}

export function browserDoctorQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.browserDoctor(token),
    queryFn: fetchBrowserDoctor,
    staleTime: 15_000
  });
}

export function browserHistoryQueryOptions(token?: string, options?: BrowserHistoryOptions) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.browserHistory(token, options),
    queryFn: (resolvedToken) => fetchBrowserHistory(resolvedToken, options),
    staleTime: 10_000
  });
}

export function browserRunQueryOptions(token?: string, runId?: string | null) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.browserRun(token, runId),
    queryFn: (resolvedToken) => fetchBrowserRun(runId ?? '', resolvedToken),
    enabled: Boolean(token && runId),
    staleTime: 10_000
  });
}

export function browserArtifactQueryOptions(token?: string, handle?: string | null) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.browserArtifact(token, handle),
    queryFn: (resolvedToken) => fetchBrowserArtifact(handle ?? '', resolvedToken),
    enabled: Boolean(token && handle),
    staleTime: 10_000
  });
}

export function watchdogStatusQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.watchdogStatus(token),
    queryFn: fetchWatchdogStatus,
    staleTime: 5_000,
    refetchInterval: 2_200,
    refetchIntervalInBackground: false
  });
}

export function runWatchdogDetailQueryOptions(token?: string, runId?: string | null) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.watchdogDetail(token, runId),
    queryFn: (resolvedToken) => fetchRunWatchdog(runId ?? '', resolvedToken),
    enabled: Boolean(token && runId),
    staleTime: 5_000
  });
}

export function runTerminalQueryOptions(token?: string, runId?: string | null, options?: RunTerminalOptions) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.runTerminal(token, runId, options),
    queryFn: (activeToken) => fetchRunTerminal(runId ?? '', activeToken, options),
    enabled: Boolean(token && runId),
    staleTime: 1_000
  });
}

export function backlogBoardQueryOptions(token?: string, options?: BacklogScopeOptions) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.backlogBoard(token, options),
    queryFn: (resolvedToken) => fetchBacklogBoard(resolvedToken, options),
    staleTime: 5_000
  });
}

export function backlogOrchestrationQueryOptions(token?: string, options?: BacklogOrchestrationScopeOptions) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.backlogOrchestration(token, options),
    queryFn: (resolvedToken) => fetchBacklogOrchestration(resolvedToken, options),
    staleTime: 5_000
  });
}

export function backlogContractsQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.backlogContracts(token),
    queryFn: fetchBacklogContracts,
    staleTime: 30_000
  });
}

export function backlogDecisionStreamQueryOptions(token?: string, options?: BacklogDecisionStreamOptions) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.backlogDecisionStream(token, options),
    queryFn: (resolvedToken) => fetchBacklogDecisionStream(resolvedToken, options),
    staleTime: 5_000
  });
}

export function schedulesQueryOptions(token?: string, options?: ScheduleListOptions) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.schedulesList(token, options),
    queryFn: (resolvedToken) => fetchSchedules(resolvedToken, toScheduleFetchOptions(options)),
    staleTime: 5_000
  });
}

export function scheduleDetailQueryOptions(token?: string, scheduleId?: string | null) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.scheduleDetail(token, scheduleId),
    queryFn: (resolvedToken) => fetchScheduleDetail(resolvedToken, scheduleId ?? ''),
    enabled: Boolean(token && scheduleId),
    staleTime: 5_000
  });
}

export function browserSessionVaultQueryOptions(
  token?: string,
  options?: {
    sessionId?: string;
  }
) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.browserVaultSession(token, options?.sessionId),
    queryFn: (resolvedToken) => fetchBrowserSessionVault(resolvedToken, options),
    staleTime: 30_000
  });
}

export function housekeepingQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.housekeeping(token),
    queryFn: fetchHousekeeping,
    staleTime: 15_000
  });
}

export function readinessQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.readiness(token),
    queryFn: fetchReadiness,
    staleTime: 15_000
  });
}

export function cronStatusQueryOptions(token?: string) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.cronStatus(token),
    queryFn: fetchCronStatus,
    staleTime: 15_000
  });
}

export function localSessionsQueryOptions(token?: string, options?: LocalSessionsOptions) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.localSessionsList(token, options),
    queryFn: (resolvedToken) => fetchLocalSessions(resolvedToken, options),
    staleTime: 15_000
  });
}

export function localStatsQueryOptions(token?: string, runtime: LocalRuntimeKind | 'all' = 'all') {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.localStatsSummary(token, runtime),
    queryFn: (resolvedToken) => fetchLocalStats(resolvedToken, runtime),
    staleTime: 15_000
  });
}

export function improvementLearningsQueryOptions(
  token?: string,
  options?: { agentId?: string; category?: ImprovementLearningRow['category']; limit?: number }
) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.improvementLearningsList(token, options),
    queryFn: (resolvedToken) => fetchImprovementLearnings(resolvedToken, options),
    staleTime: 30_000
  });
}

export function improvementProposalsQueryOptions(
  token?: string,
  options?: { agentId?: string; status?: ImprovementProposalRow['status']; limit?: number }
) {
  return authenticatedQueryOptions({
    token,
    queryKey: dashboardQueryKeys.improvementProposalsList(token, options),
    queryFn: (resolvedToken) => fetchImprovementProposals(resolvedToken, options),
    staleTime: 15_000
  });
}

async function invalidateQueryGroups(queryClient: QueryClient, keys: ReadonlyArray<readonly unknown[]>): Promise<void> {
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export async function invalidateAgentReadQueries(queryClient: QueryClient, token?: string): Promise<void> {
  await invalidateQueryGroups(queryClient, [dashboardQueryKeys.agentProfiles(token)]);
}

export async function invalidateSkillReadQueries(queryClient: QueryClient, token?: string): Promise<void> {
  await invalidateQueryGroups(queryClient, [dashboardQueryKeys.skills(token), dashboardQueryKeys.skillCatalog(token)]);
}

export async function invalidateToolReadQueries(queryClient: QueryClient, token?: string): Promise<void> {
  await invalidateQueryGroups(queryClient, [dashboardQueryKeys.tools(token), dashboardQueryKeys.toolsDiagnostics(token)]);
}

export async function invalidateBoardReadQueries(queryClient: QueryClient, token?: string): Promise<void> {
  await invalidateQueryGroups(queryClient, [
    dashboardQueryKeys.lanes(token),
    dashboardQueryKeys.metrics(token),
    dashboardQueryKeys.runs(token),
    dashboardQueryKeys.sessions(token)
  ]);
}

export async function invalidateChatReadQueries(queryClient: QueryClient, token?: string): Promise<void> {
  await invalidateQueryGroups(queryClient, [dashboardQueryKeys.chats(token)]);
}

export async function invalidateOfficeReadQueries(queryClient: QueryClient, token?: string): Promise<void> {
  await invalidateQueryGroups(queryClient, [
    dashboardQueryKeys.agentProfiles(token),
    dashboardQueryKeys.office(token),
    dashboardQueryKeys.runs(token),
    dashboardQueryKeys.sessions(token)
  ]);
}

export async function invalidateScheduleReadQueries(queryClient: QueryClient, token?: string): Promise<void> {
  await invalidateQueryGroups(queryClient, [dashboardQueryKeys.schedules(token), dashboardQueryKeys.scheduleDetails(token)]);
}

export async function invalidateHousekeepingReadQueries(queryClient: QueryClient, token?: string): Promise<void> {
  await invalidateQueryGroups(queryClient, [
    dashboardQueryKeys.housekeeping(token),
    dashboardQueryKeys.readiness(token),
    dashboardQueryKeys.cronStatus(token),
    dashboardQueryKeys.localSessions(token),
    dashboardQueryKeys.localStats(token),
    dashboardQueryKeys.improvementLearnings(token),
    dashboardQueryKeys.improvementProposals(token)
  ]);
}

export async function invalidateLlmReadQueries(queryClient: QueryClient, token?: string): Promise<void> {
  await invalidateQueryGroups(queryClient, [
    dashboardQueryKeys.llm(token),
    dashboardQueryKeys.runs(token),
    dashboardQueryKeys.sessions(token),
    dashboardQueryKeys.agentProfiles(token)
  ]);
}

export async function invalidateConfigReadQueries(queryClient: QueryClient, token?: string): Promise<void> {
  await invalidateQueryGroups(queryClient, [dashboardQueryKeys.runtimeConfig(token), dashboardQueryKeys.pairings(token)]);
}

export async function invalidateOnboardingReadQueries(queryClient: QueryClient, token?: string): Promise<void> {
  await invalidateQueryGroups(queryClient, [
    dashboardQueryKeys.onboarding(token),
    dashboardQueryKeys.vaultStatus(token),
    dashboardQueryKeys.toolsDiagnostics(token),
    dashboardQueryKeys.tools(token)
  ]);
}

export async function invalidateBrowserReadQueries(queryClient: QueryClient, token?: string): Promise<void> {
  await invalidateQueryGroups(queryClient, [
    dashboardQueryKeys.browser(token),
    dashboardQueryKeys.browserVault(token),
    dashboardQueryKeys.agentProfiles(token)
  ]);
}

export async function invalidateBacklogReadQueries(queryClient: QueryClient, token?: string): Promise<void> {
  await invalidateQueryGroups(queryClient, [dashboardQueryKeys.backlog(token), dashboardQueryKeys.agentProfiles(token)]);
}
