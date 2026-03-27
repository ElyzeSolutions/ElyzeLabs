import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect
} from '@tanstack/react-router';

import { AppShell, DefaultCatchBoundary, DefaultNotFound, RouteFallback } from './AppShell';
import {
  agentProfilesQueryOptions,
  backlogBoardQueryOptions,
  backlogContractsQueryOptions,
  backlogDecisionStreamQueryOptions,
  backlogOrchestrationQueryOptions,
  boardQueryOptions,
  browserDoctorQueryOptions,
  browserHistoryQueryOptions,
  browserSessionVaultQueryOptions,
  browserStatusQueryOptions,
  chatsQueryOptions,
  cronStatusQueryOptions,
  housekeepingQueryOptions,
  improvementLearningsQueryOptions,
  improvementProposalsQueryOptions,
  llmCostsQueryOptions,
  llmLimitsQueryOptions,
  localSessionsQueryOptions,
  localStatsQueryOptions,
  metricsQueryOptions,
  onboardingStatusQueryOptions,
  officeQueryOptions,
  pairingsQueryOptions,
  readinessQueryOptions,
  runtimeConfigQueryOptions,
  runsQueryOptions,
  scheduleAgentProfilesQueryOptions,
  scheduleDetailQueryOptions,
  schedulesQueryOptions,
  sessionsQueryOptions,
  skillsCatalogQueryOptions,
  skillsQueryOptions,
  tokenStatusQueryOptions,
  toolsDiagnosticsQueryOptions,
  toolsQueryOptions,
  vaultStatusQueryOptions,
  watchdogStatusQueryOptions
} from './queryOptions';
import { dashboardQueryClient } from './queryClient';
import { useAppStore } from './store';
import type { BacklogState, LocalRuntimeKind, ScheduleKind } from './types';

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: AppShell
});

function getActiveToken(): string | undefined {
  return useAppStore.getState().token;
}

type DashboardLoaderQueryOptions =
  | ReturnType<typeof agentProfilesQueryOptions>
  | ReturnType<typeof backlogBoardQueryOptions>
  | ReturnType<typeof backlogContractsQueryOptions>
  | ReturnType<typeof backlogDecisionStreamQueryOptions>
  | ReturnType<typeof backlogOrchestrationQueryOptions>
  | ReturnType<typeof boardQueryOptions>
  | ReturnType<typeof browserDoctorQueryOptions>
  | ReturnType<typeof browserHistoryQueryOptions>
  | ReturnType<typeof browserSessionVaultQueryOptions>
  | ReturnType<typeof browserStatusQueryOptions>
  | ReturnType<typeof chatsQueryOptions>
  | ReturnType<typeof cronStatusQueryOptions>
  | ReturnType<typeof housekeepingQueryOptions>
  | ReturnType<typeof improvementLearningsQueryOptions>
  | ReturnType<typeof improvementProposalsQueryOptions>
  | ReturnType<typeof llmCostsQueryOptions>
  | ReturnType<typeof llmLimitsQueryOptions>
  | ReturnType<typeof localSessionsQueryOptions>
  | ReturnType<typeof localStatsQueryOptions>
  | ReturnType<typeof metricsQueryOptions>
  | ReturnType<typeof onboardingStatusQueryOptions>
  | ReturnType<typeof officeQueryOptions>
  | ReturnType<typeof pairingsQueryOptions>
  | ReturnType<typeof readinessQueryOptions>
  | ReturnType<typeof runtimeConfigQueryOptions>
  | ReturnType<typeof runsQueryOptions>
  | ReturnType<typeof scheduleDetailQueryOptions>
  | ReturnType<typeof schedulesQueryOptions>
  | ReturnType<typeof sessionsQueryOptions>
  | ReturnType<typeof skillsCatalogQueryOptions>
  | ReturnType<typeof skillsQueryOptions>
  | ReturnType<typeof tokenStatusQueryOptions>
  | ReturnType<typeof toolsDiagnosticsQueryOptions>
  | ReturnType<typeof toolsQueryOptions>
  | ReturnType<typeof vaultStatusQueryOptions>
  | ReturnType<typeof watchdogStatusQueryOptions>;
type QueryOptionsFactory = (token: string) => DashboardLoaderQueryOptions;

function preloadControlPlaneQueries(...queryFactories: QueryOptionsFactory[]) {
  return async ({ context }: { context: RouterContext }) => {
    const token = getActiveToken();
    if (!token) {
      return;
    }
    await Promise.all(queryFactories.map((factory) => context.queryClient.ensureQueryData(factory(token) as never)));
  };
}

const BACKLOG_STATE_ORDER = ['idea', 'triage', 'planned', 'in_progress', 'review', 'blocked', 'done', 'archived'] as const satisfies readonly BacklogState[];
const DEFAULT_BACKLOG_STATES = ['idea', 'triage', 'planned', 'in_progress', 'review', 'blocked', 'done'] as const satisfies readonly BacklogState[];

function localDayString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type BrowserRouteSearch = {
  site?: 'tiktok' | 'instagram' | 'reddit' | 'x' | 'pinterest' | 'facebook' | 'generic';
  browser?: 'chrome' | 'firefox';
  owner?: string;
  visibility?: 'shared' | 'session_only';
  sessionId?: string;
};

type BacklogRouteSearch = {
  query: string;
  states: BacklogState[];
  scope?: 'unscoped';
  projectId?: string;
  repoRoot?: string;
};

function validateBrowserSearch(search: Record<string, unknown>): BrowserRouteSearch {
  return {
    site:
      search.site === 'tiktok' ||
      search.site === 'instagram' ||
      search.site === 'reddit' ||
      search.site === 'x' ||
      search.site === 'pinterest' ||
      search.site === 'facebook' ||
      search.site === 'generic'
        ? search.site
        : undefined,
    browser: search.browser === 'chrome' || search.browser === 'firefox' ? search.browser : undefined,
    owner: typeof search.owner === 'string' && search.owner.trim().length > 0 ? search.owner : undefined,
    visibility: search.visibility === 'session_only' ? 'session_only' : search.visibility === 'shared' ? 'shared' : undefined,
    sessionId: typeof search.sessionId === 'string' && search.sessionId.trim().length > 0 ? search.sessionId : undefined
  };
}

function validateBacklogSearch(search: Record<string, unknown>): BacklogRouteSearch {
  const statesRaw =
    typeof search.states === 'string'
      ? search.states
      : Array.isArray(search.states)
        ? search.states.join(',')
        : '';
  const parsedStates = statesRaw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is BacklogState => BACKLOG_STATE_ORDER.includes(entry as BacklogState));

  return {
    query: typeof search.query === 'string' ? search.query : '',
    states: parsedStates.length > 0 ? parsedStates : [...DEFAULT_BACKLOG_STATES],
    scope: search.scope === 'unscoped' ? 'unscoped' : undefined,
    projectId: typeof search.projectId === 'string' && search.projectId.trim().length > 0 ? search.projectId : undefined,
    repoRoot: typeof search.repoRoot === 'string' && search.repoRoot.trim().length > 0 ? search.repoRoot : undefined
  };
}

type SchedulesRouteSearch = {
  kind: 'all' | ScheduleKind;
  query: string;
  scheduleId?: string;
};

function validateSchedulesSearch(search: Record<string, unknown>): SchedulesRouteSearch {
  return {
    kind:
      search.kind === 'builtin' || search.kind === 'targeted' || search.kind === 'all' ? search.kind : 'targeted',
    query: typeof search.query === 'string' ? search.query : '',
    scheduleId: typeof search.scheduleId === 'string' && search.scheduleId.trim().length > 0 ? search.scheduleId : undefined
  };
}

type HousekeepingRouteSearch = {
  runtime: LocalRuntimeKind | 'all';
};

function validateHousekeepingSearch(search: Record<string, unknown>): HousekeepingRouteSearch {
  return {
    runtime:
      search.runtime === 'codex' || search.runtime === 'claude' || search.runtime === 'gemini' ? search.runtime : 'all'
  };
}

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: preloadControlPlaneQueries(boardQueryOptions, metricsQueryOptions, sessionsQueryOptions),
  component: lazyRouteComponent(() => import('../pages/DashboardPage'), 'DashboardPage')
});

const missionControlRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'mission-control',
  loader: preloadControlPlaneQueries(
    sessionsQueryOptions,
    runsQueryOptions,
    chatsQueryOptions,
    browserSessionVaultQueryOptions,
    watchdogStatusQueryOptions
  ),
  component: lazyRouteComponent(() => import('../pages/MissionControlPage'), 'MissionControlPage')
});

const officeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'office',
  loader: preloadControlPlaneQueries(officeQueryOptions, agentProfilesQueryOptions, sessionsQueryOptions, runsQueryOptions),
  component: lazyRouteComponent(() => import('../pages/OfficePage'), 'OfficePage')
});

const backlogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'backlog',
  validateSearch: validateBacklogSearch,
  loaderDeps: ({ search }) => ({
    query: search.query.trim(),
    projectId: search.projectId,
    repoRoot: search.repoRoot,
    unscopedOnly: search.scope === 'unscoped'
  }),
  loader: async ({ context, deps }) => {
    const token = getActiveToken();
    if (!token) {
      return;
    }
    const scopeOptions = {
      search: deps.query || undefined,
      projectId: deps.projectId,
      repoRoot: deps.repoRoot,
      unscopedOnly: deps.unscopedOnly
    };
    await Promise.all([
      context.queryClient.ensureQueryData(backlogBoardQueryOptions(token, scopeOptions) as never),
      context.queryClient.ensureQueryData(backlogOrchestrationQueryOptions(token, scopeOptions) as never),
      context.queryClient.ensureQueryData(backlogContractsQueryOptions(token) as never),
      context.queryClient.ensureQueryData(
        backlogDecisionStreamQueryOptions(token, {
          limit: 80,
          projectId: deps.projectId,
          repoRoot: deps.repoRoot,
          unscopedOnly: deps.unscopedOnly
        }) as never
      )
    ]);
  },
  component: lazyRouteComponent(() => import('../pages/BacklogPage'), 'BacklogPage')
});

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'agents',
  loader: preloadControlPlaneQueries(agentProfilesQueryOptions, skillsQueryOptions, toolsQueryOptions),
  component: lazyRouteComponent(() => import('../pages/AgentsPage'), 'AgentsPage')
});

const skillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'skills',
  loader: preloadControlPlaneQueries(skillsQueryOptions, skillsCatalogQueryOptions),
  component: lazyRouteComponent(() => import('../pages/SkillsPage'), 'SkillsPage')
});

const toolsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'tools',
  loader: preloadControlPlaneQueries(toolsQueryOptions, agentProfilesQueryOptions),
  component: lazyRouteComponent(() => import('../pages/ToolsPage'), 'ToolsPage')
});

const browserRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'browser',
  validateSearch: validateBrowserSearch,
  loader: async ({ context }) => {
    const token = getActiveToken();
    if (!token) {
      return;
    }
    await Promise.all([
      context.queryClient.ensureQueryData(browserStatusQueryOptions(token) as never),
      context.queryClient.ensureQueryData(browserDoctorQueryOptions(token) as never),
      context.queryClient.ensureQueryData(browserSessionVaultQueryOptions(token) as never),
      context.queryClient.ensureQueryData(browserHistoryQueryOptions(token, { limit: 18 }) as never),
      context.queryClient.ensureQueryData(agentProfilesQueryOptions(token) as never),
      context.queryClient.ensureQueryData(sessionsQueryOptions(token) as never)
    ]);
  },
  component: lazyRouteComponent(() => import('../pages/BrowserPage'), 'BrowserPage')
});

const schedulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'schedules',
  validateSearch: validateSchedulesSearch,
  loaderDeps: ({ search }) => ({
    kind: search.kind === 'all' ? undefined : search.kind,
    scheduleId: search.scheduleId
  }),
  loader: async ({ context, deps }) => {
    const token = getActiveToken();
    if (!token) {
      return;
    }
    await Promise.all([
      context.queryClient.ensureQueryData(schedulesQueryOptions(token, { kind: deps.kind }) as never),
      context.queryClient.ensureQueryData(scheduleAgentProfilesQueryOptions(token) as never),
      context.queryClient.ensureQueryData(sessionsQueryOptions(token) as never),
      context.queryClient.ensureQueryData(browserSessionVaultQueryOptions(token) as never),
      deps.scheduleId ? context.queryClient.ensureQueryData(scheduleDetailQueryOptions(token, deps.scheduleId) as never) : Promise.resolve()
    ]);
  },
  component: lazyRouteComponent(() => import('../pages/SchedulesPage'), 'SchedulesPage')
});

const llmRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'llm',
  loader: async ({ context }) => {
    const token = getActiveToken();
    if (!token) {
      return;
    }
    const day = localDayString();
    await Promise.all([
      context.queryClient.ensureQueryData(llmLimitsQueryOptions(token) as never),
      context.queryClient.ensureQueryData(
        llmCostsQueryOptions(token, {
          day,
          month: day.slice(0, 7),
          tzOffsetMinutes: new Date().getTimezoneOffset()
        }) as never
      ),
      context.queryClient.ensureQueryData(sessionsQueryOptions(token) as never),
      context.queryClient.ensureQueryData(runsQueryOptions(token) as never),
      context.queryClient.ensureQueryData(agentProfilesQueryOptions(token) as never)
    ]);
  },
  component: lazyRouteComponent(() => import('../pages/CostControlPage'), 'CostControlPage')
});

const vaultRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'vault',
  component: lazyRouteComponent(() => import('../pages/VaultPage'), 'VaultPage')
});

const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'config',
  loader: preloadControlPlaneQueries(runtimeConfigQueryOptions, pairingsQueryOptions),
  component: lazyRouteComponent(() => import('../pages/ConfigPage'), 'ConfigPage')
});

const housekeepingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'housekeeping',
  validateSearch: validateHousekeepingSearch,
  loaderDeps: ({ search }) => ({
    runtime: search.runtime
  }),
  loader: async ({ context, deps }) => {
    const token = getActiveToken();
    if (!token) {
      return;
    }
    await Promise.all([
      context.queryClient.ensureQueryData(agentProfilesQueryOptions(token) as never),
      context.queryClient.ensureQueryData(housekeepingQueryOptions(token) as never),
      context.queryClient.ensureQueryData(readinessQueryOptions(token) as never),
      context.queryClient.ensureQueryData(cronStatusQueryOptions(token) as never),
      context.queryClient.ensureQueryData(localSessionsQueryOptions(token, { limit: 300, runtime: deps.runtime }) as never),
      context.queryClient.ensureQueryData(localStatsQueryOptions(token, 'all') as never),
      context.queryClient.ensureQueryData(improvementLearningsQueryOptions(token, { limit: 200 }) as never),
      context.queryClient.ensureQueryData(improvementProposalsQueryOptions(token, { limit: 200 }) as never)
    ]);
  },
  component: lazyRouteComponent(() => import('../pages/HousekeepingPage'), 'HousekeepingPage')
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'onboarding',
  loader: preloadControlPlaneQueries(onboardingStatusQueryOptions, vaultStatusQueryOptions, toolsDiagnosticsQueryOptions),
  component: lazyRouteComponent(() => import('../pages/OnboardingPage'), 'OnboardingPage')
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings',
  loader: preloadControlPlaneQueries(tokenStatusQueryOptions),
  component: lazyRouteComponent(() => import('../pages/SettingsPage'), 'SettingsPage')
});

const sessionsRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'sessions',
  beforeLoad: () => {
    return redirect({ to: '/mission-control', replace: true });
  },
  component: () => null
});

const chatsRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'chats',
  beforeLoad: () => {
    return redirect({ to: '/mission-control', replace: true });
  },
  component: () => null
});

const costsRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'costs',
  beforeLoad: () => {
    return redirect({ to: '/llm', replace: true });
  },
  component: () => null
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  missionControlRoute,
  officeRoute,
  backlogRoute,
  agentsRoute,
  skillsRoute,
  toolsRoute,
  browserRoute,
  schedulesRoute,
  llmRoute,
  vaultRoute,
  configRoute,
  housekeepingRoute,
  onboardingRoute,
  settingsRoute,
  sessionsRedirectRoute,
  chatsRedirectRoute,
  costsRedirectRoute
]);

export function createDashboardRouter() {
  return createRouter({
    routeTree,
    context: {
      queryClient: dashboardQueryClient
    },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: RouteFallback,
    defaultPendingMs: 150,
    defaultPendingMinMs: 150,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: DefaultNotFound,
    scrollRestoration: true
  });
}

export type DashboardRouter = ReturnType<typeof createDashboardRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: DashboardRouter;
  }
}
