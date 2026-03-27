import '@testing-library/jest-dom/vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider
} from '@tanstack/react-router';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import React from 'react';
import { afterEach, beforeEach, vi } from 'vitest';

import { createDashboardQueryClient } from '../app/queryClient';

const { apiMocks, storeState, toastMocks, useAppStoreMock, routeHeaderContextMock } = vi.hoisted(() => ({
  apiMocks: {
    autodiscoverSkills: vi.fn(),
    applyOnboardingCeoBaseline: vi.fn(),
    bootstrapOnboardingVault: vi.fn(),
    bootstrapVendorAssets: vi.fn(),
    checkOnboardingProviderKeys: vi.fn(),
    cleanupBacklog: vi.fn(),
    connectBrowserAccount: vi.fn(),
    createSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    deleteBacklogItem: vi.fn(),
    deleteBrowserSessionProfile: vi.fn(),
    disableBrowserSessionProfile: vi.fn(),
    downloadBrowserArtifact: vi.fn(),
    enableBrowserSessionProfile: vi.fn(),
    fetchAgentProfiles: vi.fn(),
    fetchBacklogBoard: vi.fn(),
    fetchBacklogContracts: vi.fn(),
    fetchBacklogDecisionStream: vi.fn(),
    fetchBacklogOrchestration: vi.fn(),
    fetchBrowserArtifact: vi.fn(),
    fetchBrowserDoctor: vi.fn(),
    fetchBrowserHistory: vi.fn(),
    fetchBrowserRun: vi.fn(),
    fetchBrowserSessionVault: vi.fn(),
    fetchBrowserStatus: vi.fn(),
    fetchBoard: vi.fn(),
    fetchChats: vi.fn(),
    fetchCronStatus: vi.fn(),
    fetchHousekeeping: vi.fn(),
    fetchImprovementLearnings: vi.fn(),
    fetchImprovementProposals: vi.fn(),
    fetchLlmCosts: vi.fn(),
    fetchLlmLimits: vi.fn(),
    fetchLocalSessions: vi.fn(),
    fetchLocalStats: vi.fn(),
    fetchOnboardingStatus: vi.fn(),
    fetchOffice: vi.fn(),
    fetchPairings: vi.fn(),
    fetchReadiness: vi.fn(),
    fetchRunTerminal: vi.fn(),
    fetchRunWatchdog: vi.fn(),
    fetchRuns: vi.fn(),
    fetchRuntimeConfig: vi.fn(),
    fetchScheduleDetail: vi.fn(),
    fetchSchedules: vi.fn(),
    fetchSessions: vi.fn(),
    fetchTokenStatus: vi.fn(),
    fetchMetrics: vi.fn(),
    fetchSkills: vi.fn(),
    fetchSkillsCatalog: vi.fn(),
    fetchTools: vi.fn(),
    fetchToolsDiagnostics: vi.fn(),
    fetchVaultStatus: vi.fn(),
    fetchWatchdogStatus: vi.fn(),
    importBrowserCookieJar: vi.fn(),
    installExternalSkill: vi.fn(),
    invokeSkill: vi.fn(),
    lockVault: vi.fn(),
    overrideBacklogItem: vi.fn(),
    pauseSchedule: vi.fn(),
    requestElevatedCheck: vi.fn(),
    resetAgentProfileBaseline: vi.fn(),
    resetEmptyVault: vi.fn(),
    removeExternalSkill: vi.fn(),
    removeSkillCatalogEntry: vi.fn(),
    resumeSchedule: vi.fn(),
    revokeBrowserCookieJar: vi.fn(),
    revokeBrowserHeaderProfile: vi.fn(),
    revokeBrowserProxyProfile: vi.fn(),
    revokeBrowserSessionProfile: vi.fn(),
    revokeBrowserStorageState: vi.fn(),
    runArtifactCleanupPreview: vi.fn(),
    runBrowserTest: vi.fn(),
    runDeadLetterPreview: vi.fn(),
    runHousekeepingNow: vi.fn(),
    runImprovementCycle: vi.fn(),
    runLocalSessionsScan: vi.fn(),
    runOnboardingSmoke: vi.fn(),
    runScheduleNow: vi.fn(),
    resyncExternalSkills: vi.fn(),
    saveLlmLimits: vi.fn(),
    saveBrowserConfig: vi.fn(),
    saveRuntimeConfig: vi.fn(),
    setAgentSelfImprovement: vi.fn(),
    setAgentSelfImprovementEnabled: vi.fn(),
    setSessionBrowserAuthProfile: vi.fn(),
    startBrowserLoginCapture: vi.fn(),
    testOnboardingProviderConnections: vi.fn(),
    tickBacklogOrchestration: vi.fn(),
    transitionBacklogItem: vi.fn(),
    unlockOnboardingVault: vi.fn(),
    updateBrowserSessionProfile: vi.fn(),
    updateHousekeepingRetention: vi.fn(),
    updateSchedule: vi.fn(),
    upsertSkillCatalogEntry: vi.fn(),
    upsertBrowserHeaderProfile: vi.fn(),
    upsertBrowserProxyProfile: vi.fn(),
    upsertBrowserSessionProfile: vi.fn(),
    upsertBrowserStorageState: vi.fn(),
    upsertVaultSecret: vi.fn(),
    verifyBrowserSessionProfile: vi.fn()
  },
  routeHeaderContextMock: {
    useRouteHeaderMetrics: vi.fn()
  },
  storeState: {} as Record<string, unknown>,
  useAppStoreMock: Object.assign(
    <T,>(selector: (state: Record<string, unknown>) => T): T => selector(storeState),
    {
      getState: (): Record<string, unknown> => storeState
    }
  ),
  toastMocks: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn()
  }
}));

vi.mock('../app/api', () => apiMocks);

vi.mock('../app/store', () => ({
  useAppStore: useAppStoreMock
}));

vi.mock('../components/shell/RouteHeaderContext', async () => {
  const actual = await vi.importActual('../components/shell/RouteHeaderContext');
  return {
    ...actual,
    useRouteHeaderMetrics: routeHeaderContextMock.useRouteHeaderMetrics
  };
});

vi.mock('../components/office/RetroOfficeSim', () => ({
  RetroOfficeSim: () => <div>Retro Office Sim</div>
}));

vi.mock('sonner', () => ({
  toast: toastMocks
}));

function makeAgentProfile() {
  return {
    id: 'agent-1',
    name: 'Elyze CEO',
    title: 'Chief Executive Agent',
    parentAgentId: null,
    protectedDefault: true,
    systemPrompt: 'Lead operations.',
    defaultRuntime: 'gemini',
    defaultModel: 'gemini-2.5-pro',
    allowedRuntimes: ['gemini'],
    skills: [],
    tools: ['browser:scrapling'],
    metadata: {},
    executionMode: 'on_demand',
    harnessRuntime: null,
    persistentHarnessRuntime: null,
    harnessAutoStart: false,
    harnessSessionName: null,
    harnessSessionReady: false,
    harnessCommand: null,
    enabled: true,
    createdAt: '2026-03-15T12:00:00.000Z',
    updatedAt: '2026-03-15T12:00:00.000Z'
  };
}

function makeSession() {
  return {
    id: 'session-1',
    sessionKey: 'telegram:6098581867',
    channel: 'telegram',
    chatType: 'private',
    agentId: 'agent-1',
    agentProfile: makeAgentProfile(),
    preferredRuntime: 'gemini',
    preferredModel: 'gemini-2.5-pro',
    state: 'active',
    lastActivityAt: '2026-03-15T12:00:00.000Z',
    browserSessionProfile: null
  };
}

function makeRun() {
  return {
    id: 'run-1',
    sessionId: 'session-1',
    status: 'running',
    runtime: 'gemini',
    prompt: 'Inspect the control plane.',
    resultSummary: null,
    error: null,
    startedAt: '2026-03-15T12:00:00.000Z',
    endedAt: null,
    createdAt: '2026-03-15T12:00:00.000Z',
    updatedAt: '2026-03-15T12:00:00.000Z'
  };
}

function makeSkill() {
  return {
    id: 'skill-1',
    name: 'browser-use',
    version: '1.0.0',
    description: 'Controlled browser operations.',
    tags: ['browser'],
    allowedCommands: [],
    requiredTools: ['browser:scrapling'],
    scopes: {
      filesystem: 'none',
      process: 'limited',
      network: 'allow',
      secrets: 'none'
    },
    enabled: true,
    requiresApproval: false,
    supportsDryRun: true
  };
}

function makeTool() {
  return {
    name: 'browser:scrapling',
    source: 'system' as const,
    installed: true,
    enabled: true,
    updatedAt: '2026-03-15T12:00:00.000Z'
  };
}

function makeLlmLimits() {
  return {
    providerCallBudgetDaily: { google: 100, openrouter: 100 },
    providerCallsPerMinute: { google: 10, openrouter: 10 },
    providerCostBudgetUsdDaily: { google: 25, openrouter: 25 },
    providerCostBudgetUsdMonthly: { google: 250, openrouter: 250 },
    modelCallBudgetDaily: {
      'google/gemini-2.5-pro': 100,
      'openrouter/openai/gpt-5-mini': 100
    },
    primaryModelByRuntime: {
      codex: 'openrouter/openai/gpt-5-mini',
      claude: 'google/gemini-2.5-pro',
      gemini: 'google/gemini-2.5-pro',
      process: 'google/gemini-2.5-pro'
    },
    fallbackByRuntime: {
      codex: [{ runtime: 'codex', model: 'google/gemini-2.5-pro' }],
      claude: [{ runtime: 'claude', model: 'openrouter/openai/gpt-5-mini' }],
      gemini: [{ runtime: 'gemini', model: 'openrouter/openai/gpt-5-mini' }],
      process: [{ runtime: 'process', model: 'openrouter/openai/gpt-5-mini' }]
    },
    strictPrimaryByRuntime: { codex: false, claude: false, gemini: false, process: false },
    localHarnessByRuntime: { codex: false, claude: false, gemini: false, process: false },
    orchestratorPrimaryModelByRuntime: {
      codex: 'openrouter/openai/gpt-5-mini',
      claude: 'google/gemini-2.5-pro',
      gemini: 'google/gemini-2.5-pro',
      process: 'google/gemini-2.5-pro'
    },
    orchestratorFallbackByRuntime: {
      codex: [{ runtime: 'codex', model: 'google/gemini-2.5-pro' }],
      claude: [{ runtime: 'claude', model: 'openrouter/openai/gpt-5-mini' }],
      gemini: [{ runtime: 'gemini', model: 'openrouter/openai/gpt-5-mini' }],
      process: [{ runtime: 'process', model: 'openrouter/openai/gpt-5-mini' }]
    },
    orchestratorStrictPrimaryByRuntime: { codex: false, claude: false, gemini: false, process: false },
    orchestratorLocalHarnessByRuntime: { codex: false, claude: false, gemini: false, process: false }
  };
}

function makeRuntimeConfig() {
  return {
    config: {
      server: {
        host: '0.0.0.0',
        port: 8788
      },
      security: {
        apiToken: '__REDACTED__'
      }
    },
    sensitive: {
      'security.apiToken': {
        configured: true,
        source: 'vault' as const,
        redacted: true
      }
    },
    configMeta: {
      runtimeConfigPath: '/tmp/config.yaml',
      writable: true,
      restartRequired: false
    },
    saved: true,
    restartRequired: false
  };
}

function resetStoreState(): void {
  Object.assign(storeState, {
    token: 'token-123',
    agentProfiles: [makeAgentProfile()],
    editingAgentId: null,
    setEditingAgentId: vi.fn(),
    sessions: [makeSession()],
    runs: [makeRun()],
    chats: [
      {
        session: makeSession(),
        messages: [
          {
            id: 'msg-1',
            sessionId: 'session-1',
            channel: 'telegram',
            direction: 'inbound',
            source: 'human',
            sender: 'operator',
            content: 'Check the feed.',
            createdAt: '2026-03-15T12:00:00.000Z',
            metadataJson: '{}'
          }
        ]
      }
    ],
    events: [],
    notifications: [],
    shiftNote: '',
    search: '',
    connection: 'connected',
    skills: [makeSkill()],
    tools: [makeTool()],
    setShiftNote: vi.fn(),
    officeLayout: { id: 'main', name: 'Main Ops Floor', nodes: [], edges: [] },
    officePresence: [],
    officeMode: 'map',
    setOfficeMode: vi.fn(),
    setSearch: vi.fn(),
    triggerReconnect: vi.fn(),
    refreshAll: vi.fn(async () => undefined),
    refreshBoard: vi.fn(async () => undefined),
    refreshChats: vi.fn(async () => undefined),
    refreshAgents: vi.fn(async () => undefined),
    createAgentProfile: vi.fn(async () => undefined),
    updateAgentProfile: vi.fn(async () => undefined),
    deleteSessions: vi.fn(async () => ({ cleared: { sessions: 1 } })),
    setToken: vi.fn(),
    refreshTools: vi.fn(async () => undefined),
    refreshSkills: vi.fn(async () => undefined),
    toggleTool: vi.fn(async () => undefined)
  });
}

function configurePageApiMocks(): void {
  const emptyVault = {
    cookieJars: [],
    headerProfiles: [],
    proxyProfiles: [],
    storageStates: [],
    sessionProfiles: [],
    localProfiles: []
  };
  const browserConfig = {
    enabled: true,
    provider: 'scrapling',
    transport: 'stdio',
    defaultExtraction: 'markdown',
    executable: 'scrapling',
    healthcheckCommand: 'scrapling doctor',
    installCommand: 'pip install "scrapling[all]"',
    bootstrapCommand: 'scrapling install',
    httpBaseUrl: null,
    allowedAgents: [],
    policy: {
      allowedDomains: [],
      deniedDomains: [],
      allowProxy: true,
      allowStealth: true,
      allowVisibleBrowser: false,
      allowFileDownloads: true,
      distrustThirdPartyContent: true,
      promptInjectionEscalation: 'annotate',
      requireApprovalForStealth: false,
      requireApprovalForDownloads: false,
      requireApprovalForVisibleBrowser: false,
      requireApprovalForProxy: false
    }
  };

  apiMocks.fetchBrowserStatus.mockResolvedValue({
    status: {
      enabled: true,
      ready: true,
      toolName: 'browser:scrapling',
      provider: 'scrapling',
      transport: 'stdio',
      healthState: 'ready',
      executable: 'scrapling',
      httpBaseUrl: null,
      blockedReasons: [],
      installCommands: [],
      dockerSupport: [],
      allowedAgents: []
    },
    config: browserConfig
  });
  apiMocks.fetchBrowserDoctor.mockResolvedValue({
    validation: {
      ok: true,
      degraded: false,
      checkedAt: '2026-03-15T12:00:00.000Z',
      issues: [],
      errors: [],
      warnings: [],
      infos: [],
      binaryAvailability: []
    },
    contract: {
      schema: 'ops.browser-capability.v1',
      version: 1,
      provider: 'scrapling',
      operatorFacingName: 'Scrapling',
      supportedTransports: ['stdio'],
      defaultTransport: 'stdio',
      artifactSchema: {
        handleKind: 'browser_artifact',
        previewFields: ['url', 'tool', 'selector', 'extractionMode', 'fallbackReason', 'previewText'],
        durableFields: ['provider', 'transport', 'artifactPath', 'capturedAt']
      },
      providerBoundaries: {
        supportsVisualBrowser: true,
        supportsProxy: true,
        supportsStealth: true,
        supportsFileDownloads: true,
        reusableOperatorContract: true,
        futureProviders: []
      },
      installDoctor: {
        installCommands: [],
        dockerSupport: [],
        requiredBinaries: [],
        optionalBinaries: []
      },
      toolIntents: {}
    }
  });
  apiMocks.fetchBrowserSessionVault.mockResolvedValue(emptyVault);
  apiMocks.fetchBrowserHistory.mockResolvedValue({
    total: 0,
    limit: 18,
    offset: 0,
    rows: []
  });
  apiMocks.fetchBacklogBoard.mockResolvedValue({
    columns: {
      idea: [],
      triage: [],
      planned: [],
      in_progress: [],
      review: [],
      blocked: [],
      done: [],
      archived: []
    },
    availableScopes: []
  });
  apiMocks.fetchBacklogOrchestration.mockResolvedValue({
    control: {
      enabled: true,
      paused: false,
      maxParallel: 3,
      wipLimit: 5
    },
    queue: {
      planned: 0,
      inFlight: 0
    },
    dispatchPolicy: {
      projectCaps: {},
      projectPriorityBias: {}
    }
  });
  apiMocks.fetchBacklogContracts.mockResolvedValue({
    backlogUx: null,
    deliveryEvidence: null
  });
  apiMocks.fetchBacklogDecisionStream.mockResolvedValue([]);
  apiMocks.fetchBoard.mockResolvedValue({
    queued: [],
    running: [],
    waiting_input: [],
    failed: [],
    completed: []
  });
  apiMocks.fetchSchedules.mockResolvedValue([]);
  apiMocks.fetchScheduleDetail.mockResolvedValue(null);
  apiMocks.deleteSchedule.mockResolvedValue(true);
  apiMocks.fetchAgentProfiles.mockResolvedValue([makeAgentProfile()]);
  apiMocks.resetAgentProfileBaseline.mockResolvedValue(makeAgentProfile());
  apiMocks.fetchMetrics.mockResolvedValue([]);
  apiMocks.fetchOffice.mockResolvedValue({
    layout: { id: 'main', name: 'Main Ops Floor', nodes: [], edges: [] },
    presence: []
  });
  apiMocks.fetchRuns.mockResolvedValue([makeRun()]);
  apiMocks.fetchSessions.mockResolvedValue([makeSession()]);
  apiMocks.fetchSkills.mockResolvedValue([makeSkill()]);
  apiMocks.fetchSkillsCatalog.mockResolvedValue({
    catalogBackend: 'sqlite',
    catalogStrict: false,
    directories: [],
    skills: [],
    entries: [],
    operations: [],
    installer: {
      enabled: true,
      allowedSources: ['*/*'],
      blockedSources: [],
      requireApproval: true,
      timeoutMs: 180000,
      maxAttempts: 2,
      installRoot: '/home/node/.agents/skills',
      readiness: {
        ready: true,
        required: [],
        optional: []
      }
    }
  });
  apiMocks.fetchTools.mockResolvedValue([makeTool()]);
  apiMocks.fetchChats.mockResolvedValue([
    {
      session: makeSession(),
      messages: [
        {
          id: 'msg-1',
          sessionId: 'session-1',
          channel: 'telegram',
          direction: 'inbound',
          source: 'human',
          sender: 'operator',
          content: 'Check the feed.',
          createdAt: '2026-03-15T12:00:00.000Z',
          metadataJson: '{}'
        }
      ]
    }
  ]);
  apiMocks.fetchHousekeeping.mockResolvedValue({
    enabled: true,
    intervalSec: 300,
    inFlight: false,
    lastRunAt: null,
    lastError: null,
    lastResult: null,
    retention: {
      runHours: 24,
      terminalHours: 24,
      sessionsHours: {
        delegate: 24,
        dashboard: 24,
        agent: 24,
        internal: 24,
        telegram: 24,
        office: 24,
        unknown: 24
      },
      waitingInputStaleMinutes: 60,
      messageHours: 24,
      realtimeHours: 24,
      officePresenceHours: 24,
      llmUsageDays: 7,
      memoryDays: 30,
      memoryMarkdownDays: 30,
      auditDays: 30,
      protectedSessionKeys: []
    },
    cleanup: {
      deadLetterCount: 0,
      artifactPrefixes: [],
      allowlistedRoots: []
    }
  });
  apiMocks.fetchReadiness.mockResolvedValue({
    score: 100,
    tier: 'ready',
    checks: [],
    queue: {}
  });
  apiMocks.fetchCronStatus.mockResolvedValue({
    jobs: [],
    reaper: {
      retentionMs: 86_400_000,
      intervalMs: 300_000,
      inFlight: false,
      lastRunAt: null,
      reapedToday: 0,
      reapedTotal: 0,
      lastSummary: null
    },
    heartbeatSuppression: {
      suppressedToday: 0,
      lastPreview: null
    },
    history: []
  });
  apiMocks.fetchLocalSessions.mockResolvedValue({
    runtime: 'all',
    sessions: [],
    scanner: {
      runtimes: {
        codex: {
          root: '/tmp/codex',
          intervalMs: 60_000,
          activeThresholdMs: 300_000,
          inFlight: false,
          lastScanAt: null,
          lastScanError: null,
          lastScanSummary: null
        },
        claude: {
          root: '/tmp/claude',
          intervalMs: 60_000,
          activeThresholdMs: 300_000,
          inFlight: false,
          lastScanAt: null,
          lastScanError: null,
          lastScanSummary: null
        },
        gemini: {
          root: '/tmp/gemini',
          intervalMs: 60_000,
          activeThresholdMs: 300_000,
          inFlight: false,
          lastScanAt: null,
          lastScanError: null,
          lastScanSummary: null
        }
      }
    }
  });
  apiMocks.fetchLocalStats.mockResolvedValue({
    runtime: 'all',
    costToday: 0,
    costThisWeek: 0,
    costThisMonth: 0,
    tokensByModel: {},
    topProjects: [],
    byRuntime: {
      codex: {
        costToday: 0,
        costThisWeek: 0,
        costThisMonth: 0,
        tokensByModel: {},
        activeSessions: 0,
        totalSessions: 0,
        totalTokens: 0
      },
      claude: {
        costToday: 0,
        costThisWeek: 0,
        costThisMonth: 0,
        tokensByModel: {},
        activeSessions: 0,
        totalSessions: 0,
        totalTokens: 0
      },
      gemini: {
        costToday: 0,
        costThisWeek: 0,
        costThisMonth: 0,
        tokensByModel: {},
        activeSessions: 0,
        totalSessions: 0,
        totalTokens: 0
      }
    },
    activeSessions: 0,
    totalSessions: 0
  });
  apiMocks.fetchImprovementLearnings.mockResolvedValue([]);
  apiMocks.fetchImprovementProposals.mockResolvedValue([]);
  apiMocks.fetchLlmLimits.mockResolvedValue({
    limits: makeLlmLimits(),
    registry: {
      generatedAt: '2026-03-15T12:00:00.000Z',
      startupMode: 'warn',
      runtimeCatalogs: {
        codex: ['openrouter/openai/gpt-5-mini'],
        claude: ['google/gemini-2.5-pro'],
        gemini: ['google/gemini-2.5-pro'],
        process: ['google/gemini-2.5-pro']
      },
      runtimes: {
        codex: { nativeModels: [], catalogModels: ['openrouter/openai/gpt-5-mini'] },
        claude: { nativeModels: [], catalogModels: ['google/gemini-2.5-pro'] },
        gemini: { nativeModels: [], catalogModels: ['google/gemini-2.5-pro'] },
        process: { nativeModels: [], catalogModels: ['google/gemini-2.5-pro'] }
      },
      providers: {
        google: ['google/gemini-2.5-pro'],
        openrouter: ['openrouter/openai/gpt-5-mini']
      },
      entries: [
        {
          model: 'google/gemini-2.5-pro',
          provider: 'google',
          allowedRuntimes: ['claude', 'gemini', 'process'],
          sources: ['catalog']
        },
        {
          model: 'openrouter/openai/gpt-5-mini',
          provider: 'openrouter',
          allowedRuntimes: ['codex'],
          sources: ['catalog']
        }
      ]
    },
    validation: {
      valid: true,
      checkedAt: '2026-03-15T12:00:00.000Z',
      startupMode: 'warn',
      diagnostics: []
    },
    onboarding: {
      providerKeys: {
        openrouter: true,
        google: true
      },
      hasAtLeastOneKey: true,
      requirements: {
        minimum: 'One provider key',
        recommended: ['Google', 'OpenRouter']
      }
    }
  });
  apiMocks.fetchLlmCosts.mockResolvedValue({
    window: {
      dayUtc: '2026-03-15',
      monthUtc: '2026-03'
    },
    costs: {
      providerDaily: [
        { provider: 'google', calls: 12, blocked: 0, costUsd: 4.2 },
        { provider: 'openrouter', calls: 8, blocked: 1, costUsd: 2.8 }
      ],
      providerMonthly: [
        { provider: 'google', calls: 120, blocked: 1, costUsd: 42 },
        { provider: 'openrouter', calls: 80, blocked: 2, costUsd: 28 }
      ],
      modelDaily: [],
      recentEvents: []
    },
    providerBudgetStatus: [
      {
        provider: 'google',
        dayCalls: 12,
        dayCostUsd: 4.2,
        monthCostUsd: 42,
        budgets: {
          dailyCalls: 100,
          dailyCostUsd: 25,
          monthlyCostUsd: 250
        },
        exhausted: {
          dailyCalls: false,
          dailyCostUsd: false,
          monthlyCostUsd: false
        }
      }
    ]
  });
  apiMocks.fetchOnboardingStatus.mockResolvedValue({
    status: 'in_progress',
    steps: [
      {
        id: 'ceo_baseline',
        title: 'Organization Identity',
        status: 'pending',
        detail: 'Seed the operator identity.',
        updatedAt: null
      },
      {
        id: 'vault',
        title: 'Security Vault',
        status: 'pending',
        detail: 'Initialize secure storage.',
        updatedAt: null
      },
      {
        id: 'provider_keys',
        title: 'Model Connectivity',
        status: 'pending',
        detail: 'Add your provider keys.',
        updatedAt: null
      },
      {
        id: 'smoke_run',
        title: 'System Ignition',
        status: 'pending',
        detail: 'Run the smoke test.',
        updatedAt: null
      }
    ],
    blockers: [],
    evidence: {
      version: 1,
      ceoBaselineConfiguredAt: null,
      vaultLastValidatedAt: null,
      providerKeysCheckedAt: null,
      smokeRun: null
    },
    companyName: 'Elyze Labs',
    ceoAgentId: 'agent-1',
    providerKeys: {
      openrouter: false,
      google: false,
      telegram: false,
      voyage: false,
      github: false,
      hasAtLeastOneKey: false,
      hasRequiredSet: false
    }
  });
  apiMocks.fetchVaultStatus.mockResolvedValue({
    enabled: true,
    initialized: true,
    locked: false
  });
  apiMocks.fetchToolsDiagnostics.mockResolvedValue({
    vendorBootstrap: null
  });
  apiMocks.fetchRunWatchdog.mockResolvedValue({
    current: null,
    history: []
  });
  apiMocks.fetchRuntimeConfig.mockResolvedValue(makeRuntimeConfig());
  apiMocks.saveRuntimeConfig.mockResolvedValue(makeRuntimeConfig());
  apiMocks.fetchPairings.mockResolvedValue([]);
  apiMocks.fetchTokenStatus.mockResolvedValue({
    configured: true,
    length: 9,
    fingerprint: 'tok_1234'
  });
  apiMocks.fetchWatchdogStatus.mockResolvedValue([]);
  apiMocks.autodiscoverSkills.mockResolvedValue({
    added: [],
    skipped: [],
    errors: []
  });
  apiMocks.installExternalSkill.mockResolvedValue({
    operationId: 'skill-op-1',
    status: 'ok',
    installation: {
      source: {
        canonical: 'vercel-labs/agent-skills'
      },
      installSource: 'vercel-labs/agent-skills',
      selectedSkills: ['vercel-react-best-practices'],
      installedSkills: [
        {
          name: 'vercel-react-best-practices'
        }
      ]
    }
  });
  apiMocks.invokeSkill.mockResolvedValue({
    output: 'ok',
    structured: null
  });
  apiMocks.removeExternalSkill.mockResolvedValue({
    operationId: 'skill-op-2',
    status: 'ok'
  });
  apiMocks.removeSkillCatalogEntry.mockResolvedValue({
    operationId: 'catalog-op-1',
    status: 'ok'
  });
  apiMocks.requestElevatedCheck.mockRejectedValue(new Error('Approval required'));
  apiMocks.resyncExternalSkills.mockResolvedValue({
    operationId: 'skill-op-3',
    status: 'ok'
  });
  apiMocks.fetchRunTerminal.mockResolvedValue({
    chunks: [],
    nextOffset: 0,
    run: makeRun(),
    terminal: {
      status: 'completed',
      mode: 'api'
    }
  });
  apiMocks.upsertSkillCatalogEntry.mockResolvedValue({
    operationId: 'catalog-op-2',
    status: 'ok'
  });
  apiMocks.saveLlmLimits.mockResolvedValue({
    saved: true
  });
}

export function installPageHarness(): void {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: vi.fn()
    });
    Object.defineProperty(window.HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn()
    });
    resetStoreState();
    for (const mock of Object.values(apiMocks)) {
      mock.mockReset();
    }
    for (const mock of Object.values(toastMocks)) {
      mock.mockReset();
    }
    routeHeaderContextMock.useRouteHeaderMetrics.mockReset();
    configurePageApiMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
}

export function renderDashboardPage(page: ReactElement, options?: { path?: string }) {
  const queryClient = createDashboardQueryClient();
  const targetPath = options?.path ?? '/';
  const routePath = targetPath.split('?')[0] ?? '/';
  const rootRoute = createRootRoute({
    component: () => <Outlet />
  });
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: routePath === '/' ? '/' : routePath.replace(/^\//, ''),
    component: () => page
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: [targetPath] })
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );

  return {
    ...rendered,
    queryClient
  };
}

export { apiMocks };
