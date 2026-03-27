import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';

import {
  approveImprovementProposal,
  cleanupRuntimeArtifacts,
  purgeDeadLetterQueue,
  rejectImprovementProposal,
  runHousekeepingNow,
  runImprovementCycle,
  runLocalSessionsScan,
  setAgentSelfImprovementEnabled,
  updateHousekeepingRetention
} from '../app/api';
import {
  agentProfilesQueryOptions,
  cronStatusQueryOptions,
  housekeepingQueryOptions,
  improvementLearningsQueryOptions,
  improvementProposalsQueryOptions,
  invalidateAgentReadQueries,
  invalidateHousekeepingReadQueries,
  localSessionsQueryOptions,
  localStatsQueryOptions,
  readinessQueryOptions
} from '../app/queryOptions';
import { useAppStore } from '../app/store';
import type {
  CardMetric,
  CleanupRunState,
  CronStatusState,
  HousekeepingState,
  ImprovementProposalRow,
  LocalRuntimeKind,
  LocalRuntimeSessionRow,
  LocalRuntimeStatsState,
  ReadinessState
} from '../app/types';
import { PageDisclosure, PageIntro } from '../components/ops/PageHeader';
import { clampCount } from '../lib/format';
import { useRouteHeaderMetrics } from '../components/shell/RouteHeaderContext';

type RetentionFieldKey =
  | 'sessionRetentionHours.delegate'
  | 'sessionRetentionHours.dashboard'
  | 'sessionRetentionHours.agent'
  | 'sessionRetentionHours.internal'
  | 'sessionRetentionHours.telegram'
  | 'sessionRetentionHours.office'
  | 'sessionRetentionHours.unknown'
  | 'runRetentionHours'
  | 'terminalRetentionHours'
  | 'waitingInputStaleMinutes'
  | 'messageRetentionHours'
  | 'realtimeRetentionHours'
  | 'officePresenceRetentionHours'
  | 'llmUsageRetentionDays'
  | 'memoryRetentionDays'
  | 'memoryMarkdownRetentionDays'
  | 'auditRetentionDays';

const RETENTION_FIELDS: Array<{ key: RetentionFieldKey; label: string }> = [
  { key: 'sessionRetentionHours.delegate', label: 'Session delegate (h)' },
  { key: 'sessionRetentionHours.dashboard', label: 'Session dashboard (h)' },
  { key: 'sessionRetentionHours.agent', label: 'Session agent (h)' },
  { key: 'sessionRetentionHours.internal', label: 'Session internal (h)' },
  { key: 'sessionRetentionHours.telegram', label: 'Session telegram (h)' },
  { key: 'sessionRetentionHours.office', label: 'Session office (h)' },
  { key: 'sessionRetentionHours.unknown', label: 'Session unknown (h)' },
  { key: 'runRetentionHours', label: 'Run retention (h)' },
  { key: 'terminalRetentionHours', label: 'Terminal retention (h)' },
  { key: 'waitingInputStaleMinutes', label: 'Waiting input stale (m)' },
  { key: 'messageRetentionHours', label: 'Message retention (h)' },
  { key: 'realtimeRetentionHours', label: 'Realtime retention (h)' },
  { key: 'officePresenceRetentionHours', label: 'Office presence (h)' },
  { key: 'llmUsageRetentionDays', label: 'LLM usage (d)' },
  { key: 'memoryRetentionDays', label: 'Memory retention (d)' },
  { key: 'memoryMarkdownRetentionDays', label: 'Memory markdown (d)' },
  { key: 'auditRetentionDays', label: 'Audit retention (d)' }
];

const LOCAL_RUNTIME_FILTERS: Array<{ key: LocalRuntimeKind | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'codex', label: 'Codex' },
  { key: 'claude', label: 'Claude' },
  { key: 'gemini', label: 'Gemini' }
];

function fieldValue(state: HousekeepingState, key: RetentionFieldKey): number {
  if (key.startsWith('sessionRetentionHours.')) {
    const field = key.replace('sessionRetentionHours.', '') as keyof HousekeepingState['retention']['sessionsHours'];
    return state.retention.sessionsHours[field];
  }
  switch (key) {
    case 'runRetentionHours':
      return state.retention.runHours;
    case 'terminalRetentionHours':
      return state.retention.terminalHours ?? state.retention.runHours;
    case 'waitingInputStaleMinutes':
      return state.retention.waitingInputStaleMinutes ?? 0;
    case 'messageRetentionHours':
      return state.retention.messageHours;
    case 'realtimeRetentionHours':
      return state.retention.realtimeHours;
    case 'officePresenceRetentionHours':
      return state.retention.officePresenceHours;
    case 'llmUsageRetentionDays':
      return state.retention.llmUsageDays;
    case 'memoryRetentionDays':
      return state.retention.memoryDays;
    case 'memoryMarkdownRetentionDays':
      return state.retention.memoryMarkdownDays ?? state.retention.memoryDays;
    case 'auditRetentionDays':
      return state.retention.auditDays;
    default:
      return 0;
  }
}

type HousekeepingBusyState = 'save' | 'run' | 'scan' | 'improve' | 'deadletter' | 'artifacts' | null;
type LocalScannerState = {
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
} | null;

function buildRetentionEditorState(state: HousekeepingState): {
  fields: Record<RetentionFieldKey, string>;
  protectedKeys: string;
  fingerprint: string;
} {
  const fields = {} as Record<RetentionFieldKey, string>;
  for (const field of RETENTION_FIELDS) {
    fields[field.key] = String(fieldValue(state, field.key));
  }
  const protectedKeys = state.retention.protectedSessionKeys.join(', ');
  return {
    fields,
    protectedKeys,
    fingerprint: JSON.stringify({
      fields,
      protectedKeys
    })
  };
}

function getErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function useHousekeepingPageModel() {
  const token = useAppStore((state) => state.token);
  const refreshAgents = useAppStore((state) => state.refreshAgents);
  const navigate = useNavigate({ from: '/housekeeping' });
  const queryClient = useQueryClient();
  const routeSearch = useSearch({ from: '/housekeeping' });
  const [artifactScopeRoot, setArtifactScopeRoot] = useState('');
  const [retentionEditor, setRetentionEditor] = useState<{
    fields: Record<RetentionFieldKey, string>;
    protectedKeys: string;
  }>({
    fields: {} as Record<RetentionFieldKey, string>,
    protectedKeys: ''
  });
  const [busy, setBusy] = useState<HousekeepingBusyState>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deadLetterPreview, setDeadLetterPreview] = useState<CleanupRunState | null>(null);
  const [artifactPreview, setArtifactPreview] = useState<CleanupRunState | null>(null);
  const hydratedRetentionFingerprintRef = useRef<string | null>(null);
  const localRuntimeFilter = routeSearch.runtime ?? 'all';
  const { fields, protectedKeys } = retentionEditor;

  const setFields = useCallback(
    (value: Record<RetentionFieldKey, string> | ((current: Record<RetentionFieldKey, string>) => Record<RetentionFieldKey, string>)) => {
      setRetentionEditor((current) => ({
        ...current,
        fields: typeof value === 'function' ? value(current.fields) : value
      }));
    },
    []
  );
  const setProtectedKeys = useCallback((value: string) => {
    setRetentionEditor((current) => ({
      ...current,
      protectedKeys: value
    }));
  }, []);

  const agentProfilesQuery = useQuery(agentProfilesQueryOptions(token));
  const housekeepingQuery = useQuery(housekeepingQueryOptions(token));
  const readinessQuery = useQuery(readinessQueryOptions(token));
  const cronStatusQuery = useQuery(cronStatusQueryOptions(token));
  const localSessionsQuery = useQuery(
    localSessionsQueryOptions(token, {
      limit: 300,
      runtime: localRuntimeFilter
    })
  );
  const localStatsQuery = useQuery(localStatsQueryOptions(token, 'all'));
  const learningsQuery = useQuery(improvementLearningsQueryOptions(token, { limit: 200 }));
  const proposalsQuery = useQuery(improvementProposalsQueryOptions(token, { limit: 200 }));

  const agentProfiles = agentProfilesQuery.data ?? [];
  const housekeeping = housekeepingQuery.data ?? null;
  const readiness = readinessQuery.data ?? null;
  const cronStatus = cronStatusQuery.data ?? null;
  const localSessionsPayload = localSessionsQuery.data ?? null;
  const localSessions = localSessionsPayload?.sessions ?? [];
  const scannerState = localSessionsPayload?.scanner ?? null;
  const localStats = localStatsQuery.data ?? null;
  const learnings = learningsQuery.data ?? [];
  const proposals = proposalsQuery.data ?? [];

  const canMutate = Boolean(token);
  const retentionEditorState = useMemo(
    () => (housekeeping ? buildRetentionEditorState(housekeeping) : null),
    [housekeeping]
  );

  useEffect(() => {
    if (!retentionEditorState) {
      hydratedRetentionFingerprintRef.current = null;
      setRetentionEditor({
        fields: {} as Record<RetentionFieldKey, string>,
        protectedKeys: ''
      });
      return;
    }
    if (retentionEditorState.fingerprint === hydratedRetentionFingerprintRef.current) {
      return;
    }
    setRetentionEditor({
      fields: retentionEditorState.fields,
      protectedKeys: retentionEditorState.protectedKeys
    });
    hydratedRetentionFingerprintRef.current = retentionEditorState.fingerprint;
  }, [retentionEditorState]);

  const refetchHousekeepingSurface = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    await invalidateHousekeepingReadQueries(queryClient, token);
    await Promise.all([
      housekeepingQuery.refetch({ throwOnError: true }),
      readinessQuery.refetch({ throwOnError: true }),
      cronStatusQuery.refetch({ throwOnError: true }),
      localSessionsQuery.refetch({ throwOnError: true }),
      localStatsQuery.refetch({ throwOnError: true }),
      learningsQuery.refetch({ throwOnError: true }),
      proposalsQuery.refetch({ throwOnError: true })
    ]);
  }, [cronStatusQuery, housekeepingQuery, learningsQuery, localSessionsQuery, localStatsQuery, proposalsQuery, queryClient, readinessQuery, token]);

  const changedCount = useMemo(() => {
    if (!housekeeping) {
      return 0;
    }
    let changes = 0;
    for (const field of RETENTION_FIELDS) {
      if (Number(fields[field.key]) !== fieldValue(housekeeping, field.key)) {
        changes += 1;
      }
    }
    if (protectedKeys.split(',').map((entry) => entry.trim()).filter(Boolean).join(',') !== housekeeping.retention.protectedSessionKeys.join(',')) {
      changes += 1;
    }
    return changes;
  }, [fields, housekeeping, protectedKeys]);

  const pendingProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status === 'pending'),
    [proposals]
  );
  const readinessMetricTone: CardMetric['tone'] =
    readiness?.tier === 'blocked'
      ? 'critical'
      : readiness?.tier === 'degraded' || readiness?.tier === 'warning'
        ? 'warn'
        : readiness?.tier === 'ready'
          ? 'positive'
          : 'neutral';
  const headerMetrics = useMemo<CardMetric[]>(
    () => [
      {
        id: 'housekeeping_readiness',
        label: 'Readiness',
        value: readiness?.tier === 'ready' ? 1 : 0,
        displayValue: readiness?.tier ?? 'unknown',
        tone: readinessMetricTone
      },
      {
        id: 'housekeeping_dead_letters',
        label: 'Dead Letters',
        value: housekeeping?.cleanup?.deadLetterCount ?? 0,
        displayValue: clampCount(housekeeping?.cleanup?.deadLetterCount ?? 0),
        tone: (housekeeping?.cleanup?.deadLetterCount ?? 0) > 0 ? 'warn' : 'neutral'
      },
      {
        id: 'housekeeping_pending_proposals',
        label: 'Pending Proposals',
        value: pendingProposals.length,
        displayValue: clampCount(pendingProposals.length),
        tone: pendingProposals.length > 0 ? 'warn' : 'neutral'
      },
      {
        id: 'housekeeping_active_local',
        label: 'Active Local',
        value: localStats?.activeSessions ?? 0,
        displayValue: clampCount(localStats?.activeSessions ?? 0),
        tone: (localStats?.activeSessions ?? 0) > 0 ? 'positive' : 'neutral'
      }
    ],
    [housekeeping?.cleanup?.deadLetterCount, localStats?.activeSessions, pendingProposals.length, readiness?.tier, readinessMetricTone]
  );

  useRouteHeaderMetrics(headerMetrics);

  const readinessTone =
    readiness?.tier === 'blocked'
      ? 'text-rose-300 border-rose-500/30 bg-rose-500/10'
      : readiness?.tier === 'degraded'
        ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
        : readiness?.tier === 'warning'
          ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'
          : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';

  const queryError = [
    agentProfilesQuery.error,
    housekeepingQuery.error,
    readinessQuery.error,
    cronStatusQuery.error,
    localSessionsQuery.error,
    localStatsQuery.error,
    learningsQuery.error,
    proposalsQuery.error
  ].find((cause) => cause != null);
  const pageError = error ?? (queryError ? getErrorMessage(queryError, 'Failed to load housekeeping state') : null);

  const handleSaveRetention = useCallback(() => {
    if (!token) {
      return;
    }
    setBusy('save');
    const updates: Record<string, number | string[]> = {};
    for (const field of RETENTION_FIELDS) {
      const parsed = Number(fields[field.key]);
      if (Number.isFinite(parsed)) {
        updates[field.key] = parsed;
      }
    }
    updates.protectedSessionKeys = protectedKeys.split(',').map((entry) => entry.trim()).filter(Boolean);

    void updateHousekeepingRetention(token, updates)
      .then(async (result) => {
        setMessage(`Saved ${result.changed.length} retention fields.`);
        await refetchHousekeepingSurface();
      })
      .catch((cause: unknown) => {
        setError(getErrorMessage(cause, 'Failed to save retention policy'));
      })
      .finally(() => setBusy(null));
  }, [fields, protectedKeys, refetchHousekeepingSurface, token]);

  const handleRunCleanupNow = useCallback(() => {
    if (!token) {
      return;
    }
    setBusy('run');
    void runHousekeepingNow(token)
      .then(async () => {
        setMessage('Cleanup completed.');
        await refetchHousekeepingSurface();
      })
      .catch((cause: unknown) => {
        setError(getErrorMessage(cause, 'Cleanup failed'));
      })
      .finally(() => setBusy(null));
  }, [refetchHousekeepingSurface, token]);

  const handlePreviewDeadLetterPurge = useCallback(() => {
    if (!token) {
      return;
    }
    setBusy('deadletter');
    void purgeDeadLetterQueue(token, { dryRun: true })
      .then((result) => {
        setDeadLetterPreview(result);
        setMessage(`Dead-letter dry-run found ${result.count} candidate(s).`);
      })
      .catch((cause: unknown) => {
        setError(getErrorMessage(cause, 'Dead-letter preview failed'));
      })
      .finally(() => setBusy(null));
  }, [token]);

  const handleApplyDeadLetterPurge = useCallback(() => {
    if (!token) {
      return;
    }
    setBusy('deadletter');
    void purgeDeadLetterQueue(token, { dryRun: false })
      .then(async (result) => {
        setDeadLetterPreview(result);
        setMessage(`Purged ${result.purged?.length ?? 0} dead-letter item(s).`);
        await refetchHousekeepingSurface();
      })
      .catch((cause: unknown) => {
        setError(getErrorMessage(cause, 'Dead-letter purge failed'));
      })
      .finally(() => setBusy(null));
  }, [refetchHousekeepingSurface, token]);

  const handlePreviewArtifactCleanup = useCallback(() => {
    if (!token) {
      return;
    }
    setBusy('artifacts');
    void cleanupRuntimeArtifacts(token, {
      dryRun: true,
      scopeRoot: artifactScopeRoot.trim() || null
    })
      .then((result) => {
        setArtifactPreview(result);
        setMessage(`Artifact dry-run found ${result.count} candidate(s).`);
      })
      .catch((cause: unknown) => {
        setError(getErrorMessage(cause, 'Artifact cleanup preview failed'));
      })
      .finally(() => setBusy(null));
  }, [artifactScopeRoot, token]);

  const handleApplyArtifactCleanup = useCallback(() => {
    if (!token) {
      return;
    }
    setBusy('artifacts');
    void cleanupRuntimeArtifacts(token, {
      dryRun: false,
      scopeRoot: artifactScopeRoot.trim() || null
    })
      .then(async (result) => {
        setArtifactPreview(result);
        setMessage(`Removed ${result.removed?.length ?? 0} artifact path(s).`);
        await refetchHousekeepingSurface();
      })
      .catch((cause: unknown) => {
        setError(getErrorMessage(cause, 'Artifact cleanup failed'));
      })
      .finally(() => setBusy(null));
  }, [artifactScopeRoot, refetchHousekeepingSurface, token]);

  const handleRunLocalScan = useCallback(() => {
    if (!token) {
      return;
    }
    setBusy('scan');
    void runLocalSessionsScan(token, localRuntimeFilter)
      .then(async () => {
        await refetchHousekeepingSurface();
        setMessage('Local session scan complete.');
      })
      .catch((cause: unknown) => {
        setError(getErrorMessage(cause, 'Local session scan failed.'));
      })
      .finally(() => setBusy(null));
  }, [localRuntimeFilter, refetchHousekeepingSurface, token]);

  const handleRunImprovementReview = useCallback(() => {
    if (!token) {
      return;
    }
    setBusy('improve');
    void runImprovementCycle(token)
      .then(async (result) => {
        setMessage(`Improvement cycle reviewed ${result.reviewedAgents} agents.`);
        await refetchHousekeepingSurface();
      })
      .catch((cause: unknown) => {
        setError(getErrorMessage(cause, 'Improvement cycle failed.'));
      })
      .finally(() => setBusy(null));
  }, [refetchHousekeepingSurface, token]);

  const handleApproveProposal = useCallback(
    async (proposalId: string) => {
      if (!token) {
        return;
      }
      try {
        await approveImprovementProposal(token, proposalId);
        await refetchHousekeepingSurface();
      } catch (cause) {
        setError(getErrorMessage(cause, 'Approve proposal failed.'));
      }
    },
    [refetchHousekeepingSurface, token]
  );

  const handleRejectProposal = useCallback(
    async (proposalId: string) => {
      if (!token) {
        return;
      }
      try {
        await rejectImprovementProposal(token, proposalId);
        await refetchHousekeepingSurface();
      } catch (cause) {
        setError(getErrorMessage(cause, 'Reject proposal failed.'));
      }
    },
    [refetchHousekeepingSurface, token]
  );

  const handleToggleSelfImprovement = useCallback(
    async (agentId: string, enabled: boolean) => {
      if (!token) {
        return;
      }
      try {
        await setAgentSelfImprovementEnabled(token, agentId, enabled);
        await Promise.all([
          refreshAgents(),
          invalidateAgentReadQueries(queryClient, token),
          agentProfilesQuery.refetch({ throwOnError: true }),
          refetchHousekeepingSurface()
        ]);
      } catch (cause) {
        setError(getErrorMessage(cause, 'Failed to update agent toggle.'));
      }
    },
    [agentProfilesQuery, queryClient, refetchHousekeepingSurface, refreshAgents, token]
  );

  return {
    agentProfiles,
    artifactPreview,
    artifactScopeRoot,
    busy,
    canMutate,
    changedCount,
    cronStatus,
    deadLetterPreview,
    error: pageError,
    fields,
    housekeeping,
    learningsCount: learnings.length,
    localRuntimeFilter,
    localSessions,
    localStats,
    message,
    pendingProposals,
    protectedKeys,
    readiness,
    readinessTone,
    scannerState,
    handleApproveProposal,
    handleApplyArtifactCleanup,
    handleApplyDeadLetterPurge,
    handleFieldChange: (key: RetentionFieldKey, value: string) =>
      setFields((previous) => ({
        ...previous,
        [key]: value
      })),
    handlePreviewArtifactCleanup,
    handlePreviewDeadLetterPurge,
    handleRefresh: () =>
      void refetchHousekeepingSurface().catch((cause) => {
        setError(getErrorMessage(cause, 'Failed to load housekeeping state'));
      }),
    handleRejectProposal,
    handleRunCleanupNow,
    handleRunImprovementReview,
    handleRunLocalScan,
    handleSaveRetention,
    handleToggleSelfImprovement,
    setArtifactScopeRoot,
    setLocalRuntimeFilter: (value: LocalRuntimeKind | 'all') =>
      void navigate({
        to: '/housekeeping',
        search: (previous) => ({
          ...previous,
          runtime: value
        })
      }),
    setProtectedKeys
  };
}

export function HousekeepingPage() {
  const {
    agentProfiles,
    artifactPreview,
    artifactScopeRoot,
    busy,
    canMutate,
    changedCount,
    cronStatus,
    deadLetterPreview,
    error,
    fields,
    housekeeping,
    learningsCount,
    localRuntimeFilter,
    localSessions,
    localStats,
    message,
    pendingProposals,
    protectedKeys,
    readiness,
    readinessTone,
    scannerState,
    handleApproveProposal,
    handleApplyArtifactCleanup,
    handleApplyDeadLetterPurge,
    handleFieldChange,
    handlePreviewArtifactCleanup,
    handlePreviewDeadLetterPurge,
    handleRefresh,
    handleRejectProposal,
    handleRunCleanupNow,
    handleRunImprovementReview,
    handleRunLocalScan,
    handleSaveRetention,
    handleToggleSelfImprovement,
    setArtifactScopeRoot,
    setLocalRuntimeFilter,
    setProtectedKeys
  } = useHousekeepingPageModel();

  return (
    <section className="shell-page shell-page-wide">
      <PageIntro
        eyebrow="Infrastructure"
        title="Housekeeping"
        description="Keep cleanup and recovery routines available without forcing every retention dial onto the first screen."
        stats={[
          {
            label: 'Readiness',
            value: readiness?.tier ?? 'unknown',
            tone:
              readiness?.tier === 'blocked'
                ? 'critical'
                : readiness?.tier === 'degraded' || readiness?.tier === 'warning'
                  ? 'warn'
                  : 'positive'
          },
          {
            label: 'Dead letters',
            value: housekeeping?.cleanup?.deadLetterCount ?? 0
          },
          {
            label: 'Pending proposals',
            value: pendingProposals.length
          },
          {
            label: 'Active local',
            value: localSessions.length
          }
        ]}
      />

      <OperationalReadinessCard readiness={readiness} readinessTone={readinessTone} />
      <PageDisclosure
        title="Retention policy"
        description="Edit cleanup thresholds and protected keys only when you need them."
        defaultOpen
      >
        <RetentionPolicyCard
          canMutate={canMutate}
          busy={busy}
          changedCount={changedCount}
          fields={fields}
          protectedKeys={protectedKeys}
          message={message}
          error={error}
          onFieldChange={handleFieldChange}
          onProtectedKeysChange={setProtectedKeys}
          onSave={handleSaveRetention}
          onRunCleanupNow={handleRunCleanupNow}
        />
      </PageDisclosure>
      <PageDisclosure
        title="Recovery actions"
        description="Keep destructive cleanup previews tucked away until you need to inspect them."
      >
        <RecoveryActionsCard
          canMutate={canMutate}
          busy={busy}
          deadLetterCount={housekeeping?.cleanup?.deadLetterCount ?? 0}
          deadLetterPreview={deadLetterPreview}
          artifactPreview={artifactPreview}
          artifactScopeRoot={artifactScopeRoot}
          allowlistedRoots={housekeeping?.cleanup?.allowlistedRoots ?? []}
          onArtifactScopeRootChange={setArtifactScopeRoot}
          onPreviewDeadLetterPurge={handlePreviewDeadLetterPurge}
          onApplyDeadLetterPurge={handleApplyDeadLetterPurge}
          onPreviewArtifactCleanup={handlePreviewArtifactCleanup}
          onApplyArtifactCleanup={handleApplyArtifactCleanup}
        />
      </PageDisclosure>
      <PageDisclosure title="Last run and cron health" description="Recent cleanup execution and scheduler posture." defaultOpen>
        <div className="grid gap-4 xl:grid-cols-2">
          <LastRunCard housekeeping={housekeeping} />
          <CronHealthCard cronStatus={cronStatus} onRefresh={handleRefresh} />
        </div>
      </PageDisclosure>
      <PageDisclosure title="Local runtime sessions" description="Open this when you need scanner output or local runtime details.">
        <LocalRuntimeSessionsCard
          busy={busy}
          localRuntimeFilter={localRuntimeFilter}
          localSessions={localSessions}
          localStats={localStats}
          scannerState={scannerState}
          onFilterChange={setLocalRuntimeFilter}
          onScanNow={handleRunLocalScan}
        />
      </PageDisclosure>
      <PageDisclosure
        title="Improvement review"
        description="Proposal approvals and self-improvement toggles stay available without dominating the page."
      >
        <ImprovementReviewCard
          busy={busy}
          learningsCount={learningsCount}
          pendingProposals={pendingProposals}
          agentProfiles={agentProfiles}
          onRunCycle={handleRunImprovementReview}
          onApproveProposal={(proposalId) => void handleApproveProposal(proposalId)}
          onRejectProposal={(proposalId) => void handleRejectProposal(proposalId)}
          onToggleSelfImprovement={(agentId, enabled) => void handleToggleSelfImprovement(agentId, enabled)}
        />
      </PageDisclosure>
    </section>
  );
}

function OperationalReadinessCard({
  readiness,
  readinessTone
}: {
  readiness: ReadinessState | null;
  readinessTone: string;
}) {
  return (
    <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-medium text-white">Operational Readiness</h4>
          <p className="mt-1 text-sm text-slate-400">Server-side tiering stays authoritative for cleanup and recovery posture.</p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${readinessTone}`}>
          {readiness?.tier ?? 'unknown'}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(readiness?.checks ?? []).map((check) => (
          <div key={check.name} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-medium text-white">{check.name}</div>
              <div className={`text-[10px] font-bold uppercase ${
                check.tier === 'blocked'
                  ? 'text-rose-300'
                  : check.tier === 'degraded'
                    ? 'text-amber-300'
                    : check.tier === 'warning'
                      ? 'text-yellow-300'
                      : 'text-emerald-300'
              }`}>
                {check.tier}
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-300">{check.summary}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function RetentionPolicyCard({
  canMutate,
  busy,
  changedCount,
  fields,
  protectedKeys,
  message,
  error,
  onFieldChange,
  onProtectedKeysChange,
  onSave,
  onRunCleanupNow
}: {
  canMutate: boolean;
  busy: 'save' | 'run' | 'scan' | 'improve' | 'deadletter' | 'artifacts' | null;
  changedCount: number;
  fields: Record<RetentionFieldKey, string>;
  protectedKeys: string;
  message: string | null;
  error: string | null;
  onFieldChange: (key: RetentionFieldKey, value: string) => void;
  onProtectedKeysChange: (value: string) => void;
  onSave: () => void;
  onRunCleanupNow: () => void;
}) {
  return (
    <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
      <div className="grid gap-3 md:grid-cols-2">
        {RETENTION_FIELDS.map((field) => (
          <label key={field.key} className="space-y-1 text-sm text-slate-400">
            <span>{field.label}</span>
            <input
              type="number"
              min={1}
              step={1}
              value={fields[field.key] ?? ''}
              onChange={(event) => onFieldChange(field.key, event.target.value)}
              className="shell-field w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
        ))}
      </div>
      <label className="mt-3 block space-y-1 text-sm text-slate-400">
        <span>Protected Session Keys (comma-separated)</span>
        <input
          value={protectedKeys}
          onChange={(event) => onProtectedKeysChange(event.target.value)}
          className="shell-field w-full rounded-xl px-3 py-2 text-sm"
        />
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canMutate || busy === 'save' || changedCount === 0}
          onClick={onSave}
          className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Retention
        </button>
        <button
          type="button"
          disabled={!canMutate || busy === 'run'}
          onClick={onRunCleanupNow}
          className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Run Cleanup Now
        </button>
        {message ? <span className="text-xs text-emerald-300">{message}</span> : null}
        {error ? <span className="text-xs text-rose-300">{error}</span> : null}
      </div>
    </article>
  );
}

function RecoveryActionsCard({
  canMutate,
  busy,
  deadLetterCount,
  deadLetterPreview,
  artifactPreview,
  artifactScopeRoot,
  allowlistedRoots,
  onArtifactScopeRootChange,
  onPreviewDeadLetterPurge,
  onApplyDeadLetterPurge,
  onPreviewArtifactCleanup,
  onApplyArtifactCleanup
}: {
  canMutate: boolean;
  busy: 'save' | 'run' | 'scan' | 'improve' | 'deadletter' | 'artifacts' | null;
  deadLetterCount: number;
  deadLetterPreview: CleanupRunState | null;
  artifactPreview: CleanupRunState | null;
  artifactScopeRoot: string;
  allowlistedRoots: string[];
  onArtifactScopeRootChange: (value: string) => void;
  onPreviewDeadLetterPurge: () => void;
  onApplyDeadLetterPurge: () => void;
  onPreviewArtifactCleanup: () => void;
  onApplyArtifactCleanup: () => void;
}) {
  return (
    <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-medium text-white">Recovery Actions</h4>
          <p className="mt-1 text-sm text-slate-400">Preview queue purges and runtime artifact cleanup before applying them.</p>
        </div>
        <div className="text-sm text-slate-400">
          Dead letters: <span className="font-semibold text-slate-200">{deadLetterCount}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
          <div>
            <div className="text-lg font-medium text-white">Dead-Letter Queue</div>
            <p className="mt-1 text-sm text-slate-400">Dry-run is the default path. Apply only after previewing the candidate rows.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canMutate || busy === 'deadletter'}
              onClick={onPreviewDeadLetterPurge}
              className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Preview Purge
            </button>
            <button
              type="button"
              disabled={!canMutate || busy === 'deadletter'}
              onClick={onApplyDeadLetterPurge}
              className="rounded-xl border border-rose-700/70 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-60"
            >
              Apply Purge
            </button>
          </div>
          <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
            <div className="font-semibold text-slate-100">Latest preview</div>
            <p className="mt-1 text-slate-500">
              {deadLetterPreview ? `${deadLetterPreview.count} candidate(s)` : 'No dead-letter preview yet.'}
            </p>
            {(deadLetterPreview?.candidates ?? []).slice(0, 5).map((candidate) => (
              <div key={candidate.target} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
                <div className="font-mono text-slate-200">{candidate.target}</div>
                <div>run: {candidate.runId ?? 'n/a'}</div>
                <div>session: {candidate.sessionId ?? 'n/a'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
          <div>
            <div className="text-lg font-medium text-white">Runtime Artifacts</div>
            <p className="mt-1 text-sm text-slate-400">Cleanup is constrained to allowlisted runtime and simulation roots.</p>
          </div>
          <label className="space-y-1 text-sm text-slate-400">
            <span>Optional Scope Root</span>
            <input
              value={artifactScopeRoot}
              onChange={(event) => onArtifactScopeRootChange(event.target.value)}
              placeholder={allowlistedRoots[0] ?? '/path/inside/allowlisted/root'}
              className="shell-field w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canMutate || busy === 'artifacts'}
              onClick={onPreviewArtifactCleanup}
              className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Preview Cleanup
            </button>
            <button
              type="button"
              disabled={!canMutate || busy === 'artifacts'}
              onClick={onApplyArtifactCleanup}
              className="rounded-xl border border-rose-700/70 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-60"
            >
              Apply Cleanup
            </button>
          </div>
          <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
            <div className="font-semibold text-slate-100">Allowlisted roots</div>
            <div className="mt-2 space-y-1 text-sm text-slate-400">
              {allowlistedRoots.map((root) => (
                <div key={root} className="font-mono break-all">{root}</div>
              ))}
            </div>
            <div className="mt-3 font-semibold text-slate-100">Latest preview</div>
            <p className="mt-1 text-slate-500">
              {artifactPreview ? `${artifactPreview.count} candidate(s)` : 'No artifact cleanup preview yet.'}
            </p>
            {(artifactPreview?.candidates ?? []).slice(0, 5).map((candidate) => (
              <div key={candidate.target} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
                <div className="font-mono text-slate-200 break-all">{candidate.target}</div>
                <div>{Math.round(candidate.bytes / 1024)} KiB</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function LastRunCard({ housekeeping }: { housekeeping: HousekeepingState | null }) {
  return (
    <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
      <h4 className="text-lg font-medium text-white">Last Run</h4>
      <p className="mt-2 text-sm text-slate-400">inFlight: {String(housekeeping?.inFlight ?? false)}</p>
      <p className="text-sm text-slate-400">lastRunAt: {housekeeping?.lastRunAt ?? 'never'}</p>
      <p className="text-sm text-slate-400">lastError: {housekeeping?.lastError ?? 'none'}</p>
      <pre className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
        {JSON.stringify(housekeeping?.lastResult ?? {}, null, 2)}
      </pre>
    </article>
  );
}

function CronHealthCard({
  cronStatus,
  onRefresh
}: {
  cronStatus: CronStatusState | null;
  onRefresh: () => void;
}) {
  return (
    <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-lg font-medium text-white">Cron Health</h4>
        <div className="flex items-center gap-2">
          <Link
            to="/schedules"
            search={{
              kind: 'all',
              query: ''
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
          >
            Open schedules
          </Link>
          <button type="button" onClick={onRefresh} className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
            Refresh
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {(cronStatus?.jobs ?? []).map((job) => (
          <div key={job.jobName} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
            <p className="font-semibold text-slate-100">{job.jobName}</p>
            <p>schedule: {job.schedule}</p>
            <p>last: {job.lastRunAt ?? 'never'} ({job.lastStatus ?? 'n/a'})</p>
            <p>next: {job.nextRunAt}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 text-sm text-slate-400">
        <p>Reaper today: {cronStatus?.reaper.reapedToday ?? 0} sessions</p>
        <p>Reaper total: {cronStatus?.reaper.reapedTotal ?? 0} sessions</p>
        <p>Suppressed heartbeats today: {cronStatus?.heartbeatSuppression.suppressedToday ?? 0}</p>
      </div>
    </article>
  );
}

function LocalRuntimeSessionsCard({
  busy,
  localRuntimeFilter,
  localSessions,
  localStats,
  scannerState,
  onFilterChange,
  onScanNow
}: {
  busy: 'save' | 'run' | 'scan' | 'improve' | 'deadletter' | 'artifacts' | null;
  localRuntimeFilter: LocalRuntimeKind | 'all';
  localSessions: LocalRuntimeSessionRow[];
  localStats: LocalRuntimeStatsState | null;
  scannerState: LocalScannerState;
  onFilterChange: (value: LocalRuntimeKind | 'all') => void;
  onScanNow: () => void;
}) {
  return (
    <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-lg font-medium text-white">Local Runtime Sessions</h4>
        <button
          type="button"
          disabled={busy === 'scan'}
          onClick={onScanNow}
          className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Scan Now
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {LOCAL_RUNTIME_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => onFilterChange(filter.key)}
            className={`rounded-lg border px-2 py-1 text-xs ${
              localRuntimeFilter === filter.key
                ? 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]'
                : 'shell-button-ghost text-slate-300'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-slate-400">filter: {localRuntimeFilter}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3 text-xs text-slate-300">
        <p>today: ${localStats?.costToday?.toFixed(2) ?? '0.00'}</p>
        <p>week: ${localStats?.costThisWeek?.toFixed(2) ?? '0.00'}</p>
        <p>month: ${localStats?.costThisMonth?.toFixed(2) ?? '0.00'}</p>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {LOCAL_RUNTIME_FILTERS.filter((entry) => entry.key !== 'all').map((entry) => {
          const runtimeKey = entry.key as LocalRuntimeKind;
          const bucket = localStats?.byRuntime?.[runtimeKey];
          return (
            <div key={`runtime-total-${entry.key}`} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
              <p className="font-semibold text-slate-100">{entry.label}</p>
              <p>
                sessions: {bucket?.totalSessions ?? 0} ({bucket?.activeSessions ?? 0} active)
              </p>
              <p>tokens: {bucket?.totalTokens ?? 0}</p>
              <p>month: ${(bucket?.costThisMonth ?? 0).toFixed(2)}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 space-y-1 text-sm text-slate-400">
        {LOCAL_RUNTIME_FILTERS.filter((entry) => entry.key !== 'all').map((entry) => {
          const runtimeKey = entry.key as LocalRuntimeKind;
          const state = scannerState?.runtimes?.[runtimeKey];
          return (
            <p key={`scanner-${runtimeKey}`}>
              scanner[{runtimeKey}]: {state?.root ?? 'n/a'} · last={state?.lastScanAt ?? 'never'} · error=
              {state?.lastScanError ?? 'none'}
            </p>
          );
        })}
      </div>
      <div className="mt-3 space-y-2">
        {localSessions.length === 0 ? <p className="text-sm text-slate-400">No local runtime sessions found for this filter.</p> : null}
        {localSessions.slice(0, 12).map((session) => (
          <div key={session.id} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
            <p className="font-semibold text-slate-100">
              {session.projectSlug} · {session.model} · runtime: {session.runtime}
            </p>
            <p>branch: {session.branch ?? 'n/a'} · active: {String(session.active)}</p>
            <p>
              tokens:{' '}
              {session.inputTokens +
                session.outputTokens +
                session.cacheReadInputTokens +
                session.cacheCreationInputTokens}{' '}
              · cost: ${session.estimatedCostUsd.toFixed(3)}
            </p>
            {session.runtime === 'codex' ? (
              <p className="truncate text-slate-500">
                workspace: {typeof session.details?.workspacePath === 'string' ? session.details.workspacePath : 'n/a'}
              </p>
            ) : null}
            {session.runtime === 'claude' ? (
              <p className="truncate text-slate-500">
                source: {typeof session.details?.source === 'string' ? session.details.source : 'n/a'}
              </p>
            ) : null}
            {session.runtime === 'gemini' ? (
              <p className="truncate text-slate-500">
                projectRoot: {typeof session.details?.projectRoot === 'string' ? session.details.projectRoot : 'n/a'}
              </p>
            ) : null}
            <p className="truncate text-slate-500">prompt: {session.lastUserPrompt ?? 'n/a'}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function ImprovementReviewCard({
  busy,
  learningsCount,
  pendingProposals,
  agentProfiles,
  onRunCycle,
  onApproveProposal,
  onRejectProposal,
  onToggleSelfImprovement
}: {
  busy: 'save' | 'run' | 'scan' | 'improve' | 'deadletter' | 'artifacts' | null;
  learningsCount: number;
  pendingProposals: ImprovementProposalRow[];
  agentProfiles: { id: string; name: string; metadata?: Record<string, unknown> | null }[];
  onRunCycle: () => void;
  onApproveProposal: (proposalId: string) => void;
  onRejectProposal: (proposalId: string) => void;
  onToggleSelfImprovement: (agentId: string, enabled: boolean) => void;
}) {
  return (
    <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-lg font-medium text-white">Self-Improvement Review</h4>
        <button
          type="button"
          disabled={busy === 'improve'}
          onClick={onRunCycle}
          className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Run Cycle
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        learnings: {learningsCount} · pending proposals: {pendingProposals.length}
      </p>
      <div className="mt-3 space-y-2">
        {pendingProposals.slice(0, 10).map((proposal) => (
          <div key={proposal.id} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
            <p className="font-semibold text-slate-100">{proposal.agentId}</p>
            <p>{proposal.reasoning}</p>
            <ul className="mt-1 list-disc pl-4 text-slate-400">
              {proposal.proposedChanges.slice(0, 4).map((change) => (
                <li key={`${proposal.id}-${change}`}>{change}</li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => onApproveProposal(proposal.id)} className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-slate-200 rounded-lg transition-colors">
                Approve
              </button>
              <button
                type="button"
                onClick={() => onRejectProposal(proposal.id)}
                className="rounded-lg border border-rose-700 px-2 py-1 text-rose-200"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {agentProfiles.slice(0, 8).map((agent) => {
          const enabled = agent.metadata?.selfImprovementEnabled !== false;
          return (
            <label key={agent.id} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
              <span>{agent.name}</span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => onToggleSelfImprovement(agent.id, event.target.checked)}
              />
            </label>
          );
        })}
      </div>
    </article>
  );
}
