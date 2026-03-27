import {
  ArrowsClockwise,
  CaretRight,
  CheckCircle,
  CirclesThreePlus,
  Ghost,
  Kanban,
  Lightning,
  MagnifyingGlass,
  PlayCircle,
  RocketLaunch,
  Rows,
  ShieldCheck,
  Stack,
  Target,
  Trash,
  Warning,
  WarningCircle,
  X
} from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'framer-motion';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { memo, type DragEvent, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  cleanupBacklog,
  deleteBacklogItem,
  overrideBacklogItem,
  tickBacklogOrchestration,
  transitionBacklogItem
} from '../app/api';
import {
  backlogBoardQueryOptions,
  backlogContractsQueryOptions,
  backlogDecisionStreamQueryOptions,
  backlogOrchestrationQueryOptions,
  invalidateBacklogReadQueries
} from '../app/queryOptions';
import { useAppStore } from '../app/store';
import type {
  BacklogBoardColumns,
  BacklogDecisionStreamRow,
  BacklogItemRow,
  BacklogProjectScopeRow,
  BacklogScopeSummaryRow,
  CardMetric,
  BacklogState
} from '../app/types';
import { PageDisclosure } from '../components/ops/PageHeader';
import { clampCount } from '../lib/format';
import { buildIndexedKey } from '../lib/listKeys';
import { useRouteHeaderMetrics } from '../components/shell/RouteHeaderContext';
import { GithubDeliveryCockpit } from '../components/backlog/GithubDeliveryCockpit';

const COLUMN_ORDER: BacklogState[] = ['idea', 'triage', 'planned', 'in_progress', 'review', 'blocked', 'done', 'archived'];
const ACTIVE_DEFAULT: BacklogState[] = ['idea', 'triage', 'planned', 'in_progress', 'review', 'blocked', 'done'];
const DEFAULT_SCOPE: BacklogProjectScopeRow = {
  projectId: null,
  repoRoot: null,
  unscopedOnly: false
};

const COLUMN_META: Record<BacklogState, { label: string; dot: string; icon: any }> = {
  idea: { label: 'Inbound Ideas', icon: CirclesThreePlus, dot: 'bg-slate-600' },
  triage: { label: 'Triage', icon: Target, dot: 'bg-slate-500' },
  planned: { label: 'Ready for Dispatch', icon: Rows, dot: 'bg-[color:var(--shell-accent)]' },
  in_progress: { label: 'Live Execution', icon: PlayCircle, dot: 'bg-emerald-500' },
  review: { label: 'Verification', icon: CheckCircle, dot: 'bg-amber-500' },
  blocked: { label: 'System Stalled', icon: Warning, dot: 'bg-rose-500' },
  done: { label: 'Production Ready', icon: RocketLaunch, dot: 'bg-emerald-400' },
  archived: { label: 'Archived', icon: X, dot: 'bg-slate-800' }
};

const EMPTY_COLUMNS: BacklogBoardColumns = {
  idea: [],
  triage: [],
  planned: [],
  in_progress: [],
  review: [],
  blocked: [],
  done: [],
  archived: []
};

const FILTER_PRESETS: Array<{ id: string; label: string; states: BacklogState[] }> = [
  { id: 'active', label: 'Active', states: ['idea', 'triage', 'planned', 'in_progress', 'review'] },
  { id: 'blocked', label: 'Blocked', states: ['blocked'] },
  { id: 'done', label: 'Done', states: ['done'] },
  { id: 'archived', label: 'Archived', states: ['archived'] }
];

type ProjectScopeOption = {
  projectId: string;
  label: string;
  itemCount: number;
  activeCount: number;
  blockedCount: number;
};

function prettifyProjectLabel(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value
    .split(/[-_]+/g)
    .filter((entry) => entry.length > 0)
    .map((entry) => entry[0]?.toUpperCase() + entry.slice(1))
    .join(' ');
}

function resolveRepoLabel(repoRoot: string | null, metadata?: Record<string, unknown>): string | null {
  if (repoRoot) {
    const segments = repoRoot.split(/[\\/]+/g).filter((entry) => entry.length > 0);
    return segments.length > 0 ? segments[segments.length - 1] : repoRoot;
  }
  const repoHint = metadata?.githubRepoHint;
  if (repoHint && typeof repoHint === 'object') {
    const repoHintRecord = repoHint as Record<string, unknown>;
    const owner = typeof repoHintRecord.owner === 'string' ? repoHintRecord.owner : '';
    const repo = typeof repoHintRecord.repo === 'string' ? repoHintRecord.repo : null;
    if (owner && repo) {
      return `${owner}/${repo}`;
    }
    if (repo) {
      return repo;
    }
  }
  return null;
}

function describeScope(scope: BacklogProjectScopeRow, selectedProject: ProjectScopeOption | null, selectedRepo: BacklogScopeSummaryRow | null): string {
  if (scope.unscopedOnly) {
    return 'Unscoped intake';
  }
  if (selectedRepo) {
    return `Repository ${selectedRepo.repoLabel ?? selectedRepo.label}`;
  }
  if (selectedProject) {
    return `Project ${selectedProject.label}`;
  }
  return 'All workstreams';
}

function parseReasonCode(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('missing_repo_link')) {
    return 'missing_repo_link';
  }
  if (normalized.includes('delivery evidence missing') || normalized.includes('artifact evidence')) {
    return 'missing_artifact_evidence';
  }
  if (normalized.includes('dependency')) {
    return 'dependencies_unresolved';
  }
  return 'unknown';
}

function allowedTransitions(contract: Record<string, unknown> | null, state: BacklogState): BacklogState[] {
  if (!contract) {
    return [];
  }
  const transitions = contract.transitions;
  if (!transitions || typeof transitions !== 'object') {
    return [];
  }
  const row = (transitions as Record<string, unknown>)[state];
  if (!Array.isArray(row)) {
    return [];
  }
  return row
    .map((entry) => String(entry).trim())
    .filter((entry): entry is BacklogState => COLUMN_ORDER.includes(entry as BacklogState));
}

function resolveEvidenceChip(item: BacklogItemRow): { label: string; tone: string } | null {
  const artifacts = item.delivery?.metadata?.artifacts;
  if (!artifacts || typeof artifacts !== 'object') {
    return null;
  }
  const evidenceType = String((artifacts as Record<string, unknown>).evidenceType ?? '').trim();
  if (evidenceType === 'github_evidence') {
    return { label: 'GitHub Evidence', tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' };
  }
  if (evidenceType === 'workspace_evidence') {
    return {
      label: 'Workspace Evidence',
      tone: 'text-[var(--shell-accent)] border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)]'
    };
  }
  if (evidenceType === 'simulation_only') {
    return { label: 'Simulation Only', tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10' };
  }
  if (evidenceType === 'missing') {
    return { label: 'Evidence Missing', tone: 'text-rose-300 border-rose-500/30 bg-rose-500/10' };
  }
  return null;
}

type BacklogOrchestrationState = {
  enabled: boolean;
  paused: boolean;
  maxParallel: number;
  wipLimit: number;
  queue: { planned: number; inFlight: number };
  projectCaps: Record<string, number>;
  projectPriorityBias: Record<string, number>;
};

type BacklogErrorBanner = {
  itemId: string | null;
  message: string;
  reasonCode: string;
  remediation: string[];
} | null;

const DEFAULT_ORCHESTRATION_STATE: BacklogOrchestrationState = {
  enabled: true,
  paused: true,
  maxParallel: 2,
  wipLimit: 3,
  queue: { planned: 0, inFlight: 0 },
  projectCaps: {},
  projectPriorityBias: {}
};

function useBacklogPageController(token?: string) {
  const queryClient = useQueryClient();
  const routeSearch = useSearch({ from: '/backlog' });
  const navigate = useNavigate({ from: '/backlog' });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [dragOverState, setDragOverState] = useState<BacklogState | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [errorBanner, setErrorBanner] = useState<BacklogErrorBanner>(null);
  const query = routeSearch.query ?? '';
  const filters = useMemo(
    () => new Set((routeSearch.states?.length ?? 0) > 0 ? routeSearch.states : ACTIVE_DEFAULT),
    [routeSearch.states]
  );
  const scope = useMemo<BacklogProjectScopeRow>(
    () => ({
      projectId: routeSearch.scope === 'unscoped' ? null : routeSearch.projectId ?? null,
      repoRoot: routeSearch.scope === 'unscoped' ? null : routeSearch.repoRoot ?? null,
      unscopedOnly: routeSearch.scope === 'unscoped'
    }),
    [routeSearch.projectId, routeSearch.repoRoot, routeSearch.scope]
  );
  const deferredQuery = useDeferredValue(query);
  const scopeQueryOptions = useMemo(
    () => ({
      search: deferredQuery.trim() || undefined,
      projectId: scope.projectId ?? undefined,
      repoRoot: scope.repoRoot ?? undefined,
      unscopedOnly: scope.unscopedOnly
    }),
    [deferredQuery, scope.projectId, scope.repoRoot, scope.unscopedOnly]
  );
  const boardResult = useQuery(backlogBoardQueryOptions(token, scopeQueryOptions));
  const orchestrationResult = useQuery(
    backlogOrchestrationQueryOptions(token, {
      projectId: scope.projectId ?? undefined,
      repoRoot: scope.repoRoot ?? undefined,
      unscopedOnly: scope.unscopedOnly
    })
  );
  const contractsResult = useQuery(backlogContractsQueryOptions(token));
  const decisionsResult = useQuery(
    backlogDecisionStreamQueryOptions(token, {
      limit: 80,
      projectId: scope.projectId ?? undefined,
      repoRoot: scope.repoRoot ?? undefined,
      unscopedOnly: scope.unscopedOnly
    })
  );
  const columns = boardResult.data?.columns ?? EMPTY_COLUMNS;
  const availableScopes = boardResult.data?.availableScopes ?? [];
  const contracts = contractsResult.data?.backlogUx ?? null;
  const deliveryContract = contractsResult.data?.deliveryEvidence ?? null;
  const decisions = decisionsResult.data ?? [];
  const loading =
    boardResult.isLoading ||
    orchestrationResult.isLoading ||
    contractsResult.isLoading ||
    decisionsResult.isLoading ||
    boardResult.isFetching ||
    orchestrationResult.isFetching ||
    contractsResult.isFetching ||
    decisionsResult.isFetching;
  const orchestration = useMemo<BacklogOrchestrationState>(() => {
    if (!orchestrationResult.data) {
      return DEFAULT_ORCHESTRATION_STATE;
    }
    const payload = orchestrationResult.data as typeof orchestrationResult.data & {
      dispatchPolicy?: {
        projectCaps?: Record<string, number>;
        projectPriorityBias?: Record<string, number>;
      };
    };
    return {
      enabled: payload.control.enabled,
      paused: payload.control.paused,
      maxParallel: payload.control.maxParallel,
      wipLimit: payload.control.wipLimit,
      queue: payload.queue,
      projectCaps: payload.dispatchPolicy?.projectCaps ?? {},
      projectPriorityBias: payload.dispatchPolicy?.projectPriorityBias ?? {}
    };
  }, [orchestrationResult.data]);

  useEffect(() => {
    const nextError = boardResult.error ?? orchestrationResult.error ?? contractsResult.error ?? decisionsResult.error;
    if (!nextError) {
      return;
    }
    setErrorBanner({
      itemId: null,
      message: nextError instanceof Error ? nextError.message : 'Failed to load backlog context.',
      reasonCode: 'load_failed',
      remediation: ['Retry refresh', 'Check gateway health and token authorization']
    });
  }, [boardResult.error, contractsResult.error, decisionsResult.error, orchestrationResult.error]);

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }
    const stillExists = Object.values(columns)
      .flat()
      .some((item) => item.id === selectedTaskId);
    if (!stillExists) {
      setSelectedTaskId(null);
    }
  }, [columns, selectedTaskId]);

  const setQuery = useCallback(
    (value: string) => {
      void navigate({
        search: (current) => ({
          ...current,
          query: value
        }),
        replace: true
      });
    },
    [navigate]
  );

  const setScope = useCallback(
    (value: BacklogProjectScopeRow) => {
      void navigate({
        search: (current) => ({
          ...current,
          scope: value.unscopedOnly ? 'unscoped' : undefined,
          projectId: value.unscopedOnly ? undefined : value.projectId ?? undefined,
          repoRoot: value.unscopedOnly ? undefined : value.repoRoot ?? undefined
        }),
        replace: true
      });
    },
    [navigate]
  );

  const setFilters = useCallback(
    (value: Set<BacklogState> | ((current: Set<BacklogState>) => Set<BacklogState>)) => {
      const nextStates = value instanceof Set ? value : value(new Set(filters));
      void navigate({
        search: (current) => ({
          ...current,
          states: Array.from(nextStates.values())
        }),
        replace: true
      });
    },
    [filters, navigate]
  );

  const load = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    setErrorBanner(null);
    await invalidateBacklogReadQueries(queryClient, token);
  }, [queryClient, token]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) {
      return null;
    }
    return Object.values(columns)
      .flat()
      .find((item) => item.id === selectedTaskId) ?? null;
  }, [columns, selectedTaskId]);

  const visibleColumns = useMemo(() => {
    const active = Array.from(filters.values()).filter((state) => COLUMN_ORDER.includes(state));
    return active.length > 0 ? COLUMN_ORDER.filter((state) => filters.has(state)) : ACTIVE_DEFAULT;
  }, [filters]);

  const projectOptions = useMemo<ProjectScopeOption[]>(() => {
    const aggregated = new Map<string, ProjectScopeOption>();
    for (const entry of availableScopes) {
      if (!entry.projectId) {
        continue;
      }
      const existing = aggregated.get(entry.projectId);
      const label = prettifyProjectLabel(entry.projectLabel ?? entry.projectId) ?? entry.projectId;
      if (existing) {
        existing.itemCount += entry.itemCount;
        existing.activeCount += entry.activeCount;
        existing.blockedCount += entry.blockedCount;
        continue;
      }
      aggregated.set(entry.projectId, {
        projectId: entry.projectId,
        label,
        itemCount: entry.itemCount,
        activeCount: entry.activeCount,
        blockedCount: entry.blockedCount
      });
    }
    return Array.from(aggregated.values()).sort((left, right) => right.itemCount - left.itemCount || left.label.localeCompare(right.label));
  }, [availableScopes]);

  const repoOptions = useMemo(
    () =>
      availableScopes
        .filter((entry) => entry.repoRoot)
        .filter((entry) => !scope.projectId || entry.projectId === scope.projectId)
        .sort((left, right) => right.itemCount - left.itemCount || left.label.localeCompare(right.label)),
    [availableScopes, scope.projectId]
  );

  const selectedProject = useMemo(
    () => (scope.projectId ? projectOptions.find((entry) => entry.projectId === scope.projectId) ?? null : null),
    [projectOptions, scope.projectId]
  );

  const selectedRepo = useMemo(
    () => (scope.repoRoot ? repoOptions.find((entry) => entry.repoRoot === scope.repoRoot) ?? null : null),
    [repoOptions, scope.repoRoot]
  );

  const unscopedSummary = useMemo(
    () => availableScopes.find((entry) => entry.projectId === null && entry.repoRoot === null) ?? null,
    [availableScopes]
  );

  const currentScopeLabel = useMemo(
    () => describeScope(scope, selectedProject, selectedRepo),
    [scope, selectedProject, selectedRepo]
  );

  const currentScopeCount = useMemo(() => {
    if (scope.unscopedOnly) {
      return unscopedSummary?.itemCount ?? 0;
    }
    if (selectedRepo) {
      return selectedRepo.itemCount;
    }
    if (selectedProject) {
      return selectedProject.itemCount;
    }
    return Object.values(columns).reduce((total, items) => total + items.length, 0);
  }, [columns, scope.unscopedOnly, selectedProject, selectedRepo, unscopedSummary]);

  const cleanupScopeCount = useMemo(() => {
    if (scope.unscopedOnly) {
      return unscopedSummary?.itemCount ?? 0;
    }
    if (selectedRepo) {
      return selectedRepo.itemCount;
    }
    if (selectedProject) {
      return selectedProject.itemCount;
    }
    return availableScopes.reduce((total, entry) => total + entry.itemCount, 0);
  }, [availableScopes, scope.unscopedOnly, selectedProject, selectedRepo, unscopedSummary]);

  const cleanupCopy = useMemo(() => {
    if (scope.unscopedOnly) {
      return {
        label: 'Clear unscoped backlog',
        title: 'unscoped backlog',
        payload: {
          all: false,
          projectId: null,
          repoRoot: null,
          unscopedOnly: true
        }
      };
    }
    if (scope.repoRoot) {
      return {
        label: 'Clear repo backlog',
        title: selectedRepo?.repoLabel ?? selectedRepo?.label ?? scope.repoRoot,
        payload: {
          all: false,
          projectId: scope.projectId,
          repoRoot: scope.repoRoot,
          unscopedOnly: false
        }
      };
    }
    if (scope.projectId) {
      return {
        label: 'Clear project backlog',
        title: selectedProject?.label ?? scope.projectId,
        payload: {
          all: false,
          projectId: scope.projectId,
          repoRoot: null,
          unscopedOnly: false
        }
      };
    }
    return {
      label: 'Clear all backlog',
      title: 'entire backlog',
      payload: {
        all: true,
        projectId: null,
        repoRoot: null,
        unscopedOnly: false
      }
    };
  }, [scope.projectId, scope.repoRoot, scope.unscopedOnly, selectedProject, selectedRepo]);
  const headerMetrics = useMemo<CardMetric[]>(
    () => [
      {
        id: 'backlog_scope_size',
        label: scope.unscopedOnly ? 'Unscoped Intake' : selectedRepo ? 'Repo Items' : selectedProject ? 'Project Items' : 'Scoped Items',
        value: currentScopeCount,
        displayValue: clampCount(currentScopeCount),
        tone: currentScopeCount > 0 ? 'neutral' : 'neutral'
      },
      {
        id: 'backlog_dispatch_queue',
        label: 'Dispatch Queue',
        value: orchestration.queue.planned,
        displayValue: clampCount(orchestration.queue.planned),
        tone: orchestration.queue.planned > 0 ? 'positive' : 'neutral'
      },
      {
        id: 'backlog_in_flight',
        label: 'In Flight',
        value: orchestration.queue.inFlight,
        displayValue: `${clampCount(orchestration.queue.inFlight)}/${clampCount(orchestration.wipLimit)}`,
        tone:
          orchestration.wipLimit > 0 && orchestration.queue.inFlight >= orchestration.wipLimit
            ? 'warn'
            : orchestration.queue.inFlight > 0
              ? 'positive'
              : 'neutral'
      },
      {
        id: 'backlog_blocked',
        label: 'Blocked',
        value: columns.blocked.length,
        displayValue: clampCount(columns.blocked.length),
        tone: columns.blocked.length > 0 ? 'critical' : 'neutral'
      }
    ],
    [
      columns.blocked.length,
      currentScopeCount,
      orchestration.queue.inFlight,
      orchestration.queue.planned,
      orchestration.wipLimit,
      scope.unscopedOnly,
      selectedProject,
      selectedRepo
    ]
  );

  useRouteHeaderMetrics(headerMetrics);

  const setAllScope = useCallback(() => {
    setScope(DEFAULT_SCOPE);
  }, [setScope]);

  const setUnscopedScope = useCallback(() => {
    setScope({
      projectId: null,
      repoRoot: null,
      unscopedOnly: true
    });
  }, [setScope]);

  const handleProjectScopeChange = useCallback(
    (projectId: string) => {
      if (!projectId) {
        setAllScope();
        return;
      }
      setScope({
        projectId,
        repoRoot: null,
        unscopedOnly: false
      });
    },
    [setAllScope]
  );

  const handleRepoScopeChange = useCallback(
    (repoRoot: string) => {
      if (!repoRoot) {
        if (scope.projectId) {
          handleProjectScopeChange(scope.projectId);
          return;
        }
        setAllScope();
        return;
      }
      const matched = availableScopes.find((entry) => entry.repoRoot === repoRoot) ?? null;
      setScope({
        projectId: matched?.projectId ?? scope.projectId,
        repoRoot,
        unscopedOnly: false
      });
    },
    [availableScopes, handleProjectScopeChange, scope.projectId, setAllScope]
  );

  const performTransition = useCallback(
    async (item: BacklogItemRow, toState: BacklogState, reason: string): Promise<void> => {
      if (!token) {
        setErrorBanner({
          itemId: item.id,
          message: 'Save API token in Settings first.',
          reasonCode: 'missing_token',
          remediation: ['Set a gateway token and retry']
        });
        return;
      }
      const matrix = allowedTransitions(contracts, item.state);
      if (matrix.length > 0 && !matrix.includes(toState)) {
        setErrorBanner({
          itemId: item.id,
          message: `Transition ${item.state} -> ${toState} is not allowed by contract.`,
          reasonCode: 'transition_not_allowed',
          remediation: ['Choose an allowed lane from the transition matrix', 'Use override dry-run for exceptional action']
        });
        return;
      }
      try {
        await transitionBacklogItem(token, item.id, { toState, reason });
        setErrorBanner(null);
        await load();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Transition failed.';
        const reasonCode = parseReasonCode(message);
        const taxonomy = (contracts?.blockedReasonTaxonomy ?? {}) as Record<
          string,
          { remediation?: string[] }
        >;
        const remediationCandidate = taxonomy[reasonCode]?.remediation;
        const remediation = Array.isArray(remediationCandidate)
          ? remediationCandidate
          : ['Retry action', 'Review task delivery evidence and dependencies'];
        setErrorBanner({
          itemId: item.id,
          message,
          reasonCode,
          remediation
        });
      }
    },
    [contracts, load, token]
  );

  const handleDrop = useCallback(
    async (item: BacklogItemRow, toState: BacklogState): Promise<void> => {
      setDragOverState(null);
      if (item.state === toState) {
        return;
      }
      await performTransition(item, toState, `drag_transition:${item.state}->${toState}`);
    },
    [performTransition]
  );

  const applyPreset = useCallback((states: BacklogState[]) => {
    setFilters(new Set(states));
  }, [setFilters]);

  const toggleStateFilter = useCallback((state: BacklogState) => {
    setFilters((current) => {
      const next = new Set(current);
      if (next.has(state)) {
        next.delete(state);
      } else {
        next.add(state);
      }
      if (next.size === 0) {
        ACTIVE_DEFAULT.forEach((value) => next.add(value));
      }
      return next;
    });
  }, [setFilters]);

  const runBacklogCleanup = useCallback(async (): Promise<void> => {
    if (cleanupBusy || !token) {
      return;
    }

    const visibleCountCopy =
      query.trim().length === 0
        ? `${cleanupScopeCount} item${cleanupScopeCount === 1 ? '' : 's'}`
        : 'all items in this scope';
    const confirmed = window.confirm(
      `Delete ${visibleCountCopy} from ${cleanupCopy.title}?\n\nThis permanently removes backlog items, transitions, dependencies, and delivery links in that scope. Search text does not limit the cleanup.`
    );
    if (!confirmed) {
      return;
    }

    setCleanupBusy(true);
    try {
      const result = await cleanupBacklog(token, cleanupCopy.payload);
      setSelectedTaskId(null);
      setErrorBanner(null);
      await load();
      toast.success(`Removed ${result.deleted} backlog item${result.deleted === 1 ? '' : 's'}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to clear backlog.';
      setErrorBanner({
        itemId: null,
        message,
        reasonCode: 'cleanup_failed',
        remediation: ['Retry cleanup', 'Check gateway authorization and backlog scope']
      });
    } finally {
      setCleanupBusy(false);
    }
  }, [cleanupBusy, cleanupCopy.payload, cleanupCopy.title, cleanupScopeCount, load, query, token]);

  return {
    columns,
    decisions,
    deliveryContract,
    dragOverState,
    errorBanner,
    filters,
    loading,
    orchestration,
    projectOptions,
    query,
    repoOptions,
    scope,
    selectedTask,
    setSelectedTaskId,
    visibleColumns,
    unscopedSummary,
    currentScopeCount,
    currentScopeLabel,
    cleanupBusy,
    cleanupCopy,
    cleanupScopeCount,
    handleDrop,
    handleProjectScopeChange,
    handleRepoScopeChange,
    load,
    performTransition,
    runBacklogCleanup,
    selectedProject,
    selectedRepo,
    setAllScope,
    setQuery,
    setUnscopedScope,
    setDragOverState,
    applyPreset,
    toggleStateFilter
  };
}

export function BacklogPage() {
  const token = useAppStore((state) => state.token);
  const {
    columns,
    decisions,
    deliveryContract,
    dragOverState,
    errorBanner,
    filters,
    loading,
    orchestration,
    projectOptions,
    query,
    repoOptions,
    scope,
    selectedTask,
    setSelectedTaskId,
    visibleColumns,
    unscopedSummary,
    currentScopeCount,
    currentScopeLabel,
    cleanupBusy,
    cleanupCopy,
    cleanupScopeCount,
    handleDrop,
    handleProjectScopeChange,
    handleRepoScopeChange,
    load,
    performTransition,
    runBacklogCleanup,
    setAllScope,
    setQuery,
    setUnscopedScope,
    setDragOverState,
    applyPreset,
    toggleStateFilter
  } = useBacklogPageController(token);

  return (
    <LazyMotion features={domAnimation}>
      <div className="flex h-full min-h-0 flex-col gap-6 md:gap-8">
        <BacklogPageHeader
          cleanupBusy={cleanupBusy}
          cleanupCopyLabel={cleanupCopy.label}
          cleanupScopeCount={cleanupScopeCount}
          errorBanner={errorBanner}
          filters={filters}
          loading={loading}
          orchestration={orchestration}
          projectOptions={projectOptions}
          query={query}
          repoOptions={repoOptions}
          scope={scope}
          currentScopeCount={currentScopeCount}
          currentScopeLabel={currentScopeLabel}
          unscopedSummary={unscopedSummary}
          onApplyPreset={applyPreset}
          onClearBacklog={() => void runBacklogCleanup()}
          onQueryChange={setQuery}
          onRefresh={() => void load()}
          onSelectAll={setAllScope}
          onSelectProject={handleProjectScopeChange}
          onSelectRepo={handleRepoScopeChange}
          onSelectUnscoped={setUnscopedScope}
          onTick={() => {
            void tickBacklogOrchestration(token).then(load);
          }}
          onToggleStateFilter={toggleStateFilter}
        />

        <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1fr_320px]">
          <div className="min-h-0 overflow-visible pb-4 md:overflow-x-auto">
            <div className="flex min-h-full flex-col items-stretch gap-4 md:inline-flex md:flex-row md:items-start md:pr-4">
              {visibleColumns.map((state) => (
                <BoardColumn
                  key={state}
                  state={state}
                  items={columns[state] ?? []}
                  dragOverState={dragOverState}
                  loading={loading}
                  onDragOverState={setDragOverState}
                  onDrop={handleDrop}
                  onSelect={setSelectedTaskId}
                  onTransition={performTransition}
                />
              ))}
            </div>
          </div>

          <InspectorPanel
            decisions={decisions}
            currentScopeLabel={currentScopeLabel}
            queue={orchestration.queue}
            paused={orchestration.paused}
            maxParallel={orchestration.maxParallel}
            wipLimit={orchestration.wipLimit}
            projectCaps={orchestration.projectCaps}
            projectPriorityBias={orchestration.projectPriorityBias}
            deliveryContract={deliveryContract}
          />
        </section>

        <BacklogTaskOverlay
          selectedTask={selectedTask}
          token={token}
          onClose={() => setSelectedTaskId(null)}
          onRefresh={load}
          onTransition={performTransition}
        />
      </div>
    </LazyMotion>
  );
}

function BacklogPageHeader({
  cleanupBusy,
  cleanupCopyLabel,
  cleanupScopeCount,
  currentScopeCount,
  currentScopeLabel,
  errorBanner,
  filters,
  loading,
  orchestration,
  projectOptions,
  query,
  repoOptions,
  scope,
  unscopedSummary,
  onApplyPreset,
  onClearBacklog,
  onQueryChange,
  onRefresh,
  onSelectAll,
  onSelectProject,
  onSelectRepo,
  onSelectUnscoped,
  onTick,
  onToggleStateFilter
}: {
  cleanupBusy: boolean;
  cleanupCopyLabel: string;
  cleanupScopeCount: number;
  currentScopeCount: number;
  currentScopeLabel: string;
  errorBanner: BacklogErrorBanner;
  filters: Set<BacklogState>;
  loading: boolean;
  orchestration: BacklogOrchestrationState;
  projectOptions: ProjectScopeOption[];
  query: string;
  repoOptions: BacklogScopeSummaryRow[];
  scope: BacklogProjectScopeRow;
  unscopedSummary: BacklogScopeSummaryRow | null;
  onApplyPreset: (states: BacklogState[]) => void;
  onClearBacklog: () => void;
  onQueryChange: (value: string) => void;
  onRefresh: () => void;
  onSelectAll: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectRepo: (repoRoot: string) => void;
  onSelectUnscoped: () => void;
  onTick: () => void;
  onToggleStateFilter: (state: BacklogState) => void;
}) {
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] p-2 text-[var(--shell-accent)]">
            <Kanban size={18} weight="bold" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100 md:text-3xl">Backlog</h1>
            <p className="max-w-2xl text-sm text-slate-400">Track intake, dispatch, and verification without keeping every filter open at once.</p>
          </div>
        </div>

        <div className="shell-panel-soft flex flex-wrap items-center justify-end gap-2 rounded-2xl p-2">
          <div className="px-3 text-[10px] uppercase tracking-[0.16em] text-slate-400">
            Queue {orchestration.queue.inFlight}/{orchestration.wipLimit}
          </div>
          <button
            onClick={onClearBacklog}
            disabled={cleanupBusy || cleanupScopeCount === 0}
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-rose-100 transition hover:border-rose-400/40 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
            title={cleanupCopyLabel}
          >
            <span className="inline-flex items-center gap-2">
              <Trash size={14} weight="bold" />
              {cleanupBusy ? 'Clearing…' : cleanupCopyLabel}
            </span>
          </button>
          <button onClick={onTick} className="shell-button-accent rounded-xl p-2 transition" title="Tick orchestrator">
            <Lightning size={16} weight="fill" />
          </button>
          <button onClick={onRefresh} className="shell-button-ghost rounded-xl p-2 text-slate-300 transition" title="Refresh">
            <ArrowsClockwise size={16} weight="bold" />
          </button>
        </div>
      </div>

      <PageDisclosure
        title="Filters and scope"
        description="Open presets, state filters, and scope controls only when you need to narrow the board."
        defaultOpen={Boolean(query) || !filters.has('idea') || scope.unscopedOnly || Boolean(scope.projectId) || Boolean(scope.repoRoot)}
        action={
          <span className="shell-chip px-3 py-1 text-[0.72rem]">{query ? 'Filtering active' : 'Optional'}</span>
        }
      >
        <div className="space-y-4">
          <div className="shell-panel-soft flex items-center gap-2 rounded-xl px-3 py-1.5">
            <MagnifyingGlass size={14} className="text-slate-500" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={`Filter ${scope.unscopedOnly ? 'unscoped work' : 'board'}`}
              className="w-full min-w-0 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {FILTER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onApplyPreset(preset.states)}
                className="shell-button-ghost rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300 transition"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {COLUMN_ORDER.map((state) => (
              <button
                key={state}
                onClick={() => onToggleStateFilter(state)}
                className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition ${
                  filters.has(state)
                    ? 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]'
                    : 'shell-button-ghost text-slate-400'
                }`}
              >
                {COLUMN_META[state].label}
              </button>
            ))}
          </div>

          <ScopeFilterBar
            scope={scope}
            currentScopeLabel={currentScopeLabel}
            currentScopeCount={currentScopeCount}
            loading={loading}
            projectOptions={projectOptions}
            repoOptions={repoOptions}
            unscopedSummary={unscopedSummary}
            onSelectAll={onSelectAll}
            onSelectProject={onSelectProject}
            onSelectRepo={onSelectRepo}
            onSelectUnscoped={onSelectUnscoped}
          />
        </div>
      </PageDisclosure>

      {errorBanner ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <div className="flex items-start gap-2">
            <WarningCircle size={16} className="mt-0.5 text-rose-300" weight="fill" />
            <div className="space-y-1">
              <div className="font-semibold">{errorBanner.message}</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-rose-300/80">Reason: {errorBanner.reasonCode}</div>
              {errorBanner.remediation.length > 0 ? (
                <div className="text-xs text-rose-100/90">{errorBanner.remediation.join(' | ')}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function BacklogTaskOverlay({
  selectedTask,
  token,
  onClose,
  onRefresh,
  onTransition
}: {
  selectedTask: BacklogItemRow | null;
  token: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onTransition: (item: BacklogItemRow, toState: BacklogState, reason: string) => Promise<void>;
}) {
  return (
    <AnimatePresence>
      {selectedTask ? (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm"
          />
          <m.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 210, damping: 26 }}
            className="fixed inset-y-0 right-0 z-[121] flex w-full max-w-xl flex-col overflow-hidden border-l border-white/10 bg-[color:var(--shell-bg)]"
          >
            <TaskDetailPanel
              task={selectedTask}
              token={token}
              onClose={onClose}
              onRefresh={onRefresh}
              onTransition={onTransition}
            />
          </m.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function ScopeFilterBar({
  scope,
  currentScopeLabel,
  currentScopeCount,
  loading,
  projectOptions,
  repoOptions,
  unscopedSummary,
  onSelectAll,
  onSelectProject,
  onSelectRepo,
  onSelectUnscoped
}: {
  scope: BacklogProjectScopeRow;
  currentScopeLabel: string;
  currentScopeCount: number;
  loading: boolean;
  projectOptions: ProjectScopeOption[];
  repoOptions: BacklogScopeSummaryRow[];
  unscopedSummary: BacklogScopeSummaryRow | null;
  onSelectAll: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectRepo: (repoRoot: string) => void;
  onSelectUnscoped: () => void;
}) {
  const allActive = !scope.unscopedOnly && !scope.projectId && !scope.repoRoot;
  const unscopedActive = scope.unscopedOnly;

  return (
    <m.section
      layout
      className="shell-panel rounded-[1.75rem] p-4"
    >
      <div className="relative flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Scope Lens</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-slate-100">{currentScopeLabel}</h2>
              <span className="rounded-full border border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--shell-accent)]">
                {currentScopeCount} items
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Shift between global flow, repo-root execution, and unscoped intake without losing board context.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
            <ScopeStatChip label="Projects" value={projectOptions.length} />
            <ScopeStatChip label="Repos" value={repoOptions.length} />
            <ScopeStatChip label="Unscoped" value={unscopedSummary?.itemCount ?? 0} tone="text-amber-200 border-amber-500/20 bg-amber-500/10" />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onSelectAll}
              className={`rounded-2xl border px-3 py-2 text-xs transition active:translate-y-px ${
                allActive
                  ? 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]'
                  : 'shell-button-ghost text-slate-300 hover:text-slate-100'
              }`}
            >
              All scopes
            </button>
            <button
              onClick={onSelectUnscoped}
              className={`rounded-2xl border px-3 py-2 text-xs transition active:translate-y-px ${
                unscopedActive
                  ? 'border-amber-500/40 bg-amber-500/12 text-amber-100'
                  : 'shell-button-ghost text-slate-300 hover:text-slate-100'
              }`}
            >
              Unscoped
              <span className="ml-2 text-[10px] text-slate-400">{unscopedSummary?.itemCount ?? 0}</span>
            </button>
          </div>

          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Project</span>
            <select
              value={scope.unscopedOnly ? '' : scope.projectId ?? ''}
              onChange={(event) => onSelectProject(event.target.value)}
              className="shell-field min-w-0 rounded-2xl px-3 py-2.5 text-sm transition hover:border-slate-500"
            >
              <option value="">All projects</option>
              {projectOptions.map((option, index) => (
                <option key={buildIndexedKey('backlog-project', option.projectId, index)} value={option.projectId}>
                  {option.label} ({option.itemCount})
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Repository Root</span>
            <select
              value={scope.unscopedOnly ? '' : scope.repoRoot ?? ''}
              onChange={(event) => onSelectRepo(event.target.value)}
              className="shell-field min-w-0 rounded-2xl px-3 py-2.5 text-sm transition hover:border-slate-500"
            >
              <option value="">{scope.projectId ? 'All repos in project' : 'All repo roots'}</option>
              {repoOptions.map((option, index) => (
                <option key={buildIndexedKey('backlog-repo', option.repoRoot ?? option.label, index)} value={option.repoRoot ?? ''}>
                  {option.repoLabel ?? option.label} ({option.itemCount})
                </option>
              ))}
            </select>
          </label>

          <div className="shell-panel-soft rounded-2xl px-4 py-3 text-xs text-slate-400">
            {loading ? (
              <div className="space-y-2">
                <div className="h-2.5 w-32 animate-pulse rounded-full bg-slate-800" />
                <div className="h-2.5 w-52 animate-pulse rounded-full bg-slate-900" />
              </div>
            ) : scope.unscopedOnly ? (
              <p>These items predate scoped intake or were captured without repo context. They remain fully actionable.</p>
            ) : scope.repoRoot ? (
              <p>Repo-level filtering drives both the board and orchestration inspector, so queue pressure reflects this root only.</p>
            ) : scope.projectId ? (
              <p>Project mode aggregates all repo roots mapped to this project id and keeps shared orchestration pressure visible.</p>
            ) : (
              <p>Global mode shows the full backlog surface and exposes cross-project saturation at a glance.</p>
            )}
          </div>
        </div>
      </div>
    </m.section>
  );
}

function ScopeStatChip({
  label,
  value,
  tone = 'shell-panel-soft text-slate-200'
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className={`rounded-full border px-3 py-1.5 ${tone}`}>
      <span className="uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <span className="ml-2 font-medium text-slate-100">{value}</span>
    </div>
  );
}

const BoardColumn = memo(function BoardColumn({
  state,
  items,
  dragOverState,
  loading,
  onDragOverState,
  onDrop,
  onSelect,
  onTransition
}: {
  state: BacklogState;
  items: BacklogItemRow[];
  dragOverState: BacklogState | null;
  loading: boolean;
  onDragOverState: (state: BacklogState | null) => void;
  onDrop: (item: BacklogItemRow, toState: BacklogState) => Promise<void>;
  onSelect: (id: string) => void;
  onTransition: (item: BacklogItemRow, toState: BacklogState, reason: string) => Promise<void>;
}) {
  const meta = COLUMN_META[state];
  const Icon = meta.icon as React.ElementType;
  const parseDraggedItem = (raw: string): { id: string; state: BacklogState } | null => {
    try {
      return JSON.parse(raw) as { id: string; state: BacklogState };
    } catch {
      return null;
    }
  };

  return (
    <div
      onDragOver={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        onDragOverState(state);
      }}
      onDragLeave={() => onDragOverState(null)}
      onDrop={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        onDragOverState(null);
        const raw = event.dataTransfer.getData('application/x-backlog-item');
        if (!raw) {
          return;
        }
        const parsed = parseDraggedItem(raw);
        if (!parsed) {
          return;
        }
        const found = items.find((item) => item.id === parsed.id);
        const sourceItem = found ?? ({ id: parsed.id, state: parsed.state } as BacklogItemRow);
        if (sourceItem.id && sourceItem.state !== state) {
          void onDrop(sourceItem, state);
        }
      }}
      className={`w-full rounded-3xl p-3 md:w-[320px] md:shrink-0 ${
        dragOverState === state
          ? 'shell-panel-soft glow-border-primary bg-[color:var(--shell-accent-soft)]'
          : 'shell-panel-soft'
      }`}
    >
      <header className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="shell-panel-muted rounded-lg p-1.5">
            <Icon size={13} className="text-slate-300" weight="bold" />
          </div>
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.18em] text-slate-200">{meta.label}</h3>
            <p className="text-[10px] text-slate-500">{items.length} items</p>
          </div>
        </div>
        <div className={`h-2 w-2 rounded-full ${meta.dot}`} />
      </header>

      <div className="min-h-[340px] space-y-3">
        {items.map((item) => (
          <TaskCard
            key={item.id}
            item={item}
            onSelect={onSelect}
            onTransition={onTransition}
          />
        ))}

        {items.length === 0 && (
          <div className="shell-panel-soft rounded-2xl border-dashed px-4 py-10 text-center text-slate-500">
            {loading ? <ArrowsClockwise className="mx-auto animate-spin" size={18} /> : <Ghost className="mx-auto" size={18} />}
            <p className="mt-2 text-[10px] uppercase tracking-[0.2em]">Queue Clear</p>
          </div>
        )}
      </div>
    </div>
  );
});

function TaskCard({
  item,
  onSelect,
  onTransition
}: {
  item: BacklogItemRow;
  onSelect: (id: string) => void;
  onTransition: (item: BacklogItemRow, toState: BacklogState, reason: string) => Promise<void>;
}) {
  const evidence = resolveEvidenceChip(item);
  const unresolvedDeps = item.unresolvedDependencies?.length ?? 0;
  const projectLabel = prettifyProjectLabel(item.projectId);
  const repoLabel = resolveRepoLabel(item.repoRoot, item.metadata);
  return (
    <article
      draggable
      onDragStart={(event: DragEvent<HTMLElement>) => {
        event.dataTransfer.setData('application/x-backlog-item', JSON.stringify({ id: item.id, state: item.state }));
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          const index = COLUMN_ORDER.indexOf(item.state);
          const nextIndex = event.key === 'ArrowRight' ? index + 1 : index - 1;
          const next = COLUMN_ORDER[nextIndex];
          if (next) {
            event.preventDefault();
            void onTransition(item, next, `keyboard_transition:${item.state}->${next}`);
          }
        }
      }}
      tabIndex={0}
      className="shell-panel-soft group cursor-pointer rounded-2xl p-4 outline-none transition hover:border-[color:var(--shell-accent-border)] focus:border-[color:var(--shell-accent-border)]"
      onClick={() => onSelect(item.id)}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="shell-panel-muted rounded-md px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-slate-400">
          {item.id.slice(0, 8)}
        </div>
        <button
          onClick={(event) => {
            event.stopPropagation();
            const index = COLUMN_ORDER.indexOf(item.state);
            const next = COLUMN_ORDER[Math.min(index + 1, COLUMN_ORDER.length - 1)];
            if (next && next !== item.state) {
              void onTransition(item, next, `quick_transition:${item.state}->${next}`);
            }
          }}
          className="shell-button-ghost rounded-lg p-1.5 text-slate-300 transition hover:border-[color:var(--shell-accent-border)] hover:text-[var(--shell-accent)]"
        >
          <CaretRight size={12} weight="bold" />
        </button>
      </div>
      <h4 className="line-clamp-2 text-sm font-semibold text-slate-100">{item.title}</h4>
      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{item.description}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {projectLabel && (
          <span className="shell-chip rounded-full px-2 py-0.5 text-[10px] text-slate-300">
            {projectLabel}
          </span>
        )}
        {repoLabel && (
          <span className="shell-chip shell-chip-accent rounded-full px-2 py-0.5 text-[10px] text-[var(--shell-accent)]">
            {repoLabel}
          </span>
        )}
        {unresolvedDeps > 0 && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
            deps:{unresolvedDeps}
          </span>
        )}
        {evidence && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${evidence.tone}`}>{evidence.label}</span>
        )}
        {item.execution?.runStatus === 'running' && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
            Streaming
          </span>
        )}
      </div>
    </article>
  );
}

function InspectorPanel({
  decisions,
  currentScopeLabel,
  queue,
  paused,
  maxParallel,
  wipLimit,
  projectCaps,
  projectPriorityBias,
  deliveryContract
}: {
  decisions: BacklogDecisionStreamRow[];
  currentScopeLabel: string;
  queue: { planned: number; inFlight: number };
  paused: boolean;
  maxParallel: number;
  wipLimit: number;
  projectCaps: Record<string, number>;
  projectPriorityBias: Record<string, number>;
  deliveryContract: Record<string, unknown> | null;
}) {
  const topDecisions = decisions.slice(0, 8);
  return (
    <aside className="shell-panel flex min-h-0 flex-col gap-3 rounded-3xl p-4">
      <div className="shell-panel-soft rounded-2xl p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Orchestration Inspector</h3>
          <span className="rounded-full border border-slate-700 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-slate-300">
            {currentScopeLabel}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-200">
          <div>Mode: {paused ? 'Paused' : 'Active'}</div>
          <div>Parallel: {queue.inFlight}/{maxParallel}</div>
          <div>Planned: {queue.planned}</div>
          <div>WIP cap: {wipLimit}</div>
        </div>
      </div>

      <div className="shell-panel-soft rounded-2xl p-3">
        <h4 className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Decision Stream</h4>
        <div className="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
          {topDecisions.map((entry) => (
            <div key={entry.id} className="shell-panel-muted rounded-xl p-2 text-xs">
              <div className="flex items-center justify-between gap-2 text-slate-200">
                <span>{entry.action}</span>
                <span className="text-[10px] uppercase text-slate-500">{entry.decision}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">reason: {entry.reasonCode}</div>
            </div>
          ))}
          {topDecisions.length === 0 && <div className="text-xs text-slate-500">No decisions yet.</div>}
        </div>
      </div>

      <div className="shell-panel-soft rounded-2xl p-3 text-xs text-slate-300">
        <h4 className="mb-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">Project Caps</h4>
        <div className="space-y-1">
          {Object.keys(projectCaps).length === 0 ? (
            <p className="text-slate-500">No project caps set.</p>
          ) : (
            Object.entries(projectCaps).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="truncate pr-2">{key}</span>
                <span>{value}</span>
              </div>
            ))
          )}
        </div>
        <h4 className="mb-1 mt-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">Priority Bias</h4>
        <div className="space-y-1">
          {Object.keys(projectPriorityBias).length === 0 ? (
            <p className="text-slate-500">No biases configured.</p>
          ) : (
            Object.entries(projectPriorityBias).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="truncate pr-2">{key}</span>
                <span>{value}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {deliveryContract && (
        <div className="shell-panel-soft rounded-2xl p-3 text-xs text-slate-300">
          <h4 className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-400">Evidence Contract</h4>
          <p className="text-slate-400">States gated by evidence: review, done, archived.</p>
          <p className="mt-1 text-slate-500">Truth labels enforce real-delivery vs workspace-only clarity.</p>
        </div>
      )}
    </aside>
  );
}

function TaskDetailPanel({
  task,
  token,
  onClose,
  onRefresh,
  onTransition
}: {
  task: BacklogItemRow;
  token: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onTransition: (item: BacklogItemRow, toState: BacklogState, reason: string) => Promise<void>;
}) {
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const runOverride = useCallback(
    async (action: 'block' | 'requeue' | 'close' | 'force_delegate') => {
      setOverrideBusy(true);
      setOverrideError(null);
      try {
        const preview = await overrideBacklogItem(token, {
          itemId: task.id,
          action,
          targetAgentId: task.assignedAgentId ?? 'software-engineer',
          dryRun: true,
          reason: `preview:${action}`
        });
        const previewPayload = preview.preview as { allowed?: boolean; reasonCode?: string; transition?: { to?: string | null } };
        if (!previewPayload?.allowed) {
          throw new Error(`Override preview blocked (${previewPayload?.reasonCode ?? 'unknown'}).`);
        }
        const toState = previewPayload.transition?.to ? String(previewPayload.transition.to) : null;
        const confirmed = window.confirm(
          `Apply override ${action}${toState ? ` -> ${toState}` : ''}?\nThis will be audited with actor=dashboard.`
        );
        if (!confirmed) {
          setOverrideBusy(false);
          return;
        }
        await overrideBacklogItem(token, {
          itemId: task.id,
          action,
          targetAgentId: task.assignedAgentId ?? 'software-engineer',
          reason: `dashboard_override:${action}`
        });
        await onRefresh();
      } catch (error) {
        setOverrideError(error instanceof Error ? error.message : 'Override failed.');
      } finally {
        setOverrideBusy(false);
      }
    },
    [onRefresh, task.assignedAgentId, task.id, token]
  );

  const runDelete = useCallback(async (): Promise<void> => {
    if (deleteBusy) {
      return;
    }
    const confirmed = window.confirm(
      `Delete backlog item "${task.title}"?\n\nThis permanently removes the task and its related transitions, dependencies, and delivery links.`
    );
    if (!confirmed) {
      return;
    }
    setDeleteBusy(true);
    setOverrideError(null);
    try {
      await deleteBacklogItem(token, task.id);
      toast.success('Backlog item deleted.');
      onClose();
      await onRefresh();
    } catch (error) {
      setOverrideError(error instanceof Error ? error.message : 'Delete failed.');
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, onClose, onRefresh, task.id, task.title, token]);

  const nextStates = COLUMN_ORDER.filter((state) => state !== task.state);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between border-b border-white/10 p-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Task Intelligence</h2>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{task.id}</p>
        </div>
        <button onClick={onClose} className="shell-button-ghost rounded-xl p-2 text-slate-400 hover:text-slate-100">
          <X size={18} />
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-auto p-6">
        <section className="shell-panel-soft rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.16em] text-slate-500">State</span>
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-200">{task.state}</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-100">{task.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{task.description}</p>
        </section>

        {task.delivery?.repoConnectionId && (
          <GithubDeliveryCockpit
            task={task}
            token={token}
            onRefresh={onRefresh}
          />
        )}

        <section className="shell-panel-soft rounded-2xl p-4">
          <h4 className="mb-3 text-xs uppercase tracking-[0.16em] text-slate-500">Scope</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="shell-panel-muted rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Project</div>
              <div className="mt-1 text-sm text-slate-100">{prettifyProjectLabel(task.projectId) ?? 'Unscoped'}</div>
            </div>
            <div className="shell-panel-muted rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Repository</div>
              <div className="mt-1 break-all text-sm text-slate-100">{resolveRepoLabel(task.repoRoot, task.metadata) ?? 'No repo root linked yet'}</div>
            </div>
          </div>
        </section>

        <section className="shell-panel-soft rounded-2xl p-4">
          <h4 className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Quick Transition</h4>
          <div className="flex flex-wrap gap-2">
            {nextStates.map((state) => (
              <button
                key={state}
                onClick={() => {
                  void onTransition(task, state, `detail_transition:${task.state}->${state}`);
                }}
                className="shell-button-ghost rounded-xl px-3 py-1.5 text-xs text-slate-200 hover:border-[color:var(--shell-accent-border)]"
              >
                {state}
              </button>
            ))}
          </div>
        </section>

        <section className="shell-panel-soft rounded-2xl p-4">
          <h4 className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Override Controls</h4>
          <p className="mb-3 text-xs text-slate-400">
            Each action runs a dry-run preview first, then asks confirmation before mutation.
          </p>
          <div className="flex flex-wrap gap-2">
            {(['block', 'requeue', 'close', 'force_delegate'] as const).map((action) => (
              <button
                key={action}
                disabled={overrideBusy}
                onClick={() => {
                  void runOverride(action);
                }}
                className="shell-button-ghost rounded-xl px-3 py-1.5 text-xs text-slate-200 hover:border-[color:var(--shell-accent-border)] disabled:opacity-60"
              >
                {action}
              </button>
            ))}
          </div>
          {overrideError && <p className="mt-3 text-xs text-rose-300">{overrideError}</p>}
        </section>

        <section className="shell-panel-soft rounded-2xl p-4">
          <h4 className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Danger Zone</h4>
          <p className="mb-3 text-xs text-slate-400">
            Use hard delete only when this task should be removed entirely, not just closed or archived.
          </p>
          <button
            type="button"
            disabled={deleteBusy}
            onClick={() => {
              void runDelete();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-60"
          >
            <Trash size={13} weight="bold" />
            {deleteBusy ? 'Deleting…' : 'Delete Task'}
          </button>
        </section>

        <section className="shell-panel-soft rounded-2xl p-4">
          <div className="mb-2 flex items-center gap-2">
            <Stack size={16} className="text-slate-500" />
            <h4 className="text-xs uppercase tracking-[0.16em] text-slate-500">Transition Log</h4>
          </div>
          <div className="space-y-2">
            {task.transitions.map((transition) => (
              <div key={transition.id} className="shell-panel-muted rounded-xl p-3 text-xs text-slate-300">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-200">
                    {transition.fromState ?? 'start'} {'->'} {transition.toState}
                  </span>
                  <span className="text-slate-500">{new Date(transition.createdAt).toLocaleTimeString()}</span>
                </div>
                <p className="mt-1 text-slate-400">{transition.reason}</p>
              </div>
            ))}
            {task.transitions.length === 0 && <p className="text-xs text-slate-500">No transitions recorded yet.</p>}
          </div>
        </section>
      </div>

      <footer className="shell-panel-muted border-t border-white/10 p-4 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-emerald-400" weight="fill" />
          Operator overrides are audited with before/after transition metadata.
        </div>
      </footer>
    </div>
  );
}
