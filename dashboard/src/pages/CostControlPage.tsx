import {
  CurrencyDollarSimple,
  FloppyDisk,
  Lightning,
  Plus,
  X,
  Info,
  Trash,
  ChartBar,
  Database,
  Cpu
} from '@phosphor-icons/react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { saveLlmLimits } from '../app/api';
import {
  agentProfilesQueryOptions,
  invalidateLlmReadQueries,
  llmCostsQueryOptions,
  llmLimitsQueryOptions,
  runsQueryOptions,
  sessionsQueryOptions
} from '../app/queryOptions';
import { useAppStore } from '../app/store';
import type {
  LlmFallbackTarget,
  LlmLimitsState,
  LlmCostsState,
  LlmModelRegistryState,
  LlmOnboardingState,
  LlmValidationState,
  SessionRow,
  RunRow,
  AgentProfileRow
} from '../app/types';
import { PageIntro } from '../components/ops/PageHeader';
import { buildIndexedKey } from '../lib/listKeys';

const RUNTIMES = ['codex', 'claude', 'gemini', 'process'] as const;
const RUNTIME_LABELS: Record<string, string> = {
  codex: 'Technical / Code',
  claude: 'Creative / Writing',
  gemini: 'Multimodal / Flash',
  process: 'Standard Automation'
};

const FALLBACK_MODEL_PRESETS: Record<(typeof RUNTIMES)[number], string[]> = {
  codex: [
    'gemini-pro-latest',
    'gemini-flash-lite-latest',
    'openrouter/openai/gpt-5-mini',
    'openrouter/openrouter/free',
    'gemini-3-flash-preview',
    'openrouter/minimax/minimax-m2.5',
    'gemini-3.1-pro-preview',
    'gemini-2.5-flash-lite',
    'default'
  ],
  claude: [
    'gemini-pro-latest',
    'gemini-flash-lite-latest',
    'openrouter/openai/gpt-5-mini',
    'openrouter/openrouter/free',
    'gemini-3-flash-preview',
    'openrouter/minimax/minimax-m2.5',
    'gemini-3.1-pro-preview',
    'gemini-2.5-flash-lite',
    'default'
  ],
  gemini: [
    'gemini-pro-latest',
    'gemini-flash-lite-latest',
    'openrouter/openai/gpt-5-mini',
    'openrouter/openrouter/free',
    'gemini-3-flash-preview',
    'openrouter/minimax/minimax-m2.5',
    'gemini-3.1-pro-preview',
    'gemini-2.5-flash-lite',
    'default'
  ],
  process: [
    'gemini-pro-latest',
    'gemini-flash-lite-latest',
    'openrouter/openai/gpt-5-mini',
    'openrouter/openrouter/free',
    'gemini-3-flash-preview',
    'openrouter/minimax/minimax-m2.5',
    'gemini-3.1-pro-preview',
    'gemini-2.5-flash-lite',
    'default'
  ]
};

type RoutingRuntime = (typeof RUNTIMES)[number];

function parseRoutingRuntime(value: string): RoutingRuntime {
  switch (value) {
    case 'codex':
      return 'codex';
    case 'claude':
      return 'claude';
    case 'gemini':
      return 'gemini';
    default:
      return 'process';
  }
}

function localDayFromOffset(daysFromTodayLocal: number): string {
  const current = new Date();
  const localDate = new Date(current.getFullYear(), current.getMonth(), current.getDate() + daysFromTodayLocal);
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type ProviderBudgetStatus = {
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
};

type LlmActivityEvent = LlmCostsState['recentEvents'][number] & {
  taskType: string;
  run?: RunRow;
  session?: SessionRow;
  agent?: AgentProfileRow;
  metadata: Record<string, unknown>;
};

type CostControlPageState = {
  limits: LlmLimitsState | null;
  registry: LlmModelRegistryState | null;
  validation: LlmValidationState | null;
  saving: boolean;
  error: string;
  status: string;
  onboarding: LlmOnboardingState | null;
  costs: LlmCostsState | null;
  providerBudgetStatus: ProviderBudgetStatus[];
  routingCapturedAt: string;
  routingHistory: string[];
  activitySinceTs: string | null;
  costWindowDay: string;
  showAdvanced: boolean;
  activeTab: 'routing' | 'budgets' | 'activity';
  activityTaskType: string;
};

type CostControlPageAction =
  | { type: 'patch'; patch: Partial<CostControlPageState> }
  | { type: 'update_limits'; updater: (current: LlmLimitsState | null) => LlmLimitsState | null }
  | { type: 'record_capture'; capturedAt: string };

const INITIAL_COST_CONTROL_PAGE_STATE: CostControlPageState = {
  limits: null,
  registry: null,
  validation: null,
  saving: false,
  error: '',
  status: '',
  onboarding: null,
  costs: null,
  providerBudgetStatus: [],
  routingCapturedAt: '',
  routingHistory: [],
  activitySinceTs: null,
  costWindowDay: localDayFromOffset(0),
  showAdvanced: false,
  activeTab: 'routing',
  activityTaskType: 'all'
};

function costControlPageReducer(state: CostControlPageState, action: CostControlPageAction): CostControlPageState {
  switch (action.type) {
    case 'patch':
      return {
        ...state,
        ...action.patch
      };
    case 'update_limits':
      return {
        ...state,
        limits: action.updater(state.limits)
      };
    case 'record_capture':
      return {
        ...state,
        routingCapturedAt: action.capturedAt,
        routingHistory: [action.capturedAt, ...state.routingHistory].slice(0, 8)
      };
    default:
      return state;
  }
}

function useCostControlPageModel() {
  const token = useAppStore((state) => state.token);
  const queryClient = useQueryClient();
  const [pageState, dispatchPageState] = useReducer(costControlPageReducer, INITIAL_COST_CONTROL_PAGE_STATE);
  const {
    limits,
    registry,
    validation,
    saving,
    error,
    status,
    onboarding,
    costs,
    providerBudgetStatus,
    routingCapturedAt,
    routingHistory,
    activitySinceTs,
    costWindowDay,
    showAdvanced,
    activeTab,
    activityTaskType
  } = pageState;
  const saveRequestRef = useRef(0);
  const syncedLimitsRef = useRef<string | null>(null);
  const costsQueryWindow = useMemo(
    () => ({
      day: costWindowDay,
      month: costWindowDay.slice(0, 7),
      tzOffsetMinutes: new Date().getTimezoneOffset()
    }),
    [costWindowDay]
  );
  const sessions = useQuery(sessionsQueryOptions(token)).data ?? [];
  const runs = useQuery(runsQueryOptions(token)).data ?? [];
  const agentProfiles = useQuery(agentProfilesQueryOptions(token)).data ?? [];
  const limitsResult = useQuery(llmLimitsQueryOptions(token));
  const costsResult = useQuery(llmCostsQueryOptions(token, costsQueryWindow));
  const loading = limitsResult.isLoading || costsResult.isLoading;

  const patchPageState = useCallback((patch: Partial<CostControlPageState>) => {
    dispatchPageState({ type: 'patch', patch });
  }, []);

  const updateLimits = useCallback(
    (updater: LlmLimitsState | null | ((current: LlmLimitsState | null) => LlmLimitsState | null)) => {
      dispatchPageState({
        type: 'update_limits',
        updater: typeof updater === 'function' ? updater : () => updater
      });
    },
    []
  );

  const recordCapture = useCallback((capturedAt: string) => {
    dispatchPageState({ type: 'record_capture', capturedAt });
  }, []);

  useEffect(() => {
    if (!limitsResult.data) {
      return;
    }
    const next = limitsResult.data;
    const currentDraftSignature = limits ? JSON.stringify(limits) : null;
    syncedLimitsRef.current = JSON.stringify(next.limits);
    patchPageState({
      limits: limits === null || currentDraftSignature === syncedLimitsRef.current ? next.limits : limits,
      registry: next.registry,
      validation: next.validation,
      onboarding: next.onboarding
    });
  }, [limits, limitsResult.data, patchPageState]);

  useEffect(() => {
    if (!costsResult.data) {
      return;
    }
    const next = costsResult.data;
    const capturedAt = new Date().toISOString();
    patchPageState({
      costs: next.costs,
      providerBudgetStatus: next.providerBudgetStatus,
      costWindowDay: next.window.dayUtc !== costWindowDay ? next.window.dayUtc : costWindowDay,
      activitySinceTs: next.window.dayUtc !== costWindowDay ? null : activitySinceTs,
      activityTaskType: next.window.dayUtc !== costWindowDay ? 'all' : activityTaskType,
      error: ''
    });
    recordCapture(capturedAt);
  }, [activitySinceTs, activityTaskType, costWindowDay, costsResult.data, patchPageState, recordCapture]);

  useEffect(() => {
    if (!limitsResult.error && !costsResult.error) {
      return;
    }
    const nextError = limitsResult.error ?? costsResult.error;
    patchPageState({
      error: nextError instanceof Error ? nextError.message : 'Failed to load telemetry.'
    });
  }, [costsResult.error, limitsResult.error, patchPageState]);

  const load = useCallback(async (): Promise<void> => {
    patchPageState({
      error: '',
      status: ''
    });
    await Promise.all([limitsResult.refetch(), costsResult.refetch()]);
  }, [costsResult, limitsResult, patchPageState]);

  const persistLimits = useCallback(
    (nextLimits: LlmLimitsState, mode: 'manual' | 'localHarness'): void => {
      const requestId = saveRequestRef.current + 1;
      saveRequestRef.current = requestId;
      const pendingStatus = mode === 'localHarness' ? 'Syncing local harness policy...' : 'Committing policy...';
      const successStatus = mode === 'localHarness' ? 'Local harness policy synchronized.' : 'Policy synchronized.';

      patchPageState({
        saving: true,
        error: '',
        status: pendingStatus
      });
      saveLlmLimits(token, nextLimits)
        .then(async () => {
          if (saveRequestRef.current !== requestId) {
            return;
          }
          syncedLimitsRef.current = JSON.stringify(nextLimits);
          patchPageState({ status: successStatus });
          await invalidateLlmReadQueries(queryClient, token);
          setTimeout(() => {
            if (saveRequestRef.current === requestId) {
              patchPageState({ status: '' });
            }
          }, 3000);
        })
        .catch((err) => {
          if (saveRequestRef.current !== requestId) {
            return;
          }
          patchPageState({
            status: '',
            error: err instanceof Error ? err.message : 'Failed to save policy.'
          });
        })
        .finally(() => {
          if (saveRequestRef.current === requestId) {
            patchPageState({ saving: false });
          }
        });
    },
    [patchPageState, queryClient, token]
  );

  const handleSave = () => {
    if (!limits) return;
    persistLimits(limits, 'manual');
  };

  const handleLocalHarnessToggle = useCallback(
    (
      policyPlane: 'worker' | 'orchestrator',
      bucket: LlmFallbackTarget['runtime'],
      enabled: boolean
    ): void => {
      if (!limits) {
        return;
      }
      const currentValue =
        policyPlane === 'orchestrator'
          ? Boolean(limits.orchestratorLocalHarnessByRuntime[bucket])
          : Boolean(limits.localHarnessByRuntime[bucket]);
      if (currentValue === enabled) {
        return;
      }
      const nextLimits: LlmLimitsState =
        policyPlane === 'orchestrator'
          ? {
              ...limits,
              orchestratorLocalHarnessByRuntime: {
                ...limits.orchestratorLocalHarnessByRuntime,
                [bucket]: enabled
              }
            }
          : {
              ...limits,
              localHarnessByRuntime: {
                ...limits.localHarnessByRuntime,
                [bucket]: enabled
              }
            };
      updateLimits(nextLimits);
      persistLimits(nextLimits, 'localHarness');
    },
    [limits, persistLimits, updateLimits]
  );

  const resetActivityFeed = () => {
    const marker = new Date().toISOString();
    patchPageState({
      activitySinceTs: marker,
      status: `Activity reset at ${new Date(marker).toLocaleTimeString()}.`
    });
    setTimeout(() => patchPageState({ status: '' }), 3000);
  };

  const clearActivityWindow = () => {
    patchPageState({ activitySinceTs: null });
  };

  const handleCostWindowDayChange = (nextDay: string): void => {
    patchPageState({
      costWindowDay: nextDay,
      activitySinceTs: null,
      activityTaskType: 'all'
    });
  };

  const burn = useMemo(() => {
    if (!costs) return { calls: 0, blocked: 0, usd: 0 };
    return costs.providerDaily.reduce((acc, row) => {
      acc.calls += row.calls;
      acc.blocked += row.blocked;
      acc.usd += row.costUsd;
      return acc;
    }, { calls: 0, blocked: 0, usd: 0 });
  }, [costs]);

  const modelOptionsByRuntime = useMemo(() => {
    const options = {
      codex: new Set<string>(),
      claude: new Set<string>(),
      gemini: new Set<string>(),
      process: new Set<string>()
    } satisfies Record<(typeof RUNTIMES)[number], Set<string>>;

    if (registry) {
      for (const runtime of RUNTIMES) {
        registry.runtimes[runtime].catalogModels.forEach((model) => {
          if (model && model !== 'default') {
            options[runtime].add(model);
          }
        });
      }
      registry.entries.forEach((entry) => {
        entry.allowedRuntimes.forEach((runtime) => {
          if (entry.model && entry.model !== 'default') {
            options[runtime].add(entry.model);
          }
        });
      });
    }

    for (const runtime of RUNTIMES) {
      if (options[runtime].size === 0) {
        FALLBACK_MODEL_PRESETS[runtime].forEach((model) => {
          if (model && model !== 'default') {
            options[runtime].add(model);
          }
        });
      }
    }

    return {
      codex: Array.from(options.codex).sort(),
      claude: Array.from(options.claude).sort(),
      gemini: Array.from(options.gemini).sort(),
      process: Array.from(options.process).sort()
    };
  }, [registry]);

  const routingDiagnostics = useMemo(() => {
    const byPolicy: Record<'worker' | 'orchestrator', Record<(typeof RUNTIMES)[number], LlmValidationState['diagnostics']>> = {
      worker: {
        codex: [],
        claude: [],
        gemini: [],
        process: []
      },
      orchestrator: {
        codex: [],
        claude: [],
        gemini: [],
        process: []
      }
    };

    (validation?.diagnostics ?? []).forEach((diagnostic) => {
      byPolicy[diagnostic.policy][diagnostic.runtime].push(diagnostic);
    });

    return byPolicy;
  }, [validation]);

  const activityEvents = useMemo((): LlmActivityEvent[] => {
    const sessionById = new Map(sessions.map((session) => [session.id, session]));
    const runById = new Map(runs.map((run) => [run.id, run]));
    const agentById = new Map(agentProfiles.map((agent) => [agent.id, agent]));
    const cutoff = activitySinceTs ? Date.parse(activitySinceTs) : null;
    const events = costs?.recentEvents ?? [];

    return events
      .filter((event) => {
        if (cutoff === null) {
          return true;
        }
        const eventTs = Date.parse(String(event.ts));
        return Number.isFinite(eventTs) && eventTs >= cutoff;
      })
      .sort((a, b) => Date.parse(String(b.ts)) - Date.parse(String(a.ts)))
      .slice(0, 24)
      .map((event) => {
        const run = event.runId ? runById.get(event.runId) : undefined;
        const session = event.sessionId ? sessionById.get(event.sessionId) : run ? sessionById.get(run.sessionId) : undefined;
        const sessionAgentId = session?.agentId ?? null;
        const agent = session?.agentProfile ?? (sessionAgentId ? agentById.get(sessionAgentId) : undefined);
        const metadata = parseMetadataJson(event.metadataJson);
        const taskType = normalizeTaskType(event.taskType, run?.triggerSource);
        return {
          ...event,
          taskType,
          run,
          session,
          agent,
          metadata
        };
      });
  }, [costs, activitySinceTs, sessions, runs, agentProfiles]);

  const taskTypeStats = useMemo(() => {
    const counts = new Map<string, number>();
    activityEvents.forEach((entry) => {
      const key = normalizeTaskType(entry.taskType, entry.run?.triggerSource);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }, [activityEvents]);

  const visibleActivityEvents = useMemo(
    () =>
      activityTaskType === 'all'
        ? activityEvents
        : activityEvents.filter((entry) => normalizeTaskType(entry.taskType, entry.run?.triggerSource) === activityTaskType),
    [activityEvents, activityTaskType]
  );

  const completionEvents = useMemo(
    () => visibleActivityEvents.filter((entry) => entry.status === 'completed'),
    [visibleActivityEvents]
  );

  const problemEvents = useMemo(
    () => visibleActivityEvents.filter((entry) => entry.status !== 'completed'),
    [visibleActivityEvents]
  );

  return {
    limits,
    loading,
    activeTab,
    setActiveTab: (tab: CostControlPageState['activeTab']) => patchPageState({ activeTab: tab }),
    burn,
    saving,
    handleSave,
    status,
    error,
    providerBudgetStatus,
    costWindowDay,
    showAdvanced,
    setShowAdvanced: (nextShowAdvanced: boolean) => patchPageState({ showAdvanced: nextShowAdvanced }),
    validation,
    modelOptionsByRuntime,
    routingDiagnostics,
    handleLocalHarnessToggle,
    updateLimits,
    onboarding,
    routingCapturedAt,
    routingHistory,
    activitySinceTs,
    load,
    resetActivityFeed,
    clearActivityWindow,
    handleCostWindowDayChange,
    activityTaskType,
    setActivityTaskType: (taskType: string) => patchPageState({ activityTaskType: taskType }),
    taskTypeStats,
    activityEvents,
    completionEvents,
    problemEvents
  };
}

type CostControlPageModel = ReturnType<typeof useCostControlPageModel>;
type LoadedCostControlPageModel = CostControlPageModel & {
  limits: LlmLimitsState;
};

export function CostControlPage() {
  const model = useCostControlPageModel();

  if (!model.limits) {
    return <div className="p-10 text-slate-500 font-mono text-xs animate-pulse">Initializing resource guards...</div>;
  }

  return renderCostControlPage(model as LoadedCostControlPageModel);
}

function renderCostControlPage(model: LoadedCostControlPageModel) {
  const {
    limits,
    loading,
    activeTab,
    setActiveTab,
    burn,
    saving,
    handleSave,
    status,
    error,
    providerBudgetStatus,
    costWindowDay,
    showAdvanced,
    setShowAdvanced,
    validation,
    modelOptionsByRuntime,
    routingDiagnostics,
    handleLocalHarnessToggle,
    updateLimits,
    onboarding,
    routingCapturedAt,
    routingHistory,
    activitySinceTs,
    load,
    resetActivityFeed,
    clearActivityWindow,
    handleCostWindowDayChange,
    activityTaskType,
    setActivityTaskType,
    taskTypeStats,
    activityEvents,
    completionEvents,
    problemEvents
  } = model;

  return (
    <LazyMotion features={domAnimation}>
      <div className="shell-page shell-page-wide pb-20">
      <PageIntro
        eyebrow="Infrastructure"
        title={
          activeTab === 'routing'
            ? 'Routing defaults'
            : activeTab === 'budgets'
              ? 'Spend and limits'
              : 'Provider activity'
        }
        description={
          activeTab === 'routing'
            ? 'Set the default model for supervisors and agent runs. Budgets and call history live in separate tabs.'
            : activeTab === 'budgets'
              ? 'Review spend, limits, and provider health without opening the routing editor.'
              : 'Inspect recent provider calls, task types, and reset windows without leaving this page.'
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(['routing', 'budgets', 'activity'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-black'
                    : 'border border-white/10 text-slate-300 hover:border-white/20 hover:text-white'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
            <button
              onClick={handleSave}
              disabled={saving}
              className={`shell-button-accent inline-flex items-center justify-center gap-3 rounded-full px-4 py-2 text-sm font-semibold ${
                saving ? 'cursor-wait opacity-80' : 'active:scale-[0.98]'
              }`}
            >
              <FloppyDisk size={16} weight="fill" className={saving ? 'animate-spin' : ''} />
              {saving ? 'Saving...' : 'Save routing'}
            </button>
          </div>
        }
      />
      <div className="min-h-5 px-1" aria-live="polite">
        {status ? <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">{status}</p> : null}
        {!status && error ? <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400">{error}</p> : null}
      </div>
      {activeTab === 'routing' ? null : (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="grid grid-cols-1 gap-4 lg:col-span-4 lg:self-start">
          <MetricBlock label="Spend today" value={`$${burn.usd.toFixed(4)}`} icon={<CurrencyDollarSimple />} sub="Daily accumulation" />
          <MetricBlock label="Calls today" value={burn.calls} icon={<Lightning />} sub="Successful requests" />
        </div>
        
        <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] lg:col-span-8">
           <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <ChartBar size={20} className="text-[var(--shell-accent)]" weight="duotone" />
                <h3 className="text-lg font-medium text-white">Infrastructure Spend Trace</h3>
              </div>
              <div className="text-[10px] font-mono text-slate-600 uppercase">{loading ? 'Refreshing...' : 'Provider Telemetry'}</div>
           </div>
           
           <VisualBurnChart data={providerBudgetStatus} dayUtc={costWindowDay} />
        </article>
      </div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === 'routing' && (
          <m.div key="routing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
            <div className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--shell-accent-soft)] flex-shrink-0">
                  <Info size={24} className="text-[var(--shell-accent)]" weight="duotone" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">Routing defaults</h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--shell-muted)]">
                    Start with the default model for each lane, then add fallback providers only where you actually need them.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                {showAdvanced ? 'Show primary runtime only' : 'Show all runtimes'}
              </button>
            </div>

            {validation && !validation.valid ? (
              <div className="mx-2 rounded-[1.75rem] border border-amber-500/30 bg-amber-500/10 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-medium text-white">Registry Validation Required</div>
                    <p className="mt-1 text-[11px] text-amber-100/75">
                      {validation.diagnostics.length} routing field{validation.diagnostics.length === 1 ? '' : 's'} do not match the active runtime/provider model registry.
                    </p>
                  </div>
                  <div className="text-[10px] font-mono uppercase text-amber-200/80">
                    Startup Mode: {validation.startupMode}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-2">
              <RoutingEngine 
                title="Supervisor requests" 
                tone="text-emerald-400"
                buckets={showAdvanced ? Array.from(RUNTIMES) : ['process']}
                primaryState={limits.orchestratorPrimaryModelByRuntime}
                fallbackState={limits.orchestratorFallbackByRuntime}
                localHarnessState={limits.orchestratorLocalHarnessByRuntime}
                modelOptions={modelOptionsByRuntime}
                diagnosticsByRuntime={routingDiagnostics.orchestrator}
                onChange={(
                  bucket: LlmFallbackTarget['runtime'],
                  type: 'primary' | 'fallback' | 'localHarness',
                  val: string | LlmFallbackTarget[] | boolean
                ) => {
                  if (type === 'localHarness') {
                    handleLocalHarnessToggle('orchestrator', bucket, Boolean(val));
                    return;
                  }
                  updateLimits((p) => {
                    if (!p) return null;
                    if (type === 'primary') {
                      const nextPrimary = typeof val === 'string' ? val.trim() : '';
                      if (!nextPrimary) {
                        return p;
                      }
                      return {
                        ...p,
                        orchestratorPrimaryModelByRuntime: {
                          ...p.orchestratorPrimaryModelByRuntime,
                          [bucket]: nextPrimary
                        }
                      };
                    }
                    return {
                      ...p,
                      orchestratorFallbackByRuntime: {
                        ...p.orchestratorFallbackByRuntime,
                        [bucket]: Array.isArray(val) ? val : []
                      }
                    };
                  });
                }}
              />
              <RoutingEngine 
                title="Agent runs" 
                tone="text-[var(--shell-accent)]"
                buckets={showAdvanced ? Array.from(RUNTIMES) : ['process']}
                primaryState={limits.primaryModelByRuntime}
                fallbackState={limits.fallbackByRuntime}
                localHarnessState={limits.localHarnessByRuntime}
                modelOptions={modelOptionsByRuntime}
                diagnosticsByRuntime={routingDiagnostics.worker}
                onChange={(
                  bucket: LlmFallbackTarget['runtime'],
                  type: 'primary' | 'fallback' | 'localHarness',
                  val: string | LlmFallbackTarget[] | boolean
                ) => {
                  if (type === 'localHarness') {
                    handleLocalHarnessToggle('worker', bucket, Boolean(val));
                    return;
                  }
                  updateLimits((p) => {
                    if (!p) return null;
                    if (type === 'primary') {
                      const nextPrimary = typeof val === 'string' ? val.trim() : '';
                      if (!nextPrimary) {
                        return p;
                      }
                      return {
                        ...p,
                        primaryModelByRuntime: {
                          ...p.primaryModelByRuntime,
                          [bucket]: nextPrimary
                        }
                      };
                    }
                    return {
                      ...p,
                      fallbackByRuntime: {
                        ...p.fallbackByRuntime,
                        [bucket]: Array.isArray(val) ? val : []
                      }
                    };
                  });
                }}
              />
            </div>
          </m.div>
        )}

        {activeTab === 'budgets' && (
          <m.div key="budgets" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-10 px-2">
             <VisualBudgetManager 
               limits={limits}
               health={providerBudgetStatus}
               onboarding={onboarding}
               onChange={updateLimits}
             />
          </m.div>
        )}

        {activeTab === 'activity' && (
          <m.div key="activity" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6 px-2">
             <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
               <div className="space-y-1">
                 <div className="text-lg font-medium text-white">LLM Activity Snapshot</div>
                 <p className="text-sm text-slate-400">
                   {routingCapturedAt
                     ? `Latest capture: ${new Date(routingCapturedAt).toLocaleString()}`
                     : 'No snapshot captured yet.'}
                 </p>
                 <p className="text-sm text-slate-400">
                   History retained: {routingHistory.length} capture(s)
                 </p>
                 <p className="text-sm text-slate-400">
                   {activitySinceTs
                     ? `Showing calls since reset: ${new Date(activitySinceTs).toLocaleString()}`
                     : `Showing the 24 most recent provider API calls for ${costWindowDay} (local day).`}
                 </p>
               </div>
               <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCostWindowDayChange(localDayFromOffset(0))}
                   className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition ${
                     costWindowDay === localDayFromOffset(0)
                       ? 'border-[color:var(--shell-accent-border)] text-[var(--shell-accent)] bg-[color:var(--shell-accent-soft)]'
                       : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                   }`}
                 >
                   Today
                 </button>
                  <button
                    onClick={() => handleCostWindowDayChange(localDayFromOffset(-1))}
                   className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition ${
                     costWindowDay === localDayFromOffset(-1)
                       ? 'border-[color:var(--shell-accent-border)] text-[var(--shell-accent)] bg-[color:var(--shell-accent-soft)]'
                       : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                   }`}
                 >
                   Yesterday
                 </button>
                 <button
                   onClick={load}
                   className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                 >
                   Refresh Snapshot
                 </button>
                 <button
                   onClick={resetActivityFeed}
                   className="px-3 py-2 rounded-lg border border-rose-500/30 text-rose-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/10 transition"
                 >
                   Reset Activity
                 </button>
                 <button
                   onClick={clearActivityWindow}
                   disabled={!activitySinceTs}
                   className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition ${
                     activitySinceTs
                       ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                       : 'border-slate-800 text-slate-600 cursor-not-allowed'
                   }`}
                 >
                   Show All
                 </button>
               </div>
             </div>
             <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
               <div className="flex items-center justify-between gap-3">
                 <div className="text-lg font-medium text-white">Task Type Lens</div>
                 <div className="text-sm text-slate-400">
                   Viewing: <span className="font-bold text-[var(--shell-accent)]">{formatTaskTypeLabel(activityTaskType)}</span>
                 </div>
               </div>
               <div className="flex flex-wrap gap-2">
                 <button
                   onClick={() => setActivityTaskType('all')}
                   className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition ${
                     activityTaskType === 'all'
                       ? 'border-[color:var(--shell-accent-border)] text-[var(--shell-accent)] bg-[color:var(--shell-accent-soft)]'
                       : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                   }`}
                 >
                   All ({activityEvents.length})
                 </button>
                 {taskTypeStats.map((item) => (
                   <button
                     key={item.key}
                     onClick={() => setActivityTaskType(item.key)}
                     className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition ${
                       activityTaskType === item.key
                         ? 'border-[color:var(--shell-accent-border)] text-[var(--shell-accent)] bg-[color:var(--shell-accent-soft)]'
                         : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                     }`}
                   >
                     {formatTaskTypeLabel(item.key)} ({item.count})
                   </button>
                 ))}
               </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <LlmActivityFeed
                 title={`Recent Successful Calls · ${formatTaskTypeLabel(activityTaskType)}`}
                 data={completionEvents}
                 tone="text-[var(--shell-accent)]"
               />
               <LlmActivityFeed
                 title={`Blocked / Failed Calls · ${formatTaskTypeLabel(activityTaskType)}`}
                 data={problemEvents}
                 tone="text-rose-400"
               />
             </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
    </LazyMotion>
  );
}

function MetricBlock({ label, value, icon, sub }: { label: string; value: string | number; icon: React.ReactNode; sub: string }) {
  return (
    <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
      <div className="flex items-center gap-3 text-slate-500 mb-3">
        <span className="opacity-50 group-hover:opacity-100 transition-opacity">{icon}</span>
        <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-3xl font-mono font-bold tracking-tighter">{value}</div>
      <div className="text-sm text-slate-400 mt-2 font-mono uppercase tracking-widest opacity-60 flex items-center gap-2">
        <div className="h-1 w-1 rounded-full bg-[color:var(--shell-accent)] animate-pulse" />
        {sub}
      </div>
    </div>
  );
}

function RoutingEngine({
  title,
  tone,
  buckets,
  primaryState,
  fallbackState,
  localHarnessState,
  modelOptions,
  diagnosticsByRuntime,
  onChange
}: {
  title: string; 
  tone: string; 
  buckets: string[]; 
  primaryState: Record<string, string | null>; 
  fallbackState: Record<string, LlmFallbackTarget[]>; 
  localHarnessState: Record<string, boolean>; 
  modelOptions: Record<(typeof RUNTIMES)[number], string[]>;
  diagnosticsByRuntime: Record<(typeof RUNTIMES)[number], LlmValidationState['diagnostics']>;
  onChange: (bucket: LlmFallbackTarget['runtime'], type: 'primary' | 'fallback' | 'localHarness', val: string | LlmFallbackTarget[] | boolean) => void 
}) {
  return (
    <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
      <h3 className={`text-[10px] font-black uppercase tracking-[0.3em] ${tone} mb-4 px-2`}>{title}</h3>
      <div className="space-y-8">
        {buckets.map((bucket) => (
          <div key={bucket} className="relative pl-8 border-l border-slate-800/50 ml-2 space-y-6">
            <div className="absolute top-0 left-[-5px] w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700" />
            
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">{bucket}</span>
                <p className="text-[9px] text-slate-600 mt-0.5">{RUNTIME_LABELS[bucket] || bucket}</p>
              </div>
              <button
                type="button"
                onClick={() => onChange(bucket as LlmFallbackTarget['runtime'], 'localHarness', !localHarnessState?.[bucket])}
                className={`px-3 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-widest transition ${
                  localHarnessState?.[bucket]
                    ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                    : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                }`}
                title="When enabled, default/null model requests route directly to the local runtime harness."
              >
                Local Harness {localHarnessState?.[bucket] ? 'On' : 'Off'}
              </button>
            </div>

            {(diagnosticsByRuntime[bucket as keyof typeof diagnosticsByRuntime] ?? []).length > 0 ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 space-y-2">
                {(diagnosticsByRuntime[bucket as keyof typeof diagnosticsByRuntime] ?? []).map((diagnostic) => (
                  <div key={diagnostic.field} className="space-y-1">
                    <div className="text-lg font-medium text-white">{diagnostic.field}</div>
                    <p className="text-[11px] text-amber-100/80">{diagnostic.message}</p>
                    <p className="text-[10px] text-amber-200/55">{diagnostic.remediation}</p>
                  </div>
                ))}
              </div>
            ) : null}
            
            <div className="space-y-3">
              <p className="ml-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Primary Intelligence Brain</p>
              <div className="relative group">
                <input
                  type="text"
                  list={`presets-${bucket}`}
                  value={primaryState[bucket] ?? ''}
                  onChange={e => onChange(bucket as LlmFallbackTarget['runtime'], 'primary', e.target.value)}
                  className="shell-field w-full rounded-2xl px-5 py-4 pr-12 text-sm leading-6 font-mono shadow-inner"
                  placeholder="Model Identifier (e.g. or:openai/gpt-4o)"
                  spellCheck={false}
                  title={primaryState[bucket] ?? ''}
                />
                <datalist id={`presets-${bucket}`}>
                  {modelOptions[bucket as keyof typeof modelOptions]?.map((model, index) => (
                    <option key={buildIndexedKey(`llm-model-option:${bucket}`, model, index)} value={model} />
                  ))}
                </datalist>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20 group-hover:opacity-100 transition-opacity">
                  <Lightning size={14} className="text-[var(--shell-accent)]" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Escalation Sequence</span>
                <span className="text-[8px] font-mono text-slate-600 uppercase">Auto-Fallback Path</span>
              </div>
              
              <EscalationBuilder 
                items={fallbackState[bucket] || []} 
                onChange={(val) => onChange(bucket as LlmFallbackTarget['runtime'], 'fallback', val)}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function EscalationBuilder({ items, onChange }: { items: LlmFallbackTarget[], onChange: (val: LlmFallbackTarget[]) => void }) {
  const nextStepIdRef = useRef(0);
  const createStepKey = useCallback(() => `llm-fallback-step:${nextStepIdRef.current++}`, []);
  const [stepKeys, setStepKeys] = useState<string[]>(() => items.map(() => createStepKey()));

  useEffect(() => {
    setStepKeys((current) => {
      if (current.length === items.length) {
        return current;
      }
      if (current.length > items.length) {
        return current.slice(0, items.length);
      }
      const next = [...current];
      while (next.length < items.length) {
        next.push(createStepKey());
      }
      return next;
    });
  }, [createStepKey, items.length]);

  const addStep = () => {
    setStepKeys((current) => [...current, createStepKey()]);
    onChange([...items, { runtime: 'process', model: null }]);
  };
  const removeStep = (idx: number) => {
    setStepKeys((current) => current.filter((_, currentIndex) => currentIndex !== idx));
    onChange(items.filter((_, i) => i !== idx));
  };
  const updateStep = (idx: number, patch: Partial<LlmFallbackTarget>) => {
    const current = items[idx];
    if (!current) {
      return;
    }
    const next = [...items];
    next[idx] = {
      runtime: patch.runtime ?? current.runtime,
      model: patch.model === undefined ? current.model : patch.model
    };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {items.map((item, idx) => (
          <m.div 
            key={stepKeys[idx] ?? `llm-fallback-step:${idx}`}
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
            className="group grid gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:p-5"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/6 bg-white/[0.03] text-[10px] font-mono font-bold text-slate-500">
              {idx + 1}
            </div>
            <select 
              value={item.runtime}
              onChange={(event) => updateStep(idx, { runtime: parseRoutingRuntime(event.target.value) })}
              className="shell-field min-h-10 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--shell-accent)] outline-none"
            >
              {RUNTIMES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input
              value={item.model ?? ''}
              onChange={(event) => updateStep(idx, { model: event.target.value.length > 0 ? event.target.value : null })}
              className="shell-field min-w-0 w-full rounded-xl px-3 py-2 text-[11px] leading-5 font-mono text-slate-200 outline-none sm:text-xs"
              placeholder="default model"
              spellCheck={false}
              title={item.model ?? 'default model'}
            />
            <button
              type="button"
              onClick={() => removeStep(idx)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-slate-600 opacity-0 transition-all hover:border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-300 group-hover:opacity-100"
              title="Remove escalation step"
            >
              <Trash size={12} />
            </button>
          </m.div>
        ))}
      </AnimatePresence>
      <button 
        type="button"
        onClick={addStep}
        className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
      >
        <Plus size={10} weight="bold" />
        Add Escalation Step
      </button>
    </div>
  );
}

function VisualBudgetManager({ limits, health, onboarding, onChange }: { 
  limits: LlmLimitsState; 
  health: ProviderBudgetStatus[]; 
  onboarding: LlmOnboardingState | null; 
  onChange: (next: LlmLimitsState) => void 
}) {
  const providers = useMemo(() => {
    const active = new Set([
      ...Object.keys(limits.providerCallBudgetDaily),
      ...Object.keys(limits.providerCostBudgetUsdDaily),
      ...health.map((h) => h.provider)
    ]);
    
    // Add configured providers from onboarding if not already there
    if (onboarding?.providerKeys.openrouter) active.add('openrouter');
    if (onboarding?.providerKeys.google) active.add('google');
    
    return Array.from(active).sort();
  }, [limits, health, onboarding]);

  const updateProviderLimit = (p: string, field: string, val: number | null) => {
    const next = { ...limits };
    const fieldKey = field as keyof LlmLimitsState;
    const currentField = { ...next[fieldKey] } as Record<string, number>;
    
    if (val === null || val < 0) {
      delete currentField[p];
    } else {
      currentField[p] = val;
    }
    
    (next[fieldKey] as any) = currentField;
    onChange(next);
  };

  const updateModelLimit = (model: string, val: number | null) => {
    const next = { ...limits };
    const currentField = { ...next.modelCallBudgetDaily };
    if (val === null || val < 0) {
      delete currentField[model];
    } else {
      currentField[model] = val;
    }
    next.modelCallBudgetDaily = currentField;
    onChange(next);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between px-2">
        <div className="space-y-1">
          <h3 className="text-lg font-medium text-white">Infrastructure Quotas</h3>
          <p className="text-sm text-slate-400">Security enforcement per infrastructure vendor and specific neural model.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {providers.map((p, index) => (
          <ProviderCard 
            key={buildIndexedKey('llm-provider', p, index)} 
            provider={p} 
            limits={limits} 
            health={health.find((h) => h.provider === p)}
            onUpdate={updateProviderLimit}
            onUpdateModel={updateModelLimit}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderCard({ provider, limits, health, onUpdate, onUpdateModel }: { 
  provider: string; 
  limits: LlmLimitsState; 
  health?: ProviderBudgetStatus; 
  onUpdate: (p: string, field: string, val: number | null) => void; 
  onUpdateModel: (model: string, val: number | null) => void 
}) {
  const [showModels, setShowModels] = useState(false);
  const dailyBudget = health?.budgets?.dailyCostUsd ?? limits.providerCostBudgetUsdDaily[provider] ?? null;
  const dailyProgress = typeof dailyBudget === 'number' && dailyBudget > 0 ? ((health?.dayCostUsd ?? 0) / dailyBudget) * 100 : 0;
  
  const modelsForThisProvider = useMemo(() => {
    return Object.keys(limits.modelCallBudgetDaily).filter(m => m.startsWith(`${provider}:`) || m.startsWith(`${provider}/`));
  }, [limits.modelCallBudgetDaily, provider]);

  return (
    <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
      <div className={`absolute left-0 top-0 w-1.5 h-full ${dailyProgress > 85 ? 'bg-rose-500 animate-pulse' : 'bg-[color:var(--shell-accent)] opacity-60'}`} />
      
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 items-start">
        {/* Identity & Health */}
        <div className="xl:col-span-3 space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Database size={20} className="text-[var(--shell-accent)]" weight="duotone" />
              <span className="text-lg font-black text-slate-100 font-mono uppercase tracking-tighter">{provider}</span>
            </div>
            <p className="text-lg font-medium text-white">Infrastructure Vendor</p>
          </div>

          <div className="space-y-4 ml-8">
             <VelocityGauge label="Daily Burn" current={health?.dayCostUsd} limit={limits.providerCostBudgetUsdDaily[provider]} unit="$" />
             <VelocityGauge label="Monthly Cap" current={health?.monthCostUsd} limit={limits.providerCostBudgetUsdMonthly[provider]} unit="$" />
          </div>
        </div>

        {/* Global Provider Limits */}
        <div className="xl:col-span-5 grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="space-y-4">
             <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
               <Lightning size={12} weight="fill" />
               Throughput
             </h4>
             <div className="space-y-3">
	               <QuotaInput label="Daily Request Cap" value={limits.providerCallBudgetDaily[provider]} onChange={(v: number | null) => onUpdate(provider, 'providerCallBudgetDaily', v)} unit="REQ" />
	               <QuotaInput label="Requests Per Minute" value={limits.providerCallsPerMinute[provider]} onChange={(v: number | null) => onUpdate(provider, 'providerCallsPerMinute', v)} unit="RPM" />
             </div>
           </div>

           <div className="space-y-4">
             <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
               <CurrencyDollarSimple size={12} weight="fill" />
               Spend Guard
             </h4>
             <div className="space-y-3">
	               <QuotaInput label="Daily USD Limit" value={limits.providerCostBudgetUsdDaily[provider]} onChange={(v: number | null) => onUpdate(provider, 'providerCostBudgetUsdDaily', v)} unit="$" />
	               <QuotaInput label="Monthly USD Limit" value={limits.providerCostBudgetUsdMonthly[provider]} onChange={(v: number | null) => onUpdate(provider, 'providerCostBudgetUsdMonthly', v)} unit="$" />
             </div>
           </div>
        </div>

        {/* Model-Level Overrides */}
        <div className="xl:col-span-4 space-y-4">
           <div className="flex items-center justify-between">
             <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
               <Cpu size={14} weight="duotone" />
               Model Enforcements
             </h4>
             <button 
               onClick={() => setShowModels(!showModels)}
               className="text-[9px] font-bold text-[var(--shell-accent)] transition-colors uppercase tracking-widest hover:brightness-110"
             >
               {showModels ? 'Hide' : `Manage (${modelsForThisProvider.length})`}
             </button>
           </div>

           {showModels && (
             <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
                {modelsForThisProvider.map((m, index) => (
                  <div key={buildIndexedKey(`llm-model:${provider}`, m, index)} className="flex items-center justify-between gap-4">
                    <span className="text-[10px] font-mono text-slate-400 truncate flex-1">{m.split(/[/:]/).pop()}</span>
                    <div className="w-24 relative">
                      <input 
                        type="number" value={limits.modelCallBudgetDaily[m] || ''} onChange={e => onUpdateModel(m, Number(e.target.value))}
                        className="shell-field w-full rounded-lg px-2 py-1 text-right text-[10px] font-mono"
                      />
                    </div>
                    <button onClick={() => onUpdateModel(m, null)} className="text-slate-700 hover:text-rose-500"><X size={10} /></button>
                  </div>
                ))}
                <button 
                  onClick={() => {
                    const name = window.prompt(`Enter model ID for ${provider} (e.g. ${provider}/gpt-4o):`, `${provider}/`);
                    if (name) onUpdateModel(name, 1000);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  + Bind Specific Model Limit
                </button>
             </m.div>
           )}
           {!showModels && (
             <p className="text-sm text-slate-400 italic px-1">Specific model caps are {modelsForThisProvider.length > 0 ? 'active' : 'not configured'}.</p>
           )}
        </div>
      </div>
    </article>
  );
}

function QuotaInput({ label, value, onChange, unit }: { label: string; value: number | null; onChange: (v: number | null) => void; unit: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest ml-1">{label}</p>
      <div className="relative">
        <input 
          type="number" value={value || ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          className="shell-field w-full rounded-xl px-4 py-2.5 text-xs font-mono shadow-inner"
          placeholder="∞"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-700 font-mono">{unit}</span>
      </div>
    </div>
  );
}

function VelocityGauge({ label, current = 0, limit, unit }: { label: string; current?: number; limit?: number | null; unit: string }) {
  const progress = limit ? (current / limit) * 100 : 0;
  const isRisky = progress > 85;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-slate-500 px-1">
        <span>{label}</span>
        <span className={isRisky ? 'text-rose-400' : 'text-[var(--shell-accent)]'}>{unit}{current.toFixed(2)} / {limit ? `${unit}${limit}` : '∞'}</span>
      </div>
      <div className="h-1 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/50">
        <m.div 
          initial={{ width: 0 }} animate={{ width: `${Math.min(100, progress)}%` }}
          className={`h-full rounded-full ${isRisky ? 'bg-rose-500' : 'bg-[color:var(--shell-accent)]'}`}
        />
      </div>
    </div>
  );
}

function VisualBurnChart({ data, dayUtc }: { data: ProviderBudgetStatus[]; dayUtc: string }) {
  const maxVal = Math.max(...data.map(d => d.dayCostUsd), 0.01);
  return (
    <div className="h-48 flex items-end gap-6 px-2">
      {data.map((d, index) => {
        const height = (d.dayCostUsd / maxVal) * 100;
        return (
          <div key={buildIndexedKey('llm-burn-provider', d.provider, index)} className="flex-1 flex flex-col items-center gap-4 group">
            <div className="relative w-full flex flex-col justify-end h-32">
               <m.div 
                 initial={{ height: 0 }} animate={{ height: `${height}%` }}
                 className="relative w-full rounded-t-xl bg-gradient-to-t from-[color:var(--shell-accent-soft)] to-[color:var(--shell-accent)] shadow-[0_18px_36px_-16px_rgba(0,0,0,0.35)]"
               >
                 <div className="absolute top-[-28px] left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold text-[var(--shell-accent)] opacity-0 transition-opacity group-hover:opacity-100">
                   ${d.dayCostUsd.toFixed(2)}
                 </div>
               </m.div>
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 font-mono rotate-45 origin-left translate-x-2 whitespace-nowrap transition-colors group-hover:text-[var(--shell-accent)]">
              {d.provider}
            </div>
          </div>
        );
      })}
      {data.length === 0 && (
        <div className="w-full h-full flex items-center justify-center text-slate-700 text-xs italic">
          No provider spend events yet for {dayUtc} (local day).
        </div>
      )}
    </div>
  );
}

function parseMetadataJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function shortId(value: string | null | undefined): string {
  if (!value) {
    return 'n/a';
  }
  return value.slice(0, 8);
}

function extractPurpose(entry: LlmActivityEvent): string {
  const prompt = typeof entry?.run?.prompt === 'string' ? entry.run.prompt.trim() : '';
  const userMarker = prompt.toUpperCase().indexOf('USER:');
  if (userMarker >= 0) {
    const userSegment = prompt.slice(userMarker + 5).trim();
    if (userSegment) {
      return userSegment.replace(/\s+/g, ' ').slice(0, 140);
    }
  }
  if (entry?.taskType === 'agent_delegate') {
    return 'Delegated task from orchestrator';
  }
  if (prompt) {
    return prompt.replace(/\s+/g, ' ').slice(0, 140);
  }
  if (typeof entry?.taskType === 'string' && entry.taskType.trim()) {
    return entry.taskType;
  }
  if (typeof entry?.metadata?.reason === 'string' && entry.metadata.reason.trim()) {
    return entry.metadata.reason;
  }
  return 'No prompt context available';
}

function actorLabel(entry: LlmActivityEvent): string {
  if (typeof entry?.agent?.title === 'string' && entry.agent.title.trim()) {
    return entry.agent.title;
  }
  if (typeof entry?.agent?.name === 'string' && entry.agent.name.trim()) {
    return entry.agent.name;
  }
  if (typeof entry?.session?.agentId === 'string' && entry.session.agentId.trim()) {
    return entry.session.agentId;
  }
  return 'Unknown Actor';
}

function normalizeTaskType(rawTaskType: unknown, fallbackSource?: unknown): string {
  const value =
    typeof rawTaskType === 'string' && rawTaskType.trim().length > 0
      ? rawTaskType.trim()
      : typeof fallbackSource === 'string' && fallbackSource.trim().length > 0
        ? fallbackSource.trim()
        : 'run';
  return value.toLowerCase();
}

function formatTaskTypeLabel(taskType: string): string {
  if (!taskType || taskType === 'all') {
    return 'All';
  }
  if (taskType === 'agent_delegate') {
    return 'Agent Delegate';
  }
  return taskType
    .split(/[_\s-]+/g)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function LlmActivityFeed({ title, data, tone }: { title: string; data: LlmActivityEvent[]; tone: string }) {
  return (
    <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
      <h3 className={`text-[10px] font-black uppercase tracking-[0.3em] ${tone} mb-8 px-1`}>{title}</h3>
      <div className="space-y-4 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800 max-h-[calc(100dvh-20rem)]">
        {data.map((entry) => (
          <div key={entry.id} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
             <div className={`absolute left-0 top-0 w-1 h-full ${entry.status === 'completed' ? 'bg-emerald-500/40' : 'bg-rose-500/40'}`} />
             <div className="flex items-center justify-between mb-3">
               <span className="text-[10px] font-black uppercase tracking-widest text-[var(--shell-accent)]">provider: {entry.provider}</span>
               <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${entry.status === 'completed' ? 'text-emerald-400' : 'text-rose-400'}`}>
                 {entry.status}
               </span>
             </div>
             <p className="text-sm text-slate-400 font-mono mb-2">
               {new Date(entry.ts).toLocaleString()}
             </p>
             <p className="text-xs font-bold text-slate-200 mb-1.5">
               model: {entry.model || 'default'}
             </p>
             <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-500 font-mono mb-2">
               <div>who: {actorLabel(entry)}</div>
               <div>runtime: {entry.runtime}</div>
             </div>
             <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-500 font-mono mb-2">
               <div>source: {formatTaskTypeLabel(normalizeTaskType(entry.taskType, entry.run?.triggerSource))}</div>
               <div>context: {extractPurpose(entry)}</div>
             </div>
             <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-600 font-mono mb-2">
               <div>session: {entry.session?.sessionKey || shortId(entry.sessionId)}</div>
               <div>run: {shortId(entry.runId)}</div>
             </div>
             <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-600 font-mono mb-2">
               <div>cost: {typeof entry.costUsd === 'number' ? `$${entry.costUsd.toFixed(5)}` : 'n/a'}</div>
               <div>tokens: {entry.totalTokens ?? 'n/a'}</div>
             </div>
             <p className="text-sm text-slate-400 italic leading-relaxed">
               "{
                 typeof entry.metadata?.reason === 'string'
                   ? entry.metadata.reason
                   : formatTaskTypeLabel(normalizeTaskType(entry.taskType, entry.run?.triggerSource))
               }"
             </p>
          </div>
        ))}
        {data.length === 0 ? (
          <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">No matching provider calls in this window yet.</div>
        ) : null}
      </div>
    </article>
  );
}
